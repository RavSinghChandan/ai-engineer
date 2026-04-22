from typing import TypedDict, Optional, List, Dict, Any


class CampaignState(TypedDict):
    # Inputs
    campaign_type: str
    product_name: str
    budget: float
    target_audience: str
    key_benefit: str
    platform: str
    learning_mode: bool

    # Learned improvements from memory
    improvements: Optional[Dict[str, Any]]
    similar_campaigns_found: int
    learning_applied: bool

    # Agent outputs (accumulated as graph runs)
    audience_output: Optional[Dict[str, Any]]
    ad_copy_output: Optional[Dict[str, Any]]
    budget_output: Optional[Dict[str, Any]]
    campaign_output: Optional[Dict[str, Any]]
    performance_output: Optional[Dict[str, Any]]

    # Aggregated
    agent_log: List[Dict[str, Any]]
    all_insights: List[str]

    # Final
    metrics: Optional[Dict[str, Any]]
    improvement_percentage: Optional[float]
    performance_grade: str
    forecast_30_days: Optional[Dict[str, Any]]
    agent_decisions: Optional[Dict[str, Any]]
    learning_summary: Optional[Dict[str, Any]]
