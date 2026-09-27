import pytest
from fake_typesafe import Choice, ChoiceAnswer, FakeTypeSafeClient
from service import DecisionService

QUESTIONS = {
    "action": Choice(
        instructions="What should happen next?",
        criteria={
            "check_balance": "read balance lookup account",
            "approve_refund": "refund money back charge",
            "close_account": "close terminate delete account permanently",
            "other": "anything else",
        },
    )
}

THRESHOLDS = {"check_balance": 0.50, "approve_refund": 0.85, "close_account": 0.95}


def service(overrides=None, client=None):
    return DecisionService(
        client=client or FakeTypeSafeClient(overrides=overrides),
        questions=QUESTIONS,
        thresholds=THRESHOLDS,
        model="fake-jev-1.0.0",
        criteria_hash="sha256:test",
    )


def forced(choice, conf):
    return {"action": ChoiceAnswer(choice, conf, {choice: conf})}


def test_confident_low_stakes_executes():
    d = service(forced("check_balance", 0.80)).decide({"x": 1}, "r1")
    assert d.action == "check_balance" and d.reason == "auto"


def test_same_confidence_high_stakes_asks_first():
    d = service(forced("close_account", 0.80)).decide({"x": 1}, "r2")
    assert d.action == "confirm"


def test_other_escalates():
    d = service(forced("other", 0.99)).decide({"x": 1}, "r3")
    assert d.action == "escalate" and d.reason == "out_of_domain"


def test_unknown_action_fails_closed():
    d = service(forced("wire_funds_offshore", 0.999)).decide({"x": 1}, "r4")
    assert d.action == "confirm", "no threshold must mean no auto-execution"


def test_api_failure_degrades_to_escalate():
    class Broken:
        def system_one(self, **kw):
            raise TimeoutError("gateway timeout")

    d = service(client=Broken()).decide({"x": 1}, "r5")
    assert d.action == "escalate" and d.reason == "unavailable"


def test_audit_written_even_on_failure():
    class Broken:
        def system_one(self, **kw):
            raise TimeoutError()

    svc = service(client=Broken())
    svc.decide({"x": 1}, "r6")
    assert svc.audit_log[-1].request_id == "r6"
    assert svc.audit_log[-1].action == "escalate"


def test_audit_stores_distribution_not_just_label():
    svc = service(forced("check_balance", 0.9))
    svc.decide({"x": 1}, "r7")
    assert svc.audit_log[-1].answers["action"]["probabilities"] is not None


def test_audit_digests_state_rather_than_storing_it():
    svc = service(forced("check_balance", 0.9))
    secret = {"email": "person@example.com", "card": "4111111111111111"}
    svc.decide(secret, "r8")
    record = svc.audit_log[-1]
    assert "person@example.com" not in repr(record)
    assert "4111111111111111" not in repr(record)
    assert len(record.state_digest) == 16


def test_model_version_recorded():
    svc = service(forced("check_balance", 0.9))
    svc.decide({"x": 1}, "r9")
    assert svc.audit_log[-1].model == "fake-jev-1.0.0"
