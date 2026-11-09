"""
AgentPolicyGuard — one central check in front of every agent tool call.

    class AgentPolicyGuard(Protocol):
        def evaluate(self, agent_id: str, tool_name: str,
                     arguments: Mapping[str, Any]) -> PolicyDecision: ...

For every call the default guard answers five questions, in this order:

    1. session_suspended        — was this session suspended earlier?  → deny
    2. agent_authorized         — is the agent in TOOL_POLICY?          → deny if not
    3. tool_permitted           — may this agent call this tool?        → deny if not
    4. arguments_within_bounds  — every argument known, typed, in range → deny if not
    5. approval_required        — does a human have to approve it first? → require_approval

A denial counts against the session. After MAX_DENIALS_PER_SESSION denials, or
at once when an agent calls a high-risk tool it isn't granted (e.g. another
agent trying to generate the final report and skip the human gate), the
session is suspended: this and every later call in it is refused.

Every decision, including approvals granted by a human, is appended to the
immutable policy_decision_log before it is returned. If it can't be stored the
call is refused (fail closed): an unrecorded "allow" never happens.

The session is the resource_id of the agent_audit_log request context (the
analysis session), or its correlation_id. Calls made outside a request context
have no session: they are still checked and logged, but can't be suspended.

Callers use enforce(), which raises a PolicyViolation unless the call is allowed:

    from policy import enforce
    enforce("holistic_agent", "llm.chat", {"model": "deepseek-chat", ...})
"""
from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Dict, List, Mapping, Optional, Protocol, Set, Tuple

from audit.agent_audit_log import current_context
from fde import counters
from policy import config as policy_config
from policy import decision_log

log = logging.getLogger("astrointel.policy")

ALLOW = "allow"
DENY = "deny"
REQUIRE_APPROVAL = "require_approval"
SUSPEND = "suspend"
APPROVAL_GRANTED = "approval_granted"

CHECKS = ("session_suspended", "agent_authorized", "tool_permitted",
          "arguments_within_bounds", "approval_required")


@dataclass(frozen=True)
class PolicyDecision:
    outcome: str
    agent_id: str
    tool_name: str
    reasons: Tuple[str, ...] = ()
    checks: Mapping[str, bool] = field(default_factory=dict)
    session_id: str = ""
    decision_id: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "checks", MappingProxyType(dict(self.checks)))

    @property
    def allowed(self) -> bool:
        return self.outcome == ALLOW


class AgentPolicyGuard(Protocol):
    def evaluate(self, agent_id: str, tool_name: str,
                 arguments: Mapping[str, Any]) -> PolicyDecision: ...


class PolicyViolation(PermissionError):
    def __init__(self, decision: PolicyDecision) -> None:
        self.decision = decision
        why = ", ".join(decision.reasons) or decision.outcome
        super().__init__(f"{decision.agent_id} may not call {decision.tool_name}: {why}")


class ToolCallDenied(PolicyViolation):
    pass


class ApprovalRequired(PolicyViolation):
    pass


class SessionSuspended(PolicyViolation):
    pass


_RAISES = {DENY: ToolCallDenied, REQUIRE_APPROVAL: ApprovalRequired, SUSPEND: SessionSuspended}

_TYPES: Dict[str, Tuple[type, ...]] = {"str": (str,), "int": (int,), "number": (int, float), "bool": (bool,)}


def check_arguments(rule: Mapping[str, Any], arguments: Mapping[str, Any]) -> List[str]:
    """Reasons the arguments break the tool's boundaries (empty list = within bounds)."""
    specs: Mapping[str, Mapping[str, Any]] = rule.get("arguments", {})
    reasons = [f"unexpected_argument:{name}" for name in arguments if name not in specs]
    for name, spec in specs.items():
        if name not in arguments:
            if spec.get("required", True):
                reasons.append(f"missing_argument:{name}")
            continue
        value = arguments[name]
        kind = spec.get("type", "str")
        # bool is an int in Python; only a "bool" argument may be one
        if not isinstance(value, _TYPES[kind]) or (kind != "bool" and isinstance(value, bool)):
            reasons.append(f"{name}_not_{kind}")
            continue
        if "one_of" in spec and value not in spec["one_of"]:
            reasons.append(f"{name}_not_allowed")
        if "min" in spec and value < spec["min"]:
            reasons.append(f"{name}_below_min")
        if "max" in spec and value > spec["max"]:
            reasons.append(f"{name}_above_max")
        if "max_len" in spec and len(value) > spec["max_len"]:
            reasons.append(f"{name}_too_long")
    return reasons


class DefaultAgentPolicyGuard:
    """The five checks over policy.config.TOOL_POLICY, logged to policy_decision_log."""

    def __init__(self, policy: Optional[Mapping[str, Any]] = None,
                 max_denials: Optional[int] = None) -> None:
        self._policy = policy
        self._max_denials = max_denials
        self._lock = threading.Lock()
        self._denials: Dict[str, int] = {}
        self._suspended: Set[str] = set()
        self._approved: Set[Tuple[str, str, str]] = set()

    @property
    def policy(self) -> Mapping[str, Any]:
        return policy_config.TOOL_POLICY if self._policy is None else self._policy

    @property
    def max_denials(self) -> int:
        return policy_config.MAX_DENIALS_PER_SESSION if self._max_denials is None else self._max_denials

    # ── Session state, backed by the log so it survives a restart ────────────

    def is_suspended(self, session_id: str) -> bool:
        if not session_id:
            return False
        if session_id in self._suspended:
            return True
        if decision_log.has_outcome(session_id, SUSPEND):
            self._suspended.add(session_id)
            return True
        return False

    def is_approved(self, session_id: str, agent_id: str, tool_name: str) -> bool:
        if not session_id:
            return False
        key = (session_id, agent_id, tool_name)
        if key in self._approved:
            return True
        if decision_log.has_outcome(session_id, APPROVAL_GRANTED, agent_id=agent_id, tool_name=tool_name):
            self._approved.add(key)
            return True
        return False

    def grant_approval(self, session_id: str, agent_id: str, tool_name: str, *, approver: str) -> None:
        """A human approves agent → tool for one session. Recorded like any decision."""
        if not session_id:
            raise ValueError("an approval needs a session")
        self._record(PolicyDecision(APPROVAL_GRANTED, agent_id, tool_name, (f"approved_by:{approver}",),
                                    {}, session_id, uuid.uuid4().hex), {})
        self._approved.add((session_id, agent_id, tool_name))

    # ── The decision ─────────────────────────────────────────────────────────

    def evaluate(self, agent_id: str, tool_name: str,
                 arguments: Mapping[str, Any]) -> PolicyDecision:
        session_id = _session_id()
        checks = {name: False for name in CHECKS}
        reasons: List[str] = []
        suspend_now = False

        if self.is_suspended(session_id):
            checks["session_suspended"] = True
            reasons.append("session_suspended")
            outcome = DENY
        else:
            entry = self.policy.get(agent_id)
            checks["agent_authorized"] = entry is not None
            rule = (entry or {}).get("tools", {}).get(tool_name)
            checks["tool_permitted"] = rule is not None
            if entry is None:
                reasons.append("unknown_agent")
            elif rule is None:
                reasons.append("tool_not_permitted")
                suspend_now = self._is_high_risk(tool_name)
                if suspend_now:
                    reasons.append("high_risk_tool")
            if rule is not None:
                violations = check_arguments(rule, arguments)
                checks["arguments_within_bounds"] = not violations
                reasons.extend(violations)
                checks["approval_required"] = bool(rule.get("approval"))
            if reasons:
                outcome = DENY
            elif checks["approval_required"] and not self.is_approved(session_id, agent_id, tool_name):
                reasons.append("human_approval_required")
                outcome = REQUIRE_APPROVAL
            else:
                outcome = ALLOW

            if outcome == DENY and session_id:
                with self._lock:
                    denials = self._denials.get(session_id, 0) + 1
                    self._denials[session_id] = denials
                if suspend_now or denials >= self.max_denials:
                    reasons.append(f"suspended_after_{denials}_denials" if not suspend_now
                                   else "suspended_high_risk_attempt")
                    outcome = SUSPEND
                    self._suspended.add(session_id)

        decision = PolicyDecision(outcome, agent_id, tool_name, tuple(reasons), checks,
                                  session_id, uuid.uuid4().hex)
        try:
            self._record(decision, arguments)
        except Exception as exc:  # noqa: BLE001 — fail closed
            log.error("policy decision for %s/%s not recorded, refusing: %s", agent_id, tool_name, exc)
            decision = PolicyDecision(DENY, agent_id, tool_name, ("audit_log_unavailable",), checks,
                                      session_id, decision.decision_id)
        counters.incr("policy_decisions")
        if not decision.allowed:
            counters.incr(f"policy_{decision.outcome}")
        return decision

    def _is_high_risk(self, tool_name: str) -> bool:
        return any(rule.get("high_risk") for entry in self.policy.values()
                   for name, rule in entry.get("tools", {}).items() if name == tool_name)

    @staticmethod
    def _record(decision: PolicyDecision, arguments: Mapping[str, Any]) -> None:
        ctx = current_context()
        decision_log.append(
            decision_id=decision.decision_id, agent_id=decision.agent_id,
            tool_name=decision.tool_name, arguments=arguments, outcome=decision.outcome,
            reasons=decision.reasons, checks=decision.checks, session_id=decision.session_id,
            user_id=ctx.user_id, tenant_id=ctx.tenant_id, correlation_id=ctx.correlation_id,
        )


def _session_id() -> str:
    ctx = current_context()
    return ctx.resource_id or ctx.correlation_id


# ── The central instance ─────────────────────────────────────────────────────

_guard: AgentPolicyGuard = DefaultAgentPolicyGuard()


def get_guard() -> AgentPolicyGuard:
    return _guard


def set_guard(guard: AgentPolicyGuard) -> None:
    global _guard
    _guard = guard


def enforce(agent_id: str, tool_name: str, arguments: Mapping[str, Any]) -> PolicyDecision:
    """Evaluate with the central guard; raise a PolicyViolation unless the call is allowed."""
    decision = _guard.evaluate(agent_id, tool_name, arguments)
    if not decision.allowed:
        raise _RAISES.get(decision.outcome, ToolCallDenied)(decision)
    return decision
