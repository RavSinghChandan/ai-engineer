import pytest
from evaluate import drift_signals, evaluate
from fake_typesafe import Choice, ChoiceAnswer, FakeTypeSafeClient

QUESTIONS = {
    "team": Choice(
        instructions="Which team?",
        criteria={
            "billing": "payment invoice refund charge",
            "technical": "outage error api bug broken",
            "other": "anything else",
        },
    )
}

CASES = [
    ({"t": "refund my duplicate payment charge"}, "billing"),
    ({"t": "api outage error broken"}, "technical"),
    ({"t": "invoice payment refund"}, "billing"),
    ({"t": "bug error api"}, "technical"),
]


def test_evaluate_reports_precision_and_coverage():
    p, cov, records = evaluate(
        FakeTypeSafeClient(), QUESTIONS, CASES, "team", 0.5
    )
    assert 0.0 <= p <= 1.0 and 0.0 <= cov <= 1.0
    assert len(records) == len(CASES)


def test_raising_threshold_never_increases_coverage():
    _, low, _ = evaluate(FakeTypeSafeClient(), QUESTIONS, CASES, "team", 0.1)
    _, high, _ = evaluate(FakeTypeSafeClient(), QUESTIONS, CASES, "team", 0.99)
    assert high <= low


def test_drift_signals_need_no_labels():
    answers = [
        ChoiceAnswer("billing", 0.9, {}),
        ChoiceAnswer("other", 0.4, {}),
        ChoiceAnswer("technical", 0.8, {}),
    ]
    s = drift_signals(answers, threshold=0.7)
    assert s["pct_other"] == pytest.approx(1 / 3)
    assert s["pct_low_conf"] == pytest.approx(1 / 3)
    assert s["class_mix"]["billing"] == 1


def test_drift_signals_reject_empty_window():
    with pytest.raises(ValueError):
        drift_signals([], threshold=0.5)


def test_out_of_domain_is_representable():
    """A golden set without out-of-domain cases tests nothing that matters."""
    c = FakeTypeSafeClient()
    r = c.system_one(state={"t": "zzzz qqqq"}, questions=QUESTIONS)
    assert r.answers["team"].choice in QUESTIONS["team"].criteria
