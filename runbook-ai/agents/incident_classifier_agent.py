"""
RAGless incident classifier.
Extracts structured fields from a free-text incident description.
No embeddings — LLM produces JSON, we query SQL with exact fields.
"""
import json
from utils.llm import call_llm

SYSTEM = """You are an IT incident classifier. Given a free-text incident description,
extract structured fields to help find the right runbook.

Respond with JSON only:
{
  "keywords": ["list", "of", "key", "technical", "terms"],
  "category": one of [networking, database, kubernetes, security, storage, cicd, monitoring, other],
  "severity": one of [P1, P2, P3, P4],
  "symptoms": ["observable symptoms described"],
  "affected_component": "the system/service affected",
  "search_terms": ["2-4 short search terms to find the right runbook"]
}

Severity guidelines:
- P1: System completely down, data loss, security breach in progress
- P2: Major feature unavailable, many users affected
- P3: Minor feature broken, workaround exists
- P4: Cosmetic, low impact"""


def classify_incident(incident_text: str) -> dict:
    """Extract structured fields from incident description."""
    try:
        response = call_llm(SYSTEM, f"Incident: {incident_text}", max_tokens=512)
        parsed = json.loads(response)
        return {
            "keywords": parsed.get("keywords", []),
            "category": parsed.get("category", "other"),
            "severity": parsed.get("severity", "P3"),
            "symptoms": parsed.get("symptoms", []),
            "affected_component": parsed.get("affected_component", ""),
            "search_terms": parsed.get("search_terms", []),
        }
    except (json.JSONDecodeError, Exception):
        # Fallback: extract keywords from text directly
        words = [w.strip(".,;:!?") for w in incident_text.lower().split() if len(w) > 3]
        return {
            "keywords": words[:5],
            "category": "other",
            "severity": "P3",
            "symptoms": [incident_text],
            "affected_component": "",
            "search_terms": words[:3],
        }
