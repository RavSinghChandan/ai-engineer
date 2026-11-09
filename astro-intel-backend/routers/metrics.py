"""
GET /api/v1/metrics          — Live pipeline metrics dashboard (ADMIN+)
GET /api/v1/metrics/prometheus — OpenMetrics text for Grafana scraping (ADMIN+)
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from metrics import get_collector
from metrics.prometheus_exporter import dashboard_to_prometheus
from auth.dependencies import require_role
from auth.models import Role, TenantContext
from auth.rbac import Permission, can

router = APIRouter(prefix="/api/v1/metrics", tags=["Metrics"])


@router.get("")
async def get_metrics(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """Return live production metrics dashboard. Requires ADMIN or SUPERADMIN."""
    from cache.semantic import semantic_stats
    from cache.redis_store import redis_stats
    dashboard = get_collector().dashboard()
    dashboard["thresholds"] = {
        "error_rate_warn_pct": 10,
    }
    dashboard["tenant_id"]      = ctx.tenant_id
    dashboard["semantic_cache"] = semantic_stats()
    dashboard["redis_cache"]    = redis_stats()
    return JSONResponse(content=dashboard)


@router.get("/ragas")
async def get_ragas_scores(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """
    Return per-report RAGAS evaluation scores.
    Scores are computed automatically after every /approve call.
    Requires ADMIN or SUPERADMIN.
    """
    from metrics.ragas_evaluator import summary as ragas_summary
    return JSONResponse(content=ragas_summary())


@router.get("/ragas/{session_id}")
async def get_ragas_session(
    session_id: str,
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """Return RAGAS scores for a specific session."""
    from metrics.ragas_evaluator import get_record
    record = get_record(session_id)
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No RAGAS scores found for this session.")
    return JSONResponse(content=record)


@router.get("/agents/performance")
async def get_agent_performance(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """
    Per-agent latency performance breakdown — Optimisation.

    Returns P50/P95/P99 latency per agent (not just averages).
    Useful for identifying pipeline bottlenecks at the agent level.

    Example response:
      {
        "astrology_agent": { "p50_ms": 120, "p95_ms": 450, "p99_ms": 900, ... },
        "meta_agent":      { "p50_ms": 80,  "p95_ms": 200, "p99_ms": 400, ... },
        "_summary": { "slowest_agent_p95": "astrology_agent", ... }
      }

    Requires ADMIN or SUPERADMIN.
    """
    breakdown = get_collector().per_agent_performance()
    if not breakdown:
        return JSONResponse(content={
            "message": "No pipeline runs recorded yet. Run a few analyses to populate agent metrics.",
            "agents": {}
        })
    return JSONResponse(content=breakdown)


@router.get("/prometheus")
async def get_metrics_prometheus(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> PlainTextResponse:
    """
    Return metrics in Prometheus / OpenMetrics exposition format.
    Suitable for scraping by Grafana, PagerDuty, or any Prometheus-compatible tool.
    Requires ADMIN or SUPERADMIN.
    """
    dashboard = get_collector().dashboard()
    text = dashboard_to_prometheus(dashboard)
    return PlainTextResponse(content=text, media_type="text/plain; version=0.0.4; charset=utf-8")


@router.get("/agent-audit")
async def get_agent_audit_log(
    correlation_id: str = "",
    agent_id: str = "",
    resource_id: str = "",
    status: str = "",
    tenant_id: str = "",
    limit: int = 100,
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """
    Rows of agent_audit_log, newest first: which agent ran which tool on which
    resource, for which user, with what outcome. Filter by correlation_id to see
    everything one request did. Admins see their own tenant only; a superadmin
    can pass tenant_id (or omit it to see every tenant).
    """
    from audit.agent_audit_log import query
    scope = (tenant_id or None) if ctx.is_superadmin() else ctx.tenant_id
    rows = query(tenant_id=scope, correlation_id=correlation_id, agent_id=agent_id,
                 resource_id=resource_id, status=status, limit=limit)
    return JSONResponse(content={"count": len(rows), "rows": rows})


@router.get("/policy-decisions")
async def get_policy_decisions(
    session_id: str = "",
    agent_id: str = "",
    tool_name: str = "",
    outcome: str = "",
    tenant_id: str = "",
    limit: int = 100,
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """
    Rows of the immutable policy_decision_log, newest first: every AgentPolicyGuard
    decision (allow / deny / require_approval / suspend / approval_granted) with
    the five checks and the reasons. Tenant scoping as for /agent-audit.
    """
    from policy.decision_log import query
    scope = (tenant_id or None) if ctx.is_superadmin() else ctx.tenant_id
    rows = query(tenant_id=scope, session_id=session_id, agent_id=agent_id,
                 tool_name=tool_name, outcome=outcome, limit=limit)
    return JSONResponse(content={"count": len(rows), "rows": rows})


@router.get("/policy-decisions/verify")
async def verify_policy_decisions(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """Recompute the hash chain of policy_decision_log (superadmin: it spans every tenant)."""
    if not ctx.is_superadmin():
        raise HTTPException(status_code=403, detail="Only a superadmin can verify the whole log.")
    from policy.decision_log import verify_chain
    return JSONResponse(content=verify_chain())
