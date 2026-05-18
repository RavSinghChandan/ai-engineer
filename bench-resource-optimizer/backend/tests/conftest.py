"""
Shared fixtures for all bench-resource-optimizer tests.
No LLM API calls are made — all LLM interactions are mocked.
"""
from __future__ import annotations

import json
import sys
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

# ── Path setup ────────────────────────────────────────────────────────────────
# Ensure backend/ is on sys.path so all imports resolve without the package
BACKEND = Path(__file__).parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# ── Reusable test data ────────────────────────────────────────────────────────

SAMPLE_PROFILE = {
    "name": "Ravi Singh",
    "email": "ravi@example.com",
    "phone": "+91-9999999999",
    "skills": ["Python", "FastAPI", "Docker", "PostgreSQL"],
    "experience_years": 5,
    "roles": ["Backend Engineer", "Python Developer"],
    "projects": ["E-commerce Platform", "Payment Gateway"],
    "education": "B.Tech Computer Science",
}

SAMPLE_PLAN = {
    "role": "Senior Python Developer",
    "total_days": 3,
    "plan": [
        {
            "day": 1,
            "theme": "FastAPI Deep Dive",
            "tasks": [
                {"id": "d1t1", "title": "Build REST API with FastAPI", "skill": "FastAPI", "duration_min": 90, "resource": "internal://python/fastapi"},
                {"id": "d1t2", "title": "Implement dependency injection", "skill": "FastAPI", "duration_min": 60, "resource": "internal://python/di"},
            ],
        },
        {
            "day": 2,
            "theme": "Docker & Containers",
            "tasks": [
                {"id": "d2t1", "title": "Dockerfile for Python apps", "skill": "Docker", "duration_min": 60, "resource": "internal://devops/docker"},
                {"id": "d2t2", "title": "docker-compose multi-service setup", "skill": "Docker", "duration_min": 75, "resource": "internal://devops/compose"},
            ],
        },
        {
            "day": 3,
            "theme": "PostgreSQL & SQLAlchemy",
            "tasks": [
                {"id": "d3t1", "title": "Schema design + migrations", "skill": "PostgreSQL", "duration_min": 90, "resource": "internal://db/postgres"},
            ],
        },
    ],
}

SAMPLE_ROLE_MAPPING = {
    "match_percentage": 72,
    "matched_skills": ["Python", "FastAPI", "Docker"],
    "missing_skills": ["Kubernetes", "Redis"],
    "experience_gap": 2,
    "recommendation": "Strong backend candidate. Focus on cloud-native tooling.",
    "readiness_level": "Intermediate",
    "retrieval_method": "hybrid_bm25_faiss_rrf",
}

SAMPLE_RESUME_TEXT = """
Ravi Singh
ravi@example.com | +91-9999999999

EXPERIENCE
Backend Engineer — TechCorp (2019–2024, 5 years)
- Built Python/FastAPI microservices serving 10M requests/day
- Containerised applications with Docker and docker-compose
- Managed PostgreSQL schemas and wrote SQLAlchemy migrations

SKILLS
Python, FastAPI, Docker, PostgreSQL, REST APIs, Git, Linux

EDUCATION
B.Tech Computer Science — IIT Delhi (2019)
"""

# ── Mock LLM factory ──────────────────────────────────────────────────────────

def make_mock_llm(response_content: str = None) -> MagicMock:
    """
    Return a MagicMock that works with LangChain pipe chains.

    Agent code builds: chain = ChatPromptTemplate(...) | llm.bind(max_tokens=N)
    Then calls: result = chain.invoke(inputs, config={...})

    So we need:
      - llm.bind(...) → returns the llm mock itself (so pipe chain works)
      - The resulting chain's .invoke() must return a message with .content

    LangChain's | operator calls __or__ on the prompt template which wraps
    the llm. The final chain.invoke() ends up calling llm.invoke() internally.
    We mock at the llm level: llm.invoke() returns the message.
    """
    if response_content is None:
        response_content = json.dumps(SAMPLE_PROFILE)

    msg = MagicMock()
    msg.content = response_content

    mock = MagicMock()
    # bind() returns self so the | chain stays intact
    mock.bind.return_value = mock
    # invoke() on the final chain-step (the LLM) returns our message
    mock.invoke.return_value = msg
    # __or__ must return something invocable — a simple chain mock
    chain_mock = MagicMock()
    chain_mock.invoke.return_value = msg
    mock.__or__ = MagicMock(return_value=chain_mock)
    return mock
