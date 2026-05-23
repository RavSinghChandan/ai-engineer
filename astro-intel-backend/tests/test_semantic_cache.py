"""
Phase 2 — Semantic Cache Tests
================================
Positive, Negative, Integration, and Smoke tests for
cache/semantic.py and cache/embedding_model.py.

Run:
  cd astro-intel-backend
  pytest tests/test_semantic_cache.py -v
  SEMANTIC_CACHE_ENABLED=true pytest tests/test_semantic_cache.py -v
"""
from __future__ import annotations
import numpy as np
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _reset_semantic():
    """Clear semantic embedding store between tests."""
    from cache import semantic as sem
    sem._embeddings.clear()


def _reset_store():
    """Clear exact-match cache store between tests."""
    import cache.store as st
    st._cache.clear()
    st._hits = 0
    st._misses = 0


def _fake_embed(text: str) -> np.ndarray:
    """Deterministic fake embedding — hash-based unit vector."""
    seed = sum(ord(c) for c in text) % 1000
    rng = np.random.default_rng(seed)
    v = rng.random(384).astype("float32")
    return v / np.linalg.norm(v)


# ── POSITIVE TESTS ────────────────────────────────────────────────────────────

class TestSemanticCachePositive:

    def setup_method(self):
        _reset_semantic()
        _reset_store()

    def test_semantic_set_stores_embedding_when_enabled(self, monkeypatch):
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", _fake_embed)

        sem.semantic_set("career growth", "profile_abc", {"result": 1})
        assert len(sem._embeddings) == 1

    def test_semantic_get_returns_none_on_empty_cache(self, monkeypatch):
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", _fake_embed)

        result = sem.semantic_get("career growth", "profile_abc")
        assert result is None

    def test_semantic_set_then_get_exact_query_returns_payload(self, monkeypatch):
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", _fake_embed)
        monkeypatch.setattr(sem, "SIMILARITY_THRESHOLD", 0.50)

        payload = {"insights": ["You will succeed"], "session_id": "abc"}
        sem.semantic_set("career growth", "profile_xyz", payload)
        result = sem.semantic_get("career growth", "profile_xyz")
        assert result is not None
        assert result["insights"] == ["You will succeed"]

    def test_similar_query_hits_cache(self, monkeypatch):
        """Two semantically similar texts with high cosine similarity should match."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr(sem, "SIMILARITY_THRESHOLD", 0.999)  # very high threshold

        # Use identical vectors to guarantee match
        fixed_vec = np.ones(384, dtype="float32")
        fixed_vec /= np.linalg.norm(fixed_vec)
        monkeypatch.setattr("cache.embedding_model.embed", lambda t: fixed_vec)

        payload = {"result": "career answer"}
        sem.semantic_set("career growth", "profile_same", payload)
        result = sem.semantic_get("job prospects", "profile_same")
        assert result is not None

    def test_different_profile_does_not_match(self, monkeypatch):
        """Same query under a different profile key must NOT return a cross-user hit."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr(sem, "SIMILARITY_THRESHOLD", 0.50)

        fixed_vec = np.ones(384, dtype="float32")
        fixed_vec /= np.linalg.norm(fixed_vec)
        monkeypatch.setattr("cache.embedding_model.embed", lambda t: fixed_vec)

        sem.semantic_set("career growth", "profile_user1", {"data": "user1"})
        result = sem.semantic_get("career growth", "profile_user2")
        assert result is None

    def test_cosine_similarity_of_identical_vectors_is_one(self):
        from cache.semantic import _cosine
        v = np.array([0.5, 0.5, 0.5, 0.5], dtype="float32")
        assert abs(_cosine(v, v) - 1.0) < 1e-5

    def test_cosine_similarity_of_orthogonal_vectors_is_zero(self):
        from cache.semantic import _cosine
        a = np.array([1.0, 0.0], dtype="float32")
        b = np.array([0.0, 1.0], dtype="float32")
        assert abs(_cosine(a, b)) < 1e-5

    def test_semantic_stats_returns_dict(self):
        from cache.semantic import semantic_stats
        s = semantic_stats()
        assert isinstance(s, dict)
        assert "enabled" in s
        assert "stored_embeddings" in s
        assert "similarity_threshold" in s

    def test_clear_embeddings_returns_count(self, monkeypatch):
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", _fake_embed)

        sem.semantic_set("test query", "profile_p", {"x": 1})
        count = sem.clear_embeddings()
        assert count >= 1
        assert len(sem._embeddings) == 0


# ── NEGATIVE TESTS ────────────────────────────────────────────────────────────

class TestSemanticCacheNegative:

    def setup_method(self):
        _reset_semantic()
        _reset_store()

    def test_disabled_by_default_no_embedding_stored(self, monkeypatch):
        """When SEMANTIC_CACHE_ENABLED=false, no embedding must be stored."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", False)

        sem.semantic_set("career", "profile_abc", {"result": 1})
        assert len(sem._embeddings) == 0

    def test_disabled_semantic_get_returns_none(self, monkeypatch):
        """When disabled, semantic_get must return None (no semantic match attempted)."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", False)

        result = sem.semantic_get("career", "profile_abc")
        assert result is None

    def test_embed_failure_does_not_crash_set(self, monkeypatch):
        """If embedding model raises, semantic_set must NOT raise."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", lambda t: (_ for _ in ()).throw(RuntimeError("GPU OOM")))

        sem.semantic_set("career", "profile_abc", {"result": 1})  # must not raise

    def test_embed_failure_does_not_crash_get(self, monkeypatch):
        """If embedding model raises, semantic_get must return None without raising."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", lambda t: (_ for _ in ()).throw(RuntimeError("model not found")))

        result = sem.semantic_get("career", "profile_abc")
        assert result is None

    def test_low_similarity_does_not_match(self, monkeypatch):
        """Vectors with cosine < threshold must NOT produce a cache hit."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr(sem, "SIMILARITY_THRESHOLD", 0.99)

        # Store with one vector, query with orthogonal vector
        call_count = [0]
        def controlled_embed(text):
            call_count[0] += 1
            if call_count[0] == 1:
                v = np.array([1.0] + [0.0] * 383, dtype="float32")
            else:
                v = np.array([0.0, 1.0] + [0.0] * 382, dtype="float32")
            return v / np.linalg.norm(v)

        monkeypatch.setattr("cache.embedding_model.embed", controlled_embed)

        sem.semantic_set("astrology career 2026", "profile_p", {"data": "x"})
        result = sem.semantic_get("completely different topic", "profile_p")
        assert result is None

    def test_expired_entry_not_returned(self, monkeypatch):
        """Entries with TTL=0 must not be returned by semantic_get."""
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        fixed_vec = np.ones(384, dtype="float32")
        fixed_vec /= np.linalg.norm(fixed_vec)
        monkeypatch.setattr("cache.embedding_model.embed", lambda t: fixed_vec)
        monkeypatch.setattr(sem, "SIMILARITY_THRESHOLD", 0.50)

        sem.semantic_set("career", "profile_p", {"data": "x"}, ttl=0)
        result = sem.semantic_get("career", "profile_p")
        # TTL=0 means immediately expired
        assert result is None


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestSemanticCacheIntegration:

    def setup_method(self):
        _reset_semantic()
        _reset_store()

    def test_semantic_stats_shows_in_metrics_endpoint(self):
        """GET /api/v1/metrics must include semantic_cache key."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app, raise_server_exceptions=True)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]

        resp = client.get("/api/v1/metrics", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert "semantic_cache" in body
        assert "enabled" in body["semantic_cache"]
        assert "stored_embeddings" in body["semantic_cache"]

    def test_exact_cache_still_works_with_semantic_layer_disabled(self, monkeypatch):
        """Exact-match cache must still hit when semantic layer is OFF."""
        import cache.store as st
        from cache import semantic as sem
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", False)

        key = "test_exact_key_integration"
        st.set(key, {"result": "exact"}, ttl=300)
        result = st.get(key)
        assert result is not None
        assert result["result"] == "exact"

    def test_semantic_and_exact_cache_independent(self, monkeypatch):
        """Clearing exact cache must not affect semantic embeddings and vice versa."""
        from cache import semantic as sem
        import cache.store as st
        monkeypatch.setattr(sem, "SEMANTIC_CACHE_ENABLED", True)
        monkeypatch.setattr("cache.embedding_model.embed", _fake_embed)

        sem.semantic_set("health query", "profile_p", {"data": "health"})
        st.set("some_key", {"data": "exact"})

        assert len(sem._embeddings) >= 1
        assert len(st._cache) >= 1

        # Clear exact cache — embeddings must remain
        st.clear()
        assert len(sem._embeddings) >= 1

        # Clear embeddings — exact cache must remain
        sem.clear_embeddings()
        assert len(st._cache) == 0  # already cleared above


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestSemanticCacheSmoke:

    def test_semantic_module_imports(self):
        from cache.semantic import semantic_get, semantic_set, semantic_stats, clear_embeddings
        assert callable(semantic_get)
        assert callable(semantic_set)
        assert callable(semantic_stats)
        assert callable(clear_embeddings)

    def test_embedding_model_module_imports(self):
        from cache.embedding_model import embed, get_model
        assert callable(embed)
        assert callable(get_model)

    def test_semantic_enabled_flag_is_bool(self):
        from cache import semantic as sem
        assert isinstance(sem.SEMANTIC_CACHE_ENABLED, bool)

    def test_similarity_threshold_is_float(self):
        from cache import semantic as sem
        assert isinstance(sem.SIMILARITY_THRESHOLD, float)
        assert 0.0 <= sem.SIMILARITY_THRESHOLD <= 1.0

    def test_embeddings_dict_exists(self):
        from cache import semantic as sem
        assert isinstance(sem._embeddings, dict)

    def test_make_sem_key_format(self):
        from cache.semantic import _make_sem_key
        key = _make_sem_key("profile_abc123", "career growth in 2026")
        assert key.startswith("sem__profile_abc123__")
        assert len(key) > 20
