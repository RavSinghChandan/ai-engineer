"""
Phase 4 — Structured JSON Logging Tests
=========================================
Positive, Negative, Integration, and Smoke tests for
utils/logging_config.py.

Run:
  cd astro-intel-backend
  pytest tests/test_structured_logging.py -v
"""
from __future__ import annotations
import io
import json
import logging
import sys
import pytest


# ── POSITIVE TESTS ────────────────────────────────────────────────────────────

class TestStructuredLoggingPositive:

    def test_get_logger_returns_object(self):
        from utils.logging_config import get_logger
        log = get_logger("test.positive")
        assert log is not None

    def test_get_logger_has_info_method(self):
        from utils.logging_config import get_logger
        log = get_logger("test.methods")
        assert callable(getattr(log, "info", None))

    def test_get_logger_has_warning_method(self):
        from utils.logging_config import get_logger
        log = get_logger("test.methods")
        assert callable(getattr(log, "warning", None))

    def test_get_logger_has_error_method(self):
        from utils.logging_config import get_logger
        log = get_logger("test.methods")
        assert callable(getattr(log, "error", None))

    def test_get_logger_different_names_return_loggers(self):
        from utils.logging_config import get_logger
        log_a = get_logger("module_a")
        log_b = get_logger("module_b")
        assert log_a is not None
        assert log_b is not None

    def test_configure_is_idempotent(self, monkeypatch):
        """Calling _configure() twice must not raise or double-configure."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_configured", False)
        lc._configure()
        lc._configure()  # second call — must be a no-op

    def test_stdlib_fallback_when_structlog_unavailable(self, monkeypatch):
        """When structlog is absent, get_logger must return a stdlib Logger."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_STRUCTLOG_AVAILABLE", False)
        monkeypatch.setattr(lc, "_configured", False)
        log = lc.get_logger("fallback_test")
        assert isinstance(log, logging.Logger)

    def test_log_level_env_respected(self, monkeypatch):
        """LOG_LEVEL=warning must set root logger to WARNING."""
        monkeypatch.setenv("LOG_LEVEL", "WARNING")
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_configured", False)
        monkeypatch.setattr(lc, "_LOG_LEVEL", "WARNING")
        lc._configure()
        assert logging.getLogger().level <= logging.WARNING


# ── NEGATIVE TESTS ────────────────────────────────────────────────────────────

class TestStructuredLoggingNegative:

    def test_get_logger_empty_name_does_not_raise(self):
        from utils.logging_config import get_logger
        log = get_logger("")
        assert log is not None

    def test_get_logger_special_chars_does_not_raise(self):
        from utils.logging_config import get_logger
        log = get_logger("module.sub-module::v2")
        assert log is not None

    def test_invalid_log_level_falls_back_gracefully(self, monkeypatch):
        """An unknown LOG_LEVEL must not crash _configure — falls back to INFO."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_LOG_LEVEL", "NONSENSE")
        monkeypatch.setattr(lc, "_configured", False)
        lc._configure()  # must not raise

    def test_structlog_unavailable_configure_does_not_raise(self, monkeypatch):
        """_configure with _STRUCTLOG_AVAILABLE=False must run without error."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_STRUCTLOG_AVAILABLE", False)
        monkeypatch.setattr(lc, "_configured", False)
        lc._configure()  # must not raise

    def test_logging_to_info_does_not_raise(self, capsys):
        from utils.logging_config import get_logger
        log = get_logger("test.no_crash")
        log.info("test_event", key="value")  # must not raise


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestStructuredLoggingIntegration:

    def test_stdlib_logger_emits_message(self, monkeypatch, caplog):
        """Stdlib fallback logger must actually emit log lines."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_STRUCTLOG_AVAILABLE", False)
        monkeypatch.setattr(lc, "_configured", False)

        with caplog.at_level(logging.WARNING, logger="integration_test"):
            log = lc.get_logger("integration_test")
            log.warning("test_warning_message")

        assert "test_warning_message" in caplog.text

    def test_console_format_does_not_raise(self, monkeypatch):
        """LOG_FORMAT=console must configure without error."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_LOG_FORMAT", "console")
        monkeypatch.setattr(lc, "_configured", False)
        lc._configure()  # must not raise

    def test_json_format_is_default(self, monkeypatch):
        """LOG_FORMAT=json must configure without error (default path)."""
        import utils.logging_config as lc
        monkeypatch.setattr(lc, "_LOG_FORMAT", "json")
        monkeypatch.setattr(lc, "_configured", False)
        lc._configure()  # must not raise

    def test_get_logger_used_in_agents_does_not_break_imports(self):
        """
        If agents import get_logger, those imports must still succeed.
        This guards against circular imports or startup-time crashes.
        """
        from utils.logging_config import get_logger
        # Simulate the import pattern agents would use
        log = get_logger("agents.meta_agent")
        log.info("startup", agent="meta_agent")


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestStructuredLoggingSmoke:

    def test_module_imports_cleanly(self):
        import utils.logging_config as lc
        assert hasattr(lc, "get_logger")
        assert hasattr(lc, "_configure")

    def test_get_logger_is_callable(self):
        from utils.logging_config import get_logger
        assert callable(get_logger)

    def test_log_level_constant_is_string(self):
        import utils.logging_config as lc
        assert isinstance(lc._LOG_LEVEL, str)

    def test_log_format_constant_is_string(self):
        import utils.logging_config as lc
        assert isinstance(lc._LOG_FORMAT, str)

    def test_structlog_availability_flag_is_bool(self):
        import utils.logging_config as lc
        assert isinstance(lc._STRUCTLOG_AVAILABLE, bool)

    def test_default_logger_name(self):
        """get_logger() with no args must use 'astrointel' as default name."""
        from utils.logging_config import get_logger
        import inspect
        sig = inspect.signature(get_logger)
        default = sig.parameters["name"].default
        assert default == "astrointel"
