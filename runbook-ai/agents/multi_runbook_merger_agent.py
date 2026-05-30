"""
Multi-runbook merger.
Given multiple runbooks (one per domain), produces a single composite
execution plan with:
- Correct cross-runbook ordering (domain priority)
- Conflict annotations on dangerous command pairs
- Parallel opportunities across non-conflicting runbooks
- Unified rollback sequence

RAGless: pure graph + SQL operations. No vectors.
"""
from typing import List, Optional
import networkx as nx
from database.runbooks_store import get_runbook
from database.graph_store import load_graph_from_db
from graph.dependency_graph import get_execution_order
from agents.conflict_detector_agent import detect_conflicts


DOMAIN_PRIORITY = {
    "security": 1,
    "networking": 2,
    "database": 3,
    "storage": 4,
    "kubernetes": 5,
    "cicd": 6,
    "monitoring": 7,
    "other": 8,
}


def merge_runbooks(
    runbook_ids: List[int],
    domain_order: Optional[List[str]] = None,
) -> dict:
    """
    Merge multiple runbooks into a single composite execution plan.

    Strategy:
    1. Sort runbooks by domain priority (security first, etc.)
    2. Within each runbook, preserve topological step order
    3. Detect and annotate conflicts
    4. Find parallel opportunities (runbooks with no shared resources)
    5. Build unified rollback sequence (reverse domain order)
    """
    if not runbook_ids:
        return {"error": "No runbook IDs provided"}

    # Load all runbooks
    runbooks = []
    for rb_id in runbook_ids:
        rb = get_runbook(rb_id)
        if rb:
            runbooks.append(rb)

    if not runbooks:
        return {"error": "No valid runbooks found"}

    # Sort by domain priority
    runbooks.sort(key=lambda r: DOMAIN_PRIORITY.get(r.get("category", "other"), 8))

    # Detect conflicts before building plan
    conflicts = detect_conflicts(runbook_ids)
    conflict_commands = _build_conflict_index(conflicts)

    # Build composite execution plan
    composite_steps = []
    runbook_summaries = []
    all_rollback_steps = []
    global_step = 0

    for rb in runbooks:
        rb_id = rb["id"]

        # Get ordered steps via graph traversal
        try:
            G = load_graph_from_db(rb_id)
            order = get_execution_order(G)
            step_map = {s["step_number"]: s for s in rb["steps"]}
            ordered_steps = [step_map[n] for n in order if n in step_map]
        except Exception:
            ordered_steps = sorted(rb["steps"], key=lambda s: s["step_number"])

        rb_start = global_step + 1
        for step in ordered_steps:
            global_step += 1
            cmd_conflicts = []
            for cmd in step.get("commands", []):
                if cmd in conflict_commands:
                    cmd_conflicts.append(conflict_commands[cmd])

            composite_steps.append({
                "global_step": global_step,
                "runbook_id": rb_id,
                "runbook_title": rb["title"],
                "runbook_category": rb["category"],
                "local_step_number": step["step_number"],
                "title": step["title"],
                "description": step["description"],
                "commands": step["commands"],
                "expected_output": step["expected_output"],
                "is_optional": step["is_optional"],
                "timeout_seconds": step["timeout_seconds"],
                "has_conflict": len(cmd_conflicts) > 0,
                "conflicts": cmd_conflicts,
            })

        runbook_summaries.append({
            "runbook_id": rb_id,
            "title": rb["title"],
            "category": rb["category"],
            "severity": rb["severity"],
            "step_count": len(ordered_steps),
            "global_steps": list(range(rb_start, global_step + 1)),
        })

        # Collect rollback steps (reversed per runbook)
        for step in reversed(rb.get("rollback_steps", [])):
            all_rollback_steps.append({
                "runbook_id": rb_id,
                "runbook_title": rb["title"],
                "step_number": step["step_number"],
                "title": step["title"],
                "commands": step["commands"],
            })

    # Find parallel opportunities (runbooks in different domains with no conflicts)
    parallel_opportunities = _find_parallel_opportunities(runbooks, conflicts)

    return {
        "total_runbooks": len(runbooks),
        "total_steps": global_step,
        "has_conflicts": len(conflicts) > 0,
        "conflict_count": len(conflicts),
        "conflicts": conflicts,
        "runbook_summaries": runbook_summaries,
        "composite_steps": composite_steps,
        "parallel_opportunities": parallel_opportunities,
        "rollback_sequence": all_rollback_steps,
        "execution_strategy": _describe_strategy(runbooks, conflicts),
    }


def _build_conflict_index(conflicts: List[dict]) -> dict:
    """Map command strings to their conflict descriptions."""
    index = {}
    for c in conflicts:
        cmd_a = c["runbook_a"]["command"]
        cmd_b = c["runbook_b"]["command"]
        summary = {"severity": c["severity"], "description": c["description"]}
        index[cmd_a] = summary
        index[cmd_b] = summary
    return index


def _find_parallel_opportunities(runbooks: List[dict], conflicts: List[dict]) -> List[dict]:
    """Identify pairs of runbooks that can safely run in parallel."""
    conflict_pairs = set()
    for c in conflicts:
        if c["severity"] in ("HIGH", "CRITICAL"):
            pair = tuple(sorted([c["runbook_a"]["id"], c["runbook_b"]["id"]]))
            conflict_pairs.add(pair)

    opportunities = []
    for i in range(len(runbooks)):
        for j in range(i + 1, len(runbooks)):
            rb_a, rb_b = runbooks[i], runbooks[j]
            pair = tuple(sorted([rb_a["id"], rb_b["id"]]))
            if pair not in conflict_pairs:
                opportunities.append({
                    "runbook_a": {"id": rb_a["id"], "title": rb_a["title"]},
                    "runbook_b": {"id": rb_b["id"], "title": rb_b["title"]},
                    "safe_to_parallelize": True,
                    "note": "No conflicting commands detected between these runbooks",
                })

    return opportunities


def _describe_strategy(runbooks: List[dict], conflicts: List[dict]) -> str:
    domains = [r.get("category", "other") for r in runbooks]
    has_critical = any(c["severity"] == "CRITICAL" for c in conflicts)
    has_high = any(c["severity"] == "HIGH" for c in conflicts)

    if has_critical:
        return "SEQUENTIAL ONLY — critical conflicts detected. Resolve conflicts before executing."
    if has_high:
        return f"Sequential execution recommended across {len(runbooks)} runbooks ({', '.join(domains)}). High-severity conflicts present."
    if len(runbooks) == 1:
        return "Single runbook — standard execution."
    return f"Composite plan across {len(runbooks)} domains ({', '.join(domains)}). No blocking conflicts — parallel execution possible where indicated."
