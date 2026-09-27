"""Offline stand-in used when typesafe_sdk is absent or no key is set.

Mirrors the documented response shape so calling code is identical on both
paths. Answers come from deterministic signal inspection, NOT a model — the
output marks itself `rule` so a reader always knows which path produced a
verdict.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Choice:
    instructions: str
    criteria: dict


@dataclass
class Score:
    instructions: str
    criteria: list


@dataclass
class Noul:
    instructions: str


@dataclass
class ChoiceAnswer:
    choice: str
    confidence: float
    probabilities: dict = field(default_factory=dict)


@dataclass
class ScoreAnswer:
    score: float
    confidence: float
    probabilities: dict = field(default_factory=dict)


@dataclass
class NoulAnswer:
    noul: float


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class Response:
    answers: dict
    model: str = "rule-fallback"
    usage: Usage = field(default_factory=Usage)


QUESTION_WORDS = ("?", "could you", "can you", "please", "would you",
                  "why ", "what ", "how ", "needs ", "should ")

NEGATIVE_WORDS = ("out of scope", "not sure we", "won't merge", "wontfix",
                  "declin", "not something we", "closing this", "duplicate of")


class RuleTriage:
    """Deterministic triage over the same state the model would see."""

    model = "rule-fallback"

    def system_one(self, state, questions, model=None, **kw) -> Response:
        recent = state.get("recent_comments") or []
        last = recent[-1] if recent else None
        from_maintainer = bool(last and last["by"] == "maintainer")
        text = (last or {}).get("text", "").lower()

        asks = from_maintainer and any(w in text for w in QUESTION_WORDS)
        negative = any(w in text for w in NEGATIVE_WORDS)
        quiet = state.get("days_since_activity", 0)

        answers = {}
        for name in questions:
            if name == "awaiting_me":
                answers[name] = NoulAnswer(0.85 if asks else 0.1)
            elif name == "maintainer_negative":
                answers[name] = NoulAnswer(0.8 if negative else 0.05)
            elif name == "blocker":
                if state.get("has_conflicts"):
                    pick = "merge_conflict"
                elif state.get("ci") == "FAIL":
                    pick = "ci_failure"
                elif negative:
                    pick = "abandoned"
                elif asks or state.get("review_decision") == "CHANGES_REQUESTED":
                    pick = "author_action"
                else:
                    pick = "maintainer_review"
                answers[name] = ChoiceAnswer(pick, 0.75, {pick: 0.75})
            elif name == "nudge_value":
                if asks or from_maintainer is False and quiet < 14:
                    level = 0.0
                elif quiet < 14:
                    level = 1.0
                elif quiet < 45:
                    level = 2.0
                else:
                    level = 3.0
                answers[name] = ScoreAnswer(level, 0.7, {})
            else:
                answers[name] = NoulAnswer(0.5)

        return Response(answers=answers, model=self.model)
