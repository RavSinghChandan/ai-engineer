from enum import Enum
from typing import List, Optional
from pydantic import BaseModel
from typing_extensions import TypedDict


class ComplianceCategory(str, Enum):
    KYC = "kyc"
    AML = "aml"
    GDPR = "gdpr"
    PCI_DSS = "pci_dss"
    BASEL = "basel"
    GENERAL = "general"


class RetrievedDocument(BaseModel):
    content: str
    source: str
    category: ComplianceCategory
    relevance_score: float


# LangGraph state
class ComplianceRAGState(TypedDict, total=False):
    query: str
    category: Optional[ComplianceCategory]
    retrieved_docs: List[dict]
    graded_docs: List[dict]
    answer: str
    sources: List[str]
    retrieval_count: int
    error: Optional[str]


# API models
class ComplianceQueryRequest(BaseModel):
    query: str
    category: Optional[ComplianceCategory] = None
    top_k: int = 4


class ComplianceQueryResponse(BaseModel):
    query: str
    answer: str
    sources: List[str]
    category: Optional[ComplianceCategory]
    documents_retrieved: int
    documents_used: int
