from langchain_community.document_loaders import TextLoader, PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

VECTOR_STORE_PATH = "data/vectorstore"


def ingest_documents(doc_path: str) -> FAISS:
    logger.info(f"Ingesting: {doc_path}")

    if doc_path.endswith(".pdf"):
        loader = PyPDFLoader(doc_path)
    else:
        loader = TextLoader(doc_path)

    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(docs)

    embeddings = OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
    vectorstore = FAISS.from_documents(chunks, embeddings)
    vectorstore.save_local(VECTOR_STORE_PATH)

    logger.info(f"Ingested {len(chunks)} chunks into vector store")
    return vectorstore
