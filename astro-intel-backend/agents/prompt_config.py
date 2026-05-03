"""
Admin Prompt Version Config
===========================
As admin, change ACTIVE_PROMPT_VERSION to switch ALL agents between:

  "v1"  — Warm, exploratory, encouraging (current default)
  "v2"  — Laser-sharp, direct, conversion-focused (recommended for paid PDF reports)

You can also override individual agents below in AGENT_VERSION_OVERRIDES.
Example:  AGENT_VERSION_OVERRIDES = {"meta": "v2", "simplify": "v2"}
"""

# ── Master switch ──────────────────────────────────────────────────────────────
ACTIVE_PROMPT_VERSION: str = "v2"   # "v1" or "v2"

# ── Per-agent overrides (optional — leave empty to use master switch) ──────────
AGENT_VERSION_OVERRIDES: dict = {}
# Example:
# AGENT_VERSION_OVERRIDES = {
#     "astrology":  "v2",
#     "numerology": "v2",
#     "meta":       "v2",
#     "simplify":   "v2",
#     "report":     "v2",
# }


def get_version(agent_key: str) -> str:
    """Return the active prompt version for a given agent."""
    return AGENT_VERSION_OVERRIDES.get(agent_key, ACTIVE_PROMPT_VERSION)
