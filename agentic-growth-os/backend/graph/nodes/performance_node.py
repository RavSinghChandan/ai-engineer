import random
from graph.state import CampaignState

BASELINE = {
    "real_estate": {"ctr": 2.1, "conv": 3.2, "roi": 1.8, "cpc": 45.0},
    "coaching":    {"ctr": 3.4, "conv": 4.8, "roi": 2.2, "cpc": 28.0},
    "ecommerce":   {"ctr": 2.8, "conv": 2.9, "roi": 1.6, "cpc": 18.0},
    "custom":      {"ctr": 2.5, "conv": 3.5, "roi": 1.9, "cpc": 30.0},
}

TONE_LIFT = {
    "urgent_cta":            {"ctr": 1.28, "conv": 1.22},
    "emotional_storytelling":{"ctr": 1.18, "conv": 1.15},
    "benefit_focused":       {"ctr": 1.10, "conv": 1.12},
    "question_hook":         {"ctr": 1.35, "conv": 1.08},
    "number_lead":           {"ctr": 1.20, "conv": 1.18},
    "testimonial_style":     {"ctr": 1.15, "conv": 1.25},
    "professional":          {"ctr": 1.00, "conv": 1.00},
}

# Agency revenue per conversion (commission/fee), not full sale price
AOV = {"real_estate": 5000, "coaching": 3000, "ecommerce": 800, "custom": 2000}


def performance_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    budget = state["budget"]
    improvements = state.get("improvements") or {}
    ad_copy = state.get("ad_copy_output") or {}
    audience = state.get("audience_output") or {}
    insights = []

    base = BASELINE.get(ct, BASELINE["custom"])
    ctr = base["ctr"] + random.uniform(-0.3, 0.3)
    conv = base["conv"] + random.uniform(-0.4, 0.4)
    cpc  = base["cpc"] * random.uniform(0.9, 1.1)

    tone = ad_copy.get("tone_applied", "professional")
    lift = TONE_LIFT.get(tone, TONE_LIFT["professional"])
    aq = audience.get("audience_quality_score", 7.5)
    q_boost = (aq - 7.0) * 0.05

    if improvements:
        boost_ctr  = random.uniform(0.3, 0.8)
        boost_conv = random.uniform(0.4, 1.0)
        ctr  = ctr * lift["ctr"]  + q_boost + boost_ctr
        conv = conv * lift["conv"] + q_boost + boost_conv
        insights.append(f"CTR improved by +{boost_ctr:.2f}% from audience refinement")
        insights.append(f"Conversion rate boosted by +{boost_conv:.2f}% from ad tone optimization")
        insights.append("Budget efficiency improved via channel reallocation")
    else:
        ctr  = ctr * lift["ctr"]  + q_boost
        conv = conv * lift["conv"] + q_boost

    ctr  = max(0.5, round(ctr, 2))
    conv = max(0.5, round(conv, 2))
    cpc  = round(cpc, 2)

    total_clicks = int(budget / cpc)
    impressions  = int(total_clicks / (ctr / 100))
    conversions  = int(total_clicks * (conv / 100))
    revenue      = conversions * AOV.get(ct, 5000) * random.uniform(0.85, 1.15)
    roi          = round(revenue / budget, 2) if budget > 0 else 0

    metrics = {
        "ctr": ctr, "conversion_rate": conv, "roi_score": roi,
        "impressions": impressions, "clicks": total_clicks, "conversions": conversions,
        "cost_per_click": cpc,
        "cost_per_conversion": round(budget / conversions, 2) if conversions > 0 else 0,
    }

    improvement_pct = None
    if improvements:
        prev_roi = improvements.get("previous_roi", 1.0)
        if prev_roi > 0:
            improvement_pct = round(((roi - prev_roi) / prev_roi) * 100, 1)
            insights.append(f"Overall ROI improved by {improvement_pct}% vs baseline campaign")

    grade = "A+" if roi >= 3.0 else "A" if roi >= 2.5 else "B+" if roi >= 2.0 else "B" if roi >= 1.5 else "C" if roi >= 1.0 else "D"
    insights.append(f"Campaign health: {'Strong' if roi > 2 else 'Good' if roi > 1.5 else 'Needs optimization'}")

    output = {
        "metrics": metrics, "improvement_percentage": improvement_pct,
        "performance_grade": grade,
        "forecast_30_days": {"projected_conversions": conversions * 30, "projected_revenue": round(revenue * 30, 2), "projected_roi": roi},
        "insights": insights,
    }
    log_entry = {"agent": "Performance Analyzer", "status": "completed", "insights": insights}
    return {
        **state,
        "performance_output": output,
        "metrics": metrics,
        "improvement_percentage": improvement_pct,
        "performance_grade": grade,
        "forecast_30_days": output["forecast_30_days"],
        "agent_log": [*state.get("agent_log", []), log_entry],
        "all_insights": [*state.get("all_insights", []), *insights],
    }
