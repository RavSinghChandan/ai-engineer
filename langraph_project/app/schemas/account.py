from enum import Enum
from typing import Optional, List
from pydantic import BaseModel
from typing_extensions import TypedDict


class AccountStatus(str, Enum):
    ACTIVE = "active"
    FROZEN = "frozen"
    CLOSED = "closed"


class TransactionCategory(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"
    TRANSFER = "transfer"
    FEE = "fee"


# ---- Tool output models ----

class AccountDetails(BaseModel):
    account_id: str
    owner_name: str
    account_type: str
    status: AccountStatus
    balance: float
    currency: str = "USD"
    opened_date: str
    branch: str


class Transaction(BaseModel):
    txn_id: str
    date: str
    description: str
    amount: float
    category: TransactionCategory
    balance_after: float


# ---- LangGraph state ----

class AccountAgentState(TypedDict, total=False):
    query: str
    account_id: str
    messages: list          # LangChain message list (HumanMessage, AIMessage, ToolMessage)
    account_details: Optional[dict]
    transactions: Optional[list]
    final_answer: Optional[str]
    error: Optional[str]


# ---- API models ----

class AccountQueryRequest(BaseModel):
    account_id: str
    query: str


class AccountQueryResponse(BaseModel):
    account_id: str
    query: str
    answer: str
    tools_used: List[str]
