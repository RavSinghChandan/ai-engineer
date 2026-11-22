"""
Where each sentence of a finding comes from: splitting, the numbers a sentence states, the
book sentences behind it (whole, quoted part, or closest in the passages the AI was given),
and the honest "no source" answer.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from provenance.books import get_index
from provenance.sentences import NumberFacts, fragments, number_refs, sentence_trail, split_sentences
from provenance.sources import attach_chapter_sources, attach_sources, locate_given

# The FAISS index is a build artefact (git-ignored): the tests that retrieve passages need it.
from pathlib import Path as _Path
needs_index = pytest.mark.skipif(
    not (_Path(__file__).resolve().parent.parent / "numerology_rag" / "index" / "faiss.index").exists(),
    reason="numerology_rag/index/faiss.index is not built",
)

PROFILE = {"full_name": "Rohan Mehta", "date_of_birth": "1994-08-14"}


# ── splitting ────────────────────────────────────────────────────────────────
def test_a_paragraph_is_split_into_its_sentences():
    text = "You build slowly. The next year rewards patience! Does it? Yes, it does."
    assert split_sentences(text) == ["You build slowly.", "The next year rewards patience!", "Does it?", "Yes, it does."]


@pytest.mark.parametrize("text,count", [
    ("Use a gem, e.g. a ruby, on Sundays. It helps.", 2),
    ("Dr. Rao teaches this. It is old.", 2),
    ("Your total is 1.5 times larger. That is fine.", 2),
    ("Born under the sun, J. K. Rowling thrived. So can you.", 2),
])
def test_abbreviations_and_decimals_do_not_end_a_sentence(text, count):
    assert len(split_sentences(text)) == count


def test_a_story_label_stays_with_its_first_sentence():
    story = "[HOOK] You came to lead. It is heavy. [TENSION] But you are not alone."
    assert split_sentences(story) == ["[HOOK] You came to lead.", "It is heavy.", "[TENSION] But you are not alone."]


def test_an_empty_text_has_no_sentences():
    assert split_sentences("") == [] and split_sentences("   ") == []


# ── the numbers a sentence states ────────────────────────────────────────────
def _facts():
    return NumberFacts(PROFILE, "Indian Numerology")


def test_a_correct_number_is_shown_with_its_steps():
    refs = number_refs("Your Life Path 9, Destiny 9 and Name Number 3 shape your path.", _facts())
    assert [(r["title"], r["ok"]) for r in refs] == [("Life Path 9", True), ("Destiny Number 9", True), ("Name Number 3", True)]
    assert refs[0]["detail"] == ["Life Path: digits of 1994-08-14 added, 1+9+9+4+0+8+1+4 = 36 → 9"]


def test_a_wrong_number_is_flagged_with_the_right_one():
    refs = number_refs("Your Soul Urge 9 is the key.", _facts())
    assert refs[0]["ok"] is False
    assert refs[0]["detail"][-1] == "The sentence says 9, but the calculation gives 5"


@pytest.mark.parametrize("sentence,title,ok", [
    ("Your Personal Year 5 in 2026 opens doors.", "Personal Year 5 in 2026", True),
    ("Your Personal Year 2026 is a 5 and brings change.", "Personal Year 5 in 2026", True),
    ("Then Personal Year 2027 becomes a 6.", "Personal Year 6 in 2027", True),
    ("Your 2026 Personal Year 3 is bright.", "Personal Year 3 in 2026", False),
    ("Your Personal Year 9 in 2025 was a clearing.", "Personal Year 9 in 2025", False),
])
def test_personal_years_are_worked_out_from_the_birth_month_and_day(sentence, title, ok):
    refs = number_refs(sentence, _facts())
    assert [(r["title"], r["ok"]) for r in refs] == [(title, ok)]
    assert "birth month 8 + birth day 14" in refs[0]["detail"][0]


@pytest.mark.parametrize("sentence", [
    'The book notes Life Path 3 types "often generate income" through their art.',     # a type of people in a book
    "Life Path 3 people thrive in creative work.",
    'The text says "Personal Year 5" is a year of change.',                           # inside a quotation
    "Your Personal Year 1 is a fresh start.",                                         # no year: not guessed
])
def test_numbers_that_are_not_about_the_person_are_not_checked(sentence):
    assert number_refs(sentence, _facts()) == []


def test_the_year_of_a_personal_year_is_the_one_the_sentence_says():
    facts = NumberFacts({"full_name": "Rohan Mehta", "date_of_birth": "1991-03-14"}, "Indian Numerology")
    # 3 + 14 + 2027 = 2044 -> 10 -> 1
    refs = number_refs("Do this through 2026 so that when your Personal Year 1 opens in 2027, the channel is clear.", facts)
    assert [(r["title"], r["ok"]) for r in refs] == [("Personal Year 1 in 2027", True)]
    refs = number_refs("The real shift arrives in 2027 when your Personal Year turns to 1.", facts)
    assert [(r["title"], r["ok"]) for r in refs] == [("Personal Year 1 in 2027", True)]
    refs = number_refs("The real shift arrives in 2026 when your Personal Year turns to 1.", facts)      # 2026 is a 9
    assert [(r["title"], r["ok"]) for r in refs] == [("Personal Year 1 in 2026", False)]


def test_a_year_is_not_read_as_a_personal_year_number():
    # "Personal Year 2026" must not be read as the number 20
    assert all("20 in" not in r["title"] for r in number_refs("Your Personal Year 2026 is a 5.", _facts()))


def test_a_sentence_without_numbers_has_no_calculation():
    assert number_refs("Patience rewards you.", _facts()) == []
    assert NumberFacts({"full_name": "Ann"}, "Indian Numerology").facts == {}


# ── the books ────────────────────────────────────────────────────────────────
def _unit_text(book_id, page, nth):
    index = get_index()
    return [u for u in index.units if index.books[u[0]]["id"] == book_id and u[1] == page][nth]


def test_a_sentence_a_book_says_is_found_at_its_page_and_lines():
    unit = _unit_text("Core-Numbers-and-Their-Interpretation", 2, 3)
    trail = sentence_trail(unit[4], PROFILE, "Indian Numerology", "ai", [])
    book = trail[0]["refs"][0]
    assert (book["kind"], book["relation"], book["page"], book["line_start"]) == ("book", "says_same", 2, unit[2])
    assert book["title"] == "Core Numbers and Their Interpretation"


def test_a_quoted_phrase_the_ai_took_from_a_book_is_shown_with_the_part():
    text = ('Your Personal Year 2026 is a 5, and the book is explicit that 5 is "a year of change, freedom, and '
            'exploration", so expect sudden openings in work and in the way you earn your living.')
    refs = sentence_trail(text, PROFILE, "Indian Numerology", "ai", [])[0]["refs"]
    part = next(r for r in refs if r["kind"] == "book")
    assert part["relation"] == "part_says_same" and part["part"] == "a year of change, freedom, and exploration"
    assert (part["title"], part["page"]) == ("Introduction to Numerology", 44)
    assert any(r["kind"] == "calculation" and r["ok"] for r in refs)


def test_fragments_are_quoted_phrases_and_clauses_of_enough_words():
    parts = fragments('Money arrives late, because you scatter your energy over many things; focus on "one steady stream of income each month" now.')
    assert "one steady stream of income each month" in parts
    assert any(p.startswith("you scatter your energy") for p in parts)
    assert all(len(p.split()) >= 6 for p in parts)


def test_the_closest_sentence_in_a_passage_the_ai_was_given_is_found():
    """A sentence that the books do not say closely enough, but that is close to one the AI was given."""
    index = get_index()
    units = [u for u in index.units if index.books[u[0]]["id"] == "Numerology-in-Daily-Life" and u[1] == 25]
    at = next(i for i, u in enumerate(units) if "take risks and embrace change" in u[4])
    passage_text = " ".join(u[4] for u in units[max(0, at - 1): at + 5])
    given = locate_given([{"book": "Numerology in Daily Life", "text": passage_text, "score": 0.9}], 2)
    sentence = units[at][4]
    for extra in ("gratitude", "kindness", "courage", "honesty", "humility", "loyalty", "forgiveness", "generosity"):
        if index.best_match(sentence) is None:
            break
        sentence = f"{sentence.rstrip('.')} and always with {extra}."      # more of the AI's own words
    assert index.best_match(sentence) is None                              # no book says it closely enough ...
    book = next(r for r in sentence_trail(sentence, PROFILE, "Indian Numerology", "ai", given)[0]["refs"] if r["kind"] == "book")
    assert book["relation"] == "closest_given"                             # ... but it is close to a sentence the AI was given
    assert book["page"] == 25 and book["line_start"] == units[at][2]


def test_a_near_paraphrase_of_a_book_sentence_is_found_without_any_given_passage():
    sentence = "In a Personal Year 5 it is an excellent time to take risks and embrace change, meaning a new job or project may be right for you."
    books = [r for r in sentence_trail(sentence, PROFILE, "Indian Numerology", "ai", [])[0]["refs"] if r["kind"] == "book"]
    assert books and books[0]["relation"] == "says_same" and (books[0]["page"], books[0]["title"]) == (25, "Numerology in Daily Life")


@pytest.mark.parametrize("origin,kind", [("ai", "ai"), ("template", "rule")])
def test_a_sentence_without_a_source_says_whose_wording_it_is(origin, kind):
    refs = sentence_trail("Wear copper on Tuesdays and avoid new contracts at dusk.", PROFILE, "Indian Numerology", origin, [])[0]["refs"]
    assert [r["kind"] for r in refs] == [kind]
    assert "No book sentence says this" in refs[0]["detail"][0]


def test_a_sentence_keeps_its_number_references_beside_the_ai_note():
    refs = sentence_trail("Your Life Path 9 mark you as a finisher of every cycle.", PROFILE, "Indian Numerology", "ai", [])[0]["refs"]
    assert [r["kind"] for r in refs] == ["calculation", "ai"]


def test_without_the_index_a_sentence_still_gets_its_numbers_and_the_ai_note(monkeypatch):
    monkeypatch.setattr("provenance.sentences.get_index", lambda: None)
    refs = sentence_trail("Your Life Path 9 shapes you.", PROFILE, "Indian Numerology", "ai", [])[0]["refs"]
    assert [r["kind"] for r in refs] == ["calculation", "ai"]


# ── attached to the findings of both flows ───────────────────────────────────
def test_every_sentence_of_a_finding_gets_its_references():
    text = "Your Life Path 9 marks a finisher. Chant a mantra at sunrise."
    review = {"questions": [{"question": "q", "intent": "career", "insights": [{
        "id": "q1_i1", "content": text, "domains": ["numerology"], "sub_agent": "Indian Numerology",
        "detail": {"text_origin": "ai", "given_passages": []},
    }]}]}
    attach_sources(review, {"user_profile": PROFILE, "memory": {}, "module_inputs": {}})
    sentences = review["questions"][0]["insights"][0]["sentences"]
    assert [s["text"] for s in sentences] == ["Your Life Path 9 marks a finisher.", "Chant a mantra at sunrise."]
    assert all(s["refs"] for s in sentences)


def test_every_sentence_of_a_chapter_gets_its_references():
    chapters = [{"chapter_id": "life_path", "title": "Your Life Path", "text_origin": "template",
                 "story": "[HOOK] Your Life Path 9 is the key. [TENSION] Every strength has a cost."}]
    attach_chapter_sources(chapters, PROFILE)
    sentences = chapters[0]["sentences"]
    assert [s["text"] for s in sentences] == ["[HOOK] Your Life Path 9 is the key.", "[TENSION] Every strength has a cost."]
    assert sentences[0]["refs"][0]["kind"] == "calculation"


def test_a_failure_while_tracing_sentences_leaves_an_empty_trail_and_keeps_the_sources():
    review = {"questions": [{"question": "q", "intent": "c", "insights": [{
        "id": "q1_i1", "content": "Your Life Path 9 marks a finisher.", "domains": ["numerology"],
        "sub_agent": "Indian Numerology", "detail": {"text_origin": "ai"},
    }]}]}
    with patch("provenance.sentences.sentence_trail", side_effect=RuntimeError("boom")):
        attach_sources(review, {"user_profile": PROFILE, "memory": {}, "module_inputs": {}})
    ins = review["questions"][0]["insights"][0]
    assert ins["sentences"] == [] and ins["sources"]


@needs_index
def test_the_retriever_loads_once_even_when_chapters_ask_at_the_same_time():
    from concurrent.futures import ThreadPoolExecutor
    from numerology_rag import retriever

    retriever._index = retriever._metadata = retriever._model = None
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda i: retriever.retrieve("Life Path 1 career numerology", intent="career", numbers=[1], top_k=2), range(4)))
    assert all(len(r) == 2 for r in results)
