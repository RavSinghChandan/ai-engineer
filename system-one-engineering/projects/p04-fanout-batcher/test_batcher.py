from batcher import cost_per_decision, count_matching
from fake_typesafe import Choice, FakeTypeSafeClient, Noul, Usage


def test_counting_uses_one_call_for_many_items():
    c = FakeTypeSafeClient()
    items = ["apple", "hammer", "banana", "wrench"]
    count, probs = count_matching(c, items, lambda i: f"items[{i}] is a fruit")
    assert c.calls == 1
    assert len(probs) == len(items)
    assert 0 <= count <= len(items)


def test_fanout_amortises_cost():
    usage = Usage(input_tokens=1000)
    one = cost_per_decision(usage, 1)
    five = cost_per_decision(usage, 5)
    assert five * 5 == one, "five questions on one state should split the cost"


def test_cost_per_decision_rejects_zero_questions():
    import pytest
    with pytest.raises(ValueError):
        cost_per_decision(Usage(input_tokens=10), 0)


def test_unused_answers_are_still_returned():
    """Speculative questions cost nothing extra and are available later."""
    c = FakeTypeSafeClient()
    r = c.system_one(
        state={"t": "api outage"},
        questions={
            "used": Noul(instructions="This is an outage"),
            "speculative": Choice(
                instructions="Which region?",
                criteria={"eu": "europe", "us": "america"},
            ),
        },
    )
    assert "speculative" in r.answers
