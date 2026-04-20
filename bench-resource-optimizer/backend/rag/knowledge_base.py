"""
Builds and exposes the FAISS vector store from roles_knowledge.json.
Uses local HuggingFace sentence-transformers for embeddings (no API key needed).
"""
import json
from pathlib import Path

from typing import List
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.schema import Document

DATA_PATH = Path(__file__).parent.parent / "data" / "roles_knowledge.json"
FAISS_PATH = Path(__file__).parent / "faiss_index"


def _build_documents(roles: List[dict]) -> List[Document]:
    docs = []
    for role in roles:
        skills_text = ", ".join(role["required_skills"])
        content = (
            f"Role: {role['title']}\n"
            f"Description: {role['description']}\n"
            f"Required Skills: {skills_text}\n"
            f"Experience Required: {role['experience_years']} years"
        )
        docs.append(Document(
            page_content=content,
            metadata={
                "role_id": role["id"],
                "title": role["title"],
                "required_skills": role["required_skills"],
                "experience_years": role["experience_years"],
            }
        ))
    return docs


def get_embeddings() -> HuggingFaceEmbeddings:
    # all-MiniLM-L6-v2 is ~80MB, fast, runs fully locally
    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


def build_vector_store(embeddings: HuggingFaceEmbeddings) -> FAISS:
    """Creates FAISS index from knowledge base; loads cached index if available."""
    if FAISS_PATH.exists():
        return FAISS.load_local(
            str(FAISS_PATH),
            embeddings,
            allow_dangerous_deserialization=True,
        )

    with open(DATA_PATH) as f:
        data = json.load(f)

    docs = _build_documents(data["roles"])
    store = FAISS.from_documents(docs, embeddings)
    store.save_local(str(FAISS_PATH))
    return store


def get_all_roles() -> List[dict]:
    with open(DATA_PATH) as f:
        return json.load(f)["roles"]
