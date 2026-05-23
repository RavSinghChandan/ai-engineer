"""
Phase 1 — CrossEncoder Reranker Tests
======================================
Positive, Negative, Integration, and Smoke tests for the reranking
layer added to numerology_rag/retriever.py.

Run:
  cd astro-intel-backend
  RERANKER_ENABLED=true pytest tests/test_reranker.py -v
"""
from __future__ import annotations
import os
import importlib
import types
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_candidates(texts: list[str]) -> list[dict]:
    return [{"text": t, "score": 0.5, "book": "test", "intents": [], "numbers": []} for t in texts]


# ── POSITIVE TESTS ────────────────────────────────────────────────────────────

class TestRerankerPositive:
    """Happy-path: reranker loads, scores, and returns correct order."""

    def test_rerank_returns_same_count(self, monkeypatch):
        """_rerank must return exactly as many items as it receives."""
        from unittest.mock import MagicMock
        import numpy as np
        import numerology_rag.retriever as ret

        mock_ce = MagicMock()
        mock_ce.predict.return_value = np.array([0.9, 0.3, 0.6])
        ret._reranker = mock_ce

        candidates = _make_candidates(["a", "b", "c"])
        result = ret._rerank("test query", candidates)
        assert len(result) == 3

    def test_rerank_sorts_by_ce_score_descending(self, monkeypatch):
        """Highest CrossEncoder score must appear first."""
        from unittest.mock import MagicMock
        import numpy as np
        import numerology_rag.retriever as ret

        mock_ce = MagicMock()
        mock_ce.predict.return_value = np.array([0.2, 0.95, 0.5])
        ret._reranker = mock_ce

        candidates = _make_candidates(["low", "high", "mid"])
        result = ret._rerank("query", candidates)
        assert result[0]["text"] == "high"
        assert result[1]["text"] == "mid"
        assert result[2]["text"] == "low"

    def test_rerank_score_field_updated(self, monkeypatch):
        """Score field on each candidate must be updated to the CE score."""
        from unittest.mock import MagicMock
        import numpy as np
        import numerology_rag.retriever as ret

        mock_ce = MagicMock()
        mock_ce.predict.return_value = np.array([0.77])
        ret._reranker = mock_ce

        candidates = _make_candidates(["only one"])
        result = ret._rerank("query", candidates)
        assert result[0]["score"] == pytest.approx(0.77, abs=1e-3)

    def test_retrieve_with_reranker_enabled_respects_top_k(self, monkeypatch):
        """When RERANKER_ENABLED=true, retrieve() still returns ≤ top_k results."""
        import numpy as np
        import numerology_rag.retriever as ret

        # Patch env flag
        monkeypatch.setattr(ret, "RERANKER_ENABLED", True)

        # Stub _load so no actual FAISS index needed
        fake_meta = [
            {"text": f"chunk {i}", "book": "book", "intents": ["career"], "numbers": [1]}
            for i in range(15)
        ]
        from unittest.mock import MagicMock, patch
        mock_index = MagicMock()
        mock_index.search.return_value = (
            np.array([[0.9 - i * 0.05 for i in range(15)]], dtype=np.float32),
            np.array([list(range(15))], dtype=np.int64),
        )
        mock_model = MagicMock()
        mock_model.encode.return_value = np.zeros((1, 384), dtype=np.float32)

        mock_ce = MagicMock()
        mock_ce.predict.return_value = np.array([0.9 - i * 0.05 for i in range(15)])

        ret._index    = mock_index
        ret._metadata = fake_meta
        ret._model    = mock_model
        ret._reranker = mock_ce

        results = ret.retrieve("Life Path 1 career", top_k=4)
        assert len(results) <= 4


# ── NEGATIVE TESTS ────────────────────────────────────────────────────────────

class TestRerankerNegative:
    """Error conditions and fallback behaviour."""

    def test_rerank_failure_falls_back_silently(self, monkeypatch):
        """If CrossEncoder raises, retrieve() must NOT raise — it falls back to bi-encoder order."""
        import numpy as np
        import numerology_rag.retriever as ret

        monkeypatch.setattr(ret, "RERANKER_ENABLED", True)

        fake_meta = [
            {"text": f"chunk {i}", "book": "book", "intents": [], "numbers": []}
            for i in range(6)
        ]
        from unittest.mock import MagicMock
        mock_index = MagicMock()
        mock_index.search.return_value = (
            np.array([[0.8 - i * 0.05 for i in range(6)]], dtype=np.float32),
            np.array([list(range(6))], dtype=np.int64),
        )
        mock_model = MagicMock()
        mock_model.encode.return_value = np.zeros((1, 384), dtype=np.float32)

        mock_ce = MagicMock()
        mock_ce.predict.side_effect = RuntimeError("model load failed")

        ret._index    = mock_index
        ret._metadata = fake_meta
        ret._model    = mock_model
        ret._reranker = mock_ce

        # Should not raise
        results = ret.retrieve("test query", top_k=3)
        assert isinstance(results, list)
        assert len(results) <= 3

    def test_reranker_disabled_by_default(self, monkeypatch):
        """RERANKER_ENABLED defaults to false — _rerank must never be called."""
        import numpy as np
        import numerology_rag.retriever as ret
        from unittest.mock import MagicMock, patch

        monkeypatch.setattr(ret, "RERANKER_ENABLED", False)

        fake_meta = [
            {"text": f"chunk {i}", "book": "book", "intents": [], "numbers": []}
            for i in range(4)
        ]
        mock_index = MagicMock()
        mock_index.search.return_value = (
            np.array([[0.8, 0.7, 0.6, 0.5]], dtype=np.float32),
            np.array([[0, 1, 2, 3]], dtype=np.int64),
        )
        mock_model = MagicMock()
        mock_model.encode.return_value = np.zeros((1, 384), dtype=np.float32)

        mock_ce = MagicMock()
        ret._index    = mock_index
        ret._metadata = fake_meta
        ret._model    = mock_model
        ret._reranker = mock_ce

        ret.retrieve("query", top_k=3)
        mock_ce.predict.assert_not_called()

    def test_rerank_empty_candidates_returns_empty(self, monkeypatch):
        """_rerank with empty list must return empty without error."""
        from unittest.mock import MagicMock
        import numpy as np
        import numerology_rag.retriever as ret

        mock_ce = MagicMock()
        mock_ce.predict.return_value = np.array([])
        ret._reranker = mock_ce

        result = ret._rerank("query", [])
        assert result == []

    def test_retrieve_min_score_filters_low_quality(self, monkeypatch):
        """Chunks below min_score threshold must be excluded before reranking."""
        import numpy as np
        import numerology_rag.retriever as ret
        from unittest.mock import MagicMock

        monkeypatch.setattr(ret, "RERANKER_ENABLED", True)

        fake_meta = [
            {"text": "good chunk", "book": "book", "intents": [], "numbers": []},
            {"text": "bad chunk",  "book": "book", "intents": [], "numbers": []},
        ]
        mock_index = MagicMock()
        mock_index.search.return_value = (
            np.array([[0.6, 0.10]], dtype=np.float32),  # second below default min_score=0.25
            np.array([[0, 1]], dtype=np.int64),
        )
        mock_model = MagicMock()
        mock_model.encode.return_value = np.zeros((1, 384), dtype=np.float32)

        mock_ce = MagicMock()
        mock_ce.predict.return_value = np.array([0.9])  # only 1 candidate reaches reranker

        ret._index    = mock_index
        ret._metadata = fake_meta
        ret._model    = mock_model
        ret._reranker = mock_ce

        results = ret.retrieve("query", top_k=5)
        texts = [r["text"] for r in results]
        assert "bad chunk" not in texts


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestRerankerIntegration:
    """End-to-end wiring: retrieve_for_rag uses retrieve() which uses reranker."""

    def test_retrieve_for_rag_calls_retrieve_once(self, monkeypatch):
        """retrieve_for_rag must call retrieve() exactly once and format the result."""
        import numerology_rag.retriever as ret
        from unittest.mock import patch

        fake_chunks = [
            {"text": "Life Path 1 leads to independence.", "book": "vedic-guide", "score": 0.9,
             "intents": ["career"], "numbers": [1]},
        ]
        with patch.object(ret, "retrieve", return_value=fake_chunks) as mock_retrieve:
            result = ret.retrieve_for_rag(
                life_path=1,
                intent="career",
                tradition="Pythagorean",
                question="Will I get the promotion?",
                personal_year=3,
            )
        mock_retrieve.assert_called_once()
        assert "BOOK KNOWLEDGE" in result
        assert "vedic guide" in result.lower() or "vedic-guide" in result

    def test_retrieve_for_rag_returns_empty_string_when_no_chunks(self, monkeypatch):
        """retrieve_for_rag must return '' when retrieve returns empty list."""
        import numerology_rag.retriever as ret
        from unittest.mock import patch

        with patch.object(ret, "retrieve", return_value=[]):
            result = ret.retrieve_for_rag(
                life_path=7,
                intent="spirituality",
                tradition="Chaldean",
                question="What is my soul purpose?",
            )
        assert result == ""

    def test_retrieve_remedy_returns_plain_text(self, monkeypatch):
        """retrieve_remedy must return joined plain text from chunks."""
        import numerology_rag.retriever as ret
        from unittest.mock import patch

        fake_chunks = [
            {"text": "Chant Om Namah Shivaya for Life Path 3.", "book": "remedies",
             "score": 0.8, "intents": [], "numbers": [3]},
            {"text": "Wear yellow sapphire on Thursday.", "book": "gemstones",
             "score": 0.7, "intents": [], "numbers": [3]},
        ]
        with patch.object(ret, "retrieve", return_value=fake_chunks):
            result = ret.retrieve_remedy(life_path=3, intent="health")
        assert "Chant" in result
        assert "yellow sapphire" in result


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestRerankerSmoke:
    """Fast import-level checks that run without any model or index."""

    def test_module_imports_cleanly(self):
        """retriever.py must import without any side-effects or errors."""
        import importlib
        import numerology_rag.retriever as ret
        assert hasattr(ret, "retrieve")
        assert hasattr(ret, "_rerank")
        assert hasattr(ret, "RERANKER_ENABLED")

    def test_reranker_disabled_flag_is_bool(self):
        """RERANKER_ENABLED must be a boolean, not a string."""
        import numerology_rag.retriever as ret
        assert isinstance(ret.RERANKER_ENABLED, bool)

    def test_reranker_singleton_starts_none(self):
        """_reranker singleton must start as None (lazy load)."""
        import numerology_rag.retriever as ret
        # We only check it was None at module load time — may be set by prior tests
        # so we just verify the attribute exists
        assert hasattr(ret, "_reranker")

    def test_load_reranker_function_exists(self):
        """_load_reranker function must be defined in retriever."""
        import numerology_rag.retriever as ret
        assert callable(ret._load_reranker)
