"""
ToolCredentialBroker — the only code that reads a tool's secret.

Before this, the DeepSeek key was read straight from the environment in two
places (utils/deepseek_client.py and routers/analysis.py) and kept in a module
global for the life of the process. Any code path could use it, for anything.

Now a tool call goes:

    policy.enforce(agent, tool, args)          # may this agent call this tool?
    cred = broker.issue(agent, tool)           # short-lived, scoped handle
    with broker.use(cred, tool) as secret:     # the secret exists only here
        ...make the HTTP call...

What a credential is scoped to:
    agent_id     the agent it was issued to
    tool_name    the one tool it unlocks ("llm.chat"); using it for another tool is refused
    session_id   the analysis session; revoke_session() kills every credential in it
    expires_at   issue time + TTL (60 s by default; one tool call, not a process lifetime)
    max_uses     1 by default; a handle can't be replayed

Every issue, use, refusal and revocation is written to the AuditService.

What this is and isn't: the broker runs in the same process as the agents, so it
is a boundary in the code, not a security barrier against code already running
in that process. What it buys: one place that reads secrets (swap EnvSecretSource
for GCP Secret Manager without touching an agent), agents only ever hold a handle,
a suspended session loses its credentials at once, and every secret use is on the
audit record with agent, tool and session. Real isolation is the next step: run the
broker as its own service and have it inject the key at egress, so the agent
process never sees it.
"""
from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable, Dict, Iterator, Mapping, Optional, Protocol

from audit import audit_service

log = logging.getLogger("credentials.broker")

# Which secret each tool needs. A tool not listed here has no credential.
TOOL_SECRETS: Dict[str, str] = {
    "llm.chat": "DEEPSEEK_API_KEY",
}

DEFAULT_TTL_SECONDS = 60.0


class CredentialError(PermissionError):
    """A credential was refused: unknown tool, wrong scope, expired, used up or revoked."""


class SecretNotConfigured(RuntimeError):
    """The tool's secret isn't set. A RuntimeError, like the old "key not set" error, so callers'
    existing fallbacks still apply."""


class SecretSource(Protocol):
    def get(self, name: str) -> str: ...


class EnvSecretSource:
    """Reads the environment, then a .env file up to four folders above this one."""

    def __init__(self, start_dir: Optional[str] = None) -> None:
        self._start = start_dir or os.path.dirname(os.path.abspath(__file__))

    def get(self, name: str) -> str:
        value = os.environ.get(name, "")
        if value:
            return value
        folder = self._start
        for _ in range(4):
            path = os.path.join(folder, ".env")
            if os.path.isfile(path):
                with open(path) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith(f"{name}="):
                            return line.split("=", 1)[1].strip()
            folder = os.path.dirname(folder)
        return ""


@dataclass(frozen=True)
class ScopedCredential:
    """An opaque handle. It carries no secret."""
    credential_id: str
    agent_id: str
    tool_name: str
    session_id: str
    expires_at: float
    max_uses: int


class ToolCredentialBroker:
    def __init__(self, source: Optional[SecretSource] = None,
                 tool_secrets: Optional[Mapping[str, str]] = None,
                 ttl_seconds: float = DEFAULT_TTL_SECONDS,
                 clock: Callable[[], float] = time.time) -> None:
        self._source = source or EnvSecretSource()
        self._tool_secrets = dict(TOOL_SECRETS if tool_secrets is None else tool_secrets)
        self._ttl = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._live: Dict[str, ScopedCredential] = {}
        self._uses: Dict[str, int] = {}
        self._revoked_sessions: set = set()

    def issue(self, agent_id: str, tool_name: str, *, session_id: str = "",
              ttl_seconds: Optional[float] = None, max_uses: int = 1) -> ScopedCredential:
        """Issue a handle for one agent, one tool, one session. Call after policy.enforce allowed it."""
        if not agent_id:
            self._refuse("issue", agent_id, tool_name, session_id, "no_agent")
        if tool_name not in self._tool_secrets:
            self._refuse("issue", agent_id, tool_name, session_id, "tool_has_no_credential")
        if session_id and session_id in self._revoked_sessions:
            self._refuse("issue", agent_id, tool_name, session_id, "session_revoked")
        cred = ScopedCredential(
            credential_id=secrets.token_hex(12), agent_id=agent_id, tool_name=tool_name,
            session_id=session_id, expires_at=self._clock() + (self._ttl if ttl_seconds is None else ttl_seconds),
            max_uses=max_uses,
        )
        with self._lock:
            self._live[cred.credential_id] = cred
            self._uses[cred.credential_id] = 0
        self._audit("issue", cred, "success")
        return cred

    @contextmanager
    def use(self, cred: ScopedCredential, tool_name: str) -> Iterator[str]:
        """Yield the secret for one tool call. Refused unless the handle is live and scoped to this tool."""
        with self._lock:
            live = self._live.get(cred.credential_id)
            reason = ""
            if live is None or live != cred:
                reason = "unknown_or_revoked"
            elif tool_name != cred.tool_name:
                reason = "wrong_tool"
            elif self._clock() >= cred.expires_at:
                reason = "expired"
            elif cred.session_id and cred.session_id in self._revoked_sessions:
                reason = "session_revoked"
            elif self._uses[cred.credential_id] >= cred.max_uses:
                reason = "used_up"
            if reason:
                if reason in ("expired", "used_up"):
                    self._drop(cred.credential_id)
            else:
                self._uses[cred.credential_id] += 1
                if self._uses[cred.credential_id] >= cred.max_uses:
                    self._drop(cred.credential_id)
        if reason:
            self._refuse("use", cred.agent_id, tool_name, cred.session_id, reason, cred.credential_id)
        name = self._tool_secrets[cred.tool_name]
        secret = self._source.get(name)
        if not secret:
            audit_service.emit("credential", "use", "deny", agent_id=cred.agent_id, tool_name=tool_name,
                               session_id=cred.session_id,
                               detail={"reason": "secret_not_configured", "credential_id": cred.credential_id})
            raise SecretNotConfigured(f"{name} not set. Add it to your .env file.")
        self._audit("use", cred, "success")
        yield secret

    def has_secret(self, tool_name: str) -> bool:
        """Whether the tool's secret is configured, without handing it out (for a 503 up front)."""
        name = self._tool_secrets.get(tool_name)
        return bool(name and self._source.get(name))

    def revoke_session(self, session_id: str, reason: str = "") -> int:
        """Kill every credential of a session (called when the policy guard suspends it)."""
        if not session_id:
            return 0
        with self._lock:
            self._revoked_sessions.add(session_id)
            ids = [cid for cid, c in self._live.items() if c.session_id == session_id]
            for cid in ids:
                self._drop(cid)
        audit_service.emit("credential", "revoke_session", "success", session_id=session_id,
                           detail={"revoked": len(ids), "reason": reason})
        return len(ids)

    def live_count(self) -> int:
        with self._lock:
            return len(self._live)

    # ── internals ────────────────────────────────────────────────────────────

    def _drop(self, credential_id: str) -> None:
        self._live.pop(credential_id, None)
        self._uses.pop(credential_id, None)

    def _audit(self, action: str, cred: ScopedCredential, status: str) -> None:
        audit_service.emit("credential", action, status, agent_id=cred.agent_id,
                           tool_name=cred.tool_name, session_id=cred.session_id,
                           detail={"credential_id": cred.credential_id})

    def _refuse(self, action: str, agent_id: str, tool_name: str, session_id: str, reason: str,
                credential_id: str = "") -> None:
        audit_service.emit("credential", action, "deny", agent_id=agent_id, tool_name=tool_name,
                           session_id=session_id, detail={"reason": reason, "credential_id": credential_id})
        raise CredentialError(f"credential {action} refused for {agent_id or '?'}/{tool_name}: {reason}")


_broker = ToolCredentialBroker()


def get_broker() -> ToolCredentialBroker:
    return _broker


def set_broker(broker: ToolCredentialBroker) -> None:
    global _broker
    _broker = broker
