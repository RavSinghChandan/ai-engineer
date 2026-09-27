from fake_typesafe import ChoiceAnswer
from router import LADDER, MOST_CAPABLE, choose_handler, estimated_cost


def ans(choice, conf):
    return ChoiceAnswer(choice=choice, confidence=conf, probabilities={})


def test_confident_routing_is_respected():
    assert choose_handler(ans("lookup", 0.9))[0] == "lookup"


def test_ambiguous_routing_escalates_upward():
    handler, reason = choose_handler(ans("lookup", 0.4))
    assert handler == MOST_CAPABLE and reason == "low_confidence_escalated"


def test_escalation_is_never_downward():
    """An unsure router must not pick something cheaper than it guessed."""
    for kind in LADDER:
        handler, _ = choose_handler(ans(kind, 0.1))
        assert LADDER.index(handler) >= LADDER.index(kind)


def test_lookup_costs_nothing():
    assert estimated_cost("lookup") == 0.0


def test_cost_increases_up_the_ladder():
    costs = [estimated_cost(k) for k in LADDER]
    assert costs == sorted(costs)


def test_threshold_boundary_is_inclusive():
    assert choose_handler(ans("classify", 0.70))[0] == "classify"
