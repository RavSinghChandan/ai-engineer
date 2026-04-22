import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any

from models.campaign import WorkflowExecuteRequest
from graph.workflow import campaign_graph
from memory.campaign_memory import (
    find_similar, store_campaign, get_improvements, get_all_campaigns, clear_memory
)

app = FastAPI(title="Agentic Growth OS — LangGraph Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_CAMPAIGNS = [
    {
        "id": "demo-001",
        "name": "Premium Residences Launch",
        "campaign_type": "real_estate",
        "product_name": "Skyline Heights",
        "budget": 50000,
        "target_audience": "Home buyers aged 30-50, upper middle class",
        "key_benefit": "Ready to move luxury apartments with world-class amenities",
        "platform": "google_ads",
    },
    {
        "id": "demo-002",
        "name": "Data Science Bootcamp",
        "campaign_type": "coaching",
        "product_name": "TechLeap Academy",
        "budget": 30000,
        "target_audience": "Working professionals 24-35, career changers",
        "key_benefit": "Get placed in top tech companies in 90 days",
        "platform": "meta_ads",
    },
    {
        "id": "demo-003",
        "name": "Fashion Flash Sale",
        "campaign_type": "ecommerce",
        "product_name": "StyleVault",
        "budget": 20000,
        "target_audience": "Fashion-conscious millennials 18-30",
        "key_benefit": "70% off on premium brands, free delivery",
        "platform": "both",
    },
]


@app.get("/")
def root():
    return {"message": "Agentic Growth OS API", "engine": "LangGraph", "version": "2.0.0"}


@app.get("/api/demo-campaigns")
def get_demo_campaigns():
    return {"campaigns": DEMO_CAMPAIGNS}


@app.post("/api/execute-workflow")
async def execute_workflow(request: WorkflowExecuteRequest):
    c = request.campaign
    campaign_id = str(uuid.uuid4())[:8]

    # Memory lookup
    similar = []
    improvements = {}
    learning_applied = False

    if c.learning_mode:
        similar = find_similar(c.campaign_type.value, c.product_name, c.target_audience)
        if similar:
            improvements = get_improvements(similar)
            learning_applied = True

    # Build initial state for LangGraph
    initial_state: dict = {
        "campaign_type":      c.campaign_type.value,
        "product_name":       c.product_name,
        "budget":             c.budget,
        "target_audience":    c.target_audience,
        "key_benefit":        c.key_benefit,
        "platform":           c.platform,
        "learning_mode":      c.learning_mode,
        "improvements":       improvements if learning_applied else None,
        "similar_campaigns_found": len(similar),
        "learning_applied":   learning_applied,
        "audience_output":    None,
        "ad_copy_output":     None,
        "budget_output":      None,
        "campaign_output":    None,
        "performance_output": None,
        "agent_log":          [],
        "all_insights":       [],
        "metrics":            None,
        "improvement_percentage": None,
        "performance_grade":  "B",
        "forecast_30_days":   None,
        "agent_decisions":    None,
        "learning_summary":   None,
    }

    # Run LangGraph
    final_state = campaign_graph.invoke(initial_state)

    metrics   = final_state.get("metrics") or {}
    ad_copy   = final_state.get("ad_copy_output") or {}
    budget_op = final_state.get("budget_output") or {}
    audience  = final_state.get("audience_output") or {}

    agent_decisions = {
        "tone_used":         ad_copy.get("tone_applied", "professional"),
        "headline":          ad_copy.get("headline", ""),
        "budget_split":      budget_op.get("allocation", {}),
        "bid_strategy":      budget_op.get("bid_strategy", ""),
        "audience_age_group": audience.get("audience_profile", {}).get("age_group", ""),
    }

    if c.learning_mode and metrics:
        store_campaign(
            campaign_data={
                "campaign_type":   c.campaign_type.value,
                "product_name":    c.product_name,
                "target_audience": c.target_audience,
                "budget":          c.budget,
            },
            metrics=metrics,
            agent_decisions=agent_decisions,
        )

    imp_pct = final_state.get("improvement_percentage")

    return {
        "campaign_id":             campaign_id,
        "campaign_name":           c.name,
        "run_number":              len(similar) + 1,
        "learning_applied":        learning_applied,
        "similar_campaigns_found": len(similar),
        "improvement_percentage":  imp_pct,
        "metrics":                 metrics,
        "performance_grade":       final_state.get("performance_grade", "B"),
        "forecast_30_days":        final_state.get("forecast_30_days", {}),
        "agent_log":               final_state.get("agent_log", []),
        "agent_decisions":         agent_decisions,
        "ai_insights":             final_state.get("all_insights", []),
        "learning_summary":        _learning_summary(learning_applied, improvements, imp_pct, similar),
    }


@app.get("/api/campaign-memory")
def get_memory():
    data = get_all_campaigns()
    camps = data.get("campaigns", [])
    return {"total_campaigns": len(camps), "campaigns": camps[-10:]}


@app.delete("/api/campaign-memory")
def delete_memory():
    clear_memory()
    return {"message": "Memory cleared"}


@app.get("/api/learning-insights")
def learning_insights():
    data = get_all_campaigns()
    camps = data.get("campaigns", [])
    if len(camps) < 2:
        return {"insights": [], "total_learned": len(camps)}

    by_type: Dict[str, list] = {}
    for c in camps:
        ct = c.get("campaign_type", "custom")
        by_type.setdefault(ct, []).append(c)

    result = []
    for ct, items in by_type.items():
        if len(items) >= 2:
            first_m = items[0].get("metrics", {})
            last_m  = items[-1].get("metrics", {})
            result.append({
                "campaign_type":    ct,
                "runs":             len(items),
                "roi_improvement":  round(last_m.get("roi_score", 0) - first_m.get("roi_score", 0), 2),
                "ctr_improvement":  round(last_m.get("ctr", 0) - first_m.get("ctr", 0), 2),
                "best_tone":        items[-1].get("agent_decisions", {}).get("tone_used", "N/A"),
                "best_strategy":    items[-1].get("agent_decisions", {}).get("bid_strategy", "N/A"),
                "latest_roi":       last_m.get("roi_score", 0),
                "latest_ctr":       last_m.get("ctr", 0),
            })
    return {"insights": result, "total_learned": len(camps)}


def _learning_summary(learning_applied, improvements, imp_pct, similar):
    if not learning_applied or not similar:
        return {
            "message": "First run — establishing baseline. Run again to see learning in action.",
            "type": "baseline",
            "runs_analyzed": 0,
            "changes_applied": [],
        }
    changes = []
    if improvements.get("tone_recommendation", "professional") != "professional":
        changes.append(f"Ad tone → '{improvements['tone_recommendation']}'")
    if improvements.get("budget_reallocation", {}).get("reason"):
        changes.append(improvements["budget_reallocation"]["reason"])
    if improvements.get("audience_refinement", {}).get("reason"):
        changes.append(improvements["audience_refinement"]["reason"])
    if improvements.get("headline_strategy", "standard") != "standard":
        changes.append(f"Headline strategy → '{improvements['headline_strategy']}'")

    return {
        "message": f"System learned from {len(similar)} previous run(s) and improved performance{f' by {imp_pct}%' if imp_pct else ''}",
        "type": "improved",
        "runs_analyzed": len(similar),
        "changes_applied": changes,
        "improvement_percentage": imp_pct,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
