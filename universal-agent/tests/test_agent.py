"""
Tests for the universal agent — no API keys needed.
Uses a mock LLM so tests run in CI without any provider.
"""
import pytest
from unittest.mock import MagicMock, patch
from langchain_core.messages import AIMessage

from core.config_loader import AgentConfig, AgentMeta, LLMConfig, MemoryConfig, ToolsConfig
from core.memory import MemoryStore
from core.tools import build_tools


# ─── Config Tests ─────────────────────────────────────────────────────────────

def test_default_config_loads():
    cfg = AgentConfig()
    assert cfg.agent.name == "Assistant"
    assert cfg.llm.provider == "anthropic"
    assert cfg.memory.max_history == 20


def test_config_from_yaml(tmp_path):
    from core.config_loader import load_config
    yaml_content = """
agent:
  name: TestBot
  persona: You are a test bot.
llm:
  provider: anthropic
  model: claude-haiku-4-5-20251001
  temperature: 0.5
  max_tokens: 512
  api_key_env: ANTHROPIC_API_KEY
"""
    config_file = tmp_path / "agent.config.yaml"
    config_file.write_text(yaml_content)
    cfg = load_config(config_file)
    assert cfg.agent.name == "TestBot"
    assert cfg.llm.model == "claude-haiku-4-5-20251001"
    assert cfg.llm.temperature == 0.5


def test_config_missing_file_returns_defaults():
    from core.config_loader import load_config
    cfg = load_config("/nonexistent/path/config.yaml")
    assert cfg.agent.name == "Assistant"


# ─── Memory Tests ─────────────────────────────────────────────────────────────

def test_memory_creates_session():
    mem = MemoryStore(MemoryConfig())
    session = mem.get_or_create("user_1")
    assert session.session_id == "user_1"


def test_memory_appends_turns():
    mem = MemoryStore(MemoryConfig(max_history=5))
    mem.append_turn("s1", "Hello", "Hi there!")
    mem.append_turn("s1", "What time is it?", "It's 3pm.")
    history = mem.get_history("s1")
    assert len(history) == 4
    assert history[0].content == "Hello"
    assert history[1].content == "Hi there!"


def test_memory_trims_to_max_history():
    mem = MemoryStore(MemoryConfig(max_history=2))
    for i in range(5):
        mem.append_turn("s1", f"q{i}", f"a{i}")
    history = mem.get_history("s1")
    assert len(history) == 4  # max_history=2 → max 4 messages (2 turns)


def test_memory_clear():
    mem = MemoryStore(MemoryConfig())
    mem.append_turn("s1", "hello", "hi")
    mem.clear("s1")
    history = mem.get_history("s1")
    assert len(history) == 0


def test_memory_session_expiry():
    import time
    mem = MemoryStore(MemoryConfig(session_ttl_seconds=1))
    mem.append_turn("s1", "hello", "hi")
    time.sleep(1.1)
    # After TTL, get_or_create should create a fresh session
    session = mem.get_or_create("s1")
    # The old session was evicted — new session has no messages
    assert len(session.messages) == 0


def test_multiple_independent_sessions():
    mem = MemoryStore(MemoryConfig())
    mem.append_turn("user_a", "I'm Alice", "Hello Alice!")
    mem.append_turn("user_b", "I'm Bob", "Hello Bob!")
    assert len(mem.get_history("user_a")) == 2
    assert len(mem.get_history("user_b")) == 2
    # Alice's history should not contain Bob's messages
    assert all("Bob" not in m.content for m in mem.get_history("user_a"))


# ─── Tools Tests ──────────────────────────────────────────────────────────────

def test_calculator_tool():
    from core.tools import calculator
    assert calculator.invoke({"expression": "2 + 2"}) == "4"
    assert calculator.invoke({"expression": "10 * 5"}) == "50"
    assert calculator.invoke({"expression": "100 / 4"}) == "25.0"
    assert calculator.invoke({"expression": "2 ** 8"}) == "256"


def test_calculator_rejects_unsafe_input():
    from core.tools import calculator
    result = calculator.invoke({"expression": "__import__('os').system('ls')"})
    assert "Could not evaluate" in result


def test_datetime_tool():
    from core.tools import get_current_datetime
    result = get_current_datetime.invoke({"timezone_name": "UTC"})
    assert "UTC" in result
    assert len(result) > 10


def test_tools_build_with_defaults():
    from core.config_loader import ToolsConfig
    tools = build_tools(ToolsConfig())
    names = [t.name for t in tools]
    assert "calculator" in names
    assert "get_current_datetime" in names


def test_tools_calculator_disabled():
    cfg = ToolsConfig(calculator={"enabled": False})
    tools = build_tools(cfg)
    names = [t.name for t in tools]
    assert "calculator" not in names


# ─── Agent Integration Test (mocked LLM) ──────────────────────────────────────

def _make_mock_agent(response_text: str = "Mocked response"):
    """Build a UniversalAgent with all LLM calls mocked."""
    from core.agent import UniversalAgent

    cfg = AgentConfig(
        agent=AgentMeta(name="TestBot", persona="You are a test bot."),
        llm=LLMConfig(provider="anthropic", model="claude-haiku-4-5-20251001", api_key_env="ANTHROPIC_API_KEY"),
        memory=MemoryConfig(max_history=10),
    )

    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_llm
    mock_llm.invoke.return_value = AIMessage(content=response_text)

    with patch("core.agent.build_llm", return_value=mock_llm), \
         patch("core.agent.build_retriever", return_value=None):
        agent = UniversalAgent(cfg)

    return agent


def test_agent_chat_returns_response():
    agent = _make_mock_agent("Hello! How can I help?")
    response = agent.chat("session_1", "Hi there!")
    assert "Hello" in response or len(response) > 0


def test_agent_maintains_session_history():
    agent = _make_mock_agent("Response A")
    agent.chat("s1", "First message")
    history = agent._memory.get_history("s1")
    assert len(history) == 2  # 1 human + 1 AI


def test_agent_clear_session():
    agent = _make_mock_agent("Hello")
    agent.chat("s1", "test")
    agent.clear_session("s1")
    assert len(agent._memory.get_history("s1")) == 0


def test_agent_system_prompt_includes_app_name():
    agent = _make_mock_agent()
    assert "TestBot" in agent._system_prompt or "test bot" in agent._system_prompt.lower()


def test_agent_independent_sessions():
    from core.agent import UniversalAgent

    cfg = AgentConfig()
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_llm
    call_count = 0

    def side_effect(messages):
        nonlocal call_count
        call_count += 1
        return AIMessage(content=f"Response #{call_count}")

    mock_llm.invoke.side_effect = side_effect

    with patch("core.agent.build_llm", return_value=mock_llm), \
         patch("core.agent.build_retriever", return_value=None):
        agent = UniversalAgent(cfg)

    agent.chat("alice", "hello")
    agent.chat("bob", "hello")
    assert agent._memory.active_sessions == 2


# ─── FastAPI Adapter Tests ─────────────────────────────────────────────────────

def test_fastapi_mount_adds_routes():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from adapters.fastapi_adapter import mount_agent

    app = FastAPI()
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_llm
    mock_llm.invoke.return_value = AIMessage(content="Test response")

    with patch("core.agent.build_llm", return_value=mock_llm), \
         patch("core.agent.build_retriever", return_value=None):
        mount_agent(app)

    client = TestClient(app)
    health = client.get("/agent/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"


def test_fastapi_chat_endpoint():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from adapters.fastapi_adapter import mount_agent

    app = FastAPI()
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_llm
    mock_llm.invoke.return_value = AIMessage(content="I can help with that!")

    with patch("core.agent.build_llm", return_value=mock_llm), \
         patch("core.agent.build_retriever", return_value=None):
        mount_agent(app)

    client = TestClient(app)
    res = client.post("/agent/chat", json={"message": "What is 2+2?"})
    assert res.status_code == 200
    data = res.json()
    assert "message" in data
    assert "session_id" in data


def test_fastapi_clear_endpoint():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from adapters.fastapi_adapter import mount_agent

    app = FastAPI()
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_llm
    mock_llm.invoke.return_value = AIMessage(content="ok")

    with patch("core.agent.build_llm", return_value=mock_llm), \
         patch("core.agent.build_retriever", return_value=None):
        mount_agent(app)

    client = TestClient(app)
    res = client.post("/agent/clear", json={"session_id": "test_session"})
    assert res.status_code == 200
    assert res.json()["status"] == "cleared"
