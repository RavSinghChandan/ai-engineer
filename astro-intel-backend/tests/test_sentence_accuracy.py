"""
How often a book reference is wrong or missing, measured on data that has a known answer:

  * false matches: sentences of the app's own astrology, tarot, palmistry and vastu texts,
    which the numerology books do not say; they must (almost) never get a book reference
  * recall: sentences cut from the books (with words removed, or quoted inside the AI's own
    sentence) must be found at their own book and page
"""
from __future__ import annotations

import ast
import random
from pathlib import Path

import pytest

from provenance.books import get_index
from provenance.sentences import book_refs, sentence_trail, split_sentences

AGENTS = Path(__file__).resolve().parent.parent / "agents"
PROFILE = {"full_name": "Rohan Mehta", "date_of_birth": "1991-03-14"}


def _other_domain_sentences():
    out = []
    for name in ("astrology_agent", "tarot_agent", "palmistry_agent", "vastu_agent"):
        for node in ast.walk(ast.parse((AGENTS / f"{name}.py").read_text())):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) > 60:
                out += [s for s in split_sentences(node.value) if len(s.split()) >= 7 and "{" not in s]
    return list(dict.fromkeys(out))


def test_texts_the_books_do_not_say_almost_never_get_a_book_reference():
    sentences = _other_domain_sentences()
    assert len(sentences) > 150
    wrong = [s for s in sentences if book_refs(s, [])]
    assert len(wrong) / len(sentences) <= 0.02, wrong


def _sample(count=120):
    index = get_index()
    candidates = [u for u in index.units if 70 <= len(u[4]) <= 250 and u[4][0].isupper()]
    return index, random.Random(3).sample(candidates, count)


@pytest.mark.parametrize("keep_every,minimum", [({4}, 0.97), ({1, 3}, 0.9)])
def test_a_book_sentence_with_words_removed_is_found_at_its_page(keep_every, minimum):
    index, units = _sample()
    found = 0
    for unit in units:
        words = unit[4].split()
        sentence = " ".join(w for i, w in enumerate(words) if i % 5 not in keep_every)
        title = index.books[unit[0]]["title"]
        found += any((r["title"], r["page"]) == (title, unit[1]) for r in book_refs(sentence, []))
    assert found / len(units) >= minimum


def test_a_book_phrase_quoted_inside_the_ais_own_sentence_is_found():
    index, units = _sample()
    found = 0
    for unit in units:
        words = unit[4].split()
        phrase = " ".join(w for i, w in enumerate(words) if i % 5 != 4)
        sentence = f'Your Personal Year opens a new door, and the book is explicit that "{phrase}" so expect change in how you earn.'
        title = index.books[unit[0]]["title"]
        found += any((r["title"], r["page"]) == (title, unit[1]) for r in book_refs(sentence, []))
    assert found / len(units) >= 0.95


def test_a_claim_that_a_book_says_it_does_not_make_it_so():
    """The AI writes "the book's case study shows ..."; the trail checks the books and says what it finds."""
    sentence = ("What Indian Numerology adds here that other systems miss is the karma angle: your 9 year is asking "
                "you to settle debts, because the book's case study shows that completing unfinished tasks in a 9 year "
                "is precisely what lets the next cycle open cleanly.")
    refs = sentence_trail(sentence, PROFILE, "Indian Numerology", "ai", [])[0]["refs"]
    assert [r["kind"] for r in refs] == ["ai"]
