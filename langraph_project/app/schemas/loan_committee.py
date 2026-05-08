from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field
from typing_extensions import TypedDict


class CommitteeVerdict(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"   # humans must review


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AgentMessage(BaseModel):
    agent: str
    content: str
    confidence: float = Field(ge=0.0, le=1.0)


# LangGraph multi-agent state — each agent reads and writes to this
class LoanCommitteeState(TypedDict, total=False):
    # Application input
    application_id: str
    applicant_name: str
    loan_type: str
    requested_amount: float
    annual_income: float
    credit_score: int
    employment_years: float
    existing_debt: float

    # Planner outputs
    evaluation_plan: List[str]
    risk_factors: List[str]
    required_checks: List[str]

    # Executor outputs
    eligibility_passed: bool
    dti_ratio: float
    risk_score: float
    interest_rate: float
    recommended_amount: float
    executor_notes: List[str]

    # Validator outputs
    validator_confidence: float
    validator_notes: List[str]
    risk_level: RiskLevel
    final_verdict: CommitteeVerdict
    conditions: List[str]       # approval conditions e.g. "collateral required"

    # Shared audit trail
    agent_messages: List[dict]
    error: Optional[str]


# API models
class LoanCommitteeRequest(BaseModel):
    application_id: str
    applicant_name: str
    loan_type: str = "personal"
    requested_amount: float = Field(gt=0)
    annual_income: float = Field(gt=0)
    credit_score: int = Field(ge=300, le=850)
    employment_years: float = Field(ge=0)
    existing_debt: float = Field(ge=0, default=0.0)


class LoanCommitteeResponse(BaseModel):
    application_id: str
    applicant_name: str
    final_verdict: CommitteeVerdict
    risk_level: RiskLevel
    recommended_amount: Optional[float]
    interest_rate: Optional[float]
    conditions: List[str]
    validator_confidence: float
    evaluation_plan: List[str]
    executor_notes: List[str]
    validator_notes: List[str]
    agent_messages: List[dict]
