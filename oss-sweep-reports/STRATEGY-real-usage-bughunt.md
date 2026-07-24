# OSS Strategy Shift (2026-07-24) — REAL-USAGE BUG HUNTING

**Why:** 15 days, 0 new merges. "Hunt an unclaimed bug in popular repos" is exhausted — everything's claimed within hours, trivial PRs sit ignored. Chandan chose (correctly): **contribute to YOUR OWN projects' dependencies when you hit a real bug** — that's how joblib #1812 (his best merge) happened. Zero competition, maintainers love reporter+fixer.

## The libraries Chandan's real projects depend on (the hunting ground)
From astro-intel-backend, meeting-assistant, ai-content-factory requirements:
- **Mature (hard to find bugs, but if found = solid):** fastapi, pydantic, langgraph, langchain, openai, httpx, sqlalchemy, alembic, Pillow, redis, sentence-transformers, faiss-cpu
- **Smaller / newer (BEST TARGETS — real bugs, few contributors, uncontested):**
  - **kokoro-onnx** (v0.4.9, brand-new local TTS) ← TOP TARGET, newest
  - resend, kafka-python-ng, aiokafka, aiosqlite, structlog, soundfile, email-validator, python-jose, pydantic-settings, kokoro-onnx
  - python-multipart, greenlet, bcrypt

## Method (real edge-case testing, not issue-scraping)
Install the lib, exercise realistic edge cases Chandan would actually hit in his projects. When something crashes/misbehaves wrong:
1. Confirm it's a real bug (reproduce minimally).
2. Check it's NOT already reported (search their issues).
3. Chandan reports it (his voice) → then we fix it → PR. He's the first reporter = uncontested.

## Probed so far (2026-07-24) — all handled correctly, no bug:
- email-validator: localhost, bracketed-IP, unicode, double-@, leading-dot — all correct.
- structlog KeyValueRenderer: inf, nan, spaced keys, bytes — all fine.
- aiosqlite: executemany([]), Row factory — fine.
NEXT to probe: kokoro-onnx (newest, best odds), soundfile edge cases, kafka-python-ng, resend, python-jose token edge cases.

## Ongoing rule
This replaces the passive cron as the PRIMARY path. When Chandan is building and hits ANY library misbehaving, that's the moment — report it. Merges come from REAL usage, not hunting scraps.
