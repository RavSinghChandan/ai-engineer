"""
Holistic 360° life-report agent.

Unlike the question-driven flow, this agent takes ONLY birth details and
produces a full-life "book" — 14 chapters (in hierarchy of importance), each
written as a story arc ([HOOK]…[REMEDIES]) using the SAME numerology RAG +
storytelling engine as the question flow, so the PDF renders identically.

Public entry point:
    holistic_agent_node(state)  — LangGraph node; reads birth profile from
    state, writes state["holistic_chapters"] (list of chapter dicts).

Design: reuse everything. No new LLM prompts beyond an intent-framed
"guiding question" per chapter fed to the existing hybrid RAG answerer, then
woven into a story by the existing storytelling agent. Chapters run in
parallel (ThreadPoolExecutor), mirroring domain_agents_parallel.
"""
from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List

from utils.numerics import (
    life_path,
    destiny_number,
    name_number,
    soul_urge,
    personality_number,
    reduce_number,
    lucky_numbers,
    lucky_colors_for_number,
    letter_map_indian,
)

# ── Chapter definitions — hierarchy of importance (order = importance) ───────
# Each chapter frames an implicit "guiding question" so the existing hybrid RAG
# answerer produces relevant book-grounded material, which is then storified.
CHAPTERS: List[Dict[str, str]] = [
    {"id": "life_path",      "order": "1",  "title": "Your Life Path",
     "intent": "general",
     "guide": "What is the core life path and life purpose of this person?"},
    {"id": "destiny",        "order": "2",  "title": "Your Destiny & Expression",
     "intent": "general",
     "guide": "What is this person's destiny and how are they meant to express themselves in the world?"},
    {"id": "soul_urge",      "order": "3",  "title": "Your Soul's Deepest Desire",
     "intent": "spirituality",
     "guide": "What does this person's heart most deeply desire and long for?"},
    {"id": "personality",    "order": "4",  "title": "How the World Sees You",
     "intent": "general",
     "guide": "How does this person come across to others — their outer personality?"},
    {"id": "birthday",       "order": "5",  "title": "The Gift of Your Birth Day",
     "intent": "general",
     "guide": "What special talent or gift does this person's birth day number reveal?"},
    {"id": "maturity",       "order": "6",  "title": "Who You Are Becoming",
     "intent": "general",
     "guide": "What will this person grow into in the second half of life — their maturity number?"},
    {"id": "career",         "order": "7",  "title": "Career & Money",
     "intent": "career",
     "guide": "What career path and money pattern suits this person best?"},
    {"id": "relationships",  "order": "8",  "title": "Love & Relationships",
     "intent": "marriage",
     "guide": "What does love and partnership look like for this person?"},
    {"id": "health",         "order": "9",  "title": "Health & Energy",
     "intent": "health",
     "guide": "What should this person know about their health, energy and wellbeing?"},
    {"id": "family",         "order": "10", "title": "Family & Home",
     "intent": "general",
     "guide": "What role do family and home play in this person's life?"},
    {"id": "growth",         "order": "11", "title": "Personal Growth & Purpose",
     "intent": "spirituality",
     "guide": "How can this person grow, and what is their deeper purpose?"},
    {"id": "personal_year",  "order": "12", "title": "The Year Ahead",
     "intent": "general",
     "guide": "What does the current personal year cycle hold for this person?"},
    {"id": "cycles",         "order": "13", "title": "Life Cycles & Turning Points",
     "intent": "general",
     "guide": "What are the key pinnacles, challenges and turning points ahead in this person's life?"},
    {"id": "remedies",       "order": "14", "title": "Your Lucky Guide & Remedies",
     "intent": "general",
     "guide": "What lucky numbers, colours, days and practical remedies support this person?"},
]


def _core_numbers(name: str, dob: str) -> Dict[str, Any]:
    """Compute every number the chapters need — once, up front."""
    lmap = letter_map_indian()
    lp = life_path(dob)
    dest = destiny_number(dob)
    nm = name_number(name, lmap)
    su = soul_urge(name, lmap)
    pers = personality_number(name, lmap)
    # Birthday number = day of month, reduced.
    try:
        day = int(dob.split("-")[2])
    except (IndexError, ValueError):
        day = 0
    birthday = reduce_number(day) if day else lp
    maturity = reduce_number(lp + dest)
    return {
        "life_path":   lp,
        "destiny":     dest,
        "name_number": nm,
        "soul_urge":   su,
        "personality": pers,
        "birthday":    birthday,
        "maturity":    maturity,
        "lucky_numbers": lucky_numbers(lp, nm),
        "lucky_colors":  lucky_colors_for_number(lp),
    }


def _build_chapter(
    chapter: Dict[str, str],
    name: str,
    dob: str,
    nums: Dict[str, Any],
) -> Dict[str, Any]:
    """Build one chapter: RAG reading -> storified arc. Reuses the Q&A engine."""
    intent = chapter["intent"]
    guide = chapter["guide"]

    # 1) Grounded reading from the existing hybrid RAG answerer (book + LLM).
    reading = ""
    try:
        from numerology_rag.hybrid_engine import hybrid_numerology_answer
        reading = hybrid_numerology_answer(
            name=name,
            dob=dob,
            life_path=nums["life_path"],
            destiny=nums["destiny"],
            soul_urge_num=nums["soul_urge"],
            name_number_val=nums["name_number"],
            tradition="Indian Vedic Numerology",
            intent=intent,
            question=guide,
            static_fallback="",
        )
    except Exception:
        reading = ""

    # 2) Retrieve a little remedy/book context for the [REMEDIES] paragraph.
    rag_remedy = ""
    try:
        from numerology_rag.retriever import retrieve_for_rag
        rag_remedy = retrieve_for_rag(
            life_path=nums["life_path"], intent=intent,
            tradition="Indian Vedic Numerology", question=guide, top_k=3,
        )
    except Exception:
        rag_remedy = ""

    # 3) Weave into the SAME story-arc format the PDF already renders.
    #    numerology_story needs >=2 bullets to storify; give it the reading plus
    #    a numbers-anchored second source so it always produces the arc.
    numbers_line = (
        f"Life Path {nums['life_path']}, Destiny {nums['destiny']}, "
        f"Soul Urge {nums['soul_urge']}, Personality {nums['personality']}, "
        f"Birthday {nums['birthday']}, Maturity {nums['maturity']}."
    )
    story = ""
    try:
        from agents.storytelling_agent import numerology_story
        bullets = [b for b in (reading, numbers_line) if b and b.strip()]
        story = numerology_story(
            bullets=bullets,
            question=guide,
            intent=intent,
            subject=name,
            rag_remedy_text=rag_remedy,
        )
    except Exception:
        story = ""

    # A real story arc contains [HOOK]. If storifying failed (empty, or fell
    # back to the thin numbers line), keep the RICH reading instead of a bare
    # numbers line — the PDF renders plain prose fine when there is no arc.
    if "[HOOK]" not in (story or ""):
        story = reading if len(reading) > len(story or "") else (story or reading)

    return {
        "chapter_id": chapter["id"],
        "order": int(chapter["order"]),
        "title": chapter["title"],
        "intent": intent,
        "story": story or reading or numbers_line,
        "numbers": nums,
    }


def build_holistic_chapters(name: str, dob: str) -> List[Dict[str, Any]]:
    """Build all chapters in parallel. Pure function — easy to unit-test."""
    nums = _core_numbers(name, dob)
    results: Dict[int, Dict[str, Any]] = {}
    # Cap concurrency: too many simultaneous LLM calls can hit provider rate
    # limits and return empty readings (which forced short fallbacks).
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            ex.submit(_build_chapter, ch, name, dob, nums): int(ch["order"])
            for ch in CHAPTERS
        }
        for fut in as_completed(futures):
            order = futures[fut]
            try:
                results[order] = fut.result()
            except Exception:
                # Never let one chapter sink the whole book.
                ch = next(c for c in CHAPTERS if int(c["order"]) == order)
                results[order] = {
                    "chapter_id": ch["id"], "order": order,
                    "title": ch["title"], "intent": ch["intent"],
                    "story": "", "numbers": nums,
                }
    return [results[o] for o in sorted(results)]


def holistic_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """LangGraph node: read birth profile, write holistic_chapters into state."""
    state = copy.deepcopy(state) if state.get("_copy_on_node") else state
    profile = state.get("user_profile", {}) or {}
    name = profile.get("full_name") or profile.get("alias_name") or "the client"
    dob = profile.get("date_of_birth", "")

    chapters = build_holistic_chapters(name, dob)
    state["holistic_chapters"] = chapters
    state.setdefault("agent_log", []).append(
        {"agent": "holistic_agent", "status": "ok", "chapters": len(chapters)}
    )
    return state
