"""
The business ontology: five entity types and the links between them.

    Employee ──has──▶ Skill            (employee.skills: skill_id + level 1-5)
    Role ─────needs─▶ Skill            (role.required_skills, by skill name)
    Project ──needs─▶ Role             (project.demand: role_id + headcount)
    Allocation links one Employee to one Project in one Role, for a share of time

Roles come from data/roles_knowledge.json, the catalogue /map-role already uses;
employees, skills, projects and allocations from data/ontology.json. Every record
keeps where it was read from (``source``: file + JSON pointer), so anything built
on it can cite the exact record.

    onto = load()
    onto.employees["E-1001"].skills
    onto.ref("employee", "E-1001")
    # {"entity": "employee", "id": "E-1001", "source": "data/ontology.json#/employees/0"}
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ONTOLOGY_FILE = DATA_DIR / "ontology.json"
ROLES_FILE = DATA_DIR / "roles_knowledge.json"

ENTITY_TYPES = ("employee", "skill", "project", "role", "allocation")


class OntologyError(ValueError):
    """The data breaks the ontology: a missing field or a link to an unknown record."""


@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    category: str
    source: str


@dataclass(frozen=True)
class EmployeeSkill:
    skill_id: str
    level: int


@dataclass(frozen=True)
class Employee:
    id: str
    name: str
    email: str
    phone: str
    grade: str
    location: str
    cost_rate_per_day: float
    skills: List[EmployeeSkill]
    source: str


@dataclass(frozen=True)
class Role:
    id: str
    title: str
    required_skills: List[str]
    preferred_skills: List[str]
    experience_years: int
    source: str


@dataclass(frozen=True)
class Demand:
    role_id: str
    headcount: int


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    client: str
    status: str
    manager_ids: List[str]
    demand: List[Demand]
    source: str


@dataclass(frozen=True)
class Allocation:
    id: str
    employee_id: str
    project_id: str
    role_id: str
    percent: int
    start: str
    end: str
    status: str
    source: str

    @property
    def active(self) -> bool:
        return self.status == "active"


@dataclass
class Ontology:
    skills: Dict[str, Skill] = field(default_factory=dict)
    employees: Dict[str, Employee] = field(default_factory=dict)
    roles: Dict[str, Role] = field(default_factory=dict)
    projects: Dict[str, Project] = field(default_factory=dict)
    allocations: Dict[str, Allocation] = field(default_factory=dict)

    def table(self, entity: str) -> Dict[str, object]:
        if entity not in ENTITY_TYPES:
            raise OntologyError(f"Unknown entity type: {entity}")
        return getattr(self, entity + "s")

    def ref(self, entity: str, record_id: str, field_name: Optional[str] = None) -> Dict[str, str]:
        """A source reference that points at one record (and optionally one of its fields)."""
        record = self.table(entity).get(record_id)
        if record is None:
            raise OntologyError(f"No {entity} {record_id}")
        ref = {"entity": entity, "id": record_id, "source": record.source}
        if field_name:
            ref["field"] = field_name
        return ref

    def skill_by_name(self, name: str) -> Optional[Skill]:
        wanted = name.strip().casefold()
        return next((s for s in self.skills.values() if s.name.casefold() == wanted), None)

    def allocations_of(self, employee_id: str) -> List[Allocation]:
        return [a for a in self.allocations.values() if a.employee_id == employee_id]


def _require(record: dict, keys: tuple, where: str) -> None:
    missing = [k for k in keys if k not in record]
    if missing:
        raise OntologyError(f"{where}: missing {', '.join(missing)}")


def _source(path: Path, pointer: str) -> str:
    return f"data/{path.name}#{pointer}"


def load(ontology_file: Path = ONTOLOGY_FILE, roles_file: Path = ROLES_FILE) -> Ontology:
    """Read both files, build the entities and check every link between them."""
    raw = json.loads(ontology_file.read_text(encoding="utf-8"))
    roles_raw = json.loads(roles_file.read_text(encoding="utf-8")).get("roles", [])
    onto = Ontology()

    for i, s in enumerate(raw.get("skills", [])):
        _require(s, ("id", "name", "category"), f"skills[{i}]")
        onto.skills[s["id"]] = Skill(s["id"], s["name"], s["category"], _source(ontology_file, f"/skills/{i}"))

    for i, r in enumerate(roles_raw):
        _require(r, ("id", "title", "required_skills"), f"roles[{i}]")
        onto.roles[r["id"]] = Role(r["id"], r["title"], list(r["required_skills"]),
                                   list(r.get("preferred_skills", [])), int(r.get("experience_years", 0)),
                                   _source(roles_file, f"/roles/{i}"))

    for i, e in enumerate(raw.get("employees", [])):
        where = f"employees[{i}]"
        _require(e, ("id", "name", "email", "grade", "skills"), where)
        skills = []
        for s in e["skills"]:
            if s["skill_id"] not in onto.skills:
                raise OntologyError(f"{where}: unknown skill {s['skill_id']}")
            if not 1 <= int(s["level"]) <= 5:
                raise OntologyError(f"{where}: skill level must be 1-5, got {s['level']}")
            skills.append(EmployeeSkill(s["skill_id"], int(s["level"])))
        onto.employees[e["id"]] = Employee(
            e["id"], e["name"], e["email"], e.get("phone", ""), e["grade"], e.get("location", ""),
            float(e.get("cost_rate_per_day", 0)), skills, _source(ontology_file, f"/employees/{i}"))

    for i, p in enumerate(raw.get("projects", [])):
        where = f"projects[{i}]"
        _require(p, ("id", "name", "manager_ids"), where)
        demand = []
        for d in p.get("demand", []):
            if d["role_id"] not in onto.roles:
                raise OntologyError(f"{where}: unknown role {d['role_id']}")
            demand.append(Demand(d["role_id"], int(d["headcount"])))
        onto.projects[p["id"]] = Project(p["id"], p["name"], p.get("client", ""), p.get("status", "active"),
                                         list(p["manager_ids"]), demand, _source(ontology_file, f"/projects/{i}"))

    for i, a in enumerate(raw.get("allocations", [])):
        where = f"allocations[{i}]"
        _require(a, ("id", "employee_id", "project_id", "role_id", "percent"), where)
        for key, table in (("employee_id", onto.employees), ("project_id", onto.projects), ("role_id", onto.roles)):
            if a[key] not in table:
                raise OntologyError(f"{where}: unknown {key.removesuffix('_id')} {a[key]}")
        if not 0 < int(a["percent"]) <= 100:
            raise OntologyError(f"{where}: percent must be 1-100, got {a['percent']}")
        onto.allocations[a["id"]] = Allocation(
            a["id"], a["employee_id"], a["project_id"], a["role_id"], int(a["percent"]),
            a.get("start", ""), a.get("end", ""), a.get("status", "active"),
            _source(ontology_file, f"/allocations/{i}"))

    for employee in onto.employees.values():
        booked = sum(a.percent for a in onto.allocations_of(employee.id) if a.active)
        if booked > 100:
            raise OntologyError(f"{employee.id} is allocated {booked}% at once")
    return onto


_cached: Optional[Ontology] = None


def get() -> Ontology:
    """The ontology from the data files, loaded once."""
    global _cached
    if _cached is None:
        _cached = load()
    return _cached


def schema() -> Dict[str, object]:
    """The entity types, their fields and the relations between them (no data)."""
    return {
        "entities": {
            "employee": ["id", "name", "email", "phone", "grade", "location", "cost_rate_per_day", "skills"],
            "skill": ["id", "name", "category"],
            "project": ["id", "name", "client", "status", "manager_ids", "demand"],
            "role": ["id", "title", "required_skills", "preferred_skills", "experience_years"],
            "allocation": ["id", "employee_id", "project_id", "role_id", "percent", "start", "end", "status"],
        },
        "relations": [
            {"from": "employee", "to": "skill", "name": "has_skill", "via": "employee.skills[].skill_id"},
            {"from": "role", "to": "skill", "name": "requires_skill", "via": "role.required_skills (by name)"},
            {"from": "project", "to": "role", "name": "demands_role", "via": "project.demand[].role_id"},
            {"from": "allocation", "to": "employee", "name": "allocates", "via": "allocation.employee_id"},
            {"from": "allocation", "to": "project", "name": "on_project", "via": "allocation.project_id"},
            {"from": "allocation", "to": "role", "name": "in_role", "via": "allocation.role_id"},
        ],
    }
