"""Tests for storage.py — legacy JSON file storage layer."""
import json
import pytest
from pathlib import Path
from unittest.mock import patch, mock_open, MagicMock
import storage
from storage import _read, _write, save_user, get_user, save_progress, get_progress


def test_read_returns_empty_when_file_missing(tmp_path):
    with patch.object(storage, 'DATA_DIR', tmp_path):
        result = _read("nonexistent.json")
    assert result == {}


def test_read_returns_data_when_file_exists(tmp_path):
    f = tmp_path / "users.json"
    f.write_text(json.dumps({"u1": {"name": "Alice"}}))
    with patch.object(storage, 'DATA_DIR', tmp_path):
        result = _read("users.json")
    assert result == {"u1": {"name": "Alice"}}


def test_write_creates_file(tmp_path):
    with patch.object(storage, 'DATA_DIR', tmp_path):
        _write("out.json", {"key": "value"})
    data = json.loads((tmp_path / "out.json").read_text())
    assert data == {"key": "value"}


def test_save_user_returns_id_and_persists(tmp_path):
    with patch.object(storage, 'DATA_DIR', tmp_path):
        uid = save_user({"name": "Bob", "skills": ["Python"]})
    assert isinstance(uid, str)
    assert len(uid) == 8
    data = json.loads((tmp_path / "users.json").read_text())
    assert uid in data
    assert data[uid]["name"] == "Bob"


def test_get_user_returns_none_for_missing(tmp_path):
    with patch.object(storage, 'DATA_DIR', tmp_path):
        result = get_user("nonexistent_id")
    assert result is None


def test_get_user_returns_data(tmp_path):
    f = tmp_path / "users.json"
    f.write_text(json.dumps({"abc12345": {"name": "Carol"}}))
    with patch.object(storage, 'DATA_DIR', tmp_path):
        result = get_user("abc12345")
    assert result == {"name": "Carol"}


def test_save_progress_persists(tmp_path):
    with patch.object(storage, 'DATA_DIR', tmp_path):
        save_progress("u1", {"role": "dev", "tasks": []})
    data = json.loads((tmp_path / "progress.json").read_text())
    assert "u1" in data
    assert data["u1"]["role"] == "dev"


def test_save_progress_updates_existing(tmp_path):
    f = tmp_path / "progress.json"
    f.write_text(json.dumps({"u1": {"role": "old"}}))
    with patch.object(storage, 'DATA_DIR', tmp_path):
        save_progress("u1", {"role": "new"})
    data = json.loads((tmp_path / "progress.json").read_text())
    assert data["u1"]["role"] == "new"


def test_get_progress_returns_none_for_missing(tmp_path):
    with patch.object(storage, 'DATA_DIR', tmp_path):
        result = get_progress("nobody")
    assert result is None


def test_get_progress_returns_data(tmp_path):
    f = tmp_path / "progress.json"
    f.write_text(json.dumps({"u2": {"role": "qa", "tasks": ["t1"]}}))
    with patch.object(storage, 'DATA_DIR', tmp_path):
        result = get_progress("u2")
    assert result["role"] == "qa"
