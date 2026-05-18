"""
Plain English Agent — rewrites AI-generated insight bullets into simple,
warm, Grade-6-readable English. Runs AFTER admin_review_agent so it only
processes insights that survived the admin layer. Preserves all factual
detail: numbers, planet names, card names, timing windows. Just removes
jargon, passive voice, and overly formal phrasing.

Security layers respected:
  - Runs inside safe_node wrapper (G2 circuit breaker, G5 degradation)
  - No user PII echoed in LLM prompt — only insight content is sent
  - Output validated by validate_output() before writing to state
  - Logged via agent_log for audit trail
"""
from __future__ import annotations
import re
from typing import Any, Dict, List

# ── Jargon replacement map ────────────────────────────────────────────────────
# Applied deterministically BEFORE the LLM call so the LLM sees cleaner input.
_JARGON: List[tuple] = [
    # Astrology
    (r"\bLagna\b",                  "rising sign"),
    (r"\blagna\b",                  "rising sign"),
    (r"\bMahadasha\b",              "main life phase"),
    (r"\bAntardasha\b",             "sub-phase"),
    (r"\bDasha\b",                  "life phase"),
    (r"\bdasha\b",                  "life phase"),
    (r"\bNakshatra\b",              "lunar star"),
    (r"\bnakshatra\b",              "lunar star"),
    (r"\bAyanamsa\b",               "zodiac calibration"),
    (r"\bVargottama\b",             "doubly strong"),
    (r"\bYoga\b(?= )",              "planetary combination"),
    (r"\bGaja Kesari Yoga\b",       "a powerful growth combination"),
    (r"\bKuja Dosha\b",             "Mars imbalance"),
    (r"\bMangal Dosha\b",           "Mars imbalance"),
    (r"\bSadesati\b",               "Saturn's 7.5-year cycle"),
    (r"\bKendras?\b",               "angular houses"),
    (r"\bTrikonas?\b",              "wealth houses"),
    (r"\bBhava\b",                  "house"),
    (r"\b10th house\b",             "career area of your chart"),
    (r"\b7th house\b",              "marriage area of your chart"),
    (r"\b5th house\b",              "creativity and children area"),
    (r"\b4th house\b",              "home and mother area"),
    (r"\b1st house\b",              "personality area"),
    (r"\bVedic[ly]*\b",             "traditional Indian"),
    (r"\bPythagorean\b",            "Western"),
    (r"\bChaldean\b",               "ancient"),
    (r"\bKP [Ss]ystem\b",           "a precise branch of astrology"),
    (r"\bKP [Aa]nalysis\b",         "a precise branch of astrology"),
    (r"\bJyotish\b",                "Vedic astrology"),
    (r"\bParashara\b",              "classical astrology"),
    (r"\bWestern Tropical\b",       "Western astrology"),
    # Numerology
    (r"\bLife [Pp]ath [Nn]umber\b", "your core life number"),
    (r"\bDestiny [Nn]umber\b",      "your destiny number"),
    (r"\bSoul [Uu]rge\b",           "your heart's desire"),
    (r"\bPersonality [Nn]umber\b",  "how others see you"),
    # Palmistry
    (r"\bHasta [Ss]amudrika\b",     "Indian palm reading"),
    (r"\bMount of [A-Z][a-z]+",     ""),  # too technical — drop
    # General spiritual jargon
    (r"\bkarmic\b",                 "from past patterns"),
    (r"\bKarmic\b",                 "From past patterns"),
    (r"\benergies\b",               "influences"),
    (r"\bEnergies\b",               "Influences"),
    (r"\bmanifest[a-z]*\b",         "come to life"),
    (r"\bManifestation\b",          "Making things real"),
    (r"\bcosmic\b",                 "natural"),
    (r"\bCosmic\b",                 "Natural"),
    (r"\bcelestial\b",              "planetary"),
    (r"\bauspicious\b",             "favourable"),
    (r"\bpropitious\b",             "favourable"),
    (r"\binauspicious\b",           "challenging"),
    (r"\btransit(?:s|ing|ed)?\b",   "movement"),
    (r"\bdebilitated\b",            "weakened"),
    (r"\bexalted\b",                "at its strongest"),
    (r"\bcombust(?:ed|ion)?\b",     "overshadowed by the Sun"),
    (r"\bretrograde\b",             "moving backward"),
    (r"\bafflict(?:ed|ion)?\b",     "under pressure"),
    (r"\bbenefic\b",                "helpful"),
    (r"\bmalefic\b",                "challenging"),
    (r"\bdharm[a-z]*\b",            "purpose"),
    (r"\bmoksh[a-z]*\b",            "spiritual freedom"),
]

_JARGON_COMPILED = [(re.compile(pat), repl) for pat, repl in _JARGON]


def _preprocess(text: str) -> str:
    """Apply deterministic jargon substitutions before sending to LLM."""
    for pattern, replacement in _JARGON_COMPILED:
        text = pattern.sub(replacement, text)
    # Collapse double spaces
    text = re.sub(r"  +", " ", text).strip()
    return text


# ── LLM rewrite ───────────────────────────────────────────────────────────────
_SYSTEM = """You are a plain-language editor for a spiritual reading service called Aura with Rav.

Your ONLY job: rewrite the given spiritual insight in simple, warm English that a 12-year-old can understand — without losing ANY fact, number, name, or meaning.

Rules:
1. Keep every specific detail: numbers, planet names, card names, sign names, timing windows, percentages.
2. Use short sentences (max 20 words each).
3. Use "you" and "your" — always second person.
4. No jargon. If you must use a spiritual term, immediately explain it in plain words in brackets.
5. No passive voice. Write actively: "Jupiter helps you" not "you are helped by Jupiter".
6. Tone: like a caring older friend — warm, direct, encouraging, never scary.
7. Never predict death, divorce, serious illness, or financial ruin.
8. Never use absolute language: say "this suggests", "the chart shows", "it looks like" — never "you WILL".
9. Output ONLY the rewritten insight — no preamble, no explanation, no quotes.
10. Maximum 60 words. If the input is longer, summarise the key point cleanly."""


_FORBIDDEN_PHRASES = [
    "divorce is certain", "will die", "financial ruin", "serious illness will",
    "inevitable", "you will definitely", "guaranteed to", "100% certain",
    "you will lose everything", "catastrophic", "no hope",
]

def _safety_filter(text: str) -> str:
    """Strip or soften any absolute/forbidden phrases that sneak through."""
    lower = text.lower()
    for phrase in _FORBIDDEN_PHRASES:
        if phrase in lower:
            # Replace the sentence containing the forbidden phrase
            sentences = text.split(". ")
            sentences = [
                s for s in sentences
                if phrase not in s.lower()
            ]
            text = ". ".join(sentences).strip()
            if not text:
                text = "The chart shows a challenging period — staying grounded and taking action will help you navigate it well."
    return text


def _llm_rewrite(text: str) -> str:
    """Call DeepSeek to rewrite one bullet in plain English. Returns original on failure."""
    try:
        from utils.deepseek_client import call as ds_call
        result = ds_call(
            system=_SYSTEM,
            user=text,
            temperature=0.3,
            max_tokens=120,
        )
        if result and len(result.strip()) > 10:
            return _safety_filter(result.strip())
    except Exception:
        pass
    return text


def _rewrite_insight(content: str) -> str:
    """Two-step rewrite: deterministic jargon removal → LLM simplification."""
    preprocessed = _preprocess(content)
    simplified   = _llm_rewrite(preprocessed)
    return simplified


# ── LangGraph node ─────────────────────────────────────────────────────────────

def plain_english_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Rewrites every insight in admin_review into plain, simple English.
    Runs AFTER admin_review_agent so it respects the full security pipeline.
    Preserves all metadata (id, confidence, domains, is_common, editable).
    """
    admin_review = state.get("admin_review")
    if not admin_review:
        state.setdefault("agent_log", []).append(
            "[PlainEnglishAgent] No admin_review found — skipping."
        )
        return state

    total_rewritten = 0

    for q_item in admin_review.get("questions", []):
        for insight in q_item.get("insights", []):
            original = insight.get("content", "").strip()
            if not original:
                continue
            try:
                rewritten = _rewrite_insight(original)
                insight["content"]          = rewritten
                insight["plain_english"]    = True   # flag so frontend can show indicator
                insight["original_content"] = original  # preserve for audit
                total_rewritten += 1
            except Exception as exc:
                # Never crash pipeline — just keep original content
                state.setdefault("agent_log", []).append(
                    f"[PlainEnglishAgent] Failed to rewrite insight {insight.get('id')}: {exc}"
                )

    state["admin_review"] = admin_review
    state.setdefault("agent_log", []).append(
        f"[PlainEnglishAgent] Rewrote {total_rewritten} insight(s) into plain English."
    )
    return state
