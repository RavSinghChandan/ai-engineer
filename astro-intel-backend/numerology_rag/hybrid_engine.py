"""
Numerology Hybrid Engine
========================
Single-call hybrid: retrieves book passages (RAG) then asks the LLM to answer
using BOTH its trained knowledge AND the retrieved book context — in one call.

This replaces the 3-step (RAGless → retrieve → synthesis) approach which cost
~9s per tradition due to two sequential LLM round trips. One call with rich
context achieves the same quality at ~4-5s.

Fallback: static_fallback string if LLM or retrieval fails.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from datetime import date
from typing import Any

# ── Personal Year computation ─────────────────────────────────────────────────

def _personal_year(dob: str, year: int | None = None) -> int:
    from utils.numerics import reduce_number
    try:
        parts = dob.split("-")
        month, day = int(parts[1]), int(parts[2])
        y = year or date.today().year
        return reduce_number(month + day + y)
    except Exception:
        return 9


def _next_personal_year(dob: str) -> tuple[int, int]:
    y = date.today().year
    return _personal_year(dob, y + 1), y + 1


# ── Single-shot system prompt ─────────────────────────────────────────────────

_EXPERT_SYSTEM = """You are a master numerologist — 30 years of expertise across Indian,
Chaldean, and Pythagorean traditions. You are also the author of the book passages provided.

Your task: write a 3-sentence expert answer that directly addresses the client's question.

Rules:
1. Sentence 1: answer the question directly — no warmup, no "your numbers show"
2. Name at least 2 of the client's actual numbers (Life Path, Personal Year, Destiny, Name Number)
3. Give a specific year window (use the current or next personal year provided)
4. If book passages are provided, weave in one specific insight from them naturally
5. End with one concrete action tied to the numbers
6. No markdown, no headers, no labels — pure flowing prose
7. Do NOT say "From the X perspective" or "As a numerologist"
8. Simple, clear English — a non-expert should understand every sentence"""


def hybrid_numerology_answer(
    name: str,
    dob: str,
    life_path: int,
    destiny: int,
    soul_urge_num: int,
    name_number_val: int,
    tradition: str,
    intent: str,
    question: str,
    static_fallback: str,
    timeout_seconds: int = 8,
) -> str:
    """
    Single-call hybrid: RAG retrieval runs in parallel with prompt build,
    then one LLM call produces the final answer. Falls back to static_fallback.
    """
    current_year = date.today().year
    py_now       = _personal_year(dob, current_year)
    py_next, next_year = _next_personal_year(dob)

    # Fetch RAG context (fast — FAISS local search)
    rag_context = ""
    try:
        from numerology_rag.retriever import retrieve_for_rag
        rag_context = retrieve_for_rag(
            life_path=life_path, intent=intent,
            tradition=tradition, question=question,
            personal_year=py_now, top_k=3,
        )
    except Exception:
        pass

    user_prompt = (
        f"Tradition: {tradition}\n"
        f"Question: {question}\n"
        f"Intent: {intent}\n\n"
        f"Client numbers:\n"
        f"  Life Path: {life_path}\n"
        f"  Destiny Number: {destiny}\n"
        f"  Soul Urge: {soul_urge_num}\n"
        f"  Name Number: {name_number_val}\n"
        f"  Personal Year {current_year}: {py_now}\n"
        f"  Personal Year {next_year}: {py_next}\n"
    )
    if rag_context:
        user_prompt += f"\n{rag_context}\n"
    user_prompt += "\nWrite the 3-sentence expert answer now:"

    try:
        from utils.deepseek_client import call as ds_call
        result = ds_call(
            system=_EXPERT_SYSTEM,
            user=user_prompt,
            temperature=0.15,
            max_tokens=220,
        )
        answer = (result or "").strip()
        if len(answer) > 40:
            return answer
    except Exception:
        pass

    return static_fallback
