"""
A worker process for tests/test_durable_workflow.py — one process per command, so a test
can kill it with SIGKILL in the middle of a step and start a fresh one, like a restart.

    python tests/workflow_worker.py submit <idempotency_key> [approval]
    python tests/workflow_worker.py run <task_id>
    python tests/workflow_worker.py recover
    python tests/workflow_worker.py approve <task_id>

The agent steps are stubs (no LLM calls) with the real step names. Every step execution
and every "notify" side effect appends a line to $CALLS_FILE. $CRASH_IN=<step> kills the
process inside that step once ($CRASH_ONCE_FILE marks that it happened);
$CRASH_ALWAYS=<step> kills it every time. Step "after_notify" crashes inside deliver,
after its side effects ran but before the step finished.
"""
from __future__ import annotations

import json
import os
import signal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import database  # noqa: E402
from graph.pipeline import PIPELINE_STEPS  # noqa: E402
from workflow import runner  # noqa: E402

CALLS = Path(os.environ["CALLS_FILE"])


def _log(line: str) -> None:
    with CALLS.open("a") as f:
        f.write(line + "\n")


def _maybe_crash(point: str) -> None:
    once = Path(os.environ.get("CRASH_ONCE_FILE", "/nonexistent"))
    if os.environ.get("CRASH_ALWAYS") == point or (
            os.environ.get("CRASH_IN") == point and not once.exists()):
        once.touch()
        os.kill(os.getpid(), signal.SIGKILL)


def _stub(name: str):
    def step(state):
        _log(f"step:{name}")
        _maybe_crash(name)
        state.setdefault("agent_log", []).append(f"[{name}] done")
        return state
    return step


def _notify(task_id, state):
    _log("effect:notify")
    return {"sent": True}


def _crash_after_effects(task_id, state):
    _maybe_crash("after_notify")
    return {"ok": True}


def main() -> None:
    database.init_db()
    runner.use_steps([(name, _stub(name)) for name, _ in PIPELINE_STEPS])
    runner.DELIVERY_EFFECTS.extend([("notify", _notify), ("crash_point", _crash_after_effects)])

    command, args = sys.argv[1], sys.argv[2:]
    if command == "submit":
        task, created = runner.submit({"user_question": "career this year?"},
                                      idempotency_key=args[0],
                                      require_approval=len(args) > 1 and args[1] == "approval")
        out = {"task_id": task["task_id"], "created": created}
    elif command == "run":
        out = {"status": runner.run_task(args[0])["status"]}
    elif command == "recover":
        out = {"resumed": runner.recover()}
    elif command == "approve":
        task = runner.approve(args[0], "admin@test")
        out = {"status": task["status"] if task else None}
    else:
        raise SystemExit(f"unknown command {command}")
    print(json.dumps(out))


if __name__ == "__main__":
    main()
