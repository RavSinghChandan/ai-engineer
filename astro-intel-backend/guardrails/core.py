"""
Guardrails core — safe_node() wrapper.

Wraps any pipeline node function with 3-layer safety:
  [Input Validation] → [Guardrails] → [Node Execution] → [Output Validation]

Does NOT touch node logic. Does NOT rewrite orchestration.
"""
from __future__ import annotations
import logging
import threading
import time
from copy import deepcopy
from typing import Any, Callable, Dict, Optional

from guardrails.config import DEFAULT_CONFIG, GuardrailsConfig
from guardrails.validators import INPUT_VALIDATORS, OUTPUT_VALIDATORS

log = logging.getLogger("guardrails")
log.setLevel(logging.INFO)

NodeFn = Callable[[Dict[str, Any]], Dict[str, Any]]


# ── timeout helper ───────────────────────────────────────────────────────────

class _TimeoutError(Exception):
    pass


def _run_with_timeout(fn: NodeFn, state: Dict[str, Any], seconds: float) -> Dict[str, Any]:
    if seconds <= 0:
        return fn(state)

    result_box: Dict[str, Any] = {}
    exc_box: list = []

    def _target():
        try:
            result_box["v"] = fn(state)
        except Exception as e:  # noqa: BLE001
            exc_box.append(e)

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join(timeout=seconds)
    if t.is_alive():
        raise _TimeoutError(f"timed out after {seconds}s")
    if exc_box:
        raise exc_box[0]
    return result_box["v"]


# ── fallback factories ───────────────────────────────────────────────────────

def _fallback_state(node_name: str, state: Dict[str, Any], reason: str) -> Dict[str, Any]:
    """
    Returns a minimally-patched state that lets the pipeline continue in
    relaxed mode. In strict mode this is never called — the exception propagates.
    """
    patched = deepcopy(state)
    patched.setdefault("agent_log", []).append(
        f"[Guardrails/{node_name}] FALLBACK activated: {reason}"
    )
    patched.setdefault("guardrail_warnings", []).append({
        "node":   node_name,
        "reason": reason,
    })

    # Inject minimal keys so downstream nodes don't crash
    defaults: Dict[str, Any] = {
        "question_agent":     {"normalized_questions": [], "focus_context": {}},
        "domain_agents":      {},
        "meta_agent":         {"synthesis": {}},
        "remedy_agent":       {"remedies": []},
        "admin_review_agent": {"final_report": {}},
    }
    for k, v in defaults.get(node_name, {}).items():
        patched.setdefault(k, v)

    return patched


# ── main wrapper ─────────────────────────────────────────────────────────────

def safe_node(
    node_fn: NodeFn,
    node_name: str,
    config: Optional[GuardrailsConfig] = None,
) -> NodeFn:
    """
    Returns a wrapped version of node_fn with 3-layer guardrails.
    Usage:
        safe_node(question_agent_node, "question_agent")
    """
    cfg_root = config or DEFAULT_CONFIG
    node_cfg = cfg_root.for_node(node_name)
    in_validator  = INPUT_VALIDATORS.get(node_name)
    out_validator = OUTPUT_VALIDATORS.get(node_name)

    def _wrapped(state: Dict[str, Any]) -> Dict[str, Any]:
        t0 = time.perf_counter()
        log.info("[Guardrails/%s] ▶ ENTER (strict=%s)", node_name, node_cfg.strict_mode)

        # ── Layer 1: Input Validation ──────────────────────────────────────
        if in_validator:
            ok, reason = in_validator(state)
            if not ok:
                log.warning("[Guardrails/%s] INPUT INVALID: %s", node_name, reason)
                if node_cfg.strict_mode:
                    raise ValueError(f"[{node_name}] Input validation failed: {reason}")
                return _fallback_state(node_name, state, f"input_invalid: {reason}")
            log.debug("[Guardrails/%s] Input valid.", node_name)

        # ── Layer 2: Guardrails checks ─────────────────────────────────────
        #   (a) State size guard
        if len(state) > node_cfg.max_state_keys:
            msg = f"State has {len(state)} keys — exceeds limit {node_cfg.max_state_keys}"
            log.warning("[Guardrails/%s] %s", node_name, msg)
            if node_cfg.strict_mode:
                raise RuntimeError(f"[{node_name}] {msg}")
            # relaxed: log and continue

        # ── Layer 3: Node Execution with retry on bad output ───────────────
        last_error: Optional[str] = None
        result: Optional[Dict[str, Any]] = None

        attempts = node_cfg.max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                result = _run_with_timeout(node_fn, deepcopy(state), node_cfg.timeout_seconds)
            except _TimeoutError:
                last_error = f"timeout after {node_cfg.timeout_seconds}s"
                log.warning("[Guardrails/%s] Attempt %d/%d timed out.", node_name, attempt, attempts)
                if node_cfg.strict_mode:
                    raise TimeoutError(f"[{node_name}] {last_error}")
                break
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                log.exception("[Guardrails/%s] Attempt %d/%d raised: %s", node_name, attempt, attempts, exc)
                if node_cfg.strict_mode:
                    raise
                break

            # ── Layer 4: Output Validation ─────────────────────────────────
            if out_validator and result is not None:
                ok, reason = out_validator(result)
                if not ok:
                    last_error = reason
                    log.warning(
                        "[Guardrails/%s] Output invalid (attempt %d/%d): %s",
                        node_name, attempt, attempts, reason,
                    )
                    if attempt < attempts:
                        log.info("[Guardrails/%s] Retrying node execution...", node_name)
                        continue
                    # exhausted retries
                    if node_cfg.strict_mode:
                        raise ValueError(f"[{node_name}] Output validation failed after {attempt} attempt(s): {reason}")
                    result = _fallback_state(node_name, state, f"output_invalid: {reason}")
                    break

            # Output is valid — exit retry loop
            break

        if result is None:
            result = _fallback_state(node_name, state, last_error or "unknown error")

        elapsed = time.perf_counter() - t0
        result.setdefault("agent_log", []).append(
            f"[Guardrails/{node_name}] ✓ completed in {elapsed:.3f}s"
        )
        log.info("[Guardrails/%s] ◀ EXIT  (%.3fs)", node_name, elapsed)
        return result

    _wrapped.__name__ = f"safe_{node_name}"
    _wrapped.__qualname__ = f"safe_{node_name}"
    return _wrapped
