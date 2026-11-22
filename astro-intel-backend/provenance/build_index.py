"""
Build the page-and-line index of the numerology books.

    python -m provenance.build_index [DIR_WITH_THE_PDFS]

Reads every PDF, numbers the pages as printed ("5 | P a g e" is page 5) and the
lines of each page, and writes sentence units to numerology_rag/provenance/books.json.
The running app only reads that JSON, so the PDFs are not needed at run time.

Line numbers: the lines of the page body, counted from the top of the page, after
the running header (institute name, tagline, "N | P a g e", copyright), which is the
same on every page and is not part of the text.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List

import pypdf

DEFAULT_DIR = Path.home() / "Downloads" / "Organized" / "12_Learning_Numerology"
OUT = Path(__file__).resolve().parent.parent / "numerology_rag" / "provenance" / "books.json"

SERIES = "Diploma in Numerology"
PUBLISHER = "Indian Institute of Skill Development Training (IISDT)"

# Lines of the running header that sit at the top of every page.
_HEADER = (
    re.compile(r"^Indian Institute of Skill Development Training", re.I),
    re.compile(r"^Empowering Skills", re.I),
    re.compile(r"^\d+\s*\|\s*P\s*a\s*g\s*e\s*$", re.I),
    re.compile(r"^Copyright @", re.I),
    re.compile(r"^Diploma in Numerology\s*$", re.I),
)
_HEADER_SCAN = 5          # the header is within the first lines of a page
_BULLET = re.compile(r"^(?:[o••●→]\s+|\d{1,2}[.)]\s+)")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9“\"(])")
MIN_UNIT_CHARS = 30


def book_title(stem: str) -> str:
    title = re.sub(r"-\d+$", "", stem)          # "Introduction-to-Numerology-1"
    return title.replace("-", " ")


def clean(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace(" ", " ")
    text = re.sub(r"[-]", " ", text)          # private-use bullet glyphs
    return re.sub(r"\s+", " ", text).strip()


def page_lines(raw: str) -> List[str]:
    """Body lines of a page, without the running header, empty lines dropped."""
    lines = [clean(line) for line in raw.split("\n")]
    lines = [line for line in lines if line]
    head, rest = lines[:_HEADER_SCAN], lines[_HEADER_SCAN:]
    kept = [line for line in head if not any(rx.match(line) for rx in _HEADER)]
    return kept + rest


def sentence_units(lines: List[str]) -> List[Dict[str, Any]]:
    """Split the lines of a page into sentences, each with the lines it spans."""
    pieces: List[tuple] = []          # (text, line_number)
    for number, line in enumerate(lines, 1):
        pieces.append((line, number))

    units: List[Dict[str, Any]] = []
    buffer: List[tuple] = []

    def flush() -> None:
        if not buffer:
            return
        text = clean(" ".join(t for t, _ in buffer))
        if len(text) >= MIN_UNIT_CHARS:
            units.append({"text": text, "l1": buffer[0][1], "l2": buffer[-1][1]})
        buffer.clear()

    for text, number in pieces:
        if _BULLET.match(text):
            flush()
        # split a line that holds the end of one sentence and the start of the next
        parts = _SENTENCE_END.split(text)
        for i, part in enumerate(parts):
            buffer.append((part, number))
            if i < len(parts) - 1 or re.search(r"[.!?]$", part):
                flush()
    flush()
    return _cap(units, lines)


MAX_UNIT_CHARS = 320


def _cap(units: List[Dict[str, Any]], lines: List[str]) -> List[Dict[str, Any]]:
    """Split a unit that is too long (a table row, a run-on list) into pieces of whole lines."""
    out: List[Dict[str, Any]] = []
    for unit in units:
        if len(unit["text"]) <= MAX_UNIT_CHARS or unit["l1"] == unit["l2"]:
            out.append(unit)
            continue
        start = unit["l1"]
        text = ""
        for number in range(unit["l1"], unit["l2"] + 1):
            line = lines[number - 1]
            if text and len(text) + len(line) + 1 > MAX_UNIT_CHARS:
                if len(text) >= MIN_UNIT_CHARS:
                    out.append({"text": text, "l1": start, "l2": number - 1})
                start, text = number, ""
            text = f"{text} {line}".strip()
        if len(text) >= MIN_UNIT_CHARS:
            out.append({"text": text, "l1": start, "l2": unit["l2"]})
    return out


def build(pdf_dir: Path) -> Dict[str, Any]:
    books: List[Dict[str, Any]] = []
    units: List[list] = []
    for pdf in sorted(pdf_dir.glob("*.pdf")):
        reader = pypdf.PdfReader(str(pdf))
        index = len(books)
        books.append({
            "id": pdf.stem,
            "title": book_title(pdf.stem),
            "series": SERIES,
            "publisher": PUBLISHER,
            "pages": len(reader.pages),
        })
        for page_number, page in enumerate(reader.pages, 1):
            lines = page_lines(page.extract_text() or "")
            for unit in sentence_units(lines):
                units.append([index, page_number, unit["l1"], unit["l2"], unit["text"]])
    return {
        "version": 1,
        "built": date.today().isoformat(),
        "line_numbering": "lines of the page body, counted from the top, without the running header",
        "books": books,
        "units": units,
    }


def main() -> None:
    pdf_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    data = build(pdf_dir)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(data['books'])} books, {len(data['units'])} sentences -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
