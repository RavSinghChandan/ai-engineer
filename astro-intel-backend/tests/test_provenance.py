"""
Where each finding comes from: the book index, the matching, the sources of every
domain, and both flows (the question report and the 360 report) end to end.

All LLM calls are patched out, so the suite is fast and needs no API key.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from provenance import books as books_mod
from provenance.books import BookIndex, get_index, location, tokens
from provenance.build_index import DEFAULT_DIR, page_lines, sentence_units
from provenance.sources import (
    attach_chapter_sources,
    attach_sources,
    numerology_calculation,
    sources_for_insight,
)

# The FAISS index is a build artefact (git-ignored): the tests that retrieve passages need it.
from pathlib import Path as _Path
needs_index = pytest.mark.skipif(
    not (_Path(__file__).resolve().parent.parent / "numerology_rag" / "index" / "faiss.index").exists(),
    reason="numerology_rag/index/faiss.index is not built",
)

PROFILE = {
    "full_name": "Chandan Kumar",
    "date_of_birth": "1991-03-14",
    "time_of_birth": "10:30",
    "place_of_birth": "Pune, Maharashtra",
}


# ── the index ────────────────────────────────────────────────────────────────
def test_index_holds_the_twelve_books():
    index = get_index()
    assert index is not None
    assert len(index.books) == 12
    assert {b["publisher"] for b in index.books} == {"Indian Institute of Skill Development Training (IISDT)"}
    assert "Core Numbers and Their Interpretation" in {b["title"] for b in index.books}
    # every unit says which book, page and lines it is
    for book_idx, page, line1, line2, text in index.units[:2000]:
        assert 0 <= book_idx < 12 and page >= 1 and 1 <= line1 <= line2 and text


def test_header_lines_are_not_counted_as_lines():
    raw = (
        "Indian Institute of Skill Development Training (IISDT)\n"
        "Empowering Skills. Transforming Lives.\n"
        "5 | P a g e\n"
        "Copyright @ Indian Institute of Skill Development Training (IISDT), All Rights Reserved\n"
        "Why Knowing Your Life Path Number Matters\n"
        "Understanding your Life Path Number can be transformative because it:\n"
    )
    assert page_lines(raw) == [
        "Why Knowing Your Life Path Number Matters",
        "Understanding your Life Path Number can be transformative because it:",
    ]
    other_style = "Diploma in Numerology \n8 | P a g e \nIndian Institute of Skill Development Training (IISDT) \nBody line one.\n"
    assert page_lines(other_style) == ["Body line one."]


def test_a_bullet_starts_a_new_unit_and_keeps_its_lines():
    lines = [
        "Heading of the page that is long enough to be kept.",
        "o Personality nuances: Driven to lead, creative in problem-solving, confident but",
        "sometimes impatient.",
        "o Life lesson: Learning cooperation, humility, and patience to balance independence",
    ]
    units = sentence_units(lines)
    assert [(u["l1"], u["l2"]) for u in units] == [(1, 1), (2, 3), (4, 4)]


@pytest.mark.skipif(not (DEFAULT_DIR / "Core-Numbers-and-Their-Interpretation.pdf").exists(), reason="the source PDFs are not on this machine")
def test_page_and_lines_match_the_pdf_itself():
    """The page and lines the index gives are the page and lines of the PDF."""
    import pypdf

    index = get_index()
    reader = pypdf.PdfReader(str(DEFAULT_DIR / "Core-Numbers-and-Their-Interpretation.pdf"))
    checked = 0
    for book_idx, page, line1, line2, text in index.units:
        if index.books[book_idx]["id"] != "Core-Numbers-and-Their-Interpretation" or page % 11 != 0:
            continue
        body = page_lines(reader.pages[page - 1].extract_text() or "")
        shown = " ".join(body[line1 - 1: line2])
        assert text.replace("  ", " ") in shown.replace("’", "'").replace("–", "-").replace("—", "-").replace("“", '"').replace("”", '"') or len(text) > 300
        checked += 1
        if checked >= 40:
            break
    assert checked >= 20


# ── matching ─────────────────────────────────────────────────────────────────
def test_a_sentence_of_a_book_is_found_at_its_page_and_lines():
    index = get_index()
    found = index.sources_for_text(
        "Calculating your Life Path Number is straightforward but requires reducing your "
        "full birth date to a single digit"
    )
    passage = found["passages"][0]
    assert passage["title"] == "Core Numbers and Their Interpretation"
    assert (passage["page"], passage["line_start"]) == (2, 15)
    assert location(passage).startswith("page 2, lines 15")
    assert "reducing your full birth date to a single digit" in passage["quote"]
    assert found["backed"] == found["statements"] == 1


def test_a_paraphrase_is_still_found():
    found = get_index().sources_for_text(
        "The number 11 is often called the Illuminator or Spiritual Messenger and carries intuition, inspiration and higher consciousness."
    )
    assert found["passages"] and found["passages"][0]["title"] == "Advanced Numerology Calculations and Techniques"
    assert found["passages"][0]["page"] == 2


@pytest.mark.parametrize("statement", [
    "How to repair a flat bicycle tyre with a patch kit and a pump.",
    "The quarterly revenue grew by twelve percent because of strong cloud subscriptions.",
    "Your Moon in Taurus (Rohini lunar star) reveals that emotional security matters before commitment.",
    "KP cusp analysis confirms a favorable period for career matters.",
    "Consistent effort aligned with your natural strengths yields compounding, lasting results.",
])
def test_a_statement_the_books_do_not_make_gets_no_book(statement):
    found = get_index().sources_for_text(statement)
    assert found["passages"] == [] and found["backed"] == 0


def test_a_statement_about_one_life_path_is_not_backed_by_another():
    filler = [[0, 9, n, n, f"Unrelated filler sentence {n} about cooking pasta and baking bread slowly."] for n in range(1, 400)]
    index = BookIndex({
        "books": [{"id": "b", "title": "Book", "series": "s", "publisher": "p"}],
        "units": [
            [0, 3, 1, 2, "Life Path 9 is humanitarian, compassionate, generous, and idealistic in every relationship."],
            [0, 3, 3, 4, "Life Path 1 is independent, ambitious, driven, and confident in every relationship."],
        ] + filler,
    })
    nine = index.sources_for_text("Life Path 9 is humanitarian, compassionate, generous and idealistic in relationships.")
    one = index.sources_for_text("Life Path 1 is humanitarian, compassionate, generous and idealistic in relationships.")
    assert nine["passages"][0]["line_start"] == 1
    assert one["passages"] == []


def test_a_trivial_statement_made_of_words_every_book_uses_gets_no_book():
    found = get_index().sources_for_text("Your life path number 9 is the key.")
    assert found["passages"] == [] and found["backed"] == 0


def test_the_quote_is_text_of_the_book():
    index = get_index()
    found = index.sources_for_text("Life Path 8 is built for power and material mastery with executive roles, business ownership and finance.")
    for passage in found["passages"]:
        assert tokens(passage["quote"])  # a real passage, not an empty match
        assert 0 < passage["match"] <= 1


def test_without_the_index_no_book_is_reported(monkeypatch):
    monkeypatch.setattr("provenance.sources.get_index", lambda: None)
    insight = {"id": "q1_i1", "content": "Life Path 1 is a pioneer.", "domains": ["numerology"], "sub_agent": "Indian Numerology"}
    sources, summary = sources_for_insight(insight, {"user_profile": PROFILE})
    assert [s["kind"] for s in sources] == ["calculation"]
    assert summary["book_passages"] == 0


# ── the numbers, with their steps ────────────────────────────────────────────
def test_numerology_calculation_shows_every_step():
    calc = numerology_calculation(PROFILE, "Indian Numerology", "Your Life Path 1, Destiny Number and Name Number 3 and Soul Urge.")
    assert calc["kind"] == "calculation"
    text = "\n".join(calc["detail"])
    assert "1+9+9+1+0+3+1+4 = 28 → 10 → 1" in text
    assert "Name Number" in text and "CHANDAN KUMAR" in text and "= 39 → 12 → 3" in text
    assert "Soul Urge: vowels AAUA" in text
    assert "Personality" not in text           # only the numbers the finding talks about


def test_master_numbers_are_not_reduced():
    calc = numerology_calculation({"full_name": "Ann", "date_of_birth": "1990-01-01"}, "Pythagorean Numerology", "Life Path")
    assert "= 21 → 3" in calc["detail"][0]
    calc = numerology_calculation({"full_name": "Ann", "date_of_birth": "1982-01-10"}, "Pythagorean Numerology", "Life Path")
    assert calc["detail"][0].endswith("= 22")


def test_no_date_of_birth_gives_no_calculation():
    assert numerology_calculation({"full_name": "Ann"}, "Indian Numerology", "Life Path") is None


# ── every domain ─────────────────────────────────────────────────────────────
def _state():
    vedic_extra = {
        "chart": {"lagna": "Gemini", "moon_sign": "Taurus", "sun_sign": "Pisces", "nakshatra": "Rohini"},
        "planetary_positions": {"Sun": "Pisces 29", "Moon": "Taurus 12"},
        "current_dasha": "Jupiter Mahadasha",
    }
    return {
        "user_profile": PROFILE,
        "module_inputs": {
            "palmistry": {"hand_shape": "Earth hand"},
            "vastu": {"facing_direction": "East", "property_type": "Villa"},
        },
        "memory": {"astrology": {"question_wise_analysis": [{"sub_agent_results": [
            {"sub_agent": "Vedic Astrology", "extra": vedic_extra},
        ]}]}},
    }


def _insight(domain, sub_agent, detail=None, content="A finding."):
    return {"id": "q1_i1", "content": content, "domains": [domain], "sub_agent": sub_agent, "detail": detail or {}}


def test_vedic_astrology_rests_on_the_calculated_chart():
    sources, summary = sources_for_insight(
        _insight("astrology", "Vedic Astrology", {"current_dasha": "Jupiter Mahadasha"}), _state())
    kinds = [s["kind"] for s in sources]
    assert kinds == ["calculation", "rule"]
    detail = "\n".join(sources[0]["detail"])
    assert "Pune, Maharashtra" in detail and "Lagna Gemini" in detail and "Jupiter Mahadasha" in detail
    assert "Lahiri" in detail
    assert "not from a published book" in sources[1]["title"]


@pytest.mark.parametrize("sub_agent,needle", [("KP Astrology", "No KP sub-lord"), ("Western Astrology", "No transit calculation")])
def test_kp_and_western_say_what_they_do_not_calculate(sub_agent, needle):
    sources, _ = sources_for_insight(_insight("astrology", sub_agent), _state())
    assert needle in "\n".join(sources[1]["detail"])
    assert "Vedic" in sources[0]["title"] or "Vedic" in "\n".join(sources[0]["detail"])


def test_tarot_shows_the_cards_and_the_table_they_come_from():
    cards = [{"position": "Past", "name": "The Fool", "orientation": "upright", "meaning": "A fresh start is on the horizon."}]
    sources, _ = sources_for_insight(_insight("tarot", "Rider-Waite Tarot", {"cards": cards}), _state())
    assert sources[0]["detail"][0] == "Past: The Fool (upright)"
    assert "fixed draw" in sources[0]["detail"][1]
    assert sources[1]["kind"] == "rule" and "The Fool: A fresh start" in sources[1]["detail"][0]


def test_palmistry_and_vastu_show_what_you_entered():
    sources, _ = sources_for_insight(_insight("palmistry", "Indian Palmistry", {"lines": {"Heart": "deep"}}), _state())
    assert sources[0] == {"kind": "input", "title": "Palm details you entered", "detail": ["Hand shape: Earth hand"]}
    sources, _ = sources_for_insight(_insight("vastu", "Traditional Vastu", {"zone_analysis": {"North-East": "water"}}), _state())
    assert sources[0]["detail"] == ["Facing direction: East", "Property type: Villa"]
    assert sources[1]["kind"] == "rule"


def test_summary_counts_what_the_books_back():
    content = (
        "Calculating your Life Path Number is straightforward but requires reducing your full birth date to a single digit. "
        "Your Moon in Taurus reveals that emotional security matters before commitment."
    )
    sources, summary = sources_for_insight(_insight("numerology", "Indian Numerology", content=content), _state())
    assert summary["statements"] == 2 and summary["backed"] == 1
    assert summary["headline"] == "1 of 2 statements found in the books"
    assert summary["kinds"] == ["book", "calculation"]
    assert sources[0]["kind"] == "book" and sources[0]["page"] == 2


def test_a_finding_no_book_backs_is_labelled_so():
    sources, summary = sources_for_insight(_insight("tarot", "Rider-Waite Tarot", {"cards": []}, content="Plan the journey with intention."), _state())
    assert summary["book_passages"] == 0
    assert summary["headline"].startswith("No book says this")


def test_a_failure_while_building_sources_gives_an_empty_trail():
    with patch("provenance.sources._book_sources", side_effect=RuntimeError("boom")):
        assert sources_for_insight(_insight("numerology", "Indian Numerology"), _state()) == ([], {})


def test_the_consensus_finding_combines_the_sources_of_the_others():
    review = {"questions": [{"question": "q", "intent": "career", "insights": [
        _insight("numerology", "Indian Numerology", content="Life Path 1 is a pioneer."),
        _insight("tarot", "Rider-Waite Tarot", {"cards": []}),
        {"id": "q1_consensus", "content": "Across all.", "domains": ["numerology", "tarot"], "sub_agent": "consensus", "detail": {}},
    ]}]}
    assert attach_sources(review, _state()) == 3
    consensus = review["questions"][0]["insights"][2]
    assert consensus["source_summary"]["headline"] == "Combined from the findings it summarises"
    titles = [s["title"] for s in consensus["sources"]]
    assert len(titles) == len(set(titles)) and any("numbers worked out" in t for t in titles)


# ── the whole flows, end to end ──────────────────────────────────────────────
@pytest.fixture
def no_llm():
    with patch("utils.deepseek_client.call", return_value=None):
        yield


def test_question_flow_gives_every_finding_its_sources(no_llm):
    from graph.pipeline import run_pipeline

    state = run_pipeline({
        "user_profile": PROFILE,
        "user_id": "t",
        "user_question": "When will I get married?",
        "questions": [],
        "selected_modules": ["numerology", "astrology", "tarot", "vastu", "palmistry"],
        "module_inputs": {"vastu": {"facing_direction": "East", "property_type": "Villa"}, "palmistry": {"hand_shape": "Earth hand"}},
        "agent_log": [], "errors": [], "memory": {},
    })
    insights = [i for q in state["admin_review"]["questions"] for i in q["insights"]]
    assert len(insights) >= 8
    for ins in insights:
        assert ins["sources"], ins["id"]
        assert ins["source_summary"]["headline"]
        for src in ins["sources"]:
            assert src["kind"] in ("book", "calculation", "input", "rule") and src["title"]
            if src["kind"] == "book":
                assert src["page"] >= 1 and src["line_start"] >= 1 and src["quote"] and src["location"].startswith("page ")
    by_domain = {}
    for ins in insights:
        by_domain.setdefault(ins["domains"][0] if len(ins["domains"]) == 1 else "all", ins)
    assert any(s["kind"] == "calculation" for s in by_domain["numerology"]["sources"])
    assert any(s["kind"] == "rule" for s in by_domain["tarot"]["sources"])
    assert any(s["kind"] == "input" for s in by_domain["vastu"]["sources"])


def test_a_pipeline_that_cannot_build_sources_still_gives_the_review(no_llm):
    from graph.pipeline import run_pipeline

    with patch("provenance.sources.attach_sources", side_effect=RuntimeError("boom")):
        state = run_pipeline({
            "user_profile": PROFILE, "user_id": "t", "user_question": "Career?", "questions": [],
            "selected_modules": ["numerology"], "module_inputs": {}, "agent_log": [], "errors": [], "memory": {},
        })
    insights = [i for q in state["admin_review"]["questions"] for i in q["insights"]]
    assert insights and all("sources" not in i for i in insights)
    assert any("sources skipped" in str(entry) for entry in state["agent_log"])


def test_360_flow_gives_every_chapter_its_sources(no_llm):
    from graph.holistic_pipeline import run_holistic_pipeline

    state = run_holistic_pipeline({"user_profile": PROFILE, "user_id": "t", "agent_log": [], "errors": [], "memory": {}})
    chapters = state["holistic_chapters"]
    assert len(chapters) == 14
    for chapter in chapters:
        assert chapter["source_summary"]["headline"]
        calc = next(s for s in chapter["sources"] if s["kind"] == "calculation")
        assert "Life Path: digits of 1991-03-14" in "\n".join(calc["detail"])
        # no AI is reachable here, so the wording is the built-in text, and the chapter says so
        assert chapter["text_origin"] == "template"
        assert any(s["kind"] == "rule" and "built into AstroIntel" in s["title"] for s in chapter["sources"])


def test_a_chapter_story_is_traced_to_the_books():
    chapters = [{
        "chapter_id": "life_path", "title": "Your Life Path",
        "story": "[HOOK] Calculating your Life Path Number is straightforward but requires reducing your full birth date to a single digit.\n[TENSION] Nothing else.",
    }]
    assert attach_chapter_sources(chapters, PROFILE) == 1
    book = chapters[0]["sources"][0]
    assert book["kind"] == "book" and (book["title"], book["page"]) == ("Core Numbers and Their Interpretation", 2)


def test_the_response_cache_key_changes_with_the_shape_of_the_response():
    from cache import store

    key = store.make_key("", [], "career", PROFILE)
    assert key.startswith("session__")
    assert store.RESPONSE_SCHEMA in "v2-sources"


# ── who wrote the wording ────────────────────────────────────────────────────
def test_wording_written_by_the_ai_is_labelled_as_the_ais():
    insight = _insight("numerology", "Indian Numerology", {"text_origin": "ai"}, content="Life Path 1 is a pioneer.")
    sources, summary = sources_for_insight(insight, _state())
    ai = [s for s in sources if s["kind"] == "ai"]
    assert len(ai) == 1 and "written by the AI" in ai[0]["title"]
    assert "ai" in summary["kinds"]


def test_wording_of_the_built_in_text_is_labelled_as_such():
    insight = _insight("numerology", "Indian Numerology", {"text_origin": "template"}, content="Life Path 1 is a pioneer.")
    sources, _ = sources_for_insight(insight, _state())
    rule = [s for s in sources if s["kind"] == "rule"]
    assert len(rule) == 1 and "built into AstroIntel" in rule[0]["title"] and "not from a published book" in rule[0]["title"]


def test_the_numerology_agent_records_who_wrote_the_wording(no_llm):
    from agents.numerology_agent import _run_sub_agent
    from utils.numerics import letter_map_indian

    sub = _run_sub_agent("Chandan Kumar", "1991-03-14", letter_map_indian(), "Indian Numerology", "career", "Career?")
    assert sub["extra"]["text_origin"] == "template"      # the AI is unreachable in this test


def test_a_chapter_written_by_the_model_says_so():
    story = (
        "[HOOK] You came here to lead. " + "x" * 80 + "\n[TENSION] But leading alone is heavy.\n[TURN] Allow help.\n"
        "[RESOLUTION] Share the load.\n[CLOSING] You are enough.\n[REMEDIES] Rest."
    )
    from agents.holistic_agent import CHAPTERS, _build_chapter, _core_numbers

    with patch("utils.deepseek_client.call", return_value=story):
        chapter = _build_chapter(CHAPTERS[0], "Chandan Kumar", "1991-03-14", _core_numbers("Chandan Kumar", "1991-03-14"))
    assert chapter["text_origin"] == "ai"
    ai, _ = chapter_sources_for(chapter)
    assert any(s["kind"] == "ai" for s in ai)


def chapter_sources_for(chapter):
    from provenance.sources import chapter_sources
    return chapter_sources(chapter, PROFILE)


# ── the passages the AI is given ─────────────────────────────────────────────
def _consecutive_units(index, book_id, page, start, count):
    units = [u for u in index.units if index.books[u[0]]["id"] == book_id and u[1] == page]
    return units[start: start + count]


def test_a_passage_cut_from_a_book_is_located_by_its_first_and_last_words():
    index = get_index()
    units = _consecutive_units(index, "Core-Numbers-and-Their-Interpretation", 5, 2, 6)
    passage = (
        "Indian Institute of Skill Development Training (IISDT) Empowering Skills. Transforming Lives. 5 | P a g e "
        "Copyright @ Indian Institute of Skill Development Training (IISDT), All Rights Reserved "
        + " ".join(u[4] for u in units)
    )
    found = index.locate_passage("Core Numbers and Their Interpretation", passage, 0.9)     # a retrieval names the book by its title
    assert found["title"] == "Core Numbers and Their Interpretation"
    assert (found["page"], found["page_end"]) == (5, 5)
    assert (found["line_start"], found["line_end"]) == (units[0][2], units[-1][3])
    assert found["score"] == 0.9 and found["quote"].startswith(units[0][4][:30])


def test_a_passage_that_runs_over_a_page_gives_both_pages():
    index = get_index()
    book = "Core-Numbers-and-Their-Interpretation"
    tail = _consecutive_units(index, book, 5, 0, 99)[-2:]
    head = _consecutive_units(index, book, 6, 0, 2)
    found = index.locate_passage(book, " ".join(u[4] for u in tail + head), 0.5)
    assert (found["page"], found["page_end"]) == (5, 6)
    assert location(found).startswith("pages 5-6 (line ")


def test_text_that_is_not_in_the_named_book_is_not_located():
    index = get_index()
    other_book = _consecutive_units(index, "Name-Numerology-and-Compatibility", 5, 0, 6)
    assert index.locate_passage("Core-Numbers-and-Their-Interpretation", " ".join(u[4] for u in other_book)) is None
    assert index.locate_passage("No Such Book", "x " * 30) is None
    assert index.locate_passage("Core-Numbers-and-Their-Interpretation", "too short") is None


def test_the_given_passages_become_sources_best_retrieved_first_without_duplicates():
    from provenance.sources import given_sources

    index = get_index()
    book = "Core-Numbers-and-Their-Interpretation"
    a = " ".join(u[4] for u in _consecutive_units(index, book, 5, 0, 5))
    b = " ".join(u[4] for u in _consecutive_units(index, book, 9, 0, 5))
    sources = given_sources([
        {"book": "Core Numbers and Their Interpretation", "text": a, "score": 0.5},
        {"book": "Core Numbers and Their Interpretation", "text": b, "score": 0.9},
        {"book": "Core Numbers and Their Interpretation", "text": a, "score": 0.4},     # the same passage again
    ], limit=3)
    assert [s["page"] for s in sources] == [9, 5]
    assert all(s["kind"] == "book" and s["relation"] == "given_to_ai" for s in sources)
    assert sources[0]["retrieval_score"] == 0.9


def test_a_finding_written_by_the_ai_lists_the_passages_it_was_given():
    index = get_index()
    text = " ".join(u[4] for u in _consecutive_units(index, "Core-Numbers-and-Their-Interpretation", 5, 0, 5))
    insight = _insight("numerology", "Indian Numerology", {
        "text_origin": "ai", "given_passages": [{"book": "Core Numbers and Their Interpretation", "text": text, "score": 0.8}],
    }, content="Your path rewards patience and steady effort in everything you build.")
    sources, summary = sources_for_insight(insight, _state())
    given = [s for s in sources if s.get("relation") == "given_to_ai"]
    assert len(given) == 1 and given[0]["page"] == 5
    assert summary["headline"] == "Written by the AI from 1 book passage; none says it word for word"
    assert summary["kinds"] == ["book", "calculation", "ai"]


@needs_index
def test_the_numerology_agent_keeps_the_passages_the_ai_was_given():
    from agents.numerology_agent import _run_sub_agent
    from utils.numerics import letter_map_indian

    reading = "You build slowly and surely, and the next two years reward the patience that you have shown. " * 3
    with patch("utils.deepseek_client.call", return_value=reading):
        ai = _run_sub_agent("Chandan Kumar", "1991-03-14", letter_map_indian(), "Indian Numerology", "career", "What about my career?")
    assert ai["extra"]["text_origin"] == "ai"
    given = ai["extra"]["given_passages"]
    assert given and all({"book", "text", "score"} <= set(p) for p in given)
    with patch("utils.deepseek_client.call", return_value=None):
        template = _run_sub_agent("Chandan Kumar", "1991-03-14", letter_map_indian(), "Indian Numerology", "career", "What about my career?")
    assert template["extra"]["given_passages"] == []      # nothing was given to an AI that did not write it


@needs_index
def test_a_chapter_written_by_the_ai_lists_its_passages_and_drops_the_raw_text():
    story = (
        "[HOOK] You came here to lead. " + "x" * 80 + "\n[TENSION] But leading alone is heavy.\n[TURN] Allow help.\n"
        "[RESOLUTION] Share the load.\n[CLOSING] You are enough.\n[REMEDIES] Rest."
    )
    from graph.holistic_pipeline import run_holistic_pipeline

    with patch("utils.deepseek_client.call", return_value=story):
        state = run_holistic_pipeline({"user_profile": PROFILE, "user_id": "t", "agent_log": [], "errors": [], "memory": {}})
    chapters = state["holistic_chapters"]
    assert all(c["text_origin"] == "ai" for c in chapters)
    assert all("_passages" not in c for c in chapters)              # the raw passages are not sent to the client
    first = chapters[0]
    given = [s for s in first["sources"] if s.get("relation") == "given_to_ai"]
    assert given and all(s["page"] >= 1 and s["line_start"] >= 1 for s in given)
    assert first["source_summary"]["headline"].startswith("Written by the AI from ")


def test_remedy_citations_say_the_page_and_lines_of_the_passage():
    from agents.remedies_agent import build_remedies

    index = get_index()
    units = _consecutive_units(index, "Numerology-in-Daily-Life-and-Remedies", 8, 0, 6)
    chunk = {"book": "Numerology in Daily Life and Remedies", "text": " ".join(u[4] for u in units), "score": 0.8}
    answer = json.dumps([{"icon": "🌅", "category": "Daily practice", "text": units[0][4][:60], "sources": ["S1"]}])
    result = build_remedies(1, "career", [chunk], llm=lambda system, user: answer)
    citation = result["citations"][0]
    assert citation["title"] == "Numerology in Daily Life and Remedies"
    assert citation["page"] == 8 and citation["line_start"] == units[0][2]
    assert citation["location"].startswith("page 8, lines ")


def test_a_remedy_citation_without_a_location_is_still_returned(monkeypatch):
    from agents.remedies_agent import build_remedies

    monkeypatch.setattr("provenance.books.get_index", lambda: None)
    chunk = {"book": "Unknown Book", "text": "Chant a mantra at sunrise every day for focus and calm in the morning hours.", "score": 0.5}
    answer = json.dumps([{"icon": "🕉", "category": "Mantra", "text": "Chant a mantra at sunrise every day", "sources": ["S1"]}])
    result = build_remedies(1, "career", [chunk], llm=lambda system, user: answer)
    assert result["citations"][0]["title"] == "Unknown Book" and "location" not in result["citations"][0]
