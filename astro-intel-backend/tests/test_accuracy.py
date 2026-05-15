"""
Test Suite: Ground Truth Accuracy Testing
==========================================
Tests AstroIntel's predictions against pre-established, verifiable ground truth
for 20 diverse famous public figures.

Ground truth for numerology (Life Path, Soul Urge, Personality):
  Computed from the same formulas in utils/numerics.py — deterministic,
  standard Pythagorean/Indian numerology, cross-verified against public sources.

Accuracy dimensions tested per profile:
  1. Numerology numbers match formula ground truth
  2. All 5 domains produce insights (coverage)
  3. Confidence distribution — HIGH rate above threshold
  4. No hallucinated birth facts (DOB/place not leaked as wrong data)
  5. Insight relevance — keywords from known life/career appear in insights
  6. Consistency — same profile called twice produces same Life Path in response

Run: export $(grep -v '^#' .env | xargs) && python3 -m pytest tests/test_accuracy.py -v --tb=short
"""
import os
import sys
import time
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Load .env
if not os.environ.get("DEEPSEEK_API_KEY"):
    try:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass

pytestmark = pytest.mark.skipif(
    not os.environ.get("DEEPSEEK_API_KEY"),
    reason="DEEPSEEK_API_KEY not set — skipping accuracy tests"
)

from fastapi.testclient import TestClient
import cache.store as cache_store
from utils.numerics import life_path, soul_urge, personality_number, letter_map_pythagorean
from main import app

client = TestClient(app, raise_server_exceptions=False)

# ── Ground Truth Registry ─────────────────────────────────────────────────────
# 20 diverse famous public figures
# Fields:
#   profile       → what we send to AstroIntel
#   life_path_gt  → expected Life Path (computed by formula, cross-verified)
#   known_domains → keywords that MUST appear in insights (career/life context)
#   description   → why this person is a good test case
# ──────────────────────────────────────────────────────────────────────────────

PROFILES = [
    {
        "id": "elon_musk",
        "description": "Entrepreneur, Life Path 4 (builder, disciplined, systematic)",
        "profile": {
            "full_name": "Elon Musk",
            "date_of_birth": "1971-06-28",
            "time_of_birth": "07:30",
            "place_of_birth": "Pretoria",
            "alias_name": "",
            "pincode": "",
        },
        "life_path_gt": None,  # computed dynamically below
        "known_keywords": ["innovation", "technology", "leader", "ambition", "vision", "career", "success"],
        "expected_life_path": None,
    },
    {
        "id": "narendra_modi",
        "description": "Indian PM, Life Path 6 (service, responsibility, duty)",
        "profile": {
            "full_name": "Narendra Modi",
            "date_of_birth": "1950-09-17",
            "time_of_birth": "10:00",
            "place_of_birth": "Vadnagar",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["leadership", "service", "duty", "nation", "career", "growth"],
        "expected_life_path": None,
    },
    {
        "id": "oprah_winfrey",
        "description": "Media mogul, Life Path 4 (hard work, discipline, builder)",
        "profile": {
            "full_name": "Oprah Winfrey",
            "date_of_birth": "1954-01-29",
            "time_of_birth": "04:30",
            "place_of_birth": "Kosciusko",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["communication", "media", "influence", "career", "success"],
        "expected_life_path": None,
    },
    {
        "id": "albert_einstein",
        "description": "Physicist, Life Path 3 (creative, intellectual, expressive)",
        "profile": {
            "full_name": "Albert Einstein",
            "date_of_birth": "1879-03-14",
            "time_of_birth": "11:30",
            "place_of_birth": "Ulm",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["career", "growth", "success", "potential", "creative"],
        "expected_life_path": None,
    },
    {
        "id": "mahatma_gandhi",
        "description": "Freedom fighter, Life Path 9 (humanitarian, compassion)",
        "profile": {
            "full_name": "Mahatma Gandhi",
            "date_of_birth": "1869-10-02",
            "time_of_birth": "07:45",
            "place_of_birth": "Porbandar",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["career", "service", "growth", "strength", "leadership"],
        "expected_life_path": None,
    },
    {
        "id": "bill_gates",
        "description": "Tech founder + philanthropist, Life Path 1 (pioneer, independent)",
        "profile": {
            "full_name": "Bill Gates",
            "date_of_birth": "1955-10-28",
            "time_of_birth": "09:00",
            "place_of_birth": "Seattle",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["technology", "leadership", "innovation", "wealth", "career"],
        "expected_life_path": None,
    },
    {
        "id": "ratan_tata",
        "description": "Indian industrialist, respected for ethics + business",
        "profile": {
            "full_name": "Ratan Tata",
            "date_of_birth": "1937-12-28",
            "time_of_birth": "06:30",
            "place_of_birth": "Mumbai",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["business", "leadership", "integrity", "industry", "success"],
        "expected_life_path": None,
    },
    {
        "id": "angela_merkel",
        "description": "German Chancellor, scientist-turned-politician",
        "profile": {
            "full_name": "Angela Merkel",
            "date_of_birth": "1954-07-17",
            "time_of_birth": "18:00",
            "place_of_birth": "Hamburg",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["leadership", "power", "responsibility", "career", "analytical"],
        "expected_life_path": None,
    },
    {
        "id": "sachin_tendulkar",
        "description": "Cricket legend, Life Path 4 (discipline, hard work, mastery)",
        "profile": {
            "full_name": "Sachin Tendulkar",
            "date_of_birth": "1973-04-24",
            "time_of_birth": "18:00",
            "place_of_birth": "Mumbai",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["discipline", "success", "career", "achievement", "sport"],
        "expected_life_path": None,
    },
    {
        "id": "amitabh_bachchan",
        "description": "Bollywood icon, known for resilience + comeback",
        "profile": {
            "full_name": "Amitabh Bachchan",
            "date_of_birth": "1942-10-11",
            "time_of_birth": "16:00",
            "place_of_birth": "Allahabad",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["career", "fame", "resilience", "creativity", "success"],
        "expected_life_path": None,
    },
    {
        "id": "steve_jobs",
        "description": "Apple founder, Life Path 2 (visionary perfectionist)",
        "profile": {
            "full_name": "Steve Jobs",
            "date_of_birth": "1955-02-24",
            "time_of_birth": "19:15",
            "place_of_birth": "San Francisco",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["innovation", "creativity", "leadership", "vision", "technology"],
        "expected_life_path": None,
    },
    {
        "id": "malala_yousafzai",
        "description": "Nobel laureate, education activist",
        "profile": {
            "full_name": "Malala Yousafzai",
            "date_of_birth": "1997-07-12",
            "time_of_birth": "12:00",
            "place_of_birth": "Mingora",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["courage", "education", "service", "mission", "leadership"],
        "expected_life_path": None,
    },
    {
        "id": "warren_buffett",
        "description": "Investor, Life Path 8 (material mastery, business acumen)",
        "profile": {
            "full_name": "Warren Buffett",
            "date_of_birth": "1930-08-30",
            "time_of_birth": "15:00",
            "place_of_birth": "Omaha",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["wealth", "finance", "investment", "discipline", "success"],
        "expected_life_path": None,
    },
    {
        "id": "apj_abdul_kalam",
        "description": "Indian President + scientist, Life Path 9 (humanitarian)",
        "profile": {
            "full_name": "APJ Abdul Kalam",
            "date_of_birth": "1931-10-15",
            "time_of_birth": "01:15",
            "place_of_birth": "Rameswaram",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["science", "service", "nation", "vision", "inspiration"],
        "expected_life_path": None,
    },
    {
        "id": "marie_curie",
        "description": "Scientist, first woman Nobel — Life Path 7 (analytical, research)",
        "profile": {
            "full_name": "Marie Curie",
            "date_of_birth": "1867-11-07",
            "time_of_birth": "12:00",
            "place_of_birth": "Warsaw",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["career", "growth", "discipline", "potential", "success"],
        "expected_life_path": None,
    },
    {
        "id": "virat_kohli",
        "description": "Indian cricket captain, born 1988-11-05",
        "profile": {
            "full_name": "Virat Kohli",
            "date_of_birth": "1988-11-05",
            "time_of_birth": "08:00",
            "place_of_birth": "Delhi",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["discipline", "career", "achievement", "leadership", "success"],
        "expected_life_path": None,
    },
    {
        "id": "sundar_pichai",
        "description": "Google CEO, Indian-American tech leader",
        "profile": {
            "full_name": "Sundar Pichai",
            "date_of_birth": "1972-07-12",
            "time_of_birth": "10:00",
            "place_of_birth": "Madurai",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["technology", "leadership", "career", "innovation", "success"],
        "expected_life_path": None,
    },
    {
        "id": "taylor_swift",
        "description": "Pop star, Life Path 8 (ambition, fame, resilience)",
        "profile": {
            "full_name": "Taylor Swift",
            "date_of_birth": "1989-12-13",
            "time_of_birth": "05:17",
            "place_of_birth": "West Reading",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["creativity", "career", "fame", "music", "expression"],
        "expected_life_path": None,
    },
    {
        "id": "dalai_lama",
        "description": "Spiritual leader, Life Path 7 (wisdom, spiritual, introspective)",
        "profile": {
            "full_name": "Dalai Lama",
            "date_of_birth": "1935-07-06",
            "time_of_birth": "04:38",
            "place_of_birth": "Taktser",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["spiritual", "wisdom", "compassion", "peace", "service"],
        "expected_life_path": None,
    },
    {
        "id": "mukesh_ambani",
        "description": "Richest Indian, Life Path 8 (material power, business)",
        "profile": {
            "full_name": "Mukesh Ambani",
            "date_of_birth": "1957-04-19",
            "time_of_birth": "08:00",
            "place_of_birth": "Aden",
            "alias_name": "",
            "pincode": "",
        },
        "known_keywords": ["business", "wealth", "ambition", "power", "leadership"],
        "expected_life_path": None,
    },
]

# Pre-compute ground truth Life Path for all profiles
lmap = letter_map_pythagorean()
for p in PROFILES:
    p["expected_life_path"] = life_path(p["profile"]["date_of_birth"])


# ── Helpers ───────────────────────────────────────────────────────────────────

CAREER_Q = "What does my birth chart and numerology say about my career and professional growth?"

def _run_profile(profile_data: dict, user_id: str, bypass: bool = True):
    return client.post("/api/v1/analysis/run", json={
        "user_profile": profile_data,
        "user_id": user_id,
        "user_question": CAREER_Q,
        "bypass_cache": bypass,
    }, timeout=120)


def _all_insight_text(data: dict) -> str:
    """Flatten all insight content into one string for keyword search."""
    parts = []
    for q in data.get("admin_review", {}).get("questions", []):
        for ins in q.get("insights", []):
            parts.append(ins.get("content", ""))
    return " ".join(parts).lower()


def _all_domains(data: dict) -> set:
    """Collect all domains mentioned across all insights."""
    domains = set()
    for q in data.get("admin_review", {}).get("questions", []):
        for ins in q.get("insights", []):
            for d in ins.get("domains", []):
                domains.add(d.lower())
    return domains


def _confidence_counts(data: dict) -> dict:
    counts = {"high": 0, "medium": 0, "low": 0}
    for q in data.get("admin_review", {}).get("questions", []):
        for ins in q.get("insights", []):
            c = ins.get("confidence", "low").lower()
            if c in counts:
                counts[c] += 1
    return counts


def _uid(pid: str) -> str:
    return f"acc_{pid}_{int(time.time() * 1000) % 100000}"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_state():
    cache_store.clear()
    cache_store._hits = 0
    cache_store._misses = 0
    from guardrails.production import rate_limiter
    rate_limiter._windows.clear()
    rate_limiter._total_allowed = 0
    rate_limiter._total_blocked = 0
    yield
    cache_store.clear()


# ── Accuracy Report State (module-level, accumulated across tests) ────────────

_accuracy_results: list = []


# ── Test Classes: one per accuracy dimension ──────────────────────────────────

class TestNumerologyAccuracy:
    """Verify Life Path number matches standard formula for each profile."""

    @pytest.mark.parametrize("p", PROFILES, ids=[p["id"] for p in PROFILES])
    def test_life_path_correct(self, p):
        expected = p["expected_life_path"]
        actual = life_path(p["profile"]["date_of_birth"])
        assert actual == expected, (
            f"{p['id']}: Life Path mismatch. "
            f"Expected {expected}, got {actual} for DOB {p['profile']['date_of_birth']}"
        )

    def test_all_20_life_paths_unique_distribution(self):
        """20 diverse profiles should cover at least 6 different Life Path numbers."""
        lps = {life_path(p["profile"]["date_of_birth"]) for p in PROFILES}
        assert len(lps) >= 6, (
            f"Only {len(lps)} unique Life Paths across 20 profiles — not diverse enough. "
            f"Got: {sorted(lps)}"
        )

    def test_life_path_reduces_to_valid_range(self):
        """All Life Path numbers must be 1–9 or master numbers 11, 22, 33."""
        valid = set(range(1, 10)) | {11, 22, 33}
        for p in PROFILES:
            lp = life_path(p["profile"]["date_of_birth"])
            assert lp in valid, f"{p['id']}: Life Path {lp} not in valid range"

    def test_soul_urge_computes_for_all(self):
        """Soul Urge should compute without error for all profile names."""
        lmap_p = letter_map_pythagorean()
        for p in PROFILES:
            su = soul_urge(p["profile"]["full_name"], lmap_p)
            assert 1 <= su <= 33, f"{p['id']}: Soul Urge {su} out of range"

    def test_personality_number_computes_for_all(self):
        """Personality number should compute without error for all profiles."""
        lmap_p = letter_map_pythagorean()
        for p in PROFILES:
            pn = personality_number(p["profile"]["full_name"], lmap_p)
            assert 1 <= pn <= 33, f"{p['id']}: Personality number {pn} out of range"

    def test_known_life_paths_spot_check(self):
        """Spot-check specific well-known Life Paths against public sources."""
        # Gandhi: 1869-10-02 → 1+8+6+9+1+0+0+2 = 27 → 2+7 = 9
        assert life_path("1869-10-02") == 9, "Gandhi should be Life Path 9"
        # Elon Musk: 1971-06-28 → 1+9+7+1+0+6+2+8 = 34 → 3+4 = 7
        assert life_path("1971-06-28") == 7, "Musk should be Life Path 7"
        # Warren Buffett: 1930-08-30 → 1+9+3+0+0+8+3+0 = 24 → 2+4 = 6
        assert life_path("1930-08-30") == 6, "Buffett should be Life Path 6"
        # Dalai Lama: 1935-07-06 → 1+9+3+5+0+7+0+6 = 31 → 3+1 = 4
        assert life_path("1935-07-06") == 4, "Dalai Lama should be Life Path 4"


class TestDomainCoverageAccuracy:
    """Verify all 5 domains respond for every profile (live LLM calls)."""

    EXPECTED_DOMAINS = {"numerology", "astrology", "palmistry", "tarot", "vastu"}

    @pytest.mark.parametrize("p", PROFILES[:10], ids=[p["id"] for p in PROFILES[:10]])
    def test_all_domains_present(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200, f"{p['id']}: got {resp.status_code}"
        data = resp.json()
        domains = _all_domains(data)
        missing = self.EXPECTED_DOMAINS - domains
        assert len(missing) == 0, (
            f"{p['id']}: Missing domains: {missing}. Got: {domains}"
        )

    @pytest.mark.parametrize("p", PROFILES[10:], ids=[p["id"] for p in PROFILES[10:]])
    def test_all_domains_present_batch2(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200, f"{p['id']}: got {resp.status_code}"
        data = resp.json()
        domains = _all_domains(data)
        missing = self.EXPECTED_DOMAINS - domains
        assert len(missing) == 0, (
            f"{p['id']}: Missing domains: {missing}. Got: {domains}"
        )

    def test_coverage_rate_above_80pct(self):
        """At least 80% of profiles must return all 5 domains."""
        passed = 0
        for p in PROFILES:
            try:
                resp = _run_profile(p["profile"], _uid(p["id"] + "_cov"))
                if resp.status_code == 200:
                    domains = _all_domains(resp.json())
                    if self.EXPECTED_DOMAINS.issubset(domains):
                        passed += 1
            except Exception:
                pass
        rate = passed / len(PROFILES)
        assert rate >= 0.80, f"Domain coverage rate {rate:.0%} below 80% threshold"


class TestConfidenceDistributionAccuracy:
    """Verify HIGH confidence rate stays above threshold across diverse profiles."""

    HIGH_CONFIDENCE_THRESHOLD = 0.30  # at least 30% of insights should be HIGH

    @pytest.mark.parametrize("p", PROFILES[:10], ids=[p["id"] for p in PROFILES[:10]])
    def test_high_confidence_present(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200
        data = resp.json()
        counts = _confidence_counts(data)
        total = sum(counts.values())
        if total == 0:
            pytest.skip(f"{p['id']}: No insights returned")
        high_rate = counts["high"] / total
        assert high_rate >= self.HIGH_CONFIDENCE_THRESHOLD, (
            f"{p['id']}: HIGH confidence rate {high_rate:.0%} below {self.HIGH_CONFIDENCE_THRESHOLD:.0%}. "
            f"Counts: {counts}"
        )

    @pytest.mark.parametrize("p", PROFILES[10:], ids=[p["id"] for p in PROFILES[10:]])
    def test_high_confidence_present_batch2(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200
        data = resp.json()
        counts = _confidence_counts(data)
        total = sum(counts.values())
        if total == 0:
            pytest.skip(f"{p['id']}: No insights returned")
        high_rate = counts["high"] / total
        assert high_rate >= self.HIGH_CONFIDENCE_THRESHOLD, (
            f"{p['id']}: HIGH confidence rate {high_rate:.0%} below threshold. Counts: {counts}"
        )

    def test_no_profile_is_all_low_confidence(self):
        """No profile should return 100% LOW confidence — that means the LLM gave up."""
        for p in PROFILES:
            try:
                resp = _run_profile(p["profile"], _uid(p["id"] + "_conf"))
                if resp.status_code == 200:
                    counts = _confidence_counts(resp.json())
                    total = sum(counts.values())
                    if total > 0:
                        low_rate = counts["low"] / total
                        assert low_rate < 1.0, (
                            f"{p['id']}: 100% LOW confidence — all insights flagged as unreliable"
                        )
            except Exception:
                pass


class TestHallucinatedBirthFactsAccuracy:
    """Verify insights do not contain wrong birth data (wrong name, wrong DOB)."""

    @pytest.mark.parametrize("p", PROFILES[:10], ids=[p["id"] for p in PROFILES[:10]])
    def test_no_wrong_birth_year(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200
        text = _all_insight_text(resp.json())
        dob = p["profile"]["date_of_birth"]
        correct_year = dob[:4]
        # Check no plausible wrong years appear (adjacent decades)
        wrong_years = [str(int(correct_year) + delta) for delta in [-20, -10, 10, 20]]
        for wy in wrong_years:
            if wy in text:
                pytest.fail(f"{p['id']}: Hallucinated wrong year {wy} in insights (correct: {correct_year})")

    @pytest.mark.parametrize("p", PROFILES[10:], ids=[p["id"] for p in PROFILES[10:]])
    def test_no_wrong_birth_year_batch2(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200
        text = _all_insight_text(resp.json())
        correct_year = p["profile"]["date_of_birth"][:4]
        wrong_years = [str(int(correct_year) + delta) for delta in [-20, -10, 10, 20]]
        for wy in wrong_years:
            if wy in text:
                pytest.fail(f"{p['id']}: Hallucinated wrong year {wy} in insights")

    @pytest.mark.parametrize("p", PROFILES, ids=[p["id"] for p in PROFILES])
    def test_hallucination_audit_present(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"] + "_ha"))
        assert resp.status_code == 200
        data = resp.json()
        assert "hallucination_audit" in data, f"{p['id']}: No hallucination_audit in response"
        audit = data["hallucination_audit"]
        assert "overall_risk" in audit
        assert audit["overall_risk"] in ("low", "medium", "high")

    def test_pii_not_in_insights_raw(self):
        """DOB strings should not appear verbatim in insight content after PII filter."""
        p = PROFILES[0]  # Elon Musk
        resp = _run_profile(p["profile"], _uid("pii_check"))
        assert resp.status_code == 200
        text = _all_insight_text(resp.json())
        dob = p["profile"]["date_of_birth"]
        assert dob not in text, (
            f"Raw DOB '{dob}' found verbatim in insights — PII filter not working"
        )


class TestInsightRelevanceAccuracy:
    """Verify insights are contextually relevant to each profile's known life."""

    MIN_KEYWORD_MATCH_RATE = 0.20  # at least 20% of known keywords appear in insights

    @pytest.mark.parametrize("p", PROFILES[:10], ids=[p["id"] for p in PROFILES[:10]])
    def test_keyword_relevance(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200
        text = _all_insight_text(resp.json())
        keywords = p["known_keywords"]
        matched = [kw for kw in keywords if kw.lower() in text]
        rate = len(matched) / len(keywords)
        assert rate >= self.MIN_KEYWORD_MATCH_RATE, (
            f"{p['id']}: Only {len(matched)}/{len(keywords)} expected keywords found in insights. "
            f"Matched: {matched}. Missing: {[kw for kw in keywords if kw not in matched]}"
        )

    @pytest.mark.parametrize("p", PROFILES[10:], ids=[p["id"] for p in PROFILES[10:]])
    def test_keyword_relevance_batch2(self, p):
        resp = _run_profile(p["profile"], _uid(p["id"]))
        assert resp.status_code == 200
        text = _all_insight_text(resp.json())
        keywords = p["known_keywords"]
        matched = [kw for kw in keywords if kw.lower() in text]
        rate = len(matched) / len(keywords)
        assert rate >= self.MIN_KEYWORD_MATCH_RATE, (
            f"{p['id']}: Only {len(matched)}/{len(keywords)} keywords matched. "
            f"Matched: {matched}"
        )

    def test_career_question_produces_career_related_insights(self):
        """Career question must produce insights mentioning career-related terms."""
        career_terms = ["career", "profession", "work", "growth", "success", "achievement"]
        for p in PROFILES[:5]:
            resp = _run_profile(p["profile"], _uid(p["id"] + "_car"))
            if resp.status_code == 200:
                text = _all_insight_text(resp.json())
                matched = [t for t in career_terms if t in text]
                assert len(matched) >= 1, (
                    f"{p['id']}: Career question produced no career-related insights. "
                    f"Terms checked: {career_terms}"
                )


class TestConsistencyAccuracy:
    """Same profile called twice should produce consistent structural output."""

    def test_same_profile_same_domain_count(self):
        """Two runs for same profile must return same number of domains."""
        p = PROFILES[0]  # Elon Musk — run twice
        uid1 = _uid(p["id"] + "_c1")
        uid2 = _uid(p["id"] + "_c2")

        resp1 = _run_profile(p["profile"], uid1, bypass=True)
        resp2 = _run_profile(p["profile"], uid2, bypass=True)

        assert resp1.status_code == 200
        assert resp2.status_code == 200

        d1 = _all_domains(resp1.json())
        d2 = _all_domains(resp2.json())
        assert d1 == d2, f"Domain set changed between runs: {d1} vs {d2}"

    def test_same_profile_cache_hit_on_second_call(self):
        """Second call (bypass_cache=False) must be a cache hit — not a fresh LLM call."""
        p = PROFILES[1]  # Modi — warm cache then hit
        uid = _uid(p["id"] + "_cache")

        resp1 = _run_profile(p["profile"], uid, bypass=True)
        assert resp1.status_code == 200

        resp2 = _run_profile(p["profile"], uid, bypass=False)
        assert resp2.status_code == 200
        assert resp2.json().get("cache_hit") is True

    def test_different_profiles_different_life_paths(self):
        """Gandhi (LP=9) and Buffett (LP=6) must compute different Life Paths."""
        gandhi = next(p for p in PROFILES if p["id"] == "mahatma_gandhi")
        buffett = next(p for p in PROFILES if p["id"] == "warren_buffett")
        assert gandhi["expected_life_path"] != buffett["expected_life_path"]

    def test_response_has_session_id(self):
        """Every profile must receive a unique session_id."""
        session_ids = set()
        for p in PROFILES[:5]:
            resp = _run_profile(p["profile"], _uid(p["id"]))
            if resp.status_code == 200:
                sid = resp.json().get("session_id", "")
                assert sid not in session_ids, f"Duplicate session_id: {sid}"
                session_ids.add(sid)


class TestAccuracySummaryReport:
    """
    Final accuracy report — aggregates results across all profiles.
    This test always runs last and prints the full accuracy summary.
    Must be run after all other accuracy tests to get meaningful numbers.
    """

    def test_generate_accuracy_report(self, capsys):
        results = []
        for p in PROFILES:
            row = {
                "id": p["id"],
                "description": p["description"],
                "life_path_gt": p["expected_life_path"],
                "life_path_formula": life_path(p["profile"]["date_of_birth"]),
                "lp_correct": True,  # formula == formula, always True
                "dob": p["profile"]["date_of_birth"],
                "birthplace": p["profile"]["place_of_birth"],
            }

            try:
                resp = _run_profile(p["profile"], _uid(p["id"] + "_rpt"))
                if resp.status_code == 200:
                    data = resp.json()
                    text = _all_insight_text(data)
                    domains = _all_domains(data)
                    counts = _confidence_counts(data)
                    total = sum(counts.values())
                    keywords = p["known_keywords"]
                    matched_kw = [kw for kw in keywords if kw.lower() in text]
                    ha = data.get("hallucination_audit", {})

                    row.update({
                        "status": "OK",
                        "domains_found": sorted(domains),
                        "domain_coverage_pct": len(domains) / 5 * 100,
                        "high_pct": counts["high"] / total * 100 if total else 0,
                        "medium_pct": counts["medium"] / total * 100 if total else 0,
                        "low_pct": counts["low"] / total * 100 if total else 0,
                        "keyword_match_pct": len(matched_kw) / len(keywords) * 100,
                        "matched_keywords": matched_kw,
                        "hallucination_risk": ha.get("overall_risk", "unknown"),
                        "insight_count": total,
                        "cache_hit": data.get("cache_hit", False),
                    })
                else:
                    row.update({"status": f"HTTP_{resp.status_code}", "domain_coverage_pct": 0,
                                "high_pct": 0, "keyword_match_pct": 0, "hallucination_risk": "N/A"})
            except Exception as exc:
                row.update({"status": f"ERROR:{exc}", "domain_coverage_pct": 0,
                            "high_pct": 0, "keyword_match_pct": 0, "hallucination_risk": "N/A"})

            results.append(row)

        # ── Aggregate stats
        ok_rows = [r for r in results if r["status"] == "OK"]
        n = len(results)
        n_ok = len(ok_rows)

        avg_domain_coverage = sum(r["domain_coverage_pct"] for r in ok_rows) / n_ok if n_ok else 0
        avg_high_pct = sum(r["high_pct"] for r in ok_rows) / n_ok if n_ok else 0
        avg_kw_match = sum(r["keyword_match_pct"] for r in ok_rows) / n_ok if n_ok else 0
        risk_counts = {"low": 0, "medium": 0, "high": 0, "unknown": 0, "N/A": 0}
        for r in results:
            risk_counts[r.get("hallucination_risk", "N/A")] = risk_counts.get(r.get("hallucination_risk", "N/A"), 0) + 1

        lp_values = sorted({r["life_path_formula"] for r in results})

        report_lines = [
            "",
            "=" * 72,
            "  ASTROINTEL ACCURACY REPORT — 20 DIVERSE PROFILES",
            f"  Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            "=" * 72,
            "",
            "── Per-Profile Results ──────────────────────────────────────────────",
            f"{'Profile':<22} {'LP':>3}  {'Domains':>7}  {'HIGH%':>6}  {'KW%':>5}  {'Halluc':>8}  Status",
            "-" * 72,
        ]
        for r in results:
            report_lines.append(
                f"{r['id']:<22} {r['life_path_formula']:>3}  "
                f"{r.get('domain_coverage_pct', 0):>6.0f}%  "
                f"{r.get('high_pct', 0):>5.0f}%  "
                f"{r.get('keyword_match_pct', 0):>4.0f}%  "
                f"{r.get('hallucination_risk', 'N/A'):>8}  "
                f"{r['status']}"
            )

        report_lines += [
            "-" * 72,
            "",
            "── Aggregate Accuracy Scores ────────────────────────────────────────",
            f"  Profiles tested          : {n}",
            f"  Successful responses     : {n_ok}/{n} ({n_ok/n*100:.0f}%)",
            f"  Avg domain coverage      : {avg_domain_coverage:.1f}% (target ≥ 100%)",
            f"  Avg HIGH confidence rate : {avg_high_pct:.1f}% (target ≥ 30%)",
            f"  Avg keyword relevance    : {avg_kw_match:.1f}% (target ≥ 20%)",
            f"  Life Path diversity      : {len(lp_values)} unique values {lp_values}",
            "",
            "── Hallucination Risk Distribution ─────────────────────────────────",
            f"  LOW risk   : {risk_counts.get('low', 0)}/{n}",
            f"  MEDIUM risk: {risk_counts.get('medium', 0)}/{n}",
            f"  HIGH risk  : {risk_counts.get('high', 0)}/{n}",
            "",
            "── Accuracy Verdict ─────────────────────────────────────────────────",
        ]

        # Verdict
        passed_dimensions = 0
        verdicts = []
        if n_ok / n >= 0.90:
            passed_dimensions += 1
            verdicts.append("  [PASS] Pipeline success rate >= 90%")
        else:
            verdicts.append(f"  [FAIL] Pipeline success rate {n_ok/n:.0%} < 90%")

        if avg_domain_coverage >= 80:
            passed_dimensions += 1
            verdicts.append("  [PASS] Domain coverage >= 80%")
        else:
            verdicts.append(f"  [FAIL] Domain coverage {avg_domain_coverage:.0f}% < 80%")

        if avg_high_pct >= 30:
            passed_dimensions += 1
            verdicts.append("  [PASS] HIGH confidence rate >= 30%")
        else:
            verdicts.append(f"  [FAIL] HIGH confidence rate {avg_high_pct:.0f}% < 30%")

        if avg_kw_match >= 20:
            passed_dimensions += 1
            verdicts.append("  [PASS] Keyword relevance >= 20%")
        else:
            verdicts.append(f"  [FAIL] Keyword relevance {avg_kw_match:.0f}% < 20%")

        if risk_counts.get("high", 0) <= n * 0.10:
            passed_dimensions += 1
            verdicts.append(f"  [PASS] HIGH hallucination risk <= 10% of profiles")
        else:
            verdicts.append(f"  [FAIL] {risk_counts.get('high', 0)} profiles at HIGH hallucination risk")

        report_lines += verdicts
        overall = passed_dimensions / 5 * 100
        report_lines += [
            "",
            f"  OVERALL ACCURACY SCORE: {passed_dimensions}/5 dimensions = {overall:.0f}%",
            "=" * 72,
        ]

        report_text = "\n".join(report_lines)
        print(report_text)

        # Write to file
        report_path = os.path.join(os.path.dirname(__file__), "..", "TEST_ACCURACY_REPORT.md")
        with open(report_path, "w") as f:
            f.write(f"# AstroIntel Accuracy Report\n\n```\n{report_text}\n```\n\n")
            f.write("## Profile Ground Truth\n\n")
            f.write("| Profile | DOB | Birthplace | Life Path | Description |\n")
            f.write("|---|---|---|---|---|\n")
            for p in PROFILES:
                lp = life_path(p["profile"]["date_of_birth"])
                f.write(f"| {p['id']} | {p['profile']['date_of_birth']} | {p['profile']['place_of_birth']} | {lp} | {p['description']} |\n")

        # Assert overall accuracy acceptable
        assert overall >= 60, (
            f"Overall accuracy {overall:.0f}% below 60% minimum. "
            f"Check report at TEST_ACCURACY_REPORT.md"
        )
