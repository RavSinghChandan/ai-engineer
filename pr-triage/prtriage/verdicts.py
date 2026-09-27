"""Turn model answers plus computed facts into one recommended action.

This module holds every weight and threshold in the tool. It is pure: it takes
answers and a PullRequest and returns a Verdict, with no I/O. That means the
whole decision layer is unit-testable without an API key or a network call,
which is the point of keeping composition out of the model.
"""
from __future__ import annotations

from dataclasses import dataclass

REPLY_NOW = "REPLY NOW"
PUSH_FIX = "PUSH FIX"
REBASE = "REBASE"
FIX_CI = "FIX CI"
NUDGE = "NUDGE"
CLOSE = "CLOSE"
WAIT = "WAIT"
REVIEW = "REVIEW"          # a human should look; we are not confident

# Confidence required before a verdict is stated without hedging. Scaled by
# what acting on it costs if wrong.
#
#   Reading a recommendation in a terminal   -> cheap to be wrong
#   Posting a public comment on someone      -> expensive to be wrong
#   Suggesting you close your own work       -> expensive, and demoralising
CONFIDENCE = {
    REPLY_NOW: 0.55,
    PUSH_FIX: 0.55,
    REBASE: 0.50,
    FIX_CI: 0.50,
    NUDGE: 0.70,
    CLOSE: 0.80,
    WAIT: 0.40,
}

# Posting is irreversible and public. Far higher bar than printing.
POST_CONFIDENCE = 0.85
POST_MIN_QUIET_DAYS = 21

# A maintainer org that is slow on one PR is slow on all of them. Nudging
# eight HuggingFace PRs in one run is not eight reminders, it is spam from
# the maintainers' side of the inbox. Cap per owner per run.
MAX_POSTS_PER_OWNER = 1


@dataclass
class Verdict:
    action: str
    confidence: float
    reason: str
    source: str = "model"          # "model" | "rule"

    @property
    def certain(self) -> bool:
        return self.confidence >= CONFIDENCE.get(self.action, 1.0)


def decide(pr, answers, source: str = "model") -> Verdict:
    """Facts first, then judgement.

    Order matters. A merge conflict is a fact and outranks any model opinion,
    so it is checked before anything the model said. Only where the facts are
    silent does the model's judgement decide.
    """
    awaiting = answers["awaiting_me"].noul
    negative = answers["maintainer_negative"].noul
    blocker = answers["blocker"]
    nudge = answers["nudge_value"]

    # --- facts, in order of how mechanically they block progress ---------
    if pr.has_conflicts:
        return Verdict(REBASE, 1.0, "branch conflicts with base", source)

    if pr.checks == "FAIL":
        return Verdict(FIX_CI, 1.0, "checks are failing", source)

    if pr.changes_requested and not pr.pushed_since_last_comment:
        return Verdict(
            PUSH_FIX, 1.0, "changes requested, nothing pushed since", source
        )

    # --- judgement -------------------------------------------------------
    if negative > 0.6 and blocker.choice == "abandoned":
        return Verdict(
            CLOSE,
            min(negative, blocker.confidence),
            "maintainer signalled this will not be merged",
            source,
        )

    if awaiting > 0.5 and not pr.pushed_since_last_comment:
        return Verdict(
            REPLY_NOW, awaiting, "a maintainer is waiting on you", source
        )

    if blocker.choice == "other":
        return Verdict(
            REVIEW, blocker.confidence, "does not match a known pattern", source
        )

    if nudge.score >= 2.5:
        return Verdict(
            NUDGE,
            nudge.confidence,
            f"quiet {pr.stale_days}d, work appears finished",
            source,
        )

    return Verdict(
        WAIT, blocker.confidence, "correctly waiting on a maintainer", source
    )


def may_post(pr, verdict: Verdict, posted_owners=None) -> tuple[bool, str]:
    """Gate on posting a public comment. Deliberately strict.

    Printing a wrong recommendation wastes ten seconds of my time. Posting a
    wrong nudge wastes a maintainer's time and makes me look careless in
    public, on someone else's repository.

    posted_owners: Counter of owners already nudged in this run, so a single
    slow organisation does not receive a burst of reminders.
    """
    if verdict.action != NUDGE:
        return False, "only nudges are ever posted automatically"
    if verdict.source != "model":
        return False, "rule fallback must not post"
    if verdict.confidence < POST_CONFIDENCE:
        return False, f"confidence {verdict.confidence:.2f} < {POST_CONFIDENCE}"
    if pr.stale_days < POST_MIN_QUIET_DAYS:
        return False, f"only quiet {pr.stale_days}d, minimum {POST_MIN_QUIET_DAYS}"
    if pr.others_commented_last is False and pr.comments:
        return False, "I commented last; nudging again would be pestering"
    if posted_owners is not None:
        owner = pr.repo.split("/")[0].lower()
        if posted_owners.get(owner, 0) >= MAX_POSTS_PER_OWNER:
            return False, f"already nudged {owner} this run"
    return True, "eligible"
