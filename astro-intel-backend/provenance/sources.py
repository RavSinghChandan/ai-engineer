"""
Where each finding comes from.

Every finding of the review gets `sources`: a list of the things it rests on, each of
one of four kinds, so the admin can check the finding before approving it:

  book         a passage of the numerology books: exact title, page, lines and the
               words of the passage (see provenance/books.py)
  calculation  a computation the app made from the birth details, with its steps
  input        a detail the client entered in the form
  rule         a table built into AstroIntel (tarot card meanings, vastu zones, the
               interpretation text of a tradition). It is not from a published book,
               and it is shown as such.
  ai           wording written by the AI model from the numbers and the book passages
               it was given; what no book passage says is the AI's own wording

Nothing here writes a source that is not true: a book passage is reported only when
it says what the finding says (provenance/books.py), and a statement that no book
backs is counted, not hidden. `source_summary` carries those counts.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from provenance.books import get_index, location
from utils import numerics

LOGGER = logging.getLogger(__name__)

_KINDS = ("book", "calculation", "input", "rule", "ai")
MAX_BOOK_PASSAGES = 3
MAX_GIVEN_PASSAGES = 3
MAX_CHAPTER_PASSAGES = 4

_LETTER_MAPS = {
    "indian": numerics.letter_map_indian,
    "chaldean": numerics.letter_map_chaldean,
    "pythagorean": numerics.letter_map_pythagorean,
}


# ── helpers ───────────────────────────────────────────────────────────────────
def _profile_value(profile: Any, key: str) -> str:
    if isinstance(profile, dict):
        return str(profile.get(key, "") or "")
    return str(getattr(profile, key, "") or "")


def _chain(n: int) -> str:
    """28 -> '28 → 10 → 1' (master numbers 11, 22 and 33 stay)."""
    steps = [str(n)]
    while n > 9 and n not in (11, 22, 33):
        n = sum(int(d) for d in str(n))
        steps.append(str(n))
    return " → ".join(steps)


def _book_source(passage: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "kind": "book",
        "title": passage["title"],
        "series": passage["series"],
        "publisher": passage["publisher"],
        "page": passage["page"],
        "line_start": passage["line_start"],
        "line_end": passage["line_end"],
        "location": location(passage),
        "quote": passage["quote"],
        "match": passage["match"],
        "relation": "says_same",
    }


def _given_source(passage: Dict[str, Any]) -> Dict[str, Any]:
    """A book passage that the AI was given to write a finding."""
    src = _book_source({**passage, "match": passage.get("score", 0.0)})
    src["relation"] = "given_to_ai"
    src["page_end"] = passage.get("page_end", passage["page"])
    src["retrieval_score"] = passage.get("score", 0.0)
    src.pop("match", None)
    return src


def locate_given(passages: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    """The passages the AI was given, each found in its book (best retrieved first, no duplicates)."""
    index = get_index()
    if index is None:
        return []
    found: List[Dict[str, Any]] = []
    seen = set()
    for p in sorted(passages or [], key=lambda p: -float(p.get("score", 0) or 0)):
        located = index.locate_passage(p.get("book", ""), p.get("text", ""), p.get("score", 0.0))
        if located is None:
            continue
        key = (located["book_id"], located["page"], located["line_start"])
        if key in seen:
            continue
        seen.add(key)
        found.append(located)
        if len(found) >= limit:
            break
    return found


def given_sources(passages: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    """The exact book, page and lines of the passages the AI was given (best retrieved first)."""
    return [_given_source(located) for located in locate_given(passages, limit)]


def _other(kind: str, title: str, lines: List[str]) -> Dict[str, Any]:
    return {"kind": kind, "title": title, "detail": [line for line in lines if line]}


def wording_source(origin: str, what: str) -> Optional[Dict[str, Any]]:
    """Who wrote the sentences of a finding: the AI model, or a text built into AstroIntel."""
    if origin == "ai":
        return _other(
            "ai",
            "Wording written by the AI (DeepSeek) from the numbers above and numerology book passages",
            ["The statements a book passage says are listed above; the rest of the wording is the AI's own"],
        )
    if origin == "template":
        return _other(
            "rule",
            f"Interpretation text: built into AstroIntel for {what}, not from a published book",
            ["Book passages that say the same, if any, are listed above"],
        )
    return None


def _book_sources(text: str, limit: int) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    index = get_index()
    if index is None or not text.strip():
        return [], {"statements": 0, "backed": 0}
    found = index.sources_for_text(text, limit=limit)
    return [_book_source(p) for p in found["passages"]], {"statements": found["statements"], "backed": found["backed"]}


# ── numerology: the numbers, with the steps ───────────────────────────────────
def _tradition_key(sub_agent: str) -> str:
    low = (sub_agent or "").lower()
    for key in _LETTER_MAPS:
        if key in low:
            return key
    return "indian"


_NUMBER_WORDS = (
    ("Life Path", "life path"),
    ("Destiny", "destiny"),
    ("Name Number", "name number"),
    ("Soul Urge", "soul urge"),
    ("Personality", "personality"),
)


def numerology_calculation(profile: Any, sub_agent: str, content: str) -> Optional[Dict[str, Any]]:
    name = _profile_value(profile, "full_name")
    dob = _profile_value(profile, "date_of_birth")
    if not dob:
        return None
    key = _tradition_key(sub_agent)
    lmap = _LETTER_MAPS[key]()
    digits = numerics.dob_digits(dob)
    total = sum(digits)
    lines = [
        f"Life Path: digits of {dob} added, {'+'.join(str(d) for d in digits)} = {_chain(total)}",
    ]
    lowered = (content or "").lower()
    letters = [c for c in name.upper() if c.isalpha()]
    wanted = {label for label, word in _NUMBER_WORDS if word in lowered}
    if "Destiny" in wanted:
        lines.append(f"Destiny Number: same sum as the Life Path in this method → {numerics.destiny_number(dob)}")
    if letters and ("Name Number" in wanted or "Soul Urge" in wanted or "Personality" in wanted):
        values = " + ".join(str(lmap.get(c, 0)) for c in letters)
        lines.append(
            f"Name Number: letters of {name.upper()} by the {key.capitalize()} letter table, "
            f"{values} = {_chain(sum(lmap.get(c, 0) for c in letters))}"
        )
    if "Soul Urge" in wanted:
        vowels = [c for c in letters if c in numerics.VOWELS]
        lines.append(
            f"Soul Urge: vowels {''.join(vowels)} = {_chain(sum(lmap.get(c, 0) for c in vowels))}"
        )
    if "Personality" in wanted:
        consonants = [c for c in letters if c not in numerics.VOWELS]
        lines.append(
            f"Personality: consonants {''.join(consonants)} = {_chain(sum(lmap.get(c, 0) for c in consonants))}"
        )
    return _other("calculation", f"{key.capitalize()} numerology: numbers worked out from your name and date of birth", lines)


# ── astrology ─────────────────────────────────────────────────────────────────
_ASTRO_ENGINE = (
    "Method: Sun by a simplified VSOP87 series, Moon by 16 leading ELP2000 terms, ascendant from the "
    "local sidereal time, Lahiri ayanamsa, Vimshottari dasha from the Moon's position"
)


def _vedic_extra(memory: Dict[str, Any]) -> Dict[str, Any]:
    try:
        for qa in (memory.get("astrology") or {}).get("question_wise_analysis", []):
            for sub in qa.get("sub_agent_results", []):
                if "vedic" in str(sub.get("sub_agent", "")).lower():
                    return sub.get("extra", {}) or {}
    except Exception:  # never block the review on a missing chart
        pass
    return {}


def _birth_line(profile: Any) -> str:
    parts = [
        _profile_value(profile, "date_of_birth"),
        _profile_value(profile, "time_of_birth"),
        _profile_value(profile, "place_of_birth"),
    ]
    return "Birth details used: " + ", ".join(p for p in parts if p)


def astrology_sources(profile: Any, sub_agent: str, detail: Dict[str, Any], memory: Dict[str, Any]) -> List[Dict[str, Any]]:
    extra = _vedic_extra(memory)
    chart = extra.get("chart", {}) or {}
    lines = [_birth_line(profile)]
    if chart:
        lines.append(
            "Chart: " + ", ".join(
                f"{label} {chart[key]}" for label, key in (
                    ("Lagna", "lagna"), ("Moon sign", "moon_sign"), ("Sun sign", "sun_sign"), ("Moon star", "nakshatra"),
                ) if chart.get(key)
            )
        )
    dasha = detail.get("current_dasha") or extra.get("current_dasha")
    if dasha:
        lines.append(f"Running dasha: {dasha}")
    positions = detail.get("planetary_positions") or extra.get("planetary_positions") or {}
    if isinstance(positions, dict) and positions:
        lines.append("Planets: " + "; ".join(f"{planet} {place}" for planet, place in list(positions.items())[:9]))
    sources: List[Dict[str, Any]] = []
    low = (sub_agent or "").lower()
    if "vedic" in low or not low:
        lines.append(_ASTRO_ENGINE)
        sources.append(_other("calculation", "Vedic birth chart, calculated from your birth details", lines))
        sources.append(_other("rule", "Interpretation text: built into AstroIntel (Vedic template), not from a published book", []))
    elif "kp" in low:
        lines.insert(1, "The Lagna, Moon sign and dasha below are the ones calculated for the Vedic chart")
        sources.append(_other("calculation", "Chart values shared from the Vedic calculation", lines))
        sources.append(_other(
            "rule",
            "Interpretation text: built into AstroIntel (KP template), not from a published book",
            ["No KP sub-lord or cusp calculation is made; the text is a template for the question's topic"],
        ))
    else:
        lines.insert(1, "Sun sign is the tropical sign of the date of birth; Moon sign, Lagna and dasha are the ones calculated for the Vedic chart")
        sources.append(_other("calculation", "Chart values: date of birth and the Vedic calculation", lines))
        sources.append(_other(
            "rule",
            "Interpretation text: built into AstroIntel (Western template), not from a published book",
            ["No transit calculation is made; the text is a template for the question's topic"],
        ))
    return sources


# ── tarot ─────────────────────────────────────────────────────────────────────
def tarot_sources(sub_agent: str, detail: Dict[str, Any]) -> List[Dict[str, Any]]:
    cards = detail.get("cards") or []
    drawn = [
        f"{c.get('position', '')}: {c.get('name', '')} ({c.get('orientation', 'upright')})"
        for c in cards if isinstance(c, dict)
    ]
    sources = [_other(
        "calculation",
        f"{sub_agent or 'Tarot'}: the cards drawn",
        drawn + ["Draw method: a fixed draw from your name, date of birth and question (the same details give the same cards)"],
    )]
    meanings = [f"{c.get('name', '')}: {c.get('meaning', '')}" for c in cards if isinstance(c, dict) and c.get("meaning")]
    if meanings:
        sources.append(_other("rule", "Card meanings: built into AstroIntel (Rider-Waite style table), not from a published book", meanings))
    return sources


# ── palmistry and vastu ───────────────────────────────────────────────────────
def palmistry_sources(sub_agent: str, detail: Dict[str, Any], module_inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    palm = (module_inputs or {}).get("palmistry", {}) if isinstance(module_inputs, dict) else {}
    hand = palm.get("hand_shape", "") if isinstance(palm, dict) else ""
    sources = []
    if hand:
        sources.append(_other("input", "Palm details you entered", [f"Hand shape: {hand}"]))
    lines = detail.get("lines") if isinstance(detail.get("lines"), dict) else {}
    sources.append(_other(
        "rule",
        f"{sub_agent or 'Palmistry'} line and mount table: built into AstroIntel, not from a published book",
        [f"{line}: {meaning}" for line, meaning in list(lines.items())[:5]],
    ))
    return sources


def vastu_sources(detail: Dict[str, Any], module_inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    vastu = (module_inputs or {}).get("vastu", {}) if isinstance(module_inputs, dict) else {}
    sources = []
    if isinstance(vastu, dict) and vastu:
        sources.append(_other("input", "Property details you entered", [
            f"Facing direction: {vastu.get('facing_direction') or 'North'}",
            f"Property type: {vastu.get('property_type') or 'Apartment / Flat'}",
        ]))
    zones = detail.get("zone_analysis") if isinstance(detail.get("zone_analysis"), dict) else {}
    sources.append(_other(
        "rule",
        "Vastu zone table: built into AstroIntel, not from a published book",
        [f"{zone}: {meaning}" for zone, meaning in list(zones.items())[:5]],
    ))
    return sources


# ── one finding ───────────────────────────────────────────────────────────────
def sources_for_insight(insight: Dict[str, Any], state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The sources of one finding of the review. Never raises."""
    try:
        domains = insight.get("domains") or []
        domain = domains[0] if len(domains) == 1 else ""
        sub_agent = insight.get("sub_agent", "")
        detail = insight.get("detail") or {}
        content = insight.get("content", "")
        profile = state.get("user_profile", {})
        sources: List[Dict[str, Any]] = []

        if domain == "numerology":
            calc = numerology_calculation(profile, sub_agent, content)
            if calc:
                sources.append(calc)
            wording = wording_source(detail.get("text_origin", ""), "this Life Path and topic")
            if wording:
                sources.append(wording)
        elif domain == "astrology":
            sources.extend(astrology_sources(profile, sub_agent, detail, state.get("memory", {})))
        elif domain == "tarot":
            sources.extend(tarot_sources(sub_agent, detail))
        elif domain == "palmistry":
            sources.extend(palmistry_sources(sub_agent, detail, state.get("module_inputs", {})))
        elif domain == "vastu":
            sources.extend(vastu_sources(detail, state.get("module_inputs", {})))

        books, counts = _book_sources(content, MAX_BOOK_PASSAGES)
        given = given_sources(detail.get("given_passages") or [], MAX_GIVEN_PASSAGES)
        sources = books + given + sources
        return sources, _summary(sources, counts)
    except Exception:  # a source trail must never break the analysis
        LOGGER.exception("could not build the sources of %s", insight.get("id"))
        return [], {}


def sentences_for_insight(insight: Dict[str, Any], state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Where each sentence of a finding comes from (see provenance/sentences.py). Never raises."""
    try:
        from provenance.sentences import sentence_trail

        detail = insight.get("detail") or {}
        origin = detail.get("text_origin") or ("template" if insight.get("domains") != ["numerology"] else "")
        given = locate_given(detail.get("given_passages") or [], MAX_CHAPTER_PASSAGES)
        return sentence_trail(insight.get("content", ""), state.get("user_profile", {}), insight.get("sub_agent", ""),
                              origin, given)
    except Exception:
        LOGGER.exception("could not trace the sentences of %s", insight.get("id"))
        return []


def _summary(sources: List[Dict[str, Any]], counts: Dict[str, int]) -> Dict[str, Any]:
    kinds = [kind for kind in _KINDS if any(s["kind"] == kind for s in sources)]
    same = sum(1 for s in sources if s["kind"] == "book" and s.get("relation") != "given_to_ai")
    given = sum(1 for s in sources if s["kind"] == "book" and s.get("relation") == "given_to_ai")
    books = same + given
    if same and given:
        headline = (f"{counts['backed']} of {counts['statements']} statements found in the books; "
                    f"written from {given} book passage{'s' if given != 1 else ''} given to the AI")
    elif same:
        headline = f"{counts['backed']} of {counts['statements']} statements found in the books"
    elif given:
        headline = f"Written by the AI from {given} book passage{'s' if given != 1 else ''}; none says it word for word"
    elif kinds:
        headline = "No book says this; it rests on the calculation and built-in tables below"
    else:
        headline = "No source could be traced"
    return {
        "statements": counts.get("statements", 0),
        "backed": counts.get("backed", 0),
        "book_passages": books,
        "kinds": kinds,
        "headline": headline,
    }


def attach_sources(admin_review: Dict[str, Any], state: Dict[str, Any]) -> int:
    """Add `sources` and `source_summary` to every finding of the review. Returns how many."""
    count = 0
    for question in admin_review.get("questions", []):
        insights = question.get("insights", [])
        for ins in insights:
            if ins.get("sub_agent") == "consensus" or len(ins.get("domains") or []) > 1:
                continue
            ins["sources"], ins["source_summary"] = sources_for_insight(ins, state)
            ins["sentences"] = sentences_for_insight(ins, state)
            count += 1
        for ins in insights:
            if ins.get("sub_agent") == "consensus" or len(ins.get("domains") or []) > 1:
                merged, seen = [], set()
                for other in insights:
                    for src in other.get("sources", []):
                        key = (src["kind"], src["title"], src.get("page"), src.get("line_start"))
                        if key not in seen:
                            seen.add(key)
                            merged.append(src)
                ins["sources"] = merged[:8]
                ins["source_summary"] = {
                    "statements": 0, "backed": 0,
                    "book_passages": sum(1 for s in merged[:8] if s["kind"] == "book"),
                    "kinds": [k for k in _KINDS if any(s["kind"] == k for s in merged[:8])],
                    "headline": "Combined from the findings it summarises",
                }
                count += 1
    return count


# ── a chapter of the 360 report ───────────────────────────────────────────────
_CHAPTER_NUMBER = {
    "life_path": "Life Path",
    "destiny": "Destiny",
    "soul_urge": "Soul Urge",
    "personality": "Personality",
}


def chapter_sources(chapter: Dict[str, Any], profile: Any) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Sources of one chapter of the 360 report: its book passages and its numbers."""
    try:
        story = _plain_story(chapter.get("story", ""))
        sources: List[Dict[str, Any]] = []
        focus = _CHAPTER_NUMBER.get(chapter.get("chapter_id", ""), "")
        calc = numerology_calculation(profile, "Indian Numerology", f"{focus} Name Number Soul Urge Personality Destiny")
        if calc:
            sources.append(calc)
        wording = wording_source(chapter.get("text_origin", ""), f"the chapter {chapter.get('title', '')}".strip())
        if wording:
            sources.append(wording)
        books, counts = _book_sources(story, MAX_CHAPTER_PASSAGES)
        given = given_sources(chapter.get("_passages") or [], MAX_CHAPTER_PASSAGES)
        sources = books + given + sources
        return sources, _summary(sources, counts)
    except Exception:
        LOGGER.exception("could not build the sources of chapter %s", chapter.get("chapter_id"))
        return [], {}


def _plain_story(story: str) -> str:
    """The story without its [HOOK] ... [REMEDIES] markers."""
    import re
    return re.sub(r"\[[A-Z_ ]{3,20}\]", " ", story or "")


def attach_chapter_sources(chapters: List[Dict[str, Any]], profile: Any) -> int:
    for chapter in chapters:
        chapter["sources"], chapter["source_summary"] = chapter_sources(chapter, profile)
        chapter["sentences"] = chapter_sentences(chapter, profile)
    return len(chapters)


def chapter_sentences(chapter: Dict[str, Any], profile: Any) -> List[Dict[str, Any]]:
    """Where each sentence of a chapter of the 360 report comes from. Never raises."""
    try:
        from provenance.sentences import sentence_trail

        given = locate_given(chapter.get("_passages") or [], MAX_CHAPTER_PASSAGES * 2)
        return sentence_trail(chapter.get("story", ""), profile, "Indian Numerology",
                              chapter.get("text_origin", ""), given)
    except Exception:
        LOGGER.exception("could not trace the sentences of chapter %s", chapter.get("chapter_id"))
        return []
