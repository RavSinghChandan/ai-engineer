import logging
from fastapi import APIRouter, HTTPException
from app.schemas.compliance import ComplianceQueryRequest, ComplianceQueryResponse
from app.graphs.compliance_rag import run_compliance_rag

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/compliance", tags=["Compliance"])


@router.post(
    "/query",
    response_model=ComplianceQueryResponse,
    summary="Ask a compliance question (RAG)",
    description=(
        "Answers banking compliance questions using **Retrieval-Augmented Generation** "
        "over internal policy documents.\n\n"
        "**Pipeline:** `prepare_query → retrieve_documents (FAISS) → "
        "grade_documents → generate_answer / fallback_response`\n\n"
        "**Documents indexed:**\n"
        "- `kyc` — KYC Policy v3.2 (CIP, EDD, sanctions screening)\n"
        "- `aml` — AML Manual v5.1 (SAR/CTR thresholds, red flags, Travel Rule)\n"
        "- `pci_dss` — PCI DSS v4.0 (encryption, access control, breach reporting)\n"
        "- `gdpr` — GDPR Policy v2.3 (data subject rights, retention, DPA notification)\n\n"
        "Pass `category` to restrict retrieval to a specific policy domain."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "AML — SAR deadline": {
                            "summary": "When must a SAR be filed?",
                            "value": {"query": "What is the deadline for filing a Suspicious Activity Report?", "category": "aml"},
                        },
                        "KYC — required documents": {
                            "summary": "What ID is needed for KYC?",
                            "value": {"query": "What documents are required for individual customer KYC?", "category": "kyc"},
                        },
                        "PCI DSS — card storage": {
                            "summary": "Can we store CVV codes?",
                            "value": {"query": "Are we allowed to store CVV2 codes after authorization?", "category": "pci_dss"},
                        },
                        "GDPR — breach notification": {
                            "summary": "GDPR breach notification window",
                            "value": {"query": "How many hours do we have to report a data breach under GDPR?", "category": "gdpr"},
                        },
                    }
                }
            }
        }
    },
)
async def query_compliance(request: ComplianceQueryRequest) -> ComplianceQueryResponse:
    try:
        result = run_compliance_rag(
            query=request.query,
            category=request.category.value if request.category else None,
            top_k=request.top_k,
        )
    except Exception as exc:
        logger.exception("Compliance RAG failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ComplianceQueryResponse(
        query=request.query,
        answer=result["answer"],
        sources=result["sources"],
        category=request.category,
        documents_retrieved=result["documents_retrieved"],
        documents_used=result["documents_used"],
    )
