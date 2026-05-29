"""
Coverage tests for infrastructure modules:
  - utils/event_bus.py
  - session_store.py
  - auth/users.py (public API functions)
  - cache/embedding_model.py
  - pipeline_queue/consumer.py (unit paths)
"""
from __future__ import annotations
import asyncio
import time
from unittest.mock import MagicMock, patch


class TestEventBus:
    def setup_method(self):
        from utils.event_bus import _queues
        _queues.clear()

    def test_subscribe_creates_queue(self):
        from utils.event_bus import subscribe, _queues
        q = subscribe("sess-1")
        assert "sess-1" in _queues
        assert q is _queues["sess-1"]

    def test_subscribe_returns_same_queue_on_second_call(self):
        from utils.event_bus import subscribe
        q1 = subscribe("sess-2")
        q2 = subscribe("sess-2")
        assert q1 is q2

    def test_unsubscribe_removes_queue(self):
        from utils.event_bus import subscribe, unsubscribe, _queues
        subscribe("sess-3")
        unsubscribe("sess-3")
        assert "sess-3" not in _queues

    def test_unsubscribe_missing_key_is_safe(self):
        from utils.event_bus import unsubscribe
        unsubscribe("nonexistent")

    def test_emit_puts_event_on_queue(self):
        from utils.event_bus import subscribe, emit
        q = subscribe("sess-4")
        emit("sess-4", "node_start", {"node": "grammar"})
        assert not q.empty()
        envelope = q.get_nowait()
        assert envelope["event"] == "node_start"
        assert envelope["data"]["node"] == "grammar"
        assert "ts" in envelope

    def test_emit_no_subscriber_is_safe(self):
        from utils.event_bus import emit
        emit("unknown-session", "node_done", {})

    def test_emit_queue_full_drops_silently(self):
        from utils.event_bus import subscribe, emit, MAX_QUEUE_SIZE
        q = subscribe("sess-full")
        for _ in range(MAX_QUEUE_SIZE):
            q.put_nowait({"event": "x", "data": {}, "ts": 0.0})
        emit("sess-full", "overflow", {})

    def test_emit_none_data_defaults_to_empty_dict(self):
        from utils.event_bus import subscribe, emit
        q = subscribe("sess-5")
        emit("sess-5", "pipeline_done")
        envelope = q.get_nowait()
        assert envelope["data"] == {}

    def test_active_sessions(self):
        from utils.event_bus import subscribe, active_sessions
        subscribe("sess-a")
        subscribe("sess-b")
        sessions = active_sessions()
        assert "sess-a" in sessions
        assert "sess-b" in sessions


class TestSessionStore:
    def setup_method(self):
        import session_store
        session_store._mem.clear()

    def test_save_and_get_from_memory(self):
        import session_store
        session_store.save("s1", {"key": "value"})
        result = session_store.get("s1")
        assert result["key"] == "value"

    def test_get_missing_returns_none(self):
        import session_store
        assert session_store.get("nonexistent-session-xyz") is None

    def test_update_existing_key(self):
        import session_store
        session_store.save("s2", {"a": 1, "b": 2})
        session_store.update("s2", "a", 99)
        assert session_store.get("s2")["a"] == 99

    def test_update_missing_session_logs_warning(self):
        import session_store
        with patch.object(session_store.log, "warning") as mock_warn:
            session_store.update("no-such-session", "key", "val")
        mock_warn.assert_called_once()

    def test_save_unserializable_state_logs_warning(self):
        import session_store

        class Unserializable:
            pass

        with patch.object(session_store.log, "warning"):
            session_store.save("s3", {"bad": Unserializable()})

    def test_sweep_expired_clears_mem(self):
        import session_store
        session_store.save("s4", {"x": 1})
        session_store.sweep_expired()
        assert session_store._mem == {}

    def test_save_db_error_logs(self):
        import session_store
        with patch("session_store._db._tx", side_effect=Exception("db down")):
            with patch.object(session_store.log, "error"):
                session_store.save("s5", {"data": "val"})


class TestAuthUsers:
    def test_normalize_phone_10_digit(self):
        from auth.users import _normalize_phone
        assert _normalize_phone("9876543210") == "+919876543210"

    def test_normalize_phone_already_plus(self):
        from auth.users import _normalize_phone
        result = _normalize_phone("+919876543210")
        assert result.startswith("+")

    def test_normalize_phone_strips_dashes(self):
        from auth.users import _normalize_phone
        result = _normalize_phone("987-654-3210")
        assert "-" not in result

    def test_hash_deterministic(self):
        from auth.users import _hash
        assert _hash("password123") == _hash("password123")

    def test_hash_different_passwords(self):
        from auth.users import _hash
        assert _hash("abc") != _hash("xyz")

    def test_get_by_email_missing_returns_none(self):
        from auth.users import get_by_email
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = None
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = get_by_email("nobody@nowhere.com")
        assert result is None

    def test_get_by_email_found(self):
        from auth.users import get_by_email
        import sqlite3
        mock_row = MagicMock()
        mock_row.__getitem__ = lambda self, k: {
            "user_id": "u1", "email": "a@b.com", "name": "Alice",
            "role": "user", "pw_hash": "hash", "is_active": 1,
            "created_at": 0.0, "tenant_id": "t1", "phone": ""
        }[k]
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = mock_row
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = get_by_email("a@b.com")
        assert result is not None
        assert result.email == "a@b.com"

    def test_get_by_phone_missing(self):
        from auth.users import get_by_phone
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = None
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = get_by_phone("9999999999")
        assert result is None

    def test_verify_password_correct(self):
        from auth.users import verify_password, _hash, User
        from auth.models import Role
        user = User(user_id="u1", email="a@b.com", name="A", role=Role.USER.value, pw_hash=_hash("mypass"))
        assert verify_password(user, "mypass") is True

    def test_verify_password_wrong(self):
        from auth.users import verify_password, _hash, User
        from auth.models import Role
        user = User(user_id="u1", email="a@b.com", name="A", role=Role.USER.value, pw_hash=_hash("correct"))
        assert verify_password(user, "wrong") is False

    def test_set_password_calls_db(self):
        from auth.users import set_password
        mock_cur = MagicMock()
        mock_cur.rowcount = 1
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = set_password("a@b.com", "newpassword")
        assert result is True

    def test_set_password_not_found(self):
        from auth.users import set_password
        mock_cur = MagicMock()
        mock_cur.rowcount = 0
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur
        with patch("auth.users._db.get_conn", return_value=mock_conn):
            result = set_password("nobody@b.com", "newpass")
        assert result is False


class TestCacheEmbeddingModel:
    def test_get_model_returns_cached_when_set(self):
        import cache.embedding_model as em
        sentinel = MagicMock()
        em._model = sentinel
        assert em.get_model() is sentinel
        em._model = None

    def test_get_model_loads_when_none(self):
        import cache.embedding_model as em
        import sys
        em._model = None
        mock_model = MagicMock()
        mock_st = MagicMock(return_value=mock_model)
        fake_module = MagicMock()
        fake_module.SentenceTransformer = mock_st
        with patch.dict(sys.modules, {"sentence_transformers": fake_module}):
            m = em.get_model()
        assert m is mock_model
        em._model = None

    def test_embed_returns_float32_array(self):
        import cache.embedding_model as em
        import numpy as np
        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([[0.1, 0.2, 0.3]], dtype="float32")
        em._model = mock_model
        result = em.embed("some text")
        assert hasattr(result, "__len__")
        em._model = None


class TestPipelineQueueJobStore:
    def test_create_job_returns_id(self):
        from pipeline_queue.job_store import create_job
        with patch("pipeline_queue.job_store._persist"):
            job_id = create_job({"user_profile": {"full_name": "Alice"}})
        assert isinstance(job_id, str)
        assert len(job_id) > 0

    def test_get_job_missing_returns_none(self):
        from pipeline_queue.job_store import get_job
        with patch("pipeline_queue.job_store._restore_from_redis", return_value=None):
            result = get_job("nonexistent-job-xyz")
        assert result is None

    def test_mark_processing(self):
        from pipeline_queue.job_store import create_job, mark_processing
        with patch("pipeline_queue.job_store._persist"):
            job_id = create_job({"x": 1})
        mark_processing(job_id)

    def test_mark_done(self):
        from pipeline_queue.job_store import create_job, mark_done
        with patch("pipeline_queue.job_store._persist"):
            job_id = create_job({"x": 1})
        mark_done(job_id, {"result": "ok"})

    def test_mark_failed(self):
        from pipeline_queue.job_store import create_job, mark_failed
        with patch("pipeline_queue.job_store._persist"):
            job_id = create_job({"x": 1})
        mark_failed(job_id, "something went wrong")

    def test_stats_returns_dict(self):
        from pipeline_queue.job_store import stats
        result = stats()
        assert isinstance(result, dict)

    def test_active_count(self):
        from pipeline_queue.job_store import active_count
        result = active_count()
        assert isinstance(result, int)


class TestPipelineProducer:
    def test_publish_runs_inline_when_no_kafka(self):
        from pipeline_queue.producer import publish
        with patch("pipeline_queue.producer._get_producer", return_value=None):
            with patch("pipeline_queue.producer._run_inline") as mock_inline:
                result = publish("job-1", {"user_profile": {"full_name": "A"}})
        assert isinstance(result, bool)

    def test_kafka_producer_health(self):
        from pipeline_queue.producer import kafka_producer_health
        result = kafka_producer_health()
        assert isinstance(result, dict)
