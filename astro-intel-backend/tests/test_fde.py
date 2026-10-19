"""
Tests for the FDE toolkit (fde/): ledger, metric registry, permission matrix,
model-comparison evals and the API. Project-neutral: the same file runs in
every project that ships fde/.
"""
from __future__ import annotations

import json
import sqlite3
import time
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from fde import api, config, counters, evals, ledger, metrics, permissions
from fde.metrics import MetricContext, compute


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "fde.db"
    monkeypatch.setattr(config, "get_conn", lambda: sqlite3.connect(str(path)))
    monkeypatch.setattr(config, "REAL_TYPE", "REAL")
    monkeypatch.setattr(ledger, "_ready", False)
    counters.reset()
    yield path


def _rows():
    return ledger.fetch(0)


def _metric(items, key):
    return next(m for m in items if m["key"] == key)["value"]


# ── ledger ────────────────────────────────────────────────────────────────────

class TestLedger:
    def test_success_row_with_attrs(self):
        with ledger.track("wf_a", tenant_id="t1") as t:
            t.set(prompt_tokens=1000, completion_tokens=500, model_calls=2, custom_score=0.9)
        (r,) = _rows()
        assert r["status"] == "success" and r["tenant_id"] == "t1"
        assert r["model_calls"] == 2 and r["custom_score"] == 0.9
        assert r["cost_usd"] > 0

    def test_exception_is_failed_and_reraised(self):
        with pytest.raises(RuntimeError):
            with ledger.track("wf_a"):
                raise RuntimeError("boom")
        (r,) = _rows()
        assert r["status"] == "failed" and "boom" in r["error_summary"]

    def test_client_error_is_rejected(self):
        with pytest.raises(HTTPException):
            with ledger.track("wf_a"):
                raise HTTPException(404, "missing")
        assert _rows()[0]["status"] == "rejected"

    def test_server_http_error_is_failed(self):
        with pytest.raises(HTTPException):
            with ledger.track("wf_a"):
                raise HTTPException(503, "down")
        assert _rows()[0]["status"] == "failed"

    def test_non_fatal_error_is_degraded(self):
        with ledger.track("wf_a") as t:
            t.error("one agent skipped")
        assert _rows()[0]["status"] == "degraded"

    def test_counters_flow_into_row(self):
        with ledger.track("wf_a"):
            counters.incr("retries", 2)
            permissions.check("nobody", "read", "x")
        r = _rows()[0]
        assert r["retries"] == 2 and r["permission_denials"] == 1

    def test_review_attaches_to_task(self):
        ledger.record_task("abc", workflow="wf_a", started_at=time.time() - 100, ended_at=time.time() - 60)
        ledger.record_review("abc", approved=3, rejected=1, edited=1, approvals_requested=1, note="ok")
        r = _rows()[0]
        assert r["reviewed"] == 1 and r["items_rejected"] == 1 and r["review_seconds"] >= 59
        assert r["approvals_requested"] == 1 and r["note"] == "ok"

    def test_review_for_unknown_task_is_ignored(self):
        ledger.record_review("missing", approved=1, rejected=0)
        assert _rows() == []

    def test_writes_never_raise_when_db_is_down(self, monkeypatch):
        def broken():
            raise sqlite3.OperationalError("db down")
        monkeypatch.setattr(config, "get_conn", broken)
        monkeypatch.setattr(ledger, "_ready", False)
        with ledger.track("wf_a"):
            pass  # must not raise

    def test_current_outside_task_is_harmless(self):
        ledger.current().set(x=1)
        ledger.current().cache_hit = True
        assert _rows() == []


# ── decorator + FastAPI ──────────────────────────────────────────────────────

def _user():
    return {"sub": "u1"}


class TestTrackedDecorator:
    def test_preserves_fastapi_signature_and_records(self):
        app = FastAPI()

        @app.get("/thing/{item_id}")
        @ledger.tracked("wf_api", tenant_from=lambda **kw: kw["claims"]["sub"])
        async def thing(item_id: str, request: Request,
                        claims: Annotated[dict, Depends(_user)] = None):
            ledger.current().set(item=item_id)
            ledger.current().cache_hit = True
            return {"item": item_id, "user": claims["sub"]}

        res = TestClient(app).get("/thing/42")
        assert res.status_code == 200 and res.json() == {"item": "42", "user": "u1"}
        r = _rows()[0]
        assert r["workflow"] == "wf_api" and r["tenant_id"] == "u1"
        assert r["item"] == "42" and r["cache_hit"] == 1

    def test_http_error_passes_through(self):
        app = FastAPI()

        @app.get("/fail")
        @ledger.tracked("wf_api")
        async def fail():
            raise HTTPException(400, "bad input")

        assert TestClient(app).get("/fail").status_code == 400
        assert _rows()[0]["status"] == "rejected"


# ── metrics ───────────────────────────────────────────────────────────────────

def _seed():
    now = time.time()
    ledger.record_task("s1", workflow="wf", started_at=now, ended_at=now + 2, cost_usd=0.01, model_calls=2)
    ledger.record_task("s2", workflow="wf", started_at=now, ended_at=now + 4, cost_usd=0.01, model_calls=2, retries=1)
    ledger.record_task("f1", workflow="wf", started_at=now, ended_at=now + 1, cost_usd=0.02, failed=True, retries=2)
    ledger.record_task("r1", workflow="wf", started_at=now, ended_at=now, rejected=True)


class TestMetrics:
    def test_core_rates(self):
        _seed()
        m = compute(_rows(), MetricContext(None, None))
        assert _metric(m, "tasks") == 4
        assert _metric(m, "success_rate") == pytest.approx(66.7)     # rejected excluded
        assert _metric(m, "failure_rate") == pytest.approx(33.3)
        assert _metric(m, "input_rejection_rate") == 25.0

    def test_cost_per_successful_task_counts_failed_spend(self):
        _seed()
        m = compute(_rows(), MetricContext(None, None))
        assert _metric(m, "cost_per_successful_task_usd") == pytest.approx(0.04 / 2, rel=1e-3)
        assert _metric(m, "cost_per_task_usd") == pytest.approx(0.04 / 3, rel=1e-3)

    def test_retries_and_calls(self):
        _seed()
        m = compute(_rows(), MetricContext(None, None))
        assert _metric(m, "retries_per_task") == pytest.approx(1.0)
        assert _metric(m, "retry_rate") == pytest.approx(66.7)
        assert _metric(m, "model_calls_per_task") == pytest.approx(4 / 3, abs=0.01)

    def test_empty_window_gives_none_not_errors(self):
        m = compute([], MetricContext(None, None))
        assert _metric(m, "success_rate") is None
        assert not any("error" in x for x in m)

    def test_baseline_metrics_only_per_workflow(self):
        _seed()
        overall = {x["key"] for x in compute(_rows(), MetricContext(None, None))}
        per_wf = compute(_rows(), MetricContext("wf", 30.0))
        assert "hours_saved_total" not in overall
        assert _metric(per_wf, "baseline_minutes") == 30.0
        assert _metric(per_wf, "minutes_saved_per_task") > 29

    def test_new_metric_plugs_in_and_bad_metric_is_isolated(self, monkeypatch):
        monkeypatch.setattr(metrics, "REGISTRY", dict(metrics.REGISTRY))

        @metrics.metric("test_avg_score", "Avg score", unit="ratio", group="Quality")
        def _avg(rows, ctx):
            return metrics.mean(r.get("custom_score") for r in rows)

        @metrics.metric("test_broken", "Broken")
        def _broken(rows, ctx):
            raise ZeroDivisionError

        ledger.record_task("x", workflow="wf", started_at=0, ended_at=1, custom_score=0.5)
        m = compute(ledger.fetch(-1), MetricContext(None, None))
        assert _metric(m, "test_avg_score") == 0.5
        assert "error" in next(x for x in m if x["key"] == "test_broken")
        assert _metric(m, "tasks") == 1

    def test_duplicate_key_rejected(self):
        with pytest.raises(ValueError):
            metrics.metric("tasks", "dup")(lambda r, c: 0)


# ── permissions ───────────────────────────────────────────────────────────────

class TestPermissions:
    def _agent(self):
        name = next(n for n, e in config.PERMISSION_MATRIX.items()
                    if e.get("read") and "*" not in e.get("read", []) and e.get("kind") != "human")
        return name, config.PERMISSION_MATRIX[name]

    def test_granted_read_allowed(self):
        name, e = self._agent()
        permissions.authorize(name, "read", e["read"][0])

    def test_default_deny(self):
        name, _ = self._agent()
        with pytest.raises(permissions.PermissionDenied):
            permissions.authorize(name, "write", "definitely_not_granted")
        with pytest.raises(permissions.PermissionDenied):
            permissions.authorize("unknown_agent", "read", "anything")

    def test_unknown_action_is_a_bug(self):
        with pytest.raises(ValueError):
            permissions.check("x", "delete", "y")

    def test_approval_routes_to_human(self):
        gated = [(n, r) for n, e in config.PERMISSION_MATRIX.items() for r in e.get("approval", [])]
        assert gated, "matrix should route at least one action to a human"
        n, r = gated[0]
        assert permissions.needs_approval(n, r) is True
        assert counters.snapshot().get("approvals_requested") == 1

    def test_no_agent_can_write_everything(self):
        for name, e in config.PERMISSION_MATRIX.items():
            if e.get("kind") != "human":
                assert "*" not in e.get("write", []), name

    def test_matrix_shape(self):
        m = permissions.matrix()
        assert m["resources"] and set(m["grid"]) == set(config.PERMISSION_MATRIX)
        cell = next(iter(next(iter(m["grid"].values())).values()))
        assert set(cell) == {"read", "write", "approval"}


# ── evals ─────────────────────────────────────────────────────────────────────

class TestEvals:
    def test_checks(self):
        out = json.dumps({"skills": ["Python", "SQL"], "experience_years": 5, "email": ""})
        p = evals.parse_json(out)
        assert evals.run_check({"type": "recall", "field": "skills", "expected": ["python", "go"]}, out, p)[0] == 0.5
        assert evals.run_check({"type": "number_between", "field": "experience_years", "min": 4, "max": 6}, out, p)[0] == 1
        assert evals.run_check({"type": "not_contains", "field": "skills", "values": ["ceo"]}, out, p)[0] == 1
        assert evals.run_check({"type": "equals", "field": "email", "value": ""}, out, p)[0] == 1
        assert evals.parse_json("```json\n{\"a\": 1}\n```") == {"a": 1}
        assert evals.run_check({"type": "json_valid"}, "nope", None)[0] == 0

    def test_offline_suite_runs_and_writes_reproducible_report(self, tmp_path):
        suite = config.EVAL_DIR / config.EVAL_DEFAULT_SUITE
        rep = evals.run_suite(suite, ["model-a", "model-b"], offline=True)
        assert rep["mode"] == "offline-smoke-test"
        assert len(rep["results"]) == 2 * len(json.loads(suite.read_text())["cases"])
        assert all(r["passed"] for r in rep["results"]), [r for r in rep["results"] if not r["passed"]]
        assert len(rep["reproducibility"]["suite_sha256"]) == 64
        jpath, mpath = evals.write_report(rep, tmp_path)
        assert jpath.exists() and mpath.exists()
        assert not list(tmp_path.glob("*_latest.json"))   # offline runs never replace the live report
        assert "| Model |" in mpath.read_text()

    def test_live_run_without_key_records_errors_not_crash(self, monkeypatch):
        monkeypatch.delenv(config.EVAL_API_KEY_ENV, raising=False)
        rep = evals.run_suite(config.EVAL_DIR / config.EVAL_DEFAULT_SUITE, ["m"], offline=False)
        assert rep["summary"][0]["errors"] == rep["summary"][0]["cases"]


# ── api ───────────────────────────────────────────────────────────────────────

class TestApi:
    def test_endpoints(self):
        _seed()
        app = FastAPI()
        app.include_router(api.build_router(lambda: {"role": "admin"}))
        c = TestClient(app)
        s = c.get("/fde/outcomes?days=7").json()
        assert s["tasks"] == 4 and s["workflows"] and s["daily"] and s["recent_tasks"]
        keys = {m["key"] for m in s["overall"]}
        assert {"cost_per_successful_task_usd", "retries_per_task", "completion_rate"} <= keys
        p = c.get("/fde/permissions").json()
        assert p["agents"] and "recent_decisions" in p
        assert c.get("/fde/evals/latest").status_code == 200
        assert c.get("/fde/outcomes?days=0").status_code == 422
