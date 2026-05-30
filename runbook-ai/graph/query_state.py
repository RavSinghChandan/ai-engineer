from typing import List, Optional, TypedDict


class QueryState(TypedDict, total=False):
    # Input
    incident_text: str

    # After incident classification
    category: str
    severity: str
    keywords: List[str]
    symptoms: List[str]
    affected_component: str
    search_terms: List[str]

    # After runbook matching
    matched_runbooks: List[dict]
    selected_runbook_id: Optional[int]
    match_confidence: str

    # After response composition
    response: dict

    # Pipeline trace
    agent_log: List[str]
    query_error: str
