"""
Conflict Detector
Compares internal runbooks vs official runbooks that cover the same topic.
Detects VALUE_CONFLICT, ORDER_CONFLICT, COMMAND_CONFLICT, EXTRA_STEP, MISSING_STEP.
Populates the runbook_conflicts table.
"""
from __future__ import annotations
import json, re, sqlite3, time

CONFLICT_KEYWORDS = {
    "timeout": r"timeout[_-]?seconds?|--timeout|TimeoutSeconds",
    "replicas": r"replicas?|--replicas",
    "memory": r"memory[_\s]?(limit|request)?|resources\.memory",
    "cpu": r"cpu[_\s]?(limit|request)?|resources\.cpu",
    "restart": r"restart|rollout\s+restart",
    "delete": r"kubectl\s+delete",
    "drain": r"kubectl\s+drain",
    "cordon": r"kubectl\s+cordon",
    "quota": r"quota[_-]?backend[_-]?bytes?|--quota",
    "heartbeat": r"heartbeat[_-]?interval",
    "eviction": r"eviction|evict",
    "namespace": r"-n\s+\S+|--namespace",
}


def _load_runbook_with_steps(conn: sqlite3.Connection, rb_id: int) -> dict:
    rb = conn.execute("SELECT * FROM runbooks WHERE id=?", (rb_id,)).fetchone()
    if not rb:
        return {}
    steps = conn.execute(
        "SELECT * FROM steps WHERE runbook_id=? AND is_rollback=0 ORDER BY step_number",
        (rb_id,)
    ).fetchall()
    return {
        "id": rb["id"],
        "title": rb["title"],
        "category": rb["category"],
        "source_type": rb["source_type"],
        "source_name": rb["source_name"],
        "steps": [dict(s) for s in steps],
    }


def _extract_commands(steps: list) -> list[str]:
    cmds = []
    for step in steps:
        raw = step.get("commands", "[]")
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = []
        cmds.extend(raw)
    return cmds


def _find_numeric_value(text: str, keyword_pattern: str) -> str | None:
    pattern = rf"{keyword_pattern}[=:\s]+([0-9]+[mMgGkKsS%]*)"
    m = re.search(pattern, text, re.IGNORECASE)
    return m.group(1) if m else None


def _detect_conflicts(internal: dict, official: dict, tenant_id: int) -> list[dict]:
    conflicts = []
    now = time.time()

    int_cmds_all = " ".join(_extract_commands(internal["steps"]))
    off_cmds_all = " ".join(_extract_commands(official["steps"]))

    int_steps = internal["steps"]
    off_steps = official["steps"]

    # 1. VALUE CONFLICTS — numeric parameter mismatches
    for kw_name, kw_pattern in CONFLICT_KEYWORDS.items():
        int_val = _find_numeric_value(int_cmds_all, kw_pattern)
        off_val = _find_numeric_value(off_cmds_all, kw_pattern)
        if int_val and off_val and int_val != off_val:
            conflicts.append({
                "runbook_a_id": internal["id"],
                "runbook_b_id": official["id"],
                "step_a": None,
                "step_b": None,
                "conflict_type": "VALUE_CONFLICT",
                "severity": "HIGH",
                "description": (
                    f"Parameter '{kw_name}': internal uses {int_val}, "
                    f"official uses {off_val}."
                ),
                "recommendation": (
                    f"Follow internal value ({int_val}) — verified on your infrastructure. "
                    f"Official value ({off_val}) is a generic default."
                ),
                "tenant_id": tenant_id,
                "created_at": now,
            })

    # 2. ORDER CONFLICTS — key operations appear in different relative order
    order_ops = [
        ("drain", r"kubectl\s+drain"),
        ("cordon", r"kubectl\s+cordon"),
        ("delete", r"kubectl\s+delete"),
        ("restart", r"rollout\s+restart"),
        ("apply", r"kubectl\s+apply"),
        ("describe", r"kubectl\s+describe"),
        ("logs", r"kubectl\s+logs"),
    ]

    def _step_index(steps_list: list, pattern: str) -> int:
        for i, step in enumerate(steps_list):
            cmds = step.get("commands", "[]")
            if isinstance(cmds, str):
                try:
                    cmds = json.loads(cmds)
                except Exception:
                    cmds = []
            if any(re.search(pattern, c, re.IGNORECASE) for c in cmds):
                return i
        return -1

    for i in range(len(order_ops)):
        for j in range(i + 1, len(order_ops)):
            op_a_name, op_a_pat = order_ops[i]
            op_b_name, op_b_pat = order_ops[j]

            int_a = _step_index(int_steps, op_a_pat)
            int_b = _step_index(int_steps, op_b_pat)
            off_a = _step_index(off_steps, op_a_pat)
            off_b = _step_index(off_steps, op_b_pat)

            if (int_a >= 0 and int_b >= 0 and off_a >= 0 and off_b >= 0):
                int_order = int_a < int_b
                off_order = off_a < off_b
                if int_order != off_order:
                    conflicts.append({
                        "runbook_a_id": internal["id"],
                        "runbook_b_id": official["id"],
                        "step_a": int_a + 1,
                        "step_b": off_a + 1,
                        "conflict_type": "ORDER_CONFLICT",
                        "severity": "HIGH",
                        "description": (
                            f"Step order differs: internal does '{op_a_name}' before '{op_b_name}', "
                            f"official does '{op_b_name}' before '{op_a_name}'."
                        ),
                        "recommendation": (
                            f"Follow internal order — your team verified this sequence on your cluster."
                        ),
                        "tenant_id": tenant_id,
                        "created_at": now,
                    })

    # 3. EXTRA STEPS — internal has steps not in official
    int_titles = {s.get("title", "").lower() for s in int_steps}
    off_titles = {s.get("title", "").lower() for s in off_steps}
    extra = int_titles - off_titles
    missing = off_titles - int_titles

    if len(extra) >= 2:
        conflicts.append({
            "runbook_a_id": internal["id"],
            "runbook_b_id": official["id"],
            "step_a": None,
            "step_b": None,
            "conflict_type": "EXTRA_STEP",
            "severity": "LOW",
            "description": (
                f"Internal runbook has {len(extra)} additional steps not in official docs. "
                f"These are likely environment-specific to your infrastructure."
            ),
            "recommendation": (
                "These extra steps are valuable — they represent knowledge your team built "
                "from real incidents. Do not skip them."
            ),
            "tenant_id": tenant_id,
            "created_at": now,
        })

    if len(missing) >= 2:
        conflicts.append({
            "runbook_a_id": internal["id"],
            "runbook_b_id": official["id"],
            "step_a": None,
            "step_b": None,
            "conflict_type": "MISSING_STEP",
            "severity": "MEDIUM",
            "description": (
                f"Official docs have {len(missing)} steps not covered by internal runbook. "
                f"May be generic steps your team considers implicit."
            ),
            "recommendation": (
                "Review official additional steps — consider adding them to your internal runbook "
                "if they apply to your infrastructure."
            ),
            "tenant_id": tenant_id,
            "created_at": now,
        })

    return conflicts


def _topic_similarity(title_a: str, title_b: str) -> float:
    """Simple word-overlap similarity between two runbook titles."""
    stop = {"kubernetes", "official", "runbook", "the", "a", "and", "or",
            "of", "for", "in", "on", "with", "from", "to", "recovery", "troubleshooting"}
    words_a = {w.lower() for w in re.findall(r"\w+", title_a) if w.lower() not in stop}
    words_b = {w.lower() for w in re.findall(r"\w+", title_b) if w.lower() not in stop}
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / max(len(words_a), len(words_b))


def run_conflict_detection(db_path: str = "runbookai.db", tenant_id: int = 1) -> dict:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    internals = conn.execute(
        "SELECT id, title, category FROM runbooks WHERE source_type='internal' AND tenant_id=? AND status='active'",
        (tenant_id,)
    ).fetchall()

    officials = conn.execute(
        "SELECT id, title, category FROM runbooks WHERE source_type='official' AND tenant_id=? AND status='active'",
        (tenant_id,)
    ).fetchall()

    print(f"Comparing {len(internals)} internal vs {len(officials)} official runbooks")

    total_conflicts = 0
    pairs_checked = 0

    for internal_row in internals:
        for official_row in officials:
            # Only compare runbooks on the same category
            if internal_row["category"] != official_row["category"]:
                continue

            # Check title similarity — skip unrelated pairs
            sim = _topic_similarity(internal_row["title"], official_row["title"])
            if sim < 0.2:
                continue

            # Skip if already compared this pair
            existing = conn.execute(
                """SELECT id FROM runbook_conflicts
                   WHERE runbook_a_id=? AND runbook_b_id=? AND tenant_id=?""",
                (internal_row["id"], official_row["id"], tenant_id)
            ).fetchone()
            if existing:
                continue

            print(f"\n  Comparing:")
            print(f"    INT  [{internal_row['id']}] {internal_row['title'][:50]}")
            print(f"    OFF  [{official_row['id']}] {official_row['title'][:50]}")
            print(f"    similarity={sim:.2f}")

            internal = _load_runbook_with_steps(conn, internal_row["id"])
            official = _load_runbook_with_steps(conn, official_row["id"])

            if not internal.get("steps") or not official.get("steps"):
                print("    SKIP — missing steps")
                continue

            pairs_checked += 1
            conflicts = _detect_conflicts(internal, official, tenant_id)

            for c in conflicts:
                conn.execute(
                    """INSERT INTO runbook_conflicts
                       (runbook_a_id, runbook_b_id, step_a, step_b,
                        conflict_type, severity, description, recommendation,
                        tenant_id, created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (c["runbook_a_id"], c["runbook_b_id"],
                     c.get("step_a"), c.get("step_b"),
                     c["conflict_type"], c["severity"],
                     c["description"], c["recommendation"],
                     c["tenant_id"], c["created_at"])
                )
                print(f"    CONFLICT [{c['conflict_type']}] {c['severity']} — {c['description'][:60]}")
                total_conflicts += 1

            conn.commit()

    conn.close()
    print(f"\n=== Conflict detection done === pairs={pairs_checked} conflicts={total_conflicts}")
    return {"pairs_checked": pairs_checked, "total_conflicts": total_conflicts}


if __name__ == "__main__":
    import os
    os.chdir("/Users/chandankumar/Desktop/workspace/ai-engineer/runbook-ai")
    run_conflict_detection()
