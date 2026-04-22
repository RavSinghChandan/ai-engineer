import random
from graph.state import CampaignState

COPY_TEMPLATES = {
    "real_estate": {
        "professional":          {"h": ["Premium Properties Await You", "Your Dream Home is Here"],             "d": ["Discover luxury homes in prime locations. Limited units available."]},
        "urgent_cta":            {"h": ["Last 5 Units Left — Book NOW", "Price Rising Next Month — Act Fast"],  "d": ["Don't miss out! Pre-launch prices ending this weekend."]},
        "emotional_storytelling":{"h": ["Where Your Family's Story Begins", "More Than a Home — A Legacy"],     "d": ["This isn't just property. This is where memories are made."]},
        "benefit_focused":       {"h": ["0% Brokerage, 100% Transparency", "RERA Approved. Zero Hidden Costs"], "d": ["Transparent pricing, RERA approved, and guaranteed on-time delivery."]},
    },
    "coaching": {
        "professional":          {"h": ["Expert-Led Training Programs", "Accelerate Your Career Growth"],       "d": ["Learn from industry experts with 10+ years of experience."]},
        "urgent_cta":            {"h": ["Batch Starting Monday — Enroll NOW", "Only 12 Seats Remaining"],      "d": ["Miss this batch and wait 3 months. Secure your seat in 2 minutes."]},
        "emotional_storytelling":{"h": ["From Rejection to ₹12LPA — Ravi's Story", "Your Breakthrough is One Course Away"], "d": ["Over 2000 students transformed their careers with us. You're next."]},
        "benefit_focused":       {"h": ["87% Placement Rate in 90 Days", "₹0 to ₹8LPA — 6 Month Program"],    "d": ["Numbers don't lie. Our results speak for themselves."]},
    },
    "ecommerce": {
        "professional":          {"h": ["Premium Products, Unbeatable Prices", "Curated Collections for You"],  "d": ["Shop from 10,000+ verified products with guaranteed delivery."]},
        "urgent_cta":            {"h": ["SALE ENDS TONIGHT — 70% OFF", "Flash Sale: 3 Hours Only"],            "d": ["Hurry! Free shipping on orders above ₹499. Offer ends midnight."]},
        "emotional_storytelling":{"h": ["Products That Change Your Daily Routine", "Life's Too Short for Low Quality"], "d": ["Real reviews from real people. See why they keep coming back."]},
        "benefit_focused":       {"h": ["4.8★ Rating — 50,000+ Reviews", "Same Day Delivery in 15 Cities"],   "d": ["Trusted by millions. Free returns within 30 days."]},
    },
    "custom": {
        "professional":          {"h": ["Solutions That Work", "Trusted by Thousands"],                        "d": ["Quality service, transparent pricing, and proven results."]},
        "urgent_cta":            {"h": ["Limited Time Offer — Act Now", "Offer Ends This Weekend"],            "d": ["Don't miss out. Join thousands who already made the switch."]},
        "emotional_storytelling":{"h": ["Your Journey Starts Here", "Built for People Like You"],              "d": ["We understand your challenges and have built the perfect solution."]},
        "benefit_focused":       {"h": ["Proven Results, Guaranteed", "10x Your Outcome in 30 Days"],         "d": ["Real results backed by data and thousands of success stories."]},
    },
}

QUESTION_HOOKS = {"real_estate": "Tired of Paying Rent with Nothing to Show?", "coaching": "Still Waiting for Your Career to Take Off?", "ecommerce": "Why Pay More for Less Quality?", "custom": "Ready to Finally See Real Results?"}
TESTIMONIAL_HEADS = {"real_estate": '"Best investment of my life" — Priya S.', "coaching": '"Got placed at MNC in 3 months" — Rahul K.', "ecommerce": '"Haven\'t shopped anywhere else since" — Meera T.', "custom": '"Transformed our business completely" — Arjun M.'}
NUMBER_LEADS = {"real_estate": "₹45L Onwards — 0% Brokerage, RERA Approved", "coaching": "87% Placement Rate | ₹8LPA Avg Salary Hike", "ecommerce": "4.8★ | 50K+ Reviews | Free Next-Day Delivery", "custom": "10,000+ Customers | 4.9★ Avg Rating"}

CTAS = {"professional": "Learn More", "urgent_cta": "Book Now — Limited Time", "emotional_storytelling": "Start Your Journey", "benefit_focused": "See Proven Results", "question_hook": "Find Out How", "testimonial_style": "Join Thousands", "number_lead": "View Live Results"}


def ad_copy_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    improvements = state.get("improvements") or {}
    insights = []

    tone = improvements.get("tone_recommendation", "professional") if improvements else "professional"
    hl_strategy = improvements.get("headline_strategy", "standard") if improvements else "standard"

    if improvements:
        insights.append(f"Ad tone changed to '{tone}' based on previous campaign analysis")
        insights.append(f"Headline strategy upgraded to '{hl_strategy}' for better CTR")

    templates = COPY_TEMPLATES.get(ct, COPY_TEMPLATES["custom"])
    t = templates.get(tone, templates["professional"])
    headline = t["h"][random.randint(0, len(t["h"]) - 1)]
    description = t["d"][0]

    if hl_strategy == "question_hook":
        headline = QUESTION_HOOKS.get(ct, headline)
        insights.append("Question-hook headline applied to improve click engagement")
    elif hl_strategy == "testimonial_style":
        headline = TESTIMONIAL_HEADS.get(ct, headline)
        insights.append("Social proof headline applied based on high CTR pattern")
    elif hl_strategy == "number_lead":
        headline = NUMBER_LEADS.get(ct, headline)
        insights.append("Data-driven headline applied to boost trust")

    ctr_lift = round(random.uniform(0.4, 1.2), 2) if improvements else 0.0
    output = {
        "headline": headline, "description": description,
        "cta": CTAS.get(tone, "Get Started"),
        "tone_applied": tone, "headline_strategy": hl_strategy,
        "predicted_ctr_lift": ctr_lift,
        "insights": insights,
    }
    log_entry = {"agent": "Ad Copy Agent", "status": "completed", "insights": insights}
    return {
        **state,
        "ad_copy_output": output,
        "agent_log": [*state.get("agent_log", []), log_entry],
        "all_insights": [*state.get("all_insights", []), *insights],
    }
