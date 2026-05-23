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

_EXPERT_SYSTEM = """You are a master numerologist — 30 years of expertise in {tradition}.
You are also the author of the book passages provided below.

Your task: write a RICH, DETAILED expert reading for this client using the {tradition} tradition.

Structure your answer as 4-5 sentences covering ALL of these:
1. Core character truth — what their Life Path + Name Number reveal about WHO they are
2. Current energy window — what Personal Year {current_year} and {next_year} mean specifically for them
3. Domain insight — what {tradition} specifically reveals about their question that the other traditions don't
4. Timing precision — exact year or cycle window when things shift
5. One concrete remedy or practice from {tradition} specifically — a number-based action, mantra, colour,
   or timing rule that is UNIQUE to this tradition

Rules:
- Answer the question directly — no warmup preamble
- Name every number explicitly: Life Path X, Destiny X, Name Number X, Personal Year X
- Include actual years (2026, 2027) not vague phrases like "soon" or "in the coming months"
- Each tradition must give a DIFFERENT angle — Indian focuses on karma/dharma,
  Chaldean on hidden vibrations/soul energy, Pythagorean on personality/life cycles
- Weave in specific insight from the book passages provided
- No markdown, no headers — pure flowing prose
- Do NOT say "From the {tradition} perspective" as an opener
- Simple clear English that a non-expert can understand"""


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
    Single-call hybrid: fetch RAG chunks (FAISS, fast) then one rich LLM call
    per tradition. Each tradition gets full depth — 4-5 sentences, all numbers,
    tradition-specific remedy woven in. Falls back to static_fallback on error.
    """
    current_year = date.today().year
    py_now       = _personal_year(dob, current_year)
    py_next, next_year = _next_personal_year(dob)

    # Fetch RAG context — top_k=4 gives more book material for richer answers
    rag_context = ""
    try:
        from numerology_rag.retriever import retrieve_for_rag
        rag_context = retrieve_for_rag(
            life_path=life_path, intent=intent,
            tradition=tradition, question=question,
            personal_year=py_now, top_k=4,
        )
    except Exception:
        pass

    system = _EXPERT_SYSTEM.replace("{tradition}", tradition) \
                           .replace("{current_year}", str(current_year)) \
                           .replace("{next_year}", str(next_year))

    user_prompt = (
        f"Client question: {question}\n"
        f"Intent: {intent}\n\n"
        f"Client numbers ({tradition}):\n"
        f"  Life Path: {life_path}\n"
        f"  Destiny Number: {destiny}\n"
        f"  Soul Urge: {soul_urge_num}\n"
        f"  Name Number: {name_number_val}\n"
        f"  Personal Year {current_year}: {py_now}\n"
        f"  Personal Year {next_year}: {py_next}\n"
    )
    if rag_context:
        user_prompt += f"\n{rag_context}\n"
    user_prompt += f"\nWrite the detailed {tradition} reading now (4-5 sentences, all numbers named, tradition-specific remedy included):"

    try:
        from utils.deepseek_client import call as ds_call
        result = ds_call(
            system=system,
            user=user_prompt,
            temperature=0.20,
            max_tokens=250,
        )
        answer = (result or "").strip()
        if len(answer) > 80:
            return answer
    except Exception:
        pass

    return static_fallback
