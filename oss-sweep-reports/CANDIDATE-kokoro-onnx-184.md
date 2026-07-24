# CANDIDATE FOUND (2026-07-24) — kokoro-onnx (a lib Chandan's content-factory USES)

**Repo:** thewh1teagle/kokoro-onnx (2.6k stars, SAFE — no CLAUDE/AGENTS, active, welcoming maintainer @thewh1teagle who said "feel free to create a new PR + minimal pytest").

**Issue #184:** IndexError when phonemes truncate to 510. The SIMPLE clamp fix is in PR #185 (OPEN but STALE since 2026-04-25, 3 months no review) — do NOT duplicate that.

**THE REAL, UNCLAIMED, WANTED FIX (what we target):** `_split_phonemes()` (src/kokoro_onnx/__init__.py ~line 136) splits phonemes into ≤510 batches at punctuation. BUG: a single segment with no punctuation and >510 phonemes is NOT sub-split → it reaches `_create_audio`, gets truncated to 510, rest SILENTLY DROPPED. t-d-d raised this, maintainer AGREED "the real fix belongs in the chunker." This is unclaimed and Chandan hits it doing long-form TTS.

**FIX:** in `_split_phonemes`, when a single `part` exceeds MAX_PHONEME_LENGTH, hard-split it (by words/length) so nothing is lost. Pure-Python string logic, macOS-testable, add a pytest that a >510-phoneme unpunctuated string produces multiple batches each ≤510 with no data loss.

**PLAN (engagement-first, Chandan posts):**
1. Chandan comments on #184 (drafted) offering the _split_phonemes fix, asking to open a PR.
2. Maintainer says yes (responsive) → build fix + pytest → Chandan pushes PR.
This is the best OSS shot in 15 days — real bug, real lib he uses, welcoming maintainer, deeper fix unclaimed.
