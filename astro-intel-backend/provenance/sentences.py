"""
Where each SENTENCE of a finding comes from.

A finding is split into its sentences, and every sentence gets its own references:

  book         a sentence of the numerology books, with its exact page and lines:
                 "says_same"       the book says nearly the same (most key words shared)
                 "part_says_same"  a quoted phrase or clause of the sentence is nearly word for word
                                   in the book (the reference shows which part)
                 "closest_given"   the closest sentence inside the passages the AI was given for
                                   this finding (the AI paraphrased it)
  calculation  a number the sentence states (Life Path 9, Personal Year 1 in 2026 ...), with the
               steps that give it. When the sentence states a number that the calculation does not
               give, the reference says so.
  ai           the sentence has no book sentence behind it: the meaning is the AI's own wording
  rule         the same, for the text built into AstroIntel (no AI involved)

Nothing is invented: a book reference is only given when the sentence shares most of its key words
with a book sentence (see provenance/books.py), and a sentence that has none says so.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional

from provenance.books import get_index, location
from provenance.sources import _LETTER_MAPS, _chain, _tradition_key
from utils import numerics

# A sentence inside a passage that was given to the AI needs fewer shared words than one found in
# any book: the AI paraphrases, and the passage is known to be where it read it.
CLOSEST_MIN_COVERAGE = 0.5
CLOSEST_MIN_DISTINCTIVE = 2

_ABBREVIATIONS = ("e.g", "i.e", "vs", "etc", "dr", "mr", "mrs", "ms", "no", "approx", "st")
_LABEL = re.compile(r"^\s*(\[[A-Z_ ]{3,20}\])\s*")
_BREAK = re.compile(r"(?<=[.!?])[\"')”]*\s+(?=[\[\"'(“]?[A-Z0-9])")


def split_sentences(text: str) -> List[str]:
    """The sentences of a text, in order. A [HOOK]-style label stays with its first sentence."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    sentences: List[str] = []
    start = 0
    for match in _BREAK.finditer(text):
        piece = text[start: match.start() + 1 + len(re.match(r"[\"')”]*", text[match.start() + 1:]).group(0))].strip()
        last_word = re.findall(r"([A-Za-z]+)\.?$", piece[:-1]) if piece.endswith(".") else []
        previous = last_word[-1].lower() if last_word else ""
        if piece.endswith(".") and (previous in _ABBREVIATIONS or (len(previous) == 1 and previous.isalpha())):
            continue                                   # "e.g." / "Dr." / "J." do not end a sentence
        sentences.append(piece)
        start = match.end()
    tail = text[start:].strip()
    if tail:
        sentences.append(tail)
    return _join_labels(sentences)


def _join_labels(sentences: List[str]) -> List[str]:
    """A lone label such as "[HOOK]" is not a sentence: it joins the sentence after it."""
    out: List[str] = []
    carry = ""
    for sentence in sentences:
        if _LABEL.fullmatch(sentence.strip()):
            carry = sentence.strip() + " "
            continue
        out.append(carry + sentence)
        carry = ""
    if carry:
        out.append(carry.strip())
    return out


# ── the numbers a sentence states ────────────────────────────────────────────
_STATED = re.compile(
    r"\b(life\s*path|destiny|soul\s*urge|name|personality)(?:\s*number)?(?:\s*(?:is|of|=|:))?\s*(\d{1,2})\b",
    re.I,
)
_PERSONAL_YEAR = re.compile(
    r"\bpersonal\s*year\s*(?:number\s*)?(\d{1,2})(?!\d)(?:\s*(?:in|of|for|during)\s*(20\d\d))?", re.I)
# "your 2026 Personal Year 5" and "your Personal Year 2026 is a 5" / "becomes a 6"
_YEAR_THEN_NUMBER = re.compile(r"\b(20\d\d)\s*personal\s*year\s*(?:number\s*)?(\d{1,2})(?!\d)", re.I)
_YEAR_IS_NUMBER = re.compile(
    r"\bpersonal\s*year\s*(20\d\d)\s*(?:is|will be|=|becomes|turns into|brings)\s*(?:a |an |number )?(\d{1,2})(?!\d)", re.I)


class NumberFacts:
    """The numbers of a person by one tradition's letter table, each with the steps that give it."""

    def __init__(self, profile: Any, sub_agent: str) -> None:
        def get(key: str) -> str:
            if isinstance(profile, dict):
                return str(profile.get(key, "") or "")
            return str(getattr(profile, key, "") or "")

        self.name, self.dob = get("full_name"), get("date_of_birth")
        self.key = _tradition_key(sub_agent)
        self.facts: Dict[str, Dict[str, Any]] = {}
        if not self.dob:
            return
        lmap = _LETTER_MAPS[self.key]()
        digits = numerics.dob_digits(self.dob)
        total = sum(digits)
        self.facts["life path"] = {
            "label": "Life Path", "value": numerics.life_path(self.dob),
            "line": f"Life Path: digits of {self.dob} added, {'+'.join(str(d) for d in digits)} = {_chain(total)}",
        }
        self.facts["destiny"] = {
            "label": "Destiny Number", "value": numerics.destiny_number(self.dob),
            "line": f"Destiny Number: same sum as the Life Path in this method = {_chain(total)}",
        }
        letters = [c for c in self.name.upper() if c.isalpha()]
        if letters:
            vowels = [c for c in letters if c in numerics.VOWELS]
            consonants = [c for c in letters if c not in numerics.VOWELS]
            sums = {
                "name": ("Name Number", letters, "letters"),
                "soul urge": ("Soul Urge", vowels, "vowels"),
                "personality": ("Personality", consonants, "consonants"),
            }
            for fact_key, (label, chosen, what) in sums.items():
                values = " + ".join(str(lmap.get(c, 0)) for c in chosen) or "0"
                self.facts[fact_key] = {
                    "label": label,
                    "value": numerics.reduce_number(sum(lmap.get(c, 0) for c in chosen)) or 1,
                    "line": f"{label}: {what} of {self.name.upper()} by the {self.key.capitalize()} letter table, "
                            f"{values} = {_chain(sum(lmap.get(c, 0) for c in chosen))}",
                }

    def personal_year(self, year: int) -> Optional[Dict[str, Any]]:
        try:
            month, day = int(self.dob.split("-")[1]), int(self.dob.split("-")[2])
        except (IndexError, ValueError):
            return None
        total = month + day + year
        return {
            "label": f"Personal Year {year}", "value": numerics.reduce_number(total),
            "line": f"Personal Year {year}: birth month {month} + birth day {day} + {year} = {_chain(total)}",
        }


def _canonical(word: str) -> str:
    word = re.sub(r"\s+", " ", word.lower())
    return "name" if word == "name" else word


# "Life Path 3 types often generate income": the number is a category of the book, not the person's
_CATEGORY = re.compile(r"\s*(?:types?|people|persons?|individuals?|natives?|folks|born|numbers?\s+(?:are|is|can|often|tend))", re.I)
_PERSONAL_YEAR_VALUE = re.compile(
    r"\bpersonal\s*year\s*(?:number\s*)?(?:turns\s+to|turns\s+into|becomes|will\s+be|is|=|:)?\s*(?:a\s+|an\s+)?(\d{1,2})(?!\d)", re.I)
_YEAR = re.compile(r"\b(20\d\d)\b")


def _quoted_spans(sentence: str) -> List[range]:
    quotes = [i for i, c in enumerate(sentence) if c in '"\u201c\u201d']
    return [range(a, b) for a, b in zip(quotes[::2], quotes[1::2])]


def _in_quotes(position: int, spans: List[range]) -> bool:
    return any(position in span for span in spans)


def _year_for(sentence: str, position: int) -> Optional[int]:
    """The year a personal year is said to be in: the one right after it, else the nearest one."""
    years = [(m.start(), int(m.group(1))) for m in _YEAR.finditer(sentence)]
    if not years:
        return None
    after = [(at, y) for at, y in years if 0 <= at - position <= 40]
    if after:
        return min(after)[1]
    return min(years, key=lambda item: abs(item[0] - position))[1]


def number_refs(sentence: str, facts: NumberFacts) -> List[Dict[str, Any]]:
    """
    A calculation reference for each number that the sentence states about the person.
    A number a book gives for a whole type of people ("Life Path 3 types") or inside a quotation is
    not checked, and a personal year whose year the sentence does not say is not guessed.
    """
    refs: List[Dict[str, Any]] = []
    seen = set()
    quoted = _quoted_spans(sentence)

    def add(fact: Dict[str, Any], stated: int, shown: str) -> None:
        if shown in seen:
            return
        seen.add(shown)
        ok = fact["value"] == stated
        detail = [fact["line"]]
        if not ok:
            detail.append(f"The sentence says {stated}, but the calculation gives {fact['value']}")
        refs.append({"kind": "calculation", "title": shown, "detail": detail, "ok": ok})

    for m in _STATED.finditer(sentence):
        if _in_quotes(m.start(), quoted) or _CATEGORY.match(sentence, m.end()):
            continue
        fact = facts.facts.get(_canonical(m.group(1)))
        if fact:
            add(fact, int(m.group(2)), f"{fact['label']} {m.group(2)}")

    # personal years: "Personal Year 5 in 2026", "Personal Year 2026 is a 5", "your Personal Year turns to 1" (in 2027)
    stated_years: List[tuple] = []
    for pattern in (_YEAR_THEN_NUMBER, _YEAR_IS_NUMBER):
        stated_years += [(m.start(), int(m.group(1)), int(m.group(2))) for m in pattern.finditer(sentence)]
    explicit = [(m.start(), int(m.group(2)), int(m.group(1))) for m in _PERSONAL_YEAR.finditer(sentence) if m.group(2)]
    stated_years += explicit
    taken = {at for at, _, _ in stated_years}
    for m in _PERSONAL_YEAR_VALUE.finditer(sentence):
        if m.start() in taken or re.match(r"20\d\d", m.group(1)) or _in_quotes(m.start(), quoted):
            continue
        year = _year_for(sentence, m.start())
        if year is not None:
            stated_years.append((m.start(), year, int(m.group(1))))
    for at, year, stated in stated_years:
        if _in_quotes(at, quoted):
            continue
        fact = facts.personal_year(year)
        if fact:
            add(fact, stated, f"Personal Year {stated} in {year}")
    return refs


# ── the books ────────────────────────────────────────────────────────────────
def _book_ref(passage: Dict[str, Any], relation: str) -> Dict[str, Any]:
    return {
        "kind": "book", "relation": relation, "title": passage["title"], "series": passage["series"],
        "page": passage["page"], "line_start": passage["line_start"], "line_end": passage["line_end"],
        "location": location(passage), "quote": passage["quote"], "match": passage["match"],
    }


_QUOTED = re.compile(r"[\"\u201c]([^\"\u201d]{12,})[\"\u201d]")
_CLAUSE_SPLIT = re.compile(
    r"\s+[\u2014\u2013-]\s+|;\s+|:\s+|,\s+(?:while|because|so|which|meaning|and|but|whereas|since|then)\s+", re.I)
MIN_FRAGMENT_WORDS = 6
MAX_PART_REFS = 2
# A sentence or a part must share at least this many key words with the book sentence ...
MIN_TERMS_WHOLE = 4
# ... and a part (a quoted phrase or clause) must be nearly word for word in it.
PART_MIN_COVERAGE = 0.8
PART_MIN_TERMS = 4
PART_MIN_DISTINCTIVE = 3


def fragments(sentence: str) -> List[str]:
    """The quoted phrases and the clauses of a sentence: the AI often quotes or follows a book for part of it."""
    parts = [m.group(1).strip() for m in _QUOTED.finditer(sentence)]
    for clause in _CLAUSE_SPLIT.split(sentence):
        parts.append(clause.strip(" ,.\"\u201c\u201d"))
    seen, out = set(), []
    for part in parts:
        key = part.lower()
        if key and key not in seen and len(part.split()) >= MIN_FRAGMENT_WORDS and part != sentence.strip(" .\""):
            seen.add(key)
            out.append(part)
    return out


def book_refs(sentence: str, given: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Book references of a sentence: the whole sentence if a book says nearly the same, otherwise
    the closest sentence inside the passages given to the AI, and the parts (quoted phrases and
    clauses) that a book says nearly word for word.
    """
    index = get_index()
    if index is None:
        return []
    said = index.best_match(sentence, min_terms=MIN_TERMS_WHOLE)
    if said is not None:
        return [_book_ref(said, "says_same")]
    refs: List[Dict[str, Any]] = []
    best: Optional[Dict[str, Any]] = None
    for passage in given:
        first, last = passage.get("units", (0, -1))
        found = index.best_match(
            sentence, min_coverage=CLOSEST_MIN_COVERAGE, min_terms=MIN_TERMS_WHOLE, lo=first, hi=last,
            min_distinctive=CLOSEST_MIN_DISTINCTIVE,
        )
        if found is not None and (best is None or found["match"] > best["match"]):
            best = found
    if best is not None:
        refs.append(_book_ref(best, "closest_given"))
    seen = {(r["title"], r["page"], r["line_start"]) for r in refs}
    for part in fragments(sentence):
        found = index.best_match(part, min_coverage=PART_MIN_COVERAGE, min_terms=PART_MIN_TERMS,
                                 min_distinctive=PART_MIN_DISTINCTIVE)
        if found is None:
            continue
        key = (found["title"], found["page"], found["line_start"])
        if key in seen:
            continue
        seen.add(key)
        ref = _book_ref(found, "part_says_same")
        ref["part"] = part
        refs.append(ref)
        if len(refs) >= MAX_PART_REFS + (1 if best is not None else 0):
            break
    return refs


# ── one finding ──────────────────────────────────────────────────────────────
def sentence_trail(text: str, profile: Any, sub_agent: str, origin: str,
                   given: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    [{"text": sentence, "refs": [...]}] for the sentences of a finding.
    `origin` is who wrote the wording: "ai", "template", or "" when it is not known.
    `given` are the passages the AI was given, as found in their books (provenance.sources.locate_given).
    """
    facts = NumberFacts(profile, sub_agent)
    trail: List[Dict[str, Any]] = []
    for sentence in split_sentences(text):
        refs = number_refs(sentence, facts)
        books = book_refs(sentence, given)
        if books:
            refs = books + refs
        elif origin == "ai":
            refs.append({
                "kind": "ai", "title": "The AI's own wording",
                "detail": ["No book sentence says this, and none of the passages the AI was given is close to it"],
            })
        elif origin == "template":
            refs.append({
                "kind": "rule", "title": "Built into AstroIntel, not from a published book",
                "detail": ["No book sentence says this"],
            })
        trail.append({"text": sentence, "refs": refs})
    return trail
