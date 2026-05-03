#!/usr/bin/env python3
"""
AstroIntel Backend Accuracy Test
Tests vedic astrology calculations for 10 well-known people.
"""

import urllib.request
import urllib.parse
import json
import sys
import time

BASE_URL = "http://localhost:8000"

PEOPLE = [
    {
        "label": "Mahatma Gandhi",
        "profile": {
            "full_name": "Mahatma Gandhi",
            "date_of_birth": "1869-10-02",
            "time_of_birth": "07:45",
            "place_of_birth": "Porbandar, Gujarat",
            "gender": "Male",
            "primary_question": "Life mission"
        },
        "expected": {"sun": "Virgo", "moon": "Cancer"},
        "note": "Sun Virgo (sidereal), Moon Cancer"
    },
    {
        "label": "Narendra Modi",
        "profile": {
            "full_name": "Narendra Modi",
            "date_of_birth": "1950-09-17",
            "time_of_birth": "11:00",
            "place_of_birth": "Vadnagar, Gujarat",
            "gender": "Male",
            "primary_question": "Career"
        },
        "expected": {"sun": "Virgo", "moon": "Scorpio"},
        "note": "Sun Virgo (sidereal), Moon Scorpio"
    },
    {
        "label": "Deepika Padukone",
        "profile": {
            "full_name": "Deepika Padukone",
            "date_of_birth": "1986-01-05",
            "time_of_birth": "21:30",
            "place_of_birth": "Copenhagen",
            "gender": "Female",
            "primary_question": "Fame"
        },
        "expected": {"sun": "Sagittarius"},
        "note": "Sun Sagittarius sidereal (Jan 5 tropical Capricorn -> sidereal Sagittarius)"
    },
    {
        "label": "Barack Obama",
        "profile": {
            "full_name": "Barack Obama",
            "date_of_birth": "1961-08-04",
            "time_of_birth": "19:24",
            "place_of_birth": "Honolulu",
            "gender": "Male",
            "primary_question": "Leadership"
        },
        "expected": {"sun": "Cancer"},
        "note": "Sun Cancer sidereal (Aug 4 tropical Leo -> sidereal Cancer)"
    },
    {
        "label": "Princess Diana",
        "profile": {
            "full_name": "Diana Spencer",
            "date_of_birth": "1961-07-01",
            "time_of_birth": "19:45",
            "place_of_birth": "Sandringham",
            "gender": "Female",
            "primary_question": "Life path"
        },
        "expected": {"sun": "Gemini"},
        "note": "Sun Gemini sidereal (July 1 tropical Cancer -> sidereal Gemini)"
    },
    {
        "label": "Albert Einstein",
        "profile": {
            "full_name": "Albert Einstein",
            "date_of_birth": "1879-03-14",
            "time_of_birth": "11:30",
            "place_of_birth": "Ulm, Germany",
            "gender": "Male",
            "primary_question": "Intelligence"
        },
        "expected": {"sun": "Pisces"},
        "note": "Sun Pisces sidereal (Mar 14 tropical Pisces -> sidereal Aquarius/Pisces boundary)"
    },
    {
        "label": "Isaac Newton",
        "profile": {
            "full_name": "Isaac Newton",
            "date_of_birth": "1643-01-04",
            "time_of_birth": "01:45",
            "place_of_birth": "Woolsthorpe, England",
            "gender": "Male",
            "primary_question": "Knowledge"
        },
        "expected": {"sun": "Sagittarius"},
        "note": "Sun Sagittarius sidereal (Jan 4 tropical Capricorn -> sidereal Sagittarius)"
    },
    {
        "label": "AR Rahman",
        "profile": {
            "full_name": "AR Rahman",
            "date_of_birth": "1967-01-06",
            "time_of_birth": "14:45",
            "place_of_birth": "Chennai",
            "gender": "Male",
            "primary_question": "Music career"
        },
        "expected": {"sun": "Sagittarius"},
        "note": "Sun Sagittarius sidereal (Jan 6 tropical Capricorn -> sidereal Sagittarius)"
    },
    {
        "label": "Serena Williams",
        "profile": {
            "full_name": "Serena Williams",
            "date_of_birth": "1981-09-26",
            "time_of_birth": "20:28",
            "place_of_birth": "Saginaw",
            "gender": "Female",
            "primary_question": "Sports career"
        },
        "expected": {"sun": "Virgo"},
        "note": "Sun Virgo sidereal (Sep 26 tropical Libra -> sidereal Virgo)"
    },
    {
        "label": "Elon Musk",
        "profile": {
            "full_name": "Elon Musk",
            "date_of_birth": "1971-06-28",
            "time_of_birth": "07:30",
            "place_of_birth": "Pretoria",
            "gender": "Male",
            "primary_question": "Business innovation"
        },
        "expected": {"sun": "Gemini"},
        "note": "Sun Gemini sidereal (Jun 28 tropical Cancer -> sidereal Gemini)"
    },
]


def http_get(url):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}


def http_post(url, data):
    try:
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": f"HTTP {e.code}: {body[:500]}"}
    except Exception as e:
        return {"error": str(e)}


def geocode(city):
    url = f"{BASE_URL}/api/v1/geocode?city={urllib.parse.quote(city)}"
    return http_get(url)


def run_analysis(profile, geo, question):
    url = f"{BASE_URL}/api/v1/analysis/run"
    body = {
        "user_profile": profile,
        "selected_modules": ["astrology"],
        "bypass_cache": True,
        "user_question": question,
        "geocode": {
            "lat": geo.get("lat"),
            "lon": geo.get("lon"),
            "timezone": geo.get("timezone", "UTC")
        }
    }
    return http_post(url, body)


def normalize_sign(sign):
    """Normalize sign name for comparison."""
    if not sign:
        return ""
    return sign.strip().lower().replace("-", " ")


def check_match(computed, expected):
    if not computed or not expected:
        return False
    return normalize_sign(computed) == normalize_sign(expected)


def sep(char="=", width=80):
    return char * width


print(sep())
print("ASTROINTEL BACKEND — VEDIC ACCURACY TEST")
print(f"Backend: {BASE_URL}")
print(f"Test cases: {len(PEOPLE)}")
print(sep())

results = []

for i, person in enumerate(PEOPLE, 1):
    label = person["label"]
    profile = person["profile"]
    expected = person["expected"]
    note = person["note"]
    city = profile["place_of_birth"]

    print(f"\n[{i}/{len(PEOPLE)}] {label}")
    print(f"  DOB: {profile['date_of_birth']}  TOB: {profile['time_of_birth']}  Place: {city}")
    print(f"  Note: {note}")

    # Step 1: Geocode
    geo_result = geocode(city)
    if "error" in geo_result:
        print(f"  GEO  ERROR: {geo_result['error']}")
        results.append({"label": label, "status": "GEO_ERROR", "error": geo_result["error"]})
        continue

    lat = geo_result.get("lat")
    lon = geo_result.get("lon")
    tz  = geo_result.get("timezone", "UTC")
    print(f"  GEO  lat={lat}  lon={lon}  tz={tz}")

    # Step 2: Run analysis
    unique_q = f"{profile['primary_question']} test_{i}_{int(time.time())}"
    analysis = run_analysis(profile, geo_result, unique_q)

    if "error" in analysis:
        print(f"  ANALYSIS ERROR: {analysis['error']}")
        results.append({"label": label, "status": "ANALYSIS_ERROR", "error": analysis["error"]})
        continue

    # Step 3: Extract chart data
    try:
        chart = analysis["raw_outputs"]["astrology"]["vedic"]["chart"]
    except (KeyError, TypeError) as e:
        # Try alternate path
        chart = None
        raw = analysis.get("raw_outputs", {})
        astro = raw.get("astrology", {})
        vedic = astro.get("vedic", {})
        chart = vedic.get("chart", None)
        if chart is None:
            print(f"  EXTRACT ERROR: Cannot find chart in response. Keys: {list(analysis.keys())}")
            print(f"  raw_outputs keys: {list(raw.keys())}")
            print(f"  astrology keys: {list(astro.keys())}")
            results.append({"label": label, "status": "EXTRACT_ERROR",
                            "raw_snippet": json.dumps(analysis)[:300]})
            continue

    sun       = chart.get("sun_sign", "N/A")
    moon      = chart.get("moon_sign", "N/A")
    lagna     = chart.get("lagna", "N/A")
    nakshatra = chart.get("nakshatra", "N/A")
    method    = chart.get("method", "N/A")

    print(f"  SUN={sun}  MOON={moon}  LAGNA={lagna}  NAKSHATRA={nakshatra}  METHOD={method}")

    # Step 4: Compare
    exp_sun   = expected.get("sun")
    exp_moon  = expected.get("moon")
    exp_lagna = expected.get("lagna")

    sun_match   = check_match(sun, exp_sun)   if exp_sun   else None
    moon_match  = check_match(moon, exp_moon) if exp_moon  else None
    lagna_match = check_match(lagna, exp_lagna) if exp_lagna else None

    checks = []
    if exp_sun:
        tag = "PASS" if sun_match else "FAIL"
        checks.append(f"SUN={tag}(expected={exp_sun}, got={sun})")
    if exp_moon:
        tag = "PASS" if moon_match else "FAIL"
        checks.append(f"MOON={tag}(expected={exp_moon}, got={moon})")
    if exp_lagna:
        tag = "PASS" if lagna_match else "FAIL"
        checks.append(f"LAGNA={tag}(expected={exp_lagna}, got={lagna})")

    verdict = "  CHECKS: " + "  |  ".join(checks)
    print(verdict)

    # Primary pass = sun (always expected)
    primary_pass = sun_match if exp_sun else None

    results.append({
        "label": label,
        "status": "OK",
        "sun": sun, "moon": moon, "lagna": lagna,
        "nakshatra": nakshatra, "method": method,
        "sun_match": sun_match,
        "moon_match": moon_match,
        "lagna_match": lagna_match,
        "primary_pass": primary_pass,
    })

    # Small delay to avoid hammering
    time.sleep(0.5)

# ── Final Report ──────────────────────────────────────────────────────────────
print(f"\n{sep()}")
print("FINAL ACCURACY REPORT")
print(sep())

ok_results = [r for r in results if r["status"] == "OK"]
error_results = [r for r in results if r["status"] != "OK"]

total = len(PEOPLE)
errors = len(error_results)
tested = len(ok_results)

sun_tests = [r for r in ok_results if r["sun_match"] is not None]
sun_pass  = [r for r in sun_tests if r["sun_match"]]
moon_tests = [r for r in ok_results if r["moon_match"] is not None]
moon_pass  = [r for r in moon_tests if r["moon_match"]]

print(f"\nTotal cases      : {total}")
print(f"Successfully run : {tested}")
print(f"Errors           : {errors}")
print()
print(f"Sun Sign Tests   : {len(sun_pass)}/{len(sun_tests)} PASS  ({100*len(sun_pass)//max(len(sun_tests),1)}%)")
print(f"Moon Sign Tests  : {len(moon_pass)}/{len(moon_tests)} PASS  ({100*len(moon_pass)//max(len(moon_tests),1)}%)")

print(f"\n{'Label':<22} {'Sun Got':<16} {'Sun Exp':<16} {'Moon Got':<16} {'Moon Exp':<16} {'Sun':>5} {'Moon':>5}")
print("-" * 100)
for r in results:
    if r["status"] != "OK":
        print(f"{r['label']:<22} ERROR: {r['status']} - {r.get('error','')[:40]}")
        continue
    label = r["label"]
    sg = r["sun"] or "?"
    mg = r["moon"] or "?"
    # find expected
    p = next(p for p in PEOPLE if p["label"] == label)
    se = p["expected"].get("sun", "-")
    me = p["expected"].get("moon", "-")
    sun_r  = "PASS" if r["sun_match"]  else ("FAIL" if r["sun_match"] is False else "N/A")
    moon_r = "PASS" if r["moon_match"] else ("FAIL" if r["moon_match"] is False else "N/A")
    print(f"{label:<22} {sg:<16} {se:<16} {mg:<16} {me:<16} {sun_r:>5} {moon_r:>5}")

print()
print(sep())
# Overall score: sun accuracy is primary
overall = f"{len(sun_pass)}/{len(sun_tests)}" if sun_tests else "N/A"
pct = 100 * len(sun_pass) // max(len(sun_tests), 1)
print(f"OVERALL SUN ACCURACY: {overall} ({pct}%)")
print(sep())

# Failures detail
fails = [r for r in ok_results if r["sun_match"] is False]
if fails:
    print("\nFAILED SUN SIGN CASES:")
    for r in fails:
        p = next(p for p in PEOPLE if p["label"] == r["label"])
        print(f"  {r['label']}: expected={p['expected'].get('sun')}  got={r['sun']}")
        print(f"    Note: {p['note']}")
        print(f"    Nakshatra={r['nakshatra']}  Method={r['method']}")

if error_results:
    print("\nERROR CASES:")
    for r in error_results:
        print(f"  {r['label']}: {r['status']} — {r.get('error','')[:200]}")
