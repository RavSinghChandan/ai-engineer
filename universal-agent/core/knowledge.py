"""
RAG knowledge base — optional, enabled via config. Auto-indexes on first start.

Supports pluggable embedding providers (no vendor lock-in):
  anthropic   → voyage-3 (default)
  openai      → text-embedding-3-small
  huggingface → sentence-transformers/all-MiniLM-L6-v2 (free, local)
  ollama      → nomic-embed-text (local, free)
"""
import logging
from pathlib import Path

from langchain_core.documents import Document

from .config_loader import KnowledgeBaseConfig

logger = logging.getLogger(__name__)


# ── Document loader ────────────────────────────────────────────────────────────

def _load_documents(source_dir: str) -> list[Document]:
    """Load .txt, .md, .pdf files from source_dir."""
    docs: list[Document] = []
    source_path = Path(source_dir)

    if not source_path.exists():
        logger.warning(f"Knowledge source_dir not found: {source_dir}")
        return docs

    for fp in source_path.rglob("*"):
        if fp.suffix in {".txt", ".md"}:
            text = fp.read_text(encoding="utf-8", errors="ignore")
            docs.append(Document(page_content=text, metadata={"source": str(fp)}))
        elif fp.suffix == ".pdf":
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(fp))
                text = "\n".join(p.extract_text() or "" for p in reader.pages)
                docs.append(Document(page_content=text, metadata={"source": str(fp)}))
            except ImportError:
                logger.warning("pypdf not installed — skipping PDF files. Run: pip install pypdf")

    return docs


# ── Embedding factory ──────────────────────────────────────────────────────────

def build_embeddings(cfg: KnowledgeBaseConfig):
    """
    Factory: returns the right embedding model based on config.
    Defaults to Anthropic voyage-3 (backwards compatible).
    """
    provider = getattr(cfg, "embedding_provider", "anthropic")
    model    = getattr(cfg, "embedding_model", "voyage-3")

    if provider == "anthropic":
        from langchain_anthropic import AnthropicEmbeddings
        return AnthropicEmbeddings(model=model or "voyage-3")

    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(model=model or "text-embedding-3-small")

    if provider == "huggingface":
        try:
            from langchain_huggingface import HuggingFaceEmbeddings
        except ImportError:
            from langchain_community.embeddings import HuggingFaceEmbeddings  # type: ignore
        return HuggingFaceEmbeddings(model_name=model or "sentence-transformers/all-MiniLM-L6-v2")

    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(model=model or "nomic-embed-text")

    if provider == "cohere":
        from langchain_cohere import CohereEmbeddings
        return CohereEmbeddings(model=model or "embed-english-v3.0")

    # default fallback — Anthropic (original behavior)
    from langchain_anthropic import AnthropicEmbeddings
    return AnthropicEmbeddings(model="voyage-3")


# ── Retriever factory ──────────────────────────────────────────────────────────

def build_retriever(cfg: KnowledgeBaseConfig):
    """Build a retriever from the knowledge base. Returns None if disabled."""
    if not cfg.enabled:
        return None

    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        logger.warning("RAG dependencies missing. Run: pip install langchain faiss-cpu")
        return None

    docs = _load_documents(cfg.source_dir)
    if not docs:
        logger.info("No documents found in knowledge base — RAG disabled.")
        return None

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=cfg.chunk_size,
        chunk_overlap=cfg.chunk_overlap,
    )
    chunks = splitter.split_documents(docs)
    logger.info(f"Knowledge base: {len(docs)} docs → {len(chunks)} chunks")

    embeddings = build_embeddings(cfg)
    kb_type = cfg.type.lower()

    if kb_type == "faiss":
        from langchain_community.vectorstores import FAISS
        vectorstore = FAISS.from_documents(chunks, embeddings)
        return vectorstore.as_retriever(search_kwargs={"k": cfg.top_k})

    if kb_type == "chroma":
        from langchain_chroma import Chroma
        vectorstore = Chroma.from_documents(chunks, embeddings)
        return vectorstore.as_retriever(search_kwargs={"k": cfg.top_k})

    logger.warning(f"Unsupported knowledge base type: {kb_type}. RAG disabled.")
    return None
