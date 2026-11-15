"""
AuditService — execution records written OUTSIDE the application database.

The app already keeps two audit tables in its own database: agent_audit_log
(what each agent did) and policy_decision_log (every guard decision, hash-chained).
Both live in the same database the application can write to, so anyone with the
app's database credentials can also rewrite its history. An auditor asks: "where
is the record the application itself can't change?"

This service copies every execution record to a separate sink, as it happens:

    agent node runs            ─┐
    permission decision         ├─► emit() ─► sink (append only, hash-chained)
    policy guard decision       │
    credential issue/use/revoke ─┘

Sinks, chosen by AUDIT_SINK:
    jsonl (default)   one JSON line per record, each carrying prev_hash and
                      record_hash, fsynced; verify_jsonl() proves nothing was
                      edited or removed. Path: AUDIT_EXTERNAL_PATH.
    http              POST each record to AUDIT_SINK_URL from a background
                      thread (a slow collector never slows a request). For a
                      log collector, Cloud Logging, or a Pub/Sub push endpoint.
    none              off (tests that don't care about it).

In production the JSONL file should be on storage the app can only append to
(a GCS bucket with a retention lock, or the http sink to a collector in another
project). A file on the same disk shows the record format and the chain; it is
not "external" by itself.

emit() never raises: a failed audit write must not fail the user's request.
Failures are counted (audit_external_failures) and logged, so a broken sink is
visible on /metrics instead of silently losing records.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import logging
import os
import queue
import threading
import time
import urllib.request
import uuid
from typing import Any, Dict, List, Mapping, Optional, Protocol

from fde import counters

log = logging.getLogger("audit.service")

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PATH = os.path.join(_HERE, "audit_records", "execution_records.jsonl")


def record_hash(prev_hash: str, record: Mapping[str, Any]) -> str:
    body = json.dumps(record, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256((prev_hash + body).encode()).hexdigest()


class AuditSink(Protocol):
    def write(self, record: Dict[str, Any]) -> None: ...


class NullSink:
    def write(self, record: Dict[str, Any]) -> None:
        return None


class MemorySink:
    """Keeps records in a list. For tests and local inspection."""

    def __init__(self) -> None:
        self.records: List[Dict[str, Any]] = []

    def write(self, record: Dict[str, Any]) -> None:
        self.records.append(record)


class JsonlSink:
    """Append-only, hash-chained JSON lines.

    Several processes may write the same file (uvicorn --workers N, the queue consumer),
    so every write takes an exclusive file lock and reads the previous hash from the
    file itself, under that lock. A per-process "last hash" would fork the chain.
    """

    def __init__(self, path: str) -> None:
        self.path = path
        self._lock = threading.Lock()

    @staticmethod
    def _tail_hash(f) -> str:
        """record_hash of the last line, reading backwards from the end of the file."""
        f.seek(0, os.SEEK_END)
        end = f.tell()
        pos, chunk, buf = end, 4096, b""
        while pos > 0:
            step = min(chunk, pos)
            pos -= step
            f.seek(pos)
            buf = f.read(step) + buf
            lines = [l for l in buf.split(b"\n") if l.strip()]
            if len(lines) >= 2 or (pos == 0 and lines):
                return json.loads(lines[-1])["record_hash"]
        return ""

    def write(self, record: Dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with self._lock, open(self.path, "a+b") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                prev = self._tail_hash(f)
                stored = {**record, "prev_hash": prev}
                stored["record_hash"] = record_hash(prev, stored)
                f.seek(0, os.SEEK_END)
                f.write((json.dumps(stored, sort_keys=True, default=str) + "\n").encode("utf-8"))
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)


class HttpSink:
    """POSTs each record from a background thread. A full queue drops and counts."""

    def __init__(self, url: str, timeout: float = 3.0, max_queue: int = 10_000) -> None:
        self.url = url
        self.timeout = timeout
        self._q: "queue.Queue[Dict[str, Any]]" = queue.Queue(maxsize=max_queue)
        threading.Thread(target=self._run, name="audit-http-sink", daemon=True).start()

    def write(self, record: Dict[str, Any]) -> None:
        try:
            self._q.put_nowait(record)
        except queue.Full:
            counters.incr("audit_external_dropped")

    def _run(self) -> None:
        while True:
            record = self._q.get()
            try:
                req = urllib.request.Request(self.url, data=json.dumps(record, default=str).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=self.timeout):
                    pass
            except Exception as exc:  # noqa: BLE001
                counters.incr("audit_external_failures")
                log.warning("audit http sink failed: %s", exc)


def verify_jsonl(path: str) -> Dict[str, Any]:
    """Recompute the chain. Returns {"ok", "records", "broken_at"} (broken_at = 1-based line)."""
    prev = ""
    n = 0
    if not os.path.exists(path):
        return {"ok": True, "records": 0, "broken_at": None}
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate((l for l in f if l.strip()), start=1):
            stored = json.loads(line)
            claimed = stored.pop("record_hash", "")
            if stored.get("prev_hash") != prev or record_hash(prev, stored) != claimed:
                return {"ok": False, "records": n, "broken_at": n}
            prev = claimed
    return {"ok": True, "records": n, "broken_at": None}


def _sink_from_env() -> AuditSink:
    kind = os.environ.get("AUDIT_SINK", "jsonl").lower()
    if kind == "none":
        return NullSink()
    if kind == "http":
        url = os.environ.get("AUDIT_SINK_URL", "")
        if url:
            return HttpSink(url)
        log.warning("AUDIT_SINK=http without AUDIT_SINK_URL; falling back to jsonl")
    return JsonlSink(os.environ.get("AUDIT_EXTERNAL_PATH", DEFAULT_PATH))


_sink: Optional[AuditSink] = None
_sink_lock = threading.Lock()


def get_sink() -> AuditSink:
    global _sink
    if _sink is None:
        with _sink_lock:
            if _sink is None:
                _sink = _sink_from_env()
    return _sink


def set_sink(sink: Optional[AuditSink]) -> None:
    """Replace the sink (None = rebuild from the environment on next use)."""
    global _sink
    _sink = sink


def emit(source: str, action: str, status: str, *, agent_id: str = "", tool_name: str = "",
         session_id: str = "", user_id: Optional[str] = None, tenant_id: Optional[str] = None,
         correlation_id: Optional[str] = None, detail: Optional[Mapping[str, Any]] = None) -> None:
    """Write one execution record to the external sink. Unset who/where fields come from the audit context."""
    try:
        from audit.agent_audit_log import current_context
        ctx = current_context()
        record = {
            "record_id": uuid.uuid4().hex,
            "timestamp": round(time.time(), 6),
            "source": source,
            "action": action,
            "status": status,
            "agent_id": agent_id,
            "tool_name": tool_name,
            "session_id": session_id or ctx.resource_id,
            "user_id": ctx.user_id if user_id is None else user_id,
            "tenant_id": ctx.tenant_id if tenant_id is None else tenant_id,
            "correlation_id": ctx.correlation_id if correlation_id is None else correlation_id,
            "detail": dict(detail or {}),
        }
        get_sink().write(record)
        counters.incr("audit_external_records")
    except Exception as exc:  # noqa: BLE001 — auditing must not fail the request
        counters.incr("audit_external_failures")
        log.warning("external audit record %s/%s not written: %s", source, action, exc)
