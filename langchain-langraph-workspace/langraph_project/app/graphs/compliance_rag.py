"""
Step 5 — Compliance RAG Assistant

Graph flow:
  prepare_query
       │
       ▼
  retrieve_documents     (FAISS similarity search)
       │
       ▼
  grade_documents        (filter out low-relevance chunks)
       │
       ▼ (conditional)
  generate_answer  ◀── enough docs ──┐
       │                             │
  fallback_response ◀── no docs ─────┘
       │
       ▼
      END
"""

import logging
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from app.schemas.compliance import ComplianceRAGState
from app.rag.vector_store import similarity_search
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

RAG_SYSTEM_PROMPT = """You are a compliance officer assistant at Bank of America.
Answer the question using ONLY the context provided below.
Cite the source policy whenever possible (e.g. "Per KYC Policy v3.2...").
If the context does not contain enough information, say so clearly.
Do not make up regulations or policy numbers.
Be precise, professional, and concise."""

RELEVANCE_THRESHOLD = 0.8   # FAISS L2 distance — lower = more similar


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

def prepare_query(state: ComplianceRAGState) -> ComplianceRAGState:
    """Normalise query and extract category hint."""
    query = state["query"].strip()
    logger.info("Compliance RAG | query='%s' category=%s", query, state.get("category"))
    return {"query": query}


def retrieve_documents(state: ComplianceRAGState) -> ComplianceRAGState:
    """Run FAISS similarity search; store raw results in state."""
    category = state.get("category")
    top_k = state.get("retrieval_count") or 4

    docs = similarity_search(
        query=state["query"],
        k=top_k,
        category_filter=category.value if category else None,
    )

    serialised = [
        {
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown"),
            "category": doc.metadata.get("category", "general"),
            "score": doc.metadata.get("relevance_score", 9999),
        }
        for doc in docs
    ]

    logger.info("Retrieved %d documents for query", len(serialised))
    return {"retrieved_docs": serialised, "retrieval_count": len(serialised)}


def grade_documents(state: ComplianceRAGState) -> ComplianceRAGState:
    """Keep only chunks whose FAISS distance is below the relevance threshold."""
    raw_docs = state.get("retrieved_docs", [])

    graded = [d for d in raw_docs if d["score"] <= RELEVANCE_THRESHOLD]

    # If nothing passes the threshold, keep the top-2 to avoid empty context
    if not graded and raw_docs:
        graded = sorted(raw_docs, key=lambda d: d["score"])[:2]
        logger.warning("All docs below relevance — keeping top 2 as fallback")

    logger.info("Graded docs: %d/%d passed relevance filter", len(graded), len(raw_docs))
    return {"graded_docs": graded}


def generate_answer(state: ComplianceRAGState) -> ComplianceRAGState:
    """Build context from graded docs and call the LLM."""
    graded_docs = state["graded_docs"]

    context_parts = []
    sources = []
    for i, doc in enumerate(graded_docs, 1):
        context_parts.append(f"[{i}] Source: {doc['source']}\n{doc['content']}")
        if doc["source"] not in sources:
            sources.append(doc["source"])

    context = "\n\n---\n\n".join(context_parts)
    prompt = f"Context:\n{context}\n\nQuestion: {state['query']}"

    llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0,
        api_key=settings.openai_api_key,
    )

    messages = [SystemMessage(content=RAG_SYSTEM_PROMPT), HumanMessage(content=prompt)]
    response = llm.invoke(messages)

    logger.info("Generated compliance answer | sources=%s", sources)
    return {"answer": response.content, "sources": sources}


def fallback_response(state: ComplianceRAGState) -> ComplianceRAGState:
    """No relevant docs found — return a safe fallback."""
    logger.warning("No relevant compliance documents found for query: %s", state["query"])
    return {
        "answer": (
            "I could not find relevant compliance documentation to answer your question. "
            "Please contact the Compliance department directly at compliance@bank.internal "
            "or refer to the Bank Policy Portal."
        ),
        "sources": [],
    }


# ---------------------------------------------------------------------------
# Conditional edge
# ---------------------------------------------------------------------------

def route_after_grading(state: ComplianceRAGState) -> Literal["generate_answer", "fallback_response"]:
    if state.get("graded_docs"):
        return "generate_answer"
    return "fallback_response"


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_compliance_rag_graph():
    graph = StateGraph(ComplianceRAGState)

    graph.add_node("prepare_query", prepare_query)
    graph.add_node("retrieve_documents", retrieve_documents)
    graph.add_node("grade_documents", grade_documents)
    graph.add_node("generate_answer", generate_answer)
    graph.add_node("fallback_response", fallback_response)

    graph.set_entry_point("prepare_query")
    graph.add_edge("prepare_query", "retrieve_documents")
    graph.add_edge("retrieve_documents", "grade_documents")

    graph.add_conditional_edges(
        "grade_documents",
        route_after_grading,
        {
            "generate_answer": "generate_answer",
            "fallback_response": "fallback_response",
        },
    )

    graph.add_edge("generate_answer", END)
    graph.add_edge("fallback_response", END)

    return graph.compile()


compliance_rag_graph = build_compliance_rag_graph()


def run_compliance_rag(query: str, category: Optional[str] = None, top_k: int = 4) -> dict:
    from app.schemas.compliance import ComplianceCategory
    result = compliance_rag_graph.invoke({
        "query": query,
        "category": ComplianceCategory(category) if category else None,
        "retrieval_count": top_k,
    })
    return {
        "answer": result.get("answer", ""),
        "sources": result.get("sources", []),
        "documents_retrieved": result.get("retrieval_count", 0),
        "documents_used": len(result.get("graded_docs", [])),
    }
