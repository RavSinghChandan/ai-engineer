"""
Tenant Persona Injector — builds a tenant's system context block.

Called once at the START of each pipeline run.  Combines:
  1. Tenant-specific persona prompt (voice, tone, forbidden patterns)
     — pulled from the tenant's `__persona__` pref key, or falls back to DEFAULT_PERSONA
  2. Dynamic episodic recall (top-K most relevant past corrections FOR THIS TENANT ONLY)

Returns a `tenant_preferences` dict that gets merged into LangGraph state.
Every agent that calls build_prompt() will receive these preferences via
the shared state, so corrections propagate automatically without touching
any agent individually.

Multi-tenant guarantee:
  Corrections and preferences are strictly scoped by tenant_id.
  Tenant A's data never appears in Tenant B's pipeline — ever.
"""
from __future__ import annotations

from typing import Any, Dict, List

from memory.episodic import retrieve_similar_corrections, get_persona_prefs

# ── Default persona fallback (used when tenant has no custom __persona__ set) ─
DEFAULT_PERSONA = """
You are generating astrology and spiritual insights for this user.

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

# Keep CHANDAN_PERSONA as an alias for backward compatibility (tests import it)
CHANDAN_PERSONA = DEFAULT_PERSONA


def build_tenant_context(
    query: str,
    intent: str,
    tenant_id: str,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Returns the full tenant_preferences payload to inject into LangGraph state.
    Strictly scoped to tenant_id — no cross-tenant leakage.

    Structure:
    {
      "tenant_id":            str,            # which tenant this context belongs to
      "persona_prompt":       str,            # tenant's voice/tone rules (custom or default)
      "past_corrections":     [...],          # top-K episodic recalls FOR THIS TENANT
      "preference_overrides": {...},          # tenant's saved key-value prefs
      "correction_summary":   str,            # human-readable hint for agents
    }
    """
    past  = retrieve_similar_corrections(query=query, intent=intent, tenant_id=tenant_id, top_k=top_k)
    prefs = get_persona_prefs(tenant_id=tenant_id)

    # Tenant can store a fully custom persona under the reserved key `__persona__`
    persona_prompt = prefs.pop("__persona__", DEFAULT_PERSONA)

    # Build a compact hint string so agents can consume it without parsing JSON
    if past:
        lines = [f"Known corrections for similar insights (tenant: {tenant_id}):"]
        for i, c in enumerate(past, 1):
            tag = f" [{c['reason_tag']}]" if c["reason_tag"] else ""
            lines.append(
                f"  {i}. ORIGINAL: \"{c['original'][:120]}...\"\n"
                f"     CORRECTED: \"{c['corrected'][:120]}...\"{tag}"
            )
        correction_summary = "\n".join(lines)
    else:
        correction_summary = "No past corrections on file for this tenant and query type."

    return {
        "tenant_id":            tenant_id,
        "persona_prompt":       persona_prompt,
        "past_corrections":     past,
        "preference_overrides": prefs,
        "correction_summary":   correction_summary,
    }


# Backward-compatible alias used by old tests and any legacy call sites
def build_chandan_context(
    query: str,
    intent: str = "general",
    top_k: int = 5,
) -> Dict[str, Any]:
    """Deprecated alias — calls build_tenant_context with 'tenant_master'."""
    return build_tenant_context(
        query=query,
        intent=intent,
        tenant_id="tenant_master",
        top_k=top_k,
    )


def format_for_prompt(tenant_preferences: Dict[str, Any]) -> str:
    """
    Formats the tenant_preferences dict into a block that can be prepended
    to any agent's system prompt.  Agents call this directly.
    """
    persona   = tenant_preferences.get("persona_prompt", "")
    summary   = tenant_preferences.get("correction_summary", "")
    overrides = tenant_preferences.get("preference_overrides", {})

    parts = [persona]

    if summary and "No past" not in summary:
        parts.append(f"\nLEARNED CORRECTIONS (apply these patterns):\n{summary}")

    if overrides:
        override_lines = "\n".join(f"  - {k}: {v}" for k, v in overrides.items())
        parts.append(f"\nTENANT PREFERENCE OVERRIDES:\n{override_lines}")

    return "\n".join(parts)
