"""
Classifies the runbook category and severity from raw text.
RAGless: pure LLM structured extraction — no vectors.
"""
import json
import re
from graph.state import ExtractionState
from utils.llm import call_llm


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    return m.group(1).strip() if m else text

SYSTEM = """You are an IT runbook classifier. Given raw text from a runbook PDF,
extract the classification metadata.

Respond with JSON only:
{
  "title": "short title of the runbook",
  "description": "one sentence describing what this runbook solves",
  "category": one of [networking, database, kubernetes, security, storage, cicd, monitoring, other],
  "severity": one of [P1, P2, P3, P4],
  "tags": ["list", "of", "relevant", "tags"],
  "estimated_duration_minutes": integer
}

Category guidelines:
- P1: System down, data loss, security breach
- P2: Major feature unavailable, significant degradation
- P3: Minor feature unavailable, workaround exists
- P4: Cosmetic issue, low impact"""


def classify_agent(state: ExtractionState) -> ExtractionState:
    text = state.get("raw_text", "")[:4000]  # first 4000 chars is enough for classification
    prompt = f"Runbook text:\n\n{text}"

    try:
        response = call_llm(SYSTEM, prompt, max_tokens=512)
        parsed = json.loads(_strip_fences(response))
        state["title"] = parsed.get("title", state.get("filename", "Unknown"))
        state["description"] = parsed.get("description", "")
        state["category"] = parsed.get("category", "other")
        state["severity"] = parsed.get("severity", "P3")
        state["tags"] = parsed.get("tags", [])
        state["estimated_duration_minutes"] = int(parsed.get("estimated_duration_minutes", 15))
        state["agent_log"] = state.get("agent_log", []) + [
            f"classify_agent: {state['category']} / {state['severity']} — {state['title']}"
        ]
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        state["title"] = state.get("filename", "Unknown")
        state["category"] = "other"
        state["severity"] = "P3"
        state["tags"] = []
        state["estimated_duration_minutes"] = 15
        state["extraction_error"] = f"classify_agent: {exc}"
        state["agent_log"] = state.get("agent_log", []) + [f"classify_agent: error — {exc}"]

    return state
