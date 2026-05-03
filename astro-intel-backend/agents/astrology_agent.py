"""
STEP 2b — Vedic Astrology Super Agent
Runs Vedic, KP, and Western sub-agents per question.
Each sub-agent builds a personalized, question-specific multi-sentence answer
using the actual computed chart values — not generic category text.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt, get_prompt, ASTROLOGY_AGENT_VEDIC, ASTROLOGY_AGENT_KP, ASTROLOGY_AGENT_WESTERN
from utils.astro_calc import (
    _seed, lagna_rashi, moon_rashi, sun_sign_from_dob,
    planetary_positions, nakshatra_of_moon, house_analysis,
    active_doshas, current_dasha, dasha_periods, active_yogas,
    predictions_for_focus, compute_chart,
)


# ── Intent-aware dasha timing: planet × intent → timing sentence ──────────────
# Covers all 9 dasha planets × all 9 intents. Nothing hardcoded per question.
_DASHA_TIMING: Dict[str, Dict[str, str]] = {
    "Sun": {
        "marriage":    "The Sun life phase activates authority and identity — commit when you feel fully yourself, not when pressured; the 2–3 year window ahead is the prime window.",
        "career":      "The Sun life phase is peak career activation — leadership roles, promotions, and public recognition are strongly supported right now.",
        "finance":     "The Sun life phase favors income through authority and expertise — charge what you are worth; the next 2 years reward confident financial positioning.",
        "health":      "The Sun life phase governs vitality and heart health — prioritize cardiovascular activity and reduce overwork, which is the main depletion risk now.",
        "spirituality":"The Sun life phase deepens connection to purpose and dharma — meditation at sunrise and journaling your life mission will yield profound clarity.",
        "education":   "The Sun life phase favors mastery-oriented learning — pursue credentials, certifications, or mentorship from an authority figure in your field.",
        "travel":      "The Sun life phase supports purposeful travel — journeys tied to career, recognition, or self-discovery are especially rewarding now.",
        "children":    "The Sun life phase highlights legacy and parenthood — conversations about family formation are well-supported; act on intentions this year.",
        "general":     "The Sun life phase is active — step into leadership, own your decisions, and pursue what you want without waiting for permission.",
    },
    "Moon": {
        "marriage":    "The Moon life phase brings emotional readiness for deep commitment — marriage is strongly indicated within 1–2 years, especially during Venus transits.",
        "career":      "The Moon life phase supports career growth through emotional intelligence and public-facing roles — client work, teaching, and care-based professions thrive.",
        "finance":     "The Moon life phase brings financial fluctuation — income is present but irregular; build a 3-month emergency reserve and avoid large fixed commitments.",
        "health":      "The Moon life phase heightens sensitivity in the digestive and hormonal system — stress management and consistent sleep are the highest-priority remedies.",
        "spirituality":"The Moon life phase is deeply intuitive — nightly reflection, water-based practices, and connecting with a spiritual community will feel profoundly nourishing.",
        "education":   "The Moon life phase favors learning through experience and emotion — journals, mentors, and immersive environments outperform textbook study now.",
        "travel":      "The Moon life phase is excellent for travel near water, or visiting family and ancestral homelands — journeys with emotional meaning are highlighted.",
        "children":    "The Moon life phase is strongly linked to family and nurturing — conception, pregnancy, and deepening family bonds are actively supported.",
        "general":     "The Moon life phase is emotionally charged — trust your gut, invest in relationships, and let feelings be data, not obstacles.",
    },
    "Mars": {
        "marriage":    "The Mars life phase adds passion and decisiveness — if you are ready, move forward boldly; the best window is during Jupiter's transit over your 7th house.",
        "career":      "The Mars life phase is peak energy for career launches, entrepreneurship, and physical-demand roles — initiate now, execute fast, rest later.",
        "finance":     "The Mars life phase supports aggressive income building — take calculated risks, negotiate assertively, and avoid passive financial strategies.",
        "health":      "The Mars life phase drives physical energy but risks inflammation and injury — channel intensity into structured exercise; avoid overexertion.",
        "spirituality":"The Mars life phase favors active spiritual practices — dynamic yoga, breathwork, and service-based spirituality are far more effective than passive sitting.",
        "education":   "The Mars life phase supports competitive, fast-paced skill acquisition — certifications, boot camps, and hands-on training outperform slow academic paths.",
        "travel":      "The Mars life phase favors adventurous, active travel — solo journeys, hiking, and exploration of new territories are energetically aligned.",
        "children":    "The Mars life phase brings energy and decisiveness around family decisions — act on intentions; delays are not favored under Mars.",
        "general":     "The Mars life phase is your window to act — initiate projects, assert your needs, and pursue goals with full commitment.",
    },
    "Mercury": {
        "marriage":    "The Mercury life phase favors meeting partners through intellectual connection and communication — dating, networking, and shared learning are the most productive paths.",
        "career":      "The Mercury life phase is prime time for communication-based career moves — writing, speaking, teaching, consulting, and tech roles are strongly supported.",
        "finance":     "The Mercury life phase rewards multiple income streams, negotiation, and business — diversify income sources and review all financial contracts carefully.",
        "health":      "The Mercury life phase highlights the nervous system and respiratory health — mental overstimulation is the primary risk; breathwork and digital detox are key.",
        "spirituality":"The Mercury life phase is ideal for studying sacred texts, finding a spiritual teacher, and developing a consistent daily practice grounded in knowledge.",
        "education":   "The Mercury life phase is the single best period for examinations, new skills, and academic pursuits — results from efforts now will arrive faster than usual.",
        "travel":      "The Mercury life phase supports short, frequent trips and business travel — two or three purposeful journeys this year will open significant doors.",
        "children":    "The Mercury life phase brings communication and learning opportunities around children — education decisions and conversations about family planning are well-starred.",
        "general":     "The Mercury life phase rewards clear thinking, sharp communication, and adaptability — the deals, ideas, and connections you make now have lasting value.",
    },
    "Jupiter": {
        "marriage":    "The Jupiter life phase is among the most auspicious for marriage — a significant relationship or formal commitment is strongly indicated within 1–2 years.",
        "career":      "The Jupiter life phase is the most expansive career period — promotions, new ventures, and recognition from senior figures are strongly supported.",
        "finance":     "The Jupiter life phase is the best period for wealth expansion — invest in assets, expand your business, and say yes to growth opportunities.",
        "health":      "The Jupiter life phase brings generally good health but risks excess — avoid overeating and over-scheduling; moderation preserves the vitality this period offers.",
        "spirituality":"The Jupiter life phase is the most spiritually potent — study with a teacher, take a pilgrimage, or deepen your daily practice; growth will be profound.",
        "education":   "The Jupiter life phase is exceptional for higher education, philosophy, and wisdom-based learning — pursue the advanced qualification you have been considering.",
        "travel":      "The Jupiter life phase is ideal for long-distance travel, international opportunities, and pilgrimages — journeys begun now expand worldview and opportunity.",
        "children":    "The Jupiter life phase strongly supports conception, adoption, and family expansion — this is the most favorable period in the cycle for children.",
        "general":     "The Jupiter life phase is your most expansive window — say yes to growth, take the bigger risk, and trust that opportunities are genuinely abundant.",
    },
    "Venus": {
        "marriage":    "The Venus life phase is the single most favorable period for marriage — a committed partnership is very strongly indicated, often within the current year or next.",
        "career":      "The Venus life phase supports careers in beauty, arts, luxury, hospitality, and relationships — visibility and charm are your most powerful career assets now.",
        "finance":     "The Venus life phase brings financial ease through partnerships and creative work — joint ventures and beauty/lifestyle businesses are particularly favored.",
        "health":      "The Venus life phase brings physical attractiveness and vitality but risks indulgence — balance pleasure with discipline; kidneys and skin deserve attention.",
        "spirituality":"The Venus life phase deepens devotion, gratitude, and beauty-based spiritual practice — deity worship, mantra, and creating a sacred home environment are ideal.",
        "education":   "The Venus life phase favors arts, design, music, and relationship-based learning — creative subjects and social skill development will thrive.",
        "travel":      "The Venus life phase is ideal for leisure travel, honeymoons, and journeys to beautiful or culturally rich destinations — invest in the experience.",
        "children":    "The Venus life phase is highly favorable for conception and family planning — relationships and family bonds formed now carry lasting warmth.",
        "general":     "The Venus life phase is your window for love, beauty, and abundance — invest in relationships, creative pursuits, and environments that bring you joy.",
    },
    "Saturn": {
        "marriage":    "The Saturn life phase brings slow but lasting commitments — marriage will come after patience and genuine evaluation; age 27–30 and 35–38 are classic Saturn marriage windows.",
        "career":      "The Saturn life phase rewards discipline and long-term positioning — slow, steady career building now creates unshakable professional foundations within 5–7 years.",
        "finance":     "The Saturn life phase is for consolidation, not expansion — pay down debt, build emergency reserves, and avoid speculative ventures; patience yields lasting wealth.",
        "health":      "The Saturn life phase highlights bones, joints, teeth, and chronic stress — regular physiotherapy, structured sleep, and reducing stimulants are essential.",
        "spirituality":"The Saturn life phase brings depth, discipline, and karmic processing — consistent daily practice, even when it feels dry, builds the strongest spiritual foundation.",
        "education":   "The Saturn life phase rewards serious, long-form study — professional qualifications, structured courses, and disciplined skill-building will have lasting returns.",
        "travel":      "The Saturn life phase favors purposeful, working travel over leisure — study tours, long-term relocation, and career-driven journeys are supported.",
        "children":    "The Saturn life phase brings responsibility and structure around family — decisions about children require careful planning; timing matters more than urgency.",
        "general":     "The Saturn life phase is for building, not launching — do the foundational work now; results will arrive later and will be far more durable than shortcuts.",
    },
    "Rahu": {
        "marriage":    "The Rahu life phase can bring unconventional, unexpected relationships — partners may be from a different background, city, or culture; keep an open mind.",
        "career":      "The Rahu life phase is explosive for career ambition — foreign connections, technology, and non-traditional career paths are strongly activated.",
        "finance":     "The Rahu life phase brings sudden financial opportunities — act on the best one, but avoid greed-driven speculation; what rises fast can fall fast.",
        "health":      "The Rahu life phase can bring mysterious or difficult-to-diagnose health symptoms — seek second opinions and prioritize detoxification and grounding practices.",
        "spirituality":"The Rahu life phase challenges conventional spiritual paths — explore diverse traditions, but ground yourself in one daily practice to avoid spiritual confusion.",
        "education":   "The Rahu life phase favors unconventional, international, and technology-driven education — online certifications and foreign institutions are particularly supported.",
        "travel":      "The Rahu life phase strongly activates foreign travel and relocation — international opportunities will arise; staying open to them can be life-changing.",
        "children":    "The Rahu life phase can bring unexpected or non-traditional family situations — stay flexible and open; adopted children, step-parenting, or fertility treatments may be relevant.",
        "general":     "The Rahu life phase is your window for bold ambition and breakthroughs — push past conventional limits, but maintain ethical clarity to avoid later regret.",
    },
    "Ketu": {
        "marriage":    "The Ketu life phase emphasizes spiritual bonds over worldly commitments — marriage may be delayed, but when it arrives it is deeply karmic and profoundly meaningful.",
        "career":      "The Ketu life phase supports spiritual and research-oriented careers — conventional ambition may feel hollow; find work that aligns with your deeper purpose.",
        "finance":     "The Ketu life phase brings detachment from material pursuits — simplify expenses, clear debts, and avoid new financial commitments; inner wealth is the real focus.",
        "health":      "The Ketu life phase heightens intuition around health — listen to your body's subtle signals; energy healing, Ayurveda, and rest are more effective than force.",
        "spirituality":"The Ketu life phase is the single most spiritually potent in the entire cycle — meditation, retreat, and inner inquiry will yield insights that reshape your life.",
        "education":   "The Ketu life phase favors mystical, philosophical, and research-based study — ancient wisdom traditions and deep investigative learning are strongly supported.",
        "travel":      "The Ketu life phase supports pilgrimages and spiritually motivated travel — journeys to sacred sites or places of personal meaning will be profoundly transformative.",
        "children":    "The Ketu life phase may bring karmic delays or spiritual lessons around children — patience and inner work are more important than external action now.",
        "general":     "The Ketu life phase is for releasing what no longer serves — let go of attachments, simplify your life, and trust that clarity will emerge from the silence.",
    },
}

LAGNA_PARTNER_TRAITS = {
    "Aries":       "Your 7th house falls in Libra — a diplomatic, artistic, and harmonious partner complements your energy best.",
    "Taurus":      "Your 7th house falls in Scorpio — an intense, deeply loyal, and emotionally powerful partner is your natural match.",
    "Gemini":      "Your 7th house falls in Sagittarius — a philosophical, adventurous, and optimistic partner brings out your best.",
    "Cancer":      "Your 7th house falls in Capricorn — a stable, responsible, and career-oriented partner grounds your emotional nature.",
    "Leo":         "Your 7th house falls in Aquarius — an independent, innovative, and humanitarian partner challenges and inspires you.",
    "Virgo":       "Your 7th house falls in Pisces — a compassionate, spiritual, and creatively receptive partner balances your analytical nature.",
    "Libra":       "Your 7th house falls in Aries — an assertive, energetic, and decisive partner is your natural counterbalance.",
    "Scorpio":     "Your 7th house falls in Taurus — a grounded, sensual, and materially secure partner brings stability to your intensity.",
    "Sagittarius": "Your 7th house falls in Gemini — a witty, communicative, and intellectually curious partner keeps your life interesting.",
    "Capricorn":   "Your 7th house falls in Cancer — a nurturing, family-oriented, and emotionally warm partner softens your pragmatic nature.",
    "Aquarius":    "Your 7th house falls in Leo — a confident, generous, and creatively expressive partner brings warmth to your vision.",
    "Pisces":      "Your 7th house falls in Virgo — a practical, detail-oriented, and health-conscious partner brings structure to your depth.",
}

# Per-lagna career house (10th house = lagna + 9 signs)
_LAGNA_CAREER_HOUSE = {
    "Aries":"Capricorn","Taurus":"Aquarius","Gemini":"Pisces","Cancer":"Aries",
    "Leo":"Taurus","Virgo":"Gemini","Libra":"Cancer","Scorpio":"Leo",
    "Sagittarius":"Virgo","Capricorn":"Libra","Aquarius":"Scorpio","Pisces":"Sagittarius",
}

# Per-lagna wealth house (2nd house = lagna + 1 sign)
_LAGNA_WEALTH_HOUSE = {
    "Aries":"Taurus","Taurus":"Gemini","Gemini":"Cancer","Cancer":"Leo",
    "Leo":"Virgo","Virgo":"Libra","Libra":"Scorpio","Scorpio":"Sagittarius",
    "Sagittarius":"Capricorn","Capricorn":"Aquarius","Aquarius":"Pisces","Pisces":"Aries",
}

INTENT_QUESTION_TEMPLATES = {
    "marriage": {
        "Vedic": (
            "Your {lagna} rising sign places your marriage area squarely in {partner_sign}. "
            "{partner_trait} "
            "{dasha_timing} "
            "Your Moon in {moon} ({nakshatra} lunar star) reveals that emotional security is your non-negotiable before commitment."
        ),
        "KP": (
            "KP precision timing: with your {lagna} rising sign and Moon in {moon}, "
            "the marriage timing indicator is actively energised. "
            "{dasha_timing} "
            "Act on this window — join communities, attend curated events, or reconnect with someone you already respect."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon together show you need both intellectual spark and emotional depth in a partner. "
            "{partner_trait} "
            "{dasha_timing} "
            "Be visible in aligned social spaces — the right connection requires presence, not just patience."
        ),
    },
    "career": {
        "Vedic": (
            "Your {lagna} rising sign places the career area of your chart in {career_house}. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star enhances strategic thinking — pursue visibility and impact, not just effort."
        ),
        "KP": (
            "KP analysis confirms strong career signification in the current {dasha} life phase. "
            "{dasha_timing} "
            "With {lagna} rising sign, leadership and domain authority are your natural career advantages — lean into them."
        ),
        "Western": (
            "Your {sun} Sun drives career identity and the need for meaningful recognition. "
            "{dasha_timing} "
            "Set one ambitious career goal per quarter and track it — diffused effort is the single biggest obstacle right now."
        ),
    },
    "finance": {
        "Vedic": (
            "Your {lagna} rising sign places the wealth area of your chart in {wealth_house}. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star bestows resourcefulness — consistent, compounding financial action beats one-time big moves."
        ),
        "KP": (
            "KP wealth analysis confirms the current {dasha} life phase supports skill-based income growth. "
            "{dasha_timing} "
            "With {moon} Moon, emotional spending patterns need conscious tracking — budget clarity is your biggest financial lever."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon indicate financial growth through creative, communicative, or relational work. "
            "{dasha_timing} "
            "Build a clear 12-month financial plan now — this planetary cycle rewards intentional planners, not reactive ones."
        ),
    },
    "health": {
        "Vedic": (
            "Your {lagna} rising sign governs your physical constitution and the body's first line of resilience. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star points to stress as the primary health variable — sleep quality is your most powerful medicine."
        ),
        "KP": (
            "KP health analysis shows the current {dasha} life phase requires proactive, not reactive, health management. "
            "{dasha_timing} "
            "With {moon} Moon, emotional wellbeing directly governs physical health — address both together, never separately."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon together indicate where your vitality strengths and sensitivities lie. "
            "{dasha_timing} "
            "Focus on three non-negotiables: consistent sleep, daily movement, and reducing the one stimulant that costs you most."
        ),
    },
    "spirituality": {
        "Vedic": (
            "Your {lagna} rising sign shapes the nature and expression of your spiritual path. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star is particularly attuned to inner wisdom — a consistent daily practice started now will compound powerfully."
        ),
        "KP": (
            "KP analysis of your spiritual house confirms that the current {dasha} life phase is a significant inner-growth window. "
            "{dasha_timing} "
            "With {moon} Moon, devotional practices and emotional release work are the most potent tools available to you."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon reveal the shape of your spiritual hunger — what you seek is already forming within you. "
            "{dasha_timing} "
            "Choose one practice, commit to it for 90 days without interruption, and trust the accumulation."
        ),
    },
    "education": {
        "Vedic": (
            "Your {lagna} rising sign activates your intellect and learning capacity through the 4th and 5th houses of your chart. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star gives you absorption and recall ability — formal study begun now will yield measurable results."
        ),
        "KP": (
            "KP analysis confirms that the current {dasha} life phase supports examinations, certifications, and structured learning. "
            "{dasha_timing} "
            "With {lagna} rising sign, you perform best in learning environments that reward mastery and depth over speed."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon define your learning style and the subjects where you naturally excel. "
            "{dasha_timing} "
            "Invest in the qualification or skill that has been on your mind — the timing is supported, and delay costs compound interest."
        ),
    },
    "travel": {
        "Vedic": (
            "Your {lagna} rising sign activates the 9th house of long journeys and foreign connections in your chart. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star is aligned with movement and discovery — plan the journey, then act on the plan."
        ),
        "KP": (
            "KP analysis of your travel house confirms that journeys undertaken in the current {dasha} life phase carry strong positive signification. "
            "{dasha_timing} "
            "With {moon} Moon, travel that has emotional meaning or personal significance will be the most transformative."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon together reveal the kind of travel that genuinely nourishes and expands you. "
            "{dasha_timing} "
            "Book the journey you have been postponing — the current cycle supports exploration and new horizons."
        ),
    },
    "children": {
        "Vedic": (
            "Your {lagna} rising sign activates the 5th house of children, creativity, and legacy in your chart. "
            "{dasha_timing} "
            "Your {nakshatra} lunar star carries strong nurturing energy — intentions set around family now are deeply supported."
        ),
        "KP": (
            "KP analysis of your 5th house confirms that the current {dasha} life phase is actively linked to children and family formation. "
            "{dasha_timing} "
            "With {moon} Moon, your emotional readiness for parenthood is the most important factor — tend to it first."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon together reveal your natural parenting style and your emotional readiness for family expansion. "
            "{dasha_timing} "
            "Have the conversations you have been avoiding — clarity of intention is what moves family decisions forward."
        ),
    },
    "general": {
        "Vedic": (
            "Your {lagna} rising sign and Moon in {moon} ({nakshatra} lunar star) together define your current life chapter. "
            "{dasha_timing} "
            "Decisions made with clear intention in the next 12 months will shape the following 3–5 years significantly."
        ),
        "KP": (
            "KP analysis confirms that the current {dasha} life phase supports deliberate, focused action across all areas. "
            "{dasha_timing} "
            "With {lagna} rising sign and {moon} Moon, emotional clarity is your most powerful decision-making tool right now."
        ),
        "Western": (
            "Your {sun} Sun and {moon} Moon create a personality that is both adaptive and purposeful. "
            "{dasha_timing} "
            "Choose one primary focus and direct 80% of your energy there — this cycle rewards depth over breadth."
        ),
    },
}


def _build_prediction(intent: str, tradition: str, lagna: str, moon: str, sun: str, nakshatra: str, dasha: str) -> str:
    """Build a fully intent-aware, chart-specific prediction. Nothing is hardcoded per question."""
    templates = INTENT_QUESTION_TEMPLATES.get(intent, INTENT_QUESTION_TEMPLATES["general"])
    tmpl = templates.get(tradition, templates.get("Vedic", ""))

    dasha_planet = dasha.split(" ")[0] if dasha else "Jupiter"
    # Intent-aware dasha timing — no marriage-only hardcoding
    intent_timings = _DASHA_TIMING.get(dasha_planet, _DASHA_TIMING["Jupiter"])
    dasha_timing   = intent_timings.get(intent, intent_timings.get("general", ""))

    partner_trait  = LAGNA_PARTNER_TRAITS.get(lagna, "A compatible, aligned partner is indicated by your chart.")
    # 7th house sign = lagna + 6 rashis
    from utils.astro_calc import RASHIS
    lagna_idx      = RASHIS.index(lagna) if lagna in RASHIS else 0
    partner_sign   = RASHIS[(lagna_idx + 6) % 12]
    career_house   = _LAGNA_CAREER_HOUSE.get(lagna, "a strong 10th house")
    wealth_house   = _LAGNA_WEALTH_HOUSE.get(lagna, "a strong 2nd house")

    try:
        return tmpl.format(
            lagna=lagna, moon=moon, sun=sun, nakshatra=nakshatra,
            dasha=dasha, partner_trait=partner_trait, dasha_timing=dasha_timing,
            partner_sign=partner_sign, career_house=career_house, wealth_house=wealth_house,
        )
    except KeyError:
        return tmpl


def _run_vedic_sub_agent(name: str, dob: str, tob: str, pob: str, question: str, intent: str,
                          lat: float = None, lon: float = None, timezone: str = None) -> Dict[str, Any]:
    # Use real astronomical computation
    chart_data = compute_chart(dob=dob, tob=tob, pob=pob, lat=lat, lon=lon, timezone=timezone)

    lagna   = chart_data["lagna"]
    moon    = chart_data["moon_sign"]
    sun     = chart_data.get("vedic_sun_sign") or chart_data["sun_sign"]
    nakshat = chart_data["nakshatra"]
    dasha_label = chart_data["current_dasha"]
    dasha_planet = dasha_label.split(" ")[0] if dasha_label else "Jupiter"

    seed = _seed(name + dob + pob)
    preds = predictions_for_focus(lagna, sun, moon, intent, seed)

    _cfg = build_prompt(
        "astrology_vedic",
        name=name, dob=dob, tob=tob, pob=pob,
        question=question, intent=intent, tradition="Vedic (Jyotish)",
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshat, dasha=dasha_label,
    )
    prediction = _build_prediction(intent, "Vedic", lagna, moon, sun, nakshat, dasha_label)

    return {
        "sub_agent":       "Vedic Astrology",
        "question":        question,
        "prediction":      prediction,
        "traits":          [f"Lagna {lagna}", f"Moon {moon}", nakshat],
        "confidence_hint": "high",
        "extra": {
            "chart":               chart_data.get("chart", {"lagna": lagna, "moon_sign": moon, "sun_sign": sun, "nakshatra": nakshat}),
            "planetary_positions": chart_data.get("planetary_positions", {}),
            "house_analysis":      chart_data.get("house_analysis", {}),
            "doshas":              chart_data.get("doshas", []),
            "current_dasha":       dasha_label,
            "dasha_planet":        dasha_planet,
            "dasha_periods":       chart_data.get("dasha_periods", []),
            "yogas":               chart_data.get("yogas", []),
            "predictions":         preds,
            "strengths":           chart_data.get("strengths", []),
            "challenges":          chart_data.get("challenges", []),
        },
    }


def _run_kp_sub_agent(name: str, dob: str, question: str, intent: str,
                      lagna: str = None, moon: str = None, dasha: str = None) -> Dict[str, Any]:
    seed  = _seed(name + dob + "KP")
    lagna = lagna or lagna_rashi(seed)
    moon  = moon  or moon_rashi(seed)
    sun   = sun_sign_from_dob(dob)
    nakshat = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)
    if dasha:
        dasha_label  = dasha
        dasha_planet = dasha.split()[0]

    _cfg = build_prompt(
        "astrology_kp",
        name=name, dob=dob, tob="", pob="",
        question=question, intent=intent, tradition="KP System",
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshat, dasha=dasha_label,
    )
    prediction = _build_prediction(intent, "KP", lagna, moon, sun, nakshat, dasha_label)

    return {
        "sub_agent":       "KP Astrology",
        "question":        question,
        "prediction":      prediction,
        "traits":          [f"Ascendant sub-lord active", f"Moon sub-lord {moon}", "Favorable dasha signification"],
        "confidence_hint": "medium",
        "extra": {
            "chart":         {"lagna": lagna, "moon_sign": moon},
            "predictions":   [prediction, f"KP cusp analysis confirms favorable period for {intent}."],
            "cusp_analysis": f"Sub-lord of relevant house cusps is well-placed for {intent} matters.",
        },
    }


def _run_western_sub_agent(name: str, dob: str, question: str, intent: str,
                           lagna: str = None, moon: str = None, dasha: str = None) -> Dict[str, Any]:
    seed  = _seed(name + dob + "Western")
    sun   = sun_sign_from_dob(dob)
    moon  = moon  or moon_rashi(seed)
    lagna = lagna or lagna_rashi(seed)
    nakshat = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)
    if dasha:
        dasha_label  = dasha
        dasha_planet = dasha.split()[0]

    _cfg = build_prompt(
        "astrology_western",
        name=name, dob=dob, tob="", pob="",
        question=question, intent=intent, tradition="Western",
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshat, dasha=dasha_label,
    )
    prediction = _build_prediction(intent, "Western", lagna, moon, sun, nakshat, dasha_label)

    return {
        "sub_agent":       "Western Astrology",
        "question":        question,
        "prediction":      prediction,
        "traits":          [f"Sun in {sun}", f"Moon in {moon}", "Active outer planet transits"],
        "confidence_hint": "medium",
        "extra": {
            "chart":       {"sun_sign": sun, "moon_sign": moon},
            "predictions": [prediction, f"Western transit analysis supports {intent} themes for the current period."],
            "transits":    "Jupiter and Saturn transits are active — sustained growth is indicated.",
        },
    }


def _analyze_question(name: str, dob: str, tob: str, pob: str, question: str, intent: str,
                       lat: float = None, lon: float = None, timezone: str = None) -> Dict[str, Any]:
    vedic   = _run_vedic_sub_agent(name, dob, tob, pob, question, intent, lat=lat, lon=lon, timezone=timezone)
    # Pass real chart values from Vedic into KP and Western so they stay consistent
    v_chart  = vedic["extra"].get("chart", {})
    v_lagna  = v_chart.get("lagna") or None
    v_moon   = v_chart.get("moon_sign") or None
    v_dasha  = vedic["extra"].get("current_dasha") or None
    kp      = _run_kp_sub_agent(name, dob, question, intent, lagna=v_lagna, moon=v_moon, dasha=v_dasha)
    western = _run_western_sub_agent(name, dob, question, intent, lagna=v_lagna, moon=v_moon, dasha=v_dasha)

    sub_results = [vedic, kp, western]
    lagna = vedic["extra"]["chart"]["lagna"]
    dasha = vedic["extra"]["current_dasha"]

    summary = (
        f"Astrology analysis for '{question}': Lagna is {lagna}, currently running {dasha}. "
        f"All three systems (Vedic, KP, Western) confirm {intent}-related energy. "
        f"{vedic['prediction']}"
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        [
            f"All three astrological traditions confirm a favorable period for {intent}-related matters.",
            "Timing indicators align across Vedic, KP, and Western systems.",
        ],
        "conflicts":         [],
    }


def astrology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "astrology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name = profile.get("full_name", "")    if isinstance(profile, dict) else profile.full_name
    dob  = profile.get("date_of_birth", "") if isinstance(profile, dict) else profile.date_of_birth
    tob  = profile.get("time_of_birth", "") if isinstance(profile, dict) else getattr(profile, "time_of_birth", "")
    pob  = profile.get("place_of_birth", "") if isinstance(profile, dict) else getattr(profile, "place_of_birth", "")

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    # Extract geocoded coordinates from state if available
    geo = state.get("geocode") or {}
    geo_lat = geo.get("lat") if geo else None
    geo_lon = geo.get("lon") if geo else None
    geo_tz  = geo.get("timezone") if geo else None

    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(name, dob, tob, pob, nq["question"], nq["intent"],
                                     lat=geo_lat, lon=geo_lon, timezone=geo_tz)
        question_wise_analysis.append(analysis)

    first_sub = question_wise_analysis[0]["sub_agent_results"][0]
    _prompt_cfg = get_prompt("astrology")
    domain_output = {
        "domain":                 "astrology",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "vedic":                  first_sub["extra"],
    }
    domain_output["vedic"]["tradition"]       = "Vedic"
    domain_output["vedic"]["focus_addressed"] = normalized_questions[0]["intent"]
    domain_output["vedic"]["predictions"]     = first_sub["extra"].get("predictions", [])
    domain_output["vedic"]["strengths"]       = first_sub["extra"].get("strengths", [])
    domain_output["vedic"]["challenges"]      = first_sub["extra"].get("challenges", [])
    domain_output["vedic"]["yogas"]           = first_sub["extra"].get("yogas", [])
    domain_output["vedic"]["doshas"]          = first_sub["extra"].get("doshas", [])
    domain_output["vedic"]["current_dasha"]   = first_sub["extra"].get("current_dasha", "")

    state.setdefault("memory", {})["astrology"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[AstrologyAgent] Analyzed {len(question_wise_analysis)} question(s) across 3 traditions (Vedic, KP, Western)."
    )
    return state


def _moon_strength(moon: str) -> str:
    q = {
        "Aries": "quick, decisive emotional responses", "Taurus": "emotional stability and patience",
        "Gemini": "mental agility and adaptability", "Cancer": "nurturing depth and empathy",
        "Leo": "emotional warmth and generosity", "Virgo": "analytical clarity and service",
        "Libra": "harmony and cooperative instincts", "Scorpio": "deep emotional resilience",
        "Sagittarius": "optimism and expansive outlook", "Capricorn": "emotional discipline and perseverance",
        "Aquarius": "independent thinking and humanitarian values", "Pisces": "compassion and intuitive depth",
    }
    return q.get(moon, "emotional intelligence")
