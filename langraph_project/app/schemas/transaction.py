from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class TransactionType(str, Enum):
    PAYMENT = "payment"
    LOAN = "loan"
    FRAUD_CHECK = "fraud_check"
    COMPLIANCE = "compliance"
    ACCOUNT_LOOKUP = "account_lookup"
    UNKNOWN = "unknown"


class TransactionPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RoutingDecision(str, Enum):
    PAYMENT_PROCESSOR = "payment_processor"
    LOAN_ENGINE = "loan_engine"
    FRAUD_ENGINE = "fraud_engine"
    COMPLIANCE_ASSISTANT = "compliance_assistant"
    ACCOUNT_AGENT = "account_agent"
    HUMAN_REVIEW = "human_review"


# LangGraph state — passed between all nodes
class TransactionState(BaseModel):
    transaction_id: str
    transaction_type: TransactionType
    amount: Optional[float] = None
    account_id: Optional[str] = None
    priority: Optional[TransactionPriority] = None
    routing_decision: Optional[RoutingDecision] = None
    requires_human_review: bool = False
    error: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


# API request / response
class RouteTransactionRequest(BaseModel):
    transaction_id: str
    transaction_type: TransactionType
    amount: Optional[float] = None
    account_id: Optional[str] = None


class RouteTransactionResponse(BaseModel):
    transaction_id: str
    routing_decision: RoutingDecision
    priority: TransactionPriority
    requires_human_review: bool
    metadata: dict
