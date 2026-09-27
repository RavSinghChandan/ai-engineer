"""p06 — Route each request to the cheapest thing that can handle it."""
from fake_typesafe import Choice

ROUTE = {
    "kind": Choice(
        instructions="What kind of work does this request require?",
        criteria={
            "lookup": "A fact retrievable from a database index or record",
            "classify": "A judgement choosing among fixed known options",
            "generate": "Writing prose code summary email or explanation",
            "reason": "Multi step analysis planning with intermediate conclusions",
        },
    ),
}

# Ascending capability and cost. Ambiguous routing escalates upward: being
# over-powered costs money, being under-powered returns a wrong answer.
LADDER = ["lookup", "classify", "generate", "reason"]
MOST_CAPABLE = "reason"
ROUTE_CONFIDENCE = 0.70


def choose_handler(answer, threshold=ROUTE_CONFIDENCE):
    if answer.confidence < threshold:
        return MOST_CAPABLE, "low_confidence_escalated"
    return answer.choice, "routed"


def estimated_cost(kind, cost_table=None):
    table = cost_table or {
        "lookup": 0.0,        # no model at all
        "classify": 0.00002,
        "generate": 0.002,
        "reason": 0.02,
    }
    return table[kind]
