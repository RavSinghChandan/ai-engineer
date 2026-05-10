"""
Internal Document Store — admin upload pipeline.

Company internal documents (PDFs, text files) uploaded by HR/admins are:
  1. Text-extracted locally (never sent raw to any external API)
  2. Chunked (512 tokens, 50 overlap)
  3. Embedded with local HuggingFace model (all-MiniLM-L6-v2, runs on-premise)
  4. Indexed into a separate FAISS store (internal_docs_index)
  5. Retrieved during role mapping and plan generation to find relevant
     internal training material — no public internet references

Privacy guarantee:
  - CV text: extracted locally, only the parsed JSON profile (name/skills/years)
    is stored; raw CV bytes are discarded after parsing.
  - Role templates: loaded from internal JSON, never echoed to LLM verbatim.
  - Internal docs: chunked and embedded locally; chunk text stays server-side.
  - LLM only receives: skill names, experience years, role title, context chunks.
    It NEVER receives the full CV text, raw document bytes, or employee PII.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import List, Optional, Tuple

from langchain.schema import Document
from langchain_community.vectorstores import FAISS

logger = logging.getLogger("bench.docstore")

DATA_DIR        = Path(__file__).parent.parent / "data"
RESOURCES_PATH  = DATA_DIR / "internal_resources.json"
INTERNAL_INDEX  = Path(__file__).parent / "internal_docs_index"

# In-memory registry of uploaded admin documents
# { doc_id: { title, skill_tags, classification, uploaded_at, chunk_count } }
_doc_registry: dict = {}


# ── Resource registry (from internal_resources.json) ─────────────────────────

def _load_resource_registry() -> dict:
    try:
        with open(RESOURCES_PATH) as f:
            data = json.load(f)
        return data.get("resources", {})
    except Exception as e:
        logger.error('{"event":"resource_registry_load_failed","error":"%s"}', str(e)[:80])
        return {}

_resource_registry: dict = _load_resource_registry()


def get_internal_resource(skill: str) -> dict:
    """
    Look up the internal resource for a skill.
    Returns a dict with title, location, type, owner, classification.
    Never returns a public internet URL.
    Falls back to a generic internal knowledge-portal path.
    """
    key = skill.lower().strip().split(",")[0].strip()
    resource = _resource_registry.get(key)
    if resource:
        return resource
    # Generic fallback — still internal portal, not internet
    return {
        "title": f"{skill} — Internal Training Material",
        "location": f"internal://knowledge-portal/search?q={key.replace(' ', '+')}",
        "type": "internal-portal",
        "format": "pdf",
        "owner": "Learning & Development",
        "classification": "internal",
    }


def resource_location_for(skill: str) -> str:
    """Shorthand — returns just the internal location string."""
    return get_internal_resource(skill)["location"]


# ── Chunk text ─────────────────────────────────────────────────────────────────

def _chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks (word-boundary aware)."""
    words  = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


# ── Admin document upload ──────────────────────────────────────────────────────

def index_internal_document(
    doc_id: str,
    title: str,
    text: str,
    skill_tags: List[str],
    classification: str,
    embeddings,
    existing_store: Optional[FAISS] = None,
) -> Tuple[FAISS, int]:
    """
    Chunk + embed an internal document and merge into the internal FAISS index.

    Args:
        doc_id:          Unique identifier for this document (e.g., filename stem)
        title:           Human-readable document title
        text:            Full extracted text (local, never sent to LLM)
        skill_tags:      Skills this document covers (used for retrieval routing)
        classification:  e.g. 'internal', 'confidential'
        embeddings:      HuggingFace embedding model (runs locally)
        existing_store:  Existing FAISS index to merge into (or None to create new)

    Returns:
        (updated FAISS store, number of chunks indexed)
    """
    chunks = _chunk_text(text)
    if not chunks:
        raise ValueError("Document produced no text chunks — check file content")

    docs = [
        Document(
            page_content=chunk,
            metadata={
                "doc_id":         doc_id,
                "title":          title,
                "skill_tags":     skill_tags,
                "classification": classification,
                "chunk_index":    i,
                "source":         "company-internal",
            }
        )
        for i, chunk in enumerate(chunks)
    ]

    if existing_store is not None:
        existing_store.add_documents(docs)
        store = existing_store
    else:
        store = FAISS.from_documents(docs, embeddings)

    # Persist
    store.save_local(str(INTERNAL_INDEX))

    # Register metadata (no raw text stored in registry)
    _doc_registry[doc_id] = {
        "title":          title,
        "skill_tags":     skill_tags,
        "classification": classification,
        "chunk_count":    len(chunks),
        "uploaded_at":    time.time(),
    }

    logger.info(
        '{"event":"doc_indexed","doc_id":"%s","chunks":%d,"skills":%s}',
        doc_id, len(chunks), skill_tags[:5],
    )
    return store, len(chunks)


def load_internal_store(embeddings) -> Optional[FAISS]:
    """Load persisted internal document FAISS index if it exists."""
    if INTERNAL_INDEX.exists():
        try:
            return FAISS.load_local(
                str(INTERNAL_INDEX),
                embeddings,
                allow_dangerous_deserialization=True,
            )
        except Exception as e:
            logger.warning('{"event":"internal_store_load_failed","error":"%s"}', str(e)[:80])
    return None


def list_indexed_documents() -> List[dict]:
    """Return metadata for all indexed internal documents (no raw text)."""
    return [
        {"doc_id": k, **v}
        for k, v in _doc_registry.items()
    ]


def get_doc_registry() -> dict:
    return dict(_doc_registry)
