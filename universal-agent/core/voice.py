"""
Voice module for Universal Agent.

Provides:
  - POST /agent/voice/stt  — audio blob → transcript (Whisper fallback)
  - GET  /agent/voice/config — returns voice settings from agent config

The primary STT/TTS path is the browser (Web Speech API + SpeechSynthesis),
so no API key is required by default. The Whisper backend route exists as a
fallback for browsers that don't support Web Speech API.
"""
from __future__ import annotations

import io
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def transcribe_audio(audio_bytes: bytes, language: str = "en", model: str = "whisper-1") -> str:
    """
    Transcribe audio bytes using OpenAI Whisper.
    Falls back gracefully if openai is not installed or key is missing.
    """
    try:
        import openai  # type: ignore[import]
    except ImportError:
        raise RuntimeError("openai package not installed. Run: pip install openai")

    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise RuntimeError("No OPENAI_API_KEY found for Whisper STT")

    client = openai.OpenAI(api_key=api_key)
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.webm"

    transcript = client.audio.transcriptions.create(
        model=model,
        file=audio_file,
        language=language[:2],  # BCP-47 → ISO-639-1 (e.g. "en-IN" → "en")
        response_format="text",
    )
    return str(transcript).strip()
