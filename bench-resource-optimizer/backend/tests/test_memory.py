"""
Tests for session memory (episodic + long-term facts).
Module: memory/session_store.py

All in-memory — no DB, no LLM.
"""
from __future__ import annotations

import time


class TestEpisodicMemory:

    def _reset(self):
        import memory.session_store as ms
        ms._episodic.clear()
        ms._user_facts.clear()

    def test_positive_write_and_read_session(self):
        from memory.session_store import write_session_summary, get_recent_sessions
        self._reset()
        write_session_summary("u1", {"role_explored": "Python Dev", "match_percentage": 70})
        sessions = get_recent_sessions("u1")
        assert len(sessions) == 1
        assert sessions[0]["role_explored"] == "Python Dev"

    def test_positive_multiple_sessions_ordered_newest_first(self):
        from memory.session_store import write_session_summary, get_recent_sessions
        self._reset()
        write_session_summary("u2", {"role_explored": "Role A"})
        time.sleep(0.01)
        write_session_summary("u2", {"role_explored": "Role B"})
        sessions = get_recent_sessions("u2")
        assert sessions[0]["role_explored"] == "Role B"

    def test_negative_unknown_user_returns_empty(self):
        from memory.session_store import get_recent_sessions
        sessions = get_recent_sessions("ghost_user_xyz")
        assert sessions == []

    def test_positive_capped_at_10_sessions(self):
        from memory.session_store import write_session_summary, get_recent_sessions
        self._reset()
        for i in range(15):
            write_session_summary("u3", {"role_explored": f"Role {i}"})
        sessions = get_recent_sessions("u3")
        assert len(sessions) <= 10

    def test_positive_n_parameter_limits_result(self):
        from memory.session_store import write_session_summary, get_recent_sessions
        self._reset()
        for i in range(6):
            write_session_summary("u4", {"role_explored": f"Role {i}"})
        sessions = get_recent_sessions("u4", n=3)
        assert len(sessions) == 3


class TestLongTermFacts:

    def _reset(self):
        import memory.session_store as ms
        ms._user_facts.clear()

    def test_positive_update_and_get_facts(self):
        from memory.session_store import update_user_facts, get_user_facts
        self._reset()
        update_user_facts("u5", {"initial_skills": ["Python", "Docker"]})
        facts = get_user_facts("u5")
        assert facts["initial_skills"] == ["Python", "Docker"]

    def test_positive_facts_merge_on_update(self):
        from memory.session_store import update_user_facts, get_user_facts
        self._reset()
        update_user_facts("u6", {"initial_skills": ["Python"]})
        update_user_facts("u6", {"training_role": "Senior Dev"})
        facts = get_user_facts("u6")
        assert "initial_skills" in facts
        assert "training_role" in facts

    def test_negative_unknown_user_returns_empty_dict(self):
        from memory.session_store import get_user_facts
        facts = get_user_facts("no_such_user_abc")
        assert facts == {}


class TestMemoryContext:

    def _reset(self):
        import memory.session_store as ms
        ms._episodic.clear()
        ms._user_facts.clear()

    def test_positive_context_includes_history(self):
        from memory.session_store import write_session_summary, update_user_facts, build_memory_context
        self._reset()
        write_session_summary("u7", {"role_explored": "ML Engineer", "match_percentage": 65})
        update_user_facts("u7", {"initial_skills": ["Python", "scikit-learn"]})
        ctx = build_memory_context("u7")
        assert isinstance(ctx, str)
        assert len(ctx) > 0

    def test_positive_no_history_returns_string(self):
        from memory.session_store import build_memory_context
        ctx = build_memory_context("fresh_user_no_history")
        assert isinstance(ctx, str)

    def test_positive_memory_stats_has_keys(self):
        from memory.session_store import memory_stats
        stats = memory_stats()
        assert "users_with_episodic_memory" in stats
        assert "total_session_records" in stats
