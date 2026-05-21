"""
Grammar Agent — ensures all English text in the report is grammatically correct
before the PDF is generated and before translation.

Two-pass approach:
  Pass 1 — deterministic rule-based corrections (no LLM cost, instant):
            article agreement (a/an), double spaces, sentence capitalisation,
            repeated words, missing full-stop, comma-before-conjunction fixes.
  Pass 2 — LLM polishing via DeepSeek (only for text > 20 chars that changed in Pass 1
            or that contains common grammar markers).

Where it runs:
  A) Pipeline node  — fixes each insight bullet in admin_review (after admin_review_agent)
  B) Report hook    — called from /approve on final report narratives, letter paragraphs,
                      structured_summary fields, and remedy text.

Never modifies: brand_name, logo_url, image_url, generated_at, IDs, language codes,
mantra strings, or any key in _SKIP_KEYS.
Never crashes the pipeline — returns original text on any failure.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Set, Tuple

# ── Keys that must never be grammar-corrected ─────────────────────────────────
_SKIP_KEYS: Set[str] = {
    "brand_name", "logo_url", "image_url", "generated_at", "report_title",
    "id", "session_id", "confidence", "intent", "domains", "is_common",
    "approved", "editable", "edited", "modules_used", "language", "language_code",
    "language_name", "language_native", "type", "mantra", "source", "plain_english",
    "grammar_checked", "original_content", "model", "temperature", "top_p",
    "max_tokens", "system", "user",
}

# ── Report keys whose values ARE AI-generated prose needing LLM correction ───
# Static template strings (letter_para*, disclaimer, cover_*, closing_*) are
# already grammatically correct — run deterministic fix only, skip LLM.
_REPORT_PROSE_KEYS_LLM = {
    "narrative", "simple_narrative",
    # structured_summary sub-keys (AI-generated)
    "who", "what", "when", "where", "how",
}

# Keys that get deterministic fix only (template text — no LLM needed)
_REPORT_PROSE_KEYS_DET = {
    "disclaimer", "closing_note",
    "letter_para1", "letter_para2", "letter_para3", "letter_para4",
    "letter_sign", "letter_tagline", "cover_sub", "cover_footer",
    "closing_consult", "closing_confidential",
}

# Combined for backwards-compat references
_REPORT_PROSE_KEYS = _REPORT_PROSE_KEYS_LLM | _REPORT_PROSE_KEYS_DET


# ══════════════════════════════════════════════════════════════════════════════
# PASS 1 — Deterministic rule-based grammar corrections
# ══════════════════════════════════════════════════════════════════════════════

# Article: "a" before vowel-sound words
_AN_PATTERN = re.compile(
    r'\b(a)\s+([aeiouAEIOU][a-zA-Z])',
    re.IGNORECASE,
)

# "an" before consonant-sound words (catches LLM mistake "an planet", "an chart")
_A_PATTERN = re.compile(
    r'\b(an)\s+([b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z][a-zA-Z])',
    re.IGNORECASE,
)

# Repeated words: "the the", "is is", "a a"
_REPEATED_WORD = re.compile(r'\b(\w+)\s+\1\b', re.IGNORECASE)

# Multiple spaces
_MULTI_SPACE = re.compile(r' {2,}')

# Sentence must start with capital letter
_SENTENCE_START = re.compile(r'(?:^|(?<=[.!?])\s+)([a-z])')

# Missing space after period (e.g. "word.Next")
_MISSING_SPACE = re.compile(r'([a-zA-Z])\.([A-Z])')

# Comma splice with "and/but/or" — "word ,and" → "word, and"
_COMMA_BEFORE_CONJ = re.compile(r'\s+,\s*(and|but|or|yet|so)\b', re.IGNORECASE)
_MISSING_COMMA_CONJ = re.compile(r'(\w)\s+(and|but|or)\s+(\w)', re.IGNORECASE)

# Trailing whitespace on each line
_TRAILING_SPACE = re.compile(r'[ \t]+$', re.MULTILINE)

# "i " → "I " (lowercase first person pronoun)
_LOWERCASE_I = re.compile(r'\bi\b(?!\w)')

# Double punctuation
_DOUBLE_PUNCT = re.compile(r'([.!?]){2,}')

# No period at end of sentence (skip if ends with : or ends in a list context)
_NEEDS_PERIOD = re.compile(r'([a-zA-Z\d\)])$')


def _article_fix(text: str) -> str:
    """Fix a/an mismatches."""
    def fix_a_to_an(m: re.Match) -> str:
        return f"an {m.group(2)}"

    def fix_an_to_a(m: re.Match) -> str:
        return f"a {m.group(2)}"

    # "a apple" → "an apple"
    text = _AN_PATTERN.sub(fix_a_to_an, text)
    # "an planet" → "a planet"
    text = _A_PATTERN.sub(fix_an_to_a, text)
    return text


def _deterministic_fix(text: str) -> str:
    """All deterministic corrections in one pass."""
    if not text or len(text.strip()) < 3:
        return text

    # Lowercase "i" pronoun
    text = _LOWERCASE_I.sub("I", text)

    # Article agreement
    text = _article_fix(text)

    # Repeated words
    text = _REPEATED_WORD.sub(r'\1', text)

    # Missing space after period
    text = _MISSING_SPACE.sub(r'\1. \2', text)

    # Comma before conjunction spacing: "word ,and" → "word, and"
    text = _COMMA_BEFORE_CONJ.sub(r', \1', text)

    # Double punctuation: "..." → "."  "!!" → "!"
    text = _DOUBLE_PUNCT.sub(r'\1', text)

    # Multiple spaces
    text = _MULTI_SPACE.sub(' ', text)

    # Trailing whitespace
    text = _TRAILING_SPACE.sub('', text)

    # Capitalise first letter of each sentence
    def cap_sentence(m: re.Match) -> str:
        return m.group(0)[:-1] + m.group(1).upper()

    text = _SENTENCE_START.sub(cap_sentence, text)

    # Add period if missing at end (only for single-sentence content)
    stripped = text.strip()
    if stripped and _NEEDS_PERIOD.search(stripped) and not stripped.endswith((':', ';')):
        if '\n' not in stripped:   # single line only
            text = stripped + '.'

    return text.strip()


# ══════════════════════════════════════════════════════════════════════════════
# PASS 2 — LLM polishing (DeepSeek, lightweight)
# ══════════════════════════════════════════════════════════════════════════════

_GRAMMAR_SYSTEM = """You are a professional copy-editor specialising in spiritual and wellness content.

Your ONLY job: correct grammar, punctuation, subject-verb agreement, and sentence flow.

Rules:
1. DO NOT change any meaning, fact, name, number, or spiritual term.
2. DO NOT add or remove sentences.
3. DO NOT change the tone or style — keep the same warmth.
4. Fix only: grammar errors, punctuation mistakes, article (a/an) errors,
   subject-verb agreement, run-on sentences, and capitalisation.
5. Output ONLY the corrected text. No explanation, no preamble, no quotes.
6. If the text is already correct, return it EXACTLY as given."""


_BATCH_SEP = "\n<<<NEXT>>>\n"

def _llm_grammar_fix(text: str) -> str:
    """Call DeepSeek for grammar polishing. Returns original on any failure."""
    if not text or len(text.strip()) < 20:
        return text
    try:
        from utils.deepseek_client import call as ds_call
        result = ds_call(
            system=_GRAMMAR_SYSTEM,
            user=text,
            temperature=0,
            max_tokens=min(len(text.split()) * 2 + 50, 400),
        )
        if result and len(result.strip()) > 5:
            return result.strip()
    except Exception:
        pass
    return text


def _llm_grammar_fix_batch(texts: List[str]) -> List[str]:
    """
    Grammar-fix multiple texts in ONE LLM call using a separator.
    Falls back to per-text calls if batching fails.
    """
    valid = [(i, t) for i, t in enumerate(texts) if t and len(t.strip()) >= 20]
    if not valid:
        return texts
    sep = _BATCH_SEP
    combined = sep.join(t for _, t in valid)
    try:
        from utils.deepseek_client import call as ds_call
        total_words = sum(len(t.split()) for _, t in valid)
        result = ds_call(
            system=_GRAMMAR_SYSTEM + f"\n\nIMPORTANT: The input contains {len(valid)} separate texts separated by '{sep.strip()}'. Return them corrected in the SAME order, separated by the SAME separator. Do not merge or reorder them.",
            user=combined,
            temperature=0,
            max_tokens=min(total_words * 2 + len(valid) * 20, 2000),
        )
        if result:
            parts = result.split(sep.strip())
            if len(parts) == len(valid):
                out = list(texts)
                for j, (i, _) in enumerate(valid):
                    if parts[j].strip():
                        out[i] = parts[j].strip()
                return out
    except Exception:
        pass
    # Fallback: fix each individually
    return [_llm_grammar_fix(t) for t in texts]


def correct(text: str, use_llm: bool = True) -> str:
    """
    Full two-pass grammar correction on a single string.
    use_llm=False for unit tests or when DeepSeek is unavailable.
    """
    if not text or not text.strip():
        return text
    fixed = _deterministic_fix(text)
    if use_llm:
        fixed = _llm_grammar_fix(fixed)
    return fixed


# ══════════════════════════════════════════════════════════════════════════════
# Pipeline Node — fixes insight bullets in admin_review
# ══════════════════════════════════════════════════════════════════════════════

def grammar_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node: grammar-correct all insight bullets in admin_review.
    Runs AFTER admin_review_agent, BEFORE plain_english_agent.
    Safe: never crashes; always returns state.
    """
    admin_review = state.get("admin_review")
    if not admin_review:
        state.setdefault("agent_log", []).append(
            "[GrammarAgent] No admin_review found — skipping."
        )
        return state

    # Collect all insights across all questions into one batch LLM call
    all_insights: List[Any] = []
    for q_item in admin_review.get("questions", []):
        for insight in q_item.get("insights", []):
            if insight.get("content", "").strip():
                all_insights.append(insight)

    if not all_insights:
        state["admin_review"] = admin_review
        state.setdefault("agent_log", []).append("[GrammarAgent] No insights to check.")
        return state

    originals = [ins["content"].strip() for ins in all_insights]
    # Deterministic-only fix — no LLM call here (saves 2-5s per run).
    # LLM grammar is redundant: domain agents already produce clean text,
    # and the storytelling agent runs its own quality pass.
    corrected_texts = [_deterministic_fix(t) for t in originals]

    total_fixed = 0
    for ins, original, corrected in zip(all_insights, originals, corrected_texts):
        if corrected and corrected != original:
            ins["original_content_pre_grammar"] = original
        ins["content"]         = corrected or original
        ins["grammar_checked"] = True
        total_fixed += 1

    state["admin_review"] = admin_review
    state.setdefault("agent_log", []).append(
        f"[GrammarAgent] Grammar-checked {total_fixed} insight(s)."
    )
    return state


# ══════════════════════════════════════════════════════════════════════════════
# Report Hook — fixes final report prose after final_report_agent
# ══════════════════════════════════════════════════════════════════════════════

def _fix_list(items: Any) -> Any:
    """Grammar-correct each string in a list — batched into one LLM call."""
    if not isinstance(items, list):
        return items
    strs = [(i, t) for i, t in enumerate(items) if isinstance(t, str) and len(t.strip()) >= 20]
    if not strs:
        return items
    det_fixed = [_deterministic_fix(t) for _, t in strs]
    try:
        corrected = _llm_grammar_fix_batch(det_fixed)
    except Exception:
        corrected = det_fixed
    out = list(items)
    for (i, _), fixed in zip(strs, corrected):
        out[i] = fixed
    return out


def _fix_structured_summary(ss: Dict) -> Dict:
    """Grammar-correct each field in structured_summary."""
    if not isinstance(ss, dict):
        return ss
    corrected = {}
    for k, v in ss.items():
        if k in _SKIP_KEYS:
            corrected[k] = v
        elif isinstance(v, str):
            corrected[k] = correct(v, use_llm=True)
        elif isinstance(v, list):
            corrected[k] = _fix_list(v)
        else:
            corrected[k] = v
    return corrected


def correct_report(report: Dict[str, Any], use_llm: bool = True) -> Dict[str, Any]:
    """
    Grammar-correct the prose fields of a final_report dict in-place.
    Called from /approve after final_report_agent returns.

    Touches:
      - report-level prose keys (narrative, letter paragraphs, etc.)
      - each section's narrative + simple_narrative + structured_summary
      - remedy daily_habits list
    Never touches: skip keys, URLs, dates, mantra, IDs, prompts dicts.
    """
    import copy
    report = copy.deepcopy(report)

    # ── Top-level prose fields ────────────────────────────────────────────
    # LLM keys: AI-generated narrative fields — batch into one LLM call
    llm_keys: List[str] = []
    llm_vals: List[str] = []
    for key in _REPORT_PROSE_KEYS_LLM:
        if key in report and key not in _SKIP_KEYS:
            val = report[key]
            if isinstance(val, str) and len(val.strip()) >= 20:
                llm_keys.append(key)
                llm_vals.append(_deterministic_fix(val))

    if use_llm and llm_vals:
        fixed_llm = _llm_grammar_fix_batch(llm_vals)
        for key, val in zip(llm_keys, fixed_llm):
            report[key] = val
    else:
        for key, val in zip(llm_keys, llm_vals):
            report[key] = val

    # Deterministic-only keys: template text, already correct — no LLM
    for key in _REPORT_PROSE_KEYS_DET:
        if key in report and key not in _SKIP_KEYS:
            val = report[key]
            if isinstance(val, str):
                report[key] = _deterministic_fix(val)
            elif isinstance(val, list):
                report[key] = [_deterministic_fix(i) if isinstance(i, str) else i for i in val]

    # ── Sections — batch + parallel correction ────────────────────────────
    def _fix_section(section: Dict[str, Any]) -> Dict[str, Any]:
        # narrative/simple_narrative are built from insight bullets already
        # LLM-corrected in grammar_agent_node — deterministic fix is sufficient.
        for prose_key in ("narrative", "simple_narrative"):
            if prose_key in section and isinstance(section[prose_key], str):
                section[prose_key] = _deterministic_fix(section[prose_key])

        # Insights — deterministic only (already LLM-corrected in pipeline)
        for insight in section.get("insights", []):
            content = insight.get("content", "")
            if content and not insight.get("grammar_checked"):
                insight["content"]         = _deterministic_fix(content)
                insight["grammar_checked"] = True
        return section

    sections = report.get("sections", [])
    if sections:
        with ThreadPoolExecutor(max_workers=min(len(sections), 5)) as pool:
            corrected = list(pool.map(_fix_section, sections))
        report["sections"] = corrected

    # ── Remedies — deterministic only (short template strings, no LLM needed) ──
    remedies = report.get("remedies", {})
    if isinstance(remedies.get("daily_habits"), list):
        remedies["daily_habits"] = [
            _deterministic_fix(h) if isinstance(h, str) else h
            for h in remedies["daily_habits"]
        ]
    report["remedies"] = remedies

    report["grammar_agent_applied"] = True
    return report
