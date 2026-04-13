from pydantic import BaseModel, Field
from typing import List


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, description="The user's question")
    prompt_version: str = Field(default="v1", description="Prompt version to use (v1 or v2)")
    use_rag: bool = Field(default=False, description="Whether to use RAG retrieval")


class AIResponse(BaseModel):
    answer: str
    sources: List[str] = []
    steps: List[str] = []


class AgentRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Question for the agent to answer using tools")


class AgentResponse(BaseModel):
    answer: str
    tools_used: List[str] = []
    steps: List[str] = []


class MemoryMessage(BaseModel):
    role: str
    content: str


class MemoryResponse(BaseModel):
    messages: List[MemoryMessage]
    total: int


class PromptInfo(BaseModel):
    version: str
    content: str


class PromptsResponse(BaseModel):
    prompts: List[PromptInfo]


class IngestResponse(BaseModel):
    message: str
    filename: str
    chunks_created: int
