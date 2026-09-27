"""p02 — Fan-out triage with composition in code."""
from fake_typesafe import Choice, Noul, Score

FANOUT = {
    "department": Choice(
        instructions="Which team owns this ticket?",
        criteria={
            "billing": "Payments invoices charges refunds subscription",
            "technical": "Bugs outages errors api checkout integration broken",
            "sales": "Pricing plans demos upgrades quote",
            "other": "Anything not covered above",
        },
    ),
    "severity": Score(
        instructions="How severe is the customer impact?",
        criteria=[
            "Low little or no impact",
            "Moderate some users affected business continues",
            "High major functionality unavailable",
            "Critical severe production disruption losing money",
        ],
    ),
    "churn_risk": Noul(instructions="The customer threatens to cancel or leave"),
    "legal": Noul(instructions="The message mentions lawyers or legal action"),
}

SEVERITY_LEVELS = len(FANOUT["severity"].criteria)


def priority(answers) -> float:
    """Weights live here — reviewable, testable, no API key needed.

    Each component is normalised to 0..1 before weighting, because a Score
    spans 0..(levels-1) while a Noul spans 0..1. Combining them raw would
    silently weight the Score several times over.
    """
    severity = answers["severity"].score / (SEVERITY_LEVELS - 1)
    churn = answers["churn_risk"].noul
    legal = answers["legal"].noul
    return 0.5 * severity + 0.3 * churn + 0.2 * legal


def decide(answers) -> str:
    """Legal exposure outranks everything, then severity, then priority."""
    if answers["legal"].noul > 0.5:
        return "escalate_legal"
    if answers["severity"].score >= SEVERITY_LEVELS - 1.3:
        return "page_oncall"
    if priority(answers) >= 0.5:
        return "priority_queue"
    return "normal_queue"
