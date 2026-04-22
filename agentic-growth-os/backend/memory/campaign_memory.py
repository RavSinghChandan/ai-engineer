import json
import os
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List

MEMORY_FILE = os.path.join(os.path.dirname(__file__), "campaign_store.json")


def _load() -> Dict:
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE) as f:
            return json.load(f)
    return {"campaigns": []}


def _save(store: Dict):
    with open(MEMORY_FILE, "w") as f:
        json.dump(store, f, indent=2, default=str)


def _similarity(a: str, b: str) -> float:
    wa, wb = set(a.lower().split()), set(b.lower().split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def find_similar(campaign_type: str, product_name: str, target_audience: str) -> List[Dict]:
    store = _load()
    query = f"{campaign_type} {product_name} {target_audience}"
    results = []
    for c in store["campaigns"]:
        ref = f"{c.get('campaign_type','')} {c.get('product_name','')} {c.get('target_audience','')}"
        score = _similarity(query, ref)
        if score > 0.15:
            results.append({"campaign": c, "similarity": round(score, 3)})
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:3]


def store_campaign(campaign_data: Dict, metrics: Dict, agent_decisions: Dict) -> str:
    store = _load()
    record = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": datetime.now().isoformat(),
        **campaign_data,
        "metrics": metrics,
        "agent_decisions": agent_decisions,
    }
    store["campaigns"].append(record)
    _save(store)
    return record["id"]


def get_improvements(similar: List[Dict]) -> Dict[str, Any]:
    if not similar:
        return {}
    best = similar[0]["campaign"]
    m = best.get("metrics", {})
    d = best.get("agent_decisions", {})
    roi = m.get("roi_score", 0)
    ctr = m.get("ctr", 0)
    conv = m.get("conversion_rate", 0)

    tone = "urgent_cta" if roi < 1.5 else "emotional_storytelling" if ctr < 2.5 else "benefit_focused"
    if conv < 3.0:
        audience_ref = {"age_group": "28-40", "refined": True, "reason": "Narrowed age group based on conversion data"}
    else:
        audience_ref = {"age_group": "25-45", "refined": False, "reason": "Maintaining broad targeting"}

    if roi < 1.5:
        budget_realloc = {"search_ads": 0.60, "display_ads": 0.20, "social_ads": 0.20, "reason": "Shifted to high-converting search ads"}
    elif roi > 2.5:
        budget_realloc = {"search_ads": 0.40, "display_ads": 0.30, "social_ads": 0.30, "reason": "Expanded to display & social on strong ROI"}
    else:
        budget_realloc = {"search_ads": 0.50, "display_ads": 0.25, "social_ads": 0.25, "reason": "Balanced allocation maintained"}

    hl_strategy = "question_hook" if ctr < 2.0 else "number_lead" if ctr < 3.5 else "testimonial_style"

    return {
        "tone_recommendation": tone,
        "budget_reallocation": budget_realloc,
        "audience_refinement": audience_ref,
        "headline_strategy": hl_strategy,
        "previous_roi": roi,
        "previous_ctr": ctr,
        "previous_conversion": conv,
        "runs_analyzed": len(similar),
    }


def get_all_campaigns() -> Dict:
    return _load()


def clear_memory():
    if os.path.exists(MEMORY_FILE):
        os.remove(MEMORY_FILE)
