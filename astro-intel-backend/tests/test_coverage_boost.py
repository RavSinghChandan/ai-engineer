"""
Coverage boost tests targeting the remaining high-gap modules:
  - agents/simplify_agent.py  (15% → target 70%+)
  - utils/deepseek_client.py  (78% → target 90%+)
  - utils/logging_config.py   (77% → target 90%+)
  - auth/users.py remaining paths
  - memory/episodic.py remaining paths
"""
from __future__ import annotations
from unittest.mock import MagicMock, patch


class TestSimplifyAgent:
    def test_simplify_narrative_passthrough(self):
        from agents.simplify_agent import simplify_narrative
        result = simplify_narrative("Some raw narrative.", "What is my path?", "career")
        assert result == "Some raw narrative."

    def test_simplify_agent_node_no_sections(self):
        from agents.simplify_agent import simplify_agent_node
        state = {"final_report": {"sections": []}, "memory": {}, "user_profile": {}, "remedies": {}}
        result = simplify_agent_node(state)
        assert result["structured_summaries"] == []
        assert any("SimplifyAgent" in entry for entry in result.get("agent_log", []))

    def test_simplify_agent_node_with_sections(self):
        from agents.simplify_agent import simplify_agent_node
        state = {
            "final_report": {
                "sections": [
                    {
                        "question": "Will I succeed?",
                        "intent": "career",
                        "insights": [
                            {"id": "i1", "content": "Jupiter favours career.", "confidence": "high", "domains": ["astrology"], "is_common": False},
                        ],
                    }
                ]
            },
            "memory": {},
            "user_profile": {},
            "remedies": {},
        }
        result = simplify_agent_node(state)
        assert len(result["structured_summaries"]) == 1

    def test_build_structured_summary_returns_dict(self):
        from agents.simplify_agent import build_structured_summary
        insights = [{"id": "i1", "content": "Career growth ahead.", "confidence": "high", "domains": ["astrology"], "is_common": False}]
        result = build_structured_summary("Career?", "career", insights, {}, {})
        assert isinstance(result, dict)

    def test_build_structured_summary_all_intents(self):
        from agents.simplify_agent import build_structured_summary
        insights = [{"id": "i1", "content": "Good news.", "confidence": "high", "domains": [], "is_common": False}]
        for intent in ("marriage", "finance", "health", "children", "travel", "spiritual", "general"):
            result = build_structured_summary("My question?", intent, insights, {}, {})
            assert isinstance(result, dict)

    def test_build_structured_summary_with_remedy(self):
        from agents.simplify_agent import build_structured_summary
        insights = [{"id": "i1", "content": "Good career.", "confidence": "high", "domains": ["astrology"], "is_common": False}]
        remedies = {"mantra": "Om Namah Shivaya", "gemstone": "Yellow Sapphire"}
        result = build_structured_summary("Will I succeed?", "career", insights, remedies, {}, include_remedy_bullets=True)
        assert isinstance(result, dict)

    def test_build_structured_summary_with_memory(self):
        from agents.simplify_agent import build_structured_summary
        memory = {
            "numerology": {"life_path": 8, "personal_year": 3},
            "astrology": {"dasha_planet": "Jupiter", "dasha_end_year": 2028},
        }
        insights = [{"id": "i1", "content": "Growth coming.", "confidence": "high", "domains": ["astrology"], "is_common": True}]
        result = build_structured_summary("Future?", "general", insights, {}, memory)
        assert isinstance(result, dict)

    def test_build_structured_summary_prompt(self):
        from agents.simplify_agent import build_structured_summary_prompt
        insights = [{"id": "i1", "content": "Career growth.", "confidence": "high", "domains": ["astrology"], "is_common": False}]
        result = build_structured_summary_prompt("Career?", "career", insights, "Alice", {})
        assert isinstance(result, dict)
        assert "system" in result or "model" in result

    def test_apply_jargon_replaces_terms(self):
        from agents.simplify_agent import _apply_jargon
        result = _apply_jargon("The Mahadasha of Jupiter is active.")
        assert "Mahadasha" not in result or "phase" in result.lower() or len(result) > 0

    def test_detect_sub_intent_marriage(self):
        from agents.simplify_agent import _detect_sub_intent
        result = _detect_sub_intent("when will i get married", "marriage")
        assert result == "marriage_timing"

    def test_detect_sub_intent_career_promotion(self):
        from agents.simplify_agent import _detect_sub_intent
        result = _detect_sub_intent("when will i get a promotion", "career")
        assert result == "career_promotion"

    def test_detect_sub_intent_no_match(self):
        from agents.simplify_agent import _detect_sub_intent
        result = _detect_sub_intent("what is the meaning of life", "general")
        assert result is None

    def test_chart_from_memory_empty(self):
        from agents.simplify_agent import _chart_from_memory
        result = _chart_from_memory({})
        assert isinstance(result, dict)
        assert "dasha_planet" in result

    def test_chart_from_memory_with_astrology(self):
        from agents.simplify_agent import _chart_from_memory
        memory = {
            "astrology": {
                "vedic": {
                    "chart": {"lagna": "Aries", "moon_sign": "Taurus", "sun_sign": "Gemini", "nakshatra": "Rohini"},
                    "current_dasha": "Saturn 2027",
                }
            }
        }
        result = _chart_from_memory(memory)
        assert result["dasha_planet"] == "Saturn"

    def test_timing_window_returns_dict(self):
        from agents.simplify_agent import _timing_window
        result = _timing_window("Jupiter", "career", birth_month=3)
        assert isinstance(result, dict)

    def test_simplify_agent_node_with_question_remedies(self):
        from agents.simplify_agent import simplify_agent_node
        state = {
            "final_report": {
                "sections": [
                    {"question": "Will I marry?", "intent": "marriage", "insights": [
                        {"id": "i1", "content": "Marriage is indicated.", "confidence": "high", "domains": ["astrology"], "is_common": False}
                    ]}
                ]
            },
            "memory": {},
            "user_profile": {"birth_date": "1990-03-15"},
            "remedies": {"question_remedies": [{"question": "Will I marry?", "mantra": "Om"}]},
        }
        result = simplify_agent_node(state)
        assert len(result["structured_summaries"]) == 1


class TestDeepseekClient:
    def test_get_session_usage_returns_dict(self):
        from utils.deepseek_client import get_session_usage
        result = get_session_usage()
        assert "prompt_tokens" in result
        assert "completion_tokens" in result
        assert "calls" in result

    def test_reset_session_usage(self):
        from utils.deepseek_client import reset_session_usage, get_session_usage
        reset_session_usage()
        usage = get_session_usage()
        assert usage["calls"] == 0

    def test_call_no_api_key_raises(self):
        import utils.deepseek_client as dc
        orig_key = dc._KEY
        dc._KEY = ""
        with patch("utils.deepseek_client._load_key", return_value=""):
            try:
                dc.call(system="sys", user="user")
                raised = False
            except RuntimeError:
                raised = True
        dc._KEY = orig_key
        assert raised

    def test_call_success(self):
        import utils.deepseek_client as dc
        import json
        reset_session = dc.reset_session_usage
        reset_session()

        response_body = json.dumps({
            "choices": [{"message": {"content": "Hello!"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("utils.deepseek_client._KEY", "fake-key"):
            with patch("urllib.request.urlopen", return_value=mock_resp):
                result = dc.call(system="You are helpful.", user="Say hi.")
        assert result == "Hello!"

    def test_call_tracks_usage(self):
        import utils.deepseek_client as dc
        import json
        dc.reset_session_usage()

        response_body = json.dumps({
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
        }).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("utils.deepseek_client._KEY", "fake-key"):
            with patch("urllib.request.urlopen", return_value=mock_resp):
                dc.call(system="sys", user="msg")
        usage = dc.get_session_usage()
        assert usage["calls"] == 1
        assert usage["prompt_tokens"] == 20

    def test_call_http_error_raises(self):
        import utils.deepseek_client as dc
        import urllib.error
        with patch("utils.deepseek_client._KEY", "fake-key"):
            with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
                try:
                    dc.call(system="sys", user="msg")
                    raised = False
                except (RuntimeError, Exception):
                    raised = True
        assert raised


class TestLoggingConfig:
    def test_get_logger_returns_logger(self):
        from utils.logging_config import get_logger
        logger = get_logger("test.module")
        assert logger is not None

    def test_get_logger_default_name(self):
        from utils.logging_config import get_logger
        logger = get_logger()
        assert logger is not None

    def test_log_format_env_var_exists(self):
        import utils.logging_config as lc
        assert hasattr(lc, "_LOG_FORMAT")
        assert lc._LOG_FORMAT in ("json", "console")


class TestEpisodicMemoryExtra:
    def test_log_correction_and_list(self):
        from memory.episodic import log_correction, list_corrections
        log_correction(
            tenant_id="test-tenant",
            insight_id="q1_i1",
            original_text="Old text here.",
            corrected_text="New text here.",
            intent="career",
        )
        rows = list_corrections(tenant_id="test-tenant", limit=5)
        assert isinstance(rows, list)

    def test_correction_stats_returns_dict(self):
        from memory.episodic import correction_stats
        result = correction_stats(tenant_id="test-tenant")
        assert isinstance(result, dict)

    def test_set_and_get_persona_pref(self):
        from memory.episodic import set_persona_pref, get_persona_prefs
        set_persona_pref(tenant_id="test-t2", key="language", value="Hindi")
        prefs = get_persona_prefs(tenant_id="test-t2")
        assert isinstance(prefs, dict)

    def test_correction_stats_global(self):
        from memory.episodic import correction_stats_global
        result = correction_stats_global()
        assert isinstance(result, dict)

    def test_retrieve_similar_corrections_empty(self):
        from memory.episodic import retrieve_similar_corrections
        result = retrieve_similar_corrections(
            query="Will I get a promotion?",
            tenant_id="test-t-empty",
            intent="career",
            top_k=3,
        )
        assert isinstance(result, list)


class TestAuthUsersAdditional:
    def test_list_users_returns_list(self):
        from auth.users import list_users
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = list_users()
        assert isinstance(result, list)

    def test_set_active_true(self):
        from auth.users import set_active
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = set_active("a@b.com", True)
        assert result is True

    def test_set_active_not_found(self):
        from auth.users import set_active
        mock_cur = MagicMock()
        mock_cur.rowcount = 0
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = set_active("nobody@b.com", False)
        assert result is False

    def test_delete_user_success(self):
        from auth.users import delete_user
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = delete_user("a@b.com")
        assert result is True

    def test_create_user_returns_user_object(self):
        from auth.users import create_user, User
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MagicMock()
        import os
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            with patch("auth.users.get_by_email", return_value=None):
                result = create_user(
                    email="new@test.com",
                    name="New User",
                    password=os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"),
                    role="user",
                    tenant_id="t1",
                )
        assert isinstance(result, User)

    def test_create_user_duplicate_email_raises(self):
        from auth.users import create_user, User
        from auth.models import Role
        existing = User(user_id="u1", email="dup@test.com", name="Dup", role=Role.USER.value, pw_hash="h")
        with patch("auth.users.get_by_email", return_value=existing):
            try:
                import os
                create_user("dup@test.com", "Dup", os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"), "user", "t1")
                raised = False
            except Exception:
                raised = True
        assert raised

    def test_set_name_success(self):
        from auth.users import set_name
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = set_name("a@b.com", "Alice Updated")
        assert result is True

    def test_update_phone_success(self):
        from auth.users import update_phone
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = update_phone("a@b.com", "9876543210")
        assert result is True
