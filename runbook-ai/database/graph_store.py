"""
Persists graph analysis results and rebuilds NetworkX graphs from stored steps.
"""
import json
import time
from typing import Optional
import networkx as nx
from database.db import get_conn
from graph.dependency_graph import build_graph, analyze_graph, GraphAnalysis


CREATE_GRAPH_ANALYSES = """
CREATE TABLE IF NOT EXISTS graph_analyses (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    runbook_id            INTEGER NOT NULL UNIQUE REFERENCES runbooks(id) ON DELETE CASCADE,
    total_steps           INTEGER NOT NULL DEFAULT 0,
    total_edges           INTEGER NOT NULL DEFAULT 0,
    is_dag                INTEGER NOT NULL DEFAULT 1,
    critical_path         TEXT    NOT NULL DEFAULT '[]',
    critical_path_length  INTEGER NOT NULL DEFAULT 0,
    parallel_groups       TEXT    NOT NULL DEFAULT '[]',
    bottleneck_steps      TEXT    NOT NULL DEFAULT '[]',
    isolated_steps        TEXT    NOT NULL DEFAULT '[]',
    cycle_detected        INTEGER NOT NULL DEFAULT 0,
    cycle_nodes           TEXT    NOT NULL DEFAULT '[]',
    topology              TEXT    NOT NULL DEFAULT '{}',
    created_at            REAL    NOT NULL,
    updated_at            REAL    NOT NULL
);
"""


def ensure_graph_table() -> None:
    with get_conn() as conn:
        conn.execute(CREATE_GRAPH_ANALYSES)
        conn.commit()


def build_and_save_graph(runbook_id: int) -> GraphAnalysis:
    """Load steps from DB, build graph, run analysis, persist results."""
    ensure_graph_table()

    with get_conn() as conn:
        rows = conn.execute(
            """SELECT step_number, title, description, commands,
                      expected_output, depends_on, is_optional, timeout_seconds
               FROM steps
               WHERE runbook_id=? AND is_rollback=0
               ORDER BY step_number""",
            (runbook_id,),
        ).fetchall()

    steps = []
    for row in rows:
        s = dict(row)
        s["commands"] = json.loads(s["commands"])
        s["depends_on"] = json.loads(s["depends_on"])
        s["is_optional"] = bool(s["is_optional"])
        steps.append(s)

    G = build_graph(steps)
    analysis = analyze_graph(runbook_id, G)
    _persist_analysis(analysis)
    return analysis


def get_graph_analysis(runbook_id: int) -> Optional[dict]:
    """Return persisted graph analysis for a runbook."""
    ensure_graph_table()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM graph_analyses WHERE runbook_id=?",
            (runbook_id,),
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        for field in ("critical_path", "parallel_groups", "bottleneck_steps",
                      "isolated_steps", "cycle_nodes"):
            result[field] = json.loads(result[field])
        result["topology"] = json.loads(result["topology"])
        result["is_dag"] = bool(result["is_dag"])
        result["cycle_detected"] = bool(result["cycle_detected"])
        return result


def load_graph_from_db(runbook_id: int) -> nx.DiGraph:
    """Rebuild a live NetworkX graph from stored steps."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT step_number, title, description, commands,
                      expected_output, depends_on, is_optional, timeout_seconds
               FROM steps WHERE runbook_id=? AND is_rollback=0
               ORDER BY step_number""",
            (runbook_id,),
        ).fetchall()

    steps = []
    for row in rows:
        s = dict(row)
        s["commands"] = json.loads(s["commands"])
        s["depends_on"] = json.loads(s["depends_on"])
        s["is_optional"] = bool(s["is_optional"])
        steps.append(s)

    return build_graph(steps)


def _persist_analysis(analysis: GraphAnalysis) -> None:
    now = time.time()
    ensure_graph_table()
    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO graph_analyses
               (runbook_id, total_steps, total_edges, is_dag,
                critical_path, critical_path_length, parallel_groups,
                bottleneck_steps, isolated_steps, cycle_detected,
                cycle_nodes, topology, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis.runbook_id,
                analysis.total_steps,
                analysis.total_edges,
                1 if analysis.is_dag else 0,
                json.dumps(analysis.critical_path),
                analysis.critical_path_length,
                json.dumps(analysis.parallel_groups),
                json.dumps(analysis.bottleneck_steps),
                json.dumps(analysis.isolated_steps),
                1 if analysis.cycle_detected else 0,
                json.dumps(analysis.cycle_nodes),
                json.dumps(analysis.topology),
                now, now,
            ),
        )
        conn.commit()
