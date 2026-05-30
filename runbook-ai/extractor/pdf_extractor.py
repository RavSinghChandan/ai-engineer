"""
PDF text extraction — no vectors, no embeddings.
Extracts raw text and tables from runbook PDFs using pdfplumber.
"""
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union

import pdfplumber


@dataclass
class ExtractedPage:
    page_number: int
    text: str
    tables: list[list[list[str]]] = field(default_factory=list)


@dataclass
class ExtractedDocument:
    filename: str
    total_pages: int
    full_text: str
    pages: list[ExtractedPage]
    metadata: dict = field(default_factory=dict)


def extract_pdf(file_path: Union[str, Path]) -> ExtractedDocument:
    """Extract all text and tables from a PDF file."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    pages = []
    full_text_parts = []

    with pdfplumber.open(str(path)) as pdf:
        metadata = pdf.metadata or {}
        total_pages = len(pdf.pages)

        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text = _clean_text(text)

            tables = []
            for table in page.extract_tables():
                cleaned = [
                    [cell.strip() if cell else "" for cell in row]
                    for row in table
                    if any(cell for cell in row)
                ]
                if cleaned:
                    tables.append(cleaned)

            pages.append(ExtractedPage(
                page_number=i,
                text=text,
                tables=tables,
            ))
            if text:
                full_text_parts.append(text)

    return ExtractedDocument(
        filename=path.name,
        total_pages=total_pages,
        full_text="\n\n".join(full_text_parts),
        pages=pages,
        metadata={
            "title": metadata.get("Title", ""),
            "author": metadata.get("Author", ""),
            "creator": metadata.get("Creator", ""),
        },
    )


def extract_pdf_bytes(filename: str, content: bytes) -> ExtractedDocument:
    """Extract from in-memory PDF bytes (for FastAPI file uploads)."""
    import io
    pages = []
    full_text_parts = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        metadata = pdf.metadata or {}
        total_pages = len(pdf.pages)

        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text = _clean_text(text)

            tables = []
            for table in page.extract_tables():
                cleaned = [
                    [cell.strip() if cell else "" for cell in row]
                    for row in table
                    if any(cell for cell in row)
                ]
                if cleaned:
                    tables.append(cleaned)

            pages.append(ExtractedPage(page_number=i, text=text, tables=tables))
            if text:
                full_text_parts.append(text)

    return ExtractedDocument(
        filename=filename,
        total_pages=total_pages,
        full_text="\n\n".join(full_text_parts),
        pages=pages,
        metadata={
            "title": metadata.get("Title", ""),
            "author": metadata.get("Author", ""),
        },
    )


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(\w)-\s+(\w)", r"\1\2", text)
    return text.strip()
