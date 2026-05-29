"""
Role Mapping Agent — upgraded with:
  - Prompt versioning (Module 6)
  - Hybrid retrieval: BM25 + dense + RRF (Module 3)
  - HyDE for better retrieval accuracy (Module 3 — advanced RAG)
  - CRAG quality scoring (Module 3 — corrective RAG)
  - Faithfulness check on LLM output (Module 1)
  - Token tracking via callback (Module 1)
  - Security: audit log (Module 2)
  - Semantic cache: L1 exact + L2 similarity (Module 5)
"""
from __future__ import annotations

import time
import logging

from langchain_community.vectorstores import FAISS
from langchain.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from utils.json_parser import parse_llm_json
from utils.prompts import get_active
from utils.token_tracker import get_tracker
from utils.security import audit_llm_call
from utils.guardrails import validate_role_mapping
from guardrails.hallucination import check_faithfulness
from rag.advanced_retrieval import (
    hybrid_retrieve,
    crag_retrieve,
    generate_hypothetical_doc,
)
from cache.semantic_cache import l1_get, l1_set

logger = logging.getLogger("bench.role_mapper")


def _build_retrieval_query(target_role: str, llm: ChatOpenAI, use_hyde: bool, request_id: str) -> str:
    """Return the query to use for retrieval — HyDE hypothetical doc or raw role title."""
    if not use_hyde:
        return target_role
    try:
        hypothetical = generate_hypothetical_doc(target_role, llm)
        logger.debug('{"event":"hyde_generated","request_id":"%s"}', request_id)
        return hypothetical
    except Exception as e:
        logger.warning('{"event":"hyde_failed","error":"%s"}', str(e)[:80])
        return target_role


def _retrieve_context(retrieval_query: str, target_role: str, vector_store: FAISS, use_hybrid: bool):
    """Run hybrid or CRAG retrieval. Returns (role_context, role_metadata)."""
    if use_hybrid:
        docs = hybrid_retrieve(retrieval_query, vector_store, top_n=2)
        role_context = "\n\n".join(d.page_content for d in docs) if docs else ""
        role_metadata = docs[0].metadata if docs else {}
    else:
        docs, _crag_score, _crag_quality = crag_retrieve(retrieval_query, vector_store, k=1)
        role_context = docs[0].page_content if docs else ""
        role_metadata = docs[0].metadata if docs else {}

    if not role_context:
        role_context = f"Role: {target_role}\nRequired skills: Not found in knowledge base."
    return role_context, role_metadata


def map_role(
    parsed_cv: dict,
    target_role: str,
    vector_store: FAISS,
    llm: ChatOpenAI,
    request_id: str = "",
    use_hyde: bool = True,
    use_hybrid: bool = True,
) -> dict:
    """
    Full production role mapping pipeline:
      1. L1 cache check (exact match)
      2. HyDE: generate hypothetical doc for better retrieval
      3. Hybrid search: BM25 + dense + RRF
      4. CRAG: score retrieval quality, fallback if poor
      5. LLM call (prompt v2) with token tracking
      6. Faithfulness check on output
      7. Audit log + cache write
    """
    t0 = time.time()

    # ── L1 exact cache ────────────────────────────────────────────────────────
    cache_key = f"{target_role}|{','.join(sorted(parsed_cv.get('skills', [])))}"
    cached = l1_get("map_role", cache_key)
    if cached:
        logger.debug('{"event":"cache_hit","op":"map_role","request_id":"%s"}', request_id)
        return {**cached, "_cache_hit": True}

    candidate_skills = ", ".join(parsed_cv.get("skills", []))
    experience_years = parsed_cv.get("experience_years", 0)

    # ── HyDE + retrieval ──────────────────────────────────────────────────────
    retrieval_query = _build_retrieval_query(target_role, llm, use_hyde, request_id)
    role_context, role_metadata = _retrieve_context(retrieval_query, target_role, vector_store, use_hybrid)

    # ── LLM call with prompt versioning + token tracking ─────────────────────
    prompt_def = get_active("role_mapper")
    tracker = get_tracker()

    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_def.system),
        ("human", prompt_def.user),
    ])
    bounded = llm.bind(max_tokens=280)
    chain = prompt | bounded

    result = chain.invoke(
        {
            "candidate_skills": candidate_skills,
            "experience_years": experience_years,
            "role_title": target_role,
            "role_context": role_context[:600],
        },
        config={"callbacks": [tracker]},
    )

    latency_ms = (time.time() - t0) * 1000

    # ── Faithfulness check ────────────────────────────────────────────────────
    faith_score, is_faithful, faith_reason = check_faithfulness(
        result.content, role_context, threshold=0.25
    )
    logger.debug(
        '{"event":"faithfulness","score":%.2f,"faithful":%s,"request_id":"%s"}',
        faith_score, is_faithful, request_id,
    )

    # ── Parse + validate ──────────────────────────────────────────────────────
    mapping = parse_llm_json(result.content)
    mapping = validate_role_mapping(mapping)
    mapping["role_metadata"] = role_metadata
    mapping["faithfulness_score"] = round(faith_score, 3)
    mapping["prompt_version"] = f"{prompt_def.name}@{prompt_def.version}"
    mapping["retrieval_method"] = "hybrid+rerank" if use_hybrid else "crag"
    mapping["_retrieved_context"] = role_context  # used by RAGAS evaluator in main.py

    if not is_faithful:
        mapping["_faithfulness_warning"] = faith_reason

    # ── Audit log ─────────────────────────────────────────────────────────────
    usage = tracker.get_usage()
    audit_llm_call(
        request_id=request_id,
        operation=f"role_mapper@{prompt_def.version}",
        input_snippet=f"{target_role}|{candidate_skills[:80]}",
        output_snippet=result.content[:120],
        latency_ms=latency_ms,
        tokens=usage["total_tokens"],
        cost_usd=usage["cost_usd"],
    )

    # ── Cache write ───────────────────────────────────────────────────────────
    l1_set("map_role", cache_key, mapping)

    return mapping
