"""
Core LangGraph agent loop.
This is the heart of the universal agent — it never changes regardless of domain.
Config drives all behavior.
"""
import logging
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from .config_loader import AgentConfig
from .knowledge import build_retriever
from .llm import build_llm
from .memory import MemoryStore
from .tools import build_tools

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


class UniversalAgent:
    """
    Drop-in AI agent. Instantiate once, call `.chat()` per request.
    Thread-safe for concurrent requests.
    """

    def __init__(self, config: AgentConfig):
        self._cfg = config
        self._memory = MemoryStore(config.memory)
        self._retriever = build_retriever(config.knowledge_base)
        self._llm = build_llm(config.llm)
        self._tools = build_tools(config.tools)
        self._system_prompt = self._build_system_prompt()
        self._graph = self._build_graph()
        logger.info(
            f"UniversalAgent ready: provider={config.llm.provider} "
            f"model={config.llm.model} tools={[t.name for t in self._tools]} "
            f"rag={'on' if self._retriever else 'off'}"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chat(self, session_id: str, user_message: str) -> str:
        """
        Process one user message and return the agent's response.
        Maintains per-session conversation history automatically.
        """
        history = self._memory.get_history(session_id)
        context_inject = self._retrieve_context(user_message) if self._retriever else ""

        input_messages = [SystemMessage(content=self._system_prompt)]
        if context_inject:
            from langchain_core.messages import SystemMessage as SM
            input_messages.append(SM(content=f"Relevant context:\n{context_inject}"))
        input_messages.extend(history)

        from langchain_core.messages import HumanMessage
        input_messages.append(HumanMessage(content=user_message))

        state = {"messages": input_messages}
        result = self._graph.invoke(state)

        ai_response = result["messages"][-1].content
        self._memory.append_turn(session_id, user_message, ai_response)

        return ai_response

    def clear_session(self, session_id: str) -> None:
        self._memory.clear(session_id)

    @property
    def active_sessions(self) -> int:
        return self._memory.active_sessions

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _build_system_prompt(self) -> str:
        cfg = self._cfg
        parts = [cfg.agent.persona.strip()]

        if cfg.context.app_name:
            parts.append(f"You are the AI assistant for: {cfg.context.app_name}.")
        if cfg.context.app_description:
            parts.append(cfg.context.app_description)
        if cfg.context.extra_facts:
            parts.append("Key facts about this application:")
            parts.extend(f"- {fact}" for fact in cfg.context.extra_facts)

        # Load from knowledge file if specified
        if cfg.context.knowledge_file:
            from pathlib import Path
            kf = Path(cfg.context.knowledge_file)
            if kf.exists():
                parts.append("\nDomain knowledge:")
                parts.append(kf.read_text(encoding="utf-8"))

        parts.append(f"\nAlways respond in {cfg.agent.language} language.")
        parts.append(
            f"If you cannot answer confidently, say: {cfg.agent.fallback_message}"
        )

        return "\n\n".join(parts)

    def _build_graph(self) -> StateGraph:
        llm = self._llm
        tools = self._tools

        if tools:
            llm = llm.bind_tools(tools)

        def call_model(state: AgentState) -> AgentState:
            response = llm.invoke(state["messages"])
            return {"messages": [response]}

        builder = StateGraph(AgentState)
        builder.add_node("agent", call_model)

        if tools:
            tool_node = ToolNode(tools)
            builder.add_node("tools", tool_node)
            builder.set_entry_point("agent")
            builder.add_conditional_edges("agent", tools_condition)
            builder.add_edge("tools", "agent")
        else:
            builder.set_entry_point("agent")
            builder.add_edge("agent", END)

        return builder.compile()

    def _retrieve_context(self, query: str) -> str:
        try:
            docs = self._retriever.get_relevant_documents(query)
            return "\n\n".join(d.page_content for d in docs)
        except Exception as e:
            logger.warning(f"RAG retrieval failed: {e}")
            return ""
