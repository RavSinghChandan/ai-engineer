"""
Tests for AgentBusinessMetrics (business_metrics/): the recommendation lifecycle,
the five metrics, and the API from a real /map-role request to the dashboard numbers.
Run: pytest tests/test_business_metrics.py -v
"""
from __future__ import annotations

import sqlite3
import time
from unittest.mock import AsyncMock, patch

import pytest

from business_metrics import metrics, store
from fde import config, ledger
from tests.conftest import SAMPLE_PROFILE, make_auth_headers


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "bench.db"
    monkeypatch.setattr(config, "get_conn", lambda: sqlite3.connect(str(path)))
    monkeypatch.setattr(config, "REAL_TYPE", "REAL")
    monkeypatch.setattr(ledger, "_ready", False)
    monkeypatch.delenv("BENCH_MANUAL_ALLOCATION_MINUTES", raising=False)
    monkeypatch.delenv("BENCH_INFRA_COST_PER_MONTH_USD", raising=False)
    yield path


def _ai(minutes_ago: float = 60, reasons=(), task_id: str = "") -> str:
    return store.create_ai(task_id=task_id, candidate_id="cand", target_role="Python Engineer",
                           match_pct=80, reasons=list(reasons),
                           requested_at=time.time() - minutes_ago * 60)


def _metric(summary, key):
    return next(m for m in summary["metrics"] if m["key"] == key)


# ── Lifecycle ────────────────────────────────────────────────────────────────

def test_decision_allocates_unless_rejected():
    accepted, rejected = _ai(), _ai()
    assert store.decide(accepted, "accepted", by="mgr")["allocated_at"] is not None
    assert store.decide(rejected, "rejected", by="mgr")["allocated_at"] is None


def test_a_recommendation_is_decided_once():
    rec = _ai()
    store.decide(rec, "accepted", by="mgr")
    with pytest.raises(store.InvalidTransition):
        store.decide(rec, "rejected", by="mgr")


def test_outcome_needs_an_allocation():
    rec = _ai()
    with pytest.raises(store.InvalidTransition):
        store.record_outcome(rec, "success")
    store.decide(rec, "rejected", by="mgr")
    with pytest.raises(store.InvalidTransition):
        store.record_outcome(rec, "success")


def test_invalid_values_and_unknown_ids():
    rec = _ai()
    with pytest.raises(store.InvalidTransition):
        store.decide(rec, "maybe", by="mgr")
    with pytest.raises(store.NotFound):
        store.decide("missing", "accepted", by="mgr")
    manual = store.create_manual(candidate_id="c", target_role="r", started_at=0, allocated_at=60, by="m")
    with pytest.raises(store.InvalidTransition):
        store.decide(manual, "accepted", by="mgr")
    with pytest.raises(store.InvalidTransition):
        store.create_manual(candidate_id="c", target_role="r", started_at=60, allocated_at=0, by="m")


@pytest.mark.parametrize("result, expected", [
    ({"evidence": {"checked": 2, "unsupported": []}}, []),
    ({"evidence": {"checked": 0, "unsupported": [], "note": "No role document was retrieved"}},
     ["no role document retrieved"]),
    ({"evidence": {"checked": 3, "unsupported": [{}, {}]}},
     ["2 claim(s) not supported by the role documents"]),
    ({"evidence": {"blocked": ["tool_call"], "quarantined": [{"id": "S1"}]}},
     ["output blocked by the guardrail", "a retrieved role document was quarantined"]),
    ({"_faithfulness_warning": "low overlap"}, ["answer not faithful to the retrieved context"]),
])
def test_help_reasons(result, expected):
    assert store.help_reasons(result) == expected


# ── The five metrics ─────────────────────────────────────────────────────────

def test_empty_window_has_no_values():
    s = metrics.summary(30)
    assert s["recommendations"] == 0
    values = {m["key"]: m["value"] for m in s["metrics"]}
    assert values == {"acceptance_rate": None, "time_to_allocate": None, "intervention_rate": None,
                      "cost_per_recommendation_usd": None, "allocation_success_rate": None}


def test_acceptance_rate_counts_only_as_is_acceptance():
    for decision in ("accepted", "accepted", "modified", "rejected"):
        store.decide(_ai(), decision, by="mgr")
    _ai()   # still pending
    m = _metric(metrics.summary(30), "acceptance_rate")
    assert m["value"] == 50.0
    assert m["detail"]["decided"] == 4 and m["detail"]["pending"] == 1
    assert m["detail"]["accepted_with_changes_pct"] == 25.0


def test_time_to_allocate_uses_the_assumed_baseline_until_manual_is_measured():
    store.decide(_ai(minutes_ago=10), "accepted", by="mgr")
    store.decide(_ai(minutes_ago=30), "modified", by="mgr")
    store.decide(_ai(minutes_ago=999), "rejected", by="mgr")   # never allocated → not timed

    m = _metric(metrics.summary(30), "time_to_allocate")
    assert m["value"] == pytest.approx(20.0, abs=0.2)
    assert m["assumption"] is True
    assert m["detail"]["manual_minutes"] == 90.0
    assert m["detail"]["time_saved_pct"] == pytest.approx(77.8, abs=0.3)

    now = time.time()
    store.create_manual(candidate_id="c", target_role="r", started_at=now - 120 * 60, allocated_at=now, by="m")
    store.create_manual(candidate_id="c", target_role="r", started_at=now - 200 * 60, allocated_at=now, by="m")
    m = _metric(metrics.summary(30), "time_to_allocate")
    assert m["assumption"] is False and m["detail"]["manual_source"] == "measured"
    assert m["detail"]["manual_minutes"] == pytest.approx(160.0, abs=0.2)
    assert m["detail"]["manual_allocations"] == 2


def test_intervention_rate_counts_agent_flags_and_manager_changes_once():
    store.decide(_ai(reasons=["no role document retrieved"]), "modified", by="mgr")  # both → once
    store.decide(_ai(), "rejected", by="mgr")
    store.decide(_ai(), "accepted", by="mgr")
    _ai(reasons=["no role document retrieved"])
    m = _metric(metrics.summary(30), "intervention_rate")
    assert m["value"] == 75.0
    assert m["detail"] == {**m["detail"], "interventions": 3, "recommendations": 4,
                           "flagged_by_agent": 2, "changed_by_manager": 1, "rejected_by_manager": 1}
    assert m["detail"]["reasons"] == {"no role document retrieved": 2}


def test_cost_per_recommendation_adds_ledger_model_cost_and_infra_share(monkeypatch):
    monkeypatch.setenv("BENCH_INFRA_COST_PER_MONTH_USD", "30")
    now = time.time()
    for task_id, cost in (("t1", 0.002), ("t2", 0.004)):
        ledger.record_task(task_id, workflow="role_mapping", started_at=now, ended_at=now, cost_usd=cost)
        _ai(task_id=task_id)

    m = _metric(metrics.summary(10), "cost_per_recommendation_usd")
    assert m["detail"]["model_cost_usd"] == pytest.approx(0.006)
    assert m["detail"]["model_per_recommendation_usd"] == pytest.approx(0.003)
    assert m["detail"]["infra_cost_usd"] == 10.0          # $30/month × 10/30 days
    assert m["value"] == pytest.approx((0.006 + 10) / 2)
    assert m["assumption"] is True


def test_allocation_success_rate_ignores_allocations_without_an_outcome():
    for outcome in ("success", "success", "failed", None):
        rec = _ai()
        store.decide(rec, "accepted", by="mgr")
        if outcome:
            store.record_outcome(rec, outcome)
    now = time.time()
    manual = store.create_manual(candidate_id="c", target_role="r", started_at=now - 60, allocated_at=now, by="m")
    store.record_outcome(manual, "failed")

    m = _metric(metrics.summary(30), "allocation_success_rate")
    assert m["value"] == pytest.approx(66.7)
    assert m["detail"]["outcomes_recorded"] == 3 and m["detail"]["awaiting_outcome"] == 1
    assert m["detail"]["manual_success_rate"] == 0.0


def test_window_excludes_older_recommendations():
    rec = _ai()
    conn = config.get_conn()
    conn.execute(f"UPDATE {store.TABLE} SET created_at = ? WHERE rec_id = ?", (time.time() - 40 * 86400, rec))
    conn.commit()
    conn.close()
    _ai()
    assert metrics.summary(30)["recommendations"] == 1
    assert metrics.summary(90)["recommendations"] == 2


# ── API: a real /map-role request through to the dashboard ───────────────────

@pytest.fixture
def client():
    from guardrails.production import rate_limiter
    from middleware import rate_limit
    from tests.test_api import _make_client
    rate_limit._store.clear()          # earlier test files share the per-IP window
    rate_limiter._windows.clear()      # … and the per-user one for /map-role
    c, patches = _make_client()
    yield c
    for p in patches:
        try:
            p.stop()
        except RuntimeError:
            pass


MAPPING = {
    "match_percentage": 80, "matched_skills": ["Python"], "missing_skills": ["Kubernetes"],
    "recommendation": "Good fit.", "experience_gap": 0,
    "evidence": {"checked": 0, "unsupported": [], "note": "No role document was retrieved."},
}


def _map_role(client, user="mgr_user"):
    with patch("main.get_user", new=AsyncMock(return_value={"profile": SAMPLE_PROFILE})), \
         patch("main.map_role", return_value=dict(MAPPING)), \
         patch("main.build_memory_context", return_value=""), \
         patch("main.write_session_summary"), \
         patch("main._ragas_background"):
        resp = client.post("/map-role", json={"user_id": "cand_1", "target_role": "Python Engineer"},
                           headers=make_auth_headers(user))
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_api_from_recommendation_to_dashboard(client):
    headers = make_auth_headers("mgr_user")
    body = _map_role(client)
    rec_id = body["recommendation_id"]
    assert body["needs_help"] == ["no role document retrieved"]
    other = _map_role(client)["recommendation_id"]

    decided = client.post(f"/allocations/{rec_id}/decision", json={"decision": "modified", "note": "+1 week"},
                          headers=headers)
    assert decided.status_code == 200 and decided.json()["decided_by"] == "mgr_user"
    assert client.post(f"/allocations/{rec_id}/decision", json={"decision": "accepted"},
                       headers=headers).status_code == 409
    assert client.post(f"/allocations/{other}/decision", json={"decision": "accepted"},
                       headers=headers).status_code == 200
    assert client.post(f"/allocations/{rec_id}/outcome", json={"outcome": "success"},
                       headers=headers).status_code == 200
    assert client.post("/allocations/manual", json={"candidate_id": "c2", "target_role": "QA", "minutes": 120},
                       headers=headers).status_code == 201

    s = client.get("/business-metrics?days=30", headers=headers).json()
    values = {m["key"]: m["value"] for m in s["metrics"]}
    assert s["recommendations"] == 2 and s["manual_allocations"] == 1
    assert values["acceptance_rate"] == 50.0
    assert values["intervention_rate"] == 100.0        # both flagged by the agent
    assert values["allocation_success_rate"] == 100.0
    assert _metric(s, "time_to_allocate")["detail"]["manual_minutes"] == pytest.approx(120.0, abs=0.2)
    assert values["cost_per_recommendation_usd"] is not None
    assert {r["rec_id"] for r in s["recent"]} >= {rec_id, other}

    # the decision is also the review step of the role-mapping task in the FDE ledger
    (task,) = [r for r in ledger.fetch(0) if r["task_id"] == store.get(rec_id)["task_id"]]
    assert task["reviewed"] == 1 and task["items_edited"] == 1


def test_api_validation_and_auth(client):
    headers = make_auth_headers("mgr_user")
    assert client.get("/business-metrics").status_code == 401
    assert client.post("/allocations/nope/decision", json={"decision": "accepted"}, headers=headers).status_code == 404
    assert client.post("/allocations/nope/outcome", json={"outcome": "success"}, headers=headers).status_code == 404
    rec_id = _map_role(client)["recommendation_id"]
    assert client.post(f"/allocations/{rec_id}/decision", json={"decision": "maybe"},
                       headers=headers).status_code == 422
    assert client.post(f"/allocations/{rec_id}/outcome", json={"outcome": "success"},
                       headers=headers).status_code == 409
    assert client.post("/allocations/manual", json={"candidate_id": "c", "target_role": "r", "minutes": 0},
                       headers=headers).status_code == 422


def test_map_role_still_succeeds_when_recording_fails(client):
    with patch("business_metrics.store.create_ai", side_effect=sqlite3.OperationalError("locked")):
        body = _map_role(client)
    assert body["recommendation_id"] is None and body["match_percentage"] == 80
