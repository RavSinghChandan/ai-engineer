from prtriage.github import Comment, PullRequest, _checks_state


def pr(**kw):
    base = dict(repo="o/r", number=1, title="t", url="u",
                created_at="2026-01-01T00:00:00Z",
                updated_at="2026-01-01T00:00:00Z", author="me")
    base.update(kw)
    return PullRequest(**base)


def test_checks_rollup_any_failure_is_fail():
    assert _checks_state([{"conclusion": "SUCCESS"},
                          {"conclusion": "FAILURE"}]) == "FAIL"


def test_checks_rollup_pending_beats_success():
    assert _checks_state([{"conclusion": "SUCCESS"},
                          {"state": "PENDING"}]) == "PENDING"


def test_checks_rollup_all_green():
    assert _checks_state([{"conclusion": "SUCCESS"},
                          {"conclusion": "SKIPPED"}]) == "PASS"


def test_no_checks_configured():
    assert _checks_state([]) == "NONE"


def test_others_commented_last_is_case_insensitive():
    p = pr(comments=[Comment("RavSinghChandan", "hi", "2026-01-01T00:00:00Z")],
           author="ravsinghchandan")
    assert p.others_commented_last is False


def test_pushed_since_last_comment():
    p = pr(comments=[Comment("maintainer", "fix", "2026-01-01T00:00:00Z")],
           last_push_at="2026-01-02T00:00:00Z")
    assert p.pushed_since_last_comment is True


def test_not_pushed_since_last_comment():
    p = pr(comments=[Comment("maintainer", "fix", "2026-01-03T00:00:00Z")],
           last_push_at="2026-01-02T00:00:00Z")
    assert p.pushed_since_last_comment is False


def test_no_push_recorded_is_not_a_push():
    p = pr(comments=[Comment("maintainer", "fix", "2026-01-01T00:00:00Z")])
    assert p.pushed_since_last_comment is False


def test_state_for_model_excludes_computed_facts_it_should_not_reask():
    """Mergeability is a fact; the model must not be asked to guess it."""
    s = pr(mergeable="CONFLICTING").state_for_model()
    assert s["has_conflicts"] is True          # passed as a fact
    assert "mergeable" not in s                # not as raw API vocabulary


def test_state_for_model_truncates_comment_history():
    comments = [Comment("m", f"c{i}", "2026-01-01T00:00:00Z") for i in range(10)]
    s = pr(comments=comments).state_for_model()
    assert len(s["recent_comments"]) == 3


def test_state_for_model_labels_authorship_not_usernames():
    s = pr(comments=[Comment("maintainer", "x", "2026-01-01T00:00:00Z")],
           author="me").state_for_model()
    assert s["recent_comments"][0]["by"] == "maintainer"


def test_comment_bodies_are_capped():
    s = pr(comments=[Comment("m", "x" * 5000, "2026-01-01T00:00:00Z")]).state_for_model()
    assert len(s["recent_comments"][0]["text"]) <= 600
