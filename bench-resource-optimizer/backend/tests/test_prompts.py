"""Tests for prompts/loader.py."""
import pytest
from pathlib import Path
from unittest.mock import patch
from prompts.loader import load_system_prompt


@pytest.fixture(autouse=True)
def clear_cache():
    load_system_prompt.cache_clear()
    yield
    load_system_prompt.cache_clear()


def test_load_explicit_version(tmp_path):
    v1 = tmp_path / "v1"
    v1.mkdir()
    (v1 / "cv_parser.txt").write_text("  system prompt v1  ")
    with patch("prompts.loader._PROMPTS_DIR", tmp_path):
        result = load_system_prompt("cv_parser", "v1")
    assert result == "system prompt v1"


def test_load_uses_active_versions_when_no_version(tmp_path):
    v2 = tmp_path / "v2"
    v2.mkdir()
    (v2 / "role_mapper.txt").write_text("v2 prompt")
    import utils.prompts as up
    original = up.ACTIVE_VERSIONS.copy()
    up.ACTIVE_VERSIONS["role_mapper"] = "v2"
    try:
        with patch("prompts.loader._PROMPTS_DIR", tmp_path):
            result = load_system_prompt("role_mapper")
    finally:
        up.ACTIVE_VERSIONS.clear()
        up.ACTIVE_VERSIONS.update(original)
    assert result == "v2 prompt"


def test_fallback_to_v1_when_v2_missing(tmp_path):
    v1 = tmp_path / "v1"
    v1.mkdir()
    (v1 / "planner.txt").write_text("v1 fallback")
    # v2 dir does not exist
    with patch("prompts.loader._PROMPTS_DIR", tmp_path):
        result = load_system_prompt("planner", "v2")
    assert result == "v1 fallback"


def test_raises_file_not_found_when_both_missing(tmp_path):
    v1 = tmp_path / "v1"
    v1.mkdir()
    with patch("prompts.loader._PROMPTS_DIR", tmp_path):
        with pytest.raises(FileNotFoundError, match="Prompt file not found"):
            load_system_prompt("ghost_agent", "v1")


def test_defaults_to_v1_when_agent_not_in_active_versions(tmp_path):
    v1 = tmp_path / "v1"
    v1.mkdir()
    (v1 / "unknown_agent.txt").write_text("default v1")
    import utils.prompts as up
    original = up.ACTIVE_VERSIONS.copy()
    up.ACTIVE_VERSIONS.clear()
    try:
        with patch("prompts.loader._PROMPTS_DIR", tmp_path):
            result = load_system_prompt("unknown_agent")
    finally:
        up.ACTIVE_VERSIONS.update(original)
    assert result == "default v1"
