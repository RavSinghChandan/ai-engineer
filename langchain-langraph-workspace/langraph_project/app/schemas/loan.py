from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class LoanDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING_REVIEW = "pending_review"


class LoanType(str, Enum):
    PERSONAL = "personal"
    HOME = "home"
    AUTO = "auto"
    BUSINESS = "business"


# LangGraph typed state
from typing_extensions import TypedDict


class LoanState(TypedDict, total=False):
    # Input fields
    applicant_id: str
    loan_type: LoanType
    requested_amount: float
    annual_income: float
    credit_score: int
    employment_years: float
    existing_debt: float

    # Computed during workflow
    debt_to_income_ratio: float
    eligible_amount: float
    interest_rate: float
    loan_term_months: int

    # Decision
    decision: LoanDecision
    rejection_reason: Optional[str]
    risk_score: float

    # Control flow
    validation_passed: bool
    error: Optional[str]


# API models
class LoanEligibilityRequest(BaseModel):
    applicant_id: str
    loan_type: LoanType = LoanType.PERSONAL
    requested_amount: float = Field(gt=0)
    annual_income: float = Field(gt=0)
    credit_score: int = Field(ge=300, le=850)
    employment_years: float = Field(ge=0)
    existing_debt: float = Field(ge=0, default=0.0)


class LoanEligibilityResponse(BaseModel):
    applicant_id: str
    decision: LoanDecision
    eligible_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    loan_term_months: Optional[int] = None
    debt_to_income_ratio: Optional[float] = None
    risk_score: Optional[float] = None
    rejection_reason: Optional[str] = None
