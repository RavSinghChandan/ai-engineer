"""p03 — Stakes-based confidence gating.

The central lesson: one global threshold is wrong. The bar scales with what
happens when the decision is wrong.
"""
from dataclasses import dataclass

# Thresholds by blast radius, not by model behaviour.
STAKES = {
    "check_balance":  0.50,   # read-only, reversible
    "send_receipt":   0.70,   # customer-visible, awkward but survivable
    "approve_refund": 0.85,   # money moves
    "close_account":  0.95,   # effectively irreversible
}

FLOOR = 0.50          # below this, nothing is automated
DEFAULT_BAR = 1.0     # unknown action -> never auto-execute (fail closed)


@dataclass
class Verdict:
    action: str
    reason: str


def route(answer) -> Verdict:
    """Map a Choice answer to an action, or escalate."""
    if answer.choice == "other":
        return Verdict("escalate", "out_of_domain")
    if answer.confidence < FLOOR:
        return Verdict("escalate", "below_floor")

    bar = STAKES.get(answer.choice, DEFAULT_BAR)
    if answer.confidence >= bar:
        return Verdict(answer.choice, "auto")
    return Verdict("confirm", "below_stakes_bar")
