from fake_typesafe import ChoiceAnswer
from gate import route


def ans(choice, conf):
    return ChoiceAnswer(choice=choice, confidence=conf, probabilities={})


def test_low_stakes_auto_at_moderate_confidence():
    assert route(ans("check_balance", 0.55)).action == "check_balance"


def test_high_stakes_needs_confirmation_at_same_confidence():
    v = route(ans("close_account", 0.55))
    assert v.action == "confirm" and v.reason == "below_stakes_bar"


def test_high_stakes_auto_only_when_very_confident():
    assert route(ans("close_account", 0.96)).action == "close_account"


def test_other_always_escalates_even_at_high_confidence():
    v = route(ans("other", 0.99))
    assert v.action == "escalate" and v.reason == "out_of_domain"


def test_below_floor_escalates():
    assert route(ans("check_balance", 0.20)).reason == "below_floor"


def test_unknown_action_fails_closed():
    """A new option with no threshold must never auto-execute."""
    v = route(ans("delete_everything", 0.999))
    assert v.action == "confirm"


def test_boundary_is_inclusive():
    assert route(ans("approve_refund", 0.85)).action == "approve_refund"
