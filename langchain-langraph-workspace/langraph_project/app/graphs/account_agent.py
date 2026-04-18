"""
Step 4 — Account Intelligence Agent (Tool-Calling)

Graph flow:
  inject_context
       │
       ▼
  agent_node  (LLM with tools bound — decides what to call)
       │
       ▼ (conditional)
  tool_node ──────────────▶ agent_node  (loop until no more tool calls)
       │
       ▼ (no tool calls)
      END

The agent receives the user query + account_id, then autonomously decides
whether to call get_account_details, get_transactions, or both.
"""

import json
import logging
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from app.schemas.account import AccountAgentState
from app.tools.account_tools import ACCOUNT_TOOLS
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """You are a helpful banking assistant for Bank of America.
You have access to tools to look up account information and transaction history.
Always use the provided tools to fetch real data before answering.
Be concise, accurate, and professional. Never fabricate account data."""


# ---------------------------------------------------------------------------
# Build LLM with tools bound
# ---------------------------------------------------------------------------

def _build_llm():
    llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0,
        api_key=settings.openai_api_key,
    )
    return llm.bind_tools(ACCOUNT_TOOLS)


# ---------------------------------------------------------------------------
# Tool executor — runs whichever tools the LLM requested
# ---------------------------------------------------------------------------

_TOOL_MAP = {t.name: t for t in ACCOUNT_TOOLS}


def _execute_tool_calls(ai_message: AIMessage) -> list[ToolMessage]:
    results = []
    for call in ai_message.tool_calls:
        tool_name = call["name"]
        tool_args = call["args"]
        tool_fn = _TOOL_MAP.get(tool_name)

        logger.info("Executing tool: %s | args=%s", tool_name, tool_args)

        if tool_fn is None:
            output = {"error": f"Unknown tool: {tool_name}"}
        else:
            try:
                output = tool_fn.invoke(tool_args)
            except Exception as exc:
                logger.exception("Tool %s failed", tool_name)
                output = {"error": str(exc)}

        results.append(
            ToolMessage(
                content=json.dumps(output, default=str),
                tool_call_id=call["id"],
                name=tool_name,
            )
        )
    return results


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

def inject_context(state: AccountAgentState) -> AccountAgentState:
    """Builds the initial message list from the raw query + account_id."""
    query = state["query"]
    account_id = state["account_id"]

    user_message = HumanMessage(
        content=f"Account ID: {account_id}\n\nUser question: {query}"
    )
    return {
        "messages": [SystemMessage(content=SYSTEM_PROMPT), user_message],
    }


def agent_node(state: AccountAgentState) -> AccountAgentState:
    """LLM call — may produce tool_calls or a final answer."""
    llm = _build_llm()
    messages = state["messages"]
    logger.info("Agent thinking | message_count=%d", len(messages))

    response: AIMessage = llm.invoke(messages)
    return {"messages": messages + [response]}


def tool_node(state: AccountAgentState) -> AccountAgentState:
    """Execute every tool the LLM requested in the last AI message."""
    messages = state["messages"]
    last_ai_message: AIMessage = messages[-1]

    tool_messages = _execute_tool_calls(last_ai_message)

    # Track which tools were used (stored separately for the API response)
    used_tools = [tm.name for tm in tool_messages]
    existing_tools = state.get("tools_used", [])

    return {
        "messages": messages + tool_messages,
        "tools_used": existing_tools + used_tools,
    }


# ---------------------------------------------------------------------------
# Conditional edge — loop or finish
# ---------------------------------------------------------------------------

def should_use_tools(state: AccountAgentState) -> Literal["tool_node", "__end__"]:
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tool_node"
    return "__end__"


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_account_agent():
    graph = StateGraph(AccountAgentState)

    graph.add_node("inject_context", inject_context)
    graph.add_node("agent_node", agent_node)
    graph.add_node("tool_node", tool_node)

    graph.set_entry_point("inject_context")
    graph.add_edge("inject_context", "agent_node")

    graph.add_conditional_edges(
        "agent_node",
        should_use_tools,
        {"tool_node": "tool_node", "__end__": END},
    )

    # After tools run, go back to agent for synthesis
    graph.add_edge("tool_node", "agent_node")

    return graph.compile()


account_agent_graph = build_account_agent()


def run_account_agent(account_id: str, query: str) -> dict:
    """Invoke the agent and return answer + tools used."""
    result = account_agent_graph.invoke(
        {"account_id": account_id, "query": query}
    )

    # Final answer is the last AI message with no tool_calls
    final_message = result["messages"][-1]
    answer = final_message.content if hasattr(final_message, "content") else str(final_message)

    return {
        "answer": answer,
        "tools_used": list(dict.fromkeys(result.get("tools_used", []))),  # deduplicate, preserve order
    }
