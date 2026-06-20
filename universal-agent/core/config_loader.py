"""Loads and validates agent.config.yaml — single source of truth for all settings."""
import os
from pathlib import Path
from typing import Any, Optional, Union

import yaml
from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-6"
    temperature: float = 0.7
    max_tokens: int = 1024
    api_key_env: str = "ANTHROPIC_API_KEY"

    @property
    def api_key(self) -> str:
        key = os.environ.get(self.api_key_env, "")
        if not key:
            raise EnvironmentError(
                f"API key not found. Set the '{self.api_key_env}' environment variable."
            )
        return key


class MemoryConfig(BaseModel):
    enabled: bool = True
    type: str = "buffer"
    max_history: int = 20
    session_ttl_seconds: int = 3600


class KnowledgeBaseConfig(BaseModel):
    enabled: bool = False
    type: str = "faiss"
    source_dir: str = "./knowledge"
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 3


class WebSearchToolConfig(BaseModel):
    enabled: bool = False
    provider: str = "tavily"
    api_key_env: str = "TAVILY_API_KEY"


class ToolsConfig(BaseModel):
    web_search: WebSearchToolConfig = Field(default_factory=WebSearchToolConfig)
    calculator: dict = Field(default_factory=lambda: {"enabled": True})
    datetime: dict = Field(default_factory=lambda: {"enabled": True})
    custom_tools: dict = Field(default_factory=lambda: {"enabled": False})


class ContextConfig(BaseModel):
    app_name: str = "My Application"
    app_description: str = ""
    extra_facts: list[str] = Field(default_factory=list)
    knowledge_file: str = ""


class RateLimitConfig(BaseModel):
    enabled: bool = True
    requests_per_minute: int = 60


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)


class WidgetThemeConfig(BaseModel):
    primary_color: str = "#2563eb"
    background_color: str = "#ffffff"
    text_color: str = "#1f2937"
    border_radius: str = "12px"


class WidgetConfig(BaseModel):
    theme: WidgetThemeConfig = Field(default_factory=WidgetThemeConfig)
    position: str = "bottom-right"
    trigger_text: str = "Ask me anything"
    placeholder_text: str = "Type your question..."
    show_branding: bool = False


class VoiceConfig(BaseModel):
    enabled: bool = False
    stt_provider: str = "browser"      # "browser" (Web Speech API) | "whisper" (OpenAI Whisper)
    tts_provider: str = "browser"      # "browser" (Web Speech Synthesis) — extensible
    whisper_model: str = "whisper-1"
    language: str = "en"               # BCP-47 hint for STT
    speak_responses: bool = True       # auto-read agent replies aloud


class LoggingConfig(BaseModel):
    level: str = "INFO"
    log_to_file: bool = False
    log_file: str = "./logs/agent.log"


class AgentMeta(BaseModel):
    name: str = "Assistant"
    persona: str = "You are a helpful assistant."
    language: str = "en"
    fallback_message: str = "I'm not sure about that. Can you rephrase?"


class AgentConfig(BaseModel):
    agent: AgentMeta = Field(default_factory=AgentMeta)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    knowledge_base: KnowledgeBaseConfig = Field(default_factory=KnowledgeBaseConfig)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)
    context: ContextConfig = Field(default_factory=ContextConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    widget: WidgetConfig = Field(default_factory=WidgetConfig)
    voice: VoiceConfig = Field(default_factory=VoiceConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)


def load_config(config_path: Optional[Union[str, Path]] = None) -> AgentConfig:
    """
    Load agent config from YAML file. Falls back to defaults if file not found.
    Search order: explicit path → ./config/agent.config.yaml → env var AGENT_CONFIG_PATH
    """
    if config_path is None:
        env_path = os.environ.get("AGENT_CONFIG_PATH")
        if env_path:
            config_path = Path(env_path)
        else:
            config_path = Path(__file__).parent.parent / "config" / "agent.config.yaml"

    config_path = Path(config_path)

    if not config_path.exists():
        return AgentConfig()

    with open(config_path) as f:
        raw: dict[str, Any] = yaml.safe_load(f) or {}

    return AgentConfig(**raw)
