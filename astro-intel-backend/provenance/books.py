"""
Find where a statement comes from in the numerology books.

The index (numerology_rag/provenance/books.json, built by provenance/build_index.py)
holds every sentence of the 12 books with its book, page and lines. A statement is
matched to the sentences that say the same: the share of its key terms (weighted by
how rare they are) that one sentence, or two neighbouring ones, contains. A match
below the bar is not reported, so a statement the books do not make gets no book.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, Optional

INDEX_PATH = Path(__file__).resolve().parent.parent / "numerology_rag" / "provenance" / "books.json"

# A statement needs at least this share of its key terms in the passage ...
MIN_COVERAGE = 0.7
# ... and at least this many of them, so a short statement cannot match by chance.
MIN_TERMS = 3
# ... which must make up this share of the passage's own terms: a long passage that merely
# contains the words of a statement somewhere (a table, a list) is not what says it.
MIN_DENSITY = 0.2
# Words every book uses ("life", "path", "number", digits) say little: at least this many of the
# matched terms must be distinctive ones.
MIN_DISTINCTIVE = 3
DISTINCTIVE_IDF = 2.5
MAX_CANDIDATES = 400

_STOP = frozenset("""
a about above after again all also am an and any are as at be because been before being below between both
but by can cannot could did do does doing down during each few for from further had has have having he her
here hers herself him himself his how i if in into is it its itself just may me might more most must my
myself no nor not now of off on once only or other our ours ourselves out over own same she should so some
such than that the their theirs them themselves then there these they this those through to too under until
up very was we were what when where which while who whom why will with would you your yours yourself
yourselves from perspective period indicates indicated suggests suggest shows show strongly together
""".split())

_WORD = re.compile(r"[a-z]+|\d+")
# "Life Path 1", "Destiny Number 8", "master number 22": the number a statement is about
_ANCHOR = re.compile(
    r"\b(?:life\s*paths?|destiny(?:\s*numbers?)?|soul\s*urge(?:\s*numbers?)?|personality(?:\s*numbers?)?|"
    r"name\s*numbers?|expression(?:\s*numbers?)?|master\s*numbers?|personal\s*years?|numbers?)\s+(\d{1,2})\b",
    re.I,
)
# The running header of a page, which is inside the text of a chunk but is not part of the page's lines.
_RUNNING_HEADER = re.compile(
    r"Indian Institute of Skill Development Training \(IISDT\)|Empowering Skills\. Transforming Lives\.|"
    r"\d+\s*\|\s*P\s*a\s*g\s*e|Copyright @ Indian Institute of Skill Development Training \(IISDT\), All Rights Reserved|"
    r"Diploma in Numerology",
    re.I,
)
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"(])")


def _stem(word: str) -> str:
    if word.isdigit() or len(word) <= 4:
        return word
    for suffix in ("ing", "ed", "es", "ly", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def tokens(text: str) -> FrozenSet[str]:
    found = (_stem(w) for w in _WORD.findall(text.lower().replace("-", " ")))
    return frozenset(w for w in found if w not in _STOP and (w.isdigit() or len(w) >= 3))


class BookIndex:
    def __init__(self, data: Dict[str, Any]) -> None:
        self.books: List[Dict[str, Any]] = data["books"]
        self.units: List[list] = data["units"]
        self.line_numbering: str = data.get("line_numbering", "")
        self._tokens: List[FrozenSet[str]] = [tokens(u[4]) for u in self.units]
        postings: Dict[str, List[int]] = {}
        for i, toks in enumerate(self._tokens):
            for t in toks:
                postings.setdefault(t, []).append(i)
        self._postings = postings
        n = len(self.units)
        self._idf = {t: math.log(1 + n / len(ids)) for t, ids in postings.items()}

    # ── matching ──────────────────────────────────────────────────────────────
    def _window(self, i: int) -> Optional[int]:
        """The next sentence, when it is on the same page of the same book."""
        if i + 1 < len(self.units) and self.units[i + 1][0] == self.units[i][0] and self.units[i + 1][1] == self.units[i][1]:
            return i + 1
        return None

    def best_match(self, statement: str, min_coverage: float = MIN_COVERAGE,
                   min_terms: int = MIN_TERMS, lo: int = 0, hi: Optional[int] = None,
                   min_distinctive: int = MIN_DISTINCTIVE) -> Optional[Dict[str, Any]]:
        """
        The sentence (or two) of the books closest to a statement, or None below the bar.
        `lo` and `hi` limit the search to the units between them (a passage that was given to the AI).
        """
        query = tokens(statement)
        known = [t for t in query if t in self._idf]
        if len(known) < min_terms:
            return None
        weight = sum(self._idf[t] for t in known)
        # a statement about "Life Path 1" is not backed by a passage about "Life Path 9"
        anchors = {m.group(1) for m in _ANCHOR.finditer(statement)}
        # candidates: sentences that hold the rarest terms of the statement
        rare = sorted(known, key=lambda t: -self._idf[t])[:8]
        seen: Dict[int, int] = {}
        for t in rare:
            for i in self._postings[t][:MAX_CANDIDATES] if hi is None else self._postings[t]:
                if lo <= i <= (hi if hi is not None else i):
                    seen[i] = seen.get(i, 0) + 1
        best: Optional[Dict[str, Any]] = None
        for i in seen:
            for j in (None, self._window(i)):
                if anchors and j is not None and not anchors <= self._tokens[i]:
                    continue   # two sentences must not pool their numbers: "Life Path 9 ... 1 ..."
                toks = self._tokens[i] if j is None else self._tokens[i] | self._tokens[j]
                hit = [t for t in known if t in toks]
                if len(hit) < min_terms or not anchors <= toks or len(hit) / len(toks) < MIN_DENSITY:
                    continue
                if sum(1 for t in hit if not t.isdigit() and self._idf[t] >= DISTINCTIVE_IDF) < min_distinctive:
                    continue
                coverage = sum(self._idf[t] for t in hit) / weight
                # a tighter passage wins a tie
                score = coverage - 0.0005 * len(toks)
                if coverage >= min_coverage and (best is None or score > best["_score"]):
                    best = {"_score": score, "coverage": coverage, "terms": len(hit), "first": i, "last": j if j is not None else i}
        if best is None:
            return None
        return self._passage(best["first"], best["last"], best["coverage"])

    # ── locating a passage that was cut from a book ───────────────────────────
    def _book_index(self, book_id: str) -> Optional[int]:
        wanted = re.sub(r"[^a-z0-9]+", " ", (book_id or "").lower()).strip()
        for i, book in enumerate(self.books):
            if re.sub(r"[^a-z0-9]+", " ", book["id"].lower()).strip() == wanted:
                return i
        return None

    def _best_unit(self, text: str, book: int, lo: int = 0, hi: Optional[int] = None,
                   min_coverage: float = 0.6) -> Optional[Dict[str, int]]:
        """The sentence (or two) of one book that holds the words of `text`, between units lo and hi."""
        query = tokens(text)
        known = [t for t in query if t in self._idf]
        if len(known) < 3:
            return None
        weight = sum(self._idf[t] for t in known)
        candidates: set = set()
        for t in sorted(known, key=lambda t: -self._idf[t])[:8]:
            candidates.update(i for i in self._postings[t] if lo <= i < (hi if hi is not None else len(self.units))
                              and self.units[i][0] == book)
        best: Optional[Dict[str, Any]] = None
        for i in candidates:
            for j in (None, self._window(i)):
                toks = self._tokens[i] if j is None else self._tokens[i] | self._tokens[j]
                coverage = sum(self._idf[t] for t in known if t in toks) / weight
                if coverage >= min_coverage and (best is None or coverage - 0.0005 * len(toks) > best["score"]):
                    best = {"score": coverage - 0.0005 * len(toks), "first": i, "last": j if j is not None else i}
        return best

    def locate_passage(self, book_id: str, text: str, retrieval_score: float = 0.0) -> Optional[Dict[str, Any]]:
        """
        The page and lines of a passage that was cut from a book (what the AI was given):
        found from its first words and its last words, both in that book.
        """
        book = self._book_index(book_id)
        text = re.sub(r"\s+", " ", _RUNNING_HEADER.sub(" ", text or "")).strip()
        words = text.split()
        if book is None or len(words) < 12:
            return None
        start = self._best_unit(" ".join(words[:14]), book)
        if start is None:
            return None
        end = self._best_unit(" ".join(words[-14:]), book, lo=start["first"], hi=start["first"] + 80) or start
        a, b = self.units[start["first"]], self.units[end["last"]]
        quote = re.sub(r"\s+", " ", text).strip()
        return {
            "book_id": self.books[book]["id"],
            "title": self.books[book]["title"],
            "series": self.books[book]["series"],
            "publisher": self.books[book]["publisher"],
            "page": a[1],
            "page_end": b[1],
            "line_start": a[2],
            "line_end": b[3],
            "quote": quote[:260].rstrip() + ("..." if len(quote) > 260 else ""),
            "score": round(float(retrieval_score), 2),
            "units": (start["first"], end["last"]),     # for the search of a sentence inside the passage
        }

    def _passage(self, first: int, last: int, coverage: float) -> Dict[str, Any]:
        a, b = self.units[first], self.units[last]
        book = self.books[a[0]]
        return {
            "book_id": book["id"],
            "title": book["title"],
            "series": book["series"],
            "publisher": book["publisher"],
            "page": a[1],
            "line_start": a[2],
            "line_end": b[3],
            "quote": a[4] if first == last else f"{a[4]} {b[4]}",
            "match": round(coverage, 2),
        }

    def sources_for_text(self, text: str, limit: int = 3) -> Dict[str, Any]:
        """
        The book passages that back the statements of a text.

        Returns {"passages": [...best first, one per page and lines...],
                 "statements": number of statements checked,
                 "backed": number of them that a passage backs}.
        """
        statements = [s.strip() for s in _SENTENCE.split(text or "") if len(tokens(s)) >= MIN_TERMS]
        passages: List[Dict[str, Any]] = []
        backed = 0
        for statement in statements[:12]:
            match = self.best_match(statement)
            if match is None:
                continue
            backed += 1
            key = (match["book_id"], match["page"], match["line_start"])
            if all((p["book_id"], p["page"], p["line_start"]) != key for p in passages):
                passages.append(match)
        passages.sort(key=lambda p: -p["match"])
        return {"passages": passages[:limit], "statements": min(len(statements), 12), "backed": backed}


@lru_cache(maxsize=1)
def get_index() -> Optional[BookIndex]:
    """The index, or None when the file is missing (the app then shows no book sources)."""
    try:
        return BookIndex(json.loads(INDEX_PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError, KeyError):
        return None


def location(passage: Dict[str, Any]) -> str:
    if passage.get("page_end", passage["page"]) != passage["page"]:
        return (f"pages {passage['page']}-{passage['page_end']} "
                f"(line {passage['line_start']} of page {passage['page']} to line {passage['line_end']} of page {passage['page_end']})")
    lines = (
        f"line {passage['line_start']}"
        if passage["line_start"] == passage["line_end"]
        else f"lines {passage['line_start']}-{passage['line_end']}"
    )
    return f"page {passage['page']}, {lines}"
