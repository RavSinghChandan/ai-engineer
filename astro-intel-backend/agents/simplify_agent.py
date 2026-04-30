"""
Simplify Agent
Converts approved insights into a structured, bullet-point summary that:
  - Answers WHO / WHAT / WHEN / WHERE / HOW for each question
  - Is written in plain English (no jargon)
  - Ends with practical remedies (habits, mantra, colors)

Output format is a list of structured dicts per question — the frontend
renders them as bullets in the Summary section of the PDF.
"""
from __future__ import annotations
import re
from typing import Any, Dict, List, Optional
from agents.agent_prompts import SIMPLIFY_AGENT


# ── Jargon → plain English ─────────────────────────────────────────────────────
JARGON_MAP = {
    r"\bLagna\b":                   "rising sign",
    r"\bGemini Lagna\b":            "Gemini rising sign",
    r"\bSagittarius Lagna\b":       "Sagittarius rising sign",
    r"\bRahu dasha\b":              "your current Rahu life phase",
    r"\bdasha\b":                   "life phase",
    r"\bDasha\b":                   "life phase",
    r"\bnakshatra\b":               "lunar star sign",
    r"\bNakshatra\b":               "lunar star sign",
    r"\bVishakha nakshatra\b":      "Vishakha lunar star",
    r"\b7th house\b":               "marriage area of your chart",
    r"\b10th house\b":              "career area of your chart",
    r"\b2nd house\b":               "wealth area of your chart",
    r"\b6th house\b":               "health area of your chart",
    r"\b7th cusp sub-lord\b":       "the marriage timing indicator",
    r"\bKP system\b":               "KP astrology",
    r"\bKP analysis\b":             "this analysis",
    r"\bVedic\b":                   "Indian",
    r"\bPythagorean\b":             "Western",
    r"\bChaldean\b":                "ancient Chaldean",
    r"\bLife Path\b":               "life path number",
    r"\bName Number\b":             "name number",
    r"\bSoul Urge number\b":        "inner soul number",
    r"\bpersonal year cycles\b":    "personal year number cycles",
    r"\bMount of Venus\b":          "Venus mount on your palm",
    r"\bheart line\b":              "heart line on your palm",
    r"\bVenus placement\b":         "Venus position in your chart",
    r"\bouter-planet transits\b":   "current planetary movements",
    r"\bcross-cultural\b":          "from a different background",
    r"\bauspicious\b":              "very favourable",
    r"\bphilosophical\b":           "thoughtful",
    r"\bsub-lord signification\b":  "marriage timing marker",
    r"\bdasha period\b":            "life phase",
}

TRADITION_PREFIXES = [
    "From the Vedic perspective,",
    "From the Indian Numerology perspective,",
    "From the Chaldean Numerology perspective,",
    "From the Pythagorean Numerology perspective,",
    "From the KP system perspective,",
    "From the Western astrology perspective,",
    "In Western astrology,",
    "The KP system analyses the 7th cusp sub-lord directly for marriage timing.",
    "The combined wisdom of",
]

CLOSING_PATTERN = re.compile(r"The combined wisdom of .+ yields the most favou?rable outcomes\.")

# ── HW question extractors per intent ─────────────────────────────────────────

HW_TEMPLATES: Dict[str, Dict[str, str]] = {
    "marriage": {
        "who":   "Who is the right partner for you?",
        "what":  "What does your chart say about marriage?",
        "when":  "When is the best time to get married?",
        "where": "Where should you focus your energy to attract the right person?",
        "how":   "How can you prepare yourself for a meaningful relationship?",
    },
    "career": {
        "who":   "Who can help you grow professionally?",
        "what":  "What career direction suits you best?",
        "when":  "When is the best time to make a career move?",
        "where": "Where should you focus your professional efforts?",
        "how":   "How can you make the most of this career phase?",
    },
    "finance": {
        "who":   "Who should you consult for financial decisions?",
        "what":  "What financial opportunities are indicated?",
        "when":  "When is the best time to invest or save?",
        "where": "Where should your financial energy be directed?",
        "how":   "How can you build lasting financial stability?",
    },
    "health": {
        "who":   "Who should you consult for your health?",
        "what":  "What health areas need attention?",
        "when":  "When should you take action on your health?",
        "where": "Where in the body does your chart show sensitivity?",
        "how":   "How can you strengthen your health and vitality?",
    },
    "spirituality": {
        "who":   "Who or what can guide your spiritual growth?",
        "what":  "What spiritual practices are indicated for you?",
        "when":  "When is the best time for spiritual practice?",
        "where": "Where should you create your spiritual space?",
        "how":   "How can you deepen your spiritual connection?",
    },
    "education": {
        "who":   "Who can support your educational journey?",
        "what":  "What subjects or skills are highlighted for you?",
        "when":  "When is the best time for exams or new courses?",
        "where": "Where should you focus your learning efforts?",
        "how":   "How can you improve your study and retention?",
    },
    "travel": {
        "who":   "Who should you travel with or consult?",
        "what":  "What kind of travel or relocation is indicated?",
        "when":  "When is the best time to travel or move?",
        "where": "Where are you most likely to succeed or thrive?",
        "how":   "How should you prepare for the journey ahead?",
    },
    "children": {
        "who":   "Who plays a key role in your family journey?",
        "what":  "What does your chart say about children and family?",
        "when":  "When is the best time for family planning?",
        "where": "Where should you focus to strengthen family bonds?",
        "how":   "How can you create a nurturing environment?",
    },
    "general": {
        "who":   "Who are the key people in your journey right now?",
        "what":  "What is the overall theme of this life phase?",
        "when":  "When will the key changes take place?",
        "where": "Where should you direct your energy?",
        "how":   "How can you make the most of this phase?",
    },
}


# ── Keyword buckets for generic HW slot assignment ─────────────────────────────

# Sentences containing these keywords get pulled into the matching slot
_SLOT_KEYWORDS: Dict[str, List[str]] = {
    "who":   ["partner", "person", "mentor", "guide", "support", "advisor", "doctor",
              "colleague", "friend", "family", "teacher", "consultant", "compatibility",
              "life path", "soulmate", "companion"],
    "what":  ["indicates", "suggests", "shows", "analysis", "chart", "tradition",
              "reading", "insight", "energy", "theme", "pattern", "overview",
              "favourable", "positive", "active", "highlighted"],
    "when":  ["age", "ages", "year", "month", "period", "phase", "timing", "time",
              "window", "cycle", "soon", "current", "next", "within"],
    "where": ["focus", "environment", "place", "setting", "direction", "zone",
              "space", "location", "area", "field", "sector", "channel"],
    "how":   ["practice", "action", "step", "habit", "meditation", "mantra", "routine",
              "daily", "consistent", "build", "invest", "work on", "take", "start",
              "begin", "open", "communicate", "express"],
}

# Generic second-sentence additions per slot (used when insight is only 1 sentence)
_SLOT_SECOND: Dict[str, str] = {
    "who":   "The right people and circumstances are drawn toward those who are clear about their values and what they want.",
    "what":  "Multiple spiritual traditions agree on this theme, which increases the reliability of this indication.",
    "when":  "Acting with intention during this active window will yield far better results than waiting for conditions to be perfect.",
    "where": "Environments that feel naturally aligned with your energy are showing you where your momentum most wants to flow.",
    "how":   "Consistent small actions, taken daily without exception, will compound into significant change within 90 days.",
}


# ── Deduplication (75 % word-overlap rule) ─────────────────────────────────────

def _deduplicate(sentences: List[str]) -> List[str]:
    """Remove near-duplicate sentences that share ≥ 75 % of their words."""
    kept: List[str] = []
    for s in sentences:
        words_s = set(s.lower().split())
        duplicate = False
        for k in kept:
            words_k = set(k.lower().split())
            if not words_s or not words_k:
                continue
            overlap = len(words_s & words_k) / max(len(words_s), len(words_k))
            if overlap >= 0.75:
                duplicate = True
                break
        if not duplicate:
            kept.append(s)
    return kept


# ── Generic HW answer extractor ────────────────────────────────────────────────

def _extract_hw_answers(
    intent: str,
    insights: List[Dict[str, Any]],
    memory: Dict[str, Any],
) -> Dict[str, str]:
    """
    Build WHO/WHAT/WHEN/WHERE/HOW answers generically from actual insight sentences.
    Works for any question type — no hardcoded per-intent logic.
    Each answer is guaranteed to be at least 2 sentences.
    """
    # Flatten all insight sentences, applying jargon cleanup
    all_sentences: List[str] = []
    for ins in insights:
        content = _apply_jargon(ins.get("content", "").strip())
        for s in re.split(r'(?<=[.!?])\s+', content):
            s = s.strip()
            if s:
                all_sentences.append(s)

    # Also deduplicate (same 75% overlap rule)
    all_sentences = _deduplicate(all_sentences)

    # Assign sentences to slots by keyword matching
    slots: Dict[str, List[str]] = {k: [] for k in ["who", "what", "when", "where", "how"]}
    used: set = set()

    for slot, keywords in _SLOT_KEYWORDS.items():
        for s in all_sentences:
            if id(s) in used:
                continue
            if any(kw in s.lower() for kw in keywords):
                slots[slot].append(s)
                used.add(id(s))
                if len(slots[slot]) >= 2:
                    break

    # Fill any slot that got nothing with the best remaining sentences
    remaining = [s for s in all_sentences if id(s) not in used]
    r_idx = 0
    for slot in ["who", "what", "when", "where", "how"]:
        if not slots[slot] and remaining:
            slots[slot].append(remaining[r_idx % len(remaining)])
            r_idx += 1

    # Build final answers — each must have exactly 2 sentences
    answers: Dict[str, str] = {}
    for slot in ["who", "what", "when", "where", "how"]:
        sents = slots[slot]
        if not sents:
            # Pure fallback from memory data
            sents = [_memory_fallback(slot, intent, memory)]
        first = sents[0]
        if len(sents) >= 2:
            answer = first + " " + sents[1]
        else:
            answer = first.rstrip(".") + ". " + _SLOT_SECOND[slot]
        answers[slot] = answer

    return answers


def _memory_fallback(slot: str, intent: str, memory: Dict[str, Any]) -> str:
    """Last-resort single sentence built from memory when insights cover no keywords."""
    astro  = memory.get("astrology", {})
    vedic  = astro.get("vedic", {})
    chart  = vedic.get("chart", {}) if vedic else {}
    lagna  = chart.get("lagna", "")
    dasha  = (vedic.get("dasha_planet", "") or "Jupiter") if vedic else "Jupiter"
    num    = memory.get("numerology", {})
    lp     = (num.get("indian") or num.get("pythagorean") or {}).get("life_path_number", "")

    fallbacks: Dict[str, str] = {
        "who":   f"Someone who shares your values and complements your life path{f' number {lp}' if lp else ''}",
        "what":  f"Your {'rising sign ' + lagna if lagna else 'chart'} indicates an active and energised phase for this question",
        "when":  f"The current {dasha} life phase is the primary active window — the next 12 months are especially significant",
        "where": "Wherever you feel most naturally energised and aligned with your intentions",
        "how":   "Take small, consistent, intentional steps each day — clarity of purpose attracts the right outcomes",
    }
    return fallbacks.get(slot, "The combined traditions indicate a positive and active period for this area of your life")


def _apply_jargon(text: str) -> str:
    for pattern, replacement in JARGON_MAP.items():
        text = re.sub(pattern, replacement, text)
    return text


# ── Remedy bullet builder ──────────────────────────────────────────────────────

def _build_remedy_bullets(intent: str, remedies: Dict[str, Any]) -> Dict[str, List[str]]:
    """Pull remedy bullets from the remedy state for this intent/question.
    Works with both per-question remedy dicts (habits/colors) and the
    top-level remedy_agent output (daily_habits/colors).
    """
    # habits — per-question uses "habits", top-level uses "daily_habits"
    habits = (remedies.get("habits") or remedies.get("daily_habits") or [])[:3]

    # mantras — list of dicts with mantra/purpose/count
    mantras = remedies.get("mantras", [])
    mantra_bullets = [
        f"{m['mantra']} — {m['purpose']} ({m.get('count', 108)} times)"
        for m in mantras
        if isinstance(m, dict) and m.get("mantra")
    ][:2]

    # colors — per-question uses "colors", top-level also "colors"
    raw_colors = remedies.get("colors") or []
    color_bullets = [
        c if c.lower().startswith("wear") else f"Wear or surround yourself with {c}"
        for c in raw_colors[:3]
    ]

    return {
        "daily_habits": habits,
        "mantras":      mantra_bullets,
        "lucky_colors": color_bullets,
    }


# ── Main structured summary builder ───────────────────────────────────────────

def build_structured_summary(
    question: str,
    intent: str,
    insights: List[Dict[str, Any]],
    remedies: Dict[str, Any],
    memory: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a structured, bullet-point summary for one question.
    Returns a dict with hw_answers (WHO/WHAT/WHEN/WHERE/HOW) + remedies.
    """
    hw_raw  = _extract_hw_answers(intent, insights, memory)
    hw_clean = {k: _apply_jargon(v) for k, v in hw_raw.items()}

    templates = HW_TEMPLATES.get(intent, HW_TEMPLATES["general"])
    hw_bullets = [
        {"label": templates[k].split("?")[0] + "?", "answer": hw_clean[k]}
        for k in ["who", "what", "when", "where", "how"]
    ]

    remedy_bullets = _build_remedy_bullets(intent, remedies)

    return {
        "question":      question,
        "intent":        intent,
        "hw_bullets":    hw_bullets,
        "remedy_bullets": remedy_bullets,
    }


# ── LLM prompt for structured summary (added to report prompts) ───────────────

def build_structured_summary_prompt(
    question: str,
    intent: str,
    insights: List[Dict[str, Any]],
    subject: str,
    remedies: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Returns a single LLM prompt variant that instructs the model to produce
    a bullet-point WHO/WHAT/WHEN/WHERE/HOW summary + remedies.
    Temperature 0 — fully deterministic.
    """
    insight_block = "\n".join(
        f"- [{ins['confidence'].upper()}] ({', '.join(ins.get('domains', []))}) {ins['content']}"
        for ins in insights
    )
    habits  = "\n".join(f"  - {h}" for h in remedies.get("habits",  [])[:3])
    mantras = "\n".join(
        f"  - {m['mantra']} — {m['purpose']}"
        for m in remedies.get("mantras", [])[:2]
    )
    colors  = ", ".join(remedies.get("colors", [])[:3])

    return {
        "model":       "claude-sonnet-4-6",
        "temperature": SIMPLIFY_AGENT["temperature"],
        "top_p":       SIMPLIFY_AGENT["top_p"],
        "max_tokens":  800,
        "system":      SIMPLIFY_AGENT["system"],
        "user": (
            f"Name: {subject}\n"
            f"Question: {question}\n"
            f"Topic: {intent}\n\n"
            f"Approved insights from multiple spiritual traditions:\n{insight_block}\n\n"
            f"Available remedies:\n"
            f"Daily habits:\n{habits}\n"
            f"Mantras:\n{mantras}\n"
            f"Lucky colors: {colors}\n\n"
            "Write a structured bullet-point summary that directly answers this question. "
            "Format EXACTLY as follows — do not add any other sections:\n\n"
            "**WHO** — Who is the key person, support, or guide for this question (1 bullet)\n"
            "**WHAT** — What does the analysis say about this question (1–2 bullets)\n"
            "**WHEN** — When is the best timing, with specific ages or timeframe (1 bullet)\n"
            "**WHERE** — Where to focus energy or what environment supports this (1 bullet)\n"
            "**HOW** — How to take action, 2–3 specific steps (2–3 bullets)\n\n"
            "**Remedies to support your journey:**\n"
            "- Daily habits: list 2–3 from the habits above\n"
            "- Mantra: include 1 mantra with its purpose\n"
            "- Lucky colors: list 2–3 colors to wear or use\n\n"
            "Keep every bullet under 25 words. Plain English only. "
            "Do not repeat the question. Do not add headers beyond what is shown above."
        ),
    }


# ── simplify_narrative kept for backward compat (used by report page) ─────────

def simplify_narrative(
    raw_narrative: str,
    question: str,
    intent: str,
) -> str:
    """
    Legacy prose simplifier — kept so report_agent import still works.
    Now returns a placeholder; the real output is build_structured_summary().
    The report page uses structured_summary when available.
    """
    return raw_narrative  # pass-through; structured_summary is the real output


# ── LangGraph node ─────────────────────────────────────────────────────────────

def simplify_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node — builds structured bullet-point summaries for each section.
    Stores results in state['structured_summaries'] and back-patches
    each section's 'structured_summary' field.
    """
    report  = state.get("final_report", {})
    memory  = state.get("memory", {})
    sections = report.get("sections", [])

    # Get per-question remedies from remedy_agent output
    all_remedies = state.get("remedies", {})
    qr_list      = all_remedies.get("question_remedies", []) if all_remedies else []

    structured_summaries = []

    for i, section in enumerate(sections):
        question = section.get("question", "")
        intent   = section.get("intent", "general")
        insights = section.get("insights", [])

        # Match remedy for this question
        qr = next((r for r in qr_list if r.get("question") == question), {})
        if not qr and qr_list and i < len(qr_list):
            qr = qr_list[i]

        summary = build_structured_summary(question, intent, insights, qr, memory)
        section["structured_summary"] = summary
        structured_summaries.append(summary)

    state["structured_summaries"] = structured_summaries
    state.setdefault("agent_log", []).append(
        f"[SimplifyAgent] Built structured summaries for {len(sections)} section(s)."
    )
    return state
