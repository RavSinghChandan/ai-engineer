"""
Extracts ordered steps with exact commands from runbook text.
RAGless: LLM → strict JSON schema — no chunking, no similarity search.
Exact commands preserved character-for-character.
"""
import json
import re
from graph.state import ExtractionState
from utils.llm import call_llm


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    return m.group(1).strip() if m else text

SYSTEM = """You are an expert IT runbook parser. Extract ALL steps from the runbook text.

CRITICAL RULES:
1. Preserve exact commands — do NOT paraphrase or simplify any command
2. Every step must have a step_number starting from 1
3. depends_on lists step_numbers that MUST complete before this step
4. Extract ALL commands including flags, paths, environment variables exactly as written

Respond with JSON only:
{
  "steps": [
    {
      "step_number": 1,
      "title": "short action title",
      "description": "what this step does and why",
      "commands": ["exact command 1", "exact command 2"],
      "expected_output": "what success looks like",
      "depends_on": [],
      "is_optional": false,
      "timeout_seconds": 60
    }
  ],
  "prerequisites": ["list of things needed before starting"],
  "rollback_steps": [
    {
      "step_number": 1,
      "title": "rollback action",
      "description": "how to undo this",
      "commands": ["exact rollback command"],
      "expected_output": "",
      "depends_on": [],
      "is_optional": false,
      "timeout_seconds": 30
    }
  ]
}"""


_MAX_CHARS = 12000


def steps_agent(state: ExtractionState) -> ExtractionState:
    text = state.get("raw_text", "")

    # BUG FIX: silent truncation meant runbooks longer than 12000 chars lost steps with no
    # indication in the agent_log — operators had no way to know the extraction was partial
    truncated = len(text) > _MAX_CHARS
    text_chunk = text[:_MAX_CHARS]
    prompt = f"Runbook title: {state.get('title', '')}\n\nRunbook text:\n\n{text_chunk}"

    try:
        response = call_llm(SYSTEM, prompt, max_tokens=4096)
        parsed = json.loads(_strip_fences(response))

        steps = parsed.get("steps", [])
        rollback = parsed.get("rollback_steps", [])
        prereqs = parsed.get("prerequisites", [])

        # Validate and normalize steps
        validated_steps = []
        for s in steps:
            validated_steps.append({
                "step_number": int(s.get("step_number", 0)),
                "title": str(s.get("title", "")),
                "description": str(s.get("description", "")),
                "commands": [str(c) for c in s.get("commands", [])],
                "expected_output": str(s.get("expected_output", "")),
                "depends_on": [int(d) for d in s.get("depends_on", [])],
                "is_optional": bool(s.get("is_optional", False)),
                "timeout_seconds": int(s.get("timeout_seconds", 60)),
            })

        state["steps"] = sorted(validated_steps, key=lambda x: x["step_number"])
        state["rollback_steps"] = rollback
        state["prerequisites"] = prereqs
        truncation_note = f" [WARNING: input truncated at {_MAX_CHARS} chars — steps may be incomplete]" if truncated else ""
        state["agent_log"] = state.get("agent_log", []) + [
            f"steps_agent: extracted {len(validated_steps)} steps, "
            f"{len(rollback)} rollback steps, {len(prereqs)} prerequisites{truncation_note}"
        ]

    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        state["steps"] = []
        state["rollback_steps"] = []
        state["prerequisites"] = []
        state["extraction_error"] = f"steps_agent: {exc}"
        state["agent_log"] = state.get("agent_log", []) + [f"steps_agent: error — {exc}"]

    return state
