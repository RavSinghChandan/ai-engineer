"""
Test Suite: Memory Store (memory/store.py)
Covers: write, read, read_all, write_meta, read_meta, clear, memory_keys.
"""
import asyncio
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import memory.store as mem


def run(coro):
    """Helper to run async coroutines in sync tests."""
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def reset_memory():
    # clear() is synchronous in memory/store.py
    mem.clear("session-test")
    mem.clear("session-other")
    yield
    mem.clear("session-test")
    mem.clear("session-other")


class TestWriteAndRead:
    def test_write_and_read_basic(self):
        run(mem.write_meta("session-test", "profile", {"name": "Varun"}))
        result = run(mem.read_meta("session-test", "profile"))
        assert result == {"name": "Varun"}

    def test_read_nonexistent_returns_none(self):
        result = run(mem.read_meta("session-test", "nonexistent_key"))
        assert result is None

    def test_overwrite_key(self):
        run(mem.write_meta("session-test", "key", {"v": 1}))
        run(mem.write_meta("session-test", "key", {"v": 2}))
        result = run(mem.read_meta("session-test", "key"))
        assert result["v"] == 2

    def test_multiple_keys_independent(self):
        run(mem.write_meta("session-test", "profile", {"name": "X"}))
        run(mem.write_meta("session-test", "state", {"step": 3}))
        p = run(mem.read_meta("session-test", "profile"))
        s = run(mem.read_meta("session-test", "state"))
        assert p["name"] == "X"
        assert s["step"] == 3

    def test_different_sessions_independent(self):
        run(mem.write_meta("session-test", "key", {"session": "A"}))
        run(mem.write_meta("session-other", "key", {"session": "B"}))
        a = run(mem.read_meta("session-test", "key"))
        b = run(mem.read_meta("session-other", "key"))
        assert a["session"] == "A"
        assert b["session"] == "B"


class TestReadAll:
    def test_read_all_returns_meta_module(self):
        # write_meta stores under the '__meta__' module key internally
        run(mem.write_meta("session-test", "k1", {"a": 1}))
        run(mem.write_meta("session-test", "k2", {"b": 2}))
        all_data = run(mem.read_all("session-test"))
        # The raw read_all returns the full _store[session] dict including __meta__
        assert "__meta__" in all_data
        assert all_data["__meta__"]["k1"] == {"a": 1}
        assert all_data["__meta__"]["k2"] == {"b": 2}

    def test_read_all_empty_session_returns_empty_dict(self):
        all_data = run(mem.read_all("session-never-written"))
        assert all_data == {}


class TestMemoryKeys:
    def test_memory_keys_excludes_meta_module(self):
        # memory_keys() filters out __meta__ modules by design
        # Write via raw write() to a non-meta module to see it in keys
        run(mem.write("session-test", "numerology", "indian", {"data": "..."}))
        keys = mem.memory_keys("session-test")
        assert "numerology" in keys

    def test_memory_keys_meta_only_returns_empty(self):
        # If only __meta__ data written (via write_meta), memory_keys shows {}
        run(mem.write_meta("session-test", "profile", {}))
        keys = mem.memory_keys("session-test")
        assert keys == {}

    def test_memory_keys_empty_session_returns_empty(self):
        keys = mem.memory_keys("session-never-written-zz")
        assert keys == {}


class TestClear:
    def test_clear_removes_session_data(self):
        run(mem.write_meta("session-test", "profile", {"data": "x"}))
        mem.clear("session-test")
        result = run(mem.read_meta("session-test", "profile"))
        assert result is None

    def test_clear_one_session_does_not_affect_other(self):
        run(mem.write_meta("session-test", "k", {"v": 1}))
        run(mem.write_meta("session-other", "k", {"v": 2}))
        mem.clear("session-test")
        other = run(mem.read_meta("session-other", "k"))
        assert other["v"] == 2


class TestConcurrency:
    def test_concurrent_writes_do_not_corrupt(self):
        async def multi_write():
            tasks = [
                mem.write_meta("session-test", f"key_{i}", {"i": i})
                for i in range(10)
            ]
            await asyncio.gather(*tasks)
        run(multi_write())
        for i in range(10):
            val = run(mem.read_meta("session-test", f"key_{i}"))
            assert val is not None
            assert val["i"] == i
