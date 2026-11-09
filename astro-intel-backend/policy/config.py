"""
Tool policy for the AgentPolicyGuard — which agent may call which tool, and
within which argument boundaries.

    TOOL_POLICY = {
        "<agent_id>": {
            "description": "...",
            "tools": {
                "<tool_name>": {
                    "approval":  False,       # True → a human must approve it for the session
                    "high_risk": False,       # True → any other agent calling it suspends the session
                    "arguments": {            # every argument the tool may receive
                        "<name>": {"type": "int", "min": 1, "max": 2000, "required": True},
                    },
                },
            },
        },
    }

Default deny: an agent that is not listed, a tool that is not listed for the
agent, and an argument that is not listed for the tool are all refused.

Argument rules: type ("str" | "int" | "number" | "bool"), min / max (numbers),
max_len (strings), one_of (allowed values), required (default True).
"""
from __future__ import annotations

from typing import Any, Dict

# A session is suspended after this many refused tool calls.
MAX_DENIALS_PER_SESSION = 3

# Every LLM call goes through utils.deepseek_client.call. prompt_chars is the
# length of system + user prompt, so a runaway prompt is refused before it is sent.
LLM_CHAT: Dict[str, Any] = {
    "approval": False,
    "arguments": {
        "model":        {"type": "str", "one_of": ["deepseek-chat"]},
        "temperature":  {"type": "number", "min": 0.0, "max": 1.0},
        "max_tokens":   {"type": "int", "min": 1, "max": 2000},
        "prompt_chars": {"type": "int", "min": 1, "max": 120_000},
    },
}

# The final report is generated only after an admin approved the session's
# insights (POST /api/v1/analysis/approve).
REPORT_GENERATE: Dict[str, Any] = {
    "approval": True,
    "high_risk": True,
    "arguments": {
        "approved_count": {"type": "int", "min": 0, "max": 1000},
        "rejected_count": {"type": "int", "min": 0, "max": 1000},
        "brand_name":     {"type": "str", "max_len": 200},
    },
}

TOOL_POLICY: Dict[str, Dict[str, Any]] = {
    "holistic_agent":      {"description": "Writes the chapters of the 360° report",
                            "tools": {"llm.chat": LLM_CHAT}},
    "numerology_agent":    {"description": "Numerology reading (hybrid RAG engine)",
                            "tools": {"llm.chat": LLM_CHAT}},
    "remedies_agent":      {"description": "Personalised remedies",
                            "tools": {"llm.chat": LLM_CHAT}},
    "storytelling_agent":  {"description": "Numerology story",
                            "tools": {"llm.chat": LLM_CHAT}},
    "plain_english_agent": {"description": "Rewrites report text in plain English",
                            "tools": {"llm.chat": LLM_CHAT}},
    "simplify_agent":      {"description": "How/when bullets for the final report",
                            "tools": {"llm.chat": LLM_CHAT}},
    "grammar_agent":       {"description": "Polishes wording; may not change facts",
                            "tools": {"llm.chat": LLM_CHAT}},
    "report_agent":        {"description": "Generates the final report from approved insights",
                            "tools": {"report.generate": REPORT_GENERATE}},
}
