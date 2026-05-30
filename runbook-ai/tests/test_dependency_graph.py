"""
Tests for the RAGless dependency graph engine.
Covers: graph construction, cycle detection, critical path,
parallel groups, failure impact, execution order.
"""
import pytest
from graph.dependency_graph import (
    build_graph,
    analyze_graph,
    get_execution_order,
    get_parallel_execution_plan,
    get_impact_of_failure,
)


def _steps(spec: list[tuple]) -> list[dict]:
    """
    Build step dicts from (step_number, depends_on) tuples.
    Example: [(1, []), (2, [1]), (3, [1]), (4, [2, 3])]
    """
    return [
        {
            "step_number": n,
            "title": f"Step {n}",
            "description": "",
            "commands": [f"cmd_{n}"],
            "expected_output": "",
            "depends_on": deps,
            "is_optional": False,
            "timeout_seconds": 30,
        }
        for n, deps in spec
    ]


# ── build_graph ─────────────────────────────────────────────────

def test_build_graph_nodes():
    steps = _steps([(1, []), (2, [1]), (3, [2])])
    G = build_graph(steps)
    assert set(G.nodes) == {1, 2, 3}


def test_build_graph_edges():
    steps = _steps([(1, []), (2, [1]), (3, [1])])
    G = build_graph(steps)
    assert G.has_edge(1, 2)
    assert G.has_edge(1, 3)
    assert not G.has_edge(2, 3)


def test_build_graph_ignores_unknown_deps():
    # Step 2 depends on step 99 which doesn't exist
    steps = _steps([(1, []), (2, [99])])
    G = build_graph(steps)
    assert G.number_of_edges() == 0


def test_build_graph_empty():
    G = build_graph([])
    assert G.number_of_nodes() == 0


# ── analyze_graph ────────────────────────────────────────────────

def test_analyze_linear_chain():
    # 1 → 2 → 3 → 4
    steps = _steps([(1, []), (2, [1]), (3, [2]), (4, [3])])
    G = build_graph(steps)
    analysis = analyze_graph(1, G)

    assert analysis.is_dag is True
    assert analysis.cycle_detected is False
    assert analysis.total_steps == 4
    assert analysis.total_edges == 3
    assert analysis.critical_path == [1, 2, 3, 4]
    assert analysis.critical_path_length == 4


def test_analyze_diamond_graph():
    #     1
    #    / \
    #   2   3
    #    \ /
    #     4
    steps = _steps([(1, []), (2, [1]), (3, [1]), (4, [2, 3])])
    G = build_graph(steps)
    analysis = analyze_graph(1, G)

    assert analysis.is_dag is True
    assert analysis.total_steps == 4
    assert analysis.total_edges == 4
    # Parallel group 2 should contain both 2 and 3
    assert any(set(g) == {2, 3} for g in analysis.parallel_groups)


def test_analyze_isolated_steps():
    # Steps 1 and 2 have no edges between them
    steps = _steps([(1, []), (2, []), (3, [])])
    G = build_graph(steps)
    analysis = analyze_graph(1, G)

    assert set(analysis.isolated_steps) == {1, 2, 3}


def test_analyze_topology_structure():
    steps = _steps([(1, []), (2, [1])])
    G = build_graph(steps)
    analysis = analyze_graph(1, G)

    topo = analysis.topology
    assert "nodes" in topo
    assert "edges" in topo
    assert len(topo["nodes"]) == 2
    assert len(topo["edges"]) == 1
    assert topo["edges"][0] == {"from": 1, "to": 2}


# ── execution order ──────────────────────────────────────────────

def test_execution_order_linear():
    steps = _steps([(1, []), (2, [1]), (3, [2])])
    G = build_graph(steps)
    order = get_execution_order(G)
    assert order == [1, 2, 3]


def test_execution_order_respects_dependencies():
    steps = _steps([(1, []), (2, [1]), (3, [1]), (4, [2, 3])])
    G = build_graph(steps)
    order = get_execution_order(G)

    # 1 must come before 2 and 3; 2 and 3 before 4
    assert order.index(1) < order.index(2)
    assert order.index(1) < order.index(3)
    assert order.index(2) < order.index(4)
    assert order.index(3) < order.index(4)


# ── parallel execution plan ──────────────────────────────────────

def test_parallel_plan_diamond():
    steps = _steps([(1, []), (2, [1]), (3, [1]), (4, [2, 3])])
    G = build_graph(steps)
    groups = get_parallel_execution_plan(G)

    assert groups[0] == [1]
    assert set(groups[1]) == {2, 3}
    assert groups[2] == [4]


def test_parallel_plan_single_chain():
    steps = _steps([(1, []), (2, [1]), (3, [2])])
    G = build_graph(steps)
    groups = get_parallel_execution_plan(G)

    # No parallelism — each group has 1 step
    assert all(len(g) == 1 for g in groups)
    assert len(groups) == 3


def test_parallel_plan_all_independent():
    steps = _steps([(1, []), (2, []), (3, [])])
    G = build_graph(steps)
    groups = get_parallel_execution_plan(G)

    # All 3 can run in parallel
    assert len(groups) == 1
    assert set(groups[0]) == {1, 2, 3}


# ── failure impact ───────────────────────────────────────────────

def test_failure_impact_linear():
    # 1 → 2 → 3 → 4: if step 2 fails, 3 and 4 are blocked
    steps = _steps([(1, []), (2, [1]), (3, [2]), (4, [3])])
    G = build_graph(steps)
    blocked = get_impact_of_failure(G, 2)
    assert set(blocked) == {3, 4}


def test_failure_impact_root():
    steps = _steps([(1, []), (2, [1]), (3, [1]), (4, [2, 3])])
    G = build_graph(steps)
    blocked = get_impact_of_failure(G, 1)
    assert set(blocked) == {2, 3, 4}


def test_failure_impact_leaf():
    steps = _steps([(1, []), (2, [1]), (3, [2])])
    G = build_graph(steps)
    # Step 3 is a leaf — no dependents
    blocked = get_impact_of_failure(G, 3)
    assert blocked == []


def test_failure_impact_unknown_step():
    steps = _steps([(1, []), (2, [1])])
    G = build_graph(steps)
    assert get_impact_of_failure(G, 99) == []
