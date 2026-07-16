---
name: oss-bug-sweep
description: Open-source sweep for Chandan (RavSinghChandan). Trigger when the user says "sweep the repos", "oss sweep", "morning oss", "find a bug to fix", "any confirmed bugs today", or similar. Scans his safe AI/ML repos for a MAINTAINER-CONFIRMED, UNCLAIMED, cleanly-fixable bug, engages like a human first, and either fixes+opens a PR or honestly reports "nothing clean today". Runs best ~evening IST (US/EU maintainer hours).
---

# OSS Bug Sweep — engagement-first, zero-trace, quality-over-volume

## The core philosophy (READ FIRST — this is the whole strategy)
The goal is NOT "generate PRs at scale and disguise them as human." That got the account
BANNED from stanza and 11 PRs closed. Maintainers detect automation by the **PATTERN of the
whole account**, not by any one PR — 40 near-identical PRs across 20 unrelated repos reads as
farming even with zero textual AI signals. You cannot hide the shape of an account.

The winning strategy — the one that produced the 3 real merges (joblib #1812 bug-fix, joblib
#1811, sentence-transformers #3855) — is to BEHAVE like a genuine contributor:
- ONE substantive contribution at a time, to a repo the user actually cares about
- Engage in the issue thread FIRST, in the user's own human voice, before any PR
- Understand the fix well enough that the user can defend it in review
- Real bug-fixes over trivial docstring/test churn

Using AI as a tool to write the fix is legitimate (every engineer does it now). The line we
NEVER cross: mass volume + deception. "Smart" = nothing to hide, not hiding better.

## Hard rules (non-negotiable)
1. **Zero AI trace, ever.** Human commit messages (lowercase, direct, no fluff), casual PR
   bodies, no "Claude" / "Generated with Claude Code" / AI co-author / table-heavy AI format.
   Git author = RavSinghChandan <ravchandan15@gmail.com>. Check every commit + PR body before
   pushing: zero AI attribution anywhere.
2. **Everything is posted BY THE USER, not by me.** I DRAFT comments and PR text; I do NOT
   auto-post comments, open PRs, or self-assign on GitHub on my own. Auto-posting across repos
   is the exact spam pattern that got the ban. The user posts and engages — it must genuinely
   be him in the thread. (Local report files + the user's own repos are the only things I write
   to directly.)
3. **Engagement-first flow.** Before any PR on a fresh bug: draft a short, specific, human
   comment for the user to post on the issue — referencing the actual code, asking if a fix is
   welcome / if they can take it. Wait for a maintainer reply. Only then build the fix. This
   creates the genuine-engagement history that never trips detectors.
4. **Maintainer-confirmed bugs ONLY** — a MEMBER/COLLABORATOR/OWNER must have said it's a real
   bug (e.g. "I confirm", "this is a bug", "a fix would be welcome", "PR welcome", "good catch").
   NOT: unreproducible, "I'll look into it", punted upstream ("report on pyarrow"), or a feature
   debate.
5. **Unclaimed only** — no existing/linked PR, nobody assigned, nobody saying "I'll fix this".
6. **Safely verifiable on macOS** — SKIP anything needing CUDA/GPU, multi-GPU, FSDP, distributed/
   multi-node, real multi-core Linux topology, Rust-internals, or external paid services
   (SharePoint, cloud APIs). Reproduce the bug locally with a failing test FIRST; only proceed
   if it reproduces.
7. **One at a time. Never a batch.** Do NOT open multiple PRs in a session/day. Do NOT repeat the
   same trivial shape ("add tests to a random function") across repos. Volume is the tell.
8. **A clean "nothing today" is the CORRECT outcome most days.** Never force a weak PR. A closed
   "AI spam" PR (or a ban) is PUBLIC and hurts the profile far more than no PR. Recruiters see it.

## Detection signals to stay clear of (so we never trip them)
- Metadata: AI co-author / generated footer (never add).
- Account pattern: many same-shaped PRs, fast intervals, no prior history in the repo → the #1
  tell. Counter it with: low cadence + genuine issue engagement + repos the user uses.
- Behavioral: can't answer a reviewer's follow-up in own words; PR with no prior thread context;
  "too clean, nobody was blocked on it." Counter: user engages first + understands the fix.

## Skip list (unsafe repos — never touch; verified 2026-07-16)
BANNED: stanza. CLAUDE.md/AGENTS.md AI policy → abort: langchain, langgraph, pytorch/pytorch
(also anti-AI), huggingface/transformers, peft, trl (also anti-AI), diffusers, huggingface_hub,
tokenizers, keras, mlflow, chroma, ragas, litellm, modelcontextprotocol/python-sdk, pydantic-ai
(also assignment-required), scikit-learn, pandas. Anti-AI + CLA → abort: haystack, pydantic,
wandb. CLA-gated (PRs sit unreviewed — user has stuck PRs, don't add more): google-deepmind/optax,
EleutherAI/lm-evaluation-harness. Numba good-first-issues: LLVM AI policy. No bug surface:
tiangolo/fastapi (issues become discussions). ALWAYS re-check for a fresh CLAUDE.md/AGENTS.md
before touching any repo — policies get added over time.

## Safe repos to sweep (verified 2026-07-16)
huggingface/smolagents, huggingface/evaluate, huggingface/safetensors, huggingface/optimum,
UKPLab/sentence-transformers, nltk/nltk, explosion/spaCy, joblib/joblib, networkx/networkx,
run-llama/llama_index, Lightning-AI/pytorch-lightning.
Per-repo notes:
- networkx = best: pure-Python, macOS-friendly, no CLA, active same-day bug flow.
- llama_index = monorepo; prefer llama-index-CORE bugs (plugin/integration bugs need external services).
- pytorch-lightning = active but MANY bugs are FSDP/multi-GPU/distributed → SKIP those; only
  pure-CPU/macOS ones (ModelCheckpoint, callbacks, logging, CLI, data utils).
- accelerate / datasets = deprioritized (mostly stale bugs).

## The sweep (run this)
1. For each safe repo, list open issues and find ones where a MEMBER/COLLABORATOR/OWNER comment
   confirms a real bug + invites a fix:
   ```bash
   for repo in joblib/joblib nltk/nltk explosion/spaCy UKPLab/sentence-transformers \
       huggingface/evaluate huggingface/optimum huggingface/safetensors huggingface/smolagents \
       networkx/networkx run-llama/llama_index Lightning-AI/pytorch-lightning; do
     echo "### $repo ###"
     for n in $(gh issue list --repo "$repo" --state open --limit 30 --json number --jq '.[].number' 2>/dev/null); do
       hit=$(gh issue view "$n" --repo "$repo" --json comments --jq '[.comments[]? | select((.authorAssociation=="MEMBER" or .authorAssociation=="COLLABORATOR" or .authorAssociation=="OWNER") and (.body|test("confirm|this is a bug|is indeed a bug|good catch|fix would be welcome|PR welcome|we (could|should) fix|feel free to (open|submit) a PR";"i")))] | length' 2>/dev/null)
       [ "${hit:-0}" -gt 0 ] && echo "  #$n needs check"
     done 2>/dev/null | head -5
   done
   ```
2. For each hit: read the full issue. Confirm (a) maintainer green-light, (b) NOT already fixed on
   main, (c) NOT punted upstream, (d) NO existing PR (`gh pr list --repo R --search "N in:body"`),
   (e) unassigned + unclaimed in comments, (f) reproducible + verifiable on macOS.
3. Pick the SINGLE best one. Reproduce locally with a failing test FIRST. If it doesn't reproduce
   or fails any check above → it's not the one; keep looking or report "nothing clean".
4. **ENGAGE FIRST (do not skip):** Draft a short, specific, human comment for the USER to post on
   the issue — reference the real code/line, confirm the diagnosis, ask if a fix is welcome / say
   he'd like to take it. Hand it to the user. He posts it himself and waits for a maintainer nod.
5. **Only after a maintainer nods:** branch off upstream default on the user's fork, implement the
   minimal fix + regression test, run the repo's linters + tests, verify the repro now passes.
6. Draft the commit (human message) + PR body (human tone, references the issue #, no AI signals)
   for the USER to review and push/open himself. One PR. Then stop — no second PR this session.
7. If NOTHING clean: say so plainly, list what was confirmed-but-unfixable (claimed / needs GPU /
   punted upstream / already fixed), so the user knows the sweep genuinely ran. This is a fine
   outcome.

## Reporting
Tell the user: repos swept, confirmed bugs found, which one chosen (or why none), the engagement
comment drafted (if any), the PR link (only if the user opened it), and the current live merged
count (`gh api "search/issues?q=type:pr+author:RavSinghChandan"`). Never overstate — if it's
"nothing today", say that.
