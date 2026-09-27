"""The questions put to Jev.

Every one is atomic: a single narrow judgement. Composition happens in
verdicts.py, in code, where it can be reviewed and unit-tested.

Note what is NOT asked. CI status, mergeability, review decision and staleness
are facts from the GitHub API. Asking a model to infer them would be slower,
cost money, and be less accurate than the exact answer.
"""
try:
    from typesafe_sdk import Choice, Noul, Score
except ImportError:                                   # offline / no SDK
    from prtriage.fake import Choice, Noul, Score


QUESTIONS = {
    # The judgement the whole tool turns on. "Is someone waiting on me?" is
    # genuinely hard: a maintainer saying "thanks, I'll merge this" is not a
    # question, and "could you add a test?" is.
    "awaiting_me": Noul(
        instructions=(
            "The most recent maintainer comment asks the pull request author "
            "a question, requests a change, or otherwise waits on the author "
            "to act"
        ),
    ),

    "blocker": Choice(
        instructions="What is currently blocking this pull request?",
        criteria={
            "author_action": (
                "The author must reply to a question, make a requested change, "
                "or resolve something raised in review."
            ),
            "maintainer_review": (
                "The work is done and the author is correctly waiting for a "
                "maintainer to look at it."
            ),
            "ci_failure": (
                "Automated checks are failing and must be fixed before review."
            ),
            "merge_conflict": (
                "The branch conflicts with the base and needs a rebase."
            ),
            "abandoned": (
                "The change is superseded, unwanted, or the maintainers have "
                "declined it."
            ),
            "other": "None of the above applies.",
        },
    ),

    # Nudging is social. This is the question that stops the tool being rude.
    "nudge_value": Score(
        instructions=(
            "How appropriate would a polite follow-up comment from the author "
            "be right now?"
        ),
        criteria=[
            "Inappropriate — the author commented recently or is the blocker.",
            "Premature — a maintainer has seen it recently.",
            "Reasonable — quiet for a while with no sign of attention.",
            "Overdue — long silence on finished work with no response.",
        ],
    ),

    "maintainer_negative": Noul(
        instructions=(
            "A maintainer has expressed reluctance about this change, "
            "suggested it is out of scope, or indicated it will not be merged"
        ),
    ),
}

NUDGE_LEVELS = len(QUESTIONS["nudge_value"].criteria)
