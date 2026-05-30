from typing import Any, List, TypedDict


class RunbookStep(TypedDict, total=False):
    step_number: int
    title: str
    description: str
    commands: List[str]
    expected_output: str
    depends_on: List[int]
    is_optional: bool
    timeout_seconds: int


class ExtractionState(TypedDict, total=False):
    # Input
    filename: str
    raw_text: str
    tables: list

    # Extracted structured data
    title: str
    description: str
    category: str
    severity: str
    tags: List[str]
    steps: List[RunbookStep]
    prerequisites: List[str]
    rollback_steps: List[RunbookStep]
    estimated_duration_minutes: int

    # Pipeline control
    extraction_error: str
    agent_log: List[str]
