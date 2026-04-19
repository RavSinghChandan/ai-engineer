"""
LLM Service Module
Handles all LangChain and OpenAI/DeepSeek interactions with token-based routing.

Routing strategy:
  - < LLM_TOKEN_THRESHOLD tokens  → OpenAI (gpt-4o-mini)
  - >= LLM_TOKEN_THRESHOLD tokens → DeepSeek (deepseek-chat)
"""

import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.chat_message_histories import ChatMessageHistory

load_dotenv()

# ~4 characters per token is a reasonable approximation without tiktoken
_CHARS_PER_TOKEN = 4
_TOKEN_THRESHOLD = int(os.getenv("LLM_TOKEN_THRESHOLD", "50"))

_OPENAI_MODEL = "gpt-4o-mini"
_DEEPSEEK_MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def _get_routed_llm(text: str) -> ChatOpenAI:
    """Return OpenAI for small requests, DeepSeek for large ones."""
    token_count = _estimate_tokens(text)
    if token_count >= _TOKEN_THRESHOLD:
        deepseek_key = os.getenv("DEEPSEEK_API_KEY")
        if not deepseek_key:
            raise ValueError("DEEPSEEK_API_KEY not found in environment variables.")
        return ChatOpenAI(
            model=_DEEPSEEK_MODEL,
            api_key=deepseek_key,
            base_url=_DEEPSEEK_BASE_URL,
            temperature=0.7,
        )
    else:
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables.")
        return ChatOpenAI(
            model=_OPENAI_MODEL,
            api_key=openai_key,
            temperature=0.7,
        )


class ChatService:
    """Service class for managing chat interactions with token-based LLM routing."""

    def __init__(self):
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError(
                "OPENAI_API_KEY not found in environment variables. "
                "Please create a .env file with your API key."
            )
        deepseek_key = os.getenv("DEEPSEEK_API_KEY")
        if not deepseek_key:
            raise ValueError(
                "DEEPSEEK_API_KEY not found in environment variables. "
                "Please add DEEPSEEK_API_KEY to your .env file."
            )

        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful and friendly AI assistant. Provide clear, concise, and helpful responses."),
            ("human", "{input}")
        ])
        self.chat_history = ChatMessageHistory()

    def get_response(self, user_input: str) -> str:
        """Route to OpenAI or DeepSeek based on input token count, then return response."""
        try:
            llm = _get_routed_llm(user_input)
            chain = self.prompt_template | llm
            response = chain.invoke({"input": user_input})
            ai_message = response.content
            self.chat_history.add_user_message(user_input)
            self.chat_history.add_ai_message(ai_message)
            return ai_message
        except Exception as e:
            return f"Error: Unable to get response from AI. {str(e)}"

    def get_conversation_history(self) -> list:
        return self.chat_history.messages

    def clear_history(self):
        self.chat_history = ChatMessageHistory()

