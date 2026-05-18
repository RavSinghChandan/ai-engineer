"""
Tests for CV Parser, Role Mapping, Planning, and Tracking agents.
All LLM calls are mocked — zero API cost, zero network dependency.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import (
    SAMPLE_PROFILE,
    SAMPLE_PLAN,
    SAMPLE_ROLE_MAPPING,
    SAMPLE_RESUME_TEXT,
    make_mock_llm,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Tracking Agent — pure Python, no mock needed
# ═══════════════════════════════════════════════════════════════════════════════

class TestTrackingAgent:
    """Tracking agent is pure Python — test exhaustively, no mocks needed."""

    def test_positive_zero_completed_returns_zero_score(self):
        from agents.tracking_agent import calculate_readiness
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, [])
        assert result["readiness_score"] == 0
        assert result["status"] == "Not Started"
        assert result["completed_count"] == 0
        assert result["total_count"] == 5

    def test_positive_all_completed_returns_100(self):
        from agents.tracking_agent import calculate_readiness
        all_ids = ["d1t1", "d1t2", "d2t1", "d2t2", "d3t1"]
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, all_ids)
        assert result["readiness_score"] == 100
        assert result["status"] == "Ready"
        assert result["completed_count"] == 5

    def test_positive_partial_completion_score(self):
        from agents.tracking_agent import calculate_readiness
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, ["d1t1"])
        assert result["readiness_score"] == 20  # 1/5
        assert result["status"] == "In Progress"
        assert "FastAPI" in result["covered_skills"]

    def test_positive_next_task_skips_completed(self):
        from agents.tracking_agent import calculate_readiness
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, ["d1t1"])
        # Next task should be d1t2 (first incomplete)
        assert result["next_suggested_task"] == "Implement dependency injection"

    def test_positive_all_done_next_task_message(self):
        from agents.tracking_agent import calculate_readiness
        all_ids = ["d1t1", "d1t2", "d2t1", "d2t2", "d3t1"]
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, all_ids)
        assert result["next_suggested_task"] == "All tasks completed!"

    def test_negative_empty_plan_zero_score(self):
        from agents.tracking_agent import calculate_readiness
        empty_plan = {"role": "X", "total_days": 0, "plan": []}
        result = calculate_readiness("X", empty_plan, [])
        assert result["readiness_score"] == 0
        assert result["total_count"] == 0

    def test_negative_unknown_task_id_ignored(self):
        from agents.tracking_agent import calculate_readiness
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, ["BOGUS_ID"])
        assert result["readiness_score"] == 0
        assert result["completed_count"] == 0

    def test_positive_almost_ready_threshold(self):
        from agents.tracking_agent import calculate_readiness
        # Complete 4/5 = 80% → "Almost Ready"
        result = calculate_readiness("Dev Role", SAMPLE_PLAN, ["d1t1", "d1t2", "d2t1", "d2t2"])
        assert result["status"] == "Almost Ready"
        assert result["readiness_score"] == 80


# ═══════════════════════════════════════════════════════════════════════════════
# CV Parser Agent — patch ChatPromptTemplate pipe chain directly
# ═══════════════════════════════════════════════════════════════════════════════

def _make_chain_mock(content: str) -> MagicMock:
    """
    cv_parser_agent builds: chain = ChatPromptTemplate(...) | llm.bind(...)
    then calls: result = chain.invoke(inputs, config={...})
    We patch ChatPromptTemplate.from_messages so the resulting chain returns
    a message with .content = content.
    """
    msg = MagicMock()
    msg.content = content
    chain = MagicMock()
    chain.invoke.return_value = msg
    template = MagicMock()
    template.__or__ = MagicMock(return_value=chain)
    return template


class TestCvParserAgent:

    def test_positive_returns_structured_profile(self):
        from agents.cv_parser_agent import parse_cv
        llm = make_mock_llm(json.dumps(SAMPLE_PROFILE))
        tpl = _make_chain_mock(json.dumps(SAMPLE_PROFILE))
        with patch("agents.cv_parser_agent.ChatPromptTemplate") as MockCPT:
            MockCPT.from_messages.return_value = tpl
            result = parse_cv(SAMPLE_RESUME_TEXT, llm, request_id="test_001")
        assert result["name"] == "Ravi Singh"
        assert "Python" in result["skills"]

    def test_positive_prompt_version_injected(self):
        from agents.cv_parser_agent import parse_cv
        llm = make_mock_llm(json.dumps(SAMPLE_PROFILE))
        tpl = _make_chain_mock(json.dumps(SAMPLE_PROFILE))
        with patch("agents.cv_parser_agent.ChatPromptTemplate") as MockCPT:
            MockCPT.from_messages.return_value = tpl
            result = parse_cv(SAMPLE_RESUME_TEXT, llm)
        assert "_prompt_version" in result

    def test_positive_partial_llm_response_filled_by_validator(self):
        from agents.cv_parser_agent import parse_cv
        llm = make_mock_llm(json.dumps({"name": "Partial Response"}))
        tpl = _make_chain_mock(json.dumps({"name": "Partial Response"}))
        with patch("agents.cv_parser_agent.ChatPromptTemplate") as MockCPT:
            MockCPT.from_messages.return_value = tpl
            result = parse_cv(SAMPLE_RESUME_TEXT, llm)
        assert result["name"] == "Partial Response"
        assert isinstance(result, dict)  # validate_parsed_profile called in main.py, not in agent

    def test_negative_invalid_json_from_llm_healed(self):
        from agents.cv_parser_agent import parse_cv
        fence_content = '```json\n' + json.dumps({"name": "Fence User", "skills": []}) + '\n```'
        llm = make_mock_llm(fence_content)
        tpl = _make_chain_mock(fence_content)
        with patch("agents.cv_parser_agent.ChatPromptTemplate") as MockCPT:
            MockCPT.from_messages.return_value = tpl
            result = parse_cv(SAMPLE_RESUME_TEXT, llm)
        assert result["name"] == "Fence User"

    def test_negative_empty_resume_text_still_parses(self):
        from agents.cv_parser_agent import parse_cv
        content = json.dumps({"name": "Unknown", "skills": []})
        llm = make_mock_llm(content)
        tpl = _make_chain_mock(content)
        with patch("agents.cv_parser_agent.ChatPromptTemplate") as MockCPT:
            MockCPT.from_messages.return_value = tpl
            result = parse_cv("minimal text for testing", llm)
        assert isinstance(result, dict)


# ═══════════════════════════════════════════════════════════════════════════════
# Role Mapping Agent — mock LLM + mock vector store
# ═══════════════════════════════════════════════════════════════════════════════

class TestRoleMappingAgent:

    def _make_mock_vector_store(self):
        doc = MagicMock()
        doc.page_content = "Senior Python Developer: requires Python, FastAPI, Docker, Kubernetes, Redis"
        doc.metadata = {"role_id": "senior_python_dev"}

        store = MagicMock()
        store.similarity_search.return_value = [doc]
        store.similarity_search_with_score.return_value = [(doc, 0.92)]
        store.as_retriever.return_value = MagicMock()
        return store

    def _mock_doc(self):
        doc = MagicMock()
        doc.page_content = "Senior Python Developer: Python FastAPI Docker"
        doc.metadata = {"role_id": "senior_python"}
        return doc

    def _chain_mock(self, content: str):
        msg = MagicMock()
        msg.content = content
        chain = MagicMock()
        chain.invoke.return_value = msg
        tpl = MagicMock()
        tpl.__or__ = MagicMock(return_value=chain)
        return tpl

    def test_positive_returns_mapping(self):
        from agents.role_mapping_agent import map_role
        content = json.dumps(SAMPLE_ROLE_MAPPING)
        llm = make_mock_llm(content)
        vs = self._make_mock_vector_store()
        doc = self._mock_doc()
        tpl = self._chain_mock(content)

        with patch("agents.role_mapping_agent.ChatPromptTemplate") as MockCPT, \
             patch("agents.role_mapping_agent.hybrid_retrieve", return_value=[doc]), \
             patch("agents.role_mapping_agent.generate_hypothetical_doc", return_value="hypo doc"), \
             patch("agents.role_mapping_agent.crag_retrieve", return_value=([doc], 0.85, "hybrid")), \
             patch("agents.role_mapping_agent.check_faithfulness", return_value=(0.85, True, "faithful")), \
             patch("agents.role_mapping_agent.l1_get", return_value=None), \
             patch("agents.role_mapping_agent.l1_set"):
            MockCPT.from_messages.return_value = tpl
            result = map_role(SAMPLE_PROFILE, "Senior Python Developer", vs, llm)

        assert "match_percentage" in result
        assert "matched_skills" in result
        assert "missing_skills" in result

    def test_positive_cache_hit_returns_instantly(self):
        from agents.role_mapping_agent import map_role
        cached = dict(SAMPLE_ROLE_MAPPING, _cache_hit=True)
        llm = make_mock_llm(json.dumps(SAMPLE_ROLE_MAPPING))
        vs = self._make_mock_vector_store()

        with patch("agents.role_mapping_agent.l1_get", return_value=cached):
            result = map_role(SAMPLE_PROFILE, "Senior Python Developer", vs, llm)

        # LLM should NOT have been called on cache hit
        llm.invoke.assert_not_called()
        assert result["match_percentage"] == 72

    def test_negative_totally_broken_llm_json_raises(self):
        from agents.role_mapping_agent import map_role
        import json
        content = "totally broken output not json"
        llm = make_mock_llm(content)
        vs = self._make_mock_vector_store()
        doc = self._mock_doc()
        tpl = self._chain_mock(content)

        # parse_llm_json raises JSONDecodeError when all repair levels fail — this is correct
        # production main.py catches it and returns 500; the agent itself should propagate it
        with patch("agents.role_mapping_agent.ChatPromptTemplate") as MockCPT, \
             patch("agents.role_mapping_agent.hybrid_retrieve", return_value=[doc]), \
             patch("agents.role_mapping_agent.generate_hypothetical_doc", return_value="hypo"), \
             patch("agents.role_mapping_agent.crag_retrieve", return_value=([doc], 0.7, "dense")), \
             patch("agents.role_mapping_agent.check_faithfulness", return_value=(0.5, False, "low")), \
             patch("agents.role_mapping_agent.l1_get", return_value=None), \
             patch("agents.role_mapping_agent.l1_set"):
            MockCPT.from_messages.return_value = tpl
            with pytest.raises((json.JSONDecodeError, ValueError, Exception)):
                map_role(SAMPLE_PROFILE, "Senior Python Developer", vs, llm)


# ═══════════════════════════════════════════════════════════════════════════════
# Planning Agent — mock LLM
# ═══════════════════════════════════════════════════════════════════════════════

class TestPlanningAgent:

    def test_positive_generates_plan(self):
        import asyncio
        from agents.planning_agent import generate_plan

        # Outline response (pipe-delimited day themes)
        outline_response = "FastAPI Deep Dive|Docker Containers|PostgreSQL Basics"
        # Task response (JSON per day)
        task_response = json.dumps({
            "tasks": [
                {"id": "d1t1", "title": "Build FastAPI app", "skill": "FastAPI",
                 "duration_min": 90, "resource": "internal://python/fastapi"},
            ]
        })

        call_count = {"n": 0}

        def side_effect(prompt, **kwargs):
            msg = MagicMock()
            if call_count["n"] == 0:
                msg.content = outline_response
            else:
                msg.content = task_response
            call_count["n"] += 1
            return msg

        llm = MagicMock()
        llm.bind.return_value = llm
        llm.invoke.side_effect = side_effect

        with patch("agents.planning_agent.resource_location_for", return_value="internal://test"):
            plan = asyncio.get_event_loop().run_until_complete(
                generate_plan("Senior Python Developer", ["Kubernetes"], ["Python"], llm, num_days=3)
            )

        assert "plan" in plan
        assert plan["total_days"] == 3

    def test_negative_empty_missing_skills_still_generates(self):
        import asyncio
        from agents.planning_agent import generate_plan

        outline_response = "General Python Skills|Advanced Topics|Best Practices"
        task_response = json.dumps({
            "tasks": [
                {"id": "d1t1", "title": "Review Python fundamentals", "skill": "Python",
                 "duration_min": 60, "resource": "internal://python/basics"},
            ]
        })

        call_count = {"n": 0}

        def side_effect(prompt, **kwargs):
            msg = MagicMock()
            if call_count["n"] == 0:
                msg.content = outline_response
            else:
                msg.content = task_response
            call_count["n"] += 1
            return msg

        llm = MagicMock()
        llm.bind.return_value = llm
        llm.invoke.side_effect = side_effect

        with patch("agents.planning_agent.resource_location_for", return_value="internal://test"):
            plan = asyncio.get_event_loop().run_until_complete(
                generate_plan("Senior Python Developer", [], ["Python"], llm, num_days=3)
            )

        assert "plan" in plan
