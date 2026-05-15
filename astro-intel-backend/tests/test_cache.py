"""
Test Suite: Cache Layer (cache/store.py)
Covers: key generation, deduplication, TTL expiry, eviction, stats, entries API.
"""
import time
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import cache.store as cache


PROFILE_A = {
    "full_name": "Varun Sharma",
    "date_of_birth": "1990-05-15",
    "time_of_birth": "10:30",
    "place_of_birth": "Delhi",
}

PROFILE_B = {
    "full_name": "Priya Singh",
    "date_of_birth": "1985-08-22",
    "time_of_birth": "07:00",
    "place_of_birth": "Mumbai",
}


@pytest.fixture(autouse=True)
def clear_cache():
    """Reset cache and hit counters before every test."""
    cache.clear()
    cache._hits = 0
    cache._misses = 0
    yield
    cache.clear()


# ── Key generation ────────────────────────────────────────────────────────────

class TestMakeProfileKey:
    def test_same_profile_same_key(self):
        k1 = cache.make_profile_key(PROFILE_A)
        k2 = cache.make_profile_key(PROFILE_A)
        assert k1 == k2

    def test_different_profile_different_key(self):
        k1 = cache.make_profile_key(PROFILE_A)
        k2 = cache.make_profile_key(PROFILE_B)
        assert k1 != k2

    def test_key_starts_with_profile_prefix(self):
        k = cache.make_profile_key(PROFILE_A)
        assert k.startswith("profile__")

    def test_name_slug_embedded_in_key(self):
        k = cache.make_profile_key(PROFILE_A)
        assert "varun" in k

    def test_missing_optional_fields_still_works(self):
        sparse = {"full_name": "Test User", "date_of_birth": "2000-01-01"}
        k = cache.make_profile_key(sparse)
        assert k.startswith("profile__")

    def test_whitespace_normalized(self):
        p1 = {**PROFILE_A, "full_name": "  Varun  Sharma  "}
        p2 = {**PROFILE_A, "full_name": "Varun Sharma"}
        assert cache.make_profile_key(p1) == cache.make_profile_key(p2)


class TestMakeKey:
    def test_user_id_excluded_same_key(self):
        """CORE FIX: same person with different user_id must produce same key."""
        k1 = cache.make_key("", [], "career question", PROFILE_A)
        k2 = cache.make_key("varun123", [], "career question", PROFILE_A)
        k3 = cache.make_key("anonymous", [], "career question", PROFILE_A)
        assert k1 == k2 == k3

    def test_different_questions_different_key(self):
        k1 = cache.make_key("", [], "career question", PROFILE_A)
        k2 = cache.make_key("", [], "health question", PROFILE_A)
        assert k1 != k2

    def test_different_profile_different_key(self):
        k1 = cache.make_key("", [], "career question", PROFILE_A)
        k2 = cache.make_key("", [], "career question", PROFILE_B)
        assert k1 != k2

    def test_question_order_doesnt_matter(self):
        k1 = cache.make_key("", ["q1", "q2"], "", PROFILE_A)
        k2 = cache.make_key("", ["q2", "q1"], "", PROFILE_A)
        assert k1 == k2

    def test_key_starts_with_session_prefix(self):
        k = cache.make_key("", [], "test", PROFILE_A)
        assert k.startswith("session__")

    def test_no_user_id_in_key_string(self):
        k = cache.make_key("secretuid", [], "test", PROFILE_A)
        assert "secretuid" not in k
        assert "anonymous" not in k


# ── Set / Get ─────────────────────────────────────────────────────────────────

class TestSetGet:
    def test_basic_set_and_get(self):
        cache.set("mykey", {"data": "hello"})
        result = cache.get("mykey")
        assert result == {"data": "hello"}

    def test_cache_miss_returns_none(self):
        result = cache.get("nonexistent_key_xyz")
        assert result is None

    def test_set_does_not_overwrite_valid_entry(self):
        """CORE FIX: second write to same key should be silently ignored."""
        cache.set("dupkey", {"version": 1})
        cache.set("dupkey", {"version": 2})
        result = cache.get("dupkey")
        assert result["version"] == 1  # first write wins

    def test_set_overwrites_expired_entry(self):
        cache.set("expkey", {"version": 1}, ttl=1)
        time.sleep(1.1)
        cache.set("expkey", {"version": 2}, ttl=60)
        result = cache.get("expkey")
        assert result["version"] == 2

    def test_get_expired_entry_returns_none(self):
        cache.set("ttlkey", {"data": "x"}, ttl=1)
        time.sleep(1.1)
        result = cache.get("ttlkey")
        assert result is None

    def test_hit_count_increments_on_get(self):
        cache.set("hitkey", {"v": 1})
        cache.get("hitkey")
        cache.get("hitkey")
        entries = {e["key"]: e for e in cache.entries()}
        assert entries["hitkey"]["hit_count"] == 2

    def test_meta_stored_correctly(self):
        cache.set("metakey", {}, meta={"user_name": "Varun", "key_type": "profile"})
        entries = {e["key"]: e for e in cache.entries()}
        assert entries["metakey"]["user_name"] == "Varun"
        assert entries["metakey"]["key_type"] == "profile"


# ── Deduplication end-to-end ──────────────────────────────────────────────────

class TestDeduplication:
    def test_same_user_two_visits_one_cache_entry(self):
        """Simulate user hitting /run twice with different user_id values."""
        profile = PROFILE_A
        question = "What is my career path?"

        key1 = cache.make_key("", [], question, profile)
        key2 = cache.make_key("varun_session_42", [], question, profile)

        assert key1 == key2  # same key

        cache.set(key1, {"result": "first run"}, meta={"user_name": "Varun Sharma"})
        cache.set(key2, {"result": "second run"}, meta={"user_name": "Varun Sharma"})

        assert len(cache.entries()) == 1
        assert cache.get(key1)["result"] == "first run"

    def test_two_different_users_two_entries(self):
        k1 = cache.make_key("", [], "career", PROFILE_A)
        k2 = cache.make_key("", [], "career", PROFILE_B)
        cache.set(k1, {"user": "A"})
        cache.set(k2, {"user": "B"})
        assert len(cache.entries()) == 2

    def test_same_user_different_questions_two_entries(self):
        k1 = cache.make_key("", [], "career question", PROFILE_A)
        k2 = cache.make_key("", [], "health question", PROFILE_A)
        cache.set(k1, {"q": "career"})
        cache.set(k2, {"q": "health"})
        assert len(cache.entries()) == 2


# ── Stats ─────────────────────────────────────────────────────────────────────

class TestStats:
    def test_stats_empty_cache(self):
        s = cache.stats()
        assert s["total_entries"] == 0
        assert s["hits"] == 0
        assert s["misses"] == 0

    def test_stats_after_hit(self):
        cache.set("k", {"v": 1})
        cache.get("k")
        s = cache.stats()
        assert s["hits"] == 1
        assert s["hit_rate_pct"] == 100.0

    def test_stats_after_miss(self):
        cache.get("nonexistent")
        s = cache.stats()
        assert s["misses"] == 1

    def test_stats_hit_rate_calculation(self):
        cache.set("k", {"v": 1})
        cache.get("k")   # hit
        cache.get("nope")  # miss
        s = cache.stats()
        assert s["hits"] == 1
        assert s["misses"] == 1
        assert s["hit_rate_pct"] == 50.0

    def test_profile_ttl_days(self):
        s = cache.stats()
        assert s["profile_ttl_days"] == 30

    def test_session_ttl_minutes(self):
        s = cache.stats()
        assert s["session_ttl_minutes"] == 20


# ── Invalidate and Clear ──────────────────────────────────────────────────────

class TestInvalidateClear:
    def test_invalidate_existing_key(self):
        cache.set("k", {"v": 1})
        removed = cache.invalidate("k")
        assert removed is True
        assert cache.get("k") is None

    def test_invalidate_nonexistent_key(self):
        removed = cache.invalidate("does_not_exist")
        assert removed is False

    def test_clear_returns_count(self):
        cache.set("a", {})
        cache.set("b", {})
        removed = cache.clear()
        assert removed == 2
        assert len(cache.entries()) == 0


# ── Entries API ───────────────────────────────────────────────────────────────

class TestEntries:
    def test_entries_sorted_newest_first(self):
        cache.set("old_key", {"v": 1})
        time.sleep(0.05)
        cache.set("new_key", {"v": 2})
        entries = cache.entries()
        assert entries[0]["key"] == "new_key"
        assert entries[1]["key"] == "old_key"

    def test_entries_contain_required_fields(self):
        cache.set("k", {}, meta={"user_name": "Test", "date_of_birth": "1990-01-01"})
        e = cache.entries()[0]
        for field in ("key", "key_type", "user_name", "date_of_birth", "cached_at",
                      "age_seconds", "expires_in_seconds", "hit_count", "ttl_seconds"):
            assert field in e

    def test_expires_in_decreases_over_time(self):
        cache.set("k", {}, ttl=10)
        e1 = cache.entries()[0]["expires_in_seconds"]
        time.sleep(0.1)
        e2 = cache.entries()[0]["expires_in_seconds"]
        assert e1 >= e2
