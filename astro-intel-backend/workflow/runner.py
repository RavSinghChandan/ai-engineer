"""
workflow.runner — run the 360° pipeline as a durable, resumable workflow.

The graph is the same agent pipeline (graph.pipeline.PIPELINE_STEPS) plus two steps:

    persona_injection → … → grammar_agent → approval_gate → deliver → END

  · every step is checkpointed by DbCheckpointSaver, so a restarted process resumes the
    task from the last finished step instead of starting over
  · approval_gate pauses the task in WAITING_FOR_APPROVAL (LangGraph interrupt) when the
    request asked for a human sign-off; approve()/reject() resume it, from any process
  · deliver performs the external side effects through store.run_once(), keyed
    "<task_id>:<effect>", so a re-run after a crash never saves or sends twice

Retry limits:
  · a task is claimed at most max_attempts times (WORKFLOW_TASK_MAX_ATTEMPTS); a crash
    uses up an attempt, so a step that kills the process every time ends in FAILED
  · a step may start at most WORKFLOW_STEP_MAX_ATTEMPTS times across all attempts
  · retryable errors go back to PENDING with exponential backoff; SecurityError and
    retry-limit errors fail at once

Crash recovery: a RUNNING task holds a lease that every step renews. When the process
dies the lease runs out and recover() (on startup and every WORKFLOW_RECOVERY_INTERVAL
seconds) claims the task again. A worker that lost its lease stops at its next step.
WORKFLOW_RECOVERY_ENABLED=false turns the background sweep off (the test suite does).
"""
from __future__ import annotations

import logging
import os
import socket
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.types import Command, interrupt

from guardrails.security import SecurityError
from workflow import store
from workflow.checkpointer import DbCheckpointSaver

log = logging.getLogger("astrointel.workflow")

STEP_MAX_ATTEMPTS = int(os.getenv("WORKFLOW_STEP_MAX_ATTEMPTS", "3"))
TASK_MAX_ATTEMPTS = int(os.getenv("WORKFLOW_TASK_MAX_ATTEMPTS", "3"))
LEASE_SECONDS = float(os.getenv("WORKFLOW_LEASE_SECONDS", "300"))
RETRY_BACKOFF_SECONDS = float(os.getenv("WORKFLOW_RETRY_BACKOFF_SECONDS", "2"))
RECOVERY_INTERVAL = float(os.getenv("WORKFLOW_RECOVERY_INTERVAL", "30"))
RECOVERY_ENABLED = os.getenv("WORKFLOW_RECOVERY_ENABLED", "true").lower() == "true"

WORKER_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:6]}"

Step = Tuple[str, Callable[[Dict[str, Any]], Dict[str, Any]]]


class RetryLimitExceeded(Exception):
    """A step started more often than STEP_MAX_ATTEMPTS."""


class LeaseLost(Exception):
    """Another worker reclaimed the task; this one must stop."""


# ── Steps ────────────────────────────────────────────────────────────────────

def _ids(config: RunnableConfig) -> Tuple[str, str]:
    return config["configurable"]["thread_id"], config["configurable"]["worker_id"]


def _guarded(step: str, fn: Callable[[Dict[str, Any]], Dict[str, Any]]):
    """Renew the lease, count the attempt, enforce the step retry limit, run the step."""
    def node(state: Dict[str, Any], config: RunnableConfig) -> Dict[str, Any]:
        task_id, worker_id = _ids(config)
        if not store.heartbeat(task_id, worker_id, step, LEASE_SECONDS):
            raise LeaseLost(f"task {task_id} is no longer owned by {worker_id}")
        attempt = store.start_step(task_id, step)
        if attempt > STEP_MAX_ATTEMPTS:
            store.finish_step(task_id, step, store.FAILED)
            raise RetryLimitExceeded(f"step {step} started {attempt} times "
                                     f"(limit {STEP_MAX_ATTEMPTS})")
        try:
            result = fn(state)
        except Exception:
            store.finish_step(task_id, step, store.FAILED)
            raise
        store.finish_step(task_id, step)
        return result
    node.__name__ = step
    return node


def approval_gate(state: Dict[str, Any]) -> Dict[str, Any]:
    """Pause for a human decision when the task asked for one. Re-runs when resumed."""
    if not state.get("workflow", {}).get("require_approval"):
        state["approval"] = {"approved": True, "by": "auto"}
        return state
    decision = interrupt({
        "question": "Approve this report for delivery?",
        "admin_review": state.get("admin_review", {}),
    })
    state["approval"] = decision
    return state


def _after_approval(state: Dict[str, Any]) -> str:
    return "deliver" if state.get("approval", {}).get("approved") else END


def _save_session(task_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    import session_store
    session_store.save(task_id, state, tenant_id=state.get("workflow", {}).get("tenant_id", ""))
    return {"session_id": task_id}


# (effect name, fn(task_id, state) -> JSON-serialisable result). Each runs once per task.
DELIVERY_EFFECTS: List[Tuple[str, Callable[[str, Dict[str, Any]], Any]]] = [
    ("save_session", _save_session),
]


def deliver(state: Dict[str, Any]) -> Dict[str, Any]:
    task_id = state["workflow"]["task_id"]
    delivered = {}
    for name, effect in DELIVERY_EFFECTS:
        delivered[name] = store.run_once(f"{task_id}:{name}", task_id,
                                         lambda effect=effect: effect(task_id, state))
    state["delivered"] = delivered
    return state


# ── Graph ────────────────────────────────────────────────────────────────────

_saver = DbCheckpointSaver()
_graph = None
_steps: Optional[Sequence[Step]] = None


def build_graph(steps: Sequence[Step]):
    builder = StateGraph(dict)
    names = [name for name, _ in steps]
    for name, fn in steps:
        builder.add_node(name, _guarded(name, fn))
    builder.add_node("approval_gate", approval_gate)
    builder.add_node("deliver", _guarded("deliver", deliver))

    builder.set_entry_point(names[0])
    for current, following in zip(names, names[1:]):
        builder.add_edge(current, following)
    builder.add_edge(names[-1], "approval_gate")
    builder.add_conditional_edges("approval_gate", _after_approval, ["deliver", END])
    builder.add_edge("deliver", END)
    return builder.compile(checkpointer=_saver)


def use_steps(steps: Optional[Sequence[Step]]) -> None:
    """Swap the agent steps (tests); None restores the real pipeline."""
    global _graph, _steps
    _steps, _graph = steps, None


def get_graph():
    global _graph
    if _graph is None:
        if _steps is None:
            from graph.pipeline import PIPELINE_STEPS
            _graph = build_graph(PIPELINE_STEPS)
        else:
            _graph = build_graph(_steps)
    return _graph


def _config(task_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": task_id, "worker_id": WORKER_ID}}


# ── Lifecycle ────────────────────────────────────────────────────────────────

def submit(payload: Dict[str, Any], *, idempotency_key: str = "", tenant_id: str = "",
           require_approval: bool = False) -> Tuple[Dict[str, Any], bool]:
    """Create the task (or return the one this idempotency key already created)."""
    return store.create_task(payload, idempotency_key=idempotency_key, tenant_id=tenant_id,
                             require_approval=require_approval, max_attempts=TASK_MAX_ATTEMPTS)


def run_task(task_id: str) -> Optional[Dict[str, Any]]:
    """Claim and run (or resume) a task. A task another worker owns is left alone."""
    if store.claim(task_id, WORKER_ID, LEASE_SECONDS):
        _drive(task_id)
    return store.get_task(task_id)


def approve(task_id: str, by: str) -> Optional[Dict[str, Any]]:
    return _decide(task_id, {"approved": True, "by": by})


def reject(task_id: str, by: str, reason: str = "") -> Optional[Dict[str, Any]]:
    return _decide(task_id, {"approved": False, "by": by, "reason": reason})


def _decide(task_id: str, decision: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Resume a WAITING_FOR_APPROVAL task. False-y return = it was not waiting."""
    if not store.claim_for_resume(task_id, WORKER_ID, LEASE_SECONDS, decision["by"]):
        return None
    _drive(task_id, resume=decision)
    return store.get_task(task_id)


def _drive(task_id: str, resume: Optional[Dict[str, Any]] = None) -> None:
    """Run the graph for a task this worker owns and record where it ended up."""
    from pipeline_queue.consumer import initial_state_from_payload

    task = store.get_task(task_id)
    graph, config = get_graph(), _config(task_id)
    # durability="sync": a step's checkpoint is committed before the next step starts.
    # The default ("async") writes it in the background, so a crash could lose it.
    try:
        if resume is not None:
            graph.invoke(Command(resume=resume), config, durability="sync")
        elif _saver.get_tuple(config) is None:
            state = initial_state_from_payload(task["payload"])
            state["workflow"] = {"task_id": task_id, "tenant_id": task["tenant_id"],
                                 "require_approval": task["require_approval"]}
            graph.invoke(state, config, durability="sync")
        else:
            graph.invoke(None, config, durability="sync")  # resume from the last checkpoint
    except LeaseLost as exc:
        log.warning("[Workflow] %s", exc)
        return
    except (RetryLimitExceeded, SecurityError) as exc:
        store.mark_failed(task_id, WORKER_ID, f"{type(exc).__name__}: {exc}")
        return
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        if task["attempts"] < task["max_attempts"]:
            delay = RETRY_BACKOFF_SECONDS * (2 ** (task["attempts"] - 1))
            store.mark_retry(task_id, WORKER_ID, error, delay)
        else:
            store.mark_failed(task_id, WORKER_ID, f"retry limit reached: {error}")
        return

    snapshot = graph.get_state(config)
    if snapshot.next:
        store.mark_waiting(task_id, WORKER_ID)
        return
    final = snapshot.values
    approval = final.get("approval", {})
    if not approval.get("approved"):
        store.mark_failed(task_id, WORKER_ID,
                          f"rejected by {approval.get('by', '?')}: {approval.get('reason', '')}")
        return
    store.mark_completed(task_id, WORKER_ID, {
        "session_id":          task_id,
        "delivered":           final.get("delivered", {}),
        "admin_review":        final.get("admin_review", {}),
        "hallucination_audit": final.get("hallucination_audit", {}),
        "errors":              final.get("errors", []),
        "approved_by":         approval.get("by", ""),
    })


def status(task_id: str) -> Optional[Dict[str, Any]]:
    task = store.get_task(task_id)
    if task is None:
        return None
    task["steps"] = store.steps(task_id)
    task["effects"] = store.effects(task_id)
    task["checkpoints"] = _saver.count(task_id)
    return task


# ── Background execution + crash recovery ────────────────────────────────────

def start(task_id: str) -> None:
    threading.Thread(target=run_task, args=(task_id,), daemon=True,
                     name=f"workflow-{task_id[:8]}").start()


def recover() -> List[str]:
    """Fail tasks that used every attempt, then resume every runnable task. Returns resumed ids."""
    for task_id in store.fail_exhausted():
        log.warning("[Workflow] %s failed: retry limit reached", task_id)
    resumed = []
    for task_id in store.runnable_ids():
        if store.claim(task_id, WORKER_ID, LEASE_SECONDS):
            log.info("[Workflow] resuming %s", task_id)
            _drive(task_id)
            resumed.append(task_id)
    return resumed


_recovery_started = False


def start_recovery_loop() -> None:
    """Run recover() now and every RECOVERY_INTERVAL seconds in a daemon thread."""
    global _recovery_started
    if _recovery_started or not RECOVERY_ENABLED:
        return
    _recovery_started = True

    def _loop() -> None:
        while True:
            try:
                recover()
            except Exception as exc:  # recovery must never take the app down
                log.warning("[Workflow] recovery sweep failed: %s", exc)
            time.sleep(RECOVERY_INTERVAL)

    threading.Thread(target=_loop, daemon=True, name="workflow-recovery").start()
