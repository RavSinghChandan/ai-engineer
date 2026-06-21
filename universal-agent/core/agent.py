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
        hv = cfg.human_voice
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

        # ── 4. Human voice personality (injected only when enabled) ───────────
        if hv.enabled:
            parts.append(self._build_human_voice_block(hv))

        # ── 5. App context ─────────────────────────────────────────────────────
        if cfg.context.app_name:
            parts.append(f"APPLICATION: You are the AI assistant for {cfg.context.app_name}.")
        if cfg.context.app_description:
            parts.append(f"PLATFORM CONTEXT:\n{cfg.context.app_description.strip()}")
        if cfg.context.extra_facts:
            parts.append("KEY PLATFORM FACTS:\n" + "\n".join(f"- {f}" for f in cfg.context.extra_facts))

        # ── 6. Knowledge file ──────────────────────────────────────────────────
        if cfg.context.knowledge_file:
            from pathlib import Path
            kf = Path(cfg.context.knowledge_file)
            if kf.exists():
                parts.append("DOMAIN KNOWLEDGE:\n" + kf.read_text(encoding="utf-8"))

        # ── 7. Enterprise guardrails ───────────────────────────────────────────
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
                "say you are an AI. Never claim to be a real human."
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

        # ── 8. Response language ───────────────────────────────────────────────
        parts.append(f"LANGUAGE: Always respond in {cfg.agent.language} unless the user writes in another language, in which case mirror their language.")

        return "\n\n".join(parts)

    @staticmethod
    def _build_human_voice_block(hv) -> str:
        """
        Converts the HumanVoiceConfig into a detailed system prompt block.
        This is what makes the LLM sound like a specific human being.
        All behaviour is driven by config — nothing hardcoded here.
        """
        lines: list[str] = ["═" * 60,
                             "HUMAN VOICE PERSONALITY — READ AND FOLLOW EXACTLY",
                             "═" * 60]

        # ── Backstory ──────────────────────────────────────────────────────────
        if hv.backstory:
            lines.append(
                "YOUR STORY (first-person, this is who you are):\n" + hv.backstory.strip()
            )

        # ── Core values ────────────────────────────────────────────────────────
        if hv.core_values:
            lines.append(
                "YOUR CORE VALUES — these drive every word you say:\n"
                + "\n".join(f"  • {v}" for v in hv.core_values)
            )

        # ── Speech patterns ────────────────────────────────────────────────────
        sp = hv.speech_patterns
        speech_lines: list[str] = ["HOW YOU SPEAK — these are YOUR natural patterns:"]

        if sp.openers:
            speech_lines.append(
                f"  OPENERS — you sometimes begin a response with one of these "
                f"({int(sp.opener_probability * 100)}% of the time, not every time):\n"
                + "  " + " | ".join(f'"{o}"' for o in sp.openers)
            )

        if sp.affirmations:
            speech_lines.append(
                "  AFFIRMATIONS — when the user shares something, you react naturally:\n"
                + "  " + " | ".join(f'"{a}"' for a in sp.affirmations)
            )

        if sp.thinking_phrases:
            speech_lines.append(
                f"  THINKING ALOUD — when forming a deep answer, you occasionally say "
                f"({int(sp.thinking_probability * 100)}% of the time):\n"
                + "  " + " | ".join(f'"{t}"' for t in sp.thinking_phrases)
            )

        if sp.empathy_bridges:
            speech_lines.append(
                f"  EMPATHY — when the user sounds worried, confused, or emotional, "
                f"you acknowledge it first ({int(sp.empathy_probability * 100)}% of the time):\n"
                + "  " + " | ".join(f'"{e_}' + '"' for e_ in sp.empathy_bridges)
            )

        if sp.closers:
            non_empty_closers = [c for c in sp.closers if c]
            if non_empty_closers:
                speech_lines.append(
                    f"  CLOSERS — you sometimes end with a reflective question or pause "
                    f"({int(sp.closer_probability * 100)}% of the time):\n"
                    + "  " + " | ".join(f'"{c}"' for c in non_empty_closers)
                )

        lines.append("\n".join(speech_lines))

        # ── Rhythm ─────────────────────────────────────────────────────────────
        r = hv.rhythm
        rhythm_lines: list[str] = ["YOUR RHYTHM — how your voice moves:"]
        rhythm_lines.append(f"  - Keep responses to {r.sentences_per_response} sentences on average.")
        rhythm_lines.append(f"  - Each sentence: max {r.max_words_per_sentence} words. Short. Punchy. Breathable.")
        if r.use_ellipsis_for_pause:
            rhythm_lines.append('  - Use "…" to create natural pauses mid-thought: "The answer lies within… you already know it."')
        if r.use_em_dash_for_rhythm:
            rhythm_lines.append('  - Use " — " for dramatic rhythm: "You are capable — more than you believe."')
        if r.use_repetition_for_emphasis:
            rhythm_lines.append('  - Occasional word repetition for impact: "Focus. Just focus." or "You. Are. Ready."')
        lines.append("\n".join(rhythm_lines))

        # ── Emotional profile ──────────────────────────────────────────────────
        ep = hv.emotional_profile
        emo_lines: list[str] = [f"YOUR EMOTIONAL BASELINE: {ep.baseline_emotion.upper()}"]
        emo_lines.append(
            f"  Emotional mirroring: {int(ep.emotional_mirroring * 100)}% — "
            "you adapt your energy to match the user's (high = very empathetic)."
        )
        if ep.shows_enthusiasm and ep.enthusiasm_words:
            emo_lines.append(
                "  When something is genuinely profound, you use words like: "
                + ", ".join(f'"{w}"' for w in ep.enthusiasm_words)
            )
        if ep.shows_concern and ep.concern_triggers:
            emo_lines.append(
                "  When the user mentions: "
                + ", ".join(ep.concern_triggers)
                + " — you pause and acknowledge before answering."
            )
        if ep.celebrates_wins and ep.celebration_phrases:
            emo_lines.append(
                "  When the user shares a win or positive news, you celebrate:\n"
                + "  " + " | ".join(f'"{c}"' for c in ep.celebration_phrases)
            )
        lines.append("\n".join(emo_lines))

        # ── Memory behaviour ───────────────────────────────────────────────────
        mb = hv.memory_behavior
        mem_lines: list[str] = ["HOW YOU LISTEN AND REMEMBER:"]
        if mb.callback_to_prior and mb.callback_phrases:
            mem_lines.append(
                "  You connect threads across the conversation. "
                f"When relevant, refer back using phrases like:\n"
                + "  " + " | ".join(f'"{c}"' for c in mb.callback_phrases)
            )
        if mb.use_user_name:
            mem_lines.append(
                f"  If you learn the user's name, use it naturally in "
                f"{int(mb.name_usage_probability * 100)}% of responses — not every time."
            )
        if mb.echo_back_intent:
            mem_lines.append(
                '  Sometimes echo back what you understood: "So you\'re asking about…" — '
                "this shows you truly listened."
            )
        lines.append("\n".join(mem_lines))

        # ── Hard boundaries ────────────────────────────────────────────────────
        b = hv.boundaries
        boundary_lines: list[str] = ["WHAT YOU NEVER SAY — these break your human character:"]
        if b.never_says:
            boundary_lines.append(
                "  BANNED PHRASES — never use these (they sound robotic or corporate):\n"
                + "  " + ", ".join(f'"{w}"' for w in b.never_says)
            )
        if b.never_starts_with:
            boundary_lines.append(
                "  NEVER START a response with:\n"
                + "  " + ", ".join(f'"{w}"' for w in b.never_starts_with)
            )
        if b.soft_deflect_topics and b.soft_deflect_phrase:
            boundary_lines.append(
                "  For topics outside your space, deflect warmly:\n"
                f'  "{b.soft_deflect_phrase}"'
            )
        boundary_lines.append(
            f"  PHRASE REUSE: Never use the same opener/closer more than "
            f"{b.max_phrase_reuse} times in one session — vary your language."
        )
        lines.append("\n".join(boundary_lines))

        lines.append("═" * 60)
        return "\n\n".join(lines)

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
