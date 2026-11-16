"""
DbCheckpointSaver — LangGraph checkpoints stored in the AstroIntel database.

LangGraph's own SQLite/Postgres savers are separate packages; this one goes through
database._tx() instead, so checkpoints live next to the task rows, use the same
backend (SQLite locally, PostgreSQL in the cloud) and survive a process restart.

LangGraph calls put() after every super-step (one node in this pipeline) and
put_writes() for a node's output before the next checkpoint exists. Resuming a
thread = invoking the graph with input None: LangGraph loads the latest checkpoint
and runs only the nodes that had not finished.

Layout mirrors InMemorySaver:
  workflow_checkpoints        one row per checkpoint (channel values stored separately)
  workflow_checkpoint_blobs   one row per (channel, version); versions never change
  workflow_checkpoint_writes  pending writes of nodes that finished after the checkpoint
"""
from __future__ import annotations

import random
from typing import Any, Dict, Iterator, Optional, Sequence, Tuple

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    get_checkpoint_id,
    get_checkpoint_metadata,
)

import database as _db

CHECKPOINTS = "workflow_checkpoints"
BLOBS = "workflow_checkpoint_blobs"
WRITES = "workflow_checkpoint_writes"


def _ddl() -> str:
    blob = "BYTEA" if _db._USE_PG else "BLOB"
    return f"""
CREATE TABLE IF NOT EXISTS {CHECKPOINTS} (
    thread_id      TEXT NOT NULL,
    checkpoint_ns  TEXT NOT NULL DEFAULT '',
    checkpoint_id  TEXT NOT NULL,
    parent_id      TEXT,
    type           TEXT NOT NULL,
    checkpoint     {blob} NOT NULL,
    metadata_type  TEXT NOT NULL,
    metadata       {blob} NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
CREATE TABLE IF NOT EXISTS {BLOBS} (
    thread_id      TEXT NOT NULL,
    checkpoint_ns  TEXT NOT NULL DEFAULT '',
    channel        TEXT NOT NULL,
    version        TEXT NOT NULL,
    type           TEXT NOT NULL,
    blob           {blob},
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
CREATE TABLE IF NOT EXISTS {WRITES} (
    thread_id      TEXT NOT NULL,
    checkpoint_ns  TEXT NOT NULL DEFAULT '',
    checkpoint_id  TEXT NOT NULL,
    task_id        TEXT NOT NULL,
    idx            INTEGER NOT NULL,
    channel        TEXT NOT NULL,
    type           TEXT NOT NULL,
    blob           {blob},
    task_path      TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
"""


def init_tables() -> None:
    """Idempotent — safe to call on every startup."""
    with _db._tx() as conn:
        if _db._USE_PG:
            conn.cursor().execute(_ddl())
        else:
            conn.executescript(_ddl())


def _bytes(value: Any) -> bytes:
    # psycopg2 returns BYTEA as memoryview
    return bytes(value) if value is not None else b""


class DbCheckpointSaver(BaseCheckpointSaver[str]):
    """Synchronous checkpointer; the pipeline is run with graph.invoke() in a worker thread."""

    # ── reads ────────────────────────────────────────────────────────────────

    def _load_blobs(self, conn, thread_id: str, ns: str, versions: ChannelVersions) -> Dict[str, Any]:
        values: Dict[str, Any] = {}
        for channel, version in versions.items():
            row = conn.execute(
                f"SELECT type, blob FROM {BLOBS} WHERE thread_id=? AND checkpoint_ns=? "
                f"AND channel=? AND version=?",
                (thread_id, ns, channel, str(version)),
            ).fetchone()
            if row and row[0] != "empty":
                values[channel] = self.serde.loads_typed((row[0], _bytes(row[1])))
        return values

    def _tuple(self, conn, row) -> CheckpointTuple:
        thread_id, ns, checkpoint_id, parent_id = row[0], row[1], row[2], row[3]
        checkpoint: Checkpoint = self.serde.loads_typed((row[4], _bytes(row[5])))
        writes = conn.execute(
            f"SELECT task_id, channel, type, blob FROM {WRITES} WHERE thread_id=? "
            f"AND checkpoint_ns=? AND checkpoint_id=? ORDER BY task_id, idx",
            (thread_id, ns, checkpoint_id),
        ).fetchall()
        return CheckpointTuple(
            config={"configurable": {"thread_id": thread_id, "checkpoint_ns": ns,
                                     "checkpoint_id": checkpoint_id}},
            checkpoint={
                **checkpoint,
                "channel_values": self._load_blobs(conn, thread_id, ns,
                                                   checkpoint["channel_versions"]),
            },
            metadata=self.serde.loads_typed((row[6], _bytes(row[7]))),
            parent_config=(
                {"configurable": {"thread_id": thread_id, "checkpoint_ns": ns,
                                  "checkpoint_id": parent_id}}
                if parent_id else None
            ),
            pending_writes=[(w[0], w[1], self.serde.loads_typed((w[2], _bytes(w[3]))))
                            for w in writes],
        )

    _SELECT = (f"SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, type, checkpoint, "
               f"metadata_type, metadata FROM {CHECKPOINTS}")

    def get_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        with _db._tx() as conn:
            if checkpoint_id := get_checkpoint_id(config):
                row = conn.execute(
                    f"{self._SELECT} WHERE thread_id=? AND checkpoint_ns=? AND checkpoint_id=?",
                    (thread_id, ns, checkpoint_id),
                ).fetchone()
            else:
                # checkpoint ids are time-ordered (uuid6), so the largest is the latest
                row = conn.execute(
                    f"{self._SELECT} WHERE thread_id=? AND checkpoint_ns=? "
                    f"ORDER BY checkpoint_id DESC LIMIT 1",
                    (thread_id, ns),
                ).fetchone()
            return self._tuple(conn, row) if row else None

    def list(
        self,
        config: Optional[RunnableConfig],
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
    ) -> Iterator[CheckpointTuple]:
        sql, params = f"{self._SELECT} WHERE 1=1", []
        if config:
            sql += " AND thread_id=?"
            params.append(config["configurable"]["thread_id"])
            if (ns := config["configurable"].get("checkpoint_ns")) is not None:
                sql += " AND checkpoint_ns=?"
                params.append(ns)
            if checkpoint_id := get_checkpoint_id(config):
                sql += " AND checkpoint_id=?"
                params.append(checkpoint_id)
        if before and (before_id := get_checkpoint_id(before)):
            sql += " AND checkpoint_id<?"
            params.append(before_id)
        sql += " ORDER BY checkpoint_id DESC"
        with _db._tx() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
            found = []
            for row in rows:
                item = self._tuple(conn, row)
                if filter and not all(item.metadata.get(k) == v for k, v in filter.items()):
                    continue
                found.append(item)
                if limit is not None and len(found) >= limit:
                    break
        yield from found

    # ── writes ───────────────────────────────────────────────────────────────

    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        c = checkpoint.copy()
        values: Dict[str, Any] = c.pop("channel_values")  # type: ignore[misc]
        ctype, cblob = self.serde.dumps_typed(c)
        mtype, mblob = self.serde.dumps_typed(get_checkpoint_metadata(config, metadata))
        with _db._tx() as conn:
            for channel, version in new_versions.items():
                btype, bblob = (self.serde.dumps_typed(values[channel])
                                if channel in values else ("empty", b""))
                conn.execute(
                    f"INSERT OR IGNORE INTO {BLOBS} (thread_id, checkpoint_ns, channel, version, "
                    f"type, blob) VALUES (?, ?, ?, ?, ?, ?)",
                    (thread_id, ns, channel, str(version), btype, bblob),
                )
            conn.execute(
                f"INSERT OR IGNORE INTO {CHECKPOINTS} (thread_id, checkpoint_ns, checkpoint_id, "
                f"parent_id, type, checkpoint, metadata_type, metadata) "
                f"VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (thread_id, ns, checkpoint["id"], config["configurable"].get("checkpoint_id"),
                 ctype, cblob, mtype, mblob),
            )
        return {"configurable": {"thread_id": thread_id, "checkpoint_ns": ns,
                                 "checkpoint_id": checkpoint["id"]}}

    def put_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[Tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]
        with _db._tx() as conn:
            for i, (channel, value) in enumerate(writes):
                idx = WRITES_IDX_MAP.get(channel, i)
                wtype, wblob = self.serde.dumps_typed(value)
                key = (thread_id, ns, checkpoint_id, task_id, idx)
                if idx < 0:
                    # special writes (error, interrupt, resume) replace the previous one
                    conn.execute(
                        f"DELETE FROM {WRITES} WHERE thread_id=? AND checkpoint_ns=? "
                        f"AND checkpoint_id=? AND task_id=? AND idx=?", key)
                conn.execute(
                    f"INSERT OR IGNORE INTO {WRITES} (thread_id, checkpoint_ns, checkpoint_id, "
                    f"task_id, idx, channel, type, blob, task_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (*key, channel, wtype, wblob, task_path),
                )

    def delete_thread(self, thread_id: str) -> None:
        with _db._tx() as conn:
            for table in (CHECKPOINTS, BLOBS, WRITES):
                conn.execute(f"DELETE FROM {table} WHERE thread_id=?", (thread_id,))

    def count(self, thread_id: str) -> int:
        with _db._tx() as conn:
            return conn.execute(f"SELECT COUNT(*) FROM {CHECKPOINTS} WHERE thread_id=?",
                                (thread_id,)).fetchone()[0]

    def get_next_version(self, current: Optional[str], channel: None) -> str:
        if current is None:
            current_v = 0
        elif isinstance(current, int):
            current_v = current
        else:
            current_v = int(current.split(".")[0])
        return f"{current_v + 1:032}.{random.random():016}"
