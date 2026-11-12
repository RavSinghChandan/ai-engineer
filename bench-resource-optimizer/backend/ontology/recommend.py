"""
Staffing recommendations over the ontology, each with the records it is based on.

For an open role on a project, rank the employees the principal may see by

    score = 0.7 * skill match + 0.3 * availability

    skill match   share of the role's required skills the employee has, weighted by
                  level (level 5 counts fully, level 1 a fifth)
    availability  100% minus the employee's active allocations, on any project

Every claim in a recommendation carries ``sources``: references to the employee,
skill, role, project and allocation records it was derived from (file + JSON
pointer, see ontology.model). An allocation the principal may not see is never
named; it is cited only as a count, so the availability stays true without
revealing another project.
"""
from __future__ import annotations

from typing import Any, Dict, List

from ontology.access import View
from ontology.model import Employee, Role

SKILL_WEIGHT = 0.7
AVAILABILITY_WEIGHT = 0.3
# Below this share of the role's skills a candidate is not put forward at all
DEFAULT_MIN_SKILL_MATCH_PCT = 20.0


class NotDemanded(ValueError):
    """The project has no demand for this role."""


def _dedupe(refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen, out = set(), []
    for ref in refs:
        key = tuple(sorted((k, str(v)) for k, v in ref.items()))
        if key not in seen:
            seen.add(key)
            out.append(ref)
    return out


def _evaluate(view: View, employee: Employee, role: Role, project_id: str) -> Dict[str, Any]:
    onto = view.onto
    emp_ref = onto.ref("employee", employee.id, "skills")
    role_ref = onto.ref("role", role.id, "required_skills")
    levels = {s.skill_id: s.level for s in employee.skills}

    reasons: List[Dict[str, Any]] = []
    matched, missing, weighted = [], [], 0.0
    for name in role.required_skills:
        skill = onto.skill_by_name(name)
        level = levels.get(skill.id) if skill else None
        if level:
            weighted += level / 5
            matched.append({"skill": skill.name, "level": level})
            reasons.append({"claim": f"Has {skill.name} at level {level}/5, required by {role.title}",
                            "sources": [emp_ref, onto.ref("skill", skill.id), role_ref]})
        else:
            missing.append(name)
            sources = [emp_ref, role_ref] + ([onto.ref("skill", skill.id)] if skill else [])
            reasons.append({"claim": f"Missing {name}, required by {role.title}", "sources": sources})
    skill_match = weighted / len(role.required_skills) if role.required_skills else 0.0

    active = [a for a in onto.allocations_of(employee.id) if a.active]
    booked = sum(a.percent for a in active)
    availability = max(0, 100 - booked)
    visible = {a.id for a in view.visible_allocations_of(employee.id)}
    alloc_sources: List[Dict[str, Any]] = [onto.ref("allocation", a.id, "percent") for a in active if a.id in visible]
    withheld = [a for a in active if a.id not in visible]
    if withheld:
        alloc_sources.append({"entity": "allocation", "withheld": len(withheld),
                              "percent": sum(a.percent for a in withheld),
                              "reason": "on projects outside your access"})
    reasons.append({"claim": f"{availability}% available ({booked}% allocated on active allocations)"
                             if active else "100% available (no active allocation)",
                    "sources": alloc_sources or [onto.ref("employee", employee.id)]})

    score = round(SKILL_WEIGHT * skill_match + AVAILABILITY_WEIGHT * availability / 100, 3)
    all_sources = [onto.ref("project", project_id, "demand")]
    for reason in reasons:
        all_sources.extend(reason["sources"])
    return {
        "employee": view.employee(employee),
        "score": score,
        "skill_match_pct": round(100 * skill_match, 1),
        "availability_pct": availability,
        "matched_skills": matched,
        "missing_skills": missing,
        "reasons": reasons,
        "sources": _dedupe(all_sources),
    }


def recommend(view: View, project_id: str, role_id: str, top_k: int = 3,
              min_skill_match_pct: float = DEFAULT_MIN_SKILL_MATCH_PCT) -> Dict[str, Any]:
    """The best employees for one open role on a project, among those the principal may see."""
    project = view.project(project_id)  # NotVisible if not theirs
    view.require("role", role_id)
    if role_id not in {d.role_id for d in project.demand}:
        raise NotDemanded(f"{project_id} has no demand for role {role_id}")
    role = view.onto.roles[role_id]

    already = {a.employee_id for a in view.onto.allocations.values()
               if a.active and a.project_id == project_id and a.role_id == role_id}
    candidates = [view.onto.employees[eid] for eid in sorted(view.employee_ids() - already)]
    ranked = [_evaluate(view, e, role, project_id) for e in candidates]
    eligible = [r for r in ranked if r["availability_pct"] > 0 and r["matched_skills"]
                and r["skill_match_pct"] >= min_skill_match_pct]
    eligible.sort(key=lambda r: (-r["score"], r["employee"]["id"]))
    return {
        "project": {"id": project.id, "name": project.name, "source": project.source},
        "role": {"id": role.id, "title": role.title, "source": role.source},
        "considered": len(candidates),
        "below_threshold": sum(1 for r in ranked if r["availability_pct"] > 0
                               and r["skill_match_pct"] < min_skill_match_pct),
        "min_skill_match_pct": min_skill_match_pct,
        "recommendations": eligible[:top_k],
    }
