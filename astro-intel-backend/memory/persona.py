"""
Persona Injector — builds Chandan's system context block.

Called once at the START of each pipeline run.  Combines:
  1. Static persona prompt (Chandan's voice, tone, forbidden patterns)
  2. Dynamic episodic recall (top-K most relevant past corrections)

Returns a `chandan_preferences` dict that gets merged into LangGraph state.
Every agent that calls build_prompt() will receive these preferences via
the shared state, so corrections propagate automatically without touching
any agent individually.
"""
from __future__ import annotations

from typing import Any, Dict, List

from memory.episodic import retrieve_similar_corrections, get_persona_prefs

# ── Static persona definition ─────────────────────────────────────────────────
# This is Chandan's voice.  Edit this block to refine tone over time.
CHANDAN_PERSONA = """
You are generating astrology and spiritual insights for Chandan Kumar Rav,
a Senior AI Engineer who is also a practicing astrologer.

IDENTITY:
- Scientific mind + Vedic spiritual grounding
- Progressive, dynamic, holistic thinker
- Speaks with authority but never arrogance
- Bridges ancient wisdom with modern analytical reasoning

TONE RULES (always apply):
- Use grounded, precise language — no vague filler phrases
- Avoid: "may", "might", "could possibly", "perhaps" when confidence is high
- Prefer: direct declarative statements ("Saturn in your 10th house indicates...")
- Spiritual language should feel elevated, not theatrical
- Each finding must connect cause → effect → practical action
- Never repeat the same insight in different words

STRUCTURAL PREFERENCES:
- Lead with the strongest insight, not the mildest
- Cross-domain agreements (3+ traditions) get stated as facts, not possibilities
- Remedies must be specific: day, time, material, duration — no generic advice
- Numbers matter: use exact dasha periods, exact planetary degrees when known

FORBIDDEN PATTERNS:
- "The stars suggest you may want to consider..."  → too weak
- "It is possible that..." → only for genuinely low-confidence findings
- Repeating "powerful" or "strong" more than once per section
- Generic remedies: "meditate daily", "stay positive" without specifics
"""


def build_chandan_context(
    query: str,
    intent: str = "general",
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Returns the full chandan_preferences payload to inject into LangGraph state.

    Structure:
    {
      "persona_prompt": str,          # static voice/tone rules
      "past_corrections": [...],      # top-K episodic recalls
      "preference_overrides": {...},  # any saved key-value prefs
      "correction_summary": str,      # human-readable hint for agents
    }
    """
    past = retrieve_similar_corrections(query=query, intent=intent, top_k=top_k)
    prefs = get_persona_prefs()

    # Build a compact hint string so agents can consume it without parsing JSON
    if past:
        lines = ["Chandan's known corrections for similar insights:"]
        for i, c in enumerate(past, 1):
            tag = f" [{c['reason_tag']}]" if c["reason_tag"] else ""
            lines.append(
                f"  {i}. ORIGINAL: \"{c['original'][:120]}...\"\n"
                f"     CORRECTED: \"{c['corrected'][:120]}...\"{tag}"
            )
        correction_summary = "\n".join(lines)
    else:
        correction_summary = "No past corrections on file for this query type."

    return {
        "persona_prompt":       CHANDAN_PERSONA,
        "past_corrections":     past,
        "preference_overrides": prefs,
        "correction_summary":   correction_summary,
    }


def format_for_prompt(chandan_preferences: Dict[str, Any]) -> str:
    """
    Formats the chandan_preferences dict into a block that can be prepended
    to any agent's system prompt.  Agents call this directly.
    """
    persona   = chandan_preferences.get("persona_prompt", "")
    summary   = chandan_preferences.get("correction_summary", "")
    overrides = chandan_preferences.get("preference_overrides", {})

    parts = [persona]

    if summary and "No past" not in summary:
        parts.append(f"\nLEARNED CORRECTIONS (apply these patterns):\n{summary}")

    if overrides:
        override_lines = "\n".join(f"  - {k}: {v}" for k, v in overrides.items())
        parts.append(f"\nADMIN PREFERENCE OVERRIDES:\n{override_lines}")

    return "\n".join(parts)
