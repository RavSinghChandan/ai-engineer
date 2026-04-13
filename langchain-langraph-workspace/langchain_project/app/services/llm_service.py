import os
from langchain_openai import ChatOpenAI # pyright: ignore[reportMissingImports]
from langchain.prompts import ChatPromptTemplate # pyright: ignore[reportMissingImports]
from langchain_core.messages import HumanMessage, AIMessage # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv # pyright: ignore[reportMissingImports]

load_dotenv()

llm = ChatOpenAI(
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    model="gpt-3.5-turbo",
    temperature=0.7,
)

# Simple in-memory chat history (list of messages)
chat_history: list = []

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI assistant."),
    ("placeholder", "{history}"),
    ("human", "{input}"),
])

def chat_with_llm(question: str) -> str:
    messages = prompt.format_messages(history=chat_history, input=question)
    response = llm.invoke(messages)
    # Save to history
    chat_history.append(HumanMessage(content=question))
    chat_history.append(AIMessage(content=response.content))
    return response.content
