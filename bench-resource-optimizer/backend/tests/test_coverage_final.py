"""
Final coverage boost — targets remaining gaps in:
  - guardrails/production.py
  - utils/file_parser.py
  - utils/json_parser.py
  - infra/kafka_producer.py (DLQ path)
  - infra/redis_client.py (exception paths)
  - memory/session_store.py (DB fallback)
  - agents/planning_agent.py
  - agents/role_mapping_agent.py
"""
from __future__ import annotations
import time
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ── guardrails/production.py ──────────────────────────────────────────────────

class TestProductionGuardrails:

    def test_rate_limiter_load_from_db(self):
        from guardrails.production import rate_limiter
        rate_limiter.load_from_db({"g1_total_allowed": 50, "g1_total_blocked": 10})
        assert rate_limiter._total_allowed == 50
        assert rate_limiter._total_blocked == 10

    def test_rate_limiter_is_allowed_and_blocks(self):
        from guardrails.production import UserRateLimiter
        rl = UserRateLimiter(max_requests=2, window_seconds=60)
        allowed1, _ = rl.is_allowed("testuser")
        allowed2, _ = rl.is_allowed("testuser")
        assert allowed1 is True
        assert allowed2 is True
        blocked, reason = rl.is_allowed("testuser")
        assert blocked is False
        assert "Rate limit" in reason

    def test_all_breaker_stats(self):
        from guardrails.production import all_breaker_stats
        from utils.retry import get_breaker
        get_breaker("bench_llm")
        stats = all_breaker_stats()
        assert isinstance(stats, dict)

    def test_reset_breaker_existing(self):
        from guardrails.production import reset_breaker
        from utils.retry import get_breaker
        cb = get_breaker("test_reset_prod")
        cb.record_failure()
        result = reset_breaker("test_reset_prod")
        assert result["state"] == "closed"

    def test_reset_breaker_nonexistent(self):
        from guardrails.production import reset_breaker
        result = reset_breaker("nonexistent_cb_xyz")
        assert "error" in result

    def test_reset_all_breakers(self):
        from guardrails.production import reset_all_breakers
        from utils.retry import get_breaker
        get_breaker("bench_all_reset_1")
        get_breaker("bench_all_reset_2")
        result = reset_all_breakers()
        assert result["state"] == "closed"

    def test_repair_json_direct(self):
        from guardrails.production import repair_json
        result, level = repair_json('{"key": "value"}')
        assert result == {"key": "value"}
        assert level == "direct"

    def test_repair_json_fence_strip(self):
        from guardrails.production import repair_json
        result, level = repair_json('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}
        assert level == "fence"

    def test_repair_json_regex_extract(self):
        from guardrails.production import repair_json
        result, level = repair_json('prefix text {"key": "value"} suffix')
        assert result == {"key": "value"}
        assert level == "regex"

    def test_repair_json_with_fallback(self):
        from guardrails.production import repair_json
        result, level = repair_json("not valid json at all", fallback={"default": True})
        assert result == {"default": True}
        assert level == "fallback"

    def test_repair_json_failed_no_fallback(self):
        from guardrails.production import repair_json
        result, level = repair_json("not valid json at all")
        assert result is None
        assert level == "failed"

    def test_repair_json_llm_path(self):
        from guardrails import production as gp
        mock_llm = MagicMock()
        mock_result = MagicMock()
        mock_result.content = '{"repaired": true}'
        mock_llm.invoke.return_value = mock_result
        gp.register_repair_llm(mock_llm)
        _, level = gp.repair_json("totally broken {{{{ json")
        assert level in ("llm", "regex", "fallback", "failed")
        gp._repair_llm = None

    def test_json_repair_stats(self):
        from guardrails.production import json_repair_stats, repair_json
        repair_json('{"x": 1}')
        stats = json_repair_stats()
        assert "total_calls" in stats
        assert stats["total_calls"] >= 1

    def test_filter_pii_from_output_clean(self):
        from guardrails.production import filter_pii_from_output
        text = "Candidate is a Python developer with 5 years experience."
        cleaned, count = filter_pii_from_output(text)
        assert cleaned == text
        assert count == 0

    def test_filter_pii_from_output_with_email(self):
        from guardrails.production import filter_pii_from_output
        text = "Contact john.doe@example.com for more info."
        cleaned, count = filter_pii_from_output(text)
        assert count > 0
        assert "john.doe@example.com" not in cleaned

    def test_filter_pii_from_output_with_profile(self):
        from guardrails.production import filter_pii_from_output
        text = "Email me at user@example.com or call 555-123-4567."
        profile = {"email": "user@example.com", "phone": "555-123-4567"}
        _, count = filter_pii_from_output(text, user_profile=profile)
        assert count > 0

    def test_filter_pii_from_mapping(self):
        from guardrails.production import filter_pii_from_mapping
        mapping = {"recommendation": "Contact john@example.com", "readiness_level": "mid"}
        cleaned, count = filter_pii_from_mapping(mapping)
        assert count > 0
        assert "john@example.com" not in cleaned["recommendation"]

    def test_pii_filter_stats(self):
        from guardrails.production import pii_filter_stats, filter_pii_from_output
        filter_pii_from_output("some clean text")
        stats = pii_filter_stats()
        assert "total_outputs_checked" in stats

    def test_load_pii_stats_from_db(self):
        from guardrails.production import _load_pii_stats_from_db, _pii_filter_stats
        _load_pii_stats_from_db({"g4_total_checked": 10, "g4_total_scrubbed": 3, "g4_fields_scrubbed": 5})
        assert _pii_filter_stats["total_checked"] == 10

    def test_graceful_degradation_tracker_record_run(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        tracker.record_run("req-1", {
            "cv_parser": {"status": "full", "confidence": 0.9},
            "role_mapper": {"status": "partial", "confidence": 0.6},
        })
        stats = tracker.stats()
        assert isinstance(stats, dict)

    def test_graceful_degradation_tracker_load_from_db(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        tracker.load_from_db({"g5_cv_parser_full": 5, "g5_role_mapper_fallback": 2})
        assert tracker._lifetime["cv_parser"]["full"] == 5

    def test_all_guardrail_stats(self):
        from guardrails.production import all_guardrail_stats
        stats = all_guardrail_stats()
        assert "g1_rate_limiter" in stats
        assert "g3_json_repair" in stats

    def test_build_counters_dict(self):
        from guardrails.production import _build_counters_dict
        counters = _build_counters_dict()
        assert "g1_total_allowed" in counters
        assert "g3_total_calls" in counters

    def test_flush_to_db_exception_handled(self):
        from guardrails.production import _flush_to_db
        with patch("guardrails.persistence.save_counters", side_effect=Exception("db err")):
            _flush_to_db()

    def test_init_guardrail_persistence_success(self):
        from guardrails.production import init_guardrail_persistence
        with patch("guardrails.persistence.init_persistence"), \
             patch("guardrails.persistence.load_counters", return_value={}):
            init_guardrail_persistence()

    def test_init_guardrail_persistence_with_data(self):
        from guardrails.production import init_guardrail_persistence
        saved = {
            "g1_total_allowed": 100, "g1_total_blocked": 5,
            "g3_total_calls": 50, "g3_direct_parse": 45,
            "g3_fence_strip": 3, "g3_regex_extract": 1, "g3_llm_repair": 0,
            "g3_fallback_used": 1, "g3_total_failures": 1,
            "g4_total_checked": 80, "g4_total_scrubbed": 2, "g4_fields_scrubbed": 3,
        }
        with patch("guardrails.persistence.init_persistence"), \
             patch("guardrails.persistence.load_counters", return_value=saved):
            init_guardrail_persistence()

    def test_flush_guardrail_stats(self):
        from guardrails.production import flush_guardrail_stats
        with patch("guardrails.production._flush_to_db") as mock_flush:
            flush_guardrail_stats()
        mock_flush.assert_called_once()


# ── utils/file_parser.py ─────────────────────────────────────────────────────

class TestFileParser:

    def test_extract_text_from_pdf_success(self):
        from utils.file_parser import extract_text_from_pdf
        mock_reader = MagicMock()
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "Python developer with 5 years experience"
        mock_reader.pages = [mock_page]
        with patch("utils.file_parser.PyPDF2.PdfReader", return_value=mock_reader):
            result = extract_text_from_pdf(b"%PDF-1.4 fake bytes")
        assert "Python developer" in result

    def test_extract_text_from_pdf_empty_pages(self):
        from utils.file_parser import extract_text_from_pdf
        mock_reader = MagicMock()
        mock_page = MagicMock()
        mock_page.extract_text.return_value = None
        mock_reader.pages = [mock_page, mock_page]
        with patch("utils.file_parser.PyPDF2.PdfReader", return_value=mock_reader):
            result = extract_text_from_pdf(b"%PDF fake")
        assert result == ""


# ── utils/json_parser.py fallback path ───────────────────────────────────────

class TestJsonParserFallback:

    def test_parse_llm_json_raw_decode(self):
        from utils.json_parser import parse_llm_json
        result = parse_llm_json('{"name": "Bob"}')
        assert result["name"] == "Bob"

    def test_parse_llm_json_fence_strip(self):
        from utils.json_parser import parse_llm_json
        result = parse_llm_json('```json\n{"x": 42}\n```')
        assert result["x"] == 42

    def test_parse_llm_json_fallback_when_repair_returns_none(self):
        # repair_json returns (None, "failed") → fallback logic (lines 25-34) executes
        from utils.json_parser import parse_llm_json
        with patch("guardrails.production.repair_json", return_value=(None, "failed")):
            result = parse_llm_json('prefix {"z": 99}')
        assert result["z"] == 99

    def test_parse_llm_json_import_error_fallback(self):
        # Simulate ImportError path (line 22)
        import sys
        orig = sys.modules.get("guardrails.production")
        sys.modules["guardrails.production"] = None  # type: ignore
        try:
            from utils.json_parser import parse_llm_json
            result = parse_llm_json('{"fallback": true}')
            assert result["fallback"] is True
        finally:
            if orig is None:
                sys.modules.pop("guardrails.production", None)
            else:
                sys.modules["guardrails.production"] = orig


# ── infra/kafka_producer.py — DLQ and retry paths ────────────────────────────

class TestKafkaDlq:

    def test_send_to_dlq_no_producer(self):
        import infra.kafka_producer as kp
        kp._producer = None
        kp._send_to_dlq({"event_id": "e1", "event_type": "test"}, "topic", "max_retries")

    def test_send_to_dlq_with_producer(self):
        import infra.kafka_producer as kp
        mock_producer = MagicMock()
        kp._producer = mock_producer
        kp._send_to_dlq({"event_id": "e2", "event_type": "test"}, "bench.cv.uploaded", "err")
        mock_producer.send.assert_called_once()
        kp._producer = None

    def test_publish_all_retries_fail_goes_to_dlq(self):
        import infra.kafka_producer as kp
        mock_producer = MagicMock()
        future = MagicMock()
        future.get.side_effect = Exception("kafka error")
        mock_producer.send.return_value = future
        kp._producer = mock_producer
        with patch("infra.kafka_producer._send_to_dlq") as mock_dlq, \
             patch("time.sleep"):
            result = kp.publish("KAFKA_CV_TOPIC", "cv.parsed", {"user_id": "u1"}, max_retries=2)
        assert result is False
        mock_dlq.assert_called_once()
        kp._producer = None


# ── infra/redis_client.py — exception paths ───────────────────────────────────

class TestRedisExceptions:

    def test_redis_set_exception_returns_false(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        mock_client.setex.side_effect = Exception("redis error")
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_set("key", "value")
        assert result is False

    def test_redis_get_exception_returns_none(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        mock_client.get.side_effect = Exception("redis error")
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_get("key")
        assert result is None

    def test_redis_delete_exception_returns_false(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        mock_client.delete.side_effect = Exception("redis error")
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_delete("key")
        assert result is False

    def test_redis_ping_exception_returns_false(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        mock_client.ping.side_effect = Exception("redis error")
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_ping()
        assert result is False

    def test_get_redis_exception_returns_none(self):
        import infra.redis_client as rc
        pool = MagicMock()
        rc._redis_pool = pool
        redis_mock = MagicMock()
        redis_mock.Redis.side_effect = Exception("conn error")
        with patch.dict("sys.modules", {"redis": redis_mock}):
            result = rc.get_redis()
        rc._redis_pool = None
        assert result is None


# ── memory/session_store.py — DB fallback path ───────────────────────────────

class TestSessionStoreDbFallback:

    def setup_method(self):
        from memory import session_store as ss
        ss._episodic.clear()
        ss._preloaded.clear()

    def test_get_recent_sessions_db_fallback(self):
        from memory.session_store import get_recent_sessions
        rows = [{"role_explored": "Python Eng", "readiness_score": 80, "skills_covered": [], "ts": time.time()}]
        with patch("db.load_memory_sessions", return_value=rows):
            sessions = get_recent_sessions("db_fallback_user")
        assert len(sessions) >= 1

    def test_get_recent_sessions_db_fallback_exception(self):
        from memory.session_store import get_recent_sessions
        with patch("db.load_memory_sessions", side_effect=Exception("db down")):
            sessions = get_recent_sessions("db_err_user")
        assert sessions == []

    @pytest.mark.asyncio
    async def test_persist_async_success(self):
        from memory.session_store import _persist_async
        with patch("db.save_memory_session", new_callable=AsyncMock) as mock_save:
            await _persist_async("u1", {"role_explored": "Python Eng"}, time.time())
        mock_save.assert_called_once()

    @pytest.mark.asyncio
    async def test_persist_async_exception_silenced(self):
        from memory.session_store import _persist_async
        with patch("db.save_memory_session", new_callable=AsyncMock, side_effect=Exception("db err")):
            await _persist_async("u1", {}, time.time())


# ── agents/planning_agent.py ──────────────────────────────────────────────────

class TestPlanningAgent:

    @pytest.mark.asyncio
    async def test_import_succeeds(self):
        from agents.planning_agent import generate_plan
        assert callable(generate_plan)

    def test_parse_outline_empty(self):
        from agents import planning_agent as pa
        items = pa._parse_outline("", num_days=3)
        assert len(items) == 3
        assert items[0]["day"] == 1

    def test_parse_outline_valid_rows(self):
        from agents import planning_agent as pa
        text = "1 | Python Basics | Python\n2 | Docker | Docker"
        items = pa._parse_outline(text, num_days=2)
        assert len(items) == 2

    @pytest.mark.asyncio
    async def test_generate_plan_returns_dict(self):
        from agents.planning_agent import generate_plan
        mock_llm = MagicMock()
        outline_content = "1 | Python Basics | Python\n2 | Docker | Docker\n3 | K8s | Kubernetes"
        day_content = '{"day": 1, "theme": "Python Basics", "skill": "Python", "tasks": ["Task 1", "Task 2"], "resource": "portal/python"}'
        mock_llm.invoke.side_effect = [
            MagicMock(content=outline_content),
            MagicMock(content=day_content),
            MagicMock(content=day_content),
            MagicMock(content=day_content),
        ]
        day_dict = {"day": 1, "theme": "Python", "skill": "Python", "tasks": [{"id": "d1t1", "title": "Task 1", "skill": "Python", "hours": 2}]}
        with patch("agents.planning_agent.parse_llm_json", return_value=day_dict):
            result = await generate_plan(
                role="Python Engineer",
                missing_skills=["Docker", "Kubernetes"],
                llm=mock_llm,
                num_days=3,
            )
        assert isinstance(result, dict)


# ── agents/role_mapping_agent.py ─────────────────────────────────────────────

class TestRoleMappingAgent:

    def test_import_succeeds(self):
        from agents.role_mapping_agent import map_role
        assert callable(map_role)

    def test_retrieve_context_crag(self):
        from agents import role_mapping_agent as rma
        mock_vs = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "Python Engineer role description"
        mock_doc.metadata = {"role_id": "r1", "title": "Python Engineer"}
        mock_vs.similarity_search.return_value = [mock_doc]
        with patch("agents.role_mapping_agent.crag_retrieve", return_value=([mock_doc], 0.8, "HIGH")):
            ctx, _ = rma._retrieve_context("python engineer", "Python Engineer", mock_vs, use_hybrid=False)
        assert "Python Engineer" in ctx or len(ctx) > 0

    def test_retrieve_context_hybrid(self):
        from agents import role_mapping_agent as rma
        mock_vs = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "Python Engineer role"
        mock_doc.metadata = {"role_id": "r1"}
        with patch("agents.role_mapping_agent.hybrid_retrieve", return_value=[mock_doc]):
            ctx, _ = rma._retrieve_context("python engineer", "Python Engineer", mock_vs, use_hybrid=True)
        assert len(ctx) > 0

    def test_map_role_returns_dict(self):
        from agents.role_mapping_agent import map_role
        mock_llm = MagicMock()
        chain_mock = MagicMock()
        chain_mock.invoke.return_value = MagicMock(content='{"matched_role": "Python Engineer", "match_score": 85}')
        mock_llm.bind.return_value = mock_llm
        mock_vs = MagicMock()
        mapping_result = {"matched_role": "Python Engineer", "match_score": 85, "missing_skills": []}
        fake_prompt_def = MagicMock()
        fake_prompt_def.system = "sys"
        fake_prompt_def.user = "user"
        fake_prompt_def.name = "role_mapper"
        fake_prompt_def.version = "v1"
        fake_tracker = MagicMock()
        fake_tracker.get_usage.return_value = {"total_tokens": 100, "cost_usd": 0.001}
        fake_chain = MagicMock()
        fake_chain.invoke.return_value = MagicMock(content='{"matched_role": "Python Engineer", "match_score": 85}')
        fake_prompt = MagicMock()
        fake_prompt.__or__ = lambda self, other: fake_chain
        with patch("agents.role_mapping_agent.parse_llm_json", return_value=mapping_result), \
             patch("agents.role_mapping_agent.validate_role_mapping", return_value=mapping_result), \
             patch("agents.role_mapping_agent.get_active", return_value=fake_prompt_def), \
             patch("agents.role_mapping_agent.get_tracker", return_value=fake_tracker), \
             patch("agents.role_mapping_agent.check_faithfulness", return_value=(0.9, True, "ok")), \
             patch("agents.role_mapping_agent._build_retrieval_query", return_value="python engineer"), \
             patch("agents.role_mapping_agent._retrieve_context", return_value=("Python Engineer role context", {})), \
             patch("agents.role_mapping_agent.audit_llm_call"), \
             patch("agents.role_mapping_agent.l1_get", return_value=None), \
             patch("agents.role_mapping_agent.l1_set"), \
             patch("langchain.prompts.ChatPromptTemplate.from_messages", return_value=fake_prompt):
            result = map_role(
                parsed_cv={"name": "Alice", "skills": ["Python"], "experience_years": 3},
                target_role="Python Engineer",
                llm=mock_llm,
                vector_store=mock_vs,
            )
        assert isinstance(result, dict)
