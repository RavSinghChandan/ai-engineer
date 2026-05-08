from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.core.llm_router import get_llm
from app.core.logger import get_logger

logger = get_logger(__name__)


def get_reasoning_chain(system_prompt: str, question: str = ""):
    """Returns a prompt | LLM | parser chain, routing to OpenAI or DeepSeek by token count."""
    llm = get_llm(question)
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("placeholder", "{history}"),
        ("human", "{input}"),
    ])
    return prompt | llm | StrOutputParser()
