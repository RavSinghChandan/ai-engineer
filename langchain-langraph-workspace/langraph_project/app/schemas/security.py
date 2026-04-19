from pydantic import BaseModel, Field
from typing import Optional


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class UserInfo(BaseModel):
    username: str
    role: str
    name: str


class HILSubmitRequest(BaseModel):
    application_id: str = Field(..., description="Unique application identifier")
    loan_amount: float = Field(..., gt=0, description="Requested loan amount in USD")
    applicant_name: str = Field(..., description="Full name of the applicant")


class HILSubmitResponse(BaseModel):
    application_id: str
    status: str
    risk_level: str


class HILDecisionRequest(BaseModel):
    decision: str = Field(..., description="'approved' or 'rejected'")
    notes: str = Field(default="", description="Officer notes or rejection reason")


class HILDecisionResponse(BaseModel):
    application_id: str
    final_status: str
    conditions: list
    approver: str
    notes: str
    risk_level: str
