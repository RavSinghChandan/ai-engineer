# PR Triage

**Which of my open pull requests need attention this week?**

I have ~38 open PRs across 20+ upstream repositories. Reviewing them by hand
takes an hour and I skip it, so PRs rot: a maintainer asks a question in week
one and I notice in week six, by which point the branch conflicts and the
reviewer has moved on.

This triages all of them in one pass using **Jev**, TypeSafe's System One
model — typed, calibrated decisions instead of text.

```
$ prtriage
REPLY NOW          3   a maintainer is waiting on you
PUSH FIX           2   changes requested, nothing pushed since
NUDGE              4   silent 30+ days, CI green, no conflicts
REBASE             1   merge conflicts
WAIT              26   correctly waiting on a maintainer
CLOSE              2   superseded or unwanted
```

## Why a System One model

Every judgement here is consumed by code, not read by a person:

- *Is the last comment a question directed at me?* → **Noul**
- *What is blocking this PR?* → **Choice** over a fixed set
- *How likely is a nudge to help rather than annoy?* → **Score**

An LLM would answer these in prose I would have to parse, at ~2s and ~$0.01
each — 38 PRs, several questions apiece, is minutes and real money. Jev answers
all questions for one PR in a single call at ~100ms, and returns a confidence
I can threshold on.

**Actions are gated by reversibility.** Printing a recommendation is free, so
it needs only moderate confidence. Posting a comment on someone else's
repository is not, so `--post` requires high confidence *and* `--yes`.

## Install

```sh
pip install -e .
export TYPESAFE_API_KEY=...      # optional; falls back to offline triage
gh auth login                    # required: PR data comes from gh
```

## Use

```sh
prtriage                         # triage everything, print a table
prtriage --repo pypdf            # one repo
prtriage --json                  # machine-readable, for a cron job
prtriage --explain 4123          # why this PR got this verdict
prtriage --post --yes            # actually post nudges (high confidence only)
```

## Without an API key

Falls back to `RuleTriage`, a deterministic classifier over the same signals.
Its verdicts are marked `rule` rather than `model` in the output, so you always
know which produced a recommendation. The model path is better at reading
whether a comment is actually a question to you; the rule path is better than
nothing and makes the tool testable in CI.

## Design notes

- **Composition is in code.** Jev answers atomic questions; `decide()` combines
  them with weights that live in `verdicts.py`, reviewable and unit-tested
  without an API key.
- **Facts are computed, never asked.** Mergeability, CI status, review state
  and staleness come from the GitHub API. Asking a model what `gh` can tell you
  exactly is the most common waste in this kind of tool.
- **`other` always present.** Every Choice has an escape hatch; an unmatched PR
  escalates to a human rather than being forced into the nearest bucket.
