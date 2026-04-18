"""
RAG Vector Store — loads compliance documents, chunks them, embeds, and
stores in an in-process FAISS index. The index is built once at startup
and reused across all requests.

In production: swap FAISS for Pinecone / Weaviate / pgvector and use
OpenAIEmbeddings (or text-embedding-3-small for cost efficiency).
"""

import logging
import os
from pathlib import Path
from typing import List, Optional

from langchain_community.document_loaders import TextLoader
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
# Fallback embeddings when no OpenAI key is configured
from langchain_community.embeddings import FakeEmbeddings

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

DOCS_DIR = Path(__file__).parent / "documents"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 80

_vector_store: Optional[FAISS] = None


def _load_documents() -> List[Document]:
    docs: List[Document] = []
    for txt_file in sorted(DOCS_DIR.glob("*.txt")):
        loader = TextLoader(str(txt_file), encoding="utf-8")
        raw = loader.load()
        # Tag each document with its category (first line CATEGORY: xxx)
        for doc in raw:
            lines = doc.page_content.splitlines()
            category = "general"
            source_label = txt_file.stem
            for line in lines[:3]:
                if line.startswith("CATEGORY:"):
                    category = line.split(":", 1)[1].strip().lower()
                if line.startswith("SOURCE:"):
                    source_label = line.split(":", 1)[1].strip()
            doc.metadata["category"] = category
            doc.metadata["source"] = source_label
        docs.extend(raw)
    logger.info("Loaded %d compliance documents from %s", len(docs), DOCS_DIR)
    return docs


def _chunk_documents(docs: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " "],
    )
    chunks = splitter.split_documents(docs)
    logger.info("Split into %d chunks", len(chunks))
    return chunks


def _build_embeddings():
    if settings.openai_api_key:
        logger.info("Using OpenAIEmbeddings (text-embedding-3-small)")
        return OpenAIEmbeddings(
            model="text-embedding-3-small",
            api_key=settings.openai_api_key,
        )
    logger.warning("No OPENAI_API_KEY — using FakeEmbeddings (dev/test only)")
    return FakeEmbeddings(size=1536)


def get_vector_store() -> FAISS:
    """Lazy singleton — builds the FAISS index on first call."""
    global _vector_store
    if _vector_store is not None:
        return _vector_store

    logger.info("Building compliance FAISS vector store...")
    docs = _load_documents()
    chunks = _chunk_documents(docs)
    embeddings = _build_embeddings()
    _vector_store = FAISS.from_documents(chunks, embeddings)
    logger.info("FAISS index ready with %d vectors", _vector_store.index.ntotal)
    return _vector_store


def similarity_search(query: str, k: int = 4, category_filter: Optional[str] = None) -> List[Document]:
    """Search the vector store; optionally filter by compliance category."""
    store = get_vector_store()
    results = store.similarity_search_with_score(query, k=k * 2)

    filtered = []
    for doc, score in results:
        if category_filter and doc.metadata.get("category") != category_filter:
            continue
        doc.metadata["relevance_score"] = round(float(score), 4)
        filtered.append(doc)
        if len(filtered) == k:
            break

    # If category filter returned nothing, fall back to unfiltered
    if not filtered and category_filter:
        logger.warning("Category filter '%s' returned 0 results — falling back to unfiltered", category_filter)
        for doc, score in results[:k]:
            doc.metadata["relevance_score"] = round(float(score), 4)
            filtered.append(doc)

    return filtered
