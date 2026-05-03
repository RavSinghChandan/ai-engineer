"""
Simplify Agent
Converts approved insights into a structured, bullet-point summary that:
  - Answers WHO / WHAT / WHEN / WHERE / HOW for each question
  - Is written in plain English (no jargon)
  - Ends with practical remedies (habits, mantra, colors)

Output format is a list of structured dicts per question — the frontend
renders them as bullets in the Summary section of the PDF.
"""
from __future__ import annotations
import re
from datetime import date
from typing import Any, Dict, List, Optional
from agents.agent_prompts import SIMPLIFY_AGENT


# ── Jargon → plain English ─────────────────────────────────────────────────────
JARGON_MAP = {
    r"\bLagna\b":                   "rising sign",
    r"\bGemini Lagna\b":            "Gemini rising sign",
    r"\bSagittarius Lagna\b":       "Sagittarius rising sign",
    r"\bRahu dasha\b":              "your current Rahu life phase",
    r"\bdasha\b":                   "life phase",
    r"\bDasha\b":                   "life phase",
    r"\bnakshatra\b":               "lunar star sign",
    r"\bNakshatra\b":               "lunar star sign",
    r"\bVishakha nakshatra\b":      "Vishakha lunar star",
    r"\b7th house\b":               "marriage area of your chart",
    r"\b10th house\b":              "career area of your chart",
    r"\b2nd house\b":               "wealth area of your chart",
    r"\b6th house\b":               "health area of your chart",
    r"\b7th cusp sub-lord\b":       "the marriage timing indicator",
    r"\bKP system\b":               "KP astrology",
    r"\bKP analysis\b":             "this analysis",
    r"\bVedic\b":                   "Indian",
    r"\bPythagorean\b":             "Western",
    r"\bChaldean\b":                "ancient Chaldean",
    r"\bLife Path\b":               "life path number",
    r"\bName Number\b":             "name number",
    r"\bSoul Urge number\b":        "inner soul number",
    r"\bpersonal year cycles\b":    "personal year number cycles",
    r"\bMount of Venus\b":          "Venus mount on your palm",
    r"\bheart line\b":              "heart line on your palm",
    r"\bVenus placement\b":         "Venus position in your chart",
    r"\bouter-planet transits\b":   "current planetary movements",
    r"\bcross-cultural\b":          "from a different background",
    r"\bauspicious\b":              "very favourable",
    r"\bphilosophical\b":           "thoughtful",
    r"\bsub-lord signification\b":  "marriage timing marker",
    r"\bdasha period\b":            "life phase",
}

TRADITION_PREFIXES = [
    "From the Vedic perspective,",
    "From the Indian Numerology perspective,",
    "From the Chaldean Numerology perspective,",
    "From the Pythagorean Numerology perspective,",
    "From the KP system perspective,",
    "From the Western astrology perspective,",
    "In Western astrology,",
    "The KP system analyses the 7th cusp sub-lord directly for marriage timing.",
    "The combined wisdom of",
]

CLOSING_PATTERN = re.compile(r"The combined wisdom of .+ yields the most favou?rable outcomes\.")

# ── HW section labels per intent ─────────────────────────────────────────────

HW_TEMPLATES: Dict[str, Dict[str, str]] = {
    "marriage": {
        "who":   "Who is the right partner for you?",
        "what":  "What should you do to attract the right person?",
        "when":  "When is the best time to get married?",
        "where": "Where will you most likely meet the right person?",
        "how":   "How can you prepare yourself for a meaningful relationship?",
    },
    "career": {
        "who":   "Who can help you grow professionally?",
        "what":  "What actions will advance your career?",
        "when":  "When is the best time to make a career move?",
        "where": "Where should you focus your professional efforts?",
        "how":   "How can you make the most of this career phase?",
    },
    "finance": {
        "who":   "Who should you work with for financial decisions?",
        "what":  "What financial actions should you take?",
        "when":  "When is the best time to invest or build wealth?",
        "where": "Where should your financial energy be directed?",
        "how":   "How can you build lasting financial stability?",
    },
    "health": {
        "who":   "Who should you consult for your health?",
        "what":  "What health actions are most important right now?",
        "when":  "When should you take action on your health?",
        "where": "Where in the body does your chart show sensitivity?",
        "how":   "How can you strengthen your health and vitality?",
    },
    "spirituality": {
        "who":   "Who or what can guide your spiritual growth?",
        "what":  "What spiritual practices should you adopt?",
        "when":  "When is the best time for spiritual practice?",
        "where": "Where should you create your spiritual space?",
        "how":   "How can you deepen your spiritual connection?",
    },
    "education": {
        "who":   "Who can support your educational journey?",
        "what":  "What steps should you take for education?",
        "when":  "When is the best time for exams or new courses?",
        "where": "Where should you focus your learning efforts?",
        "how":   "How can you improve your study and retention?",
    },
    "travel": {
        "who":   "Who should you travel with or consult?",
        "what":  "What travel or relocation steps should you take?",
        "when":  "When is the best time to travel or move?",
        "where": "Where are you most likely to succeed or thrive?",
        "how":   "How should you prepare for the journey ahead?",
    },
    "children": {
        "who":   "Who plays a key role in your family journey?",
        "what":  "What steps should you take for family planning?",
        "when":  "When is the best time for family planning?",
        "where": "Where should you focus to strengthen family bonds?",
        "how":   "How can you create a nurturing environment?",
    },
    "general": {
        "who":   "Who are the key people in your journey right now?",
        "what":  "What actions will create the most impact?",
        "when":  "When will the key changes take place?",
        "where": "Where should you direct your energy?",
        "how":   "How can you make the most of this phase?",
    },
}


# ── Chart data extractor from memory ──────────────────────────────────────────

def _chart_from_memory(memory: Dict[str, Any]) -> Dict[str, str]:
    """Pull real chart values from memory — used to build slot answers directly."""
    astro = memory.get("astrology", {})
    qwa = astro.get("question_wise_analysis", [])
    if qwa:
        sr = qwa[0].get("sub_agent_results", [])
        vedic = next((s for s in sr if "Vedic" in s.get("sub_agent", "")), {})
        ex = vedic.get("extra", {})
        ch = ex.get("chart", {})
        lagna   = ch.get("lagna", "")
        moon    = ch.get("moon_sign", "")
        sun     = ch.get("sun_sign", "")
        naksh   = ch.get("nakshatra", "")
        dasha   = ex.get("current_dasha", "")
    else:
        vedic = astro.get("vedic", {})
        ch    = vedic.get("chart", {}) if vedic else {}
        lagna = ch.get("lagna", "")
        moon  = ch.get("moon_sign", "")
        sun   = ch.get("sun_sign", "")
        naksh = ch.get("nakshatra", "")
        dasha = vedic.get("current_dasha", "") if vedic else ""

    num = memory.get("numerology", {})
    ind = num.get("indian") or num.get("pythagorean") or {}
    cn  = ind.get("core_numbers", ind)
    lp  = cn.get("life_path", "")
    dest = cn.get("destiny", "")
    nm   = cn.get("name_number", "")

    dasha_planet = (dasha or "Jupiter").split()[0]

    # Extract birth month from user_profile for WHEN window personalisation
    profile = memory.get("user_profile", {})
    dob = profile.get("date_of_birth", "") or ""
    birth_month = 0
    if dob and len(dob) >= 7:
        try:
            birth_month = int(dob[5:7])
        except ValueError:
            birth_month = 0

    return {
        "lagna": lagna or "your rising sign",
        "moon":  moon  or "your Moon sign",
        "sun":   sun   or "your Sun sign",
        "naksh": naksh or "your lunar star",
        "dasha": dasha or "your current life phase",
        "dasha_planet": dasha_planet,
        "birth_month":  birth_month,
        "lp":   str(lp)   if lp   else "",
        "dest": str(dest) if dest else "",
        "nm":   str(nm)   if nm   else "",
    }


# ── Timing window calculator ───────────────────────────────────────────────────
# Returns concrete month–year windows based on dasha planet and intent.

_DASHA_DURATIONS: Dict[str, int] = {
    "Sun": 6, "Moon": 10, "Mars": 7, "Mercury": 17,
    "Jupiter": 16, "Venus": 20, "Saturn": 19, "Rahu": 18, "Ketu": 7,
}

# Peak sub-window offset (years into dasha) and window length (years) per intent
_DASHA_PEAK_OFFSET: Dict[str, Dict[str, tuple]] = {
    # (start_offset_years, window_length_years)
    "marriage":    {"Sun":  (1,2), "Moon": (0,2), "Mars": (0,1), "Mercury": (2,3),
                    "Jupiter": (0,2), "Venus": (0,2), "Saturn": (2,4), "Rahu": (1,3), "Ketu": (0,2)},
    "career":      {"Sun":  (0,2), "Moon": (1,2), "Mars": (0,2), "Mercury": (0,4),
                    "Jupiter": (0,3), "Venus": (1,3), "Saturn": (3,5), "Rahu": (0,3), "Ketu": (1,2)},
    "finance":     {"Sun":  (0,2), "Moon": (0,2), "Mars": (0,2), "Mercury": (0,3),
                    "Jupiter": (0,3), "Venus": (0,3), "Saturn": (2,4), "Rahu": (0,2), "Ketu": (1,2)},
    "health":      {"Sun":  (0,1), "Moon": (0,2), "Mars": (0,1), "Mercury": (1,2),
                    "Jupiter": (0,2), "Venus": (0,2), "Saturn": (0,3), "Rahu": (0,2), "Ketu": (0,2)},
    "spirituality":{"Sun":  (1,2), "Moon": (0,3), "Mars": (1,2), "Mercury": (2,4),
                    "Jupiter": (0,4), "Venus": (2,4), "Saturn": (3,6), "Rahu": (2,4), "Ketu": (0,3)},
    "education":   {"Sun":  (0,2), "Moon": (0,2), "Mars": (0,1), "Mercury": (0,3),
                    "Jupiter": (0,3), "Venus": (1,2), "Saturn": (2,4), "Rahu": (1,3), "Ketu": (1,2)},
    "travel":      {"Sun":  (0,1), "Moon": (0,2), "Mars": (0,1), "Mercury": (0,2),
                    "Jupiter": (0,3), "Venus": (0,2), "Saturn": (2,3), "Rahu": (0,3), "Ketu": (0,2)},
    "children":    {"Sun":  (1,2), "Moon": (0,2), "Mars": (0,1), "Mercury": (1,2),
                    "Jupiter": (0,2), "Venus": (0,2), "Saturn": (3,5), "Rahu": (1,3), "Ketu": (0,2)},
    "general":     {"Sun":  (0,2), "Moon": (0,2), "Mars": (0,1), "Mercury": (0,3),
                    "Jupiter": (0,2), "Venus": (0,2), "Saturn": (2,4), "Rahu": (0,2), "Ketu": (0,2)},
}

_MONTHS = ["January","February","March","April","May","June",
           "July","August","September","October","November","December"]

def _timing_window(dasha_planet: str, intent: str, birth_month: int = 0) -> Dict[str, str]:
    """
    Returns:
      window   — e.g. "October 2026 – March 2028"
      peak     — e.g. "Peak probability: January 2027"
      duration — e.g. "Venus life phase runs 20 years"

    birth_month (1–12): offsets the window start by (birth_month - 1) months so two
    users with the same dasha planet get distinct windows based on their birth month.
    """
    today = date.today()
    cur_year  = today.year
    cur_month = today.month

    offsets = _DASHA_PEAK_OFFSET.get(intent, _DASHA_PEAK_OFFSET["general"])
    start_off, length = offsets.get(dasha_planet, (0, 2))

    # Birth-month personalisation: shift window by 0–11 months based on birth month
    birth_offset = max(0, (birth_month - 1)) if birth_month else 0

    # Window start: today + offset months (offset in years → months)
    # We use 6 months min so window is never "this month"
    start_months = max(6, int(start_off * 12)) + birth_offset
    total_months = start_months + int(length * 12)
    peak_months  = start_months + int(length * 12 * 0.4)  # 40% into window = peak

    def _add_months(yr: int, mo: int, delta: int) -> tuple:
        mo += delta
        yr += (mo - 1) // 12
        mo  = (mo - 1) % 12 + 1
        return yr, mo

    ws_yr, ws_mo = _add_months(cur_year, cur_month, start_months)
    we_yr, we_mo = _add_months(cur_year, cur_month, total_months)
    pk_yr, pk_mo = _add_months(cur_year, cur_month, peak_months)

    dur = _DASHA_DURATIONS.get(dasha_planet, 16)

    return {
        "window": f"{_MONTHS[ws_mo-1]} {ws_yr} – {_MONTHS[we_mo-1]} {we_yr}",
        "peak":   f"Peak probability: {_MONTHS[pk_mo-1]} {pk_yr}",
        "duration": f"{dasha_planet} life phase runs {dur} years",
    }


# ── Intent × dasha → specific WHO types (3 points) ───────────────────────────

_WHO_POINTS: Dict[str, Dict[str, List[str]]] = {
    "marriage": {
        "Sun":  ["A person in an authority role (age 28–35) — confident, settled, decision-ready",
                 "Someone introduced through your father's side or a respected senior",
                 "A person with a stable government/corporate role and a grounded family background"],
        "Moon": ["A nurturing, emotionally expressive person — likely introduced through the mother's network",
                 "Someone from a water-dominated background (near a coast, river city, or healthcare field)",
                 "A person in a care-based profession: nurse, counsellor, teacher, or social worker"],
        "Mars": ["An active, assertive person — someone who takes initiative and makes decisions fast",
                 "Someone from a technical, engineering, defence, or sports background",
                 "A person introduced through siblings, cousins, or a shared competitive activity"],
        "Mercury": ["An intellectually sharp person — good communicator, possibly in media, tech, or writing",
                    "Someone met through a course, workshop, conference, or online platform",
                    "A person near your own age with multiple active interests and high adaptability"],
        "Jupiter": ["A well-educated, ethically grounded person — likely in teaching, law, or consulting",
                    "Someone introduced through a guru, mentor, spiritual community, or family elder",
                    "A person from a stable, traditional family with strong values and long-term vision"],
        "Venus": ["An artistic, aesthetically refined person — possibly in creative or luxury industries",
                  "Someone introduced through a social event, arts circle, or mutual female friends",
                  "A person with strong financial stability and a warm, affectionate personality"],
        "Saturn": ["A disciplined, self-made person — older by 3–7 years, emotionally mature",
                   "Someone introduced through your workplace, professional network, or shared responsibility",
                   "A person who values loyalty and long-term commitment above romance and excitement"],
        "Rahu":   ["An unconventional person — possibly from a different culture, city, or background",
                   "Someone met through travel, online platforms, foreign networks, or unexpected circumstances",
                   "A person who breaks your existing 'type' — the right match may surprise you"],
        "Ketu":   ["A deeply spiritual or introspective person — not driven by material goals",
                   "Someone from a past-life karmic connection — the recognition will be immediate and strong",
                   "A person introduced through a temple, retreat, meditation circle, or spiritual teacher"],
    },
    "career": {
        "Sun":  ["A senior leader or mentor who can sponsor your visibility at the executive level",
                 "A decision-maker in government, administration, or a large established organisation",
                 "A father figure or founding authority who opens doors through direct recommendation"],
        "Moon": ["A public-sector manager or leader in healthcare, hospitality, or social services",
                 "A female colleague or mentor who champions your growth within the team",
                 "A client-facing manager who recognises your people skills and positions you for leadership"],
        "Mars": ["An entrepreneur, founder, or startup leader who needs someone decisive and action-oriented",
                 "A technical lead in engineering, defence, real estate, or fast-moving industries",
                 "A peer who challenges you competitively — this friction becomes a career catalyst"],
        "Mercury": ["A consultant, recruiter, or communications lead who connects you with the right network",
                    "A tech-sector manager or startup CTO who values sharp thinking over seniority",
                    "A writing, speaking, or media mentor who amplifies your professional voice"],
        "Jupiter": ["A professor, senior advisor, or industry authority who provides mentorship and referrals",
                    "A legal, financial, or educational institution leader who opens a leadership track",
                    "A business partner or co-founder who brings wisdom, ethics, and long-term vision"],
        "Venus": ["A creative director, brand strategist, or luxury industry leader who recognises your aesthetic sense",
                  "A female executive or senior partner in a relationship-driven industry",
                  "A collaborator who brings the commercial side — you bring the vision"],
        "Saturn": ["A senior manager who rewards discipline, loyalty, and results over politics",
                   "A client or organisation that tests you for 6–12 months before offering the bigger role",
                   "A mentor who gives hard feedback — this relationship is your most valuable career asset"],
        "Rahu":   ["A foreign company, international recruiter, or tech-sector headhunter",
                   "A non-traditional employer in AI, media, digital, or cross-border commerce",
                   "A disruptive thinker or innovator who sees potential others have missed in you"],
        "Ketu":   ["A research institution, NGO, or purpose-driven organisation aligned with your values",
                   "A spiritual teacher or philosophical mentor who reframes your career trajectory",
                   "A solo practice or independent consulting path — the freedom will unlock performance"],
    },
    "finance": {
        "Sun":  ["A senior financial advisor with government sector or wealth management credentials",
                 "A father figure or mentor who has built personal wealth through discipline and authority",
                 "A CA, tax consultant, or compliance expert who structures your income for long-term growth"],
        "Moon": ["A risk-averse financial planner who prioritises stability over aggressive returns",
                 "A female advisor or business partner with strong savings and cash-flow discipline",
                 "A property or real-estate consultant aligned with your long-term security goals"],
        "Mars": ["An investment advisor who specialises in high-growth, short-tenure opportunities",
                 "A co-founder or business partner who drives revenue while you manage strategy",
                 "A sales mentor who shows you how to negotiate assertively for your own income"],
        "Mercury": ["A fintech advisor, accountant, or analyst who tracks multiple income streams",
                    "A business development partner who connects you to new revenue channels",
                    "A sharp negotiator who handles your contracts and rate revisions"],
        "Jupiter": ["A senior wealth manager with long-term equity and asset-building expertise",
                    "A mentor who has built diversified wealth and shares a structured framework",
                    "A legal or financial partner who protects your assets and structures growth properly"],
        "Venus": ["A financial partner in a creative, luxury, or hospitality business",
                  "A mutual fund advisor or property consultant who builds passive income elegantly",
                  "A business collaborator who brings clients and relationships — you bring execution"],
        "Saturn": ["A structured, conservative financial planner focused on debt reduction and reserves",
                   "An older mentor who has built wealth slowly and understands compounding deeply",
                   "An accountant who imposes financial discipline — this is your highest-value financial relationship"],
        "Rahu":   ["A tech or crypto investment advisor with unconventional but proven track record",
                   "A foreign market specialist or international business development partner",
                   "A disruptive entrepreneur who shows you monetisation models outside your current industry"],
        "Ketu":   ["A minimalist financial advisor focused on debt freedom and expense reduction",
                   "A mentor who has walked away from materialism — their perspective reframes your priorities",
                   "A solo consulting or freelance mentor who shows you how to earn more with less overhead"],
    },
    "health": {
        "Sun":  ["A cardiologist or spine specialist — your Sun-ruled heart and back need proactive monitoring",
                 "An Ayurvedic physician who assesses your constitution and prescribes a personalised regime",
                 "A yoga or movement therapist who specifically addresses postural and spinal health"],
        "Moon": ["A gastroenterologist or dietitian — Moon rules digestion and hormonal cycles",
                 "A therapist or counsellor who addresses emotional patterns that manifest as physical symptoms",
                 "A naturopath who works with your cycle, fluid balance, and gut microbiome"],
        "Mars": ["A sports medicine specialist or physiotherapist for muscle, joint, and inflammation concerns",
                 "A blood specialist or haematologist if energy levels are inconsistent",
                 "A fitness coach who builds a structured programme — Mars energy needs disciplined output, not random exertion"],
        "Mercury": ["A neurologist or pulmonologist for nervous system and respiratory health",
                    "A cognitive behavioural therapist who addresses anxiety and mental overload",
                    "A breathwork or pranayama teacher — the fastest reset for Mercury's stressed nervous system"],
        "Jupiter": ["A hepatologist or metabolic specialist — Jupiter governs liver and fat metabolism",
                    "A nutritionist who addresses excess and overconsumption — moderation is the medicine",
                    "An integrative doctor who takes a whole-body view, not just symptom management"],
        "Venus": ["A dermatologist or reproductive health specialist — Venus rules skin and reproductive organs",
                  "A kidney or renal health consultant for long-term monitoring under Venus life phase",
                  "A beauty and wellness practitioner who supports hormonal balance through lifestyle changes"],
        "Saturn": ["An orthopaedic specialist or physiotherapist for bones, joints, and chronic pain",
                   "A sleep medicine consultant — Saturn's phase makes deep rest both harder and more critical",
                   "A Vata-balancing Ayurvedic practitioner for joint, skin, and chronic condition management"],
        "Rahu":   ["An integrative or functional medicine doctor for difficult-to-diagnose conditions",
                   "A detox and cleansing specialist — Rahu accumulates toxins in the nervous system",
                   "A second-opinion specialist — Rahu can obscure the true root cause; verify diagnoses"],
        "Ketu":   ["An energy healer, acupuncturist, or Pranic healing practitioner",
                   "An immunologist or autoimmune specialist — Ketu governs the immune system's subtler layers",
                   "A meditation or mind-body therapist — Ketu responds more to rest and surrender than intervention"],
    },
    "spirituality": {
        "Sun":  ["A dharmic teacher, life-purpose coach, or vedantic scholar who clarifies your mission",
                 "A solar-energy practitioner who works with sunrise ritual, fire ceremony, or Surya Namaskar",
                 "A mentor who has built a purpose-driven life and can show you what that integration looks like"],
        "Moon": ["A devotional teacher in bhakti, mantra, or water-element practices",
                 "A women's circle, emotional healing facilitator, or lunar practice guide",
                 "A mother figure or intuitive counsellor who mirrors your inner emotional wisdom"],
        "Mars": ["A dynamic yoga teacher or martial arts instructor who channels spiritual energy through action",
                 "A fire ceremony facilitator or agni-based practice guide",
                 "A mentor whose spiritual path is active and engaged — not passive or withdrawn"],
        "Mercury": ["A scholar, teacher, or sacred-text guide who opens the intellectual dimension of spirituality",
                    "A journaling, writing, or reflection mentor who structures your inner inquiry",
                    "A communication-based practitioner who helps you articulate and share your spiritual insights"],
        "Jupiter": ["A jyotishi, swami, or senior guru who provides structured vedantic or philosophical teaching",
                    "A pilgrimage guide or sacred travel mentor who creates transformative outer journeys",
                    "A wisdom tradition elder who has walked the path long enough to navigate your questions"],
        "Venus": ["A mantra teacher, kirtan leader, or devotional arts practitioner",
                  "A sacred space designer or Vastu consultant who creates a home environment for practice",
                  "A gratitude and abundance meditation teacher who works with Venus's grace energy"],
        "Saturn": ["A Vipassana teacher or long-form meditation guide who demands consistent, daily discipline",
                   "A karma-yoga mentor who teaches selfless service as spiritual practice",
                   "An elder whose wisdom came through suffering — their transmission accelerates your depth"],
        "Rahu":   ["An unconventional spiritual teacher — possibly cross-tradition, non-lineage, or self-realised",
                   "A tantra, shadow-work, or transformational psychology guide",
                   "A practitioner who disrupts your current spiritual comfort zone — that disruption is the practice"],
        "Ketu":   ["A deeply realised teacher in Advaita Vedanta, Zen, or non-dual traditions",
                   "A past-life regression therapist or karmic healing practitioner",
                   "A silent, solitary teacher — your deepest growth may come through a private retreat, not a class"],
    },
    "education": {
        "Sun":  ["A professor, institutional leader, or credentialed authority in your target field",
                 "A mentor already established at the level you are working toward — model their path exactly",
                 "A government scholarship officer or university admission consultant"],
        "Moon": ["A learning experience designer or immersive course facilitator",
                 "A female academic mentor or senior researcher who provides emotional as well as academic support",
                 "A counsellor who helps you navigate the psychological demands of study"],
        "Mars": ["A competitive exam coach or bootcamp instructor who pushes you to outperform",
                 "A peer study group where competition keeps motivation high",
                 "A skills trainer in technical, engineering, or certification-based tracks"],
        "Mercury": ["A writing mentor, communication coach, or language specialist",
                    "A tech educator, online course creator, or digital learning community",
                    "A career counsellor who maps your certifications to specific job outcomes"],
        "Jupiter": ["A senior academic, dean, or institution head who opens the advanced track",
                    "A scholarship mentor or research supervisor who expands your academic horizon",
                    "A philosophical or wisdom-tradition teacher who gives your learning a deeper context"],
        "Venus": ["A creative arts mentor, design school faculty, or performing arts coach",
                  "A female academic peer who models excellence in a creative or relational discipline",
                  "A networking mentor who shows you how relationships accelerate educational outcomes"],
        "Saturn": ["A strict, demanding professor who pushes you beyond your comfort zone",
                   "A professional body or licensing authority for a long-form qualification",
                   "An older practitioner who learned through experience — their mentorship compresses your learning curve"],
        "Rahu":   ["An international university advisor or overseas study specialist",
                   "A tech-sector educator in AI, data, blockchain, or emerging disciplines",
                   "A non-traditional educator who challenges institutional frameworks — often the best for Rahu learners"],
        "Ketu":   ["A research supervisor in mystical, philosophical, or ancient-knowledge disciplines",
                   "A solo study mentor who guides independent or self-directed learning",
                   "A past teacher or guide from a prior life chapter — reconnect with someone you previously studied under"],
    },
    "travel": {
        "Sun":  ["A career mentor or senior colleague who initiated or sponsored the travel/relocation",
                 "A government official, embassy contact, or institutional sponsor for your move",
                 "A recognised authority at the destination who provides professional credibility and access"],
        "Moon": ["A female family member or close friend already settled at the destination",
                 "A hospitality or real estate contact who makes the transition emotionally comfortable",
                 "An emotional support network — family group chats, homesick support, or expat community"],
        "Mars": ["A solo travel mentor or adventure community who normalises bold, unplanned moves",
                 "A logistical planner who handles visas, accommodation, and transport assertively",
                 "A physically active local contact who helps you settle through action rather than waiting"],
        "Mercury": ["A local language tutor or cultural orientation guide",
                    "A digital nomad community, remote-work hub, or co-working network at destination",
                    "An information broker — someone who knows the systems: housing, banking, registration"],
        "Jupiter": ["A pilgrimage leader, cultural ambassador, or international education coordinator",
                    "A destination country's spiritual or academic community that becomes your anchor",
                    "A mentor at home who has successfully relocated and provides a practical road map"],
        "Venus": ["A creative, artistic, or hospitality community at the destination",
                  "A social connector who introduces you to the local cultural and social scene quickly",
                  "A luxury or lifestyle consultant who makes the relocation aesthetically and emotionally rich"],
        "Saturn": ["A visa or immigration lawyer who ensures no procedural error delays your move",
                   "A long-term expat who has navigated the same destination and can share the unvarnished reality",
                   "A financially grounded advisor who stress-tests your relocation budget before you commit"],
        "Rahu":   ["A foreign national already embedded in your industry at the destination",
                   "An international recruiter or cross-border job placement specialist",
                   "An unconventional travel guide — someone who moved unexpectedly and built something remarkable"],
        "Ketu":   ["A pilgrimage coordinator or spiritual retreat facilitator at a sacred destination",
                   "A minimalist traveller or monk-like figure who reframes what the journey is really for",
                   "A past connection at the destination — someone you once knew who now calls you back"],
    },
    "children": {
        "Sun":  ["Your partner and their paternal family — the father's role is amplified in this phase",
                 "A fertility specialist or reproductive endocrinologist for medical support",
                 "An authoritative family elder whose blessing and support creates the right foundation"],
        "Moon": ["Your mother or maternal family — their emotional support is non-negotiable right now",
                 "A midwife, doula, or maternal health specialist who works with your natural rhythms",
                 "A female friend who has recently navigated the same journey — her experience is your map"],
        "Mars": ["A fertility doctor who takes a direct, interventionist approach if natural conception is slow",
                 "A male partner who needs to be brought into full commitment and co-decision-making now",
                 "A sibling or cousin who can provide practical childcare support once the baby arrives"],
        "Mercury": ["A genetic counsellor or reproductive health consultant with data-driven insights",
                    "A parenting educator or child development specialist who prepares you before conception",
                    "A close sibling or young relative who brings lightness and energy to the process"],
        "Jupiter": ["A spiritual elder or priest whose blessing is part of your family tradition",
                    "A fertility specialist who also understands constitutional or holistic approaches",
                    "A mentor couple who has navigated parenthood successfully and models what you want to build"],
        "Venus": ["Your partner — Venus phase makes the relationship the primary fertility catalyst",
                  "A hormonal health specialist, gynaecologist, or reproductive wellness practitioner",
                  "A female friend or sister who makes the emotional journey feel joyful and supported"],
        "Saturn": ["A reproductive specialist for structured, evidence-based planning over a 12–24 month window",
                   "An older relative whose experience with delayed or careful family planning offers comfort",
                   "A financial planner who ensures the material foundation is ready before the baby arrives"],
        "Rahu":   ["A fertility specialist open to unconventional approaches: IVF, surrogacy, or adoption",
                   "An international medical specialist if local options have not yielded results",
                   "An unexpected ally — someone outside the family circle who provides a critical connection"],
        "Ketu":   ["A spiritual counsellor who helps you process karmic patterns around family and children",
                   "A holistic fertility practitioner who works with energy, diet, and inner preparation",
                   "A patient, wise elder who normalises delays and redirects your focus to inner readiness"],
    },
    "general": {
        "Sun":  ["A mentor or senior leader who can objectively see your blind spots and next steps",
                 "A father figure or authority who opens specific doors through their network and reputation",
                 "A peer who has recently navigated the same crossroads and succeeded"],
        "Moon": ["A trusted female confidante — a mother, sister, or close friend who gives honest guidance",
                 "An emotional intelligence coach or therapist who helps you read your own signals correctly",
                 "A nurturing community where you can speak freely and receive grounded support"],
        "Mars": ["A direct, action-oriented peer who has no tolerance for inaction — their energy is contagious",
                 "A coach or accountability partner who tracks your progress and calls out avoidance",
                 "A sibling or competitive colleague whose results force you to raise your own standard"],
        "Mercury": ["A communications mentor, coach, or strategic advisor who sharpens your message",
                    "A well-networked peer who opens doors through introductions and referrals",
                    "A digital or tech-savvy collaborator who accelerates what would take you years alone"],
        "Jupiter": ["A guru, teacher, or senior advisor with broad wisdom and long-term perspective",
                    "A mentor who is not personally invested in your outcome — their clarity is most trustworthy",
                    "A community of practitioners or a mastermind group operating at the level you want to reach"],
        "Venus": ["A creative collaborator or aesthetic partner who brings beauty and harmony to the work",
                  "A socially well-connected person who amplifies your presence in the right circles",
                  "A female mentor or advisor with proven success in the area you are navigating"],
        "Saturn": ["A demanding senior who gives honest, direct feedback without softening it",
                   "A long-term accountability partner who checks in monthly and holds the standard",
                   "A structured professional — lawyer, chartered accountant, or certified coach — who prevents costly mistakes"],
        "Rahu":   ["A disruptive innovator or foreign national who sees your situation from outside the usual frame",
                   "A tech-forward mentor who shows you leverage points you have not considered",
                   "An unconventional peer — someone whose non-traditional path produced extraordinary results"],
        "Ketu":   ["A spiritual teacher or contemplative elder who helps you identify what to release",
                   "A therapist or past-life healer who resolves patterns that keep recurring",
                   "A solitary mentor — their quiet wisdom cuts through noise better than any crowd"],
    },
}


# ── Intent × dasha → WHAT actions (3 points) ─────────────────────────────────

_WHAT_POINTS: Dict[str, Dict[str, List[str]]] = {
    "marriage": {
        "Sun":  ["Step fully into your professional identity — the right partner is drawn to confidence, not searching",
                 "Tell your trusted family network you are ready for serious introductions — not just 'open to it'",
                 "Be clear on non-negotiables before any meeting — financial stability, values alignment, and decision-making style"],
        "Moon": ["Begin attending curated social events with emotional depth — not networking, but genuine community",
                 "Open the conversation with your mother's side of the family — this network holds your most compatible leads",
                 "Practise emotional availability: reduce phone use during deep conversations; presence is your strongest signal"],
        "Mars": ["Act — not wait. Mars phase rewards people who initiate. Tell your network you are ready",
                 "Go on 2–3 dates per month minimum — data beats speculation about compatibility",
                 "Set a decision deadline: if you have been dating someone 6+ months with no clarity, define the relationship or exit"],
        "Mercury": ["Join one intellectually stimulating group — book club, debate society, industry conference, or course",
                    "Make your values and relationship intentions explicit in early conversations — Mercury rewards clear communication",
                    "Use professional and social networks actively — the right person often appears through a second-degree connection"],
        "Jupiter": ["Engage your family elders, spiritual community, and well-respected mentors in the search — they carry the right leads",
                    "Prioritise character and values alignment over initial chemistry — Jupiter phase favours lasting, structured commitment",
                    "Attend social gatherings with a family or cultural component — this is where Jupiter's network concentrates"],
        "Venus": ["Invest actively in your appearance, social life, and personal environment — Venus amplifies attraction when you are at your best",
                  "Attend artistic events, cultural evenings, and aesthetically rich social occasions",
                  "Be direct about your intentions early — Venus phase doesn't need extended courtship; clarity accelerates commitment"],
        "Saturn": ["Take every serious introduction seriously — Saturn's matches rarely come wrapped in instant chemistry",
                   "Evaluate potential partners on reliability, emotional maturity, and long-term vision — not surface presentation",
                   "Expand your geography: the right person may be outside your immediate city or social circle"],
        "Rahu":   ["Say yes to unexpected social invitations — Rahu's introductions rarely arrive through familiar channels",
                   "Stay genuinely open to someone outside your usual type — cultural background, industry, or age range",
                   "Use digital platforms actively — Rahu phase makes online-initiated connections unusually productive"],
        "Ketu":   ["Join a meditation centre, retreat programme, or spiritual community — not with a search motive, but with genuine intent",
                   "Create space in your schedule: Ketu's encounters require stillness, not busyness",
                   "Do the inner work — journal on your ideal relationship, remove old attachments consciously, and be ready to receive"],
    },
    "career": {
        "Sun":  ["Apply for roles one level above your current position — Sun phase supports visibility, not consolidation",
                 "Identify one senior decision-maker in your field and book a direct conversation within 30 days",
                 "Take on a highly visible project or initiative that positions you as the person who makes decisions happen"],
        "Moon": ["Identify the public-facing or care-sector role that lets your empathy become your competitive edge",
                 "Build relationships with clients and colleagues through genuine personal interest — not transaction",
                 "Request a role in client management, community engagement, or team wellbeing leadership this quarter"],
        "Mars": ["Launch the business idea, project, or pitch that has been sitting in draft — Mars window is now, not later",
                 "Negotiate assertively: ask for the raise, the promotion, or the contract within the next 60 days",
                 "Eliminate the task, person, or structure that has been slowing your momentum — Mars has no tolerance for drag"],
        "Mercury": ["Write one piece of visible thought leadership — article, post, or talk — within the next 30 days",
                    "Contact 5 people in your target network who you have not spoken to in 6+ months",
                    "Enrol in the certification or skill upgrade that your target role lists as preferred — do it this month"],
        "Jupiter": ["Say yes to the larger opportunity even if you do not feel 100% ready — Jupiter expands the one who moves",
                    "Seek a formal mentorship or advisory relationship with someone 10+ years ahead of you in your field",
                    "Pursue the advanced qualification or international exposure that makes your profile stand apart"],
        "Venus": ["Identify the creative, relationship-driven, or aesthetics-adjacent role where your natural taste is the product",
                  "Build a portfolio, showcase, or personal brand that communicates your unique perspective — not just your skills",
                  "Leverage your existing network through collaboration rather than cold outreach — Venus rewards warm introductions"],
        "Saturn": ["Complete the incomplete: the certification, the project, the report that keeps being deferred — finish it this month",
                   "Show up consistently for 90 days with measurable output — Saturn does not reward bursts, only sustained performance",
                   "Identify and eliminate the one productivity drain that costs you the most time each week"],
        "Rahu":   ["Apply to foreign companies, international clients, or tech-sector roles actively — Rahu opens these doors",
                   "Reframe your profile for a non-traditional sector — your background may be rare and valuable outside your current industry",
                   "Take a calculated risk: Rahu phase is for bold action, not safe consolidation"],
        "Ketu":   ["Identify the research or purpose-driven work that others dismiss but you find intrinsically meaningful — pursue it",
                   "Start the independent or solo project alongside your main role — Ketu builds parallel tracks into breakout opportunities",
                   "Release the role or responsibility that no longer serves your real direction — Ketu phase requires letting go to move forward"],
    },
    "finance": {
        "Sun":  ["Raise your rates or salary expectation by 20–30% — Sun phase supports pricing confidence",
                 "Identify one government scheme, institutional investment, or structured fund to enter this quarter",
                 "Hire a CA or tax advisor who specialises in wealth structuring — not just compliance"],
        "Moon": ["Build a 3-month expense reserve before making any new investments",
                 "Identify and eliminate your 3 highest discretionary costs — Moon phase rewards simplification, not accumulation",
                 "Set up automatic savings on the 1st of each month — remove the decision from the process"],
        "Mars": ["Negotiate one existing contract or salary for a higher number this month — ask, don't wait",
                 "Identify one high-conviction, time-bound investment opportunity and act within the next 45 days",
                 "Eliminate one recurring financial drain: a subscription, a loss-making partnership, or an under-performing asset"],
        "Mercury": ["Diversify income: identify a second income stream that requires 5 hours or less per week to initiate",
                    "Audit every subscription, membership, and recurring payment — cut anything with negative ROI",
                    "Use a budgeting app for 60 days straight — Mercury phase rewards data, not guesswork"],
        "Jupiter": ["Invest in an asset that compounds over 5–10 years: equity, property, or a business stake",
                    "Engage a wealth manager for portfolio review and rebalancing this quarter",
                    "Make the single biggest income-generating skill investment of your career — Jupiter phase ROI on learning is the highest"],
        "Venus": ["Create a passive income stream through a creative, licensing, or partnership-based model",
                  "Review your personal brand or professional presentation — Venus phase makes appearance directly affect income",
                  "Consolidate financial partnerships: joint ventures, business co-ownership, or profit-sharing arrangements"],
        "Saturn": ["Pay off all consumer debt before making any new investment — Saturn does not reward debt-funded speculation",
                   "Build a 6-month emergency fund if you do not already have one — this is your first financial priority",
                   "Invest in one proven, conservative instrument: fixed income, sovereign bonds, or a property with clear rental yield"],
        "Rahu":   ["Research one emerging sector or technology and make a small, informed entry position within 90 days",
                   "Identify your highest-leverage international opportunity: client, market, or income source",
                   "Consult an advisor who specialises in alternative investments — Rahu phase opens unconventional wealth paths"],
        "Ketu":   ["Reduce lifestyle expenses to the minimum required for genuine comfort — Ketu phase reveals what is truly necessary",
                   "Clear all outstanding debts, personal loans, or financial obligations before year end",
                   "Invest in one deeply researched, single-conviction position rather than spreading across many speculative bets"],
    },
    "health": {
        "Sun":  ["Book a comprehensive cardiac and spinal health assessment within the next 30 days — do not defer",
                 "Establish a daily morning sun exposure routine of 20–30 minutes — eye health benefits are cumulative",
                 "Eliminate one inflammatory food or habit that your body has been signalling — act on what you already know"],
        "Moon": ["Schedule a full hormonal panel and gut health assessment within 60 days",
                 "Identify your primary emotional trigger for overeating, undereating, or poor sleep — address it directly",
                 "Begin a consistent bedtime routine: no screens after 9 PM, same sleep time daily for 30 days straight"],
        "Mars": ["Start a structured strength training programme — 3 sessions per week, progressive overload, tracked output",
                 "Get a blood panel including iron, ferritin, and inflammatory markers within 30 days",
                 "Reduce stimulant intake (caffeine, alcohol, processed sugar) by 50% for 21 days and measure the difference"],
        "Mercury": ["Book a consultation with a neurologist or pulmonologist for any persistent nervous system or respiratory symptoms",
                    "Begin a daily breathwork practice: 10 minutes of structured pranayama before screens each morning",
                    "Implement a digital fast: no screens for 90 minutes after waking and 60 minutes before sleep"],
        "Jupiter": ["Schedule a liver function test and metabolic panel — Jupiter governs excess; catch it early",
                    "Reduce portion sizes and alcohol consumption by 30% for the next 60 days — moderate, do not eliminate",
                    "Begin a structured weight management programme with a nutritionist, not a generic app"],
        "Venus": ["Book a dermatology and gynaecological/urological check-up within 30 days",
                  "Begin a targeted skincare and hormonal wellness routine guided by a specialist, not social media",
                  "Reduce sugar, refined carbohydrates, and alcohol — Venus health issues are almost always diet-accelerated"],
        "Saturn": ["See an orthopaedic specialist or physiotherapist for any joint, back, or chronic pain — do not manage it with painkillers",
                   "Establish a strict sleep protocol: in bed by 10:30 PM, no exceptions for 30 days",
                   "Begin a calcium and vitamin D supplementation regime under medical supervision for long-term bone health"],
        "Rahu":   ["Seek a second medical opinion on any unresolved or recurring health issue — do not accept a single diagnosis",
                   "Begin a 21-day digital and stimulant detox — Rahu's health issues are overwhelmingly nervous system overload",
                   "Add grounding practices: barefoot walking, oil massage, and cold exposure — not luxury, but neurological medicine"],
        "Ketu":   ["Rest more than you think you should — Ketu health responds to surrender, not intervention",
                   "Begin a gentle immune-support protocol: ashwagandha, tulsi, or medical-grade supplementation under guidance",
                   "Address the energy leak: the relationship, obligation, or environment that consistently drains you"],
    },
    "spirituality": {
        "Sun":  ["Begin a sunrise meditation practice — 20 minutes daily at the same time and same place",
                 "Write a life-purpose statement: one sentence on why you are here, what you are here to do",
                 "Identify and commit to one dharmic action per week — service, creation, or teaching — for the next 90 days"],
        "Moon": ["Start a nightly reflection journal: 3 entries per day — what drained you, what nourished you, what you are grateful for",
                 "Introduce one water-element ritual into your daily life: cold shower, moonlit walk, or river visit monthly",
                 "Join a women's circle, bhakti group, or devotional community — your spiritual growth is amplified by shared resonance"],
        "Mars": ["Begin Surya Namaskar or dynamic yoga: 12 rounds daily for 40 days without a break",
                 "Participate in a fire ceremony or agni hotra practice — Mars channels spiritual energy through action, not sitting",
                 "Commit to one act of courage per day — spirituality for Mars means conquering fear, not avoiding it"],
        "Mercury": ["Study one sacred text with structure: chapter per week, journalled reflections, discussed with a study partner",
                    "Attend a philosophy talk, satsang, or structured spiritual discourse once per week for 3 months",
                    "Write: morning pages, spiritual journaling, or a teaching document for someone else — clarity through articulation"],
        "Jupiter": ["Enrol in a structured philosophy course, Jyotish study, or vedantic teaching programme this month",
                    "Plan and execute one pilgrimage or spiritually meaningful journey within the next 6 months",
                    "Give — tithing, volunteer teaching, or mentoring someone on their spiritual path — this is Jupiter's fastest growth catalyst"],
        "Venus": ["Create a dedicated altar or sacred corner in your home — beauty and devotion are inseparable in Venus practice",
                  "Begin a gratitude mantra practice: 108 repetitions of a gratitude mantra each morning for 40 days",
                  "Attend a kirtan, devotional concert, or sacred arts event monthly — the frequency attunes your energy field"],
        "Saturn": ["Commit to one meditation practice and do it every day for 90 days without exception — no substitutions",
                   "Serve: volunteer weekly in a way that requires genuine sacrifice of time and comfort",
                   "Study the tradition deeply — not broadly. Pick one text, one teacher, one practice and go vertical, not horizontal"],
        "Rahu":   ["Explore one tradition outside your upbringing with genuine curiosity and full commitment for 90 days",
                   "Attend a 10-day Vipassana or equivalent silence retreat — Rahu's spiritual breakthroughs require radical pause",
                   "Ground the mystical with the practical: pair each spiritual insight with one real-world application"],
        "Ketu":   ["Commit to a daily 20-minute silent sitting — not guided, not music, not mantra — just silence",
                   "Undertake a solitary retreat of minimum 3 days within the next 6 months",
                   "Release one attachment — a person, role, or identity — that your inner knowing tells you is complete"],
    },
    "education": {
        "Sun":  ["Identify the single qualification that delivers the highest authority in your target field — pursue it formally",
                 "Apply for the course, programme, or scholarship within the next 30 days — Sun phase rewards decisive action",
                 "Approach one authority figure in your field for a mentorship or supervised learning arrangement this month"],
        "Moon": ["Enrol in an experiential or immersive learning format — not a textbook course",
                 "Create a consistent study environment: same desk, same time, same ritual — Moon phase needs anchored habit",
                 "Find a study partner or small group — Moon's learning accelerates significantly with emotional connection to peers"],
        "Mars": ["Register for a competitive exam or certification within the next 30 days — action precedes preparation",
                 "Replace passive revision with active recall: practice tests, flashcards, and timed problem sets daily",
                 "Set a daily minimum study output — hours are a poor metric; completed topics per day is the right measure"],
        "Mercury": ["Begin the certification, language course, or writing programme this week — not next month",
                    "Create a structured study schedule with 90-minute focused blocks and a tracked completion log",
                    "Join an online learning community in your subject — Mercury's learning is social and iterative"],
        "Jupiter": ["Apply for the postgraduate degree, advanced diploma, or international programme — Jupiter phase is the highest academic window",
                    "Identify and approach a research supervisor or academic mentor who can expand your intellectual horizon formally",
                    "Read 2 advanced texts in your field per month — not popular summaries, but primary or canonical sources"],
        "Venus": ["Enrol in the creative, design, music, or relationship-intelligence programme you have been considering",
                  "Build a portfolio alongside your coursework — Venus phase makes visible output more valuable than grades alone",
                  "Collaborate: form a project group, creative partnership, or co-authored submission — Venus learns through relationship"],
        "Saturn": ["Commit to a long-form qualification that takes 12–24 months — Saturn phase is not for quick wins",
                   "Study at the same time each day, with full focus, and no missed sessions — Saturn's reward is proportional to consistency",
                   "Take the professional licensing exam you have been deferring — the delay is costing you more than the preparation"],
        "Rahu":   ["Enrol in an international, online, or cross-border programme — Rahu phase makes foreign education unusually valuable",
                   "Study a future-facing discipline: AI, data, biotech, digital media, or cross-cultural studies",
                   "Pursue the unconventional educational path that your conventional peers are ignoring — Rahu rewards the contrarian learner"],
        "Ketu":   ["Pursue a research topic that is deeply meaningful to you, even if its commercial value is unclear — the depth itself is the output",
                   "Establish a daily solo study practice with minimum distraction — Ketu's learning is inward, not performance-oriented",
                   "Re-engage with a subject from an earlier period of your life that you abandoned — Ketu often closes old loops"],
    },
    "travel": {
        "Sun":  ["Apply for the visa, transfer, or relocation role within the next 30 days — Sun phase rewards visible ambition",
                 "Identify the destination where your professional authority is most portable and in demand",
                 "Book a reconnaissance trip to your target city or country before committing to a full relocation"],
        "Moon": ["Research the emotional and community landscape of your target destination, not just the logistics",
                 "Connect with someone already settled at the destination before you arrive — emotional anchor is essential",
                 "Choose accommodation near a body of water or in a neighbourhood with established community life"],
        "Mars": ["Book the trip — stop researching and act. The details will resolve once you have committed",
                 "Pack light and plan loosely: Mars travel is best when it has room to be spontaneous and assertive",
                 "Set one clear objective for the trip or relocation — professional, personal, or both — and execute it"],
        "Mercury": ["Research your destination with analytical precision: cost of living, professional networks, language requirements",
                    "Join the digital nomad, expat, or professional community for your target location before arriving",
                    "Plan 2–3 short trips before committing to a long-term relocation — Mercury phase rewards iterative decisions"],
        "Jupiter": ["Plan the international travel with a purpose beyond tourism: study, pilgrimage, conference, or extended work placement",
                    "Apply for the foreign assignment, international posting, or overseas scholarship — Jupiter phase amplifies international opportunity",
                    "Research destinations aligned with your spiritual or philosophical interests — the journey itself will transform you"],
        "Venus": ["Plan the travel for the most culturally and aesthetically rich experience possible — not the cheapest option",
                  "Invite someone meaningful — a partner, close friend, or collaborator — to make the journey with you",
                  "Visit the destination during its cultural peak season — festivals, art events, or celebratory periods"],
        "Saturn": ["Prepare all documentation meticulously before travel: visas, permits, insurance, and financial proof",
                   "Choose your destination based on long-term sustainability, not short-term appeal",
                   "Stress-test the relocation budget: can you sustain this for 18 months if things go more slowly than planned?"],
        "Rahu":   ["Apply for international positions, foreign visas, and cross-border opportunities simultaneously — Rahu rewards parallel action",
                   "Research the foreign destination that has the largest opportunity gap for your specific skill set",
                   "Be prepared for unexpected acceleration: Rahu travel changes can happen suddenly — keep your documentation ready"],
        "Ketu":   ["Plan the pilgrimage, ashram stay, or spiritually motivated journey — Ketu's most productive travel is inward-driven",
                   "Travel light, with minimal agenda and maximum openness — Ketu's insights emerge in unstructured space",
                   "Visit the place that has called to you persistently — Ketu travel often resolves longstanding inner questions"],
    },
    "children": {
        "Sun":  ["Consult a reproductive specialist for a full fertility baseline assessment within the next 30 days",
                 "Have the direct, unambiguous conversation with your partner about timeline, readiness, and shared commitment",
                 "Ensure your financial foundation is solid before conception — property, savings, or income stability"],
        "Moon": ["Schedule a hormonal panel and thyroid check — Moon governs the hormonal landscape most directly",
                 "Reduce stress through consistent sleep, reduced caffeine, and daily emotional regulation practice",
                 "Build your emotional support network now — the transition requires community, not just partnership"],
        "Mars": ["Act on the family decision — if you have been circling the question, set a decision date and honour it",
                 "Address any male-factor fertility concerns proactively with a specialist — Mars rules male reproductive health",
                 "Build physical fitness and reduce inflammatory foods in the 3 months before conception attempt"],
        "Mercury": ["Research the genetic and medical considerations relevant to your background before conception",
                    "Have a detailed, structured conversation with your partner about parenting philosophy, roles, and boundaries",
                    "Enrol in a pre-conception health programme — knowledge reduces anxiety and improves outcomes"],
        "Jupiter": ["Engage your family's elder or spiritual tradition in blessing and preparing for the new arrival",
                    "Begin prenatal nutrition and supplementation 3 months before conception — Jupiter rewards preparation",
                    "Consult a fertility specialist who takes an integrative approach — not purely clinical"],
        "Venus": ["Invest in the relationship quality first — Venus phase makes partnership health directly linked to conception",
                  "Begin a couples wellness programme: nutrition, sleep, and stress reduction together",
                  "Create the home environment with intention — a warm, beautiful, welcoming space is a Venus fertility remedy"],
        "Saturn": ["Work with a specialist over a 12–24 month structured timeline — Saturn phase rewards patience and planning",
                   "Ensure all practical prerequisites are in order: housing, savings, career stability, and health baseline",
                   "Do not rush or force the timeline — Saturn's outcomes arrive correctly when the foundation is complete"],
        "Rahu":   ["Stay open to unconventional routes: IVF, surrogacy, or adoption may be part of your family story",
                   "Consult an international or specialist fertility centre if standard approaches have not worked",
                   "Release the expectation of how this 'should' look — Rahu's gifts arrive in unexpected packaging"],
        "Ketu":   ["Prioritise inner readiness over external pressure — Ketu delays lift when the inner preparation is complete",
                   "Work with a holistic fertility practitioner: diet, energy, and emotional clearing alongside medical support",
                   "Trust the timing — Ketu's family blessings arrive with profound significance when they arrive"],
    },
    "general": {
        "Sun":  ["Identify your one most important goal for the next 12 months and commit to it publicly",
                 "Schedule one direct conversation with a decision-maker who can materially change your situation",
                 "Complete the incomplete: the project, relationship conversation, or commitment you have been deferring"],
        "Moon": ["Take one honest look at your emotional patterns — identify what is driving your most important decisions",
                 "Prioritise the relationship that gives you the most energy and has been receiving the least of your attention",
                 "Create one consistent daily anchor: a morning ritual, an evening reflection, or a weekly reset conversation"],
        "Mars": ["Identify the one action you have been avoiding and do it within 48 hours",
                 "Cut one time-consuming commitment that is not moving you toward your primary goal",
                 "Book one important meeting, pitch, or conversation that you have been putting off — Mars does not reward waiting"],
        "Mercury": ["Communicate clearly: send the message, have the conversation, or make the announcement you have been drafting",
                    "Analyse your situation with data: track the key metric that tells you whether you are improving",
                    "Connect: reach out to 5 people who are 2–3 steps ahead of you and ask one direct question each"],
        "Jupiter": ["Expand: take on the bigger challenge, apply for the better role, or say yes to the larger vision",
                    "Learn: invest in one significant knowledge upgrade — course, mentor, or programme — this quarter",
                    "Give: identify the most impactful contribution you can make with what you already have"],
        "Venus": ["Beautify: invest in the environment, appearance, or creative output that makes you feel most alive",
                  "Harmonise: address the one significant relationship friction that has been draining your energy",
                  "Appreciate: name 3 things that are genuinely working well and allocate more time to them"],
        "Saturn": ["Build: identify the one foundational habit — sleep, exercise, financial discipline — and install it for 90 days",
                   "Complete: finish one important, overdue commitment before starting anything new",
                   "Simplify: remove one obligation, commitment, or relationship that is costing more than it is returning"],
        "Rahu":   ["Challenge: identify the one bold move you have been rationalising away and take it",
                   "Research: spend 10 hours this month understanding a domain outside your current expertise that may be relevant",
                   "Disrupt: question one assumption about your situation that you have accepted as fixed — it probably is not"],
        "Ketu":   ["Release: identify what you are holding onto that no longer serves your next chapter — let it go deliberately",
                   "Simplify: reduce your commitments to the essential few that genuinely align with your deeper direction",
                   "Reflect: create 30 minutes of daily unstructured silence — the answers Ketu offers only arrive in stillness"],
    },
}


# ── WHERE environments per intent (3 points) ─────────────────────────────────

_WHERE_POINTS: Dict[str, Dict[str, List[str]]] = {
    "marriage": {
        "Sun":  ["Professional or industry events where ambitious, settled people gather",
                 "Family-led or community-organised introductions — the traditional network still delivers the highest-quality matches",
                 "Cultural or spiritual gatherings where values alignment is natural, not performed"],
        "Moon": ["Close family social circles and mother-side community events",
                 "Care-based environments: healthcare settings, community volunteering, or nurturing professional spaces",
                 "Water-adjacent locations: coastal cities, river towns, or retreat environments near nature"],
        "Mars": ["Sports, fitness, or competitive environments where decisive people gather",
                 "Technical or entrepreneurial meetups — Mars connections are made through shared challenge, not shared comfort",
                 "Sibling or close-friend-introduced social events — Mars's network arrives through active peers"],
        "Mercury": ["Intellectual events — book launches, conferences, courses, and workshops",
                    "Online platforms and professional networks — Mercury's introductions often begin digitally",
                    "Co-working spaces, hackathons, or collaborative project environments"],
        "Jupiter": ["Community elders, spiritual gatherings, educational institutions, and temple events",
                    "Alumni networks, professional associations, and cultural diaspora communities",
                    "Family elders' networks — Jupiter's best introductions come through trusted third parties with long-term perspective"],
        "Venus": ["Arts events, cultural evenings, and aesthetically curated social spaces",
                  "Upscale social gatherings, charity events, or creative industry mixers",
                  "Mutual female-friend introductions — Venus's network moves through warm social trust"],
        "Saturn": ["Workplace or professional settings — Saturn's matches arrive through shared responsibility",
                   "Long-standing community or religious organisations — sustained membership creates natural introductions",
                   "Alumni networks or structured social organisations with a clear shared purpose"],
        "Rahu":   ["Travel destinations, international platforms, and cross-cultural social environments",
                   "Online dating and social platforms — Rahu's introductions are disproportionately digital",
                   "Unconventional events: tech meetups, global conferences, or multicultural gatherings"],
        "Ketu":   ["Meditation centres, yoga retreats, ashrams, and spiritual community spaces",
                   "Quiet, intentional social environments — not parties, but small, purposeful gatherings",
                   "Sacred sites, pilgrimages, and retreat environments — Ketu's connections are pre-arranged by something deeper"],
    },
    "career": {
        "Sun":  ["Executive-level industry events, government forums, and leadership summits",
                 "Large, established organisations where authority structures create clear promotion tracks",
                 "Keynote-speaking or panel-participation platforms — visibility at the authority level"],
        "Moon": ["Public sector organisations, healthcare systems, and community service institutions",
                 "Client-facing teams, hospitality environments, and social impact organisations",
                 "Collaborative, team-based workplaces where emotional intelligence is rewarded"],
        "Mars": ["Startups, fast-growth companies, and entrepreneurial ecosystems",
                 "Technical, engineering, and physically demanding industry environments",
                 "Competitive environments with performance-based advancement — Mars thrives when results are visible and rewarded"],
        "Mercury": ["Tech companies, media organisations, and communication-driven industries",
                    "Consulting firms, advisory practices, and roles with intellectual variety",
                    "Remote or distributed teams with strong written communication culture"],
        "Jupiter": ["Universities, advisory firms, legal institutions, and financial services",
                    "International organisations or cross-border companies with a values-led mission",
                    "Large, established companies where the mentor culture is strong and mentorship is actively offered"],
        "Venus": ["Creative agencies, luxury brands, fashion, beauty, hospitality, and arts organisations",
                  "Relationship-driven industries: PR, HR, client management, and partnerships",
                  "Aesthetically refined or design-led workplaces where quality of environment is taken seriously"],
        "Saturn": ["Government, infrastructure, mining, real estate, and legacy industry organisations",
                   "Demanding, meritocratic environments where promotion is strictly based on output and tenure",
                   "Solo practice or independent consulting — Saturn eventually rewards those who build their own structure"],
        "Rahu":   ["Tech startups, AI companies, crypto, digital media, and international commerce",
                   "Foreign companies or organisations with a significant cross-border component",
                   "Disruptive or non-traditional organisations that value unconventional thinking"],
        "Ketu":   ["Research institutions, NGOs, spiritual organisations, and purpose-driven non-profits",
                   "Academic environments, archives, and independent research settings",
                   "Solo practice or remote independent work — Ketu thrives in unstructured, meaning-driven spaces"],
    },
    "finance": {
        "Sun":  ["Government-backed investment vehicles, large financial institutions, and regulated wealth management platforms",
                 "Your primary income source — maximise the existing authority before diversifying",
                 "Professional advisory settings: CA firms, tax consultants, and wealth structuring specialists"],
        "Moon": ["Conservative banking and savings products — high liquidity, low volatility",
                 "Property in familiar, emotionally resonant locations — Moon finance is rooted in security",
                 "Community investment clubs or savings groups with people you trust personally"],
        "Mars": ["High-growth equity, aggressive mutual funds, or direct business investment",
                 "Your own business or side income — Mars returns the highest on self-directed effort",
                 "Short-tenure, high-return instruments: IPOs, aggressive SIPs, or business lending"],
        "Mercury": ["Fintech platforms, digital investing tools, and automated portfolio management",
                    "Multiple small income streams: consulting, licensing, referrals, and digital products",
                    "Information and skills-based income — your knowledge is your most scalable asset"],
        "Jupiter": ["Long-term equity mutual funds, blue-chip stocks, and diversified index investments",
                    "Real estate with strong rental yield and long-term capital appreciation potential",
                    "Structured wealth management with a licensed advisor — Jupiter phase is for systematic, compounding growth"],
        "Venus": ["Creative business ventures, luxury goods, beauty, and hospitality investments",
                  "Joint ventures and partnership-based income — Venus finance flows through relationship",
                  "Aesthetic real estate: residential property in culturally or aesthetically desirable areas"],
        "Saturn": ["Fixed deposits, sovereign bonds, and capital-protected instruments",
                   "Debt reduction — every rupee of debt paid is a guaranteed return that no market can match",
                   "Emergency reserves and insurance products — Saturn phase demands a financial safety net before growth"],
        "Rahu":   ["Emerging technology, international markets, and alternative asset classes",
                   "Foreign currency instruments or overseas investment platforms",
                   "Unconventional income streams: digital products, international clients, or cross-border licensing"],
        "Ketu":   ["Debt-free, minimalist financial position — Ketu rewards simplicity, not complexity",
                   "One high-conviction, deeply researched position — Ketu phase is not for diversification",
                   "Charitable giving and right-giving — Ketu phase's financial return often comes through generosity"],
    },
    "health": {
        "Sun":  ["Outdoor environments with direct sunlight — parks, rooftops, or morning walking paths",
                 "Structured gym or yoga studio with a consistent morning time slot",
                 "Medical consultation settings — proactive check-ups, not reactive emergency visits"],
        "Moon": ["Calm, water-adjacent environments: near a river, beach, or quiet lake for daily walks",
                 "Home — consistent sleep environment is your most powerful health investment",
                 "Counselling or therapy settings — emotional processing is Moon's primary health intervention"],
        "Mars": ["Structured fitness environments: gym, martial arts studio, or athletic training facility",
                 "High-activity outdoor settings: trail running, swimming, or team sport environments",
                 "Medical diagnostics — blood testing and inflammation monitoring in a clinical setting"],
        "Mercury": ["Clean, quiet indoor air environments — air quality directly affects Mercury's respiratory system",
                    "Nature settings for walking and breathwork — forests, parks, or gardens away from urban noise",
                    "Digital-free rest spaces — the nervous system recovers fastest in low-stimulation environments"],
        "Jupiter": ["Nutritional clinic or metabolic wellness centre for structured dietary guidance",
                    "Moderate-intensity outdoor activity: cycling, yoga, or swimming — not extreme exercise",
                    "Community wellness environments — Jupiter responds to shared practice, not isolated effort"],
        "Venus": ["Spa, thermal bath, or integrative wellness clinic for skin and hormonal health",
                  "Aesthetically beautiful natural environments: gardens, coastal paths, or park settings",
                  "Gynaecological or dermatological clinic for proactive monitoring under Venus life phase"],
        "Saturn": ["Physiotherapy clinic for any persistent joint, back, or chronic pain",
                   "Structured sleep environment — complete darkness, consistent schedule, no exceptions",
                   "Outdoor gentle exercise: walking, yoga, or Tai Chi — Saturn health is built by daily consistency, not intensity"],
        "Rahu":   ["Grounding natural environments: earthing, barefoot walking on grass or sand daily",
                   "Detox or cleansing facility — a supervised short-term protocol, not a DIY internet programme",
                   "Specialist diagnostic clinic for any symptoms that standard testing has not resolved"],
        "Ketu":   ["Silent retreat or healing ashram environment — the most powerful Ketu health reset",
                   "Home rest environment — quality, uninterrupted sleep and reduced stimulation is the medicine",
                   "Energy healing, acupuncture, or pranic healing studio — the subtle body responds to subtle inputs"],
    },
    "spirituality": {
        "Sun":  ["An outdoor east-facing practice space — sunrise is the Sun's primary energetic window",
                 "A recognised traditional institution or ashram that teaches with lineage and structure",
                 "Your own home — create a dedicated altar facing east, used at the same time daily"],
        "Moon": ["Near water — ocean, river, lake, or even a bowl of water in your practice space",
                 "A devotional community or bhakti group — Moon's spirituality amplifies in shared resonance",
                 "Your bedroom or most private indoor space — Moon's deepest practice is nocturnal and interior"],
        "Mars": ["An active practice studio: yoga shala, martial arts dojo, or movement space",
                 "Outdoor natural environments for dynamic or fire-based practice",
                 "Service environments — volunteerism, community kitchens, or seva organisations"],
        "Mercury": ["A library, study room, or quiet reading space for structured sacred text study",
                    "Online or in-person satsang platforms with a regular intellectual discourse schedule",
                    "A writing desk — journaling, reflection, and articulating insights deepens Mercury's spiritual integration"],
        "Jupiter": ["A formal teaching institution, gurukul, or structured philosophical school",
                    "Pilgrimage sites — Varanasi, Rishikesh, Tirupati, or equivalents aligned with your tradition",
                    "Your dedicated study space — books, texts, and a consecrated reading environment"],
        "Venus": ["A beautifully appointed home altar space — Venus practice requires aesthetic resonance",
                  "Kirtan halls, devotional concert venues, or sacred music environments",
                  "Nature spaces of beauty: flower gardens, mountain vistas, or sacred groves"],
        "Saturn": ["A structured meditation centre with a fixed schedule and teacher accountability",
                   "Community seva or service organisations — Saturn's growth comes through sustained contribution",
                   "Home practice space — sparse, clean, and used at the same time every day without exception"],
        "Rahu":   ["Multi-tradition or interfaith centres where experimentation is welcomed",
                   "Retreat environments that remove you from your habitual life for 5–10 days minimum",
                   "Nature environments that are unfamiliar — new geography disrupts Rahu's comfortable spiritual stagnation"],
        "Ketu":   ["A silent meditation retreat centre — Ketu's deepest work requires no input",
                   "Sacred sites with historical depth: ancient temples, cave hermitages, or pilgrimage forests",
                   "Your inner space — wherever you are, the practice is stillness; the location is secondary"],
    },
    "education": {
        "Sun":  ["A recognised, accredited institution with strong authority and placement track record",
                 "Faculty offices and mentors' rooms — direct access to authority accelerates Sun-phase learning",
                 "Industry events and conferences — learning in authority-presence environments builds credentials"],
        "Moon": ["Immersive learning environments: residential programmes, field study, or experiential workshops",
                 "Small, intimate classroom settings with high faculty-to-student ratio",
                 "Library or home study space with an emotionally consistent and comfortable atmosphere"],
        "Mars": ["Competitive training environments: bootcamps, exam academies, and speed-learning programmes",
                 "Laboratory, workshop, or active learning environments where doing outweighs listening",
                 "Study groups with competitive peers — Mars absorbs through performance pressure"],
        "Mercury": ["Digital learning platforms, online courses, and virtual cohort programmes",
                    "Co-working or collaborative study environments with high peer interaction",
                    "Language immersion or cross-disciplinary environments that require constant adaptation"],
        "Jupiter": ["Universities, postgraduate institutes, and international academic programmes",
                    "Research libraries and academic archives — Jupiter's learning goes deep, not broad",
                    "Wisdom-based or philosophical institutions: seminaries, research centres, or think tanks"],
        "Venus": ["Arts academies, design schools, music conservatories, and creative education centres",
                  "Studio or atelier environments where making and learning are inseparable",
                  "International cultural exchange programmes and study-abroad environments"],
        "Saturn": ["Professional institutes and certification bodies with rigorous standards and long track records",
                   "Structured self-study environments — the same desk, same schedule, same method, daily",
                   "Apprenticeship or professional placement settings where learning happens through sustained responsibility"],
        "Rahu":   ["International universities, online global platforms, and cross-border academic programmes",
                   "Emerging technology campuses or innovation labs",
                   "Non-traditional learning environments: unaccredited programmes with direct industry outcomes"],
        "Ketu":   ["Research centres, independent study programmes, and solitary academic environments",
                   "Ancient or traditional knowledge institutions: Sanskrit universities, Ayurvedic colleges, or philosophy schools",
                   "A dedicated private study space with no interruptions — Ketu's deepest learning is solitary"],
    },
    "travel": {
        "Sun":  ["Capital cities and seats of institutional power in your target country or region",
                 "Professional hubs: financial districts, government centres, or industry headquarters",
                 "Recognised cultural landmarks that build your credibility and social standing at the destination"],
        "Moon": ["Coastal cities, island environments, or places near large bodies of water",
                 "Family-established or diaspora-community cities where you have an existing emotional anchor",
                 "Quiet, residential neighbourhoods with established community life — not tourist or commercial zones"],
        "Mars": ["Adventure travel destinations: mountains, wilderness, or physically demanding terrains",
                 "Fast-moving cities with active startup or entrepreneurial ecosystems",
                 "Destinations where you have a clear professional objective — Mars travel without a goal wastes its energy"],
        "Mercury": ["Connected, cosmopolitan cities with strong digital infrastructure and multicultural communities",
                    "Conference or event destinations — Mercury travel is most productive when it has an intellectual agenda",
                    "Short-haul, frequent destinations — Mercury is better at many trips than one long commitment"],
        "Jupiter": ["Internationally recognised pilgrimage cities, academic centres, or cultural capitals",
                    "Countries with strong educational or spiritual infrastructure: India, Japan, Italy, or equivalents",
                    "Long-distance destinations — Jupiter phase is built for expansive geography, not local exploration"],
        "Venus": ["Aesthetically celebrated destinations: Mediterranean coasts, cultural capitals, and art cities",
                  "Honeymoon or leisure destinations of genuine beauty and cultural richness",
                  "Cities known for food, design, fashion, or natural beauty — Venus travel nourishes through sensory richness"],
        "Saturn": ["Practical, well-documented destinations with clear visa processes and financial predictability",
                   "Cities with strong professional infrastructure and a stable expat community",
                   "Long-term relocation destinations — Saturn is not for short trips; invest in one place properly"],
        "Rahu":   ["Frontier or fast-developing cities: Dubai, Singapore, Berlin, or other global hubs outside your home country",
                   "International tech and innovation hubs with high cross-cultural professional density",
                   "Unexpected destinations — a country you have never considered may be Rahu's most productive move"],
        "Ketu":   ["Sacred pilgrimage routes: Char Dham, Camino de Santiago, Shikoku, or equivalents",
                   "Forest retreats, mountain hermitages, or ashram environments with minimal connectivity",
                   "Ancestral homelands or places with deep personal or karmic significance"],
    },
    "children": {
        "Sun":  ["A medical fertility clinic with strong institutional track record and specialist authority",
                 "Your home — prepare the physical space as if the child is already expected",
                 "Family home environments with strong paternal presence and institutional stability"],
        "Moon": ["Maternal family environments — close proximity to your mother or mother-in-law during this phase is supportive",
                 "Natural, calm settings for prenatal wellness: parks, clean coastal areas, or quiet residential homes",
                 "Home birthing or community midwifery environments where the emotional atmosphere is prioritised"],
        "Mars": ["A reproductive medicine specialist's clinic for proactive fertility assessment",
                 "Active, physical environments for the parents-to-be — Mars fertility is supported by physical vitality",
                 "The shared home — create decisiveness and structure in the domestic space as a foundation"],
        "Mercury": ["Medical consultation settings — information gathering and specialist second opinions",
                    "Parenting education environments: ante-natal classes, child development workshops, or online communities",
                    "Well-documented clinical environments where every step of the process is clearly explained"],
        "Jupiter": ["A temple or spiritually significant space for receiving blessing before the conception window",
                    "A wellness-integrated fertility clinic with holistic and medical options",
                    "Family home with a warm, expansive gathering atmosphere — Jupiter's family energy grows in joyful spaces"],
        "Venus": ["A beautifully prepared home environment — nesting is not just emotional, it is a Venus fertility practice",
                  "A romantic, restorative setting for the couple — relationship quality is Venus's primary fertility indicator",
                  "A fertility wellness clinic that integrates lifestyle, nutrition, and hormonal support"],
        "Saturn": ["A specialist reproductive medicine clinic for structured, protocol-driven support",
                   "A stable, well-resourced domestic environment — Saturn's family timing requires material readiness",
                   "Financial planning environments — ensure the economic foundation is solid before the medical process begins"],
        "Rahu":   ["International or specialised fertility clinics with access to advanced reproductive technologies",
                   "Legal or administrative settings if adoption or surrogacy is part of the path",
                   "Online support communities for non-traditional family-building routes"],
        "Ketu":   ["A healing or cleansing retreat before the conception window — inner preparation is Ketu's prerequisite",
                   "A home environment cleared energetically: Vastu-adjusted, clutter-free, and emotionally settled",
                   "A spiritual or holistic fertility centre that addresses the energetic and emotional dimensions of conception"],
    },
    "general": {
        "Sun":  ["The arena where your authority is most visible and most needed — step into it, not away from it",
                 "Professional or institutional settings where your decision-making has the greatest impact",
                 "Your own seat of power — the home, office, or practice environment that you have been underutilising"],
        "Moon": ["The relationship environments that replenish you — your most trusted inner circle",
                 "Calm, beautiful domestic spaces that allow your emotional intelligence to function clearly",
                 "Community settings where you give and receive emotional support with genuine reciprocity"],
        "Mars": ["The environment where the most important challenge is waiting — do not retreat from it",
                 "Competitive, high-energy settings that sharpen your focus and eliminate distraction",
                 "Any physical, active environment — Mars energy grounds itself through the body first"],
        "Mercury": ["Intellectual, communicative environments where information moves and ideas collide",
                    "Digital and professional networks that connect you to the right people at the right time",
                    "Your own desk — clear it, organise it, and use it as the primary workspace for your most important work"],
        "Jupiter": ["Expansive environments: universities, international settings, or mentor-rich communities",
                    "Anywhere the conversation goes deeper than surface — Jupiter grows in depth, not in breadth",
                    "Your own mind — Jupiter's most transformative environment is structured inner inquiry"],
        "Venus": ["Beautiful, harmonious spaces that bring out your best thinking and most generous energy",
                  "Social environments with genuine warmth and creative stimulus",
                  "Relationship environments — the people who make you feel most alive are your most productive context"],
        "Saturn": ["Your own discipline — the daily practice, the consistent schedule, the honest review",
                   "Demanding professional environments that hold you to the highest standard",
                   "Structured, organised physical spaces — Saturn's clarity begins with environmental order"],
        "Rahu":   ["Unfamiliar environments that challenge your existing assumptions and expand your frame",
                   "International or cross-cultural settings where new perspectives are the default",
                   "Digital and future-facing environments where the rules have not yet solidified"],
        "Ketu":   ["Inner space — silence, stillness, and reduction of external stimulation is the primary environment",
                   "Solitary, natural environments that strip away the constructed identity and reveal what remains",
                   "The past — Ketu's answers are often located in an earlier chapter that was not fully closed"],
    },
}


def _apply_jargon(text: str) -> str:
    for pattern, replacement in JARGON_MAP.items():
        text = re.sub(pattern, replacement, text)
    return text


# ── Sub-intent detector ────────────────────────────────────────────────────────
# Reads the literal question text to identify WHAT the user is specifically asking.
# Returns a sub_intent tag that overrides labels and content within the same intent.

_SUB_INTENT_PATTERNS: List[tuple] = [
    # ── marriage sub-intents ───────────────────────────────────────────────────
    # must be checked BEFORE generic "when will i" patterns to avoid false fires
    ("marriage_timing",      ["when will i get married", "when is my marriage", "when can i get married",
                               "when will my marriage", "delay in my marriage", "reason for delay in my marriage",
                               "reasons for delay in my marriage", "delay in marriage", "why is my marriage delayed",
                               "what is delaying my marriage", "when should i get married",
                               "how long will it take to get married", "how soon will i get married",
                               "marriage timing", "when will i find a partner"]),
    ("marriage_partner_type",["what kind of husband", "what kind of wife", "what kind of partner",
                               "what type of husband", "what type of wife", "what type of partner",
                               "what will my husband be", "what will my wife be",
                               "kind of person will my husband", "kind of person will my wife",
                               "who will be my husband", "who will be my wife",
                               "what will he be like", "what will she be like",
                               "describe my husband", "describe my partner",
                               "characteristics of my husband", "nature of my partner",
                               "what kind of person will he", "what kind of person will she"]),
    ("marriage_location",    ["from where will my husband", "from where will my wife",
                               "from where will my partner", "where will i meet my husband",
                               "where will i meet my wife", "where is my husband from",
                               "where is my partner from", "which city will my husband",
                               "which place will my husband", "from which city will my husband",
                               "from which place will my partner"]),
    # ── career sub-intents ─────────────────────────────────────────────────────
    ("career_promotion",     ["promotion", "get promoted", "higher position", "next level",
                               "salary raise", "salary hike", "pay raise", "increment",
                               "when will i be promoted", "career recognition", "stuck in career",
                               "career stuck", "not getting recognition", "get recognition"]),
    ("career_switch",        ["switch job", "change job", "new job", "different company",
                               "should i leave my job", "leave my job", "quit my job",
                               "leave this company", "change company", "better job"]),
    ("career_business",      ["start my own business", "own business", "start a business",
                               "startup", "entrepreneur", "my own company", "business venture",
                               "should i start", "go into business"]),
    # ── finance sub-intents ────────────────────────────────────────────────────
    ("finance_investment",   ["invest", "investment", "stock market", "mutual fund", "crypto",
                               "portfolio", "returns", "grow my money", "grow my savings",
                               "money grow", "will my investments"]),
    ("finance_debt",         ["clear my debt", "pay off debt", "repay loan", "loan repayment",
                               "clear loan", "financial burden", "emi burden", "get out of debt",
                               "how do i clear", "debt free"]),
    # ── health sub-intents ─────────────────────────────────────────────────────
    ("health_chronic",       ["keep falling sick", "always falling sick", "recurring illness",
                               "chronic fatigue", "chronic illness", "always sick",
                               "keep getting sick", "why do i fall sick", "low energy",
                               "always tired", "constant fatigue"]),
    ("health_mental",        ["anxiety", "depression", "mental health", "overthinking",
                               "panic attack", "severe stress", "emotional health"]),
    # ── children sub-intents ───────────────────────────────────────────────────
    ("children_timing",      ["when will i have a baby", "when will i get pregnant",
                               "when can i have a child", "baby timing", "pregnancy timing",
                               "chances of pregnancy", "when will i conceive",
                               "when will i become a mother", "when will i become a father"]),
    # ── travel sub-intents ─────────────────────────────────────────────────────
    ("travel_country",       ["which country is best for me", "which country should i go to",
                               "best country for me", "which country to settle",
                               "which country for career", "which country for studies"]),
]

def _detect_sub_intent(question: str, intent: str = "") -> Optional[str]:
    """
    Returns a sub_intent tag if the question matches a specific sub-pattern.
    Uses intent as a guard — only marriage sub-intents fire for marriage questions, etc.
    """
    q = question.lower()
    for sub_intent, phrases in _SUB_INTENT_PATTERNS:
        # Guard: sub_intent prefix must match the question's top-level intent
        # e.g. marriage_timing only fires when intent == 'marriage'
        if intent and not sub_intent.startswith(intent) and not sub_intent == "general":
            # Allow cross-intent only if intent is empty (called without context)
            if intent:
                continue
        if any(p in q for p in phrases):
            return sub_intent
    return None


# ── Sub-intent overrides for labels and content ───────────────────────────────
# Keyed by sub_intent × dasha_planet → (who_label, who_list, what_label, what_list,
#                                        when_label, where_label, where_list)

_SUB_INTENT_OVERRIDES: Dict[str, Dict[str, Any]] = {

    "marriage_timing": {
        "who_label":   "Who or what is causing the delay in your marriage?",
        "what_label":  "What actions can accelerate your marriage timeline?",
        "when_label":  "When is the most favourable window for your marriage?",
        "where_label": "Where should you focus your efforts to remove the delay?",
        "who": {
            "Sun":     ["Your father or paternal family — their expectations may be creating friction",
                        "An overly high personal standard — Sun phase can make you feel 'not ready yet'",
                        "Authority figures in your family who need to align before a decision can be made"],
            "Moon":    ["Emotional over-caution — Moon phase can make you wait until you 'feel certain', which never arrives",
                        "Your mother or maternal family — their preferences are actively shaping the search",
                        "Fear of change masking itself as 'I haven't found the right one yet'"],
            "Mars":    ["Impatience with the process — you want the right person immediately, which creates pressure",
                        "A sibling or cousin relationship creating comparison or competition",
                        "A past conflict or breakup that is unresolved and quietly blocking forward movement"],
            "Mercury": ["Over-analysis — Mercury phase produces endless evaluation and no commitment",
                        "Communication mismatches in meetings — the first impression is not translating correctly",
                        "Too many options under active consideration — narrowing to 2–3 is essential"],
            "Jupiter": ["Unrealistically high standards set by a respected elder or guru figure",
                        "Jupiter delays for wisdom, not punishment — the timing is being refined, not blocked",
                        "A family expectation of a highly educated or socially elevated match adding unnecessary constraint"],
            "Venus":   ["A previous relationship that is not fully emotionally closed",
                        "An overemphasis on external appearance or lifestyle compatibility at the expense of values",
                        "Venus demands emotional readiness — the delay ends when inner comfort arrives"],
            "Saturn":  ["Saturn is the primary delay planet — it rewards patience and penalises impatience",
                        "Material preparedness — Saturn delays marriage until financial or career stability is established",
                        "Karmic clearing — a past-life pattern around commitment needs resolution first"],
            "Rahu":    ["An unconventional life path that does not fit standard marriage timelines",
                        "A strong drive for independence or personal goals that unconsciously pushes marriage back",
                        "Family or societal pressure creating internal resistance — Rahu rebels against external force"],
            "Ketu":    ["A deep spiritual detachment that makes worldly commitment feel secondary",
                        "Karmic incompletion from a prior chapter — something must be released first",
                        "A pattern of withdrawing from relationships just before they deepen"],
        },
        "what": {
            "Sun":     ["Openly communicate your readiness to family decision-makers — remove ambiguity about your timeline",
                        "Set a clear personal deadline for a decision and share it with the people managing the search",
                        "Ask your father or a senior male figure to actively sponsor and lead introductions"],
            "Moon":    ["Stop waiting for certainty — emotional readiness is built by meeting people, not by thinking",
                        "Speak to your mother directly: is her standard the delay, or yours? Get clarity now",
                        "Commit to at least 3 genuine introductions in the next 60 days — volume breaks the blockage"],
            "Mars":    ["Channel impatience into action — set a 90-day intensive search window with specific weekly targets",
                        "Resolve any outstanding conflict with an ex or past relationship before entering a new search",
                        "Stop comparing candidates against an idealised internal image — meet, then assess"],
            "Mercury": ["Set a hard limit: evaluate 3 candidates maximum at any one time, then decide",
                        "Reduce the number of questions you ask before a first meeting — meet first, analyse later",
                        "Write down your actual non-negotiables (maximum 3) and release everything else from the criteria list"],
            "Jupiter": ["Lower the educational or social bar by exactly one notch — the right person may not come with the expected credentials",
                        "Ask your guru, elder, or mentor to make one direct introduction — their network is your fastest route",
                        "Accept that Jupiter's delay is protective, not punitive — but set a 6-month decision deadline"],
            "Venus":   ["Do the inner work on the previous relationship: journal, counsel, or ritually close it",
                        "Spend 30 minutes writing what you actually want to feel in a relationship — not who you want",
                        "Commit to genuine openness in the next 3 introductions — give each one at least 3 meetings before judging"],
            "Saturn":  ["Document your career and financial position clearly — once stability is visible, Saturn lifts the delay",
                        "Stop postponing introductions until 'the right time' — Saturn demands action despite imperfect conditions",
                        "Consult an astrologer specifically about your Saturn placement and its timeline for marriage clearance"],
            "Rahu":    ["Examine whether personal goals are unconsciously prioritised over partnership — be honest",
                        "Communicate clearly to family: share your actual timeline expectations, not what they want to hear",
                        "Consider one introduction outside your usual type — Rahu's right match always surprises you"],
            "Ketu":    ["Complete whatever inner work, spiritual practice, or life chapter feels unfinished — it is the prerequisite",
                        "Reduce social withdrawal — Ketu phase can make isolation feel spiritual when it is actually avoidance",
                        "Seek one genuine, vulnerable conversation with a trusted elder about what commitment means to you"],
        },
        "where": {
            "Sun":     ["Family and institutional networks — the delay breaks fastest when authority figures align",
                        "A jyotishi or marriage astrologer who can pinpoint the Saturn/Sun tension in your chart",
                        "The conversation you have not yet had — speak directly to the person whose approval is missing"],
            "Moon":    ["Your mother's network and maternal family circle — the permission and support are both there",
                        "A therapist or counsellor who can help you distinguish emotional readiness from emotional fear",
                        "A trusted female friend who has recently navigated the same transition successfully"],
            "Mars":    ["A structured matrimonial platform where you set a clear search deadline and work it actively",
                        "A sibling or close cousin who can mediate any unresolved family conflict blocking the process",
                        "Any active search channel — the delay ends through action, not waiting"],
            "Mercury": ["A marriage counsellor or relationship coach who helps you decide, not just evaluate",
                        "Your own written list — the clarity exercise always reveals what the real blocker is",
                        "A close, pragmatic friend who can provide honest external feedback on your evaluation pattern"],
            "Jupiter": ["A guru, spiritual elder, or respected community figure who can bless and sponsor the match",
                        "A well-connected family elder in your community — their social radius contains the right match",
                        "An honest conversation with yourself about whether your standards are serving you or protecting you"],
            "Venus":   ["Inner emotional space — the delay is inside, not outside; clearing it ends the external wait",
                        "A trusted counsellor or close friend for the honest conversation about the unresolved past relationship",
                        "A curated matrimonial environment where values alignment is the primary filter, not appearance"],
            "Saturn":  ["A structured matrimonial process with specific timelines and decision checkpoints",
                        "A jyotishi who specialises in Saturn-related marriage delays — the timing has a specific end date",
                        "Your career or financial foundation — stabilise it consciously and Saturn's hold releases"],
            "Rahu":    ["Digital platforms — Rahu's introductions are disproportionately through technology and unexpected channels",
                        "An honest inner audit: is the delay external or self-created? Rahu can make one look like the other",
                        "A cross-cultural or unconventional social environment where the right person is already present"],
            "Ketu":    ["Spiritual practice — the inner clearance is the prerequisite; everything external follows",
                        "A past-life regression therapist or deep karmichealing practitioner",
                        "Solitude and honest reflection — Ketu's delay ends when the inner work is genuinely complete"],
        },
    },

    "marriage_partner_type": {
        "who_label":   "What kind of person is your ideal life partner?",
        "what_label":  "What qualities should you prioritise in a partner?",
        "when_label":  "When will you meet the partner who matches these qualities?",
        "where_label": "Where will you most likely find someone with these qualities?",
        # WHO and WHERE fall through to standard marriage dasha points (correct content for this sub-intent)
        "who":  None,   # use standard _WHO_POINTS["marriage"]
        "what": {
            "Sun":     ["Prioritise: emotional maturity + decisiveness + clear life direction — in that order",
                        "Look for someone who earns respect through character, not just status or income",
                        "A person who communicates directly and does not use silence as a weapon — this is non-negotiable"],
            "Moon":    ["Prioritise: emotional safety above all — you need someone who does not shut down in conflict",
                        "Look for consistent emotional warmth, not peak romantic gestures",
                        "A person who supports your inner world — your sensitivity is a gift, not a burden to be managed"],
            "Mars":    ["Prioritise: directness and decisiveness — someone who can match your energy without competing with it",
                        "Look for physical vitality and a shared drive for action, not just comfort",
                        "A person with their own strong opinions — intellectual or physical passivity will frustrate you quickly"],
            "Mercury": ["Prioritise: intellectual compatibility above physical attraction — without it, the relationship stagnates fast",
                        "Look for strong communication: someone who can argue well, forgive quickly, and discuss anything",
                        "A person with their own projects, passions, and evolving interests — curiosity is your most essential compatibility"],
            "Jupiter": ["Prioritise: values, ethics, and philosophical alignment above everything else",
                        "Look for genuine kindness and generosity of spirit — Jupiter's right match is recognisable by their warmth",
                        "A person with long-term orientation — someone who thinks in decades, not months"],
            "Venus":   ["Prioritise: emotional warmth + aesthetic alignment + shared enjoyment of life's pleasures",
                        "Look for someone who appreciates beauty in small things — daily shared joy is your compatibility metric",
                        "A person who is financially comfortable enough to not make money the primary lens of the relationship"],
            "Saturn":  ["Prioritise: reliability, work ethic, and emotional self-sufficiency — these matter more than romance",
                        "Look for a person whose actions consistently match their words over months, not days",
                        "A person who is emotionally independent enough not to need constant reassurance — and can give you space"],
            "Rahu":    ["Prioritise: intellectual stimulation and openness to different ways of living",
                        "Look for a person who has lived or worked across cultures, industries, or life contexts",
                        "A person who challenges your assumptions positively — the right Rahu match expands your world"],
            "Ketu":    ["Prioritise: spiritual depth and genuine non-attachment to status and materialism",
                        "Look for a person with inner stillness — not suppression, but actual equanimity",
                        "A person who respects your need for solitude and inner life without feeling threatened by it"],
        },
        "where":  None,  # use standard _WHERE_POINTS["marriage"]
    },

    "marriage_location": {
        "who_label":   "What background will your partner most likely come from?",
        "what_label":  "What should you do to expand your search to the right circles?",
        "when_label":  "When is the right time to actively search in these circles?",
        "where_label": "From which place, city, or environment is your partner most likely to come?",
        "who":  None,   # use standard _WHO_POINTS["marriage"]
        "what": {
            "Sun":     ["Expand your search to government, administrative, or institutional networks in other cities",
                        "Ask a respected male senior to make one introduction outside your immediate city circle",
                        "Register on a matrimonial platform that filters by profession and city — not just community"],
            "Moon":    ["Ask your maternal network to make introductions in coastal, riverine, or healthcare-sector cities",
                        "Attend one community event or cultural gathering outside your home city in the next 90 days",
                        "Consider families from cities with strong water or agricultural heritage — Moon's geography favours these"],
            "Mars":    ["Actively search in technical, engineering, or defence community networks across cities",
                        "Attend a sibling's or cousin's wedding or social event in another city — Mars introductions happen through action",
                        "Register with a matrimonial service that has strong reach in industrial or technically-oriented cities"],
            "Mercury": ["Use digital platforms actively — Mercury's right match is disproportionately found online",
                        "Attend a workshop, conference, or online course where people from multiple cities participate",
                        "Expand your search to cities with strong media, tech, or communications industries"],
            "Jupiter": ["Ask a guru, teacher, or respected community elder to make a cross-city introduction",
                        "Attend a spiritual gathering, pilgrimage, or educational event in another city — these are Jupiter's environments",
                        "Register on a matrimonial platform that focuses on education and values alignment, not just region"],
            "Venus":   ["Attend cultural events, arts festivals, or social gatherings in other cities",
                        "Expand your social circle through female friends in different cities — Venus introductions come through women",
                        "Register on a platform where aesthetic or creative compatibility is a search filter"],
            "Saturn":  ["Expand to cities with strong industrial, government, or infrastructure sectors",
                        "Ask a workplace contact in another city to make an introduction — Saturn's matches come through professional channels",
                        "Be patient with long-distance introductions — Saturn's right match rarely lives next door"],
            "Rahu":    ["Open your search to candidates from different states, cultural backgrounds, or international locations",
                        "Use multiple digital platforms simultaneously — Rahu's match comes through unexpected technological channels",
                        "Say yes to one introduction that is geographically or culturally outside your usual parameters"],
            "Ketu":    ["Consider a partner from a spiritually-oriented community, ashram background, or philosophical tradition",
                        "Attend a pilgrimage, meditation retreat, or spiritual gathering in another city or state",
                        "Be open to a partner from a smaller, quieter city or a rural background — Ketu's match is not in the metropolis"],
        },
        "where": {
            "Sun":     ["A city with strong government presence, administrative hubs, or institutional infrastructure",
                        "Your father's professional or social network — the right introduction is already within reach",
                        "A city 200–500km from your home that shares your cultural background but has a broader social pool"],
            "Moon":    ["Coastal cities, river towns, or cities in the south and west with strong hospitality or healthcare sectors",
                        "Your maternal family's home region — the network there holds a high-quality candidate",
                        "A city with an emotionally warm, community-oriented cultural ethos — not a high-pressure metro"],
            "Mars":    ["Industrial cities, defence cantonments, engineering hubs, or fast-moving commercial cities",
                        "Your sibling's or cousin's city — the introduction is most likely to come through this connection",
                        "A city with a strong technical university or engineering college community"],
            "Mercury": ["Metropolitan tech cities: Bengaluru, Hyderabad, Pune, or equivalent in your country",
                        "Online — Mercury's geography is increasingly digital; city becomes less relevant than shared platform",
                        "A city with strong media, publishing, consulting, or communications industries"],
            "Jupiter": ["Cities with strong educational or spiritual infrastructure: Varanasi, Pune, Ahmedabad, or equivalents",
                        "A pilgrimage city or temple town where the right community already gathers",
                        "Your guru's or teacher's city or community — this network carries the highest-quality introductions for Jupiter"],
            "Venus":   ["Aesthetically rich, culturally active cities: Mumbai, Delhi, Kolkata, or equivalents",
                        "A city known for arts, fashion, food, or lifestyle — Venus's partner is found in beautiful environments",
                        "A city introduced through a female friend's network — the introduction comes through women, not directly"],
            "Saturn":  ["A city with strong industrial, governmental, or legacy institutional presence",
                        "A city that is not your current home — Saturn's right match often requires crossing a geographic boundary",
                        "A smaller, stable, well-established city rather than a fast-moving metro — Saturn values stability of place"],
            "Rahu":    ["A different state, a different cultural region, or an international location",
                        "A city you have not yet seriously considered — Rahu's partner defies your geographic expectations",
                        "Online or cross-border — Rahu's match is disproportionately found through digital or international channels"],
            "Ketu":    ["A spiritually significant city, ashram town, or philosophical community hub",
                        "A quieter, less commercially-driven city — Ketu's partner is not found in nightlife or social media",
                        "Your ancestral hometown or a city with deep personal karmic significance"],
        },
    },

    # ── career_business ──────────────────────────────────────────────────────
    "career_business": {
        "who_label":   "Who can help you launch or grow your own business?",
        "what_label":  "What steps should you take to start or scale your venture?",
        "when_label":  "When is the best time to launch or invest in your business?",
        "where_label": "Where should you focus your entrepreneurial energy?",
        "who": {
            "Sun":     ["A senior industry figure or government-connected mentor who can open institutional doors",
                        "An established entrepreneur who built a traditional, authority-backed business",
                        "An investor or angel who funds businesses in government-regulated or infrastructure sectors"],
            "Moon":    ["A female co-founder, business partner, or mentor in a customer-facing or care-based industry",
                        "A creative or hospitality entrepreneur whose success is driven by emotional intelligence",
                        "An advisor who has built a business around community, wellness, or lifestyle markets"],
            "Mars":    ["A technical co-founder or fast-moving operator who complements your strategy with execution",
                        "A sales mentor or revenue-generation specialist who drives early traction",
                        "An entrepreneur from a competitive, action-oriented industry: real estate, logistics, fitness, tech"],
            "Mercury": ["A digital entrepreneur, content creator, or tech founder who models the business you want to build",
                        "A communicator or marketer who has built a brand through writing, speaking, or media",
                        "A business development mentor who has scaled through partnerships and network leverage"],
            "Jupiter": ["A mentor who has built a values-driven, education or advisory-based business",
                        "A legal or financial advisor who structures your business for long-term protection and growth",
                        "An investor or board member who brings wisdom, network, and ethical guidance"],
            "Venus":   ["A creative director, brand strategist, or luxury/lifestyle entrepreneur",
                        "A female co-founder or business partner who brings aesthetic and relationship value",
                        "An investor in the creative, beauty, wellness, or hospitality space"],
            "Saturn":  ["A disciplined, process-driven mentor who has built a business over 10+ years",
                        "A CA, operations expert, or systematic advisor who imposes structure on your idea",
                        "A solo practitioner or independent professional who has turned expertise into income"],
            "Rahu":    ["A tech founder, serial entrepreneur, or cross-border business builder",
                        "An international investor or accelerator that funds disruptive or unconventional ideas",
                        "A digital growth hacker or viral marketing expert who builds reach fast"],
            "Ketu":    ["A purpose-driven entrepreneur whose business is built around meaning, not just margin",
                        "A minimalist business model mentor — low overhead, high expertise, zero waste",
                        "A solo or niche practitioner who has carved a highly differentiated position"],
        },
        "what": {
            "Sun":     ["Register the business entity and secure the legal structure this month — authority begins with legitimacy",
                        "Identify one senior patron or institutional sponsor who can provide your first major contract or endorsement",
                        "Build a visible presence in government or institutional channels — tenders, certifications, or official recognition"],
            "Moon":    ["Validate your concept with 10 real potential customers before building — Moon rewards emotional resonance, not assumptions",
                        "Build community first: a WhatsApp group, an email list, or a local network of people who care about your solution",
                        "Partner with one emotionally intelligent collaborator — a business built alone in Moon phase underperforms"],
            "Mars":    ["Build a minimum viable product in 30 days and sell it — Mars rewards speed over perfection",
                        "Set a revenue target for the first 90 days and pursue it relentlessly — lack of targets kills Mars momentum",
                        "Identify your one sharpest competitive advantage and lead with it in every pitch"],
            "Mercury": ["Write your business idea clearly in 200 words — if you cannot explain it simply, it is not ready",
                        "Build the digital presence: website, social media, and one piece of content per week for 90 days",
                        "Identify 3 potential partnerships or distribution channels and make contact within 30 days"],
            "Jupiter": ["Write a 1-page business plan that includes your mission, target market, and 3-year vision",
                        "Seek a mentor with a track record in your sector — Jupiter phase makes this relationship transformative",
                        "Apply for a grant, accelerator, or institutional programme — Jupiter expands through formal structures"],
            "Venus":   ["Design the brand before building the product — Venus phase makes aesthetics a commercial advantage",
                        "Build 3 strategic partnerships with complementary businesses in your first 60 days",
                        "Price at the premium end of your market — Venus rewards quality over volume"],
            "Saturn":  ["Start lean: validate revenue before investing in overhead — Saturn penalises early excess",
                        "Set a 12-month financial model and track it weekly — Saturn rewards measurement and discipline",
                        "Identify one repeatable, scalable process in your business and systematise it before scaling"],
            "Rahu":    ["Launch the MVP immediately — Rahu phase rewards bold first-mover action over careful planning",
                        "Go digital-first and global-first — Rahu's best business opportunities cross geographic boundaries",
                        "Test unconventional revenue models: subscription, licensing, or platform — Rahu breaks the traditional mould"],
            "Ketu":    ["Start with what you know deeply — Ketu rewards mastery-based businesses over trend-following",
                        "Keep overheads as low as possible — Ketu phase builds slowly and sustainably, not through leverage",
                        "Define your one-line expertise statement and build everything from that single differentiator"],
        },
        "where": {
            "Sun":     ["Government procurement platforms, institutional tender boards, or established industry bodies",
                        "Networking events where senior decision-makers and authority figures gather",
                        "Your own professional credentials — Sun's best business comes from known expertise, not cold outreach"],
            "Moon":    ["Community marketplaces, local networking groups, and word-of-mouth referral environments",
                        "Wellness, lifestyle, hospitality, or care-based industry clusters",
                        "Your existing personal and professional network — Moon's business comes from trusted relationships"],
            "Mars":    ["Startup ecosystems, co-working spaces, and early-stage investor networks",
                        "High-growth sectors: real estate, technology, logistics, fitness, or competitive markets",
                        "Sales-first environments — Mars business grows fastest through direct commercial activity"],
            "Mercury": ["Digital platforms: LinkedIn, content publishing, and online communities in your niche",
                        "B2B service markets: consulting, communications, technology, or advisory sectors",
                        "Partnership channels — Mercury's best growth is through third-party distribution"],
            "Jupiter": ["Education, advisory, legal, financial, or institutional sectors",
                        "International markets where your expertise is differentiated and valued",
                        "Mastermind groups, incubators, or peer communities of high-calibre entrepreneurs"],
            "Venus":   ["Creative industries: design, beauty, fashion, food, wellness, luxury, or hospitality",
                        "Relationship-driven markets where aesthetics, experience, and brand perception determine success",
                        "Social environments where your personality and taste build the brand naturally"],
            "Saturn":  ["Mature, regulated industries: finance, real estate, infrastructure, manufacturing, or professional services",
                        "Solo practice markets: consulting, coaching, accounting, law, or independent expertise",
                        "Your own desk — Saturn's best business is built through consistent, unglamorous daily effort"],
            "Rahu":    ["Tech startups, digital platforms, cross-border commerce, and disruptive sector plays",
                        "International markets and geographies outside your home country",
                        "Emerging categories where the rules are still being written — Rahu operates best without precedent"],
            "Ketu":    ["Niche, highly specialised markets where depth beats breadth",
                        "Spiritual, philosophical, healing, or research-based industries",
                        "Solo or micro-business environments — Ketu's best work is done independently"],
        },
    },

    # ── finance_debt ─────────────────────────────────────────────────────────
    "finance_debt": {
        "who_label":   "Who should you work with to clear your debt?",
        "what_label":  "What specific steps will clear your debt fastest?",
        "when_label":  "When will your financial burden start to lift?",
        "where_label": "Where should you focus to free up money and reduce debt?",
        "who": {
            "Sun":     ["A senior financial advisor or CA who structures a debt repayment plan with authority",
                        "A mentor who has cleared significant personal debt and can share their exact method",
                        "A tax consultant who identifies legitimate deductions that reduce your net liability"],
            "Moon":    ["A family financial advisor who understands your emotional relationship with money",
                        "A debt counsellor who creates a plan without shame — emotional safety is essential for Moon",
                        "A trusted female mentor or elder who has navigated financial difficulty with dignity"],
            "Mars":    ["A direct, no-nonsense financial advisor who gives you a strict payoff schedule and holds you to it",
                        "A high-income mentor in your field who shows you how to increase revenue fast",
                        "A negotiation specialist who can renegotiate interest rates or repayment terms"],
            "Mercury": ["A fintech app or digital financial planner who tracks every rupee with data",
                        "A debt consolidation specialist who simplifies multiple obligations into one manageable plan",
                        "A financial educator who teaches you to understand the true cost of each debt"],
            "Jupiter": ["A senior wealth manager who creates a long-term asset-building plan alongside debt reduction",
                        "A legal advisor who reviews any contracts or loan agreements for unfavourable terms",
                        "A mentor who models financial freedom — not just debt payoff, but wealth building beyond it"],
            "Venus":   ["A financial planner who balances quality of life with repayment — deprivation is unsustainable",
                        "A business advisor who shows you how to monetise creative or relational assets",
                        "A lifestyle coach who helps you identify which expenses bring genuine value and which are noise"],
            "Saturn":  ["A strict, methodical financial advisor who creates a written, dated repayment schedule",
                        "An accountant who enforces the plan — Saturn's debt is cleared through discipline, not inspiration",
                        "An older mentor who paid off significant debt through consistent effort over years"],
            "Rahu":    ["A fintech or digital investment advisor who creates unconventional income streams to accelerate payoff",
                        "An international financial specialist if any of your debt is cross-border",
                        "A high-income digital entrepreneur who shows you how to increase revenue in 90 days"],
            "Ketu":    ["A minimalist financial advisor focused on radical expense reduction",
                        "A debt-freedom mentor who has walked away from materialism — their framework is your model",
                        "A solo practitioner or freelance mentor who shows you how to earn more while spending far less"],
        },
        "what": {
            "Sun":     ["List every debt with its exact balance, interest rate, and monthly minimum — clarity is power",
                        "Attack the highest-interest debt first: avalanche method eliminates total cost fastest",
                        "Negotiate your interest rates directly — Sun phase gives you the authority to ask and receive"],
            "Moon":    ["Write down your emotional triggers for spending — Moon's debt is often emotionally driven",
                        "Set up automatic transfers on salary day: debt payment is automated before discretionary spending",
                        "Build a 1-month emergency fund before accelerating debt payoff — security reduces anxiety-spending"],
            "Mars":    ["Set a 90-day aggressive payoff target for your smallest debt — winning fast builds momentum",
                        "Identify 3 ways to increase income by 20% in the next 6 months: freelance, overtime, or sell",
                        "Cut one major expense category entirely for 90 days — sacrifice one thing, gain financial momentum"],
            "Mercury": ["Download a debt tracking app and log every payment and balance weekly",
                        "Consolidate high-interest debts into a single lower-rate loan — simplify and reduce simultaneously",
                        "Research and apply for a balance transfer at 0% interest — one phone call can save thousands"],
            "Jupiter": ["Create a written 3-year debt-freedom plan with quarterly milestones",
                        "Build one new income stream (course, consulting, advisory) that pays directly toward debt each month",
                        "Review and restructure any outstanding legal or contractual obligations — Jupiter rewards thorough review"],
            "Venus":   ["Identify your top 3 unnecessary luxury expenses and reduce them by 50% — not eliminate, reduce",
                        "Monetise one creative or relational skill this month: teaching, consulting, or content",
                        "Negotiate a payment holiday or reduced EMI with your lender — Venus phase makes conversations productive"],
            "Saturn":  ["Pay more than the minimum on your highest-balance debt every single month, no exceptions",
                        "Automate a fixed extra payment — even ₹2,000–5,000 per month compounds into significant acceleration",
                        "Track your net worth monthly: seeing it improve is the motivation Saturn needs to sustain discipline"],
            "Rahu":    ["Identify an unconventional income stream (digital product, international client, platform income) to add 30–50% extra income",
                        "Use a debt snowball for psychological wins while building the higher income that funds the avalanche",
                        "Negotiate ruthlessly — Rahu phase makes bold asks surprisingly effective"],
            "Ketu":    ["Reduce your monthly expenses by 30% through genuine simplification — not deprivation, but intentional minimalism",
                        "Sell assets, subscriptions, or possessions you no longer use — Ketu phase clears through reduction",
                        "Commit to a debt-free date and work backwards — Ketu responds to clear, final commitments"],
        },
        "where": {
            "Sun":     ["Professional financial advisory firms, government debt relief programmes, or credentialed wealth managers",
                        "Your employer — ask about salary advances, loans at preferential rates, or financial counselling benefits",
                        "The lender itself — direct negotiation often yields better terms than any intermediary"],
            "Moon":    ["Trusted family or close social circle — Moon's debt often has an emotional support dimension",
                        "Community credit unions or cooperative financial institutions with more human terms",
                        "Your domestic budget — the most impactful savings are always found at home first"],
            "Mars":    ["The highest-earning opportunity in your existing skills — the income increase is faster than the expense cut",
                        "Competitive freelance or consulting platforms where your skills can generate immediate income",
                        "Your existing professional network — Mars debt is cleared fastest by selling, not saving"],
            "Mercury": ["Fintech debt management apps: debt trackers, budget tools, and automated payment platforms",
                        "Online financial education communities and resources for self-directed debt strategy",
                        "Your bank's digital portal — most banks have tools to restructure or consolidate that customers never use"],
            "Jupiter": ["Legal aid or consumer protection services if any debt involves unfair terms",
                        "Advanced financial planning with a wealth manager — debt freedom and wealth building should happen simultaneously",
                        "Your own expertise — Jupiter's best income comes from expanding what you already know deeply"],
            "Venus":   ["Lifestyle audit: your spending on aesthetics, social life, and comfort is the first lever",
                        "Creative income platforms where you monetise artistic, relational, or design skills",
                        "Negotiation — Venus phase makes lenders and employers more receptive to flexibility requests"],
            "Saturn":  ["Your monthly budget — the answer is always there: a written, tracked, dated plan",
                        "Structured repayment tools: automated overpayment, fixed schedules, and monthly reviews",
                        "Your own discipline — Saturn's debt is cleared in the same place it is created: daily decisions"],
            "Rahu":    ["Digital income platforms, international client channels, or emerging technology markets",
                        "Alternative lending platforms with more competitive rates than traditional banks",
                        "Unconventional debt relief: debt swap, income sharing, or asset liquidation strategies"],
            "Ketu":    ["Your own expense sheet — radical reduction is always available and always faster than you expect",
                        "Minimalist living communities and financial independence frameworks (FIRE, etc.)",
                        "Past financial decisions — Ketu's debt often requires understanding its origin before resolving it"],
        },
    },

    # ── health_chronic ───────────────────────────────────────────────────────
    "health_chronic": {
        "who_label":   "Who should you consult to address this recurring health issue?",
        "what_label":  "What specific actions will resolve your chronic health problem?",
        "when_label":  "When will your health begin to significantly improve?",
        "where_label": "Where in your lifestyle is the root cause most likely hiding?",
        "who":  None,   # use standard _WHO_POINTS["health"] — already dasha-specific
        "what": {
            "Sun":     ["Get a full cardiac and spinal check — Sun rules these systems; a proactive scan now prevents bigger issues later",
                        "Establish a daily 30-minute outdoor routine in morning sunlight — Sun-ruled chronic issues respond strongly to solar exposure",
                        "Reduce the single largest energy drain in your life: the stress source, the toxic relationship, or the overcommitment"],
            "Moon":    ["See a gastroenterologist and a hormonal health specialist — Moon's chronic illness almost always involves gut or hormones",
                        "Track your energy levels against your monthly cycle — Moon-ruled health has a rhythmic pattern; map it",
                        "Eliminate the 3 most emotionally draining relationships or situations from your daily life — Moon health is emotional first"],
            "Mars":    ["See a haematologist or sports medicine specialist — Mars chronic issues are almost always blood, inflammation, or overexertion",
                        "Rest is the medicine — schedule complete rest days 2x per week and treat them as non-negotiable",
                        "Switch from high-intensity to moderate, consistent exercise — Mars chronic fatigue is frequently caused by over-training"],
            "Mercury": ["See a neurologist or pulmonologist — Mercury governs nervous system and respiratory health",
                        "Do a full digital detox for 14 days: no screens after 8pm, no news, no social media — Mercury overload depletes faster than anything",
                        "Begin pranayama or structured breathwork daily — 10 minutes of conscious breathing resets Mercury's nervous system faster than any supplement"],
            "Jupiter": ["See a hepatologist or metabolic specialist — Jupiter chronic illness often begins with liver, digestion, or weight",
                        "Reduce portion sizes by 25% and eliminate alcohol or sugar for 60 days — Jupiter's body heals through reduction, not addition",
                        "Add one daily walk of 45 minutes — not intense, just consistent — Jupiter responds to gentle, sustained movement"],
            "Venus":   ["See a dermatologist and a reproductive health specialist — Venus governs skin and hormonal health",
                        "Reduce sugar, alcohol, and processed food for 30 days — Venus chronic issues are almost always diet-driven",
                        "Address the relationship stress directly — Venus health deteriorates when love or partnership is unresolved"],
            "Saturn":  ["See an orthopaedic or chronic pain specialist — Saturn governs bones, joints, and long-term structural health",
                        "Prioritise sleep above all else for 30 days — Saturn chronic fatigue is almost always a sleep deficit issue",
                        "Build a daily routine with fixed waking, meal, and sleep times — Saturn's chronic illness heals through structure"],
            "Rahu":    ["Get a second and third medical opinion — Rahu chronic illness is frequently misdiagnosed",
                        "Begin a supervised 21-day detox: eliminate caffeine, alcohol, processed food, and screens simultaneously",
                        "Investigate environmental toxin exposure: mould, air quality, water, and electromagnetic stress — Rahu accumulates these"],
            "Ketu":    ["Try acupuncture, pranic healing, or energy medicine for 3 months — Ketu chronic illness often has no conventional diagnosis",
                        "Begin a daily meditation practice of 20 minutes — Ketu health responds to inner stillness more than physical intervention",
                        "Reduce all stimulation: social obligations, screen time, loud environments — Ketu heals in quietness"],
        },
        "where": {
            "Sun":     ["Your daily routine — morning sunlight and spinal alignment practices are the most impactful changes",
                        "A proactive diagnostic clinic for cardiac, spinal, and general constitution assessment",
                        "Your stress load — identify and eliminate the single biggest energy drain in your life"],
            "Moon":    ["Your gut and hormonal health — these are Moon's primary systems; address them directly",
                        "Your emotional environment — chronic Moon illness almost always improves when emotional safety increases",
                        "Your sleep quality — Moon's healing happens at night; poor sleep sustains the illness cycle"],
            "Mars":    ["Your exercise programme — overtraining is the most common cause of Mars chronic fatigue",
                        "Your iron and haemoglobin levels — Mars rules blood; a basic blood panel is the starting point",
                        "Your inflammatory diet triggers — eliminate one suspected food category at a time for 14 days each"],
            "Mercury": ["Your nervous system — digital overload, multitasking, and sensory stress are the primary Mercury triggers",
                        "Your breathing patterns — shallow, anxious breathing sustains Mercury fatigue; breathwork is the fastest fix",
                        "Your sleep hygiene — Mercury's mind does not switch off; a strict bedtime routine is essential"],
            "Jupiter": ["Your liver and metabolic function — get blood work including liver enzymes, glucose, and lipids",
                        "Your eating habits — overconsumption is Jupiter's primary health risk; reduce before adding",
                        "Your body weight — Jupiter chronic fatigue almost always improves with even a 5–10% weight reduction"],
            "Venus":   ["Your skin and reproductive health — these are Venus's primary indicators; investigate them directly",
                        "Your diet and sugar consumption — Venus chronic illness responds dramatically to dietary intervention",
                        "Your relationship environment — unresolved romantic or partnership stress manifests physically under Venus"],
            "Saturn":  ["Your sleep — Saturn chronic fatigue is almost always a sleep architecture issue, not an energy issue",
                        "Your joints and structural health — chronic pain under Saturn is skeletal; physiotherapy is the first intervention",
                        "Your daily routine — inconsistency in sleep, meals, and activity is Saturn's primary health saboteur"],
            "Rahu":    ["Your environment — investigate mould, air quality, water purity, and electromagnetic exposure",
                        "Your nervous system — Rahu accumulates stress as toxicity; a structured detox protocol addresses the root",
                        "Your diagnosis history — get a fresh second opinion; Rahu chronic illness is frequently misidentified"],
            "Ketu":    ["Your energy field and inner emotional state — Ketu health is frequently non-physical in origin",
                        "Your immune system — autoimmune or mysterious conditions are Ketu's signature; specialist referral needed",
                        "Your spiritual and emotional life — unresolved grief, loss, or purpose disconnect often manifests as Ketu fatigue"],
        },
    },

    # ── travel_country ───────────────────────────────────────────────────────
    "travel_country": {
        "who_label":   "Who can guide you toward the right country or destination?",
        "what_label":  "What steps should you take to identify and move to the right country?",
        "when_label":  "When is the best time to make this international move?",
        "where_label": "Which country or region is most aligned with your chart?",
        "who":  None,   # use standard _WHO_POINTS["travel"]
        "what": {
            "Sun":     ["Research government-funded immigration streams or institutional sponsorship pathways to your target country",
                        "Get your credentials officially recognised or certified for the destination country — do this first, before applying",
                        "Connect with one authority figure already established in your target country — their referral opens doors faster than any application"],
            "Moon":    ["Identify the country where your closest family or emotional anchor already lives — Moon's best relocation is where love already is",
                        "Visit your top 2 candidate countries for 2 weeks each before committing — Moon makes better decisions through feeling, not research",
                        "Find a cultural community from your home country in the destination — Moon's adjustment is emotional, not practical"],
            "Mars":    ["Apply for the visa now — stop researching and act. Mars phase rewards the bold first move",
                        "Target countries with active startup ecosystems or high demand for technical skills in your field",
                        "Give yourself a 6-month hard deadline: either move, or consciously decide to stay — Mars cannot sustain indefinite indecision"],
            "Mercury": ["Research 3 countries in depth: visa pathway, job market, cost of living, and cultural fit — then decide within 30 days",
                        "Connect with 5 people already living in your top destination country via LinkedIn, expat forums, or alumni networks",
                        "Check if your skill set is listed as a shortage occupation in target countries — this unlocks faster visa pathways"],
            "Jupiter": ["Target countries with strong educational institutions, international organisations, or advisory sectors",
                        "Apply for a scholarship, fellowship, or academic programme as a structured entry pathway",
                        "Seek guidance from a jyotishi about your foreign travel yoga — Jupiter expansion abroad often has a specific timing window"],
            "Venus":   ["Prioritise quality of life, cultural richness, and social warmth in your destination research — not just income",
                        "Target countries known for arts, design, cuisine, lifestyle, or hospitality industries if that is your field",
                        "Make the move with a social anchor: a friend, a community, or a professional network already in place"],
            "Saturn":  ["Research the full immigration pathway in writing — every step, every document, every timeline — before beginning",
                        "Target countries with clear, stable, rules-based immigration processes and strong employment rights",
                        "Plan a 3-year relocation roadmap: year 1 establish, year 2 build, year 3 decide on permanence"],
            "Rahu":    ["Apply to countries you have not seriously considered — Rahu's best destination is often unexpected",
                        "Target tech-forward, multicultural, high-growth economies: UAE, Singapore, Canada, Germany, or equivalents",
                        "Apply to multiple countries simultaneously — Rahu phase multiplies options; the right door opens first"],
            "Ketu":    ["Consider a spiritual, retreat, or study-based initial move rather than a permanent relocation",
                        "Target countries with ancient cultural heritage, strong spiritual traditions, or philosophical depth",
                        "Begin with a 3–6 month stay before committing — Ketu's right place reveals itself through experience, not research"],
        },
        "where": {
            "Sun":     ["Countries with strong institutional frameworks and clear professional pathways: USA, UK, Australia, Canada, or Gulf states",
                        "Capital cities and administrative hubs — Sun's opportunities are concentrated where authority is headquartered",
                        "Countries where your specific professional credentials are formally recognised and command premium compensation"],
            "Moon":    ["Countries with a large diaspora from your home culture — the community provides emotional grounding",
                        "Coastal or mild-climate cities with strong community life and a slower, more nurturing pace",
                        "Countries where your family or close network has already settled — Moon's best move follows love"],
            "Mars":    ["Fast-growing economies with high demand for skilled workers and technical talent: UAE, Singapore, Germany, Canada",
                        "Cities with active startup scenes, high-energy professional environments, and visible entrepreneurial culture",
                        "Countries where physical industries — construction, engineering, logistics, defence — are growing rapidly"],
            "Mercury": ["Connected, cosmopolitan knowledge economies: Netherlands, Germany, Canada, Singapore, or tech hubs in the US",
                        "Cities that are multilingual, digitally advanced, and culturally open — Mercury adapts fastest in information-rich environments",
                        "Countries with strong remote-work infrastructure — Mercury phase increasingly makes geography less relevant"],
            "Jupiter": ["Countries with world-renowned universities, research institutions, or international organisations: USA, UK, Germany, Japan",
                        "Pilgrimage or spiritually significant countries if the move has a deeper purpose beyond career",
                        "Expanding economies with strong ethical governance and respect for education: Nordics, Canada, New Zealand"],
            "Venus":   ["Culturally rich, aesthetically vibrant countries: Italy, France, Japan, UAE, or equivalents in your region",
                        "Countries with strong creative industries, design culture, or luxury hospitality markets",
                        "Cities where quality of life metrics — food, safety, beauty, social warmth — consistently rank in the top 10"],
            "Saturn":  ["Stable, highly structured, rule-based countries: Germany, Switzerland, Canada, Australia, or Japan",
                        "Countries with transparent immigration laws, strong labour protections, and long-term residency pathways",
                        "Cities with established expat infrastructure, predictable costs of living, and clear professional ladders"],
            "Rahu":    ["Frontier or fast-developing international hubs: Dubai, Singapore, Berlin, Toronto, or emerging tech cities",
                        "Countries you have never considered — Rahu's best destination surprises you",
                        "Digital-nomad-friendly countries with high connectivity, low friction, and growing international communities"],
            "Ketu":    ["Countries with ancient spiritual heritage: India (different region), Sri Lanka, Japan, Nepal, or Tibet",
                        "Smaller, quieter countries with high quality of life and low commercial pressure",
                        "Your ancestral country or a place with deep karmic significance — Ketu's move often circles back"],
        },
    },

    # ── children_timing ──────────────────────────────────────────────────────
    "children_timing": {
        "who_label":   "Who plays a key role in your family planning journey?",
        "what_label":  "What specific steps should you take now for conception or family planning?",
        "when_label":  "When is the most favourable window for pregnancy or having a child?",
        "where_label": "Where should you focus your energy to support conception?",
        "who":  None,   # use standard _WHO_POINTS["children"]
        "what": {
            "Sun":     ["Schedule a comprehensive fertility evaluation for both partners — Sun phase rewards proactive medical action",
                        "Ensure your career and financial foundation is visibly stable — Sun delays family timing until authority is established",
                        "Involve your father or a senior male figure in the family preparation — their blessing and support matter"],
            "Moon":    ["Track your ovulation cycle precisely for 3 months — Moon governs fertility cycles; the data is essential",
                        "Prioritise emotional security in your relationship before focusing on conception — Moon fertility follows emotional readiness",
                        "Reduce stress hormones through yoga, swimming, or walking — Moon's fertility is directly impaired by cortisol"],
            "Mars":    ["See a reproductive specialist immediately if you have been trying for more than 6 months — Mars rewards decisive action",
                        "Both partners should get a full fertility panel done simultaneously — Mars phase does not wait",
                        "Increase physical vitality through structured daily exercise — Mars fertility is directly supported by physical health"],
            "Mercury": ["Research your fertility options thoroughly — IVF, IUI, natural cycle tracking — and consult 2 specialists",
                        "Track your cycle with a dedicated app and bring 3 months of data to your first fertility consultation",
                        "Reduce mental overload: screen time, multitasking, and information overload impair Mercury-ruled reproductive health"],
            "Jupiter": ["Incorporate a pre-conception Ayurvedic or naturopathic cleanse — Jupiter responds to constitutional preparation",
                        "Seek a blessing from a spiritual elder or temple visit — Jupiter's family expansion often follows ritual preparation",
                        "Adopt a nourishing, whole-food diet and reduce excess — Jupiter fertility improves with moderation and nutrition"],
            "Venus":   ["Prioritise the relationship quality above all else — Venus fertility follows the emotional state of the partnership",
                        "Reduce alcohol and sugar and add skin-supportive, hormone-balancing nutrition — Venus fertility is diet-responsive",
                        "Create a beautiful, prepared home environment — nesting is not just emotional, it is a Venus fertility practice"],
            "Saturn":  ["Consult a reproductive specialist for a structured, 12–24 month medical plan — Saturn rewards systematic approach",
                        "Ensure financial and housing stability before beginning fertility treatment — Saturn will not expand family without material foundation",
                        "Be patient with the timeline — Saturn's fertility window is specific, narrow, and worth waiting for"],
            "Rahu":    ["Be open to all pathways: natural conception, IVF, IUI, surrogacy, or adoption — Rahu opens unexpected doors",
                        "Consult an international or specialist fertility clinic if conventional approaches have not worked",
                        "Address any environmental or lifestyle toxins: Rahu's fertility challenges are often linked to external disruption"],
            "Ketu":    ["Begin with an inner preparation: a retreat, a cleanse, or a spiritual practice specifically for fertility",
                        "Release grief or emotional loss from past pregnancy difficulties before attempting again — Ketu heals through release",
                        "Consult both a medical fertility specialist and a holistic or energy healer — Ketu's path requires both"],
        },
        "where": {
            "Sun":     ["A reputable fertility clinic with strong institutional credentials and specialist authority",
                        "Your home — prepare the physical and financial environment as if the child is already expected",
                        "Your career and financial environment — stabilising these is the Sun-phase prerequisite for family expansion"],
            "Moon":    ["Your emotional environment — relationship safety, stress reduction, and emotional warmth are the primary fertility conditions",
                        "Natural, calm settings: parks, coastal environments, and peaceful domestic spaces for prenatal wellness",
                        "Your menstrual cycle data — Moon's fertility window is specific; cycle tracking reveals it precisely"],
            "Mars":    ["A reproductive medicine clinic for proactive fertility assessment — go immediately, do not wait",
                        "Your exercise and nutrition regime — physical vitality is Mars's primary fertility support",
                        "The relationship dynamic — ensure both partners are fully committed and in active alignment before proceeding"],
            "Mercury": ["Medical consultation settings — gather complete information from 2 specialists before deciding",
                        "Digital fertility tracking tools and apps — Mercury's advantage is data; use it",
                        "Ante-natal education and parenting preparation courses — Mercury prepares through knowledge"],
            "Jupiter": ["A wellness-integrated fertility clinic with both medical and holistic options",
                        "A temple, spiritual elder, or sacred space for blessing and ritual preparation",
                        "Your diet and nutrition — Jupiter fertility improves dramatically when nourishment replaces excess"],
            "Venus":   ["Your home — creating a beautiful, prepared, loving environment is a Venus fertility practice",
                        "Your relationship — the quality of the partnership is Venus's primary fertility indicator",
                        "A hormonal health and lifestyle clinic that integrates nutrition, rest, and stress management"],
            "Saturn":  ["A structured reproductive medicine clinic for evidence-based, protocol-driven planning",
                        "Your financial and domestic stability — Saturn's prerequisite for family expansion is material readiness",
                        "A long-term specialist relationship — Saturn fertility responds to sustained, systematic care, not one-time intervention"],
            "Rahu":    ["Advanced fertility clinics with access to IVF, IUI, genetic testing, or surrogacy",
                        "International medical specialists if local options have produced no results",
                        "Unconventional support communities for alternative family-building routes"],
            "Ketu":    ["A healing retreat or energy medicine practitioner for inner preparation",
                        "A holistic fertility specialist who addresses emotional, energetic, and nutritional dimensions simultaneously",
                        "Quiet, sacred domestic environments — Ketu's conception follows inner readiness, not calendar scheduling"],
        },
    },
}


def _build_hw_answers(
    intent: str,
    insights: List[Dict[str, Any]],
    memory: Dict[str, Any],
    question: str = "",
) -> Dict[str, Any]:
    """
    Build WHO/WHAT/WHEN/WHERE/HOW as structured lists.
    - WHO:  list of 3 specific person-type strings
    - WHAT: list of 3 concrete action strings
    - WHEN: dict with window, peak, duration
    - WHERE: list of 3 specific environment strings
    - HOW:  fixed redirect to remedies section
    """
    c  = _chart_from_memory(memory)
    dp = c["dasha_planet"]
    intent_key = intent if intent in _WHO_POINTS else "general"

    # Detect sub-intent scoped to this question's top-level intent
    sub_intent = _detect_sub_intent(question, intent) if question else None
    override   = _SUB_INTENT_OVERRIDES.get(sub_intent, {}) if sub_intent else {}

    # WHO — 3 specific person types (use override if present and non-None)
    if override and override.get("who") is not None:
        who_list = override["who"].get(dp, override["who"].get("Jupiter", []))
    else:
        who_map  = _WHO_POINTS.get(intent_key, _WHO_POINTS["general"])
        who_list = who_map.get(dp, who_map.get("Jupiter", []))

    # WHAT — 3 concrete actions
    if override and override.get("what") is not None:
        what_list = override["what"].get(dp, override["what"].get("Jupiter", []))
    else:
        what_map  = _WHAT_POINTS.get(intent_key, _WHAT_POINTS["general"])
        what_list = what_map.get(dp, what_map.get("Jupiter", []))

    # WHEN — exact window, personalised by birth month for uniqueness
    timing = _timing_window(dp, intent_key, birth_month=c.get("birth_month", 0))
    when_data = {
        "window":   timing["window"],
        "peak":     timing["peak"],
        "duration": timing["duration"],
    }

    # WHERE — 3 specific environments
    if override and override.get("where") is not None:
        where_list = override["where"].get(dp, override["where"].get("Jupiter", []))
    else:
        where_map  = _WHERE_POINTS.get(intent_key, _WHERE_POINTS["general"])
        where_list = where_map.get(dp, where_map.get("Jupiter", []))

    # HOW — always redirect to remedies
    how_text = "👉 Refer to remedies section"

    return {
        "who":       who_list,
        "what":      what_list,
        "when":      when_data,
        "where":     where_list,
        "how":       how_text,
        "sub_intent": sub_intent,
        "override":  override,
    }


# ── Remedy bullet builder ──────────────────────────────────────────────────────

def _build_remedy_bullets(intent: str, remedies: Dict[str, Any]) -> Dict[str, List[str]]:
    """Pull remedy bullets from the remedy state for this intent/question."""
    habits = (remedies.get("habits") or remedies.get("daily_habits") or [])[:3]

    mantras = remedies.get("mantras", [])
    mantra_bullets = [
        f"{m['mantra']} — {m['purpose']} ({m.get('count', 108)} times)"
        for m in mantras
        if isinstance(m, dict) and m.get("mantra")
    ][:2]

    raw_colors = remedies.get("colors") or []
    color_bullets = [
        c if c.lower().startswith("wear") else f"Wear or surround yourself with {c}"
        for c in raw_colors[:3]
    ]

    return {
        "daily_habits": habits,
        "mantras":      mantra_bullets,
        "lucky_colors": color_bullets,
    }


# ── DeepSeek LLM caller for HW bullets ───────────────────────────────────────

_HW_SYSTEM = """You are an expert Vedic astrology and numerology insight generator for Aura with Rav.
Your job is to generate a structured WHO / WHAT / WHERE summary for a user's question based on their chart data.

Rules:
- WHO: exactly 3 bullet points — specific person types, backgrounds, or sources relevant to this question
- WHAT: exactly 3 bullet points — concrete, actionable steps the user must take right now
- WHERE: exactly 3 bullet points — specific environments, cities, platforms, or contexts
- Each bullet must be direct, specific, and personalised to the dasha planet and intent
- No generic advice. No tradition labels. No jargon. Plain English only.
- No preamble, no explanations — output ONLY the JSON block below

Output EXACTLY this JSON (no markdown, no code fences):
{
  "who_label": "<question that WHO answers>",
  "what_label": "<question that WHAT answers>",
  "where_label": "<question that WHERE answers>",
  "who": ["point 1", "point 2", "point 3"],
  "what": ["action 1", "action 2", "action 3"],
  "where": ["place 1", "place 2", "place 3"]
}"""


def _llm_hw_bullets(
    question: str,
    intent: str,
    dasha_planet: str,
    lagna: str,
    moon: str,
    insights_text: str,
) -> Optional[Dict[str, Any]]:
    """
    Call DeepSeek to generate unique WHO/WHAT/WHERE for this specific question.
    Returns parsed dict or None on failure (caller falls back to static lookup).
    """
    try:
        from utils.deepseek_client import call as ds_call
    except ImportError:
        return None

    user_prompt = f"""User question: {question}
Intent: {intent}
Current life phase (dasha): {dasha_planet}
Rising sign (lagna): {lagna}
Moon sign: {moon}

Key insights from the analysis:
{insights_text or "No specific insights available — use chart data only."}

Generate WHO / WHAT / WHERE specifically for this question and this person's {dasha_planet} dasha.
Every point must be unique to this question — not generic {intent} advice."""

    try:
        import json as _j
        raw = ds_call(system=_HW_SYSTEM, user=user_prompt, temperature=0.75, max_tokens=600)
        parsed = _j.loads(raw)
        # Validate structure
        for key in ("who", "what", "where"):
            if not isinstance(parsed.get(key), list) or len(parsed[key]) < 3:
                return None
        return parsed
    except Exception:
        return None


# ── Main structured summary builder ───────────────────────────────────────────

def build_structured_summary(
    question: str,
    intent: str,
    insights: List[Dict[str, Any]],
    remedies: Dict[str, Any],
    memory: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a structured summary for one question.
    WHO/WHAT/WHERE are LLM-generated (DeepSeek) for full uniqueness per question.
    WHEN is deterministic (dasha timing). Falls back to static lookup on LLM failure.
    """
    _REMEDY_PREFIXES = ("recommended practice", "mantra recommendation", "remedy:", "remedies:")
    clean_insights = [
        ins for ins in insights
        if not (
            ("remedy" in (ins.get("id") or "").lower())
            or any(ins.get("content", "").strip().lower()[:40].startswith(p) for p in _REMEDY_PREFIXES)
        )
    ]

    # Always compute static HW for WHEN timing + fallback
    hw_raw = _build_hw_answers(intent, clean_insights, memory, question=question)

    templates = HW_TEMPLATES.get(intent, HW_TEMPLATES["general"])
    override  = hw_raw.get("override", {})

    # Build insight text for LLM context (top 3 clean insights)
    insights_text = "\n".join(
        f"- {ins['content'][:150]}" for ins in clean_insights[:3]
    )

    # Chart context
    c  = _chart_from_memory(memory)
    dp = c["dasha_planet"]

    # ── LLM-generated WHO/WHAT/WHERE ─────────────────────────────────────────
    llm_result = _llm_hw_bullets(
        question      = question,
        intent        = intent,
        dasha_planet  = dp,
        lagna         = c.get("lagna", ""),
        moon          = c.get("moon", ""),
        insights_text = insights_text,
    )

    if llm_result:
        who_list   = llm_result["who"][:3]
        what_list  = llm_result["what"][:3]
        where_list = llm_result["where"][:3]
        who_label   = llm_result.get("who_label")   or override.get("who_label")   or templates["who"]
        what_label  = llm_result.get("what_label")  or override.get("what_label")  or templates["what"]
        where_label = llm_result.get("where_label") or override.get("where_label") or templates["where"]
    else:
        # Fallback to static lookup
        who_list    = hw_raw["who"]
        what_list   = hw_raw["what"]
        where_list  = hw_raw["where"]
        who_label   = override.get("who_label")   or templates["who"]
        what_label  = override.get("what_label")  or templates["what"]
        where_label = override.get("where_label") or templates["where"]

    when_label = override.get("when_label") or templates["when"]

    hw_bullets = [
        {
            "label":  who_label.rstrip("?") + "?",
            "answer": who_list,
            "type":   "list",
        },
        {
            "label":  what_label.rstrip("?") + "?",
            "answer": what_list,
            "type":   "list",
        },
        {
            "label":  when_label.rstrip("?") + "?",
            "answer": hw_raw["when"],
            "type":   "timing",
        },
        {
            "label":  where_label.rstrip("?") + "?",
            "answer": where_list,
            "type":   "list",
        },
        {
            "label":  templates["how"].rstrip("?") + "?",
            "answer": hw_raw["how"],
            "type":   "redirect",
        },
    ]

    remedy_bullets = _build_remedy_bullets(intent, remedies)

    return {
        "question":       question,
        "intent":         intent,
        "hw_bullets":     hw_bullets,
        "remedy_bullets": remedy_bullets,
        "llm_generated":  llm_result is not None,
    }


# ── LLM prompt for structured summary (version-aware) ────────────────────────

def build_structured_summary_prompt(
    question: str,
    intent: str,
    insights: List[Dict[str, Any]],
    subject: str,
    remedies: Dict[str, Any],
) -> Dict[str, Any]:
    from agents.prompt_config import get_version
    from agents.agent_prompts import SIMPLIFY_AGENT_V2

    version = get_version("simplify")

    insight_block = "\n".join(
        f"- [{ins['confidence'].upper()}] ({', '.join(ins.get('domains', []))}) {ins['content']}"
        for ins in insights
    )
    habits  = "\n".join(f"  - {h}" for h in remedies.get("habits",  [])[:3])
    mantras = "\n".join(
        f"  - {m['mantra']} — {m['purpose']}"
        for m in remedies.get("mantras", [])[:2]
    )
    colors  = ", ".join(remedies.get("colors", [])[:3])

    if version == "v2":
        cfg = SIMPLIFY_AGENT_V2
        user = cfg["user_template"].format(
            subject=subject, question=question, intent=intent,
            insight_block=insight_block, habits=habits or "  - none provided",
            mantras=mantras or "  - none provided", colors=colors or "none provided",
        )
        return {
            "model":          "claude-sonnet-4-6",
            "temperature":    cfg["temperature"],
            "top_p":          cfg["top_p"],
            "max_tokens":     700,
            "system":         cfg["system"],
            "user":           user,
            "prompt_version": "v2",
        }

    return {
        "model":          "claude-sonnet-4-6",
        "temperature":    SIMPLIFY_AGENT["temperature"],
        "top_p":          SIMPLIFY_AGENT["top_p"],
        "max_tokens":     800,
        "system":         SIMPLIFY_AGENT["system"],
        "prompt_version": "v1",
        "user": (
            f"Name: {subject}\n"
            f"Question: {question}\n"
            f"Topic: {intent}\n\n"
            f"Approved insights from multiple spiritual traditions:\n{insight_block}\n\n"
            f"Available remedies:\n"
            f"Daily habits:\n{habits}\n"
            f"Mantras:\n{mantras}\n"
            f"Lucky colors: {colors}\n\n"
            "Write a structured bullet-point summary that directly answers this question. "
            "Format EXACTLY as follows:\n\n"
            "**WHO** — Give exactly 3 bullet points naming specific person types relevant to this question\n"
            "**WHAT** — Give exactly 3 clear actions the person should take\n"
            "**WHEN** — Give exact month-year window (e.g. October 2026 – March 2028) and peak probability\n"
            "**WHERE** — Give exactly 3 specific environments or contexts\n"
            "**HOW** — Write only: 👉 Refer to remedies section\n\n"
            "**Remedies:**\n"
            "- Daily habits: list 2–3 from the habits above\n"
            "- Mantra: include 1 mantra with its purpose\n"
            "- Lucky colors: list 2–3 colors\n\n"
            "No generic advice. No vague phrases. No tradition labels. Each answer must be specific to this question."
        ),
    }


# ── simplify_narrative kept for backward compat ───────────────────────────────

def simplify_narrative(raw_narrative: str, question: str, intent: str) -> str:
    return raw_narrative


# ── LangGraph node ─────────────────────────────────────────────────────────────

def simplify_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    report   = state.get("final_report", {})
    memory   = state.get("memory", {})
    # Inject user_profile into memory so _chart_from_memory can read birth_month
    memory   = {**memory, "user_profile": state.get("user_profile", {})}
    sections = report.get("sections", [])

    all_remedies = state.get("remedies", {})
    qr_list      = all_remedies.get("question_remedies", []) if all_remedies else []

    structured_summaries = []

    for i, section in enumerate(sections):
        question = section.get("question", "")
        intent   = section.get("intent", "general")
        insights = section.get("insights", [])

        qr = next((r for r in qr_list if r.get("question") == question), {})
        if not qr and qr_list and i < len(qr_list):
            qr = qr_list[i]

        summary = build_structured_summary(question, intent, insights, qr, memory)
        section["structured_summary"] = summary
        structured_summaries.append(summary)

    state["structured_summaries"] = structured_summaries
    state.setdefault("agent_log", []).append(
        f"[SimplifyAgent] Built structured summaries for {len(sections)} section(s)."
    )
    return state
