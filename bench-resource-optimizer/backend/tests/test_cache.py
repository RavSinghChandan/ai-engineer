"""
Tests for semantic cache L1 (exact hash) and L2 (cosine similarity).
No LLM calls — pure in-memory cache logic.
"""
from __future__ import annotations

import time
import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# L1 exact-hash cache
# ═══════════════════════════════════════════════════════════════════════════════

class TestL1Cache:

    def _fresh_cache(self):
        """Import cache module and clear its internal stores for test isolation."""
        import cache.semantic_cache as sc
        sc._l1_store.clear()
        sc._l2_store.clear()
        return sc

    def test_positive_set_and_get_returns_value(self):
        sc = self._fresh_cache()
        sc.l1_set("op", "key_input", {"result": 42})
        result = sc.l1_get("op", "key_input")
        assert result is not None
        assert result["result"] == 42

    def test_negative_cache_miss_returns_none(self):
        sc = self._fresh_cache()
        result = sc.l1_get("op", "nonexistent_key")
        assert result is None

    def test_negative_different_op_is_miss(self):
        sc = self._fresh_cache()
        sc.l1_set("op_a", "same_input", {"data": 1})
        result = sc.l1_get("op_b", "same_input")
        assert result is None

    def test_positive_same_key_overwritten(self):
        sc = self._fresh_cache()
        sc.l1_set("op", "k", {"v": 1})
        sc.l1_set("op", "k", {"v": 2})
        result = sc.l1_get("op", "k")
        assert result["v"] == 2

    def test_positive_multiple_keys_independent(self):
        sc = self._fresh_cache()
        sc.l1_set("op", "k1", {"x": 1})
        sc.l1_set("op", "k2", {"x": 2})
        assert sc.l1_get("op", "k1")["x"] == 1
        assert sc.l1_get("op", "k2")["x"] == 2


# ═══════════════════════════════════════════════════════════════════════════════
# Cache stats
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheStats:

    def test_stats_has_required_keys(self):
        from cache.semantic_cache import cache_stats
        stats = cache_stats()
        assert "l1_entries" in stats
        assert "l2_entries" in stats

    def test_stats_l1_count_increases(self):
        import cache.semantic_cache as sc
        sc._l1_store.clear()
        before = sc.cache_stats()["l1_entries"]
        sc.l1_set("op", "new_key_xyz", {"v": 99})
        after = sc.cache_stats()["l1_entries"]
        assert after == before + 1
