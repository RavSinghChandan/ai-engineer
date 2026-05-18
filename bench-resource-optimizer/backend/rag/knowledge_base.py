"""
Builds and exposes the FAISS vector store from roles_knowledge.json.
Uses local HuggingFace sentence-transformers for embeddings (no API key needed).

Phase 3: get_all_roles() now reads from SQLite (via db.get_all_roles_db).
         build_vector_store() accepts an optional roles list so the index can be
         rebuilt in-process after an admin CRUD operation without restarting.
"""
import json
from pathlib import Path

from typing import List, Optional
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.schema import Document

DATA_PATH = Path(__file__).parent.parent / "data" / "roles_knowledge.json"
FAISS_PATH = Path(__file__).parent / "faiss_index"


def _build_documents(roles: List[dict]) -> List[Document]:
    docs = []
    for role in roles:
        skills_text = ", ".join(role.get("required_skills", []))
        content = (
            f"Role: {role['title']}\n"
            f"Description: {role.get('description', '')}\n"
            f"Required Skills: {skills_text}\n"
            f"Experience Required: {role.get('experience_years', 0)} years"
        )
        docs.append(Document(
            page_content=content,
            metadata={
                "role_id": role["id"],
                "title": role["title"],
                "required_skills": role.get("required_skills", []),
                "experience_years": role.get("experience_years", 0),
            }
        ))
    return docs


def get_embeddings() -> HuggingFaceEmbeddings:
    # all-MiniLM-L6-v2 is ~80MB, fast, runs fully locally
    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


def build_vector_store(
    embeddings: HuggingFaceEmbeddings,
    roles: Optional[List[dict]] = None,
    force_rebuild: bool = False,
) -> FAISS:
    """
    Creates FAISS index from roles list.

    If roles is None: loads cached index from disk (startup path).
    If roles is provided: always rebuilds from the given list and saves to disk.
    force_rebuild=True: ignore the cached index even when roles is None.
    """
    if roles is None and not force_rebuild and FAISS_PATH.exists():
        return FAISS.load_local(
            str(FAISS_PATH),
            embeddings,
            allow_dangerous_deserialization=True,
        )

    if roles is None:
        with open(DATA_PATH) as f:
            data = json.load(f)
        roles = data["roles"]

    docs = _build_documents(roles)
    store = FAISS.from_documents(docs, embeddings)
    store.save_local(str(FAISS_PATH))
    return store


def get_all_roles() -> List[dict]:
    """Sync fallback: reads from JSON. Used only before SQLite is seeded."""
    with open(DATA_PATH) as f:
        return json.load(f)["roles"]


async def get_all_roles_async() -> List[dict]:
    """Phase 3: reads roles from SQLite (authoritative source post-seed)."""
    from db import get_all_roles_db
    return await get_all_roles_db()
