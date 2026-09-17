"""Deterministic simulation model for projected campaign performance.

WHAT THIS IS
------------
Nothing in this module measures a real ad campaign. Every metric produced here
is a *projection* from a static benchmark table, adjusted by multipliers for ad
tone and audience quality. It exists so the agent workflow has a scoring signal
to optimise against, and so the learning loop has something to improve on.

WHY IT IS DETERMINISTIC
-----------------------
The model used to call `random.uniform()` on every run, so the same campaign
input produced a different ROI each time (+1.84x on one run, +0.55x on the
next). That makes the "learning improved the campaign by X%" claim meaningless,
because the difference between two runs was mostly noise.

Variance is still useful — a model that returns one number for one input looks
fake in the other direction. So the variance is kept, but it is *seeded from
the campaign input*. Identical inputs now always produce identical output, and
a genuine change to the input (or to the tone the agents chose) is the only
thing that can move the numbers.

MODEL VERSION
-------------
Bump MODEL_VERSION whenever the tables or the formula change, so stored
campaigns can be compared against the model that produced them.
"""

import hashlib
import random
from typing import Any, Dict

MODEL_VERSION = "simulation-v1"

# Benchmark starting points per vertical. These are plausible Indian digital-ad
# figures used as a fixed reference, not measured results from any account.
BASELINE = {
    "real_estate": {"ctr": 2.1, "conv": 3.2, "roi": 1.8, "cpc": 45.0},
    "coaching":    {"ctr": 3.4, "conv": 4.8, "roi": 2.2, "cpc": 28.0},
    "ecommerce":   {"ctr": 2.8, "conv": 2.9, "roi": 1.6, "cpc": 18.0},
    "custom":      {"ctr": 2.5, "conv": 3.5, "roi": 1.9, "cpc": 30.0},
}

# Multipliers applied to the baseline for the ad tone the copy agent selected.
TONE_LIFT = {
    "urgent_cta":             {"ctr": 1.28, "conv": 1.22},
    "emotional_storytelling": {"ctr": 1.18, "conv": 1.15},
    "benefit_focused":        {"ctr": 1.10, "conv": 1.12},
    "question_hook":          {"ctr": 1.35, "conv": 1.08},
    "number_lead":            {"ctr": 1.20, "conv": 1.18},
    "testimonial_style":      {"ctr": 1.15, "conv": 1.25},
    "professional":           {"ctr": 1.00, "conv": 1.00},
}

# Revenue attributed to the advertiser per closed sale. These are the advertiser's
# own economics, so they are per *sale*, not per lead: a brokerage fee on a flat,
# a course fee, a basket value. They were previously calibrated against a model
# that had no lead-to-sale stage, which made every vertical look unprofitable
# once that stage was added.
AOV = {"real_estate": 150000, "coaching": 45000, "ecommerce": 1800, "custom": 12000}

# A click does not become revenue in one step. It becomes a *lead* (the `conv`
# rate above), and only a share of leads close. Skipping this stage implied a
# coaching student acquired for ~Rs.583 against a Rs.3,000 fee — a 5x return
# that no practitioner would accept. Ecommerce is near 1.0 because the click
# and the purchase are the same session; lead-gen verticals are far lower.
LEAD_TO_SALE = {
    "real_estate": 0.06,
    "coaching": 0.18,
    "ecommerce": 0.85,
    "custom": 0.25,
}

# How far a metric may drift from its baseline, as a fraction of the baseline.
# Seeded, so the drift is fixed for a given campaign rather than random noise.
# Gross margin on a sale, before ad spend. ROAS on gross revenue flatters every
# campaign (a Rs.45k course at 13x "ROI"), so the headline return is computed on
# contribution margin, which is the number a marketer is actually accountable for.
GROSS_MARGIN = {
    "real_estate": 0.90,
    "coaching": 0.65,
    "ecommerce": 0.35,
    "custom": 0.55,
}

CTR_DRIFT = 0.12
CONV_DRIFT = 0.12
CPC_DRIFT = 0.10
REVENUE_DRIFT = 0.15


def seed_for(state: Dict[str, Any]) -> int:
    """Derive a stable seed from the fields that define a campaign.

    Two campaigns with the same type, product, budget, audience and platform
    are the same campaign as far as the model is concerned, and must project
    the same numbers.
    """
    parts = "|".join(
        str(state.get(field, ""))
        for field in ("campaign_type", "product_name", "budget", "target_audience", "platform")
    )
    digest = hashlib.sha256(parts.encode("utf-8")).hexdigest()
    return int(digest[:16], 16)


def drift(rng: random.Random, value: float, fraction: float) -> float:
    """Spread `value` by up to +/- `fraction` of itself, using the seeded rng."""
    return value * (1.0 + rng.uniform(-fraction, fraction))


def describe() -> Dict[str, Any]:
    """Provenance block returned with every campaign, for the UI to display."""
    return {
        "model_version": MODEL_VERSION,
        "kind": "projection",
        "label": "Projected — simulation model v1",
        "basis": (
            "Projected from a fixed benchmark table per vertical, adjusted for "
            "ad tone and audience quality. Not measured ad-platform data."
        ),
        "deterministic": True,
        "formula": [
            "ctr    = baseline_ctr  x tone_ctr_lift  + audience_quality_bonus",
            "conv   = baseline_conv x tone_conv_lift + audience_quality_bonus",
            "clicks = budget / cpc",
            "impressions = clicks / (ctr / 100)",
            "leads  = clicks x (conv / 100)",
            "sales  = leads x lead_to_sale_rate",
            "revenue      = sales x revenue_per_sale",
            "gross_profit = revenue x gross_margin",
            "roas = revenue / budget",
            "roi  = (gross_profit - budget) / budget",
        ],
    }
