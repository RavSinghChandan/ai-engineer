"""
Graph API — exposes dependency graph analysis for a runbook.
All endpoints are RAGless: pure graph traversal, no vector search.
"""
from fastapi import APIRouter, HTTPException, Query
from database.graph_store import build_and_save_graph, get_graph_analysis, load_graph_from_db
from database.runbooks_store import get_runbook
from graph.dependency_graph import (
    get_execution_order,
    get_parallel_execution_plan,
    get_impact_of_failure,
)

router = APIRouter(prefix="/runbooks/{runbook_id}/graph", tags=["graph"])


def _require_runbook(runbook_id: int):
    if not get_runbook(runbook_id):
        raise HTTPException(status_code=404, detail="Runbook not found")


@router.get("")
def get_graph(runbook_id: int):
    """
    Get the full dependency graph analysis for a runbook.
    Includes topology (nodes + edges), critical path, parallel groups,
    bottleneck steps, and cycle detection.
    Auto-builds the graph if it hasn't been built yet.
    """
    _require_runbook(runbook_id)

    analysis = get_graph_analysis(runbook_id)
    if not analysis:
        try:
            result = build_and_save_graph(runbook_id)
            analysis = get_graph_analysis(runbook_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Graph build failed: {exc}")

    return analysis


@router.post("/rebuild")
def rebuild_graph(runbook_id: int):
    """Force-rebuild the dependency graph (use after manual step edits)."""
    _require_runbook(runbook_id)
    try:
        analysis = build_and_save_graph(runbook_id)
        return {
            "message": "Graph rebuilt successfully",
            "runbook_id": runbook_id,
            "total_steps": analysis.total_steps,
            "total_edges": analysis.total_edges,
            "is_dag": analysis.is_dag,
            "critical_path_length": analysis.critical_path_length,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/execution-order")
def execution_order(runbook_id: int):
    """
    Return steps in safe topological execution order.
    This is deterministic — same input always produces same order.
    Returns 409 if a dependency cycle is detected.
    """
    _require_runbook(runbook_id)
    G = load_graph_from_db(runbook_id)

    try:
        order = get_execution_order(G)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Enrich with step details
    steps_detail = []
    for step_number in order:
        data = G.nodes[step_number]
        steps_detail.append({
            "step_number": step_number,
            "title": data.get("title", ""),
            "commands": data.get("commands", []),
            "timeout_seconds": data.get("timeout_seconds", 60),
            "is_optional": data.get("is_optional", False),
        })

    return {
        "runbook_id": runbook_id,
        "execution_order": order,
        "steps": steps_detail,
        "total": len(order),
    }


@router.get("/parallel-plan")
def parallel_execution_plan(runbook_id: int):
    """
    Return groups of steps that can run in parallel.
    Group 1 runs first, then Group 2 (after all of Group 1 completes), etc.
    This is the key advantage over RAG — RAG cannot determine parallelism.
    """
    _require_runbook(runbook_id)
    G = load_graph_from_db(runbook_id)

    try:
        groups = get_parallel_execution_plan(G)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    plan = []
    for i, group in enumerate(groups, start=1):
        steps_in_group = []
        for step_number in group:
            data = G.nodes[step_number]
            steps_in_group.append({
                "step_number": step_number,
                "title": data.get("title", ""),
                "commands": data.get("commands", []),
            })
        plan.append({
            "wave": i,
            "can_run_in_parallel": len(group) > 1,
            "steps": steps_in_group,
        })

    return {
        "runbook_id": runbook_id,
        "total_waves": len(plan),
        "plan": plan,
    }


@router.get("/impact/{failed_step}")
def failure_impact(runbook_id: int, failed_step: int):
    """
    Given a step that failed, return all downstream steps that are now blocked.
    Critical for incident response — instantly know blast radius of a failure.
    """
    _require_runbook(runbook_id)
    G = load_graph_from_db(runbook_id)

    if not G.has_node(failed_step):
        raise HTTPException(
            status_code=404,
            detail=f"Step {failed_step} not found in runbook {runbook_id}",
        )

    blocked = get_impact_of_failure(G, failed_step)

    blocked_details = []
    for step_number in blocked:
        data = G.nodes[step_number]
        blocked_details.append({
            "step_number": step_number,
            "title": data.get("title", ""),
        })

    return {
        "runbook_id": runbook_id,
        "failed_step": failed_step,
        "blocked_steps_count": len(blocked),
        "blocked_steps": blocked_details,
        "message": (
            f"If step {failed_step} fails, {len(blocked)} downstream step(s) cannot run."
            if blocked else
            f"Step {failed_step} has no downstream dependencies. Failure is isolated."
        ),
    }


@router.get("/topology")
def get_topology(runbook_id: int):
    """
    Return raw graph topology (nodes + edges) for frontend visualization.
    Compatible with D3.js, Cytoscape.js, and React Flow.
    """
    _require_runbook(runbook_id)
    analysis = get_graph_analysis(runbook_id)

    if not analysis:
        analysis_obj = build_and_save_graph(runbook_id)
        return analysis_obj.topology

    return analysis["topology"]
