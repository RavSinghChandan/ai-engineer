# CANDIDATE FOUND (2026-07-24) — kokoro-onnx (a lib Chandan's content-factory USES)

**Repo:** thewh1teagle/kokoro-onnx (2.6k stars, SAFE — no CLAUDE/AGENTS, active, welcoming maintainer @thewh1teagle who said "feel free to create a new PR + minimal pytest").

**Issue #184:** IndexError when phonemes truncate to 510. The SIMPLE clamp fix is in PR #185 (OPEN but STALE since 2026-04-25, 3 months no review) — do NOT duplicate that.

**THE REAL, UNCLAIMED, WANTED FIX (what we target):** `_split_phonemes()` (src/kokoro_onnx/__init__.py ~line 136) splits phonemes into ≤510 batches at punctuation. BUG: a single segment with no punctuation and >510 phonemes is NOT sub-split → it reaches `_create_audio`, gets truncated to 510, rest SILENTLY DROPPED. t-d-d raised this, maintainer AGREED "the real fix belongs in the chunker." This is unclaimed and Chandan hits it doing long-form TTS.

**FIX:** in `_split_phonemes`, when a single `part` exceeds MAX_PHONEME_LENGTH, hard-split it (by words/length) so nothing is lost. Pure-Python string logic, macOS-testable, add a pytest that a >510-phoneme unpunctuated string produces multiple batches each ≤510 with no data loss.

**PLAN (engagement-first, Chandan posts):**
1. Chandan comments on #184 (drafted) offering the _split_phonemes fix, asking to open a PR.
2. Maintainer says yes (responsive) → build fix + pytest → Chandan pushes PR.
This is the best OSS shot in 15 days — real bug, real lib he uses, welcoming maintainer, deeper fix unclaimed.

---
## CANDIDATE #2 (BEST — cleanest) — kokoro-onnx #155: speed arg is int32
`src/kokoro_onnx/__init__.py` line 115: `"speed": np.array([speed], dtype=np.int32)` — casts float speed (1.5) to int (1); speeds <1 error. Confirmed by 4 users (hfl112, Patrick-Ric, yzm0080, cowboywang). UNCLAIMED, no PR. FIX: int32 -> float32 (one line) + a test that speed=1.5 stays 1.5. This is the highest-odds clean merge. Chandan posts comment on #155 (drafted, natural voice), maintainer says yes, build 1-line fix + pytest, Chandan pushes.

---
## STATUS 2026-07-25
- #155 (speed int32): Chandan commented 07-24, maintainer not replied yet (~1 day, normal).
- #184 (phoneme drop): Chandan commented 07-24; matteofrassi already said "go ahead with the PR, happy to review" — GREEN-LIT, can build the _split_phonemes fix + pytest anytime.

## 3 MORE handed over (2026-07-25), all kokoro-onnx, unclaimed, no PR:
- **#187** (Python 3.14): pyproject `requires-python = ">=3.10,<3.14"` blocks 3.14; onnxruntime already ships 3.14 wheels. FIX = bump cap. EASIEST. Comment posted-ready.
- **#191** (concurrent create corrupts): espeak phonemize not thread-safe, text mixes between threads. FIX = lock around phonemize OR document. 
- **#190** (streaming latency): short-text streaming waits full gen time before first audio. FIX = yield first chunk earlier.
All 3 have ready natural-voice comments for Chandan to paste.
