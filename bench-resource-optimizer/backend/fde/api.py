"""
FastAPI router for the FDE dashboard.

    GET /fde/outcomes?days=30    all registered metrics: overall, per workflow, daily trend, recent tasks
    GET /fde/permissions         agent permission matrix + recent decisions
    GET /fde/evals/latest        newest live model-comparison report (summary + per-case scores)

The project mounts it with its own auth dependency:

    app.include_router(fde_api.build_router(auth_dependency, tenant_scope=fn))
"""
from __future__ import annotations

import logging
import time
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, Query

from fde import config, evals, ledger, permissions
from fde.metrics import MetricContext, compute

log = logging.getLogger("fde.api")


def summary(days: int = 30, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    days = max(1, min(int(days), 365))
    try:
        rows = ledger.fetch(time.time() - days * 86400, tenant_id)
    except Exception as exc:
        log.warning("fde summary failed: %s", exc)
        rows = []

    workflows: List[Dict[str, Any]] = []
    for wf in sorted({r["workflow"] for r in rows} | set(config.WORKFLOWS)):
        wf_rows = [r for r in rows if r["workflow"] == wf]
        meta = config.WORKFLOWS.get(wf, {})
        workflows.append({
            "key": wf,
            "label": meta.get("label", wf),
            "description": meta.get("description", ""),
            "tasks": len(wf_rows),
            "metrics": compute(wf_rows, MetricContext(wf, meta.get("baseline_minutes"))),
        })

    daily: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        day = time.strftime("%Y-%m-%d", time.gmtime(float(r["started_at"])))
        d = daily.setdefault(day, {"date": day, "tasks": 0, "success": 0, "degraded": 0,
                                   "failed": 0, "rejected": 0, "cost_usd": 0.0})
        d["tasks"] += 1
        d[r["status"]] = d.get(r["status"], 0) + 1
        d["cost_usd"] = round(d["cost_usd"] + float(r["cost_usd"] or 0) + float(r["review_cost_usd"] or 0), 6)

    recent = [{
        "task_id": str(r["task_id"])[:8],
        "workflow": config.WORKFLOWS.get(r["workflow"], {}).get("label", r["workflow"]),
        "status": r["status"], "cache_hit": bool(r["cache_hit"]),
        "started_at": r["started_at"], "duration_ms": r["duration_ms"],
        "cost_usd": round(float(r["cost_usd"] or 0) + float(r["review_cost_usd"] or 0), 6),
        "model_calls": r["model_calls"], "retries": r["retries"],
        "tokens": int(r["prompt_tokens"] or 0) + int(r["completion_tokens"] or 0),
        "reviewed": bool(r["reviewed"]), "error": str(r["error_summary"] or "")[:120],
    } for r in rows[:20]]

    return {
        "project": config.PROJECT_NAME,
        "window_days": days,
        "scope": "tenant" if tenant_id else "all",
        "generated_at": time.time(),
        "tasks": len(rows),
        "overall": compute(rows, MetricContext(None, None)),
        "workflows": workflows,
        "daily": [daily[k] for k in sorted(daily)],
        "recent_tasks": recent,
        "status_definitions": {
            "success": "Output produced with no agent errors",
            "degraded": "Output produced, but an agent failed and was skipped or fell back",
            "rejected": "Input refused on purpose (validation, guardrail, 4xx) — not a system failure",
            "failed": "No usable output (exception, 5xx or empty result)",
        },
        "assumption_note": "Metrics tagged 'assumption' use a manual baseline from config until "
                           "it is measured with the customer.",
    }


def build_router(auth_dependency: Callable, tenant_scope: Optional[Callable[[Any], Optional[str]]] = None,
                 prefix: str = "/fde") -> APIRouter:
    router = APIRouter(prefix=prefix, tags=["FDE"])

    @router.get("/outcomes")
    async def outcomes(days: int = Query(30, ge=1, le=365), ctx: Any = Depends(auth_dependency)):
        return summary(days, tenant_scope(ctx) if tenant_scope else None)

    @router.get("/permissions")
    async def permission_matrix(ctx: Any = Depends(auth_dependency)):
        return {**permissions.matrix(), "recent_decisions": permissions.audit_trail(40)}

    @router.get("/evals/latest")
    async def latest_eval(ctx: Any = Depends(auth_dependency)):
        rep = evals.latest_report()
        return rep or {"available": False,
                       "hint": "Run `python -m fde.evals` in the backend folder and commit evals/reports/."}

    return router
