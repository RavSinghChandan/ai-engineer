import logging

from fastapi import APIRouter, HTTPException

from app.schemas.compliance import ComplianceQueryRequest, ComplianceQueryResponse
from app.graphs.compliance_rag import run_compliance_rag

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["Compliance"])


@router.post("/query", response_model=ComplianceQueryResponse)
async def query_compliance(request: ComplianceQueryRequest) -> ComplianceQueryResponse:
    """
    Natural-language compliance question answered via RAG.
    Retrieves from FAISS index of internal policy documents,
    grades relevance, then generates a cited answer.
    """
    try:
        result = run_compliance_rag(
            query=request.query,
            category=request.category.value if request.category else None,
            top_k=request.top_k,
        )
    except Exception as exc:
        logger.exception("Compliance RAG failed for query: %s", request.query)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ComplianceQueryResponse(
        query=request.query,
        answer=result["answer"],
        sources=result["sources"],
        category=request.category,
        documents_retrieved=result["documents_retrieved"],
        documents_used=result["documents_used"],
    )
