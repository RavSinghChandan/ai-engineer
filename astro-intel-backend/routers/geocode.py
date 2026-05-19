"""
Geocode router — city name → lat, lon, timezone
Uses OpenStreetMap Nominatim (free, no API key).
Results cached in-memory for 30 days (city names don't change).
Uses httpx (async) which is already installed via the anthropic/langsmith deps.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/geocode", tags=["Geocode"])

# ── 30-day in-memory cache ───────────────────────────────────────────────────
_GEO_CACHE: Dict[str, Tuple[float, Any]] = {}
_GEO_TTL   = 30 * 24 * 3600   # 30 days in seconds

# Nominatim rate-limit: 1 req/sec per ToS
_NOM_LOCK = asyncio.Lock()
_LAST_CALL: float = 0.0

# Nominatim headers — must include a real User-Agent per their policy
_HEADERS = {
    "User-Agent": "AstroIntel/1.0 astrology-platform contact@aura-with-rav.com",
    "Accept-Language": "en",
}


class GeocodeResponse(BaseModel):
    city:         str
    lat:          float
    lon:          float
    display_name: str
    timezone:     str
    source:       str   # "cache" | "nominatim" | "builtin"


# ── Built-in fallback (instant, no network) ──────────────────────────────────
_BUILTIN: Dict[str, Dict] = {
    "chandigarh":   {"lat": 30.7333, "lon": 76.7794, "timezone": "Asia/Kolkata",  "display_name": "Chandigarh, India"},
    "delhi":        {"lat": 28.6139, "lon": 77.2090, "timezone": "Asia/Kolkata",  "display_name": "New Delhi, India"},
    "new delhi":    {"lat": 28.6139, "lon": 77.2090, "timezone": "Asia/Kolkata",  "display_name": "New Delhi, India"},
    "mumbai":       {"lat": 19.0760, "lon": 72.8777, "timezone": "Asia/Kolkata",  "display_name": "Mumbai, India"},
    "bangalore":    {"lat": 12.9716, "lon": 77.5946, "timezone": "Asia/Kolkata",  "display_name": "Bengaluru, India"},
    "bengaluru":    {"lat": 12.9716, "lon": 77.5946, "timezone": "Asia/Kolkata",  "display_name": "Bengaluru, India"},
    "hyderabad":    {"lat": 17.3850, "lon": 78.4867, "timezone": "Asia/Kolkata",  "display_name": "Hyderabad, India"},
    "ahmedabad":    {"lat": 23.0225, "lon": 72.5714, "timezone": "Asia/Kolkata",  "display_name": "Ahmedabad, India"},
    "chennai":      {"lat": 13.0827, "lon": 80.2707, "timezone": "Asia/Kolkata",  "display_name": "Chennai, India"},
    "kolkata":      {"lat": 22.5726, "lon": 88.3639, "timezone": "Asia/Kolkata",  "display_name": "Kolkata, India"},
    "pune":         {"lat": 18.5204, "lon": 73.8567, "timezone": "Asia/Kolkata",  "display_name": "Pune, India"},
    "jaipur":       {"lat": 26.9124, "lon": 75.7873, "timezone": "Asia/Kolkata",  "display_name": "Jaipur, India"},
    "lucknow":      {"lat": 26.8467, "lon": 80.9462, "timezone": "Asia/Kolkata",  "display_name": "Lucknow, India"},
    "patna":        {"lat": 25.5941, "lon": 85.1376, "timezone": "Asia/Kolkata",  "display_name": "Patna, India"},
    "surat":        {"lat": 21.1702, "lon": 72.8311, "timezone": "Asia/Kolkata",  "display_name": "Surat, India"},
    "indore":       {"lat": 22.7196, "lon": 75.8577, "timezone": "Asia/Kolkata",  "display_name": "Indore, India"},
    "nagpur":       {"lat": 21.1458, "lon": 79.0882, "timezone": "Asia/Kolkata",  "display_name": "Nagpur, India"},
    "bhopal":       {"lat": 23.2599, "lon": 77.4126, "timezone": "Asia/Kolkata",  "display_name": "Bhopal, India"},
    "coimbatore":   {"lat": 11.0168, "lon": 76.9558, "timezone": "Asia/Kolkata",  "display_name": "Coimbatore, India"},
    "kochi":        {"lat":  9.9312, "lon": 76.2673, "timezone": "Asia/Kolkata",  "display_name": "Kochi, India"},
    "amritsar":     {"lat": 31.6340, "lon": 74.8723, "timezone": "Asia/Kolkata",  "display_name": "Amritsar, India"},
    "varanasi":     {"lat": 25.3176, "lon": 82.9739, "timezone": "Asia/Kolkata",  "display_name": "Varanasi, India"},
    "agra":         {"lat": 27.1767, "lon": 78.0081, "timezone": "Asia/Kolkata",  "display_name": "Agra, India"},
    "ludhiana":     {"lat": 30.9010, "lon": 75.8573, "timezone": "Asia/Kolkata",  "display_name": "Ludhiana, India"},
    "dehradun":     {"lat": 30.3165, "lon": 78.0322, "timezone": "Asia/Kolkata",  "display_name": "Dehradun, India"},
    "shimla":       {"lat": 31.1048, "lon": 77.1734, "timezone": "Asia/Kolkata",  "display_name": "Shimla, India"},
    "jammu":        {"lat": 32.7266, "lon": 74.8570, "timezone": "Asia/Kolkata",  "display_name": "Jammu, India"},
    "srinagar":     {"lat": 34.0837, "lon": 74.7973, "timezone": "Asia/Kolkata",  "display_name": "Srinagar, India"},
    "ranchi":       {"lat": 23.3441, "lon": 85.3096, "timezone": "Asia/Kolkata",  "display_name": "Ranchi, India"},
    "guwahati":     {"lat": 26.1445, "lon": 91.7362, "timezone": "Asia/Kolkata",  "display_name": "Guwahati, India"},
    "bhubaneswar":  {"lat": 20.2961, "lon": 85.8245, "timezone": "Asia/Kolkata",  "display_name": "Bhubaneswar, India"},
    "mysuru":       {"lat": 12.2958, "lon": 76.6394, "timezone": "Asia/Kolkata",  "display_name": "Mysuru, India"},
    "mysore":       {"lat": 12.2958, "lon": 76.6394, "timezone": "Asia/Kolkata",  "display_name": "Mysore, India"},
    "vadodara":     {"lat": 22.3072, "lon": 73.1812, "timezone": "Asia/Kolkata",  "display_name": "Vadodara, India"},
    "london":       {"lat": 51.5074, "lon": -0.1278, "timezone": "Europe/London", "display_name": "London, UK"},
    "new york":     {"lat": 40.7128, "lon":-74.0060, "timezone": "America/New_York", "display_name": "New York, USA"},
    "los angeles":  {"lat": 34.0522, "lon":-118.243, "timezone": "America/Los_Angeles", "display_name": "Los Angeles, USA"},
    "toronto":      {"lat": 43.6532, "lon":-79.3832, "timezone": "America/Toronto", "display_name": "Toronto, Canada"},
    "sydney":       {"lat":-33.8688, "lon": 151.209, "timezone": "Australia/Sydney", "display_name": "Sydney, Australia"},
    "dubai":        {"lat": 25.2048, "lon": 55.2708, "timezone": "Asia/Dubai",    "display_name": "Dubai, UAE"},
    "singapore":    {"lat":  1.3521, "lon": 103.819, "timezone": "Asia/Singapore","display_name": "Singapore"},
    "tokyo":        {"lat": 35.6762, "lon": 139.650, "timezone": "Asia/Tokyo",    "display_name": "Tokyo, Japan"},
    "beijing":      {"lat": 39.9042, "lon": 116.407, "timezone": "Asia/Shanghai", "display_name": "Beijing, China"},
    "shanghai":     {"lat": 31.2304, "lon": 121.473, "timezone": "Asia/Shanghai", "display_name": "Shanghai, China"},
    "karachi":      {"lat": 24.8607, "lon": 67.0011, "timezone": "Asia/Karachi",  "display_name": "Karachi, Pakistan"},
    "lahore":       {"lat": 31.5204, "lon": 74.3587, "timezone": "Asia/Karachi",  "display_name": "Lahore, Pakistan"},
    "islamabad":    {"lat": 33.6844, "lon": 73.0479, "timezone": "Asia/Karachi",  "display_name": "Islamabad, Pakistan"},
    "dhaka":        {"lat": 23.8103, "lon": 90.4125, "timezone": "Asia/Dhaka",    "display_name": "Dhaka, Bangladesh"},
    "colombo":      {"lat":  6.9271, "lon": 79.8612, "timezone": "Asia/Colombo",  "display_name": "Colombo, Sri Lanka"},
    "kathmandu":    {"lat": 27.7172, "lon": 85.3240, "timezone": "Asia/Kathmandu","display_name": "Kathmandu, Nepal"},
    "nairobi":      {"lat": -1.2921, "lon": 36.8219, "timezone": "Africa/Nairobi","display_name": "Nairobi, Kenya"},
    "paris":        {"lat": 48.8566, "lon":  2.3522, "timezone": "Europe/Paris",  "display_name": "Paris, France"},
    "berlin":       {"lat": 52.5200, "lon": 13.4050, "timezone": "Europe/Berlin", "display_name": "Berlin, Germany"},
    "moscow":       {"lat": 55.7558, "lon": 37.6173, "timezone": "Europe/Moscow", "display_name": "Moscow, Russia"},
}


def _builtin_lookup(city: str) -> Optional[Dict]:
    lower = city.strip().lower()
    for key, val in _BUILTIN.items():
        if lower == key or lower.startswith(key) or key in lower:
            return {**val, "source": "builtin"}
    return None


# ── Cache helpers ────────────────────────────────────────────────────────────
def _cache_get(key: str) -> Optional[Any]:
    entry = _GEO_CACHE.get(key)
    if not entry:
        return None
    stored_at, payload = entry
    if time.time() - stored_at > _GEO_TTL:
        del _GEO_CACHE[key]
        return None
    return payload


def _cache_set(key: str, payload: Any) -> None:
    _GEO_CACHE[key] = (time.time(), payload)


# ── Timezone from country code ────────────────────────────────────────────────
_COUNTRY_TZ: Dict[str, str] = {
    "in": "Asia/Kolkata",  "lk": "Asia/Colombo",   "np": "Asia/Kathmandu",
    "pk": "Asia/Karachi",  "bd": "Asia/Dhaka",      "af": "Asia/Kabul",
    "ae": "Asia/Dubai",    "sa": "Asia/Riyadh",     "ir": "Asia/Tehran",
    "sg": "Asia/Singapore","my": "Asia/Kuala_Lumpur","th": "Asia/Bangkok",
    "vn": "Asia/Ho_Chi_Minh","id": "Asia/Jakarta",  "ph": "Asia/Manila",
    "cn": "Asia/Shanghai", "tw": "Asia/Taipei",     "jp": "Asia/Tokyo",
    "kr": "Asia/Seoul",    "ru": "Europe/Moscow",   "gb": "Europe/London",
    "ie": "Europe/Dublin", "fr": "Europe/Paris",    "de": "Europe/Berlin",
    "it": "Europe/Rome",   "es": "Europe/Madrid",   "pt": "Europe/Lisbon",
    "nl": "Europe/Amsterdam","be": "Europe/Brussels","ch": "Europe/Zurich",
    "at": "Europe/Vienna", "pl": "Europe/Warsaw",   "tr": "Europe/Istanbul",
    "gr": "Europe/Athens", "se": "Europe/Stockholm","no": "Europe/Oslo",
    "dk": "Europe/Copenhagen","fi": "Europe/Helsinki",
    "eg": "Africa/Cairo",  "za": "Africa/Johannesburg","ke": "Africa/Nairobi",
    "ng": "Africa/Lagos",  "gh": "Africa/Accra",    "tz": "Africa/Dar_es_Salaam",
    "us": "America/New_York","ca": "America/Toronto","mx": "America/Mexico_City",
    "br": "America/Sao_Paulo","ar": "America/Argentina/Buenos_Aires",
    "co": "America/Bogota","pe": "America/Lima",    "cl": "America/Santiago",
    "au": "Australia/Sydney","nz": "Pacific/Auckland",
}


def _timezone_from_cc(cc: str, lon: float) -> str:
    tz = _COUNTRY_TZ.get(cc.lower())
    if tz:
        return tz
    # Rough fallback from longitude
    offset = round(lon / 15)
    sign   = "+" if offset >= 0 else "-"
    return f"Etc/GMT{sign}{abs(offset)}"


# ── Nominatim async lookup ────────────────────────────────────────────────────
async def _nominatim_lookup(city: str) -> Optional[Dict]:
    global _LAST_CALL
    async with _NOM_LOCK:
        # Enforce 1 req/sec
        gap = time.time() - _LAST_CALL
        if gap < 1.0:
            await asyncio.sleep(1.0 - gap)
        _LAST_CALL = time.time()

        url    = "https://nominatim.openstreetmap.org/search"
        params = {"q": city.strip(), "format": "json", "limit": "1", "addressdetails": "1"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params, headers=_HEADERS)
                resp.raise_for_status()
                results = resp.json()
        except Exception:
            return None

    if not results:
        return None

    r   = results[0]
    lat = float(r["lat"])
    lon = float(r["lon"])
    cc  = r.get("address", {}).get("country_code", "")
    tz  = _timezone_from_cc(cc, lon)

    return {
        "lat":          lat,
        "lon":          lon,
        "display_name": r.get("display_name", city),
        "timezone":     tz,
        "source":       "nominatim",
    }


# ── Route ─────────────────────────────────────────────────────────────────────
@router.get("", response_model=GeocodeResponse)
async def geocode(city: str) -> GeocodeResponse:
    """
    Resolve city name → lat, lon, timezone.
    Priority: 30-day cache → Nominatim → built-in table.
    """
    if not city or not city.strip():
        raise HTTPException(status_code=400, detail="city parameter is required")

    key = city.strip().lower()

    # 1. Cache
    cached = _cache_get(key)
    if cached:
        return GeocodeResponse(city=city, **cached)

    # 2. Nominatim
    result = await _nominatim_lookup(city)
    if result:
        _cache_set(key, result)
        return GeocodeResponse(city=city, **result)

    # 3. Built-in fallback
    builtin = _builtin_lookup(city)
    if builtin:
        _cache_set(key, builtin)
        return GeocodeResponse(city=city, **builtin)

    raise HTTPException(
        status_code=404,
        detail=f"Could not resolve '{city}'. Try a more specific name e.g. 'Mumbai, India'.",
    )


@router.get("/cache/stats")
async def geocode_cache_stats() -> Dict:
    now   = time.time()
    valid = {k: v[1] for k, v in _GEO_CACHE.items() if now - v[0] <= _GEO_TTL}
    return {
        "cached_cities": len(valid),
        "cities":        list(valid.keys()),
        "ttl_days":      30,
    }
