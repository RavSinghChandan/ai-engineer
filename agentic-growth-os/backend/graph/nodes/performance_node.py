import random

from graph.model import simulation
from graph.state import CampaignState

# Tables live in graph/model/simulation.py so the formula has one home and the
# UI can show its provenance. Re-exported for callers that already import them.
BASELINE = simulation.BASELINE
TONE_LIFT = simulation.TONE_LIFT
AOV = simulation.AOV
LEAD_TO_SALE = simulation.LEAD_TO_SALE
GROSS_MARGIN = simulation.GROSS_MARGIN


def performance_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    budget = state["budget"]
    improvements = state.get("improvements") or {}
    ad_copy = state.get("ad_copy_output") or {}
    audience = state.get("audience_output") or {}
    insights = []

    # Seeded from the campaign itself: the same input always projects the same
    # numbers, so a change in the output means the agents changed something.
    rng = random.Random(simulation.seed_for(state))

    base = BASELINE.get(ct, BASELINE["custom"])
    ctr = simulation.drift(rng, base["ctr"], simulation.CTR_DRIFT)
    conv = simulation.drift(rng, base["conv"], simulation.CONV_DRIFT)
    cpc = simulation.drift(rng, base["cpc"], simulation.CPC_DRIFT)

    tone = ad_copy.get("tone_applied", "professional")
    lift = TONE_LIFT.get(tone, TONE_LIFT["professional"])
    aq = audience.get("audience_quality_score", 7.5)
    q_boost = (aq - 7.0) * 0.05

    ctr = ctr * lift["ctr"] + q_boost
    conv = conv * lift["conv"] + q_boost

    if improvements:
        # The learning loop's contribution is the tone/headline it chose, which
        # is already priced in by `lift` above. Report that contribution rather
        # than adding a second, unexplained bonus on top of it.
        ctr_gain = ctr - (ctr / lift["ctr"])
        conv_gain = conv - (conv / lift["conv"])
        insights.append(f"CTR +{ctr_gain:.2f}% from '{tone}' tone selected by the learning loop")
        insights.append(f"Conversion rate +{conv_gain:.2f}% from the same tone change")
        insights.append("Budget efficiency improved via channel reallocation")

    ctr = max(0.5, round(ctr, 2))
    conv = max(0.5, round(conv, 2))
    cpc = round(cpc, 2)

    total_clicks = int(budget / cpc)
    impressions = int(total_clicks / (ctr / 100))

    # A click becomes a lead; only a share of leads close into a paying sale.
    leads = int(total_clicks * (conv / 100))
    close_rate = LEAD_TO_SALE.get(ct, 0.25)
    conversions = int(leads * close_rate)

    revenue = conversions * AOV.get(ct, 5000) * (
        1.0 + rng.uniform(-simulation.REVENUE_DRIFT, simulation.REVENUE_DRIFT)
    )
    # ROAS is gross return on ad spend; ROI is the contribution-margin return,
    # which is what the advertiser actually keeps after cost of delivery.
    margin = GROSS_MARGIN.get(ct, 0.55)
    gross_profit = revenue * margin
    roas = round(revenue / budget, 2) if budget > 0 else 0
    roi = round((gross_profit - budget) / budget, 2) if budget > 0 else 0

    metrics = {
        "ctr": ctr, "conversion_rate": conv, "roi_score": roi, "roas": roas,
        "gross_margin_pct": round(margin * 100),
        "revenue": round(revenue, 2),
        "gross_profit": round(gross_profit, 2),
        "impressions": impressions, "clicks": total_clicks,
        "leads": leads, "conversions": conversions,
        "lead_to_sale_rate": round(close_rate * 100, 1),
        "cost_per_click": cpc,
        "cost_per_lead": round(budget / leads, 2) if leads > 0 else 0,
        "cost_per_conversion": round(budget / conversions, 2) if conversions > 0 else 0,
    }

    improvement_pct = None
    if improvements:
        prev_roi = improvements.get("previous_roi", 1.0)
        if prev_roi > 0:
            improvement_pct = round(((roi - prev_roi) / prev_roi) * 100, 1)
            insights.append(f"Overall ROI improved by {improvement_pct}% vs baseline campaign")

    grade = "A+" if roi >= 3.0 else "A" if roi >= 2.0 else "B+" if roi >= 1.0 else "B" if roi >= 0.5 else "C" if roi >= 0.0 else "D"

    # At a handful of projected sales, one sale either way swings ROI hard, so
    # the grade is not meaningful. Say so rather than presenting a confident A+
    # that rests on two conversions.
    low_volume = conversions < 10
    if low_volume:
        insights.append(
            f"Low projected volume ({conversions} sales) — this grade is sensitive "
            f"to a single conversion. Raise budget or widen targeting for a stable read."
        )
    insights.append(f"Campaign health: {'Strong' if roi > 2 else 'Good' if roi > 0.5 else 'Break-even' if roi >= 0 else 'Losing money'}")

    output = {
        "metrics": metrics, "improvement_percentage": improvement_pct,
        "performance_grade": grade,
        "low_volume": low_volume,
        "forecast_30_days": {
            "projected_conversions": conversions * 30,
            "projected_revenue": round(revenue * 30, 2),
            "projected_gross_profit": round(gross_profit * 30, 2),
            "projected_ad_spend": round(budget * 30, 2),
            "projected_roi": roi,
            "projected_roas": roas,
        },
        "insights": insights,
        "provenance": simulation.describe(),
    }
    log_entry = {"agent": "Performance Analyzer", "status": "completed", "insights": insights}
    return {
        **state,
        "performance_output": output,
        "metrics": metrics,
        "improvement_percentage": improvement_pct,
        "performance_grade": grade,
        "low_volume": low_volume,
        "forecast_30_days": output["forecast_30_days"],
        "agent_log": [*state.get("agent_log", []), log_entry],
        "all_insights": [*state.get("all_insights", []), *insights],
    }
