from fastapi import APIRouter
from pydantic import BaseModel
from app.services.llm_service import chat_with_llm

router = APIRouter()

class ChatRequest(BaseModel):
    question: str

@router.post("/chat")
def chat_endpoint(request: ChatRequest):
    response = chat_with_llm(request.question)
    return {"answer": response}
