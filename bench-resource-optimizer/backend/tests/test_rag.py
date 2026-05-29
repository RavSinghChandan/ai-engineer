"""Tests for rag/ modules — knowledge_base, document_store, advanced_retrieval."""
from __future__ import annotations
import json
import numpy as np
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
from langchain.schema import Document


# ── rag/knowledge_base.py ─────────────────────────────────────────────────────

class TestKnowledgeBase:

    SAMPLE_ROLES = [
        {
            "id": "r1", "title": "Python Engineer",
            "description": "Backend Python dev",
            "required_skills": ["Python", "FastAPI"],
            "experience_years": 3,
        },
        {
            "id": "r2", "title": "DevOps Engineer",
            "description": "CI/CD and infra",
            "required_skills": ["Docker", "Kubernetes"],
            "experience_years": 5,
        },
    ]

    def test_build_documents_creates_docs(self):
        from rag.knowledge_base import _build_documents
        docs = _build_documents(self.SAMPLE_ROLES)
        assert len(docs) == 2
        assert "Python Engineer" in docs[0].page_content
        assert docs[0].metadata["role_id"] == "r1"

    def test_build_documents_empty(self):
        from rag.knowledge_base import _build_documents
        assert _build_documents([]) == []

    def test_get_embeddings_returns_object(self):
        from rag.knowledge_base import get_embeddings
        mock_emb = MagicMock()
        with patch("rag.knowledge_base.HuggingFaceEmbeddings", return_value=mock_emb):
            result = get_embeddings()
        assert result is mock_emb

    def test_build_vector_store_loads_from_disk(self, tmp_path):
        from rag.knowledge_base import build_vector_store
        mock_faiss = MagicMock()
        mock_emb = MagicMock()
        with patch("rag.knowledge_base.FAISS_PATH", tmp_path), \
             patch("rag.knowledge_base.FAISS") as MockFAISS:
            tmp_path.mkdir(exist_ok=True)
            MockFAISS.load_local.return_value = mock_faiss
            result = build_vector_store(mock_emb)
        assert result is mock_faiss

    def test_build_vector_store_rebuilds_with_roles(self, tmp_path):
        from rag.knowledge_base import build_vector_store
        mock_faiss_inst = MagicMock()
        mock_emb = MagicMock()
        with patch("rag.knowledge_base.FAISS_PATH", tmp_path / "idx"), \
             patch("rag.knowledge_base.FAISS") as MockFAISS:
            MockFAISS.from_documents.return_value = mock_faiss_inst
            result = build_vector_store(mock_emb, roles=self.SAMPLE_ROLES)
        assert result is mock_faiss_inst
        MockFAISS.from_documents.assert_called_once()

    def test_build_vector_store_force_rebuild_reads_json(self, tmp_path):
        from rag.knowledge_base import build_vector_store
        data_file = tmp_path / "roles.json"
        data_file.write_text(json.dumps({"roles": self.SAMPLE_ROLES}))
        mock_faiss_inst = MagicMock()
        mock_emb = MagicMock()
        with patch("rag.knowledge_base.FAISS_PATH", tmp_path / "idx"), \
             patch("rag.knowledge_base.DATA_PATH", data_file), \
             patch("rag.knowledge_base.FAISS") as MockFAISS:
            MockFAISS.from_documents.return_value = mock_faiss_inst
            result = build_vector_store(mock_emb, force_rebuild=True)
        assert result is mock_faiss_inst

    def test_get_all_roles_reads_json(self, tmp_path):
        from rag import knowledge_base
        data_file = tmp_path / "roles.json"
        data_file.write_text(json.dumps({"roles": self.SAMPLE_ROLES}))
        with patch.object(knowledge_base, "DATA_PATH", data_file):
            roles = knowledge_base.get_all_roles()
        assert len(roles) == 2
        assert roles[0]["title"] == "Python Engineer"

    @pytest.mark.asyncio
    async def test_get_all_roles_async(self):
        from rag.knowledge_base import get_all_roles_async
        with patch("db.get_all_roles_db", new_callable=AsyncMock, return_value=[{"id": "r1"}]):
            roles = await get_all_roles_async()
        assert roles == [{"id": "r1"}]


# ── rag/document_store.py ─────────────────────────────────────────────────────

class TestDocumentStore:

    def test_get_internal_resource_known_skill(self):
        from rag.document_store import get_internal_resource, _resource_registry
        _resource_registry["python"] = {
            "title": "Python Guide", "location": "internal://python", "type": "guide",
            "owner": "HR", "classification": "internal",
        }
        result = get_internal_resource("Python")
        assert result["title"] == "Python Guide"

    def test_get_internal_resource_fallback(self):
        from rag.document_store import get_internal_resource
        result = get_internal_resource("quantum_computing_xyz_unknown")
        assert "internal://" in result["location"]
        assert "Internal Training Material" in result["title"]

    def test_resource_location_for(self):
        from rag.document_store import resource_location_for, _resource_registry
        _resource_registry["docker"] = {
            "title": "Docker Guide", "location": "internal://docker-guide",
            "type": "guide", "owner": "HR", "classification": "internal",
        }
        loc = resource_location_for("docker")
        assert loc == "internal://docker-guide"

    def test_chunk_text_basic(self):
        from rag.document_store import _chunk_text
        text = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
        chunks = _chunk_text(text, max_chars=200, overlap_chars=20)
        assert len(chunks) >= 1
        assert all(isinstance(c, str) for c in chunks)

    def test_chunk_text_empty(self):
        from rag.document_store import _chunk_text
        assert _chunk_text("", max_chars=500) == []

    def test_chunk_text_single_paragraph(self):
        from rag.document_store import _chunk_text
        text = "Only one paragraph here."
        chunks = _chunk_text(text, max_chars=500)
        assert chunks == ["Only one paragraph here."]

    def test_chunk_text_two_large_paragraphs(self):
        from rag.document_store import _chunk_text
        # Two paragraphs, each larger than max_chars — should produce at least 2 chunks
        para = "word " * 300  # ~1500 chars
        text = para + "\n\n" + para
        chunks = _chunk_text(text, max_chars=200, overlap_chars=20)
        assert len(chunks) >= 2

    def test_index_internal_document_creates_new_store(self):
        from rag import document_store as ds
        mock_emb = MagicMock()
        mock_faiss = MagicMock()
        with patch("rag.document_store.FAISS") as MockFAISS, \
             patch("rag.document_store.INTERNAL_INDEX", Path("/tmp/test_internal_idx")):
            MockFAISS.from_documents.return_value = mock_faiss
            mock_faiss.save_local = MagicMock()
            store, chunk_count = ds.index_internal_document(
                doc_id="d1", title="HR Guide",
                text="Python training guide content.\n\nMore content here.",
                skill_tags=["Python"], classification="internal",
                embeddings=mock_emb,
                existing_store=None,
            )
        assert chunk_count >= 1
        assert store is mock_faiss

    def test_index_internal_document_existing_store(self):
        from rag import document_store as ds
        mock_store = MagicMock()
        mock_emb = MagicMock()
        with patch("rag.document_store.INTERNAL_INDEX", Path("/tmp/test_internal_idx2")):
            mock_store.save_local = MagicMock()
            store, chunk_count = ds.index_internal_document(
                doc_id="d2", title="Docker Guide",
                text="Docker containerisation.\n\nKubernetes orchestration.",
                skill_tags=["Docker"], classification="internal",
                embeddings=mock_emb,
                existing_store=mock_store,
            )
        assert chunk_count >= 1
        mock_store.add_documents.assert_called_once()

    def test_index_internal_document_empty_text_raises(self):
        from rag import document_store as ds
        mock_emb = MagicMock()
        with pytest.raises(ValueError, match="no text chunks"):
            ds.index_internal_document(
                doc_id="d3", title="Empty", text="",
                skill_tags=[], classification="internal",
                embeddings=mock_emb,
            )

    def test_load_internal_store_no_index(self, tmp_path):
        from rag import document_store as ds
        mock_emb = MagicMock()
        with patch.object(ds, "INTERNAL_INDEX", tmp_path / "nonexistent"):
            result = ds.load_internal_store(mock_emb)
        assert result is None

    def test_load_internal_store_existing(self, tmp_path):
        from rag import document_store as ds
        idx_path = tmp_path / "idx"
        idx_path.mkdir()
        mock_emb = MagicMock()
        mock_store = MagicMock()
        with patch.object(ds, "INTERNAL_INDEX", idx_path), \
             patch("rag.document_store.FAISS") as MockFAISS:
            MockFAISS.load_local.return_value = mock_store
            result = ds.load_internal_store(mock_emb)
        assert result is mock_store

    def test_load_internal_store_exception_returns_none(self, tmp_path):
        from rag import document_store as ds
        idx_path = tmp_path / "idx"
        idx_path.mkdir()
        mock_emb = MagicMock()
        with patch.object(ds, "INTERNAL_INDEX", idx_path), \
             patch("rag.document_store.FAISS") as MockFAISS:
            MockFAISS.load_local.side_effect = Exception("corrupted index")
            result = ds.load_internal_store(mock_emb)
        assert result is None

    def test_list_indexed_documents_returns_list(self):
        from rag import document_store as ds
        ds._doc_registry.clear()
        ds._doc_registry["d1"] = {"title": "Guide", "chunk_count": 3, "skill_tags": [], "classification": "internal", "uploaded_at": 0.0}
        result = ds.list_indexed_documents()
        assert isinstance(result, list)
        assert result[0]["doc_id"] == "d1"
        assert result[0]["title"] == "Guide"

    def test_get_doc_registry_returns_dict(self):
        from rag import document_store as ds
        ds._doc_registry.clear()
        ds._doc_registry["d1"] = {"chunk_count": 5, "classification": "internal"}
        ds._doc_registry["d2"] = {"chunk_count": 3, "classification": "internal"}
        registry = ds.get_doc_registry()
        assert isinstance(registry, dict)
        assert "d1" in registry
        assert "d2" in registry


# ── rag/advanced_retrieval.py ─────────────────────────────────────────────────

class TestAdvancedRetrieval:

    SAMPLE_DOCS = [
        Document(page_content="Python backend developer with FastAPI experience", metadata={"role_id": "r1", "title": "Python Dev"}),
        Document(page_content="Docker Kubernetes DevOps engineer CI/CD", metadata={"role_id": "r2", "title": "DevOps Eng"}),
        Document(page_content="Machine learning Python TensorFlow PyTorch", metadata={"role_id": "r3", "title": "ML Engineer"}),
    ]

    def test_score_retrieval_relevance_match(self):
        from rag.advanced_retrieval import score_retrieval_relevance
        score = score_retrieval_relevance("python docker", "Python backend developer with Docker experience")
        assert score > 0

    def test_score_retrieval_relevance_no_match(self):
        from rag.advanced_retrieval import score_retrieval_relevance
        score = score_retrieval_relevance("quantum physics", "Python backend developer")
        assert score == 0.0

    def test_score_retrieval_relevance_empty_query(self):
        from rag.advanced_retrieval import score_retrieval_relevance
        score = score_retrieval_relevance("", "Python backend developer")
        assert score == 0.0

    def test_bm25_index_add_and_search(self):
        from rag.advanced_retrieval import BM25Index
        idx = BM25Index()
        idx.add_documents(self.SAMPLE_DOCS)
        results = idx.search("Python developer", k=2)
        assert len(results) <= 2
        # returns list of (int, float) tuples
        assert all(isinstance(r, tuple) and len(r) == 2 for r in results)

    def test_bm25_index_empty_search(self):
        from rag.advanced_retrieval import BM25Index
        idx = BM25Index()
        results = idx.search("anything", k=3)
        assert results == []

    def test_bm25_index_get_document(self):
        from rag.advanced_retrieval import BM25Index
        idx = BM25Index()
        idx.add_documents(self.SAMPLE_DOCS)
        doc = idx.get_document(0)
        assert isinstance(doc, Document)
        assert "Python" in doc.page_content

    def test_init_bm25_from_roles(self):
        from rag.advanced_retrieval import init_bm25_from_roles, get_bm25_index, _bm25_index
        import rag.advanced_retrieval as ar
        ar._bm25_index = None  # reset singleton
        roles = [
            {"id": "r1", "title": "Python Dev", "description": "Backend",
             "required_skills": ["Python"], "experience_years": 2},
        ]
        init_bm25_from_roles(roles)
        idx = get_bm25_index()
        assert idx is not None
        results = idx.search("Python", k=3)
        assert len(results) >= 1

    def test_reciprocal_rank_fusion_merges(self):
        from rag.advanced_retrieval import BM25Index, reciprocal_rank_fusion
        bm25 = BM25Index()
        bm25.add_documents(self.SAMPLE_DOCS)
        sparse_results = [(0, 1.5), (2, 0.8)]
        result = reciprocal_rank_fusion(self.SAMPLE_DOCS[:2], sparse_results, bm25, k=60, top_n=3)
        assert len(result) <= 3
        assert all(isinstance(d, Document) for d in result)

    def test_reciprocal_rank_fusion_empty_sparse(self):
        from rag.advanced_retrieval import BM25Index, reciprocal_rank_fusion
        bm25 = BM25Index()
        result = reciprocal_rank_fusion(self.SAMPLE_DOCS[:2], [], bm25, k=60, top_n=2)
        assert len(result) <= 2

    def test_generate_hypothetical_doc_success(self):
        from rag.advanced_retrieval import generate_hypothetical_doc
        mock_llm = MagicMock()
        mock_response = MagicMock()
        mock_response.content = "  Hypothetical senior Python developer with FastAPI skills  "
        fake_chain = MagicMock()
        fake_chain.invoke.return_value = mock_response
        fake_prompt = MagicMock()
        fake_prompt.__or__ = lambda self, other: fake_chain
        with patch("langchain.prompts.ChatPromptTemplate.from_messages", return_value=fake_prompt), \
             patch("prompts.loader.load_system_prompt", return_value="system prompt"):
            result = generate_hypothetical_doc("Python developer", mock_llm)
        assert len(result) > 0

    def test_crag_retrieve_high_quality(self):
        from rag.advanced_retrieval import crag_retrieve
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = [
            Document(page_content="Python FastAPI developer backend", metadata={})
        ]
        docs, score, label = crag_retrieve("Python FastAPI", mock_store, fallback_context="", k=3)
        assert isinstance(docs, list)
        assert isinstance(score, float)
        assert label in ("HIGH", "AMBIGUOUS", "POOR")

    def test_crag_retrieve_empty_docs(self):
        from rag.advanced_retrieval import crag_retrieve
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = []
        docs, score, label = crag_retrieve("anything", mock_store)
        assert docs == []
        assert score == 0.0
        assert label == "POOR"

    def test_crag_retrieve_poor_with_fallback(self):
        from rag.advanced_retrieval import crag_retrieve
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = [
            Document(page_content="xyzzy unrelated content abc", metadata={})
        ]
        docs, score, label = crag_retrieve("python fastapi kubernetes docker", mock_store, fallback_context="fallback text")
        assert isinstance(docs, list)

    def test_cross_encoder_reranker_fallback_no_model(self):
        from rag.advanced_retrieval import CrossEncoderReranker
        reranker = CrossEncoderReranker()
        # Force model load to raise
        with patch.object(reranker, "_get_model", side_effect=Exception("no model")):
            results = reranker.rerank("Python developer", self.SAMPLE_DOCS, top_n=2)
        assert len(results) <= 2
        assert all(isinstance(d, Document) for d in results)

    def test_cross_encoder_reranker_empty_docs(self):
        from rag.advanced_retrieval import CrossEncoderReranker
        reranker = CrossEncoderReranker()
        results = reranker.rerank("Python developer", [], top_n=2)
        assert results == []

    def test_cross_encoder_reranker_with_mock_model(self):
        from rag.advanced_retrieval import CrossEncoderReranker
        reranker = CrossEncoderReranker()
        mock_model = MagicMock()
        mock_model.predict.return_value = [0.9, 0.5, 0.3]
        with patch.object(reranker, "_get_model", return_value=mock_model):
            results = reranker.rerank("Python developer", self.SAMPLE_DOCS, top_n=2)
        assert len(results) == 2

    def test_mmr_filter_returns_diverse_docs(self):
        from rag.advanced_retrieval import mmr_filter
        query_emb = np.random.rand(384).astype(np.float32)
        doc_embs = np.random.rand(3, 384).astype(np.float32)
        results = mmr_filter(query_emb, self.SAMPLE_DOCS, doc_embs, top_n=2)
        assert len(results) == 2
        assert all(isinstance(d, Document) for d in results)

    def test_mmr_filter_fewer_docs_than_top_n(self):
        from rag.advanced_retrieval import mmr_filter
        query_emb = np.random.rand(384).astype(np.float32)
        doc_embs = np.random.rand(2, 384).astype(np.float32)
        results = mmr_filter(query_emb, self.SAMPLE_DOCS[:2], doc_embs, top_n=5)
        assert len(results) == 2

    def test_get_bm25_index_singleton(self):
        from rag.advanced_retrieval import get_bm25_index
        import rag.advanced_retrieval as ar
        ar._bm25_index = None
        idx1 = get_bm25_index()
        idx2 = get_bm25_index()
        assert idx1 is idx2

    def test_get_reranker_singleton(self):
        from rag.advanced_retrieval import get_reranker
        import rag.advanced_retrieval as ar
        ar._reranker = None
        r1 = get_reranker()
        r2 = get_reranker()
        assert r1 is r2

    def test_hybrid_retrieve_no_bm25_results(self):
        from rag import advanced_retrieval as ar
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = [self.SAMPLE_DOCS[0], self.SAMPLE_DOCS[1]]
        mock_bm25 = MagicMock()
        mock_bm25.search.return_value = []
        with patch.object(ar, "_bm25_index", mock_bm25), \
             patch("rag.advanced_retrieval.get_reranker") as mock_gr, \
             patch("rag.advanced_retrieval._get_bi_encoder") as mock_be:
            mock_gr.return_value.rerank.return_value = [self.SAMPLE_DOCS[0]]
            mock_be.side_effect = Exception("no encoder")
            results = ar.hybrid_retrieve("Python developer", mock_store, top_n=1, use_reranker=True, use_mmr=True)
        assert isinstance(results, list)

    def test_hybrid_retrieve_with_sparse_results(self):
        from rag import advanced_retrieval as ar
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = [self.SAMPLE_DOCS[0]]
        mock_bm25 = MagicMock()
        mock_bm25.search.return_value = [(0, 1.5)]
        mock_bm25.get_document.return_value = self.SAMPLE_DOCS[1]
        with patch.object(ar, "_bm25_index", mock_bm25), \
             patch("rag.advanced_retrieval.get_reranker") as mock_gr, \
             patch("rag.advanced_retrieval._get_bi_encoder") as mock_be:
            mock_gr.return_value.rerank.return_value = [self.SAMPLE_DOCS[0]]
            mock_be.side_effect = Exception("no encoder")
            results = ar.hybrid_retrieve("Python developer", mock_store, top_n=1, use_reranker=False, use_mmr=False)
        assert isinstance(results, list)
