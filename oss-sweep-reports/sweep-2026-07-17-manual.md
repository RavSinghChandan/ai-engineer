# OSS sweep — 2026-07-17 (manual)

**VERDICT: NOTHING CLEAN THIS SWEEP.**

Swept all 11 safe repos. No maintainer-confirmed + unclaimed + macOS-fixable bug available.

## Checked
- **llama_index #22176** (prompt_helper regression, llama-index-core) — CLAIMED: KHARSHAVARDHAN-eng said "I'd like to work on this" AND anishesg opened PR #22182. Dead.
- **llama_index #22101** (Zip Bomb DoS) — NOT maintainer-confirmed (only dosubot AI bot), still `triage` label, and it's in the HWP reader integration pkg (needs external file formats). Skip.
- **smolagents #2464/#2424/#2395** — still claimed by community members.
- **pytorch-lightning #21813/#21814/#21815** — fresh but FSDP/multi-GPU/distributed → can't verify on macOS. #21808 assigned.
- nltk / joblib / spaCy / optimum / sentence-transformers — stale (2022–2025) or ONNX/GPU/CUDA-specific.
- networkx, evaluate — no bug-labeled issues currently.

## joblib #1732 (our engaged candidate)
lesteve (maintainer) has NOT replied to Chandan's comment yet (posted 2026-07-16). Still waiting — do not post again or PR until he answers.

## PR status snapshot
3 MERGED (joblib #1812, #1811; sentence-transformers #3855). 27 open, 11 closed. No new merges since 07-15.
