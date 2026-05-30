from graph.state import SalesFlowState
from rag.retriever import retrieve


def rag_context_agent(state: SalesFlowState) -> SalesFlowState:
    """Retrieve relevant product/FAQ context for the current message."""
    intent = state.get("intent", "OTHER")

    # Skip RAG for spam or irrelevant messages
    if intent == "SPAM":
        state["rag_context"] = ""
        state["agent_log"] = state.get("agent_log", []) + ["rag_context_agent: skipped (SPAM)"]
        return state

    query = state.get("message_text", "")
    docs = retrieve(query, top_k=3)
    state["rag_context"] = "\n\n".join(docs)
    state["agent_log"] = state.get("agent_log", []) + [
        f"rag_context_agent: retrieved {len(docs)} docs"
    ]

    return state
