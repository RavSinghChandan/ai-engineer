from typing import List, Optional
from pydantic import BaseModel, Field
from typing_extensions import TypedDict, Annotated
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


# LangGraph state — uses add_messages reducer so history accumulates automatically
class ConversationState(TypedDict, total=False):
    session_id: str
    account_id: Optional[str]
    messages: Annotated[List[BaseMessage], add_messages]
    user_profile: dict           # long-term: name, preferred_language, last_topics
    current_intent: Optional[str]
    context_summary: Optional[str]


# API models
class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ConversationRequest(BaseModel):
    session_id: str
    message: str
    account_id: Optional[str] = None


class ConversationResponse(BaseModel):
    session_id: str
    reply: str
    intent: Optional[str] = None
    turn_count: int
    history: List[ChatMessage] = Field(default_factory=list)
