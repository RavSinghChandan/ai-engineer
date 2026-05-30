"""
Compound incident analyzer.
When an incident spans multiple domains (e.g. K8s + DB + networking),
this agent decomposes the incident into sub-problems and maps each to
the right runbook category — using structured reasoning, not similarity.
"""
import json
import re
from typing import List


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    return m.group(1).strip() if m else text
from utils.llm import call_llm

SYSTEM = """You are an expert SRE decomposing a complex incident into sub-problems.

Given a multi-domain incident, extract each distinct sub-problem and classify it.

Respond with JSON only:
{
  "is_compound": true/false,
  "sub_incidents": [
    {
      "domain": one of [networking, database, kubernetes, security, storage, cicd, monitoring, other],
      "description": "specific sub-problem description",
      "severity": one of [P1, P2, P3, P4],
      "search_terms": ["2-3 search terms"],
      "execution_order": 1   // which sub-problem to tackle first (1 = first)
    }
  ],
  "reasoning": "one sentence explaining the decomposition strategy"
}

Execution order rules:
- Security issues always go first (execution_order: 1)
- Networking before application-layer (can't fix K8s if network is down)
- Database before application (app needs DB to function)
- Order by blast radius: widest impact first"""


def analyze_compound_incident(incident_text: str) -> dict:
    """Decompose a complex incident into ordered sub-problems."""
    try:
        response = call_llm(SYSTEM, f"Incident: {incident_text}", max_tokens=1024)
        parsed = json.loads(_strip_fences(response))

        sub_incidents = sorted(
            parsed.get("sub_incidents", []),
            key=lambda x: x.get("execution_order", 99),
        )

        return {
            "is_compound": parsed.get("is_compound", False),
            "sub_incidents": sub_incidents,
            "reasoning": parsed.get("reasoning", ""),
            "total_domains": len(sub_incidents),
        }

    except Exception:
        # Fallback: treat as single incident
        return {
            "is_compound": False,
            "sub_incidents": [{
                "domain": "other",
                "description": incident_text,
                "severity": "P2",
                "search_terms": incident_text.split()[:3],
                "execution_order": 1,
            }],
            "reasoning": "Could not decompose — treating as single incident",
            "total_domains": 1,
        }
