"""RAG knowledge base — optional, enabled via config. Auto-indexes on first start."""
import hashlib
import logging
from pathlib import Path

from langchain_core.documents import Document

from .config_loader import KnowledgeBaseConfig

logger = logging.getLogger(__name__)


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


def build_retriever(cfg: KnowledgeBaseConfig):
    """Build a retriever from the knowledge base. Returns None if disabled."""
    if not cfg.enabled:
        return None

    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
        from langchain_anthropic import AnthropicEmbeddings
    except ImportError:
        logger.warning("RAG dependencies missing. Run: pip install langchain-anthropic faiss-cpu")
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

    kb_type = cfg.type.lower()

    if kb_type == "faiss":
        from langchain_community.vectorstores import FAISS
        from langchain_anthropic import AnthropicEmbeddings
        embeddings = AnthropicEmbeddings(model="voyage-3")
        vectorstore = FAISS.from_documents(chunks, embeddings)
        return vectorstore.as_retriever(search_kwargs={"k": cfg.top_k})

    if kb_type == "chroma":
        from langchain_chroma import Chroma
        from langchain_anthropic import AnthropicEmbeddings
        embeddings = AnthropicEmbeddings(model="voyage-3")
        vectorstore = Chroma.from_documents(chunks, embeddings)
        return vectorstore.as_retriever(search_kwargs={"k": cfg.top_k})

    logger.warning(f"Unsupported knowledge base type: {kb_type}. RAG disabled.")
    return None
