"""
Agent Prompt Configuration
Centralized system prompts, user prompt templates, temperature, and top_p
for every agent in the Aura with Rav 360° pipeline.

Brand identity:
  Practitioner : Chandan Kumar
  Brand        : Aura with Rav
  Services     : Palm Reading · Tarot · Vastu · Numerology · Vedic Astrology
  Tagline      : Guiding Energies, Empowering Lives

Design principles:
  - System prompts establish Chandan's voice: warm, authoritative, non-fearful
  - temperature=0   → fully deterministic (factual structured outputs)
  - temperature=0.1 → near-deterministic (nuanced prose, slight phrasing variety)
  - temperature=0.4 → balanced creativity (narrative, letter, closing)
  - top_p=0.9       → focused vocabulary, avoids hallucinated specifics
  - top_p=0.95      → slightly broader for creative/narrative sections
"""
from __future__ import annotations
from typing import Any, Dict

from prompts.loader import load_system_prompt


# ─────────────────────────────────────────────────────────────────────────────
# 1. QUESTION AGENT
# ─────────────────────────────────────────────────────────────────────────────

QUESTION_AGENT: Dict[str, Any] = {
    "role": "question_normalizer",
    "temperature": 0,
    "top_p": 0.9,
    "system": load_system_prompt("question"),
    "user_template": (
        "Client question: {question}\n\n"
        "Classify into one intent. Return JSON: "
        '{{ "intent": "<category>", "confidence": "high|medium|low", "detected_keywords": ["...", "..."] }}'
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# 2. ASTROLOGY AGENT  (Vedic · KP · Western sub-agents)
# ─────────────────────────────────────────────────────────────────────────────

ASTROLOGY_AGENT: Dict[str, Any] = {
    "role": "astrology_reader",
    "temperature": 0.1,
    "top_p": 0.9,
    "system": load_system_prompt("astrology"),
    "user_template": (
        "Client: {name}, DOB: {dob}, TOB: {tob}, POB: {pob}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Chart data:\n"
        "  Lagna: {lagna} | Moon: {moon} | Sun: {sun}\n"
        "  Nakshatra: {nakshatra} | Current Dasha: {dasha}\n\n"
        "Write a personalised {tradition} astrology reading that directly addresses the question. "
        "Name the specific chart values. Minimum 3 sentences. No bullet points — flowing prose."
    ),
}

ASTROLOGY_AGENT_VEDIC: Dict[str, Any] = {**ASTROLOGY_AGENT, "sub_tradition": "Vedic (Jyotish)", "temperature": 0.1}
ASTROLOGY_AGENT_KP:    Dict[str, Any] = {**ASTROLOGY_AGENT, "sub_tradition": "KP System",        "temperature": 0.0}
ASTROLOGY_AGENT_WESTERN: Dict[str, Any] = {**ASTROLOGY_AGENT, "sub_tradition": "Western",         "temperature": 0.1}


# ─────────────────────────────────────────────────────────────────────────────
# 3. NUMEROLOGY AGENT  (Indian · Chaldean · Pythagorean sub-agents)
# ─────────────────────────────────────────────────────────────────────────────

NUMEROLOGY_AGENT: Dict[str, Any] = {
    "role": "numerology_reader",
    "temperature": 0.1,
    "top_p": 0.9,
    "system": load_system_prompt("numerology"),
    "user_template": (
        "Client: {name}, DOB: {dob}\n"
        "Tradition: {tradition}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Computed numbers:\n"
        "  Life Path: {lp} | Destiny: {dest} | Name Number: {nm}\n"
        "  Soul Urge: {su} | Personality: {pn} | Lucky Numbers: {lucky}\n\n"
        "Write a personalised {tradition} numerology reading that directly answers the question. "
        "Cite the specific numbers. Minimum 3 sentences. Flowing prose."
    ),
}

NUMEROLOGY_AGENT_INDIAN:      Dict[str, Any] = {**NUMEROLOGY_AGENT, "sub_tradition": "Indian Numerology",      "temperature": 0.1}
NUMEROLOGY_AGENT_CHALDEAN:    Dict[str, Any] = {**NUMEROLOGY_AGENT, "sub_tradition": "Chaldean Numerology",    "temperature": 0.0}
NUMEROLOGY_AGENT_PYTHAGOREAN: Dict[str, Any] = {**NUMEROLOGY_AGENT, "sub_tradition": "Pythagorean Numerology", "temperature": 0.1}


# ─────────────────────────────────────────────────────────────────────────────
# 4. TAROT AGENT  (Rider-Waite · Intuitive sub-agents)
# ─────────────────────────────────────────────────────────────────────────────

TAROT_AGENT: Dict[str, Any] = {
    "role": "tarot_reader",
    "temperature": 0.2,
    "top_p": 0.95,
    "system": load_system_prompt("tarot"),
    "user_template": (
        "Client: {name}, DOB: {dob}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Cards drawn:\n"
        "  Past: {card0} ({orient0})\n"
        "  Present: {card1} ({orient1})\n"
        "  Future: {card2} ({orient2})\n\n"
        "Write a flowing tarot reading that names each card, explains its meaning for this question, "
        "and ends with the overall spread message and one action step. Minimum 4 sentences."
    ),
}

TAROT_AGENT_RIDER_WAITE: Dict[str, Any] = {**TAROT_AGENT, "sub_tradition": "Rider-Waite", "temperature": 0.2}
TAROT_AGENT_INTUITIVE:   Dict[str, Any] = {**TAROT_AGENT, "sub_tradition": "Intuitive",   "temperature": 0.3}


# ─────────────────────────────────────────────────────────────────────────────
# 5. PALMISTRY AGENT  (Indian · Chinese · Western sub-agents)
# ─────────────────────────────────────────────────────────────────────────────

PALMISTRY_AGENT: Dict[str, Any] = {
    "role": "palmistry_reader",
    "temperature": 0.1,
    "top_p": 0.9,
    "system": load_system_prompt("palmistry"),
    "user_template": (
        "Client: {name}, DOB: {dob}\n"
        "Tradition: {tradition}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Relevant palm indicators for {intent}: {palm_insight}\n\n"
        "Write a personalised {tradition} palm reading that addresses the question. "
        "Name the specific lines or mounts observed. Minimum 2 sentences. Flowing prose."
    ),
}

PALMISTRY_AGENT_INDIAN:  Dict[str, Any] = {**PALMISTRY_AGENT, "sub_tradition": "Indian Palmistry",  "temperature": 0.1}
PALMISTRY_AGENT_CHINESE: Dict[str, Any] = {**PALMISTRY_AGENT, "sub_tradition": "Chinese Palmistry", "temperature": 0.1}
PALMISTRY_AGENT_WESTERN: Dict[str, Any] = {**PALMISTRY_AGENT, "sub_tradition": "Western Palmistry", "temperature": 0.1}


# ─────────────────────────────────────────────────────────────────────────────
# 6. VASTU AGENT
# ─────────────────────────────────────────────────────────────────────────────

VASTU_AGENT: Dict[str, Any] = {
    "role": "vastu_consultant",
    "temperature": 0.0,
    "top_p": 0.9,
    "system": load_system_prompt("vastu"),
    "user_template": (
        "Client: {name}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Property type: {property_type}\n"
        "Facing direction: {facing}\n"
        "Relevant Vastu zone: {zone}\n"
        "Zone energy status: {zone_energy}\n\n"
        "Write a personalised Vastu reading that addresses the question. "
        "Name the zone, the current energy pattern, and the correction. "
        "End with one specific remedy the client can apply immediately."
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# 7. META AGENT  (cross-domain consensus synthesis)
# ─────────────────────────────────────────────────────────────────────────────

META_AGENT: Dict[str, Any] = {
    "role": "meta_synthesizer",
    "temperature": 0.1,
    "top_p": 0.9,
    "system": load_system_prompt("meta"),
    "user_template": (
        "Client: {name}\n"
        "Question: {question}\n"
        "Intent: {intent}\n\n"
        "Domain insights:\n{domain_insights}\n\n"
        "Find the cross-domain consensus. Write 2–4 synthesis insights that state where "
        "multiple traditions agree, cite which traditions, and give one unified action recommendation."
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# 8. REMEDY AGENT
# ─────────────────────────────────────────────────────────────────────────────

REMEDY_AGENT: Dict[str, Any] = {
    "role": "remedy_advisor",
    "temperature": 0.0,
    "top_p": 0.9,
    "system": load_system_prompt("remedy"),
    "user_template": (
        "Client: {name}, Lagna: {lagna}, Current Dasha: {dasha}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Life Path Number: {lp}\n\n"
        "Prescribe personalised remedies for this question. "
        "Include: 3 daily habits, 1–2 mantras with count, 2–3 lucky colors, "
        "1 optional gemstone with finger placement, and 1 behavioral adjustment. "
        "Every remedy must have a clear 'why' in plain English."
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# 9. ADMIN REVIEW AGENT
# ─────────────────────────────────────────────────────────────────────────────

ADMIN_REVIEW_AGENT: Dict[str, Any] = {
    "role": "admin_reviewer",
    "temperature": 0.0,
    "top_p": 0.9,
    "system": load_system_prompt("admin_review"),
    "user_template": (
        "Client: {name}\n"
        "Question: {question}\n"
        "Intent: {intent}\n\n"
        "Domain outputs:\n{domain_outputs}\n\n"
        "Generate question-specific insights for admin review. "
        "Each insight must directly address the question above. "
        "Minimum 2 sentences per insight. Maximum 6 insights per question."
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# 10. REPORT AGENT  (final 360° narrative)
# ─────────────────────────────────────────────────────────────────────────────

REPORT_AGENT: Dict[str, Any] = {
    "role": "report_writer",
    "temperature": 0.1,
    "top_p": 0.95,
    "system": load_system_prompt("report"),
    "user_template": (
        "Client: {name}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Approved insights:\n{approved_insights}\n\n"
        "Write a personalised report section that directly answers the question, "
        "weaves the approved insights into flowing prose, and ends with one empowering takeaway. "
        "2–3 paragraphs. No bullet points. Warm, personal tone."
    ),
}

# Structured bullet variant (WHO/WHAT/WHEN/WHERE/HOW + remedies)
REPORT_AGENT_STRUCTURED: Dict[str, Any] = {
    "role": "report_writer_structured",
    "temperature": 0.0,
    "top_p": 0.9,
    "system": load_system_prompt("simplify"),
    "user_template": (
        "Client: {name}\n"
        "Question: {question}\n"
        "Intent: {intent}\n"
        "Approved insights:\n{approved_insights}\n"
        "Remedies:\n{remedies}\n\n"
        "Write the structured summary. Format:\n"
        "WHO: <2 sentences — who is the key person/support>\n"
        "WHAT: <2 sentences — what the analysis says>\n"
        "WHEN: <2 sentences — timing with specific ages or window>\n"
        "WHERE: <2 sentences — where to focus energy>\n"
        "HOW: <2 sentences — how to act>\n\n"
        "REMEDIES:\n"
        "Daily Habits: <3 habits>\n"
        "Mantra: <mantra — purpose — count>\n"
        "Lucky Colors: <2–3 colors>"
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# 11. SIMPLIFY AGENT
# ─────────────────────────────────────────────────────────────────────────────

SIMPLIFY_AGENT: Dict[str, Any] = {
    "role": "plain_language_editor",
    "temperature": 0.0,
    "top_p": 0.9,
    "system": load_system_prompt("simplify"),
    "user_template": (
        "Question: {question}\n"
        "Raw analysis:\n{raw_narrative}\n\n"
        "Rewrite this in plain, warm English. Remove duplicates. "
        "Keep all specific details (ages, numbers, card names). Under 200 words."
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# Helper: get prompt config for a given agent role
# ─────────────────────────────────────────────────────────────────────────────

_REGISTRY: Dict[str, Dict] = {
    "question":            QUESTION_AGENT,
    "astrology":           ASTROLOGY_AGENT,
    "astrology_vedic":     ASTROLOGY_AGENT_VEDIC,
    "astrology_kp":        ASTROLOGY_AGENT_KP,
    "astrology_western":   ASTROLOGY_AGENT_WESTERN,
    "numerology":          NUMEROLOGY_AGENT,
    "numerology_indian":   NUMEROLOGY_AGENT_INDIAN,
    "numerology_chaldean": NUMEROLOGY_AGENT_CHALDEAN,
    "numerology_pythagorean": NUMEROLOGY_AGENT_PYTHAGOREAN,
    "tarot":               TAROT_AGENT,
    "tarot_rider_waite":   TAROT_AGENT_RIDER_WAITE,
    "tarot_intuitive":     TAROT_AGENT_INTUITIVE,
    "palmistry":           PALMISTRY_AGENT,
    "palmistry_indian":    PALMISTRY_AGENT_INDIAN,
    "palmistry_chinese":   PALMISTRY_AGENT_CHINESE,
    "palmistry_western":   PALMISTRY_AGENT_WESTERN,
    "vastu":               VASTU_AGENT,
    "meta":                META_AGENT,
    "remedy":              REMEDY_AGENT,
    "admin_review":        ADMIN_REVIEW_AGENT,
    "report":              REPORT_AGENT,
    "report_structured":   REPORT_AGENT_STRUCTURED,
    "simplify":            SIMPLIFY_AGENT,
}


# ═════════════════════════════════════════════════════════════════════════════
# VERSIONED PROMPTS  — v1 (current/warm) and v2 (laser/conversion-focused)
#
# Admin: change ACTIVE_PROMPT_VERSION in agents/prompt_config.py to switch.
# Affects: astrology, numerology, meta, simplify (HW summary), report.
# ═════════════════════════════════════════════════════════════════════════════

# ── ASTROLOGY v1 (current — warm, exploratory) ────────────────────────────────
ASTROLOGY_AGENT_V1: Dict[str, Any] = {
    **ASTROLOGY_AGENT,
    "version": "v1",
    "system": load_system_prompt("astrology", "v1"),
}

# ── ASTROLOGY v2 (laser — direct answer first, specific timing, trust-building) ─
ASTROLOGY_AGENT_V2: Dict[str, Any] = {
    **ASTROLOGY_AGENT,
    "version": "v2",
    "temperature": 0.1,
    "system": load_system_prompt("astrology", "v2"),
    "user_template": (
        "Client: {name}, DOB: {dob}, TOB: {tob}, POB: {pob}\n"
        "Question (answer THIS directly): {question}\n"
        "Intent: {intent}\n"
        "Chart data:\n"
        "  Rising sign (Lagna): {lagna} | Moon sign: {moon} | Sun sign: {sun}\n"
        "  Lunar star (Nakshatra): {nakshatra} | Current life phase (Dasha): {dasha}\n\n"
        "Answer the question directly in this order:\n"
        "1. Direct answer using the actual chart values above.\n"
        "2. Specific timing window (Dasha, sub-Dasha, or transit year).\n"
        "3. One confirming chart factor.\n"
        "4. One clear action the client can take.\n"
        "Exactly 4 sentences. No tradition labels. No vague phrases."
    ),
}

# ── NUMEROLOGY v1 (current — exploratory) ────────────────────────────────────
NUMEROLOGY_AGENT_V1: Dict[str, Any] = {**NUMEROLOGY_AGENT, "version": "v1"}

# ── NUMEROLOGY v2 (laser — number-specific, conversion-focused) ──────────────
NUMEROLOGY_AGENT_V2: Dict[str, Any] = {
    **NUMEROLOGY_AGENT,
    "version": "v2",
    "temperature": 0.0,
    "system": load_system_prompt("numerology", "v2"),
    "user_template": (
        "Client: {name}, DOB: {dob}\n"
        "Tradition: {tradition}\n"
        "Question (answer THIS directly): {question}\n"
        "Intent: {intent}\n"
        "Computed numbers:\n"
        "  Life Path: {lp} | Destiny: {dest} | Name Number: {nm}\n"
        "  Soul Urge: {su} | Personality: {pn} | Lucky Numbers: {lucky}\n\n"
        "Answer the question directly in this order:\n"
        "1. Direct answer using Life Path {lp} and Destiny {dest}.\n"
        "2. Specific Personal Year timing window (calculate from DOB {dob}).\n"
        "3. One confirming number (Name Number {nm} or Soul Urge {su}).\n"
        "4. One actionable step tied to the numbers.\n"
        "Exactly 4 sentences. No tradition labels. State the actual numbers."
    ),
}

# ── META AGENT v1 (current — cross-tradition synthesis) ──────────────────────
META_AGENT_V1: Dict[str, Any] = {**META_AGENT, "version": "v1"}

# ── META AGENT v2 (laser — bold consensus, direct timing, conversion hook) ───
META_AGENT_V2: Dict[str, Any] = {
    **META_AGENT,
    "version": "v2",
    "temperature": 0.0,
    "system": load_system_prompt("meta", "v2"),
    "user_template": (
        "Client: {name}\n"
        "Question (answer THIS directly): {question}\n"
        "Intent: {intent}\n\n"
        "Domain insights:\n{domain_insights}\n\n"
        "Deliver 3 bold cross-tradition insights:\n"
        "1. The strongest consensus point — name the traditions and the specific finding.\n"
        "2. The most specific timing window — year or age range, citing which traditions agree.\n"
        "3. The one unified action — what the client must do, and why multiple traditions agree on it.\n"
        "Each insight: exactly 3 sentences. No tradition prefix labels. No vague phrases."
    ),
}

# ── REPORT AGENT v1 (current — warm prose narrative) ────────────────────────
REPORT_AGENT_V1: Dict[str, Any] = {**REPORT_AGENT, "version": "v1"}

# ── REPORT AGENT v2 (laser — direct answer first, trust-building, conversion) ─
REPORT_AGENT_V2: Dict[str, Any] = {
    **REPORT_AGENT,
    "version": "v2",
    "temperature": 0.1,
    "system": load_system_prompt("report", "v2"),
    "user_template": (
        "Client: {name}\n"
        "Question (open with a direct answer to THIS): {question}\n"
        "Intent: {intent}\n"
        "Approved insights:\n{approved_insights}\n\n"
        "Write 3 tight paragraphs:\n"
        "Para 1: Direct answer + the key chart/number finding that supports it.\n"
        "Para 2: Specific timing window with the actual life phase, year, or age range.\n"
        "Para 3: 2–3 specific action steps + one natural closing sentence that hints at the value of a deeper session.\n"
        "No bullet points. No tradition labels. Every sentence adds new information."
    ),
}

# ── SIMPLIFY / HW SUMMARY v1 (current — keyword-extracted) ──────────────────
SIMPLIFY_AGENT_V1: Dict[str, Any] = {**SIMPLIFY_AGENT, "version": "v1"}

# ── SIMPLIFY / HW SUMMARY v2 (laser — question-locked, answer-first bullets) ─
SIMPLIFY_AGENT_V2: Dict[str, Any] = {
    **SIMPLIFY_AGENT,
    "version": "v2",
    "temperature": 0.0,
    "system": load_system_prompt("simplify", "v2"),
    "user_template": (
        "Name: {subject}\n"
        "Question (every bullet must answer THIS): {question}\n"
        "Topic: {intent}\n\n"
        "Approved insights:\n{insight_block}\n\n"
        "Available remedies:\n"
        "Daily habits:\n{habits}\n"
        "Mantras:\n{mantras}\n"
        "Lucky colors: {colors}\n\n"
        "Write a structured summary. EVERY answer must be specific to THIS question.\n"
        "Do not use vague phrases. Name actual numbers, years, or chart values.\n\n"
        "**WHO** — [name the type of person, energy, or support relevant to this question]\n"
        "**WHAT** — [the single clearest finding — state it as a fact, not a possibility]\n"
        "**WHEN** — [specific year or age window, e.g. '2026–2027 during Jupiter sub-phase']\n"
        "**WHERE** — [specific life domain or environment to focus on]\n"
        "**HOW** — [2 concrete actions, not generic advice]\n\n"
        "**Remedies:**\n"
        "- Daily habits: [2–3 specific habits from the list above]\n"
        "- Mantra: [1 mantra with its purpose]\n"
        "- Lucky colors: [2–3 colors]\n\n"
        "Max 20 words per bullet. No tradition labels. No vague phrases."
    ),
}

# ── Versioned registry ────────────────────────────────────────────────────────
_VERSIONED_REGISTRY: Dict[str, Dict[str, Dict]] = {
    "astrology":  {"v1": ASTROLOGY_AGENT_V1,  "v2": ASTROLOGY_AGENT_V2},
    "numerology": {"v1": NUMEROLOGY_AGENT_V1, "v2": NUMEROLOGY_AGENT_V2},
    "meta":       {"v1": META_AGENT_V1,       "v2": META_AGENT_V2},
    "report":     {"v1": REPORT_AGENT_V1,     "v2": REPORT_AGENT_V2},
    "simplify":   {"v1": SIMPLIFY_AGENT_V1,   "v2": SIMPLIFY_AGENT_V2},
}


def get_prompt(agent_key: str) -> Dict[str, Any]:
    """Return the full prompt config for a given agent key (version-aware)."""
    from agents.prompt_config import get_version
    base_key = agent_key.split("_")[0]  # "astrology_vedic" → "astrology"
    version = get_version(base_key)
    if base_key in _VERSIONED_REGISTRY:
        return _VERSIONED_REGISTRY[base_key].get(version, _REGISTRY.get(agent_key, REPORT_AGENT))
    return _REGISTRY.get(agent_key, REPORT_AGENT)


def build_prompt(agent_key: str, persona_context: str = "", **kwargs: Any) -> Dict[str, Any]:
    """
    Return a ready-to-send prompt dict for the given agent,
    with user_template rendered using the provided kwargs.
    Version-aware: respects ACTIVE_PROMPT_VERSION from prompt_config.py.

    If persona_context is provided (non-empty string), it is prepended to the
    agent's system prompt so that every LLM call receives the tenant's
    correction history and tone rules before domain-specific instructions.
    This is the injection point for the multi-tenant episodic memory system.
    """
    cfg = get_prompt(agent_key).copy()
    user_template = cfg.pop("user_template", "")
    try:
        cfg["user"] = user_template.format(**kwargs)
    except KeyError:
        cfg["user"] = user_template
    # Prepend tenant persona context to system prompt when available
    if persona_context and persona_context.strip():
        cfg["system"] = persona_context.strip() + "\n\n---\n\n" + cfg.get("system", "")
    return cfg
