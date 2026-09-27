"""Wire the pieces together: facts -> one model call per PR -> verdict."""
from __future__ import annotations

import os
from dataclasses import dataclass

from prtriage.questions import QUESTIONS
from prtriage.verdicts import Verdict, decide


@dataclass
class Result:
    pr: object
    verdict: Verdict
    answers: dict


def build_client():
    """Real client when a key is present, deterministic fallback otherwise.

    Returns (client, source) so every verdict can record which path made it.
    """
    if os.environ.get("TYPESAFE_API_KEY"):
        try:
            from typesafe_sdk import TypeSafeClient
            return TypeSafeClient(), "model"
        except ImportError:
            pass
    from prtriage.fake import RuleTriage
    return RuleTriage(), "rule"


def triage_one(pr, client, source, model=None) -> Result:
    """One call answers every question in parallel against the same state."""
    kwargs = {"model": model} if model else {}
    response = client.system_one(
        state=pr.state_for_model(), questions=QUESTIONS, **kwargs
    )
    verdict = decide(pr, response.answers, source=source)
    return Result(pr=pr, verdict=verdict, answers=response.answers)


def triage_all(prs, client, source, model=None) -> list[Result]:
    return [triage_one(pr, client, source, model) for pr in prs]
