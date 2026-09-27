"""p08 — A decision service carrying the whole discipline.

Everything that can silently change an outcome is explicit in the constructor,
so it shows up in code review: the pinned model, the fitted thresholds, and
the hash of the criteria those thresholds were fitted against.
"""
from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any


class APIUnavailable(Exception):
    pass


@dataclass
class Decision:
    action: str
    confidence: float | None
    reason: str


@dataclass
class AuditRecord:
    request_id: str
    model: str
    criteria_hash: str
    state_digest: str
    answers: dict
    action: str
    reason: str
    threshold: float | None


class DecisionService:
    ESCALATE = "escalate"
    FLOOR = 0.50
    DEFAULT_BAR = 1.0        # unknown action -> never auto-execute

    def __init__(self, client, questions, thresholds, model, criteria_hash,
                 question_name="action"):
        self.client = client
        self.questions = questions
        self.thresholds = thresholds
        self.model = model
        self.criteria_hash = criteria_hash
        self.question_name = question_name
        self.audit_log: list[AuditRecord] = []

    # ------------------------------------------------------------------
    def decide(self, state, request_id: str) -> Decision:
        try:
            r = self.client.system_one(
                state=state, questions=self.questions, model=self.model
            )
        except Exception as exc:                      # degrade, never guess
            self._audit(request_id, None, state, self.ESCALATE,
                        "unavailable", None)
            return Decision(self.ESCALATE, None, "unavailable")

        a = r.answers[self.question_name]
        bar = self.thresholds.get(a.choice, self.DEFAULT_BAR)

        if a.choice == "other":
            action, reason = self.ESCALATE, "out_of_domain"
        elif a.confidence < self.FLOOR:
            action, reason = self.ESCALATE, "below_floor"
        elif a.confidence < bar:
            action, reason = "confirm", "below_stakes_bar"
        else:
            action, reason = a.choice, "auto"

        self._audit(request_id, r, state, action, reason, bar)
        return Decision(action, a.confidence, reason)

    # ------------------------------------------------------------------
    def _audit(self, request_id, response, state, action, reason, threshold):
        self.audit_log.append(
            AuditRecord(
                request_id=request_id,
                model=response.model if response else self.model,
                criteria_hash=self.criteria_hash,
                # digest, not the state itself: do not copy PII into a
                # second store just to prove which input was seen
                state_digest=sha256(repr(state).encode()).hexdigest()[:16],
                answers=self._serialise(response) if response else {},
                action=action,
                reason=reason,
                threshold=threshold,
            )
        )

    @staticmethod
    def _serialise(response) -> dict:
        out = {}
        for name, a in response.answers.items():
            out[name] = {
                "value": getattr(a, "choice", None)
                or getattr(a, "score", None)
                or getattr(a, "noul", None),
                "confidence": getattr(a, "confidence", None),
                "probabilities": getattr(a, "probabilities", None),
            }
        return out
