from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings
from app.core.logger import get_logger
from app.tools.tool_1 import calculator
from app.tools.tool_2 import get_current_datetime

logger = get_logger(__name__)

tools = [calculator, get_current_datetime]

_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI assistant. Use tools when needed. Think step by step."),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])


def get_agent_executor() -> AgentExecutor:
    llm = ChatOpenAI(
        openai_api_key=settings.openai_api_key,
        model=settings.model_name,
        temperature=settings.temperature,
    )
    agent = create_tool_calling_agent(llm, tools, _prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
    )
