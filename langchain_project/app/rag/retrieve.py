import os
from typing import Tuple, List

from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

VECTOR_STORE_PATH = "data/vectorstore"


def get_retriever(k: int = 3):
    if not os.path.exists(VECTOR_STORE_PATH):
        logger.warning("Vector store not found. Run ingest first.")
        return None
    embeddings = OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
    vectorstore = FAISS.load_local(
        VECTOR_STORE_PATH, embeddings, allow_dangerous_deserialization=True
    )
    return vectorstore.as_retriever(search_kwargs={"k": k})


def retrieve_context(question: str) -> Tuple[List[str], List[str]]:
    retriever = get_retriever()
    if retriever is None:
        return [], []
    docs = retriever.invoke(question)
    context = [doc.page_content for doc in docs]
    sources = list({doc.metadata.get("source", "unknown") for doc in docs})
    return context, sources
