"""
Deterministic Vedic astrology calculations (no external ephemeris needed).
Produces stable results seeded from DOB + name.
"""
from __future__ import annotations
from datetime import date
from typing import Dict, List, Tuple

RASHIS = [
    "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
    "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
]

PLANETS = ["Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn","Rahu","Ketu"]

NAKSHATRAS = [
    "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra",
    "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
    "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
    "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishtha",
    "Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"
]

DASHA_SEQUENCE = [
    ("Ketu",7),("Venus",20),("Sun",6),("Moon",10),("Mars",7),
    ("Rahu",18),("Jupiter",16),("Saturn",19),("Mercury",17)
]

HOUSE_THEMES = [
    "Self & Identity","Wealth & Values","Communication & Siblings",
    "Home & Mother","Creativity & Children","Health & Service",
    "Partnerships & Marriage","Transformation & Hidden Matters",
    "Higher Learning & Travel","Career & Status",
    "Gains & Social Network","Spirituality & Liberation"
]

YOGAS_POOL = [
    ("Gaja Kesari Yoga",
     "Jupiter and Moon well-placed — this suggests wisdom, prosperity, and good reputation."),
    ("Raj Yoga",
     "9th and 10th house lords connect — this suggests a tendency toward career success and authority."),
    ("Dhana Yoga",
     "2nd and 11th lords align — this suggests financial growth through consistent effort."),
    ("Saraswati Yoga",
     "Venus, Jupiter, and Mercury in auspicious positions — artistic and intellectual talent is indicated."),
    ("Budha-Aditya Yoga",
     "Sun and Mercury together — this suggests intelligence and communication ability."),
    ("Hamsa Yoga",
     "Jupiter in a kendra — spiritual wisdom and a noble character are indicated."),
]


def _seed(profile_str: str) -> int:
    return sum(ord(c) for c in profile_str)


def lagna_rashi(seed: int) -> str:
    return RASHIS[seed % 12]


def moon_rashi(seed: int) -> str:
    return RASHIS[(seed + 4) % 12]


def sun_sign_from_dob(dob: str) -> str:
    try:
        parts = dob.split("-")
        mm, dd = int(parts[1]), int(parts[2])
    except Exception:
        return "Capricorn"
    ranges: List[Tuple[int, int, str]] = [
        (3,21,"Aries"),(4,20,"Taurus"),(5,21,"Gemini"),(6,21,"Cancer"),
        (7,23,"Leo"),(8,23,"Virgo"),(9,23,"Libra"),(10,23,"Scorpio"),
        (11,22,"Sagittarius"),(12,22,"Capricorn"),(1,20,"Aquarius"),(2,19,"Pisces"),
    ]
    for (m, d, sign) in ranges:
        if mm == m and dd >= d:
            return sign
        if mm == (m % 12) + 1 and dd < d:
            return sign
    return "Capricorn"


def planetary_positions(seed: int) -> Dict[str, str]:
    return {p: RASHIS[(seed + i * 3) % 12] for i, p in enumerate(PLANETS)}


def nakshatra_of_moon(seed: int) -> str:
    return NAKSHATRAS[(seed * 3) % 27]


def house_analysis(seed: int, lagna: str) -> Dict[str, str]:
    lagna_idx = RASHIS.index(lagna) if lagna in RASHIS else 0
    notes = [
        "Strong placement — natural inclination and resilience.",
        "Steady influence — material stability with effort.",
        "Bright placement — communication and sibling bonds.",
        "Nurturing energy — home is a source of strength.",
        "Creative placement — self-expression brings fulfillment.",
        "Service-oriented — wellness through disciplined routine.",
        "Partnership energy — relationships bring growth.",
        "Transformative — depth and inner power.",
        "Expanding horizons — higher learning and travel.",
        "Career-focused — achievement through consistent action.",
        "Gains sector — social network opens opportunities.",
        "Spiritual liberation — meditative practice deepens.",
    ]
    result = {}
    for i, theme in enumerate(HOUSE_THEMES):
        rashi = RASHIS[(lagna_idx + i) % 12]
        note = notes[i % len(notes)]
        result[f"House {i+1} ({theme})"] = f"{rashi} — {note}"
    return result


def active_doshas(seed: int) -> List[str]:
    pool = [
        "Mangal Dosha (mild) — remedies are simple and effective.",
        "Kaal Sarp Dosha (partial) — manageable with spiritual practice.",
        "Pitru Dosha (minor) — ancestor gratitude practices are recommended.",
    ]
    idx = seed % 4
    if idx == 3:
        return ["No significant dosha detected."]
    return [pool[idx % 3]]


def current_dasha(seed: int, dob: str) -> Tuple[str, str]:
    idx = seed % 9
    planet, years = DASHA_SEQUENCE[idx]
    return planet, f"{planet} Mahadasha ({years} years)"


def dasha_periods(seed: int) -> List[Dict[str, str]]:
    year = 2018
    result = []
    for i, (planet, dur) in enumerate(DASHA_SEQUENCE):
        result.append({"planet": planet, "duration": f"{dur} years",
                       "from": str(year), "to": str(year + dur)})
        year += dur
    return result


def active_yogas(seed: int) -> List[Dict[str, str]]:
    y1 = YOGAS_POOL[seed % len(YOGAS_POOL)]
    y2 = YOGAS_POOL[(seed + 2) % len(YOGAS_POOL)]
    return [
        {"name": y1[0], "description": y1[1]},
        {"name": y2[0], "description": y2[1]},
    ]


HOUSE_DOMAIN_MAP = {
    "career":       [10, 6, 2],
    "finance":      [2, 11, 8],
    "marriage":     [7, 5, 11],
    "health":       [6, 1, 8],
    "spirituality": [12, 9, 4],
    "general":      list(range(1, 13)),
}


def predictions_for_focus(lagna: str, sun: str, moon: str, focus: str, seed: int) -> List[str]:
    base = [
        f"This suggests a favorable period for {lagna} rising individuals in the near future.",
        f"The {sun} Sun indicates {_sun_quality(sun)} in professional pursuits.",
        f"The {moon} Moon brings {_moon_quality(moon)} to emotional life.",
        f"Financial stability is indicated with disciplined savings and investment.",
        f"Meaningful relationship growth is suggested in the coming 12–18 months.",
        f"Health is generally stable — attention to digestive health and stress is advisable.",
    ]
    focus_specific = {
        "career":   [f"Career advancement is strongly supported by current {_dasha_planet(seed)} Mahadasha.",
                     "This suggests a good time for promotion, new role, or business expansion."],
        "finance":  ["There is a tendency toward financial improvement through disciplined planning.",
                     "An unexpected gain or windfall is possible — avoid impulsive investments."],
        "marriage": ["Partnership energy is activated — existing bonds deepen.",
                     "For singles, this suggests a meaningful connection entering the picture."],
        "health":   ["Good health is indicated with attention to regular routine.",
                     "There is a tendency toward vitality improvement with mindful practices."],
        "general":  ["Overall energy is positive — this is a growth-oriented period."],
    }
    return focus_specific.get(focus, focus_specific["general"]) + base[:3]


def _sun_quality(sun: str) -> str:
    q = {"Aries":"bold initiative","Taurus":"steadiness and persistence","Gemini":"intellectual agility",
         "Cancer":"emotional intelligence","Leo":"natural confidence","Virgo":"precision and service",
         "Libra":"diplomatic skill","Scorpio":"transformative depth","Sagittarius":"visionary optimism",
         "Capricorn":"strategic ambition","Aquarius":"innovative thinking","Pisces":"creative intuition"}
    return q.get(sun, "strong natural ability")


def _moon_quality(moon: str) -> str:
    q = {"Aries":"passion and directness","Taurus":"emotional stability","Gemini":"mental agility",
         "Cancer":"nurturing depth","Leo":"warmth and generosity","Virgo":"analytical clarity",
         "Libra":"harmony and grace","Scorpio":"emotional intensity","Sagittarius":"enthusiasm and optimism",
         "Capricorn":"discipline and patience","Aquarius":"independent spirit","Pisces":"deep empathy"}
    return q.get(moon, "emotional sensitivity")


def _dasha_planet(seed: int) -> str:
    return DASHA_SEQUENCE[seed % 9][0]
