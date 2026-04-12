"""
LLM Service Module
Handles all LangChain and OpenAI interactions
"""

import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory

# Load environment variables from .env file
load_dotenv()


class ChatService:
    """Service class for managing chat interactions with OpenAI"""

    def __init__(self, model: str = "gpt-4o-mini"):
        """
        Initialize the ChatService with OpenAI API

        Args:
            model: The OpenAI model to use (default: gpt-4o-mini)
        """
        # Get API key from environment
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY not found in environment variables. "
                "Please create a .env file with your API key."
            )

        # Initialize the LLM
        self.llm = ChatOpenAI(
            model=model,
            api_key=api_key,
            temperature=0.7
        )

        # Define the prompt template
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful and friendly AI assistant. Provide clear, concise, and helpful responses."),
            ("human", "{input}")
        ])

        # Initialize message history
        self.chat_history = ChatMessageHistory()

        # Create the chain with message history
        self.chain = (
            self.prompt_template
            | self.llm
        )

    def get_response(self, user_input: str) -> str:
        """
        Get a response from the AI based on user input

        Args:
            user_input: The user's message

        Returns:
            The AI's response as a string
        """
        try:
            # Invoke the chain with the user input
            response = self.chain.invoke({"input": user_input})

            # Extract the content from the response
            ai_message = response.content

            # Store messages in history for context
            self.chat_history.add_user_message(user_input)
            self.chat_history.add_ai_message(ai_message)

            return ai_message
        except Exception as e:
            return f"Error: Unable to get response from AI. {str(e)}"

    def get_conversation_history(self) -> list:
        """
        Get the conversation history

        Returns:
            List of messages in the conversation
        """
        return self.chat_history.messages

    def clear_history(self):
        """Clear the conversation history"""
        self.chat_history = ChatMessageHistory()

