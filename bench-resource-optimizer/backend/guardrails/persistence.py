"""
Guardrail Stats Persistence — SQLite WAL-backed counters
=========================================================
Persists G1–G5 aggregate counters to bench.db so they survive uvicorn restarts.

Design:
  - Single table: guardrail_counters(key TEXT PRIMARY KEY, value INTEGER)
  - Keys are flat strings, e.g. "g1_total_allowed", "g3_fence_strip"
  - Loaded once at startup into in-memory accumulators
  - Written periodically (every N increments) or explicitly on shutdown
  - Uses the same bench.db + WAL mode as db.py — no new file needed

What IS persisted (survives restart):
  G1: total_allowed, total_blocked
  G3: total_calls, direct_parse, fence_strip, regex_extract, llm_repair,
       fallback_used, total_failures
  G4: total_checked, total_scrubbed, fields_scrubbed
  G5: per-agent lifetime counts (full/partial/fallback/skipped/failed),
       total_runs

What is NOT persisted (ephemeral by design):
  G1: per-user sliding windows (they expire within 60s anyway)
  G2: circuit breaker state (should reset on restart — don't carry OPEN state)
  G5: recent_runs deque (live feed only, not historical log)
"""
from __future__ import annotations

import logging
from pathlib import Path
from threading import Lock
from typing import Dict

import sqlite3

logger = logging.getLogger("bench.guardrails.persistence")

DB_PATH = Path(__file__).parent.parent / "data" / "bench.db"

_lock = Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_persistence() -> None:
    """Create guardrail_counters table if absent. Call once at startup."""
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS guardrail_counters (
                key   TEXT PRIMARY KEY,
                value INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()
    logger.info('{"event":"guardrail_persistence_init"}')


def load_counters() -> Dict[str, int]:
    """Return all persisted counters as {key: value}. Returns {} on first run."""
    with _connect() as conn:
        rows = conn.execute("SELECT key, value FROM guardrail_counters").fetchall()
    return {row[0]: row[1] for row in rows}


def save_counters(counters: Dict[str, int]) -> None:
    """Upsert all counters atomically. Thread-safe."""
    with _lock:
        with _connect() as conn:
            conn.executemany(
                "INSERT INTO guardrail_counters(key, value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                list(counters.items()),
            )
            conn.commit()
    logger.debug('{"event":"guardrail_counters_saved","count":%d}', len(counters))
