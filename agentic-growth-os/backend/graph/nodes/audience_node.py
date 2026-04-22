import random
from graph.state import CampaignState

PROFILES = {
    "real_estate": {
        "primary_age": "30-50", "income_level": "upper-middle to high",
        "interests": ["property investment", "home ownership", "luxury living", "financial planning"],
        "pain_points": ["high rent", "investment security", "family space"],
        "platform_split": {"search_ads": 0.55, "display_ads": 0.25, "social_ads": 0.20},
        "best_hours": "7PM-10PM weekdays, 10AM-2PM weekends",
    },
    "coaching": {
        "primary_age": "22-38", "income_level": "middle",
        "interests": ["career growth", "skill development", "competitive exams", "online learning"],
        "pain_points": ["career stagnation", "lack of guidance", "job competition"],
        "platform_split": {"search_ads": 0.45, "display_ads": 0.20, "social_ads": 0.35},
        "best_hours": "8AM-10AM, 8PM-11PM",
    },
    "ecommerce": {
        "primary_age": "18-35", "income_level": "lower-middle to middle",
        "interests": ["fashion", "deals", "trending products", "lifestyle"],
        "pain_points": ["price sensitivity", "product quality", "fast delivery"],
        "platform_split": {"search_ads": 0.35, "display_ads": 0.25, "social_ads": 0.40},
        "best_hours": "12PM-2PM, 9PM-12AM",
    },
    "custom": {
        "primary_age": "25-45", "income_level": "middle",
        "interests": ["general consumer", "value seeker"],
        "pain_points": ["general needs"],
        "platform_split": {"search_ads": 0.50, "display_ads": 0.25, "social_ads": 0.25},
        "best_hours": "6PM-10PM",
    },
}


def audience_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    profile = PROFILES.get(ct, PROFILES["custom"])
    improvements = state.get("improvements") or {}
    insights = []

    age_group = profile["primary_age"]
    if improvements.get("audience_refinement", {}).get("refined"):
        age_group = improvements["audience_refinement"]["age_group"]
        insights.append(f"Age group refined to {age_group} based on previous conversion data")

    quality_boost = 0.3 if improvements else 0.0
    quality_score = round(random.uniform(7.2, 9.2) + quality_boost, 1)
    estimated_reach = int(state["budget"] * 150 * (1.12 if improvements else 1.0))

    insights.append(f"Identified {len(profile['interests'])} interest clusters for targeting")
    insights.append(f"Optimal delivery window: {profile['best_hours']}")

    output = {
        "audience_profile": {
            "age_group": age_group,
            "income_level": profile["income_level"],
            "interests": profile["interests"],
            "pain_points": profile["pain_points"],
            "platform_split": profile["platform_split"],
            "best_hours": profile["best_hours"],
        },
        "estimated_reach": estimated_reach,
        "audience_quality_score": quality_score,
        "segments_identified": len(profile["interests"]),
        "insights": insights,
    }

    log_entry = {"agent": "Audience Agent", "status": "completed", "insights": insights}
    return {
        **state,
        "audience_output": output,
        "agent_log": [*state.get("agent_log", []), log_entry],
        "all_insights": [*state.get("all_insights", []), *insights],
    }
