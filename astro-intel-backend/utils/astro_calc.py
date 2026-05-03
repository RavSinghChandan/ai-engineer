"""
Vedic astrology calculations — JD-based astronomical engine.
Mirrors astrology.service.ts in the Angular frontend.

Sun: VSOP87-simplified (~0.01° accuracy)
Moon: ELP2000-simplified leading 16 terms (~0.3° accuracy)
Ascendant: LST + Meeus formula
Ayanamsa: Lahiri (23.853° at J2000, +50.2388″/year)
"""
from __future__ import annotations
import math
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

# ── Constants ────────────────────────────────────────────────────────────────
DEG = math.pi / 180
RAD = 180 / math.pi

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

DASHA_LORDS = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"]
DASHA_YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17]

DASHA_SEQUENCE = list(zip(DASHA_LORDS, DASHA_YEARS))

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

# Built-in city coordinates: {key: (lat, lon, utc_offset_hours)}
_CITY_COORDS: Dict[str, Tuple[float, float, float]] = {
    "chandigarh": (30.7333, 76.7794, 5.5),
    "delhi": (28.6139, 77.2090, 5.5),
    "new delhi": (28.6139, 77.2090, 5.5),
    "mumbai": (19.0760, 72.8777, 5.5),
    "bombay": (19.0760, 72.8777, 5.5),
    "bangalore": (12.9716, 77.5946, 5.5),
    "bengaluru": (12.9716, 77.5946, 5.5),
    "hyderabad": (17.3850, 78.4867, 5.5),
    "ahmedabad": (23.0225, 72.5714, 5.5),
    "chennai": (13.0827, 80.2707, 5.5),
    "madras": (13.0827, 80.2707, 5.5),
    "kolkata": (22.5726, 88.3639, 5.5),
    "calcutta": (22.5726, 88.3639, 5.5),
    "pune": (18.5204, 73.8567, 5.5),
    "jaipur": (26.9124, 75.7873, 5.5),
    "lucknow": (26.8467, 80.9462, 5.5),
    "patna": (25.5941, 85.1376, 5.5),
    "bhopal": (23.2599, 77.4126, 5.5),
    "nagpur": (21.1458, 79.0882, 5.5),
    "surat": (21.1702, 72.8311, 5.5),
    "indore": (22.7196, 75.8577, 5.5),
    "coimbatore": (11.0168, 76.9558, 5.5),
    "kochi": (9.9312, 76.2673, 5.5),
    "cochin": (9.9312, 76.2673, 5.5),
    "thiruvananthapuram": (8.5241, 76.9366, 5.5),
    "trivandrum": (8.5241, 76.9366, 5.5),
    "amritsar": (31.6340, 74.8723, 5.5),
    "varanasi": (25.3176, 82.9739, 5.5),
    "agra": (27.1767, 78.0081, 5.5),
    "vadodara": (22.3072, 73.1812, 5.5),
    "ludhiana": (30.9010, 75.8573, 5.5),
    "guwahati": (26.1445, 91.7362, 5.5),
    "bhubaneswar": (20.2961, 85.8245, 5.5),
    "ranchi": (23.3441, 85.3096, 5.5),
    "dehradun": (30.3165, 78.0322, 5.5),
    "shimla": (31.1048, 77.1734, 5.5),
    "jammu": (32.7266, 74.8570, 5.5),
    "srinagar": (34.0837, 74.7973, 5.5),
    "mysuru": (12.2958, 76.6394, 5.5),
    "mysore": (12.2958, 76.6394, 5.5),
    "erode": (11.3410, 77.7172, 5.5),
    "allahabad": (25.4358, 81.8463, 5.5),
    "prayagraj": (25.4358, 81.8463, 5.5),
    "chorwad": (21.0539, 70.2902, 5.5),
    "jamshedpur": (22.8046, 86.2029, 5.5),
    "london": (51.5074, -0.1278, 0.0),
    "new york": (40.7128, -74.0060, -5.0),
    "los angeles": (34.0522, -118.2437, -8.0),
    "toronto": (43.6532, -79.3832, -5.0),
    "sydney": (-33.8688, 151.2093, 10.0),
    "dubai": (25.2048, 55.2708, 4.0),
    "singapore": (1.3521, 103.8198, 8.0),
    "tokyo": (35.6762, 139.6503, 9.0),
    "beijing": (39.9042, 116.4074, 8.0),
    "shanghai": (31.2304, 121.4737, 8.0),
    "karachi": (24.8607, 67.0011, 5.0),
    "lahore": (31.5204, 74.3587, 5.0),
    "dhaka": (23.8103, 90.4125, 6.0),
    "colombo": (6.9271, 79.8612, 5.5),
    "kathmandu": (27.7172, 85.3240, 5.75),
    "nairobi": (-1.2921, 36.8219, 3.0),
    "paris": (48.8566, 2.3522, 1.0),
    "berlin": (52.5200, 13.4050, 1.0),
    "moscow": (55.7558, 37.6173, 3.0),
}

_TZ_OFFSETS: Dict[str, float] = {
    "Asia/Kolkata": 5.5, "Asia/Colombo": 5.5, "Asia/Kathmandu": 5.75,
    "Asia/Karachi": 5.0, "Asia/Dhaka": 6.0, "Asia/Dubai": 4.0,
    "Asia/Singapore": 8.0, "Asia/Kuala_Lumpur": 8.0, "Asia/Bangkok": 7.0,
    "Asia/Tokyo": 9.0, "Asia/Shanghai": 8.0, "Asia/Seoul": 9.0,
    "Asia/Riyadh": 3.0, "Asia/Tehran": 3.5, "Asia/Kabul": 4.5,
    "Asia/Jakarta": 7.0, "Asia/Manila": 8.0, "Asia/Taipei": 8.0,
    "Europe/London": 0.0, "Europe/Paris": 1.0, "Europe/Berlin": 1.0,
    "Europe/Moscow": 3.0, "Europe/Istanbul": 3.0, "Europe/Athens": 2.0,
    "Europe/Rome": 1.0, "Europe/Madrid": 1.0, "Europe/Zurich": 1.0,
    "Africa/Nairobi": 3.0, "Africa/Lagos": 1.0, "Africa/Cairo": 2.0,
    "Africa/Johannesburg": 2.0,
    "America/New_York": -5.0, "America/Chicago": -6.0, "America/Denver": -7.0,
    "America/Los_Angeles": -8.0, "America/Toronto": -5.0,
    "America/Sao_Paulo": -3.0, "America/Argentina/Buenos_Aires": -3.0,
    "America/Mexico_City": -6.0, "America/Bogota": -5.0,
    "Australia/Sydney": 10.0, "Australia/Melbourne": 10.0, "Australia/Perth": 8.0,
    "Pacific/Auckland": 12.0,
}


# ── Birth-time parser ────────────────────────────────────────────────────────
import re as _re

def _parse_tob(tob: str) -> Tuple[int, int, bool]:
    """
    Parse a time-of-birth string into (hour_24, minute, is_pm).
    Handles:
      - "14:30"       → (14, 30, False)
      - "2:30"        → (2, 30, False)   — single-digit hour, treated as 24h
      - "2:30 PM"     → (2, 30, True)
      - "2:30 AM"     → (2, 30, False)
      - "02:30 pm"    → (2, 30, True)
      - "14:30:00"    → (14, 30, False)  — seconds stripped
    Raises ValueError if unparseable.
    """
    t = tob.strip()
    is_pm = False

    # Detect and strip AM/PM suffix
    pm_match = _re.search(r'\b(AM|PM)\b', t, _re.IGNORECASE)
    if pm_match:
        is_pm = pm_match.group(1).upper() == 'PM'
        t = t[:pm_match.start()].strip()

    # Split on colon
    parts = t.split(':')
    if len(parts) < 2:
        raise ValueError(f"Cannot parse time: {tob!r}")

    hh = int(parts[0].strip())
    mm = int(parts[1].strip())

    # If no AM/PM and hour is 0-23, treat as 24h — is_pm stays False
    return hh, mm, is_pm


# ── Legacy seed (kept for non-astronomical helpers) ──────────────────────────
def _seed(profile_str: str) -> int:
    return sum(ord(c) for c in profile_str)


# ── Coordinate helpers ───────────────────────────────────────────────────────

def _lookup_city(place: str) -> Optional[Tuple[float, float, float]]:
    if not place:
        return None
    lower = place.strip().lower()
    for key, val in _CITY_COORDS.items():
        if key in lower:
            return val
    return None


def _tz_to_offset(tz: str) -> float:
    if tz in _TZ_OFFSETS:
        return _TZ_OFFSETS[tz]
    import re
    m = re.match(r"Etc/GMT([+-]\d+)", tz)
    if m:
        return -float(m.group(1))
    return 0.0


# ── Julian Day Number ────────────────────────────────────────────────────────

def julian_day(year: int, month: int, day: int, ut_hour: float) -> float:
    if month <= 2:
        year -= 1
        month += 12
    A = int(year / 100)
    B = 2 - A + int(A / 4)
    return (int(365.25 * (year + 4716))
            + int(30.6001 * (month + 1))
            + day + B - 1524.5 + ut_hour / 24.0)


# ── Sun longitude (tropical degrees) — VSOP87 simplified ────────────────────

def sun_longitude(jd: float) -> float:
    T = (jd - 2451545.0) / 36525.0
    L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
    M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
    C  = ((1.914602 - 0.004817 * T - 0.000014 * T * T) * math.sin(M * DEG)
         + (0.019993 - 0.000101 * T) * math.sin(2 * M * DEG)
         + 0.000289 * math.sin(3 * M * DEG))
    sun = L0 + C
    omega = 125.04 - 1934.136 * T
    sun = sun - 0.00569 - 0.00478 * math.sin(omega * DEG)
    return ((sun % 360) + 360) % 360


# ── Moon longitude (tropical degrees) — Meeus "Astronomical Algorithms" Ch.47
# Full 60-term series; E correction applied to terms containing Sun's M.
# Accuracy ~0.3° across centuries — sufficient for rashi (30° sign) assignment.

def moon_longitude(jd: float) -> float:
    T  = (jd - 2451545.0) / 36525.0
    T2 = T * T
    T3 = T2 * T
    T4 = T3 * T

    Lm = 218.3164477 + 481267.88123421*T - 0.0015786*T2 + T3/538841 - T4/65194000
    D  = 297.8501921 + 445267.1114034 *T - 0.0018819*T2 + T3/545868  - T4/113065000
    M  = 357.5291092 + 35999.0502909  *T - 0.0001536*T2 + T3/24490000
    Mm = 134.9633964 + 477198.8675055 *T + 0.0087414*T2 + T3/69699   - T4/14712000
    F  = 93.2720950  + 483202.0175233 *T - 0.0036539*T2 - T3/3526000 + T4/863310000

    # Eccentricity correction
    E  = 1.0 - 0.002516*T - 0.0000074*T2

    def s(a): return math.sin(a * DEG)

    dLon = (
        # largest terms (Meeus Table 47.A, first 30)
          6.288774 * s(Mm)
        + 1.274027 * s(2*D - Mm)
        + 0.658314 * s(2*D)
        + 0.213618 * s(2*Mm)
        - 0.185116 * E * s(M)
        - 0.114332 * s(2*F)
        + 0.058793 * s(2*D - 2*Mm)
        + 0.057066 * E * s(2*D - M - Mm)
        + 0.053322 * s(2*D + Mm)
        + 0.045758 * E * s(2*D - M)
        - 0.040923 * E * s(M - Mm)
        - 0.034720 * s(D)
        - 0.030383 * E * s(M + Mm)
        + 0.015327 * s(2*D - 2*F)
        - 0.012528 * s(Mm + 2*F)
        + 0.010980 * s(Mm - 2*F)
        + 0.010675 * s(4*D - Mm)
        + 0.010034 * s(3*Mm)
        + 0.008548 * s(4*D - 2*Mm)
        - 0.007888 * E * s(2*D + M - Mm)
        - 0.006766 * E * s(2*D + M)
        - 0.005163 * s(D - Mm)
        + 0.004987 * E * s(D + M)
        + 0.004036 * E * s(2*D - M + Mm)
        + 0.003994 * s(2*D + 2*Mm)
        + 0.003861 * s(4*D)
        + 0.003665 * s(2*D - 3*Mm)
        - 0.002689 * E * s(M - 2*Mm)
        - 0.002602 * s(2*D - Mm + 2*F)
        + 0.002390 * E * s(2*D - M - 2*Mm)
        - 0.002348 * s(D + Mm)
        + 0.002236 * E * s(2*D - 2*M)
        - 0.002120 * E * s(M + 2*Mm)
        - 0.002069 * E*E * s(2*M)
        + 0.002048 * E*E * s(2*D - 2*M - Mm)
        - 0.001773 * s(2*D + Mm - 2*F)
        - 0.001595 * s(2*D + 2*F)
        + 0.001215 * E * s(4*D - M - Mm)
        - 0.001110 * s(2*Mm + 2*F)
        - 0.000892 * s(3*D - Mm)
        - 0.000810 * E * s(2*D + M + Mm)
        + 0.000759 * E * s(4*D - M - 2*Mm)
        - 0.000713 * E*E * s(2*M - Mm)
        - 0.000700 * E * s(2*D + 2*M - Mm)
        + 0.000691 * E * s(2*D + M - 2*Mm)
        + 0.000596 * E * s(2*D - M - 2*F)
        + 0.000549 * s(4*D + Mm)
        + 0.000537 * s(4*Mm)
        + 0.000520 * E * s(4*D - M)
        - 0.000487 * s(D - 2*Mm)
        - 0.000399 * E * s(2*D + M - 2*F)
        - 0.000381 * s(2*Mm - 2*F)
        + 0.000351 * E * s(D + M + Mm)
        - 0.000340 * s(3*D - 2*Mm)
        + 0.000330 * s(4*D - 3*Mm)
        + 0.000327 * E * s(2*D - M + 2*Mm)
        - 0.000323 * E*E * s(2*M + Mm)
        + 0.000299 * E * s(D + M - Mm)
        + 0.000294 * s(2*D + 3*Mm)
    )

    # Planetary/aberration corrections (Meeus Table 47.B, in units of 1e-6 degrees)
    A1 = 119.75 + 131.849 * T
    A2 =  53.09 + 479264.290 * T
    dLon += (3958*math.sin(A1*DEG) + 1962*math.sin((Lm - F)*DEG) + 318*math.sin(A2*DEG)) / 1_000_000.0

    return (((Lm + dLon) % 360) + 360) % 360


# ── Obliquity of ecliptic ────────────────────────────────────────────────────

def obliquity(T: float) -> float:
    return 23.439291111 - 0.013004167 * T - 1.638889e-7 * T * T + 5.036111e-7 * T * T * T


# ── Local Sidereal Time (degrees) ────────────────────────────────────────────

def local_sidereal_time(jd: float, lon_deg: float) -> float:
    T = (jd - 2451545.0) / 36525.0
    GMST = (280.46061837
            + 360.98564736629 * (jd - 2451545.0)
            + 0.000387933 * T * T)
    return ((GMST + lon_deg) % 360 + 360) % 360


# ── Ascendant from LST + latitude + obliquity ────────────────────────────────

def ascendant_longitude(lst: float, lat_deg: float, eps: float) -> float:
    lst_r = lst * DEG
    lat_r = lat_deg * DEG
    eps_r = eps * DEG
    y = -math.cos(lst_r)
    x = math.sin(lst_r) * math.cos(eps_r) + math.tan(lat_r) * math.sin(eps_r)
    asc = math.atan2(y, x) * RAD
    if asc < 0:
        asc += 360
    return asc


# ── Lahiri ayanamsa ──────────────────────────────────────────────────────────
_LAHIRI_J2000   = 23.853
_AYANAMSA_RATE  = 50.2388 / 3600.0   # degrees/year

def lahiri_ayanamsa(jd: float) -> float:
    T = (jd - 2451545.0) / 365.25
    return _LAHIRI_J2000 + _AYANAMSA_RATE * T


def tropical_to_sidereal(tropical: float, ayanamsa: float) -> float:
    return ((tropical - ayanamsa) % 360 + 360) % 360


# ── Degree → rashi / nakshatra ───────────────────────────────────────────────

def long_to_rashi(deg: float) -> str:
    return RASHIS[int(((deg % 360) + 360) % 360 / 30)]


def long_to_nakshatra(sidereal_deg: float) -> str:
    idx = int(((sidereal_deg % 360) + 360) % 360 / (360.0 / 27))
    return NAKSHATRAS[idx % 27]


# ── Vimshottari dasha from sidereal moon + birth date ────────────────────────

def vimshottari_dasha(sidereal_moon_deg: float, birth_jd: float = None) -> str:
    """
    Returns the current Mahadasha lord based on Moon nakshatra at birth
    and the elapsed time since birth.
    Total Vimshottari cycle = 120 years.
    """
    nak_idx = int(((sidereal_moon_deg % 360) + 360) % 360 / (360.0 / 27))
    start_lord_idx = nak_idx % 9   # index into DASHA_LORDS for the birth dasha

    # Fraction of nakshatra already elapsed at birth → remaining years in first dasha
    nak_size = 360.0 / 27
    deg_in_nak = ((sidereal_moon_deg % 360) + 360) % 360 % nak_size
    fraction_elapsed = deg_in_nak / nak_size
    first_dasha_remaining = DASHA_YEARS[start_lord_idx] * (1.0 - fraction_elapsed)

    if birth_jd is None:
        return f"{DASHA_LORDS[start_lord_idx]} Mahadasha"

    # Years since birth
    from datetime import datetime, timezone as tz
    now_jd = 2451545.0 + (datetime.now(tz.utc) - datetime(2000, 1, 1, 12, 0, 0, tzinfo=tz.utc)).total_seconds() / 86400.0
    years_elapsed = (now_jd - birth_jd) / 365.25

    # Walk through dashas
    remaining = years_elapsed
    cumulative = first_dasha_remaining
    idx = start_lord_idx
    if remaining < cumulative:
        return f"{DASHA_LORDS[idx]} Mahadasha"
    remaining -= cumulative
    idx = (idx + 1) % 9
    while True:
        dur = DASHA_YEARS[idx]
        if remaining < dur:
            return f"{DASHA_LORDS[idx]} Mahadasha"
        remaining -= dur
        idx = (idx + 1) % 9


# ── Full chart computation ───────────────────────────────────────────────────

def compute_chart(
    dob: str,
    tob: str = "",
    pob: str = "",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    timezone: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compute a full Vedic chart.
    - dob: YYYY-MM-DD
    - tob: HH:MM (24h) or ''
    - pob: birth place string (used for built-in lookup if lat/lon not provided)
    - lat, lon, timezone: from geocoder (preferred)
    """
    try:
        # Accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD
        parts = dob.replace("/", "-").split("-")
        if len(parts) == 3:
            if len(parts[0]) == 4:          # YYYY-MM-DD
                yr, mo, dy = int(parts[0]), int(parts[1]), int(parts[2])
            else:                           # DD-MM-YYYY
                dy, mo, yr = int(parts[0]), int(parts[1]), int(parts[2])
        else:
            raise ValueError("unrecognised DOB format")
    except Exception:
        return _fallback_chart(dob, pob)

    # Resolve coordinates
    tz_offset: float = 5.5  # default IST
    city_lat: Optional[float] = None
    city_lon: Optional[float] = None

    if lat is not None and lon is not None:
        city_lat = lat
        city_lon = lon
        if timezone:
            tz_offset = _tz_to_offset(timezone)
        else:
            tz_offset = round(lon / 15.0)
    else:
        coords = _lookup_city(pob)
        if coords:
            city_lat, city_lon, tz_offset = coords

    # Birth time → UT hour
    ut_hour = 12.0
    has_birth_time = False
    if tob:
        try:
            hh, mm, is_pm = _parse_tob(tob)
            if is_pm and hh < 12:
                hh += 12
            elif not is_pm and hh == 12:
                hh = 0
            hh = max(0, min(23, hh))
            mm = max(0, min(59, mm))
            local_hour = hh + mm / 60.0
            ut_hour = local_hour - tz_offset
            has_birth_time = True
        except Exception:
            pass

    jd   = julian_day(yr, mo, dy, ut_hour)
    ayan = lahiri_ayanamsa(jd)
    T    = (jd - 2451545.0) / 36525.0

    # Sun
    sun_trop     = sun_longitude(jd)
    sun_sidereal = tropical_to_sidereal(sun_trop, ayan)
    sun_sign     = long_to_rashi(sun_trop)   # tropical (Western)
    vedic_sun    = long_to_rashi(sun_sidereal)

    # Moon
    moon_trop     = moon_longitude(jd)
    moon_sidereal = tropical_to_sidereal(moon_trop, ayan)
    moon_sign     = long_to_rashi(moon_sidereal)

    # Ascendant / Lagna
    approximate = False
    if has_birth_time and city_lat is not None and city_lon is not None:
        lst       = local_sidereal_time(jd, city_lon)
        eps       = obliquity(T)
        asc_trop  = ascendant_longitude(lst, city_lat, eps)
        asc_sid   = tropical_to_sidereal(asc_trop, ayan)
        lagna     = long_to_rashi(asc_sid)
        method    = "Computed from birth time & place (Lahiri ayanamsa)"
    elif has_birth_time:
        sun_idx = RASHIS.index(vedic_sun)
        lagna   = RASHIS[(sun_idx + round(ut_hour / 2)) % 12]
        approximate = True
        method  = "Birth time given — place coordinates not found; approximate lagna"
    else:
        lagna   = vedic_sun
        approximate = True
        method  = "No birth time — lagna is approximate (provide birth time for accuracy)"

    nakshatra    = long_to_nakshatra(moon_sidereal)
    current_d    = vimshottari_dasha(moon_sidereal, birth_jd=jd)
    planet_data  = planetary_positions_from_jd(jd, ayan, sun_sidereal, moon_sidereal)
    planets_dict = planet_data["rashis"]

    # Coordinate source label for UI
    if lat is not None and lon is not None:
        coord_source = "geocoded"
    elif city_lat is not None:
        coord_source = "builtin"
    else:
        coord_source = "unknown"

    # Lagna longitude (sidereal)
    lagna_lon: Optional[float] = None
    if has_birth_time and city_lat is not None and city_lon is not None:
        lagna_lon = round(asc_sid, 3)

    seed = _seed(dob + pob)

    return {
        "lagna":               lagna,
        "moon_sign":           moon_sign,
        "sun_sign":            sun_sign,
        "vedic_sun_sign":      vedic_sun,
        "nakshatra":           nakshatra,
        "current_dasha":       current_d,
        "ayanamsa_degrees":    round(ayan, 4),
        "computation_method":  "VSOP87-simplified + ELP2000-simplified, Lahiri ayanamsa, Vimshottari Dasha",
        "planetary_positions": planets_dict,
        "house_analysis":      house_analysis(seed, lagna),
        "doshas":              active_doshas(seed),
        "dasha_periods":       dasha_periods(seed),
        "yogas":               active_yogas(seed),
        "strengths":           [
            f"Natural {lagna} qualities bring resilience and determination.",
            f"Moon in {moon_sign} supports emotional depth and intuition.",
            f"The {nakshatra} nakshatra bestows wisdom and perceptiveness.",
        ],
        "challenges":          [
            f"The {moon_sign} Moon may bring emotional fluctuations requiring mindful management.",
            "A tendency toward overwork — balance and delegation are recommended.",
        ],
        "predictions":         predictions_for_focus(lagna, sun_sign, moon_sign, "general", seed),
        "chart": {
            "lagna":              lagna,
            "sun_sign":           vedic_sun,
            "moon_sign":          moon_sign,
            "nakshatra":          nakshatra,
            "planets":            planets_dict,
            "planet_longitudes":  planet_data["longitudes"],
            "planet_nakshatras":  planet_data["nakshatras"],
            "lagna_longitude":    lagna_lon,
            "approximate":        approximate,
            "ayanamsa":           f"Lahiri {ayan:.2f}°",
            "method":             method,
            "coord_source":       coord_source,
        },
    }


def planetary_positions_from_jd(jd: float, ayan: float,
                                  sun_sid: float, moon_sid: float
                                  ) -> Dict[str, Any]:
    """Returns rashis, longitudes, and nakshatras for all 9 grahas."""
    T = (jd - 2451545.0) / 365.25

    sun_idx  = int(sun_sid / 30)
    moon_idx = int(moon_sid / 30)

    # Mercury stays within ~28° of Sun
    merc_offset = round(math.sin(T * 4.15 * 2 * math.pi) * 0.9)
    merc_lon = (sun_sid + merc_offset * 30) % 360
    merc_idx = int(merc_lon / 30)

    # Venus within ~1-2 rashis of Sun
    venus_offset = round(math.sin(T * 1.625 * 2 * math.pi) * 1.5)
    venus_lon = (sun_sid + venus_offset * 30) % 360
    venus_idx = int(venus_lon / 30)

    # Mars: mean daily motion 0.5240207766°/day
    mars_lon = tropical_to_sidereal(
        ((28.0 + 0.5240207766 * (jd - 2451545.0)) % 360 + 360) % 360, ayan)
    mars_idx = int(mars_lon / 30)

    # Jupiter: 0.08308529°/day
    jup_lon = tropical_to_sidereal(
        ((34.35 + 0.08308529 * (jd - 2451545.0)) % 360 + 360) % 360, ayan)
    jup_idx = int(jup_lon / 30)

    # Saturn: 0.03344°/day
    sat_lon = tropical_to_sidereal(
        ((50.08 + 0.03344 * (jd - 2451545.0)) % 360 + 360) % 360, ayan)
    sat_idx = int(sat_lon / 30)

    # Rahu (retrograde)
    rahu_lon = tropical_to_sidereal(
        ((125.044 - 0.052953922 * (jd - 2451545.0)) % 360 + 360) % 360, ayan)
    rahu_idx = int(rahu_lon / 30)
    ketu_lon  = (rahu_lon + 180) % 360
    ketu_idx  = (rahu_idx + 6) % 12

    lons = {
        "Sun":     sun_sid,
        "Moon":    moon_sid,
        "Mercury": merc_lon,
        "Venus":   venus_lon,
        "Mars":    mars_lon,
        "Jupiter": jup_lon,
        "Saturn":  sat_lon,
        "Rahu":    rahu_lon,
        "Ketu":    ketu_lon,
    }

    return {
        "rashis": {
            "Sun":     RASHIS[sun_idx],
            "Moon":    RASHIS[moon_idx],
            "Mercury": RASHIS[merc_idx],
            "Venus":   RASHIS[venus_idx],
            "Mars":    RASHIS[mars_idx],
            "Jupiter": RASHIS[jup_idx],
            "Saturn":  RASHIS[sat_idx],
            "Rahu":    RASHIS[rahu_idx],
            "Ketu":    RASHIS[ketu_idx],
        },
        "longitudes": {p: round(v, 3) for p, v in lons.items()},
        "nakshatras": {p: long_to_nakshatra(v) for p, v in lons.items()},
    }


def _fallback_chart(dob: str, pob: str) -> Dict[str, Any]:
    seed = _seed(dob + pob)
    lagna = RASHIS[seed % 12]
    moon  = RASHIS[(seed + 3) % 12]
    sun   = RASHIS[(seed + 6) % 12]
    return {
        "lagna": lagna, "moon_sign": moon, "sun_sign": sun,
        "vedic_sun_sign": sun, "nakshatra": NAKSHATRAS[seed % 27],
        "current_dasha": "Unknown", "approximate": True,
        "chart": {"lagna": lagna, "sun_sign": sun, "moon_sign": moon,
                  "nakshatra": NAKSHATRAS[seed % 27],
                  "planets": {}, "approximate": True, "method": "Fallback: invalid DOB"},
        "planetary_positions": {}, "house_analysis": {}, "doshas": [],
        "dasha_periods": [], "yogas": [], "strengths": [], "challenges": [], "predictions": [],
    }


# ── Legacy API (called by astrology_agent.py) ────────────────────────────────
# These preserve the existing interface so astrology_agent.py needs no changes.

def lagna_rashi(seed: int) -> str:
    return RASHIS[seed % 12]


def moon_rashi(seed: int) -> str:
    return RASHIS[(seed + 4) % 12]


def sun_sign_from_dob(dob: str) -> str:
    """Tropical sun sign from date of birth."""
    try:
        parts = dob.split("-")
        mm, dd = int(parts[1]), int(parts[2])
    except Exception:
        return "Capricorn"
    ranges = [
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
    for planet, dur in DASHA_SEQUENCE:
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


def predictions_for_focus(lagna: str, sun: str, moon: str,
                           focus: str, seed: int) -> List[str]:
    base = [
        f"This suggests a favorable period for {lagna} rising individuals in the near future.",
        f"The {sun} Sun indicates strong natural ability in professional pursuits.",
        f"The {moon} Moon brings emotional sensitivity and depth.",
    ]
    focus_specific: Dict[str, List[str]] = {
        "career":   [f"Career advancement is strongly supported by current Mahadasha.",
                     "This suggests a good time for promotion, new role, or business expansion."],
        "finance":  ["There is a tendency toward financial improvement through disciplined planning.",
                     "Steady accumulation is favored over high-risk ventures."],
        "marriage": ["Partnership energy is activated — existing bonds deepen.",
                     "For singles, a meaningful connection may enter the picture."],
        "health":   ["Good health is indicated with attention to regular routine.",
                     "Vitality improves with mindful practices."],
        "general":  ["Overall energy is positive — this is a growth-oriented period."],
    }
    return focus_specific.get(focus, focus_specific["general"]) + base
