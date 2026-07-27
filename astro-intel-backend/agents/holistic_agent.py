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
    # ACT I — WHO YOU ARE (the foundation: core identity numbers)
    {"id": "life_path", "order": "1", "act": "Act I — Who You Are",
     "title": "Your Life Path", "intent": "general", "focus": "life_path",
     "angle": "the ONE big reason this soul came to earth — their life purpose",
     "timing": "the overall arc of their whole life",
     "guide": "What is the core life path and life purpose of this person?"},
    {"id": "destiny", "order": "2", "act": "Act I — Who You Are",
     "title": "Your Destiny & Expression", "intent": "career", "focus": "destiny",
     "angle": "the mark they are meant to leave on the world — their public destiny and talents, NOT their inner purpose",
     "timing": "the long build toward their life's work",
     "guide": "What is this person's destiny number and the gift they are meant to express to the world?"},
    {"id": "soul_urge", "order": "3", "act": "Act I — Who You Are",
     "title": "Your Soul's Deepest Desire", "intent": "spirituality", "focus": "soul_urge",
     "angle": "the secret private craving of their heart that no one sees — what they want when no one is watching",
     "timing": "a quiet inner longing, timeless",
     "guide": "What does this person's heart secretly and most deeply desire?"},
    {"id": "personality", "order": "4", "act": "Act I — Who You Are",
     "title": "How the World Sees You", "intent": "general", "focus": "personality",
     "angle": "the FIRST impression — the mask and vibe strangers pick up in the first ten seconds",
     "timing": "how first impressions shift as they mature",
     "guide": "How does this person come across to others on first meeting — their outer personality?"},

    # ACT II — HOW YOU MOVE THROUGH LIFE (gifts + who they become)
    {"id": "birthday", "order": "5", "act": "Act II — How You Move Through Life",
     "title": "The Gift of Your Birth Day", "intent": "general", "focus": "birthday",
     "angle": "one specific hidden talent their birth-day number hands them — a single superpower, concrete not vague",
     "timing": "when this talent tends to switch on in life",
     "guide": "What one special talent does this person's birth day number reveal?"},
    {"id": "maturity", "order": "6", "act": "Act II — How You Move Through Life",
     "title": "Who You Are Becoming", "intent": "general", "focus": "maturity",
     "angle": "who they quietly turn into after ~35 — the second-half-of-life self, a transformation forward",
     "timing": "the mid-life turning point and the years after it",
     "guide": "Who does this person grow into in the second half of life (maturity number)?"},

    # ACT III — YOUR LIFE DOMAINS (the four rooms of a life)
    {"id": "career", "order": "7", "act": "Act III — Your Life Domains",
     "title": "Career & Money", "intent": "career", "focus": "life_path",
     "angle": "work, calling and money ONLY — where they thrive, how wealth comes, what job drains them",
     "timing": "the best upcoming career/money window specifically",
     "guide": "What career and money pattern suits this person, and when is their best money window?"},
    {"id": "relationships", "order": "8", "act": "Act III — Your Life Domains",
     "title": "Love & Relationships", "intent": "marriage", "focus": "soul_urge",
     "angle": "love and partnership ONLY — how they love, what partner fits, their relationship blind spot",
     "timing": "the upcoming window for love/commitment specifically",
     "guide": "What does love and the right partnership look like for this person?"},
    {"id": "health", "order": "9", "act": "Act III — Your Life Domains",
     "title": "Health & Energy", "intent": "health", "focus": "life_path",
     "angle": "body, energy and wellbeing ONLY — where stress lands in their body, what keeps them strong",
     "timing": "the health rhythm to watch in the coming period",
     "guide": "What should this person know about their health, energy and body?"},
    {"id": "family", "order": "10", "act": "Act III — Your Life Domains",
     "title": "Family & Home", "intent": "general", "focus": "personality",
     "angle": "home, roots and family role ONLY — the part they play in their family, their home life",
     "timing": "a family/home shift on the horizon",
     "guide": "What role does this person play in family and home life?"},

    # ACT IV — YOUR TIMELINE AHEAD (where the road is going)
    {"id": "growth", "order": "11", "act": "Act IV — Your Timeline Ahead",
     "title": "Personal Growth & Purpose", "intent": "spirituality", "focus": "maturity",
     "angle": "the ONE inner lesson they are here to master — their growth edge and how to grow it",
     "timing": "the current growth season",
     "guide": "What is the one inner lesson this person is here to grow into?"},
    {"id": "personal_year", "order": "12", "act": "Act IV — Your Timeline Ahead",
     "title": "The Year Ahead", "intent": "general", "focus": "life_path",
     "angle": "THIS coming year only — the single theme, mood and opportunity of the next 12 months",
     "timing": "strictly the current personal-year cycle and the very next one",
     "guide": "What is the theme and opportunity of this person's coming personal year?"},
    {"id": "cycles", "order": "13", "act": "Act IV — Your Timeline Ahead",
     "title": "Life Cycles & Turning Points", "intent": "general", "focus": "destiny",
     "angle": "the big multi-year turning points (pinnacles/challenges) across the whole life map — a wide zoom-out",
     "timing": "the major life pinnacles and their approximate ages",
     "guide": "What are the major multi-year pinnacles and turning points across this person's life?"},

    # ACT V — YOUR GUIDE (the closing gift they can act on)
    {"id": "remedies", "order": "14", "act": "Act V — Your Guide",
     "title": "Your Lucky Guide & Remedies", "intent": "general", "focus": "life_path",
     "angle": "practical takeaways ONLY — lucky numbers, colours, days and 2-3 simple remedies they can start this week",
     "timing": "small daily/weekly practices",
     "guide": "What lucky numbers, colours, days and simple practical remedies support this person?"},
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


_CHAPTER_SYSTEM = (
    "You are the world's warmest, wisest numerologist and storyteller, writing "
    "one chapter of a person's life-book. You write in simple, everyday English "
    "a 12-year-old could follow — short sentences, warm and human, never a "
    "textbook. You make the reader feel truly SEEN.\n\n"
    "CRITICAL RULES:\n"
    "1. This chapter covers ONE topic only (given below). Do NOT summarise the "
    "person's whole personality — stay on this chapter's topic.\n"
    "2. Your opening line MUST be fresh and specific to THIS chapter's angle. Do "
    "NOT start with 'You are a creator...' or restate their life purpose — that "
    "belongs to another chapter. Surprise the reader with a new door.\n"
    "3. Weave the numbers in LIGHTLY and naturally — this is a story about THEM, "
    "not a maths lesson. Mention at most one or two numbers, only if it helps.\n"
    "4. For timing, use ONLY the timing lens given for this chapter. Do not list "
    "generic 'Personal Year 8 in 2026 / Year 9 in 2027' unless this chapter is "
    "specifically about the year ahead.\n"
    "5. Write EXACTLY these 6 paragraphs, each labelled and 1-2 simple sentences:\n"
    "[HOOK] [TENSION] [TURN] [RESOLUTION] [CLOSING] [REMEDIES]\n"
    "In [REMEDIES], give flowing prose advice (no bullets, no icons)."
)


def _chapter_story(
    chapter: Dict[str, str],
    name: str,
    nums: Dict[str, Any],
    reading: str,
    rag_remedy: str,
) -> str:
    """Turn a chapter's RAG reading into a UNIQUE story arc for this chapter.

    Each chapter gets its own angle, opening, and timing lens baked into the
    prompt, so no two chapters read alike. Falls back to the RAG reading (or a
    minimal arc) if the LLM call fails — a chapter is never left empty.
    """
    focus_key = chapter.get("focus", "life_path")
    focus_val = nums.get(focus_key, nums["life_path"])
    user_prompt = (
        f"Person: {name}\n"
        f"Book section: {chapter.get('act', '')}\n"
        f"THIS CHAPTER: {chapter['title']}\n"
        f"Cover ONLY this angle: {chapter.get('angle', chapter['guide'])}\n"
        f"Leading number for this chapter: {focus_key.replace('_', ' ')} = {focus_val}\n"
        f"Timing lens to use (and only this): {chapter.get('timing', 'their life arc')}\n\n"
        f"Background reading you may draw from (rewrite it in your own warm voice, "
        f"do not copy):\n{reading[:900]}\n"
    )
    if rag_remedy:
        user_prompt += f"\nBook remedy knowledge for the [REMEDIES] line:\n{rag_remedy[:600]}\n"
    user_prompt += (
        f"\nNow write the {chapter['title']} chapter as the 6 labelled paragraphs. "
        f"Remember: fresh opening, stay on this one topic, numbers woven in lightly."
    )

    # Try up to twice — the arc labels ([HOOK]…) occasionally get dropped, and a
    # retry (with a firm reminder) usually recovers the format.
    last_prose = ""
    try:
        from utils.deepseek_client import call as ds_call
        for attempt in range(2):
            prompt = user_prompt
            if attempt == 1:
                prompt += (
                    "\n\nIMPORTANT: You MUST use the six labels exactly: "
                    "[HOOK] [TENSION] [TURN] [RESOLUTION] [CLOSING] [REMEDIES]. "
                    "Write in second person ('you'), not third person."
                )
            result = ds_call(
                system=_CHAPTER_SYSTEM,
                user=prompt,
                temperature=0.55 if attempt == 0 else 0.4,
                max_tokens=520,
            )
            story = (result or "").strip()
            if len(story) > 120 and "[HOOK]" in story:
                return story
            # Keep the best unlabelled-but-warm prose the model produced — it is
            # still second-person story voice, just missing the labels.
            if len(story) > len(last_prose):
                last_prose = story
    except Exception:
        pass

    # Fallback: the model gave warm prose but no labels → wrap it as one [HOOK]
    # block (the PDF renders that as clean prose). This keeps the story VOICE,
    # unlike the third-person textbook RAG reading, which we only use as a last
    # resort when even the LLM produced nothing usable.
    if len(last_prose) > 120:
        return f"[HOOK] {last_prose}"
    if reading and len(reading.strip()) > 80:
        return f"[HOOK] {reading.strip()}"
    return (
        f"[HOOK] This chapter looks at {chapter['title'].lower()}.\n"
        f"[TENSION] Every strength here carries a matching challenge.\n"
        f"[TURN] Your {focus_key.replace('_', ' ')} number {focus_val} is the key.\n"
        f"[RESOLUTION] Lean into it gently and it works for you.\n"
        f"[CLOSING] This is a real part of who you are.\n"
        f"[REMEDIES] Stay patient with yourself and trust your natural rhythm."
    )


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

    # 3) Weave into a story arc that is UNIQUE to this chapter — its own angle,
    #    its own opening, its own timing lens. This is what stops all 14 chapters
    #    reading the same. Falls back to the RAG reading if the LLM call fails.
    story = _chapter_story(chapter, name, nums, reading, rag_remedy)

    return {
        "chapter_id": chapter["id"],
        "order": int(chapter["order"]),
        "title": chapter["title"],
        "intent": intent,
        "story": story,
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
