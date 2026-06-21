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


class AstroIntelToolConfig(BaseModel):
    enabled: bool = False
    backend_url: str = "http://localhost:8080"
    api_key_env: str = "ASTROINTEL_API_KEY"
    superadmin_password_env: str = "SUPERADMIN_PASSWORD"


class ToolsConfig(BaseModel):
    web_search: WebSearchToolConfig = Field(default_factory=WebSearchToolConfig)
    calculator: dict = Field(default_factory=lambda: {"enabled": True})
    datetime: dict = Field(default_factory=lambda: {"enabled": True})
    astrointel: AstroIntelToolConfig = Field(default_factory=AstroIntelToolConfig)
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
    stt_provider: str = "browser"      # "browser" | "whisper"
    tts_provider: str = "browser"
    whisper_model: str = "whisper-1"
    language: str = "en"
    speak_responses: bool = True
    # TTS delivery — tune per agent persona
    tts_rate: float = 0.88             # 0.1–2.0 (1.0 = normal, <1 = slower)
    tts_pitch: float = 1.25            # 0.0–2.0 (1.0 = normal, >1 = higher)
    tts_volume: float = 0.92           # 0.0–1.0
    strip_emojis: bool = True          # remove emoji before speaking


class HumanSpeechPatternsConfig(BaseModel):
    """
    The exact words and phrases this human uses naturally in conversation.
    All lists are randomly sampled at runtime — no two responses sound identical.
    Leave any list empty [] to disable that pattern entirely.
    """
    # Opening a response — what this person says first when they react
    # e.g. a warm guide says "Ah, I see…" not "Certainly!"
    openers: list[str] = Field(default_factory=lambda: [
        "Ah, I see…",
        "Right…",
        "Hmm…",
        "Interesting…",
        "Got it.",
    ])

    # Affirmations — short reactions when user shares something
    affirmations: list[str] = Field(default_factory=lambda: [
        "Yes, absolutely.",
        "Exactly.",
        "That makes sense.",
        "I understand.",
    ])

    # Thinking out loud — what this person says while forming an answer
    # These are sprinkled mid-response to sound like real-time thought
    thinking_phrases: list[str] = Field(default_factory=lambda: [
        "Let me feel into that…",
        "Give me a moment…",
        "The answer is coming…",
    ])

    # Empathy bridges — used when the user shares something emotional
    empathy_bridges: list[str] = Field(default_factory=lambda: [
        "I hear you.",
        "That's not easy.",
        "I understand how that feels.",
        "That takes courage to share.",
    ])

    # Closers — how this person ends a response naturally
    closers: list[str] = Field(default_factory=lambda: [
        "Does that resonate with you?",
        "What do you feel about that?",
        "Take a moment with that.",
        "",   # empty = sometimes end without a closer
    ])

    # Filler probability — how often to inject an opener (0.0 = never, 1.0 = always)
    opener_probability: float = 0.35
    thinking_probability: float = 0.15   # how often to use a thinking phrase
    closer_probability: float = 0.40     # how often to end with a reflective question
    empathy_probability: float = 0.60    # how often to acknowledge emotion when detected


class HumanRhythmConfig(BaseModel):
    """
    Controls pacing and pause patterns — how this voice breathes.
    These map to TTS SSML pauses and sentence structure in text output.
    """
    # Sentence cadence — short/punchy vs long/flowing
    sentences_per_response: int = 2          # target sentence count (1-4)
    max_words_per_sentence: int = 20         # forces short sentences for punch
    use_ellipsis_for_pause: bool = True      # "The stars align… and reveal your path."
    use_em_dash_for_rhythm: bool = True      # "You are strong — stronger than you know."
    use_repetition_for_emphasis: bool = False # "You. Are. Ready." — dramatic effect

    # Breathing room — how much whitespace between thoughts
    paragraph_break_frequency: int = 0       # 0 = never break into paragraphs in voice mode


class HumanEmotionalProfileConfig(BaseModel):
    """
    Defines the emotional range this human voice operates in.
    These drive word choice, sentence energy, and response texture.
    """
    # Core emotional baseline — what this person defaults to feeling
    baseline_emotion: str = "calm"           # "calm" | "joyful" | "serious" | "playful" | "reverent"

    # How much this person mirrors the user's emotional state (0.0–1.0)
    # High = very empathetic, adapts to user energy
    # Low = maintains their own steady baseline regardless
    emotional_mirroring: float = 0.7

    # Does this person express enthusiasm? (e.g. "Oh, this is powerful!")
    shows_enthusiasm: bool = True
    enthusiasm_words: list[str] = Field(default_factory=lambda: [
        "powerful", "beautiful", "remarkable", "profound", "wonderful"
    ])

    # Does this person express gentle concern when user seems distressed?
    shows_concern: bool = True
    concern_triggers: list[str] = Field(default_factory=lambda: [
        "worried", "scared", "confused", "lost", "stuck", "unhappy", "sad", "angry"
    ])

    # Does this person celebrate user's wins?
    celebrates_wins: bool = True
    celebration_phrases: list[str] = Field(default_factory=lambda: [
        "That is wonderful news.",
        "You should feel proud of that.",
        "That's a real milestone.",
    ])


class HumanMemoryBehaviorConfig(BaseModel):
    """
    How this human refers back to what was said earlier in the conversation.
    Humans don't treat each message as isolated — they connect threads.
    """
    # Refer back to earlier parts of conversation
    callback_to_prior: bool = True

    # Phrases used to call back to earlier context
    callback_phrases: list[str] = Field(default_factory=lambda: [
        "Earlier you mentioned…",
        "Coming back to what you said…",
        "That connects to something you shared earlier —",
        "You touched on this before —",
    ])

    # Use the user's name if known (picked from conversation context)
    use_user_name: bool = True

    # Address the user personally in how many % of responses
    name_usage_probability: float = 0.30

    # Summarise what was said before answering (very human, shows listening)
    echo_back_intent: bool = False       # "So you're asking about…" — can feel robotic, off by default


class HumanBoundaryConfig(BaseModel):
    """
    What this human does NOT do — sets the behavioural guardrails
    that make this feel like a specific individual, not a generic chatbot.
    """
    never_says: list[str] = Field(default_factory=lambda: [
        "Certainly!",
        "Of course!",
        "Great question!",
        "As an AI",
        "I am programmed to",
        "I cannot help with that",
        "I'm just an AI",
    ])

    never_starts_with: list[str] = Field(default_factory=lambda: [
        "Sure,",
        "Absolutely!",
        "Definitely!",
        "Of course!",
    ])

    # Topics this human deflects with a warm redirect (not a hard refusal)
    soft_deflect_topics: list[str] = Field(default_factory=list)

    # Phrase used to deflect softly
    soft_deflect_phrase: str = "That's a little outside my space — but let me offer what I can."

    # Maximum times to use the same opener in one session (prevents repetition)
    max_phrase_reuse: int = 2


class HumanVoiceConfig(BaseModel):
    """
    Complete human personality configuration for a voice AI agent.

    This is the master config section that makes the agent sound like
    a specific human being rather than a generic chatbot. Every dimension
    of human conversation is configurable here — speech patterns, rhythm,
    emotional range, memory behaviour, and what this person refuses to say.

    To create a new agent personality, fill in this section in the YAML.
    Nothing here is hardcoded — 100 different agents can each have 100
    different personalities just by changing their YAML.
    """
    # Is the full human personality system enabled?
    enabled: bool = False

    # ── Core identity ──────────────────────────────────────────────────────────
    # Name this human calls themselves in first person
    self_reference: str = "I"                # default; could be "Jyoti" for poetic use

    # Background story — what happened in this person's life that made them this way
    # This is injected into the system prompt as a first-person backstory
    backstory: str = ""

    # Core values — 3-5 values that drive every response (injected as principles)
    core_values: list[str] = Field(default_factory=lambda: [
        "authenticity", "compassion", "clarity"
    ])

    # ── Speech + rhythm ────────────────────────────────────────────────────────
    speech_patterns: HumanSpeechPatternsConfig = Field(
        default_factory=HumanSpeechPatternsConfig
    )
    rhythm: HumanRhythmConfig = Field(default_factory=HumanRhythmConfig)

    # ── Emotional makeup ───────────────────────────────────────────────────────
    emotional_profile: HumanEmotionalProfileConfig = Field(
        default_factory=HumanEmotionalProfileConfig
    )

    # ── Conversational memory ──────────────────────────────────────────────────
    memory_behavior: HumanMemoryBehaviorConfig = Field(
        default_factory=HumanMemoryBehaviorConfig
    )

    # ── What this human won't do ───────────────────────────────────────────────
    boundaries: HumanBoundaryConfig = Field(default_factory=HumanBoundaryConfig)


class LoggingConfig(BaseModel):
    level: str = "INFO"
    log_to_file: bool = False
    log_file: str = "./logs/agent.log"


class PersonaConfig(BaseModel):
    """Controls HOW the agent presents itself — gender, age, tone, style."""
    gender: str = "neutral"            # "female" | "male" | "neutral"
    age: int = 0                       # 0 = not specified
    tone: str = "professional"         # "warm" | "professional" | "spiritual" | "formal" | "casual"
    communication_style: str = "clear" # "poetic" | "clear" | "concise" | "empathetic"
    greeting_style: str = "namaste"    # "namaste" | "hello" | "hey" | custom string
    language_style: str = "bilingual"  # "english_only" | "bilingual" | "multilingual"
    expertise_level: str = "expert"    # "expert" | "guide" | "assistant"
    emotional_tone: str = "warm"       # "warm" | "neutral" | "empathetic" | "authoritative"
    response_length: str = "medium"    # "short" | "medium" | "detailed"
    always_greet_with: str = ""        # if set, every response opens with this phrase


class EnterpriseConfig(BaseModel):
    """Controls enterprise-grade guardrails, limits, and compliance rules."""
    # Session / rate limits
    max_questions_per_session: int = 10      # 0 = unlimited
    max_tokens_per_response: int = 1024
    session_timeout_seconds: int = 7200

    # Guardrails
    domain_strict: bool = True               # refuse off-topic questions hard
    safe_topics_only: bool = True            # block harmful/sensitive advice
    require_disclaimer: bool = True          # append disclaimer to medical/legal queries
    disclaimer_text: str = (
        "⚠️ This reading is for spiritual guidance only — not medical, legal, or financial advice."
    )

    # Branding & compliance
    always_identify_as_ai: bool = True       # never claim to be human when asked
    watermark: str = ""                      # e.g. "Powered by AstroIntel 360°"

    # Escalation
    escalation_keywords: list[str] = Field(default_factory=lambda: [
        "suicide", "self-harm", "kill", "abuse", "emergency"
    ])
    escalation_response: str = (
        "I'm here for you 🙏. If you're in crisis please reach out to a mental health professional or call a helpline immediately."
    )


class AgentMeta(BaseModel):
    name: str = "Assistant"
    persona: str = "You are a helpful assistant."
    mode: str = "react"
    language: str = "en"
    fallback_message: str = "I'm not sure about that. Can you rephrase?"


class AgentConfig(BaseModel):
    agent: AgentMeta = Field(default_factory=AgentMeta)
    persona: PersonaConfig = Field(default_factory=PersonaConfig)
    enterprise: EnterpriseConfig = Field(default_factory=EnterpriseConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    knowledge_base: KnowledgeBaseConfig = Field(default_factory=KnowledgeBaseConfig)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)
    context: ContextConfig = Field(default_factory=ContextConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    widget: WidgetConfig = Field(default_factory=WidgetConfig)
    voice: VoiceConfig = Field(default_factory=VoiceConfig)
    human_voice: HumanVoiceConfig = Field(default_factory=HumanVoiceConfig)
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
