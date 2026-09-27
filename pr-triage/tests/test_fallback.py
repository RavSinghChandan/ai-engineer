from prtriage.fake import RuleTriage
from prtriage.questions import QUESTIONS


def state(**kw):
    base = dict(title="t", age_days=10, days_since_activity=10, ci="PASS",
                review_decision="none", has_conflicts=False,
                i_pushed_since_last_comment=False, recent_comments=[])
    base.update(kw)
    return base


def run(s):
    return RuleTriage().system_one(s, QUESTIONS).answers


def test_answers_every_question():
    assert set(run(state())) == set(QUESTIONS)


def test_detects_a_maintainer_question():
    a = run(state(recent_comments=[
        {"by": "maintainer", "age_days": 2, "text": "Could you add a test?"}]))
    assert a["awaiting_me"].noul > 0.5


def test_my_own_comment_is_not_awaiting_me():
    a = run(state(recent_comments=[
        {"by": "me", "age_days": 2, "text": "Could you review?"}]))
    assert a["awaiting_me"].noul < 0.5


def test_detects_maintainer_reluctance():
    a = run(state(recent_comments=[
        {"by": "maintainer", "age_days": 2,
         "text": "This is out of scope for the project."}]))
    assert a["maintainer_negative"].noul > 0.5


def test_conflicts_drive_the_blocker():
    assert run(state(has_conflicts=True))["blocker"].choice == "merge_conflict"


def test_failing_ci_drives_the_blocker():
    assert run(state(ci="FAIL"))["blocker"].choice == "ci_failure"


def test_long_silence_raises_nudge_value():
    quiet = run(state(days_since_activity=90))["nudge_value"].score
    fresh = run(state(days_since_activity=3))["nudge_value"].score
    assert quiet > fresh


def test_choice_is_always_within_the_schema():
    a = run(state(ci="UNKNOWN", recent_comments=[]))
    assert a["blocker"].choice in QUESTIONS["blocker"].criteria
