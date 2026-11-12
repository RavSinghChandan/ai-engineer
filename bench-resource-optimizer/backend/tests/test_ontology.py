"""
Tests for the business ontology (ontology/): loading and link checks, role-based
access for project managers, and source references on every recommendation.
Run: pytest tests/test_ontology.py -v
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from ontology import access, model, recommend
from tests.conftest import make_admin_headers, make_auth_headers

ONTO = model.load()
MEERA = access.Principal("pm.meera", access.PROJECT_MANAGER)  # manages P-ORION and P-NOVA
DEV = access.Principal("pm.dev", access.PROJECT_MANAGER)  # manages P-ATLAS and P-NOVA
ADMIN = access.Principal("admin", access.ADMIN)


def _resolve(ref):
    """Follow a source reference to the record in its file, and check it is the cited one."""
    path, pointer = ref["source"].split("#")
    node = json.loads((model.DATA_DIR / path.removeprefix("data/")).read_text())
    for part in pointer.strip("/").split("/"):
        node = node[int(part)] if isinstance(node, list) else node[part]
    assert node["id"] == ref["id"]
    if "field" in ref:
        assert ref["field"] in node
    return node


# ── Ontology ─────────────────────────────────────────────────────────────────

def test_ontology_has_the_five_entity_types():
    assert {"employee", "skill", "project", "role", "allocation"} == set(model.schema()["entities"])
    for entity in model.ENTITY_TYPES:
        assert ONTO.table(entity)
    assert set(ONTO.roles) == {r["id"] for r in json.loads(model.ROLES_FILE.read_text())["roles"]}


def test_every_record_cites_its_source():
    for entity in model.ENTITY_TYPES:
        for record_id in ONTO.table(entity):
            _resolve(ONTO.ref(entity, record_id))


def _broken(tmp_path, mutate):
    raw = json.loads(model.ONTOLOGY_FILE.read_text())
    mutate(raw)
    path = tmp_path / "ontology.json"
    path.write_text(json.dumps(raw))
    return path


@pytest.mark.parametrize("mutate, message", [
    (lambda r: r["allocations"][0].update(employee_id="E-404"), "unknown employee E-404"),
    (lambda r: r["allocations"][0].update(role_id="nope"), "unknown role nope"),
    (lambda r: r["employees"][0]["skills"].append({"skill_id": "SK-NOPE", "level": 3}), "unknown skill"),
    (lambda r: r["employees"][0]["skills"][0].update(level=9), "level must be 1-5"),
    (lambda r: r["projects"][0]["demand"].append({"role_id": "ghost", "headcount": 1}), "unknown role ghost"),
    (lambda r: r["allocations"].append(dict(r["allocations"][0], id="AL-X")), "allocated 200%"),
    (lambda r: r["employees"][0].pop("email"), "missing email"),
    (lambda r: r["allocations"][0].update(percent=0), "percent must be 1-100"),
])
def test_load_rejects_broken_links(tmp_path, mutate, message):
    with pytest.raises(model.OntologyError, match=message):
        model.load(_broken(tmp_path, mutate))


def test_unknown_entity_or_record():
    with pytest.raises(model.OntologyError, match="Unknown entity type"):
        ONTO.table("team")
    with pytest.raises(model.OntologyError, match="No employee E-404"):
        ONTO.ref("employee", "E-404")


# ── Access ───────────────────────────────────────────────────────────────────

def test_admin_sees_everything():
    view = access.View(ONTO, ADMIN)
    assert len(view.employees()) == len(ONTO.employees)
    assert len(view.allocations()) == len(ONTO.allocations)
    assert "cost_rate_per_day" in view.employees()[0]


def test_project_manager_sees_only_their_projects_and_allocations():
    view = access.View(ONTO, MEERA)
    assert {p["id"] for p in view.projects()} == {"P-ORION", "P-NOVA"}
    assert {a["project_id"] for a in view.allocations()} == {"P-ORION"}
    assert not view.can_see("project", "P-ATLAS")
    assert not view.can_see("allocation", "AL-004")  # Neha on Atlas


def test_project_manager_sees_staffed_and_bench_employees_only():
    ids = {e["id"] for e in access.View(ONTO, MEERA).employees()}
    # staffed on Orion: E-1001, E-1006; bench: E-1002 (allocation ended), E-1004, E-1005, E-1007
    assert ids == {"E-1001", "E-1006", "E-1002", "E-1004", "E-1005", "E-1007"}
    # Neha and Arjun work only on Atlas, which Meera does not manage
    assert {"E-1003", "E-1008"} <= {e["id"] for e in access.View(ONTO, DEV).employees()}
    assert not {"E-1003", "E-1008"} & ids


def test_project_manager_does_not_see_contact_details_or_cost():
    for employee in access.View(ONTO, MEERA).employees():
        assert not {"email", "phone", "cost_rate_per_day"} & set(employee)
        assert {"id", "name", "skills", "source"} <= set(employee)


@pytest.mark.parametrize("role", ["user", "", "hr_viewer"])
def test_other_roles_are_denied(role):
    with pytest.raises(access.AccessDenied):
        access.View(ONTO, access.Principal("someone", role))


def test_decisions_are_logged():
    view = access.View(ONTO, MEERA)
    with pytest.raises(access.NotVisible):
        view.require("project", "P-ATLAS")
    last = access.decisions(1)[0]
    assert (last["user"], last["target"], last["decision"]) == ("pm.meera", "project:P-ATLAS", "deny")


# ── Recommendations ──────────────────────────────────────────────────────────

def test_every_claim_of_a_recommendation_has_resolvable_sources():
    result = recommend.recommend(access.View(ONTO, MEERA), "P-ORION", "java-microservices-dev")
    assert result["recommendations"]
    for rec in result["recommendations"]:
        assert rec["sources"]
        for reason in rec["reasons"]:
            assert reason["sources"], reason["claim"]
            for ref in reason["sources"]:
                if "withheld" not in ref:
                    _resolve(ref)


def test_recommendation_ranks_by_skills_and_availability():
    result = recommend.recommend(access.View(ONTO, MEERA), "P-ORION", "java-microservices-dev", top_k=5)
    ids = [r["employee"]["id"] for r in result["recommendations"]]
    assert ids[0] == "E-1002"  # Rohan: most Java role skills, on the bench
    assert "E-1001" not in ids  # already on this role in this project
    top = result["recommendations"][0]
    assert top["availability_pct"] == 100
    assert {"skill": "Java", "level": 3} in top["matched_skills"]
    assert "Kubernetes" in top["missing_skills"]


def test_weak_matches_are_not_recommended():
    # Orion's DevOps opening: nobody visible and free has 20% of the role's skills
    view = access.View(ONTO, MEERA)
    result = recommend.recommend(view, "P-ORION", "devops-engineer")
    assert result["recommendations"] == []
    assert result["below_threshold"] >= 1
    loose = recommend.recommend(view, "P-ORION", "devops-engineer", top_k=10, min_skill_match_pct=0)
    assert loose["recommendations"]
    assert all(r["skill_match_pct"] < 20 for r in loose["recommendations"])


def test_recommendation_only_uses_permitted_employees():
    meera = recommend.recommend(access.View(ONTO, MEERA), "P-NOVA", "frontend-angular-dev", top_k=20,
                                min_skill_match_pct=0)
    visible = access.View(ONTO, MEERA).employee_ids()
    assert {r["employee"]["id"] for r in meera["recommendations"]} <= visible
    for rec in meera["recommendations"]:
        assert "email" not in rec["employee"]


def test_allocation_outside_access_is_cited_as_a_count_only():
    # Vikram is 50% on Orion (Meera's) and 50% on Atlas (Dev's): fully booked, so look at the reason
    view = access.View(ONTO, MEERA)
    rec = recommend._evaluate(view, ONTO.employees["E-1006"], ONTO.roles["devops-engineer"], "P-ORION")
    availability = rec["reasons"][-1]
    assert availability["claim"].startswith("0% available")
    cited = {ref.get("id") for ref in availability["sources"]}
    assert "AL-002" in cited and "AL-003" not in cited
    withheld = [ref for ref in availability["sources"] if "withheld" in ref]
    assert withheld == [{"entity": "allocation", "withheld": 1, "percent": 50,
                         "reason": "on projects outside your access"}]


def test_recommendation_for_another_managers_project_is_not_found():
    with pytest.raises(access.NotVisible):
        recommend.recommend(access.View(ONTO, MEERA), "P-ATLAS", "python-data-engineer")


def test_recommendation_for_a_role_the_project_does_not_need():
    with pytest.raises(recommend.NotDemanded):
        recommend.recommend(access.View(ONTO, MEERA), "P-ORION", "ai-ml-engineer")


# ── API ──────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from main import app

    return TestClient(app)


def _pm(user_id="pm.meera"):
    return make_auth_headers(user_id=user_id, role=access.PROJECT_MANAGER)


def test_api_project_manager_scope(client):
    employees = client.get("/ontology/employees", headers=_pm()).json()
    assert "E-1003" not in {e["id"] for e in employees}
    assert all("email" not in e for e in employees)
    assert {p["id"] for p in client.get("/ontology/projects", headers=_pm()).json()} == {"P-ORION", "P-NOVA"}
    assert client.get("/ontology/allocations", headers=_pm("pm.dev")).status_code == 200


def test_api_recommendation_with_sources(client):
    r = client.post("/ontology/recommendations", headers=_pm(),
                    json={"project_id": "P-ORION", "role_id": "java-microservices-dev", "top_k": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["project"]["source"].startswith("data/ontology.json#/projects/")
    assert all(rec["sources"] for rec in body["recommendations"])


@pytest.mark.parametrize("payload, status", [
    ({"project_id": "P-ATLAS", "role_id": "python-data-engineer"}, 404),  # not Meera's project
    ({"project_id": "P-NOPE", "role_id": "python-data-engineer"}, 404),  # does not exist: same answer
    ({"project_id": "P-ORION", "role_id": "ai-ml-engineer"}, 422),
])
def test_api_recommendation_errors(client, payload, status):
    assert client.post("/ontology/recommendations", headers=_pm(), json=payload).status_code == status


def test_api_roles_and_auth(client):
    assert client.get("/ontology/employees").status_code == 401
    assert client.get("/ontology/employees", headers=make_auth_headers(role="user")).status_code == 403
    assert len(client.get("/ontology/employees", headers=make_admin_headers()).json()) == len(ONTO.employees)
    assert client.get("/ontology/access-log", headers=_pm()).status_code == 403
    assert client.get("/ontology/access-log", headers=make_admin_headers()).status_code == 200
    assert client.get("/ontology/schema", headers=_pm()).json()["relations"]
    assert len(client.get("/ontology/skills", headers=_pm()).json()) == len(ONTO.skills)
    assert {r["id"] for r in client.get("/ontology/roles", headers=_pm()).json()} == set(ONTO.roles)


def test_project_manager_login(client, monkeypatch):
    from auth import jwt_handler

    monkeypatch.setattr(jwt_handler, "PROJECT_MANAGER_PASSWORD", "pm-pass")
    assert jwt_handler._check_credentials("pm.meera", "pm-pass") == "project_manager"
    assert jwt_handler._check_credentials("pm.meera", "wrong") is None
    # not a manager on any project: an ordinary user, as before
    assert jwt_handler._check_credentials("someone", jwt_handler.DEFAULT_USER_PASSWORD) == "user"
    monkeypatch.setattr(jwt_handler, "PROJECT_MANAGER_PASSWORD", "")
    assert jwt_handler._check_credentials("pm.meera", "pm-pass") is None
