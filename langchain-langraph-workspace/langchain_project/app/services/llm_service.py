from langchain.prompts import ChatPromptTemplate # pyright: ignore[reportMissingImports]
from langchain_core.messages import HumanMessage, AIMessage # pyright: ignore[reportMissingImports]

from app.core.llm_router import get_llm

chat_history: list = []

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI assistant."),
    ("placeholder", "{history}"),
    ("human", "{input}"),
])

def chat_with_llm(question: str) -> str:
    llm = get_llm(question)
    messages = prompt.format_messages(history=chat_history, input=question)
    response = llm.invoke(messages)
    chat_history.append(HumanMessage(content=question))
    chat_history.append(AIMessage(content=response.content))
    return response.content
