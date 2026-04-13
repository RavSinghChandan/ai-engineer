from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)


def get_reasoning_chain(system_prompt: str):
    """Returns a prompt | LLM | parser chain with the given system prompt."""
    llm = ChatOpenAI(
        openai_api_key=settings.openai_api_key,
        model=settings.model_name,
        temperature=settings.temperature,
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("placeholder", "{history}"),
        ("human", "{input}"),
    ])
    return prompt | llm | StrOutputParser()
