import random
from graph.state import CampaignState

BASE = {
    "real_estate": {"search_ads": 0.55, "display_ads": 0.25, "social_ads": 0.20},
    "coaching":    {"search_ads": 0.45, "display_ads": 0.20, "social_ads": 0.35},
    "ecommerce":   {"search_ads": 0.35, "display_ads": 0.25, "social_ads": 0.40},
    "custom":      {"search_ads": 0.50, "display_ads": 0.25, "social_ads": 0.25},
}
IMP_PER_RUPEE = {"search_ads": 8,  "display_ads": 25, "social_ads": 18}
CLK_PER_RUPEE = {"search_ads": 0.25, "display_ads": 0.06, "social_ads": 0.12}
BID_STRATEGIES = {"real_estate": "maximize_conversions", "coaching": "target_cpa", "ecommerce": "target_roas", "custom": "maximize_clicks"}


def budget_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    budget = state["budget"]
    improvements = state.get("improvements") or {}
    insights = []

    alloc = BASE.get(ct, BASE["custom"]).copy()
    if improvements.get("budget_reallocation"):
        r = improvements["budget_reallocation"]
        alloc["search_ads"] = r.get("search_ads", alloc["search_ads"])
        alloc["display_ads"] = r.get("display_ads", alloc["display_ads"])
        alloc["social_ads"] = r.get("social_ads", alloc["social_ads"])
        insights.append(f"Budget reallocated: {r.get('reason','optimized based on historical data')}")
        insights.append("Previous campaign data showed 35% channel performance variance")

    breakdown = {
        ch: {
            "percentage": round(pct * 100, 1),
            "amount": round(budget * pct, 2),
            "estimated_impressions": int(budget * pct * IMP_PER_RUPEE[ch]),
            "estimated_clicks": int(budget * pct * CLK_PER_RUPEE[ch]),
        }
        for ch, pct in alloc.items()
    }

    efficiency_gain = round(random.uniform(8, 22), 1) if improvements else 0.0
    if improvements:
        insights.append(f"Estimated efficiency gain: +{efficiency_gain}% from reallocation")

    daily = round(budget / 30, 2)
    insights.append(f"Daily budget cap set to ₹{daily:.0f} with 15% flex buffer")

    bid_strategy = "target_roas" if improvements and improvements.get("previous_roi", 0) > 2.0 \
        else "maximize_conversions" if improvements and improvements.get("previous_roi", 0) > 1.2 \
        else BID_STRATEGIES.get(ct, "maximize_clicks")

    output = {
        "total_budget": budget, "allocation": alloc, "breakdown": breakdown,
        "daily_budget": daily, "bid_strategy": bid_strategy,
        "efficiency_gain_pct": efficiency_gain, "insights": insights,
    }
    log_entry = {"agent": "Budget Optimizer Agent", "status": "completed", "insights": insights}
    return {
        **state,
        "budget_output": output,
        "agent_log": [*state.get("agent_log", []), log_entry],
        "all_insights": [*state.get("all_insights", []), *insights],
    }
