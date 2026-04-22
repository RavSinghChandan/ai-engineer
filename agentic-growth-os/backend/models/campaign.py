from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum


class CampaignType(str, Enum):
    REAL_ESTATE = "real_estate"
    COACHING = "coaching"
    ECOMMERCE = "ecommerce"
    CUSTOM = "custom"


class CampaignInput(BaseModel):
    name: str
    campaign_type: CampaignType
    product_name: str
    budget: float
    target_audience: str
    key_benefit: str
    platform: str = "google_ads"
    learning_mode: bool = True


class WorkflowNode(BaseModel):
    id: str
    type: str
    label: str
    position: Dict[str, float]
    data: Dict[str, Any] = {}


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str


class WorkflowExecuteRequest(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    campaign: CampaignInput
