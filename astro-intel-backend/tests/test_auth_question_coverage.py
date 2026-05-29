"""
Coverage boost for:
  - agents/question_agent.py  (76% → 90%+)
  - auth/users.py             (86% → 95%+)
  - auth/store.py             (83% → 95%+)
"""
from __future__ import annotations
import os
import pytest
from unittest.mock import MagicMock, patch


class TestQuestionAgentFull:
    def test_classify_empty_question(self):
        from agents.question_agent import _classify
        result = _classify("")
        assert result["intent"] == "general"
        assert result["confidence"] == "low"

    def test_classify_none_question(self):
        from agents.question_agent import _classify
        result = _classify(None)
        assert result["intent"] == "general"

    def test_classify_phrase_priority_marriage(self):
        from agents.question_agent import _classify
        result = _classify("when will I find my soulmate")
        assert result["intent"] == "marriage"
        assert result["confidence"] == "high"

    def test_classify_no_keywords_returns_general(self):
        from agents.question_agent import _classify
        result = _classify("xyzzy blorp fnord")
        assert result["intent"] == "general"
        assert result["confidence"] == "low"

    def test_classify_high_score_keywords(self):
        from agents.question_agent import _classify
        result = _classify("career job promotion salary work profession")
        assert result["intent"] == "career"
        assert result["confidence"] == "high"

    def test_split_multi_question_single(self):
        from agents.question_agent import _split_multi_question
        result = _split_multi_question("Will I get a job?")
        assert len(result) == 1
        assert result[0] == "Will I get a job?"

    def test_split_multi_question_empty(self):
        from agents.question_agent import _split_multi_question
        result = _split_multi_question("")
        assert result == []

    def test_split_multi_question_multiple(self):
        from agents.question_agent import _split_multi_question
        result = _split_multi_question("Will I get a job? When will I marry?")
        assert len(result) >= 1

    def test_normalize_questions_no_single_no_raw(self):
        from agents.question_agent import normalize_questions
        result = normalize_questions([], "")
        assert len(result) >= 1
        assert result[0]["question"] == "Please give me a general life overview."

    def test_normalize_questions_with_raw(self):
        from agents.question_agent import normalize_questions
        result = normalize_questions(["Will I get promoted?", "When will I marry?"], "")
        assert len(result) >= 1

    def test_normalize_questions_import_fallback(self):
        from agents.question_agent import normalize_questions
        with patch.dict("sys.modules", {"rag.multi_query": None}):
            result = normalize_questions([], "What about my career?")
        assert len(result) >= 1

    def test_question_agent_node_basic(self):
        from agents.question_agent import question_agent_node
        state = {"questions": [], "user_question": "What is my career path?"}
        result = question_agent_node(state)
        assert "normalized_questions" in result
        assert "focus_context" in result
        assert len(result["normalized_questions"]) >= 1

    def test_question_agent_node_multi_question(self):
        from agents.question_agent import question_agent_node
        state = {
            "questions": ["Will I get married?", "Will I be rich?"],
            "user_question": "What about my career?",
        }
        result = question_agent_node(state)
        assert len(result["normalized_questions"]) >= 1

    def test_normalize_deduplicates_questions(self):
        from agents.question_agent import normalize_questions
        result = normalize_questions(["Will I succeed?"], "Will I succeed?")
        assert len(result) == 1


class TestAuthUsersFull:
    def test_create_user_invalid_email_raises(self):
        from auth.users import create_user
        with pytest.raises(ValueError, match="valid email"):
            create_user("not-an-email", "Test User", os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"))

    def test_create_user_empty_name_raises(self):
        from auth.users import create_user
        with pytest.raises(ValueError, match="Name is required"):
            create_user("test@example.com", "   ", os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"))

    def test_create_user_short_password_raises(self):
        from auth.users import create_user
        with pytest.raises(ValueError, match="8 characters"):
            create_user("test@example.com", "Test User", "short")

    def test_create_admin_user(self):
        from auth.users import create_admin_user, User
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MagicMock()
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            with patch("auth.users.get_by_email", return_value=None):
                result = create_admin_user(
                    email="admin@test.com",
                    name="Admin User",
                    password=os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"),
                    tenant_id="t1",
                )
        assert isinstance(result, User)
        assert result.role == "admin"

    def test_create_user_auto_creates_tenant(self):
        import auth.store as auth_store
        from auth.users import create_user, User
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MagicMock()
        mock_tenant = MagicMock()
        mock_tenant.tenant_id = "auto-tenant-id"
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            with patch("auth.users.get_by_email", return_value=None):
                with patch.object(auth_store, "create_tenant", return_value=mock_tenant):
                    result = create_user(
                        email="new@auto.com",
                        name="Auto Tenant User",
                        password=os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"),
                        tenant_id="",
                    )
        assert isinstance(result, User)

    def test_delete_user_not_found_returns_false(self):
        from auth.users import delete_user
        with patch("auth.users.get_by_email", return_value=None):
            result = delete_user("nobody@nowhere.com")
        assert result is False

    def test_delete_user_superadmin_raises(self):
        from auth.users import delete_user, User
        from auth.models import Role
        superadmin_user = User(
            user_id="su1", email="super@admin.com", name="SA",
            role=Role.SUPERADMIN.value, pw_hash="h"
        )
        with patch("auth.users.get_by_email", return_value=superadmin_user):
            with pytest.raises(ValueError, match="Cannot delete SUPERADMIN"):
                delete_user("super@admin.com")

    def test_clear_for_tests_executes(self):
        from auth.users import clear_for_tests
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MagicMock()
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            clear_for_tests()
        mock_conn.execute.assert_called()

    def test_create_user_with_phone(self):
        from auth.users import create_user, User
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MagicMock()
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            with patch("auth.users.get_by_email", return_value=None):
                result = create_user(
                    email="phone@test.com",
                    name="Phone User",
                    password=os.environ.get("TEST_USER_PW", "T3st-Pw-!xYz"),
                    role="user",
                    tenant_id="t1",
                    phone="9876543210",
                )
        assert isinstance(result, User)
        assert result.phone == "+919876543210"


class TestAuthStoreFull:
    def test_set_tenant_active_true(self):
        from auth.store import set_tenant_active
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.store._db.get_conn", return_value=mock_conn):
            result = set_tenant_active("tenant-1", True)
        assert result is True

    def test_set_tenant_active_not_found(self):
        from auth.store import set_tenant_active
        mock_cur = MagicMock()
        mock_cur.rowcount = 0
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.store._db.get_conn", return_value=mock_conn):
            result = set_tenant_active("missing-tenant", False)
        assert result is False

    def test_delete_tenant_success(self):
        from auth.store import delete_tenant
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.store._db.get_conn", return_value=mock_conn):
            result = delete_tenant("tenant-to-delete")
        assert result is True

    def test_delete_tenant_not_found(self):
        from auth.store import delete_tenant
        mock_cur = MagicMock()
        mock_cur.rowcount = 0
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.store._db.get_conn", return_value=mock_conn):
            result = delete_tenant("no-such-tenant")
        assert result is False

    def test_list_all_keys_returns_list(self):
        from auth.store import list_all_keys
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []
        with patch("auth.store._db.get_conn", return_value=mock_conn):
            result = list_all_keys()
        assert isinstance(result, list)

    def test_clear_for_tests_deletes_all(self):
        from auth.store import clear_for_tests
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MagicMock()
        with patch("auth.store._db.get_conn", return_value=mock_conn):
            clear_for_tests()
        assert mock_conn.execute.call_count >= 2
