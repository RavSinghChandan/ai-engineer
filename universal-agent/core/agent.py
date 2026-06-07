"""
Core LangGraph agent loop.
Config drives all behavior — never change this file per domain.
"""
import logging
from typing import Annotated, AsyncGenerator, Optional, Tuple, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from .config_loader import AgentConfig
from .knowledge import build_retriever
from .llm import build_llm
from .memory import build_memory
from .tools import build_tools

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


class UniversalAgent:
    """
    Drop-in AI agent. Instantiate once, call .chat() or .stream() per request.
    Thread-safe for concurrent requests.
    """

    def __init__(self, config: AgentConfig):
        self._cfg = config
        self._memory = build_memory(config.memory)       # pluggable backend
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

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def name(self) -> str:
        return self._cfg.agent.name

    def chat(self, session_id: str, user_message: str, system_prompt: Optional[str] = None) -> str:
        """Process one user message and return the full response."""
        input_messages = self._build_input(session_id, user_message, system_prompt)
        result = self._graph.invoke({"messages": input_messages})
        ai_response = result["messages"][-1].content
        self._memory.append_turn(session_id, user_message, ai_response)
        return ai_response

    async def stream(self, session_id: str, user_message: str) -> AsyncGenerator[Tuple[str, str], None]:
        """
        Stream tokens as they arrive from the LLM.
        Yields (event_type, data) tuples:
          ("token", "word")
          ("done",  "")
        """
        input_messages = self._build_input(session_id, user_message)

        # Bind tools to streaming LLM
        llm = self._llm
        if self._tools:
            llm = llm.bind_tools(self._tools)

        full_response: list[str] = []
        try:
            async for chunk in llm.astream(input_messages):
                token = chunk.content
                if token:
                    full_response.append(token)
                    yield ("token", token)
        except Exception as e:
            logger.exception(f"Streaming error: {e}")
            yield ("error", str(e))
            return

        ai_response = "".join(full_response)
        self._memory.append_turn(session_id, user_message, ai_response)
        yield ("done", ai_response)

    def clear_session(self, session_id: str) -> None:
        self._memory.clear(session_id)

    @property
    def active_sessions(self) -> int:
        return self._memory.active_sessions

    # ── Internals ──────────────────────────────────────────────────────────────

    def _build_input(self, session_id: str, user_message: str, system_prompt: Optional[str] = None) -> list[BaseMessage]:
        history = self._memory.get_history(session_id)
        context = self._retrieve_context(user_message) if self._retriever else ""

        active_prompt = system_prompt if system_prompt else self._system_prompt
        messages: list[BaseMessage] = [SystemMessage(content=active_prompt)]
        if context:
            messages.append(SystemMessage(content=f"Relevant context:\n{context}"))
        messages.extend(history)
        messages.append(HumanMessage(content=user_message))
        return messages

    def _build_system_prompt(self) -> str:
        cfg = self._cfg
        parts = [cfg.agent.persona.strip()]
        if cfg.context.app_name:
            parts.append(f"You are the AI assistant for: {cfg.context.app_name}.")
        if cfg.context.app_description:
            parts.append(cfg.context.app_description)
        if cfg.context.extra_facts:
            parts.append("Key facts:")
            parts.extend(f"- {fact}" for fact in cfg.context.extra_facts)
        if cfg.context.knowledge_file:
            from pathlib import Path
            kf = Path(cfg.context.knowledge_file)
            if kf.exists():
                parts.append("\nDomain knowledge:")
                parts.append(kf.read_text(encoding="utf-8"))
        parts.append(f"\nAlways respond in {cfg.agent.language} language.")
        parts.append(f"If you cannot answer confidently, say: {cfg.agent.fallback_message}")
        return "\n\n".join(parts)

    def _build_graph(self):
        llm = self._llm
        tools = self._tools
        if tools:
            llm = llm.bind_tools(tools)

        def call_model(state: AgentState) -> AgentState:
            return {"messages": [llm.invoke(state["messages"])]}

        builder = StateGraph(AgentState)
        builder.add_node("agent", call_model)
        if tools:
            builder.add_node("tools", ToolNode(tools))
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
