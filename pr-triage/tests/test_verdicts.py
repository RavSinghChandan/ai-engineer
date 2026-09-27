"""The decision layer is pure, so it tests without a key or a network."""
import pytest

from prtriage.fake import ChoiceAnswer, NoulAnswer, ScoreAnswer
from prtriage.github import Comment, PullRequest
from prtriage.verdicts import (CLOSE, FIX_CI, NUDGE, POST_MIN_QUIET_DAYS,
                               PUSH_FIX, REBASE, REPLY_NOW, REVIEW, WAIT,
                               decide, may_post)


def pr(**kw):
    base = dict(
        repo="o/r", number=1, title="t", url="u",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        author="me",
    )
    base.update(kw)
    return PullRequest(**base)


def answers(awaiting=0.1, negative=0.05, blocker="maintainer_review",
            blocker_conf=0.8, nudge=1.0, nudge_conf=0.8):
    return {
        "awaiting_me": NoulAnswer(awaiting),
        "maintainer_negative": NoulAnswer(negative),
        "blocker": ChoiceAnswer(blocker, blocker_conf, {blocker: blocker_conf}),
        "nudge_value": ScoreAnswer(nudge, nudge_conf, {}),
    }


# --- facts outrank judgement -------------------------------------------

def test_conflicts_outrank_any_model_opinion():
    v = decide(pr(mergeable="CONFLICTING"), answers(awaiting=0.99))
    assert v.action == REBASE and v.confidence == 1.0


def test_failing_ci_outranks_nudge():
    v = decide(pr(checks="FAIL"), answers(nudge=3.0))
    assert v.action == FIX_CI


def test_changes_requested_without_a_push():
    v = decide(pr(review_decision="CHANGES_REQUESTED"), answers())
    assert v.action == PUSH_FIX


def test_changes_requested_but_already_pushed_is_not_push_fix():
    p = pr(
        review_decision="CHANGES_REQUESTED",
        comments=[Comment("maintainer", "please fix", "2026-01-01T00:00:00Z")],
        last_push_at="2026-02-01T00:00:00Z",
    )
    assert decide(p, answers()).action != PUSH_FIX


# --- judgement ----------------------------------------------------------

def test_maintainer_waiting_triggers_reply():
    v = decide(pr(), answers(awaiting=0.9))
    assert v.action == REPLY_NOW and v.confidence == 0.9


def test_negative_maintainer_plus_abandoned_suggests_close():
    v = decide(pr(), answers(negative=0.9, blocker="abandoned",
                             blocker_conf=0.9))
    assert v.action == CLOSE


def test_close_takes_the_lower_of_the_two_signals():
    """A verdict this consequential must not inherit the higher confidence."""
    v = decide(pr(), answers(negative=0.95, blocker="abandoned",
                             blocker_conf=0.62))
    assert v.confidence == pytest.approx(0.62)


def test_unmatched_blocker_escalates_to_a_human():
    v = decide(pr(), answers(blocker="other"))
    assert v.action == REVIEW


def test_high_nudge_score_nudges():
    assert decide(pr(), answers(nudge=3.0)).action == NUDGE


def test_default_is_to_wait():
    assert decide(pr(), answers()).action == WAIT


def test_source_is_recorded():
    assert decide(pr(), answers(), source="rule").source == "rule"


# --- confidence gating --------------------------------------------------

def test_low_confidence_verdict_is_marked_uncertain():
    v = decide(pr(), answers(awaiting=0.52))
    assert v.action == REPLY_NOW and not v.certain


def test_close_needs_much_more_confidence_than_wait():
    from prtriage.verdicts import CONFIDENCE
    assert CONFIDENCE[CLOSE] > CONFIDENCE[WAIT]


# --- posting is the irreversible path -----------------------------------

def old_nudge(**kw):
    p = pr(comments=[Comment("maintainer", "thanks", "2026-01-01T00:00:00Z")],
           **kw)
    return p


def test_only_nudges_are_ever_posted():
    v = decide(pr(mergeable="CONFLICTING"), answers())
    ok, _ = may_post(pr(mergeable="CONFLICTING"), v)
    assert ok is False


def test_rule_fallback_must_never_post():
    from prtriage.verdicts import Verdict
    ok, why = may_post(old_nudge(), Verdict(NUDGE, 0.99, "x", source="rule"))
    assert ok is False and "rule" in why


def test_posting_needs_higher_confidence_than_printing():
    from prtriage.verdicts import Verdict
    ok, _ = may_post(old_nudge(), Verdict(NUDGE, 0.75, "x"))
    assert ok is False


def test_posting_needs_a_long_quiet_period():
    from prtriage.verdicts import Verdict
    p = old_nudge()
    p.updated_at = __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z")
    ok, why = may_post(p, Verdict(NUDGE, 0.99, "x"))
    assert ok is False and "quiet" in why


def test_does_not_nudge_when_i_commented_last():
    from prtriage.verdicts import Verdict
    p = pr(comments=[Comment("me", "any update?", "2026-01-01T00:00:00Z")])
    ok, why = may_post(p, Verdict(NUDGE, 0.99, "x"))
    assert ok is False and "pestering" in why


# --- one slow org must not get a burst ----------------------------------

def test_owner_cap_blocks_a_second_nudge_to_the_same_org():
    from collections import Counter
    from prtriage.verdicts import Verdict
    p = pr(repo="huggingface/datasets",
           comments=[Comment("maintainer", "thanks", "2026-01-01T00:00:00Z")])
    v = Verdict(NUDGE, 0.99, "x")
    already = Counter({"huggingface": 1})
    ok, why = may_post(p, v, already)
    assert ok is False and "already nudged" in why


def test_owner_cap_allows_a_different_org():
    from collections import Counter
    from prtriage.verdicts import Verdict
    p = pr(repo="numba/numba",
           comments=[Comment("maintainer", "thanks", "2026-01-01T00:00:00Z")])
    ok, _ = may_post(p, Verdict(NUDGE, 0.99, "x"), Counter({"huggingface": 1}))
    assert ok is True


def test_owner_cap_is_case_insensitive():
    from collections import Counter
    from prtriage.verdicts import Verdict
    p = pr(repo="HuggingFace/evaluate",
           comments=[Comment("maintainer", "thanks", "2026-01-01T00:00:00Z")])
    ok, _ = may_post(p, Verdict(NUDGE, 0.99, "x"), Counter({"huggingface": 1}))
    assert ok is False
