"""
Advanced RAG Patterns — Module 3 (Advanced RAG: Self-RAG, CRAG, HyDE)
                         Module 3 (Retrieval Optimization: Hybrid Search, Reranking, MMR)

Implements for bench-resource-optimizer:

  1. HyDE (Hypothetical Document Embeddings)
     Problem: "Java Microservices Developer" query style ≠ role description style
     Solution: LLM generates a hypothetical role description, embed that for retrieval

  2. Corrective RAG (CRAG) — retrieval quality scoring
     After vector retrieval, score relevance. If score < 0.4, inject fallback context.
     Prevents hallucination when the retrieved doc is not actually relevant.

  3. Hybrid Search — BM25 + dense embedding with Reciprocal Rank Fusion
     BM25 catches exact skill names ("RabbitMQ", "NestJS") that embeddings miss
     Dense catches semantic matches ("messaging" → "Kafka/RabbitMQ")
     RRF merges both ranked lists without needing score normalisation

  4. Cross-encoder Reranking
     First pass: fast embedding search → top-20 candidates
     Second pass: cross-encoder scores each (query, doc) pair → reorder → top-5
     Much more accurate than bi-encoder similarity for role-skill alignment

All functions are additive — original map_role still works, these wrap it.
"""
from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from langchain.schema import Document
from langchain_community.vectorstores import FAISS

logger = logging.getLogger("bench.rag")


# ── 1. HyDE — Hypothetical Document Embeddings ───────────────────────────────
# System prompt is now version-controlled via prompts/v1/hyde.txt (Module 6 — prompt versioning).
# Switch version: ACTIVE_VERSIONS["hyde"] in utils/prompts.py — no code deploy needed.

_HYDE_USER_TEMPLATE = (
    "Write a 3-sentence role requirement description for: {role_title}\n"
    "Focus on: required technical skills, experience level, key responsibilities.\n"
    "Write in the style of a job description, not a question. Be specific."
)


def generate_hypothetical_doc(role_title: str, llm) -> str:
    """
    Generate a hypothetical role description to use as retrieval query.
    Answers find answers — hypothetical doc embedding matches real doc style better.
    System prompt loaded from versioned prompt file (prompts/v1/hyde.txt or v2).
    """
    from langchain.prompts import ChatPromptTemplate
    from prompts.loader import load_system_prompt

    hyde_system = load_system_prompt("hyde")
    prompt = ChatPromptTemplate.from_messages([
        ("system", hyde_system),
        ("human",  _HYDE_USER_TEMPLATE),
    ])
    bounded = llm.bind(max_tokens=120)
    chain   = prompt | bounded
    result  = chain.invoke({"role_title": role_title})
    return result.content.strip()


# ── 2. Retrieval Quality Scoring (CRAG) ──────────────────────────────────────

def score_retrieval_relevance(query: str, retrieved_doc: str) -> float:
    """
    Simple lexical relevance score — keyword overlap between query and retrieved doc.
    In production: replace with a cross-encoder relevance model for accuracy.

    Returns: 0.0 (totally irrelevant) to 1.0 (exact match).
    Threshold: > 0.4 = acceptable, < 0.4 = CRAG fallback needed.
    """
    query_tokens  = set(re.sub(r"[^\w\s]", "", query.lower()).split())
    doc_tokens    = set(re.sub(r"[^\w\s]", "", retrieved_doc.lower()).split())
    if not query_tokens or not doc_tokens:
        return 0.0
    overlap = query_tokens & doc_tokens
    return len(overlap) / len(query_tokens)


def crag_retrieve(
    query: str,
    vector_store: FAISS,
    fallback_context: str = "",
    k: int = 3,
) -> Tuple[List[Document], float, str]:
    """
    Corrective RAG retrieval:
      score > 0.5  → HIGH quality, use retrieved docs
      0.25-0.5     → AMBIGUOUS, use retrieved + supplement with fallback
      < 0.25       → POOR, use fallback_context only (web search in production)

    Returns: (docs, quality_score, quality_label)
    """
    docs = vector_store.similarity_search(query, k=k)
    if not docs:
        return [], 0.0, "POOR"

    best_doc_content = docs[0].page_content
    score = score_retrieval_relevance(query, best_doc_content)

    if score >= 0.5:
        quality = "HIGH"
        logger.debug('{"event":"crag","quality":"HIGH","score":%.2f}', score)
        return docs, score, quality
    elif score >= 0.25:
        quality = "AMBIGUOUS"
        logger.debug('{"event":"crag","quality":"AMBIGUOUS","score":%.2f}', score)
        # Supplement with fallback (would be web search in production)
        if fallback_context:
            docs.append(Document(
                page_content=fallback_context,
                metadata={"source": "fallback", "quality": "supplementary"},
            ))
        return docs, score, quality
    else:
        quality = "POOR"
        logger.warning('{"event":"crag","quality":"POOR","score":%.2f,"query":"%s"}', score, query[:60])
        # In production: trigger web search here
        if fallback_context:
            return [Document(page_content=fallback_context, metadata={"source": "fallback"})], score, quality
        return docs, score, quality


# ── 3. BM25 Sparse Retrieval ─────────────────────────────────────────────────

class BM25Index:
    """
    In-memory BM25 index for sparse (keyword) retrieval.
    Complements FAISS dense retrieval in hybrid search.
    k1=1.5, b=0.75 are standard BM25 parameters.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b  = b
        self._docs:     List[str]            = []
        self._metadata: List[Dict[str, Any]] = []
        self._tf:       List[Dict[str, int]] = []
        self._df:       Dict[str, int]       = {}
        self._avgdl:    float                = 0.0

    def _tokenize(self, text: str) -> List[str]:
        return re.sub(r"[^\w\s]", "", text.lower()).split()

    def add_documents(self, docs: List[Document]) -> None:
        for doc in docs:
            tokens = self._tokenize(doc.page_content)
            tf: Dict[str, int] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1
            self._tf.append(tf)
            self._docs.append(doc.page_content)
            self._metadata.append(doc.metadata)
            for t in tf:
                self._df[t] = self._df.get(t, 0) + 1

        total_len  = sum(len(self._tokenize(d)) for d in self._docs)
        self._avgdl = total_len / max(len(self._docs), 1)

    def search(self, query: str, k: int = 5) -> List[Tuple[int, float]]:
        """Return list of (doc_index, bm25_score) sorted descending."""
        if not self._docs:
            return []

        query_terms = self._tokenize(query)
        n = len(self._docs)
        scores: List[float] = []

        for i, tf in enumerate(self._tf):
            dl = sum(tf.values())
            score = 0.0
            for term in query_terms:
                if term not in tf:
                    continue
                df_t = self._df.get(term, 0)
                idf  = math.log((n - df_t + 0.5) / (df_t + 0.5) + 1)
                tf_t = tf[term]
                tf_norm = (tf_t * (self.k1 + 1)) / (
                    tf_t + self.k1 * (1 - self.b + self.b * dl / self._avgdl)
                )
                score += idf * tf_norm
            scores.append(score)

        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        return [(idx, sc) for idx, sc in ranked[:k] if sc > 0]

    def get_document(self, idx: int) -> Document:
        return Document(
            page_content=self._docs[idx],
            metadata=self._metadata[idx],
        )


# ── 4. Reciprocal Rank Fusion (hybrid merge) ─────────────────────────────────

def reciprocal_rank_fusion(
    dense_results: List[Document],
    sparse_results: List[Tuple[int, float]],
    bm25_index: BM25Index,
    k: int = 60,
    top_n: int = 3,
) -> List[Document]:
    """
    Merge dense (embedding) and sparse (BM25) ranked lists using RRF.
    RRF score = Σ 1 / (k + rank_i) for each list the document appears in.
    k=60 is the standard constant from the RRF paper.

    Why RRF over score normalisation: different scoring scales don't matter.
    A document ranked #1 in both lists gets highest combined score regardless
    of whether FAISS scores are 0.95 and BM25 scores are 12.3.
    """
    rrf_scores: Dict[str, float] = {}
    doc_map:    Dict[str, Document] = {}

    # Dense results
    for rank, doc in enumerate(dense_results):
        key = doc.page_content[:80]  # fingerprint
        rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        doc_map[key] = doc

    # Sparse results
    for rank, (idx, _score) in enumerate(sparse_results):
        doc = bm25_index.get_document(idx)
        key = doc.page_content[:80]
        rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        if key not in doc_map:
            doc_map[key] = doc

    merged = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
    return [doc_map[key] for key, _ in merged[:top_n]]


# ── 5. Cross-encoder Reranking ────────────────────────────────────────────────

class CrossEncoderReranker:
    """
    Lightweight cross-encoder reranker using a keyword-overlap heuristic.
    Production replacement: sentence-transformers cross-encoder/ms-marco-MiniLM-L-6-v2
    — drop-in replacement, ~200ms latency, much more accurate.

    Pattern (Module 3):
      Step 1: fast retrieval → top-20 candidates (embedding search)
      Step 2: slow reranking → top-5 (cross-encoder scores each pair)
    """

    def rerank(
        self,
        query: str,
        docs: List[Document],
        top_n: int = 3,
    ) -> List[Document]:
        """
        Score each (query, doc) pair and return top_n most relevant docs.
        Heuristic: skill keyword overlap weighted by position in doc.
        """
        if not docs:
            return []

        query_terms = set(re.sub(r"[^\w\s]", "", query.lower()).split())
        scored: List[Tuple[float, Document]] = []

        for doc in docs:
            # Weight matches by how close to doc start (recency bias)
            content = doc.page_content.lower()
            tokens  = re.sub(r"[^\w\s]", "", content).split()
            score   = 0.0
            for pos, token in enumerate(tokens):
                if token in query_terms:
                    # Earlier position → higher weight
                    score += 1.0 / (1 + pos * 0.01)
            # Normalise by query length
            score = score / max(len(query_terms), 1)
            scored.append((score, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = [doc for _, doc in scored[:top_n]]
        logger.debug(
            '{"event":"reranked","query_terms":%d,"candidates":%d,"selected":%d}',
            len(query_terms), len(docs), len(top),
        )
        return top


# ── Global instances ──────────────────────────────────────────────────────────

_bm25_index:  Optional[BM25Index]         = None
_reranker:    Optional[CrossEncoderReranker] = None


def get_bm25_index() -> BM25Index:
    global _bm25_index
    if _bm25_index is None:
        _bm25_index = BM25Index()
    return _bm25_index


def get_reranker() -> CrossEncoderReranker:
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoderReranker()
    return _reranker


def init_bm25_from_roles(roles: List[dict]) -> None:
    """Build BM25 index from roles knowledge base at startup."""
    from langchain.schema import Document as LCDoc
    bm25 = get_bm25_index()
    docs = []
    for role in roles:
        skills_text = ", ".join(role.get("required_skills", []))
        content = (
            f"Role: {role['title']}\n"
            f"Description: {role.get('description', '')}\n"
            f"Required Skills: {skills_text}\n"
            f"Experience Required: {role.get('experience_years', 0)} years"
        )
        docs.append(LCDoc(
            page_content=content,
            metadata={"role_id": role["id"], "title": role["title"]},
        ))
    bm25.add_documents(docs)
    logger.info('{"event":"bm25_index_built","doc_count":%d}', len(docs))


def hybrid_retrieve(
    query: str,
    vector_store: FAISS,
    top_n: int = 3,
    use_reranker: bool = True,
) -> List[Document]:
    """
    Full hybrid retrieval pipeline:
      1. Dense retrieval (FAISS embedding) → top-10
      2. Sparse retrieval (BM25) → top-10
      3. RRF merge → top-10 combined
      4. Cross-encoder reranker → top-N final

    This is what Module 3 calls 'retrieval optimization for production'.
    """
    bm25 = get_bm25_index()

    # Dense retrieval
    dense_docs = vector_store.similarity_search(query, k=10)

    # Sparse retrieval
    sparse_results = bm25.search(query, k=10)

    if not sparse_results:
        # BM25 not initialised yet — fall back to dense only
        candidates = dense_docs[:top_n * 2]
    else:
        candidates = reciprocal_rank_fusion(dense_docs, sparse_results, bm25, top_n=top_n * 2)

    if use_reranker and len(candidates) > top_n:
        return get_reranker().rerank(query, candidates, top_n=top_n)
    return candidates[:top_n]
