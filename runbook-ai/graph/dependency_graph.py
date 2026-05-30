"""
RAGless dependency graph engine using NetworkX.
Builds a directed acyclic graph (DAG) from runbook steps.

Key insight: traditional RAG cannot preserve step ordering or detect
dependency cycles. A graph can — and does it in O(V+E) time.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional
import networkx as nx


@dataclass
class GraphNode:
    step_number: int
    title: str
    description: str
    commands: List[str]
    expected_output: str
    is_optional: bool
    timeout_seconds: int
    is_rollback: bool = False


@dataclass
class GraphAnalysis:
    runbook_id: int
    total_steps: int
    total_edges: int
    is_dag: bool                        # True = no cycles, safe to execute
    critical_path: List[int]            # longest dependency chain (step numbers)
    critical_path_length: int
    parallel_groups: List[List[int]]    # steps that can run in parallel
    bottleneck_steps: List[int]         # steps with most dependents
    isolated_steps: List[int]           # steps with no dependencies
    cycle_detected: bool
    cycle_nodes: List[int]
    topology: dict                      # serializable graph for frontend


def build_graph(steps: list[dict]) -> nx.DiGraph:
    """
    Build a directed graph from a list of step dicts.
    Edge: A → B means B depends on A (A must complete before B starts).
    """
    G = nx.DiGraph()

    for step in steps:
        n = step["step_number"]
        G.add_node(
            n,
            title=step.get("title", ""),
            description=step.get("description", ""),
            commands=step.get("commands", []),
            expected_output=step.get("expected_output", ""),
            is_optional=step.get("is_optional", False),
            timeout_seconds=step.get("timeout_seconds", 60),
        )

    for step in steps:
        n = step["step_number"]
        for dep in step.get("depends_on", []):
            if G.has_node(dep):
                G.add_edge(dep, n)  # dep must complete before n

    return G


def analyze_graph(runbook_id: int, G: nx.DiGraph) -> GraphAnalysis:
    """Full analysis of the dependency graph."""
    cycle_detected = not nx.is_directed_acyclic_graph(G)
    cycle_nodes: List[int] = []

    if cycle_detected:
        try:
            cycle = nx.find_cycle(G)
            cycle_nodes = list({n for edge in cycle for n in edge})
        except nx.NetworkXNoCycle:
            cycle_detected = False

    # Critical path — longest path by hop count
    critical_path: List[int] = []
    if not cycle_detected and len(G.nodes) > 0:
        try:
            critical_path = nx.dag_longest_path(G)
        except Exception:
            critical_path = []

    # Parallel groups — topological generations (nodes that can run together)
    parallel_groups: List[List[int]] = []
    if not cycle_detected and len(G.nodes) > 0:
        try:
            parallel_groups = [
                sorted(group)
                for group in nx.topological_generations(G)
            ]
        except Exception:
            parallel_groups = []

    # Bottleneck steps — nodes with highest out-degree (most dependents)
    bottleneck_steps = sorted(
        G.nodes,
        key=lambda n: G.out_degree(n),
        reverse=True,
    )[:3]

    # Isolated steps — no incoming or outgoing edges
    isolated_steps = [
        n for n in G.nodes
        if G.in_degree(n) == 0 and G.out_degree(n) == 0
    ]

    topology = _serialize_topology(G)

    return GraphAnalysis(
        runbook_id=runbook_id,
        total_steps=G.number_of_nodes(),
        total_edges=G.number_of_edges(),
        is_dag=not cycle_detected,
        critical_path=list(critical_path),
        critical_path_length=len(critical_path),
        parallel_groups=parallel_groups,
        bottleneck_steps=list(bottleneck_steps),
        isolated_steps=isolated_steps,
        cycle_detected=cycle_detected,
        cycle_nodes=cycle_nodes,
        topology=topology,
    )


def get_execution_order(G: nx.DiGraph) -> List[int]:
    """
    Return steps in safe execution order (topological sort).
    Raises ValueError if a cycle exists.
    """
    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("Cannot determine execution order: dependency cycle detected")
    return list(nx.topological_sort(G))


def get_parallel_execution_plan(G: nx.DiGraph) -> List[List[int]]:
    """
    Return groups of steps that can run in parallel.
    Each group must complete before the next group starts.
    """
    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("Cannot plan parallel execution: dependency cycle detected")
    return [sorted(group) for group in nx.topological_generations(G)]


def get_impact_of_failure(G: nx.DiGraph, failed_step: int) -> List[int]:
    """
    Given a failed step, return all steps that cannot run as a result.
    Uses graph reachability (descendants).
    """
    if not G.has_node(failed_step):
        return []
    return sorted(nx.descendants(G, failed_step))


def _serialize_topology(G: nx.DiGraph) -> dict:
    """Serialize graph for API response and frontend rendering."""
    nodes = []
    for n in G.nodes:
        data = G.nodes[n]
        nodes.append({
            "id": n,
            "title": data.get("title", ""),
            "commands": data.get("commands", []),
            "is_optional": data.get("is_optional", False),
            "timeout_seconds": data.get("timeout_seconds", 60),
            "in_degree": G.in_degree(n),
            "out_degree": G.out_degree(n),
        })

    edges = [
        {"from": u, "to": v}
        for u, v in G.edges
    ]

    return {"nodes": nodes, "edges": edges}
