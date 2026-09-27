from decisions import TRIAGE, judge
from fake_typesafe import FakeTypeSafeClient


def test_all_three_primitives_answered():
    r = judge("api outage checkout failing", FakeTypeSafeClient())
    assert set(r.answers) == {"team", "severity", "wants_refund"}


def test_choice_is_always_from_the_schema():
    r = judge("something completely unrelated", FakeTypeSafeClient())
    assert r.answers["team"].choice in TRIAGE["team"].criteria


def test_probabilities_sum_to_one():
    r = judge("billing refund charge", FakeTypeSafeClient())
    total = sum(r.answers["team"].probabilities.values())
    assert abs(total - 1.0) < 1e-9


def test_confidence_in_range():
    r = judge("api outage", FakeTypeSafeClient())
    assert 0.0 <= r.answers["team"].confidence <= 1.0


def test_noul_in_range():
    r = judge("please refund my duplicate charge", FakeTypeSafeClient())
    assert 0.0 <= r.answers["wants_refund"].noul <= 1.0


def test_score_within_scale():
    r = judge("critical production disruption", FakeTypeSafeClient())
    levels = len(TRIAGE["severity"].criteria)
    assert 0.0 <= r.answers["severity"].score <= levels - 1


def test_one_call_answers_every_question():
    c = FakeTypeSafeClient()
    judge("api outage", c)
    assert c.calls == 1, "questions must evaluate in parallel, not sequentially"
