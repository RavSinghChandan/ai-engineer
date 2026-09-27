from fake_typesafe import FakeTypeSafeClient, NoulAnswer, ScoreAnswer
from triage import FANOUT, decide, priority


def answers(severity=0.0, churn=0.0, legal=0.0):
    return {
        "severity": ScoreAnswer(score=severity, confidence=0.9, probabilities={}),
        "churn_risk": NoulAnswer(noul=churn),
        "legal": NoulAnswer(noul=legal),
    }


def test_priority_is_bounded():
    assert priority(answers(3.0, 1.0, 1.0)) == 1.0
    assert priority(answers(0.0, 0.0, 0.0)) == 0.0


def test_severity_dominates_priority():
    assert priority(answers(3.0)) > priority(answers(0.0, 1.0))


def test_legal_outranks_everything():
    assert decide(answers(0.0, 0.0, 0.9)) == "escalate_legal"


def test_critical_severity_pages():
    assert decide(answers(2.9)) == "page_oncall"


def test_quiet_ticket_goes_to_normal_queue():
    assert decide(answers(0.2)) == "normal_queue"


def test_composition_needs_no_api():
    """The whole point: business logic is testable without a model."""
    assert decide(answers(1.0, 0.9, 0.0)) in {"priority_queue", "normal_queue"}


def test_fanout_is_a_single_call():
    c = FakeTypeSafeClient()
    c.system_one(state={"ticket": "api down"}, questions=FANOUT)
    assert c.calls == 1
