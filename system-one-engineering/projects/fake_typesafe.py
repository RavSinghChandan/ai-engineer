"""An offline stand-in for the TypeSafe SDK.

Why this exists: the curriculum's projects must be runnable and testable by a
reader who has no API key (early access is waitlist-gated), and CI must not
depend on a network call to a vendor.

The response objects mirror the documented wire shape:

    response.answers[name].choice / .score / .noul
                          .confidence
                          .probabilities
    response.model
    response.usage.input_tokens / .output_tokens

Answers are produced by deterministic keyword scoring, NOT by a model. This is
a test double for exercising composition, thresholds and routing — the code you
own. It says nothing about how the real model behaves.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------- questions

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


# ------------------------------------------------------------------ answers

@dataclass
class ChoiceAnswer:
    choice: str
    confidence: float
    probabilities: dict
    type: str = "choice"


@dataclass
class ScoreAnswer:
    score: float
    confidence: float
    probabilities: dict
    type: str = "score"


@dataclass
class NoulAnswer:
    noul: float
    type: str = "noul"


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class Response:
    answers: dict
    model: str
    usage: Usage = field(default_factory=Usage)


# -------------------------------------------------------------- confidence

def confidence_from(probabilities: dict) -> float:
    """TypeSafe's published statistic: (count * peak - 1) / (count - 1).

    Uniform -> 0.0, all mass on one option -> 1.0.
    """
    p = list(probabilities.values())
    if len(p) < 2:
        return 1.0
    return max(0.0, (len(p) * max(p) - 1) / (len(p) - 1))


# ------------------------------------------------------------------ scoring

def _tokens(text: str) -> set:
    return set(re.findall(r"[a-z]+", text.lower()))


def _overlap(state_tokens: set, description: str) -> float:
    """Keyword overlap, with a floor so no option gets zero mass."""
    words = _tokens(description or "")
    if not words:
        return 0.05
    hits = len(state_tokens & words)
    return 0.05 + hits


def _normalise(raw: dict) -> dict:
    total = sum(raw.values()) or 1.0
    return {k: v / total for k, v in raw.items()}


def _flatten(state) -> str:
    if isinstance(state, str):
        return state
    if isinstance(state, dict):
        return " ".join(_flatten(v) for v in state.values())
    if isinstance(state, (list, tuple)):
        return " ".join(_flatten(v) for v in state)
    return str(state)


# ------------------------------------------------------------------- client

class FakeTypeSafeClient:
    """Deterministic stand-in. Same surface as TypeSafeClient."""

    def __init__(self, model: str = "fake-jev-1.0.0", overrides: dict | None = None):
        self.model = model
        # overrides: {question_name: answer} to force a specific answer in a test
        self.overrides = overrides or {}
        self.calls = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def system_one(self, state, questions, model=None, **kw) -> Response:
        self.calls += 1
        text = _flatten(state)
        toks = _tokens(text)
        answers = {}

        for name, q in questions.items():
            if name in self.overrides:
                answers[name] = self.overrides[name]
                continue

            if isinstance(q, Choice):
                raw = {k: _overlap(toks, v) for k, v in q.criteria.items()}
                probs = _normalise(raw)
                best = max(probs, key=probs.get)
                answers[name] = ChoiceAnswer(
                    choice=best,
                    confidence=confidence_from(probs),
                    probabilities=probs,
                )

            elif isinstance(q, Score):
                raw = {str(i): _overlap(toks, c) for i, c in enumerate(q.criteria)}
                probs = _normalise(raw)
                # probability-weighted position, as documented
                score = sum(int(i) * p for i, p in probs.items())
                answers[name] = ScoreAnswer(
                    score=score,
                    confidence=confidence_from(probs),
                    probabilities=probs,
                )

            elif isinstance(q, Noul):
                # stable pseudo-probability from the instruction + state
                digest = hashlib.sha256(
                    (q.instructions + "|" + text).encode()
                ).digest()
                base = digest[0] / 255.0
                # nudge toward 1 when instruction words appear in the state
                hits = len(_tokens(q.instructions) & toks)
                answers[name] = NoulAnswer(
                    noul=min(1.0, base * 0.4 + min(hits, 6) / 10.0)
                )

            else:
                raise TypeError(f"unknown question type: {type(q).__name__}")

        return Response(
            answers=answers,
            model=model or self.model,
            usage=Usage(input_tokens=max(1, len(text) // 4), output_tokens=0),
        )
