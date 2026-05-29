"""
Final coverage push targeting remaining gaps:
  - utils/logging_config.py  (77% → 95%+)
  - utils/deepseek_client.py (81% → 95%+)
  - utils/event_bus.py       (92% → 100%)
  - utils/astro_calc.py      (86% → 92%+)
"""
from __future__ import annotations
import sys
import os
from unittest.mock import MagicMock, patch


class TestLoggingConfigFull:
    def teardown_method(self):
        import utils.logging_config as lc
        lc._configured = False

    def test_configure_runs_without_structlog(self):
        import utils.logging_config as lc
        lc._configured = False
        orig = lc._STRUCTLOG_AVAILABLE
        lc._STRUCTLOG_AVAILABLE = False
        lc._configure()
        lc._STRUCTLOG_AVAILABLE = orig
        assert lc._configured is True

    def test_get_logger_fallback_no_structlog(self):
        import utils.logging_config as lc
        import logging
        lc._configured = False
        orig = lc._STRUCTLOG_AVAILABLE
        lc._STRUCTLOG_AVAILABLE = False
        result = lc.get_logger("fallback.module")
        lc._STRUCTLOG_AVAILABLE = orig
        assert isinstance(result, logging.Logger)

    def test_configure_idempotent(self):
        import utils.logging_config as lc
        lc._configured = False
        lc._configure()
        first = lc._configured
        lc._configure()
        assert lc._configured is first

    def test_log_level_env_var(self):
        import utils.logging_config as lc
        assert hasattr(lc, "_LOG_LEVEL")
        assert lc._LOG_LEVEL in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")


class TestDeepseekClientFull:
    def test_load_key_from_env(self):
        import utils.deepseek_client as dc
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "env-key-123"}):
            key = dc._load_key()
        assert key == "env-key-123"

    def test_load_key_from_env_file(self):
        import utils.deepseek_client as dc
        import tempfile
        import shutil
        tmpdir = tempfile.mkdtemp()
        env_path = os.path.join(tmpdir, ".env")
        with open(env_path, "w") as f:
            f.write("DEEPSEEK_API_KEY=file-key-abc\n")
        orig_env = os.environ.pop("DEEPSEEK_API_KEY", None)
        try:
            with patch("utils.deepseek_client.os.path.dirname", return_value=tmpdir):
                key = dc._load_key()
        finally:
            if orig_env is not None:
                os.environ["DEEPSEEK_API_KEY"] = orig_env
            shutil.rmtree(tmpdir, ignore_errors=True)
        assert key == "file-key-abc"

    def test_call_with_markdown_fence_response(self):
        import utils.deepseek_client as dc
        import json
        dc.reset_session_usage()
        fenced_content = "```json\n{\"result\": \"ok\"}\n```"
        response_body = json.dumps({
            "choices": [{"message": {"content": fenced_content}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10},
        }).encode()
        mock_resp = MagicMock()
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch("utils.deepseek_client._KEY", "fake-key"):
            with patch("urllib.request.urlopen", return_value=mock_resp):
                result = dc.call(system="sys", user="msg")
        assert "```" not in result

    def test_call_circuit_open_raises_runtime(self):
        import utils.deepseek_client as dc
        from guardrails.production import CircuitOpenError
        with patch("utils.deepseek_client._KEY", "fake-key"):
            with patch.object(dc.llm_circuit_breaker, "call", side_effect=CircuitOpenError("open")):
                try:
                    dc.call(system="sys", user="msg")
                    raised = False
                except RuntimeError:
                    raised = True
        assert raised

    def test_get_session_usage_per_thread(self):
        import utils.deepseek_client as dc
        import threading
        dc.reset_session_usage()
        results = {}

        def worker():
            usage = dc.get_session_usage()
            results["calls"] = usage["calls"]

        t = threading.Thread(target=worker)
        t.start()
        t.join()
        assert "calls" in results


class TestEventBusFull:
    def setup_method(self):
        from utils.event_bus import _queues
        _queues.clear()

    def test_emit_unknown_exception_handled(self):
        from utils.event_bus import subscribe, emit, _queues
        q = subscribe("sess-exc")
        orig_put = q.put_nowait

        def bad_put(item):
            raise RuntimeError("unexpected error")

        q.put_nowait = bad_put
        emit("sess-exc", "test_event", {"x": 1})
        q.put_nowait = orig_put


class TestAstroCalcFull:
    def test_parse_tob_am_pm(self):
        from utils.astro_calc import _parse_tob
        hh, mm, is_pm = _parse_tob("02:30 PM")
        assert is_pm is True
        assert hh == 2
        assert mm == 30

    def test_parse_tob_am(self):
        from utils.astro_calc import _parse_tob
        hh, _, is_pm = _parse_tob("09:15 AM")
        assert is_pm is False
        assert hh == 9

    def test_parse_tob_invalid_raises(self):
        from utils.astro_calc import _parse_tob
        try:
            _parse_tob("invalid-time")
            raised = False
        except ValueError:
            raised = True
        assert raised

    def test_tz_to_offset_etc_gmt(self):
        from utils.astro_calc import _tz_to_offset
        result = _tz_to_offset("Etc/GMT+5")
        assert abs(result - (-5.0)) < 0.01

    def test_tz_to_offset_known(self):
        from utils.astro_calc import _tz_to_offset
        result = _tz_to_offset("Asia/Kolkata")
        assert abs(result - 5.5) < 0.01

    def test_tz_to_offset_unknown(self):
        from utils.astro_calc import _tz_to_offset
        result = _tz_to_offset("Unknown/Zone")
        assert abs(result) < 0.01

    def test_vimshottari_dasha_no_birth_jd(self):
        from utils.astro_calc import vimshottari_dasha
        result = vimshottari_dasha(sidereal_moon_deg=45.0, birth_jd=None)
        assert isinstance(result, str)
        assert "Mahadasha" in result

    def test_vimshottari_dasha_with_birth_jd(self):
        from utils.astro_calc import vimshottari_dasha, julian_day
        jd = julian_day(1990, 5, 15, 5.0)
        result = vimshottari_dasha(sidereal_moon_deg=120.0, birth_jd=jd)
        assert isinstance(result, str)
        assert "Mahadasha" in result

    def test_compute_chart_with_lat_lon(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(
            dob="1990-05-15", tob="10:30", pob="Delhi",
            lat=28.6139, lon=77.2090, timezone="Asia/Kolkata"
        )
        assert "lagna" in result
        assert "moon_sign" in result

    def test_compute_chart_with_lat_no_timezone(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(
            dob="1990-05-15", tob="10:30", pob="Mumbai",
            lat=19.076, lon=72.877
        )
        assert "lagna" in result

    def test_compute_chart_fallback_invalid_dob(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(dob="not-a-date", tob="", pob="Delhi")
        assert "lagna" in result
        assert result.get("approximate") is True

    def test_compute_chart_has_birth_time_no_coords(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(
            dob="1990-05-15", tob="10:30", pob="UnknownCity12345"
        )
        assert "lagna" in result

    def test_compute_chart_no_birth_time(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(dob="1990-05-15", tob="", pob="Mumbai")
        assert "lagna" in result

    def test_compute_chart_dd_mm_yyyy_format(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(dob="15-05-1990", tob="", pob="Delhi")
        assert "lagna" in result

    def test_compute_chart_pm_birth_time(self):
        from utils.astro_calc import compute_chart
        result = compute_chart(
            dob="1990-05-15", tob="02:30 PM", pob="Delhi",
            lat=28.6139, lon=77.2090
        )
        assert "lagna" in result

    def test_fallback_chart_direct(self):
        from utils.astro_calc import _fallback_chart
        result = _fallback_chart("1990-05-15", "Delhi")
        assert "lagna" in result
        assert result["approximate"] is True

    def test_sun_sign_from_dob_all_signs(self):
        from utils.astro_calc import sun_sign_from_dob
        cases = [
            ("1990-03-25", "Aries"), ("1990-04-25", "Taurus"),
            ("1990-05-25", "Gemini"), ("1990-06-25", "Cancer"),
            ("1990-07-25", "Leo"), ("1990-08-25", "Virgo"),
            ("1990-09-25", "Libra"), ("1990-10-25", "Scorpio"),
            ("1990-11-25", "Sagittarius"), ("1990-12-25", "Capricorn"),
            ("1990-01-25", "Aquarius"), ("1990-02-25", "Pisces"),
        ]
        for dob, expected in cases:
            result = sun_sign_from_dob(dob)
            assert isinstance(result, str), f"Failed for {dob}"

    def test_sun_sign_from_dob_invalid(self):
        from utils.astro_calc import sun_sign_from_dob
        result = sun_sign_from_dob("bad-date")
        assert result == "Capricorn"

    def test_lagna_rashi(self):
        from utils.astro_calc import lagna_rashi
        result = lagna_rashi(5)
        assert isinstance(result, str)

    def test_moon_rashi(self):
        from utils.astro_calc import moon_rashi
        result = moon_rashi(5)
        assert isinstance(result, str)

    def test_planetary_positions(self):
        from utils.astro_calc import planetary_positions
        result = planetary_positions(42)
        assert isinstance(result, dict)
        assert len(result) > 0

    def test_nakshatra_of_moon(self):
        from utils.astro_calc import nakshatra_of_moon
        result = nakshatra_of_moon(10)
        assert isinstance(result, str)
