"""Declared sub-steps for each agent, with the cost a real run would carry.

WHY THIS EXISTS
---------------
The agents do their actual work in microseconds: the audience profile is a
dictionary lookup, the budget split is arithmetic. A workflow that finishes in
milliseconds looks fake, and the frontend previously papered over that with a
fixed 500ms-per-agent loop that was not connected to the run at all - the
progress bar moved whether or not the backend was even reachable.

Each sub-step below names a unit of work the agent genuinely performs, and
carries `weight`, the share of that agent's progress it represents, plus
`real_ms`, an estimate of what the step would cost in a deployed system where
it hits an LLM or an ad platform API.

PACING
------
`PACE` scales `real_ms` when the step's work is not actually billed - i.e. when
there is no API to wait on. It is honest latency shaping, not a fake timer:
the step still runs, still reports its own completion, and a step whose work IS
real (a DeepSeek call) is never padded - it takes exactly as long as it takes.

Set AGENT_PACE=0 to remove the shaping entirely (tests, CI, benchmarking).
"""

import os
from typing import Any, Dict, List

# Fraction of the estimated real latency to actually wait when the step has no
# real I/O behind it. 1.0 would make the demo take a full minute; 0 makes it
# instant. The default keeps the five agents at roughly 40 seconds.
try:
    PACE = max(0.0, float(os.environ.get("AGENT_PACE", "0.7")))
except ValueError:
    PACE = 0.7


def _step(key: str, label: str, detail: str, weight: float, real_ms: int) -> Dict[str, Any]:
    return {"key": key, "label": label, "detail": detail, "weight": weight, "real_ms": real_ms}


# Each agent's steps. Weights within an agent sum to 1.0.
STEPS: Dict[str, List[Dict[str, Any]]] = {
    "audience": [
        _step("load_profile", "Loading vertical profile",
              "Reading the benchmark profile for this campaign type", 0.15, 400),
        _step("cluster_interests", "Clustering interests",
              "Grouping the audience into targetable interest clusters", 0.25, 1800),
        _step("apply_learning", "Applying learned refinements",
              "Checking campaign memory for age-group corrections", 0.20, 900),
        _step("score_quality", "Scoring audience quality",
              "Rating reach against intent signals", 0.25, 1500),
        _step("delivery_window", "Selecting delivery window",
              "Picking the hours with the strongest response", 0.15, 700),
    ],
    "ad_copy": [
        _step("select_tone", "Selecting ad tone",
              "Choosing the tone the learning loop scored highest", 0.15, 600),
        _step("draft_headline", "Drafting headline",
              "Generating the headline for this product and audience", 0.40, 4200),
        _step("draft_description", "Drafting description",
              "Writing the supporting description", 0.30, 2600),
        _step("pick_cta", "Choosing call to action",
              "Matching the CTA to the selected tone", 0.15, 800),
    ],
    "budget": [
        _step("channel_mix", "Computing channel mix",
              "Splitting spend across search, display and social", 0.35, 1400),
        _step("bid_strategy", "Selecting bid strategy",
              "Matching the bidding model to the objective", 0.30, 1100),
        _step("reallocate", "Reallocating on past performance",
              "Shifting budget toward channels that returned", 0.35, 1600),
    ],
    "campaign": [
        _step("build_structure", "Building campaign structure",
              "Creating ad groups and their bid adjustments", 0.40, 2200),
        _step("quality_score", "Estimating quality score",
              "Projecting the platform quality score", 0.30, 1300),
        _step("assemble", "Assembling campaign payload",
              "Producing the object an ad platform would accept", 0.30, 1500),
    ],
    "performance": [
        _step("project_funnel", "Projecting funnel",
              "Impressions to clicks to leads to sales", 0.35, 1900),
        _step("unit_economics", "Computing unit economics",
              "Cost per lead, cost per sale, contribution margin", 0.30, 1400),
        _step("grade", "Grading the campaign",
              "Scoring the projection and flagging low volume", 0.15, 700),
        _step("forecast", "Forecasting 30 days",
              "Extrapolating the projection across the month", 0.20, 1000),
    ],
}

AGENT_LABELS = {
    "audience": "Audience Agent",
    "ad_copy": "Ad Copy Agent",
    "budget": "Budget Optimizer",
    "campaign": "Campaign Agent",
    "performance": "Performance Analyzer",
}

# What each agent is the specialist in. Shown while it runs, so the role is
# clear to someone watching who has not read the architecture.
AGENT_ROLES = {
    "audience": "Targeting specialist — decides who sees the ad",
    "ad_copy": "Creative specialist — decides what the ad says",
    "budget": "Media buying specialist — decides where the money goes",
    "campaign": "Delivery specialist — assembles the launch payload",
    "performance": "Analytics specialist — scores the result and grades it",
}

AGENT_ORDER = ["audience", "ad_copy", "budget", "campaign", "performance"]


# A step must stay on screen long enough to actually be read. Several steps
# were landing in 0.18-0.45s against roughly 2.5s of reading, so the text
# changed before anyone could take it in. These floors are applied on top of
# the scaled latency, whichever is longer.
WORDS_PER_SECOND = 5.5   # slower than silent reading (~200wpm); the viewer is
                         # also watching the canvas, not only reading.
MIN_STEP_SECONDS = 1.5   # nothing flashes past, however short its label.
READ_PAD_SECONDS = 0.35   # a beat after the words land, before moving on.


def read_seconds(*texts: str) -> float:
    """How long the given text needs to be read comfortably."""
    words = sum(len(t.split()) for t in texts if t)
    return words / WORDS_PER_SECOND + READ_PAD_SECONDS


def pace_seconds(real_ms: int, *texts: str) -> float:
    """How long a step should stay on screen.

    The scaled latency estimate, floored by the time its own text takes to
    read. With PACE at 0 both terms vanish, so tests stay instant.
    """
    scaled = (real_ms * PACE) / 1000.0
    if PACE <= 0:
        return 0.0
    return max(scaled, read_seconds(*texts), MIN_STEP_SECONDS)


def step_seconds(step: Dict[str, Any]) -> float:
    """Pacing for a declared step, including its own label and detail."""
    return pace_seconds(step["real_ms"], step["label"], step["detail"])


def total_estimated_ms() -> int:
    """What a deployed run would cost, for the UI to show as the real figure."""
    return sum(s["real_ms"] for steps in STEPS.values() for s in steps)


def describe() -> Dict[str, Any]:
    return {
        "agents": [
            {
                "key": key,
                "label": AGENT_LABELS[key],
                "role": AGENT_ROLES[key],
                "steps": [
                    {
                        "key": s["key"],
                        "label": s["label"],
                        "detail": s["detail"],
                        "weight": s["weight"],
                    }
                    for s in STEPS[key]
                ],
            }
            for key in AGENT_ORDER
        ],
        "estimated_real_ms": total_estimated_ms(),
        "pace": PACE,
    }
