"""
Task ledger — one persisted row per business task.

    with ledger.track("role_mapping", tenant_id=user_id) as t:
        result = run_agent(...)
        t.items = 1                          # units of output produced
        t.set(prompt_tokens=pt, completion_tokens=ct, cost_usd=cost)
        t.set(match_pct=result["match_percentage"])   # any new parameter → attrs_json

Status of a task:
    success   output produced, no agent errors
    degraded  output produced, but something failed and was skipped / fell back
    rejected  input refused on purpose (validation, guardrail, 4xx) — not a system failure
    failed    no usable output (exception, 5xx, empty result)

Writes never raise: metrics must not break a customer's request.
"""
from __future__ import annotations

import contextvars
import functools
import inspect
import json
import logging
import time
import uuid
from contextlib import contextmanager
from typing import Any, Callable, Dict, Iterator, List, Optional

from fde import config, counters

log = logging.getLogger("fde.ledger")

# Typed core columns. Anything else a task records goes into attrs_json.
_CORE = (
    "task_id", "tenant_id", "workflow", "status", "cache_hit", "started_at", "ended_at",
    "duration_ms", "cost_usd", "prompt_tokens", "completion_tokens", "model_calls",
    "retries", "error_count", "error_summary", "items_total", "reviewed", "items_approved",
    "items_rejected", "items_edited", "review_seconds", "review_cost_usd", "attrs_json",
)
_MAX_REVIEW_SECONDS = 4 * 3600   # longer gaps = "left open", not review effort
_ready = False


def _ddl() -> List[str]:
    real = config.REAL_TYPE
    return [
        f"""CREATE TABLE IF NOT EXISTS fde_tasks (
            task_id           TEXT PRIMARY KEY,
            tenant_id         TEXT NOT NULL DEFAULT '',
            workflow          TEXT NOT NULL,
            status            TEXT NOT NULL,
            cache_hit         INTEGER NOT NULL DEFAULT 0,
            started_at        {real} NOT NULL,
            ended_at          {real} NOT NULL,
            duration_ms       {real} NOT NULL DEFAULT 0,
            cost_usd          {real} NOT NULL DEFAULT 0,
            prompt_tokens     INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            model_calls       INTEGER NOT NULL DEFAULT 0,
            retries           INTEGER NOT NULL DEFAULT 0,
            error_count       INTEGER NOT NULL DEFAULT 0,
            error_summary     TEXT NOT NULL DEFAULT '',
            items_total       INTEGER NOT NULL DEFAULT 0,
            reviewed          INTEGER NOT NULL DEFAULT 0,
            items_approved    INTEGER NOT NULL DEFAULT 0,
            items_rejected    INTEGER NOT NULL DEFAULT 0,
            items_edited      INTEGER NOT NULL DEFAULT 0,
            review_seconds    {real} NOT NULL DEFAULT 0,
            review_cost_usd   {real} NOT NULL DEFAULT 0,
            attrs_json        TEXT NOT NULL DEFAULT '{{}}'
        )""",
        "CREATE INDEX IF NOT EXISTS idx_fde_tasks_started ON fde_tasks(started_at)",
        "CREATE INDEX IF NOT EXISTS idx_fde_tasks_tenant ON fde_tasks(tenant_id)",
    ]


def ensure_table() -> bool:
    global _ready
    if _ready:
        return True
    conn = None
    try:
        conn = config.get_conn()
        for stmt in _ddl():
            conn.execute(stmt)
        conn.commit()
        _ready = True
    except Exception as exc:
        log.warning("fde_tasks table unavailable: %s", exc)
    finally:
        if conn is not None:
            conn.close()
    return _ready


def classify(error_count: int, items_total: int, failed: bool = False, rejected: bool = False) -> str:
    if rejected:
        return "rejected"
    if failed or items_total <= 0:
        return "failed"
    return "degraded" if error_count > 0 else "success"


def _cost(prompt_tokens: int, completion_tokens: int, model: Optional[str] = None) -> float:
    price = config.MODEL_PRICING.get(model or config.DEFAULT_MODEL) or {"input": 0.0, "output": 0.0}
    return (prompt_tokens * price["input"] + completion_tokens * price["output"]) / 1_000_000


# ── Write API ─────────────────────────────────────────────────────────────────

def record_task(task_id: str, *, workflow: str, started_at: float, ended_at: float,
                tenant_id: str = "", status: Optional[str] = None, items_total: int = 1,
                error_count: int = 0, errors: Optional[List[Any]] = None,
                failed: bool = False, rejected: bool = False, cache_hit: bool = False,
                prompt_tokens: int = 0, completion_tokens: int = 0,
                cost_usd: Optional[float] = None, model_calls: int = 0, retries: int = 0,
                model: Optional[str] = None, **attrs: Any) -> None:
    """Insert one task row. Unknown keyword arguments are stored in attrs_json."""
    try:
        if not ensure_table():
            return
        status = status or classify(error_count, items_total, failed, rejected)
        if cost_usd is None:
            cost_usd = _cost(prompt_tokens, completion_tokens, model)
        if model:
            attrs.setdefault("model", model)
        values = (
            task_id, tenant_id or "", workflow, status, int(bool(cache_hit)),
            float(started_at), float(ended_at), round(max(0.0, ended_at - started_at) * 1000, 1),
            float(cost_usd), int(prompt_tokens), int(completion_tokens), int(model_calls),
            int(retries), int(error_count), "; ".join(str(e) for e in (errors or []))[:300],
            int(items_total), 0, 0, 0, 0, 0.0, 0.0, json.dumps(attrs, default=str)[:4000],
        )
        conn = config.get_conn()
        try:
            conn.execute(
                f"INSERT INTO fde_tasks ({', '.join(_CORE)}) VALUES ({', '.join('?' * len(_CORE))})",
                values,
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        log.warning("record_task failed for %s: %s", task_id, exc)


def record_review(task_id: str, *, approved: int, rejected: int, edited: int = 0,
                  reviewed_at: Optional[float] = None, review_cost_usd: float = 0.0,
                  **attrs: Any) -> None:
    """Attach the human review step (approve / reject / edit) to an existing task.

    Extra keyword arguments are merged into the task's attrs_json; numeric values
    are added to what the task already recorded (e.g. approvals_requested=1).
    """
    try:
        if not ensure_table():
            return
        reviewed_at = reviewed_at or time.time()
        conn = config.get_conn()
        try:
            row = conn.execute("SELECT ended_at, attrs_json FROM fde_tasks WHERE task_id = ?",
                               (task_id,)).fetchone()
            if row is None:
                return
            gap = min(max(0.0, reviewed_at - float(row[0])), _MAX_REVIEW_SECONDS)
            try:
                merged = json.loads(row[1] or "{}")
            except ValueError:
                merged = {}
            for k, v in attrs.items():
                old_v = merged.get(k)
                both_num = all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (old_v, v))
                merged[k] = old_v + v if both_num else v
            conn.execute(
                "UPDATE fde_tasks SET reviewed = 1, items_approved = ?, items_rejected = ?, "
                "items_edited = ?, review_seconds = ?, review_cost_usd = ?, attrs_json = ? WHERE task_id = ?",
                (int(approved), int(rejected), int(edited), round(gap, 1), float(review_cost_usd),
                 json.dumps(merged, default=str)[:4000], task_id),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        log.warning("record_review failed for %s: %s", task_id, exc)


class TaskHandle:
    """What a `track()` block fills in. Every field is optional."""

    def __init__(self, task_id: str) -> None:
        self.task_id = task_id
        self.items = 1
        self.errors: List[Any] = []
        self.cache_hit = False
        self.status: Optional[str] = None
        self.fields: Dict[str, Any] = {}

    def set(self, **fields: Any) -> "TaskHandle":
        self.fields.update(fields)
        return self

    def error(self, err: Any) -> None:
        """Record a non-fatal error (the task still produced output → degraded)."""
        self.errors.append(err)


_current = contextvars.ContextVar("fde_task", default=None)  # Optional[TaskHandle]


def current() -> "TaskHandle":
    """The task being tracked in this request (a throwaway handle if none)."""
    return _current.get() or TaskHandle("untracked")


@contextmanager
def track(workflow: str, *, tenant_id: str = "", task_id: Optional[str] = None,
          reset_counters: bool = True) -> Iterator[TaskHandle]:
    """Time a task, classify its outcome (including exceptions) and record it.

    Exceptions are re-raised unchanged — tracking never alters behaviour.
    """
    handle = TaskHandle(task_id or uuid.uuid4().hex)
    if reset_counters:
        counters.reset()
    t0 = time.time()
    failed = rejected = False
    token = _current.set(handle)
    try:
        yield handle
    except BaseException as exc:
        handle.errors.append(f"{type(exc).__name__}: {exc}")
        if config.is_client_error(exc):
            rejected = True
        else:
            failed = True
        raise
    finally:
        _current.reset(token)
        c = counters.snapshot()
        f = {**config.collect_usage(), **handle.fields}
        record_task(
            handle.task_id, workflow=workflow, tenant_id=tenant_id,
            started_at=t0, ended_at=time.time(), status=handle.status,
            items_total=0 if failed else handle.items,
            error_count=len(handle.errors), errors=handle.errors,
            failed=failed, rejected=rejected, cache_hit=handle.cache_hit,
            model_calls=int(f.pop("model_calls", c.get("model_calls", 0))),
            retries=int(f.pop("retries", c.get("retries", 0))),
            permission_checks=int(c.get("permission_checks", 0)),
            permission_denials=int(c.get("permission_denials", 0)),
            approvals_requested=int(c.get("approvals_requested", 0)),
            **f,
        )


def _resolved_signature(fn: Callable) -> inspect.Signature:
    """Signature with string annotations evaluated in fn's module (Python 3.9-safe).

    Evaluates each annotation as written — unlike typing.get_type_hints it does not
    wrap `= None` defaults in Optional[], which would hide Annotated[..., Depends()].
    """
    sig = inspect.signature(fn)
    ns = getattr(fn, "__globals__", {})

    def ev(a):
        if isinstance(a, str):
            try:
                return eval(a, ns)  # noqa: S307 - annotation text from our own source
            except Exception:
                return a
        return a

    params = [p.replace(annotation=ev(p.annotation)) for p in sig.parameters.values()]
    return sig.replace(parameters=params, return_annotation=ev(sig.return_annotation))


def tracked(workflow: str, tenant_from: Optional[Callable[..., str]] = None):
    """Decorator for async endpoints: `@tracked("role_mapping")`.

    The endpoint body can enrich the row with `ledger.current().set(...)`,
    `.cache_hit = True`, `.items = n` or `.error(...)`. Signature is preserved
    (FastAPI reads it through functools.wraps).
    """
    def deco(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            tenant = ""
            if tenant_from:
                try:
                    tenant = tenant_from(*args, **kwargs) or ""
                except Exception:
                    tenant = ""
            with track(workflow, tenant_id=tenant):
                return await fn(*args, **kwargs)
        # Resolve string annotations (from __future__ import annotations) against the
        # endpoint's own module, so FastAPI doesn't look them up in this one.
        wrapper.__signature__ = _resolved_signature(fn)
        return wrapper
    return deco


# ── Read API ──────────────────────────────────────────────────────────────────

def fetch(since: float, tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Rows since a timestamp, newest first, with attrs merged in (core fields win)."""
    if not ensure_table():
        return []
    sql = f"SELECT {', '.join(_CORE)} FROM fde_tasks WHERE started_at >= ?"
    params: tuple = (since,)
    if tenant_id:
        sql += " AND tenant_id = ?"
        params += (tenant_id,)
    sql += " ORDER BY started_at DESC"
    conn = config.get_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        d = dict(zip(_CORE, tuple(r)))
        try:
            attrs = json.loads(d.pop("attrs_json") or "{}")
        except ValueError:
            attrs = {}
        out.append({**attrs, **d})
    return out
