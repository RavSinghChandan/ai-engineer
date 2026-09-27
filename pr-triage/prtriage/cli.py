"""Command line entry point."""
from __future__ import annotations

import argparse
import json
import sys

from prtriage import github
from prtriage.triage import build_client, triage_all
from prtriage.verdicts import (CLOSE, FIX_CI, NUDGE, PUSH_FIX, REBASE,
                               REPLY_NOW, REVIEW, WAIT, may_post)

ORDER = [REPLY_NOW, PUSH_FIX, FIX_CI, REBASE, NUDGE, CLOSE, REVIEW, WAIT]

NUDGE_TEMPLATE = (
    "Hi — just checking whether anything is needed from me on this one. "
    "Happy to rebase or make changes if that helps. No rush."
)


def _print_table(results, show_all: bool) -> None:
    by_action = {}
    for r in results:
        by_action.setdefault(r.verdict.action, []).append(r)

    print()
    for action in ORDER:
        rows = by_action.get(action, [])
        if not rows:
            continue
        if action == WAIT and not show_all:
            print(f"{action:<12} {len(rows):>3}   (use --all to list)")
            continue

        print(f"{action:<12} {len(rows):>3}")
        for r in sorted(rows, key=lambda x: -x.pr.stale_days):
            hedge = "" if r.verdict.certain else "  ?"
            src = "" if r.verdict.source == "model" else "  [rule]"
            print(
                f"   {r.pr.repo:<26} #{r.pr.number:<6} "
                f"{r.pr.stale_days:>4}d  {r.verdict.reason}{hedge}{src}"
            )
        print()


def _explain(result) -> None:
    pr, v, a = result.pr, result.verdict, result.answers
    print(f"\n{pr.repo} #{pr.number}")
    print(f"  {pr.title}")
    print(f"  {pr.url}\n")
    print("  FACTS (from the GitHub API, not a model)")
    print(f"    age                     {pr.age_days}d")
    print(f"    quiet for               {pr.stale_days}d")
    print(f"    checks                  {pr.checks}")
    print(f"    mergeable               {pr.mergeable}")
    print(f"    review decision         {pr.review_decision or 'none'}")
    print(f"    comments                {len(pr.comments)}")
    print(f"    someone else last       {pr.others_commented_last}")
    print(f"    pushed since comment    {pr.pushed_since_last_comment}\n")
    print(f"  JUDGEMENTS ({v.source})")
    print(f"    awaiting me             {a['awaiting_me'].noul:.2f}")
    print(f"    maintainer negative     {a['maintainer_negative'].noul:.2f}")
    print(f"    blocker                 {a['blocker'].choice} "
          f"(conf {a['blocker'].confidence:.2f})")
    print(f"    nudge value             {a['nudge_value'].score:.2f}\n")
    print(f"  VERDICT  {v.action}  ({v.confidence:.2f})")
    print(f"    {v.reason}")
    if not v.certain:
        print("    below the confidence bar for this action — treat as a hint")
    ok, why = may_post(pr, v)
    print(f"    postable: {ok} ({why})\n")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="prtriage", description=__doc__)
    p.add_argument("--author", default="RavSinghChandan")
    p.add_argument("--repo", help="substring filter on owner/name")
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--all", action="store_true", help="list WAIT rows too")
    p.add_argument("--json", action="store_true")
    p.add_argument("--explain", type=int, metavar="PR")
    p.add_argument("--model", help="pin a model version, e.g. jev-1.13.0")
    p.add_argument("--post", action="store_true", help="post eligible nudges")
    p.add_argument("--yes", action="store_true", help="required with --post")
    args = p.parse_args(argv)

    try:
        prs = github.list_open_prs(args.author, args.limit)
    except github.GitHubError as exc:
        print(f"gh failed: {exc}", file=sys.stderr)
        return 2

    if args.repo:
        prs = [x for x in prs if args.repo.lower() in x.repo.lower()]
    if args.explain:
        prs = [x for x in prs if x.number == args.explain]
        if not prs:
            print(f"no open PR #{args.explain}", file=sys.stderr)
            return 1

    for pr in prs:
        try:
            github.hydrate(pr)
        except github.GitHubError as exc:
            print(f"  warn: {pr.repo}#{pr.number}: {exc}", file=sys.stderr)

    client, source = build_client()
    results = triage_all(prs, client, source, args.model)

    if args.explain:
        _explain(results[0])
        return 0

    if args.json:
        print(json.dumps(
            [
                {
                    "repo": r.pr.repo,
                    "number": r.pr.number,
                    "url": r.pr.url,
                    "action": r.verdict.action,
                    "confidence": round(r.verdict.confidence, 3),
                    "certain": r.verdict.certain,
                    "reason": r.verdict.reason,
                    "source": r.verdict.source,
                    "quiet_days": r.pr.stale_days,
                }
                for r in results
            ],
            indent=2,
        ))
        return 0

    _print_table(results, args.all)

    if args.post:
        if not args.yes:
            print("--post requires --yes", file=sys.stderr)
            return 2
        from collections import Counter
        posted_owners = Counter()
        posted = 0
        for r in sorted(results, key=lambda x: -x.pr.stale_days):
            ok, why = may_post(r.pr, r.verdict, posted_owners)
            if not ok:
                continue
            posted_owners[r.pr.repo.split("/")[0].lower()] += 1
            github._gh("pr", "comment", str(r.pr.number),
                       "--repo", r.pr.repo, "--body", NUDGE_TEMPLATE)
            print(f"  posted on {r.pr.repo}#{r.pr.number}")
            posted += 1
        print(f"\nposted {posted} nudge(s)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
