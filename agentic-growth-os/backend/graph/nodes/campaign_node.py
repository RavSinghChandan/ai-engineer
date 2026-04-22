import random
from graph.state import CampaignState

PLATFORMS = {
    "google_ads": {"name": "Google Ads",        "types": ["Search", "Display", "Performance Max"], "qs_range": (6, 10)},
    "meta_ads":   {"name": "Meta Ads",           "types": ["Awareness", "Traffic", "Conversions"],  "qs_range": (5, 9)},
    "both":       {"name": "Google + Meta Ads",  "types": ["Cross-Platform"],                       "qs_range": (7, 10)},
}

AD_GROUPS = {
    "real_estate": ["Ready to Move", "Under Construction", "Investment Properties", "Luxury Segment"],
    "coaching":    ["Working Professionals", "Fresh Graduates", "Career Switchers", "Exam Prep"],
    "ecommerce":   ["New Arrivals", "Best Sellers", "Sale Items", "Premium Collection"],
    "custom":      ["Primary Audience", "Secondary Audience", "Retargeting"],
}


def campaign_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    platform = state.get("platform", "google_ads")
    improvements = state.get("improvements") or {}
    ad_copy = state.get("ad_copy_output") or {}
    budget = state.get("budget_output") or {}
    insights = []

    cfg = PLATFORMS.get(platform, PLATFORMS["google_ads"])
    qs_min, qs_max = cfg["qs_range"]
    qs = round(random.uniform(qs_min, qs_max - 1) + (0.5 if improvements else 0), 1)
    qs = min(qs, qs_max)

    if improvements:
        insights.append(f"Campaign structure optimized using {improvements.get('runs_analyzed', 1)} previous run(s)")
        insights.append(f"Ad relevance boosted via tone: {ad_copy.get('tone_applied', 'standard')}")

    groups = AD_GROUPS.get(ct, AD_GROUPS["custom"])[:3]
    ad_groups = [{"name": g, "ads_count": random.randint(2, 4), "status": "active", "bid_adj": round(random.uniform(0.9, 1.3), 2)} for g in groups]

    insights.append(f"Launching on {cfg['name']} — Quality Score: {qs}/10")

    output = {
        "platform": cfg["name"],
        "campaign_status": "ready_to_launch",
        "ad_groups": ad_groups,
        "quality_score": qs,
        "campaign_type_selected": random.choice(cfg["types"]),
        "estimated_impressions_daily": int(budget.get("daily_budget", 1000) * 12),
        "insights": insights,
    }
    log_entry = {"agent": "Campaign Agent", "status": "completed", "insights": insights}
    return {
        **state,
        "campaign_output": output,
        "agent_log": [*state.get("agent_log", []), log_entry],
        "all_insights": [*state.get("all_insights", []), *insights],
    }
