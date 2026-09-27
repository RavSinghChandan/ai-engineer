"""Pull PR state from the GitHub CLI.

Everything in here is a FACT, computed or fetched. None of it is a judgement,
so none of it goes to a model. Asking a model whether CI passed, when `gh` can
answer exactly, is the most common waste in tools like this.
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
from dataclasses import dataclass, field


class GitHubError(RuntimeError):
    pass


def _gh(*args: str) -> object:
    proc = subprocess.run(
        ["gh", *args], capture_output=True, text=True, timeout=120
    )
    if proc.returncode != 0:
        raise GitHubError(proc.stderr.strip() or f"gh {' '.join(args)} failed")
    return json.loads(proc.stdout or "null")


def _age_days(stamp: str | None) -> int | None:
    if not stamp:
        return None
    when = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    return (dt.datetime.now(dt.timezone.utc) - when).days


@dataclass
class Comment:
    author: str
    body: str
    created_at: str

    @property
    def age_days(self) -> int | None:
        return _age_days(self.created_at)


@dataclass
class PullRequest:
    repo: str
    number: int
    title: str
    url: str
    created_at: str
    updated_at: str
    author: str

    mergeable: str = "UNKNOWN"          # MERGEABLE | CONFLICTING | UNKNOWN
    review_decision: str = ""           # APPROVED | CHANGES_REQUESTED | ""
    checks: str = "UNKNOWN"             # PASS | FAIL | PENDING | NONE | UNKNOWN
    comments: list[Comment] = field(default_factory=list)
    last_push_at: str | None = None

    # -- derived facts, all computed -------------------------------------
    @property
    def age_days(self) -> int:
        return _age_days(self.created_at) or 0

    @property
    def stale_days(self) -> int:
        return _age_days(self.updated_at) or 0

    @property
    def last_comment(self) -> Comment | None:
        return self.comments[-1] if self.comments else None

    @property
    def others_commented_last(self) -> bool:
        last = self.last_comment
        return bool(last and last.author.lower() != self.author.lower())

    @property
    def pushed_since_last_comment(self) -> bool:
        """True if I have pushed since the last comment by anyone else."""
        last = self.last_comment
        if not last or not self.last_push_at:
            return False
        return self.last_push_at > last.created_at

    @property
    def has_conflicts(self) -> bool:
        return self.mergeable == "CONFLICTING"

    @property
    def changes_requested(self) -> bool:
        return self.review_decision == "CHANGES_REQUESTED"

    def state_for_model(self) -> dict:
        """The subset a model should see. Deliberately small.

        Only the last three comments: the model is judging whether someone is
        waiting on me right now, and older discussion adds tokens without
        changing that answer.
        """
        return {
            "title": self.title,
            "age_days": self.age_days,
            "days_since_activity": self.stale_days,
            "ci": self.checks,
            "review_decision": self.review_decision or "none",
            "has_conflicts": self.has_conflicts,
            "i_pushed_since_last_comment": self.pushed_since_last_comment,
            "recent_comments": [
                {
                    "by": "maintainer" if c.author.lower() != self.author.lower()
                          else "me",
                    "age_days": c.age_days,
                    "text": c.body[:600],
                }
                for c in self.comments[-3:]
            ],
        }


def _checks_state(rollup) -> str:
    if not rollup:
        return "NONE"
    states = {c.get("conclusion") or c.get("state") or "" for c in rollup}
    if {"FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"} & states:
        return "FAIL"
    if {"PENDING", "IN_PROGRESS", "QUEUED", ""} & states:
        return "PENDING"
    if states <= {"SUCCESS", "NEUTRAL", "SKIPPED"}:
        return "PASS"
    return "UNKNOWN"


def list_open_prs(author: str, limit: int = 100) -> list[PullRequest]:
    rows = _gh(
        "search", "prs", "--author", author, "--state", "open",
        "--limit", str(limit),
        "--json", "repository,number,title,url,createdAt,updatedAt",
    ) or []
    return [
        PullRequest(
            repo=r["repository"]["nameWithOwner"],
            number=r["number"],
            title=r["title"],
            url=r["url"],
            created_at=r["createdAt"],
            updated_at=r["updatedAt"],
            author=author,
        )
        for r in rows
    ]


def hydrate(pr: PullRequest) -> PullRequest:
    """Fetch the detail that needs a per-PR call."""
    data = _gh(
        "pr", "view", str(pr.number), "--repo", pr.repo,
        "--json", "mergeable,reviewDecision,statusCheckRollup,comments,commits",
    ) or {}

    pr.mergeable = data.get("mergeable") or "UNKNOWN"
    pr.review_decision = data.get("reviewDecision") or ""
    pr.checks = _checks_state(data.get("statusCheckRollup"))
    pr.comments = [
        Comment(
            author=(c.get("author") or {}).get("login", "?"),
            body=c.get("body", ""),
            created_at=c.get("createdAt", ""),
        )
        for c in (data.get("comments") or [])
    ]

    commits = data.get("commits") or []
    if commits:
        committed = (commits[-1].get("committedDate")
                     or (commits[-1].get("authoredDate")))
        pr.last_push_at = committed

    return pr
