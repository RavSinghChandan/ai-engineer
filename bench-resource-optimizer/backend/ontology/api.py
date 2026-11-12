"""
FastAPI router for the business ontology.

    GET  /ontology/schema                   entity types, fields and relations (no data)
    GET  /ontology/employees                employees the caller may see, masked by role
    GET  /ontology/projects                 projects the caller may see
    GET  /ontology/allocations              allocations on those projects
    GET  /ontology/skills | /ontology/roles the shared catalogues
    POST /ontology/recommendations          { project_id, role_id, top_k } → ranked
                                            employees, each claim with its sources
    GET  /ontology/access-log               admin only: the access decisions

Roles: admin and project_manager (see ontology.access); any other role gets 403.
A record outside the caller's access is a 404, the same as a missing one.
"""
from __future__ import annotations

from dataclasses import asdict
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ontology import access, model, recommend


class RecommendationRequest(BaseModel):
    project_id: str = Field(..., min_length=1, max_length=50)
    role_id: str = Field(..., min_length=1, max_length=100)
    top_k: int = Field(3, ge=1, le=20)
    min_skill_match_pct: float = Field(recommend.DEFAULT_MIN_SKILL_MATCH_PCT, ge=0, le=100)


def _view(claims: Any) -> access.View:
    principal = access.Principal(getattr(claims, "sub", ""), getattr(claims, "role", ""))
    try:
        return access.View(model.get(), principal)
    except access.AccessDenied as exc:
        raise HTTPException(403, str(exc))


def build_router(auth_dependency: Callable) -> APIRouter:
    router = APIRouter(prefix="/ontology", tags=["Ontology"])

    @router.get("/schema")
    async def schema(claims: Any = Depends(auth_dependency)):
        _view(claims)
        return model.schema()

    @router.get("/employees")
    async def employees(claims: Any = Depends(auth_dependency)):
        return _view(claims).employees()

    @router.get("/projects")
    async def projects(claims: Any = Depends(auth_dependency)):
        return _view(claims).projects()

    @router.get("/allocations")
    async def allocations(claims: Any = Depends(auth_dependency)):
        return _view(claims).allocations()

    @router.get("/skills")
    async def skills(claims: Any = Depends(auth_dependency)):
        _view(claims)
        return [asdict(s) for s in model.get().skills.values()]

    @router.get("/roles")
    async def roles(claims: Any = Depends(auth_dependency)):
        _view(claims)
        return [asdict(r) for r in model.get().roles.values()]

    @router.post("/recommendations")
    async def recommendations(req: RecommendationRequest, claims: Any = Depends(auth_dependency)):
        view = _view(claims)
        try:
            return recommend.recommend(view, req.project_id, req.role_id, req.top_k, req.min_skill_match_pct)
        except access.NotVisible as exc:
            raise HTTPException(404, str(exc))
        except recommend.NotDemanded as exc:
            raise HTTPException(422, str(exc))

    @router.get("/access-log")
    async def access_log(limit: int = Query(100, ge=1, le=500), claims: Any = Depends(auth_dependency)):
        if getattr(claims, "role", "") != access.ADMIN:
            raise HTTPException(403, "Admin role required for this endpoint.")
        return access.decisions(limit)

    return router
