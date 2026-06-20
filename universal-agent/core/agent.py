"""
Core LangGraph agent loop.
Config drives all behavior — never change this file per domain.
"""
import asyncio
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
        Stream the agent response word-by-word.
        Runs the full LangGraph graph (with tool execution) first, then
        trickles the final text so the frontend sees a live typing effect.
        This is more reliable than raw llm.astream() which silently drops
        tool-call chunks and leaves the conversation hanging.
        """
        try:
            # Run full graph — this handles tool calls correctly
            ai_response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.chat(session_id, user_message),
            )
        except Exception as e:
            logger.exception("Stream (via graph) error: %s", e)
            yield ("error", str(e))
            return

        # Trickle word-by-word so the UI shows a live typing effect
        words = ai_response.split(" ")
        for i, word in enumerate(words):
            token = word if i == 0 else " " + word
            yield ("token", token)
            await asyncio.sleep(0.018)   # ~55 words/sec — feels natural

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
        p = cfg.persona
        e = cfg.enterprise
        parts: list[str] = []

        # ── 1. Core persona ────────────────────────────────────────────────────
        parts.append(cfg.agent.persona.strip())

        # ── 2. Identity & gender ───────────────────────────────────────────────
        identity_lines: list[str] = []
        if p.gender != "neutral":
            identity_lines.append(f"You identify as {p.gender}.")
        if p.age > 0:
            identity_lines.append(f"You present yourself as approximately {p.age} years old.")
        if identity_lines:
            parts.append("IDENTITY:\n" + " ".join(identity_lines))

        # ── 3. Tone & communication style ─────────────────────────────────────
        style_block = (
            f"TONE & STYLE:\n"
            f"- Overall tone: {p.tone}\n"
            f"- Communication style: {p.communication_style}\n"
            f"- Emotional tone: {p.emotional_tone}\n"
            f"- Response length: {p.response_length} (avoid one-liners; avoid walls of text)\n"
            f"- Expertise: present yourself as an {p.expertise_level}\n"
            f"- Language style: {p.language_style}"
        )
        if p.always_greet_with:
            style_block += f"\n- Always open your response with: \"{p.always_greet_with}\""
        parts.append(style_block)

        # ── 4. App context ─────────────────────────────────────────────────────
        if cfg.context.app_name:
            parts.append(f"APPLICATION: You are the AI assistant for {cfg.context.app_name}.")
        if cfg.context.app_description:
            parts.append(f"PLATFORM CONTEXT:\n{cfg.context.app_description.strip()}")
        if cfg.context.extra_facts:
            parts.append("KEY PLATFORM FACTS:\n" + "\n".join(f"- {f}" for f in cfg.context.extra_facts))

        # ── 5. Knowledge file ──────────────────────────────────────────────────
        if cfg.context.knowledge_file:
            from pathlib import Path
            kf = Path(cfg.context.knowledge_file)
            if kf.exists():
                parts.append("DOMAIN KNOWLEDGE:\n" + kf.read_text(encoding="utf-8"))

        # ── 6. Enterprise guardrails ───────────────────────────────────────────
        guardrail_lines: list[str] = []
        if e.domain_strict:
            guardrail_lines.append(
                "DOMAIN BOUNDARY (STRICT): Only answer questions within your defined domain. "
                f"For anything outside it, say: \"{cfg.agent.fallback_message}\""
            )
        if e.safe_topics_only:
            guardrail_lines.append(
                "SAFETY: Never give medical diagnoses, legal advice, financial investment advice, "
                "specific predictions about death or serious illness, or criminal matter guidance."
            )
        if e.require_disclaimer:
            guardrail_lines.append(
                f"DISCLAIMER: When a user's question touches health, legal, or financial matters, "
                f"append this at the end of your reply:\n\"{e.disclaimer_text}\""
            )
        if e.always_identify_as_ai:
            guardrail_lines.append(
                "AI TRANSPARENCY: If a user asks whether you are human or AI, always truthfully "
                "say you are an AI assistant. Never claim to be a real human."
            )
        if e.escalation_keywords:
            kw_list = ", ".join(f'"{k}"' for k in e.escalation_keywords)
            guardrail_lines.append(
                f"CRISIS ESCALATION: If the user's message contains any of [{kw_list}], "
                f"immediately respond with:\n\"{e.escalation_response}\"\nDo not continue with other content."
            )
        if e.watermark:
            guardrail_lines.append(f"BRANDING: Sign every response with: \"{e.watermark}\"")
        if guardrail_lines:
            parts.append("ENTERPRISE RULES:\n" + "\n\n".join(guardrail_lines))

        # ── 7. Response language ───────────────────────────────────────────────
        parts.append(f"LANGUAGE: Always respond in {cfg.agent.language} unless the user writes in another language, in which case mirror their language.")

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
