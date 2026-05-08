from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field
from typing_extensions import TypedDict


class WorkflowType(str, Enum):
    LOAN = "loan"
    ACCOUNT = "account"
    COMPLIANCE = "compliance"
    TRANSACTION = "transaction"
    CONVERSATION = "conversation"
    COMMITTEE = "committee"
    RESILIENCE = "resilience"
    UNKNOWN = "unknown"


# LangGraph typed state for the autonomous agent
class AutonomousAgentState(TypedDict, total=False):
    query: str
    session_id: Optional[str]
    account_id: Optional[str]
    context: dict                    # any extra structured context
    intent: Optional[str]            # keyword-classified intent
    selected_workflow: Optional[str] # which sub-graph was chosen
    workflow_result: Optional[dict]  # raw output from sub-graph
    rag_augmentation: Optional[str]  # RAG supplement (compliance queries)
    final_answer: Optional[str]
    sources: list
    error: Optional[str]
    used_fallback: bool
    execution_steps: list            # audit trail


# API models
class AutonomousRequest(BaseModel):
    query: str = Field(..., description="Natural language banking query")
    session_id: str = Field(default="default-session", description="Conversation session ID")
    account_id: Optional[str] = Field(default=None, description="Account ID if known")
    context: dict = Field(default_factory=dict, description="Optional structured context")


class AutonomousResponse(BaseModel):
    query: str
    answer: str
    workflow_used: str
    sources: list = []
    used_fallback: bool = False
    execution_steps: list = []
    session_id: str
