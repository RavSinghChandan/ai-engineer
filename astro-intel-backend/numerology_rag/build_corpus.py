"""
Step 1 — Extract and clean text from all numerology PDFs.
Saves: numerology_rag/corpus/  (one .txt per book)
       numerology_rag/corpus/all_chunks.jsonl  (chunked, tagged)
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

import pypdf

BOOKS_DIR  = Path("/Users/chandankumar/Desktop/numerology")
CORPUS_DIR = Path(__file__).parent / "corpus"
CORPUS_DIR.mkdir(parents=True, exist_ok=True)

CHUNK_SIZE    = 400   # tokens approx (words)
CHUNK_OVERLAP = 60

# ── Intent keyword mapping for chunk tagging ──────────────────────────────────
INTENT_KEYWORDS = {
    "marriage":     ["marriage","relationship","partner","love","compatibility","spouse",
                     "wedding","romantic","soulmate","divorce","commitment","heart"],
    "career":       ["career","job","profession","business","success","work","ambition",
                     "leadership","entrepreneur","promotion","achievement","vocation"],
    "finance":      ["money","wealth","finance","abundance","investment","income",
                     "financial","prosperity","debt","savings","material"],
    "health":       ["health","vitality","body","healing","wellness","illness",
                     "energy","disease","mental","physical","recovery"],
    "spirituality": ["spiritual","karma","dharma","soul","meditation","awakening",
                     "purpose","consciousness","divine","enlightenment","inner"],
    "education":    ["education","study","learning","knowledge","exam","school",
                     "university","intelligence","mind","academic","wisdom"],
    "general":      ["life path","destiny","personal year","number","cycle",
                     "vibration","energy","meaning","influence","numerology"],
}

NUMBER_KEYWORDS = {str(n): [f"life path {n}", f"number {n}", f"lp {n}", f"path {n}"]
                   for n in list(range(1, 10)) + [11, 22, 33]}


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\x20-\x7E\n]', ' ', text)
    text = re.sub(r'\.{3,}', '...', text)
    text = re.sub(r'-{2,}', '—', text)
    return text.strip()


def extract_pdf(path: Path) -> str:
    reader = pypdf.PdfReader(str(path))
    pages = []
    for page in reader.pages:
        txt = page.extract_text() or ""
        pages.append(txt)
    return clean_text(" ".join(pages))


def tag_intents(text_lower: str) -> list:
    found = []
    for intent, kws in INTENT_KEYWORDS.items():
        if any(kw in text_lower for kw in kws):
            found.append(intent)
    return found or ["general"]


def tag_numbers(text_lower: str) -> list:
    found = []
    for num, kws in NUMBER_KEYWORDS.items():
        if any(kw in text_lower for kw in kws):
            found.append(int(num))
    return found


def chunk_text(text: str, book_name: str) -> list:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i: i + CHUNK_SIZE]
        chunk_text  = " ".join(chunk_words)
        tl = chunk_text.lower()
        chunks.append({
            "book":    book_name,
            "chunk_id": f"{book_name}_{len(chunks):04d}",
            "text":    chunk_text,
            "intents": tag_intents(tl),
            "numbers": tag_numbers(tl),
            "word_count": len(chunk_words),
        })
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def main():
    pdfs = sorted(BOOKS_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs")

    all_chunks = []
    for pdf in pdfs:
        book_name = pdf.stem
        print(f"  Extracting: {book_name} ...", end=" ")
        try:
            text = extract_pdf(pdf)
            # Save raw text
            (CORPUS_DIR / f"{book_name}.txt").write_text(text, encoding="utf-8")
            chunks = chunk_text(text, book_name)
            all_chunks.extend(chunks)
            print(f"{len(text):,} chars → {len(chunks)} chunks")
        except Exception as e:
            print(f"ERROR: {e}")

    # Save all chunks as JSONL
    out_path = CORPUS_DIR / "all_chunks.jsonl"
    with open(out_path, "w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps(chunk) + "\n")

    print(f"\nTotal chunks: {len(all_chunks)}")
    print(f"Saved to: {out_path}")

    # Intent distribution
    from collections import Counter
    intent_counts = Counter(i for c in all_chunks for i in c["intents"])
    print("\nIntent distribution:")
    for intent, count in intent_counts.most_common():
        print(f"  {intent:15s}: {count:4d} chunks")


if __name__ == "__main__":
    main()
