"""Composition root — the only place concrete providers are chosen.

Everything downstream (agents, services, API) receives ports.
"""
from functools import lru_cache

from app.core.config import get_settings
from app.core.exceptions import ValidationFailedError
from app.providers.llm.registry import ModelRegistry, get_model_registry
from app.providers.media.ffmpeg import FFmpegComposer
from app.providers.media.thumbnail import PillowThumbnailRenderer
from app.providers.ports import ThumbnailPort, TTSPort, VectorStorePort, VideoComposerPort
from app.providers.tts.elevenlabs import ElevenLabsTTS
from app.providers.tts.macos_say import MacOsSayTTS
from app.providers.vector.local_store import LocalVectorStore


@lru_cache
def get_composer() -> VideoComposerPort:
    return FFmpegComposer()


def build_tts(voice_provider: str, voice_id: str | None) -> TTSPort:
    """Per-profile TTS resolution — the profile decides provider + voice."""
    settings = get_settings()
    composer = FFmpegComposer()
    if voice_provider == "kokoro":
        from app.providers.tts.kokoro_local import KokoroTTS

        return KokoroTTS(voice_id or "", settings.data_dir, composer)
    if voice_provider == "elevenlabs":
        if not settings.elevenlabs_api_key:
            raise ValidationFailedError("Profile uses ElevenLabs but ELEVENLABS_API_KEY is empty")
        return ElevenLabsTTS(
            settings.elevenlabs_api_key, voice_id or settings.elevenlabs_voice_id, composer
        )
    if voice_provider == "macos_say":
        return MacOsSayTTS(voice_id or settings.macos_voice, settings.macos_speech_rate, composer)
    raise ValidationFailedError(f"Unknown voice provider '{voice_provider}'")


@lru_cache
def get_tts() -> TTSPort:
    settings = get_settings()
    return build_tts(settings.tts_provider, None)


def build_avatar_provider(avatar_provider: str):
    """Per-profile avatar resolution. Returns None when the profile has no avatar."""
    from app.providers.avatar.heygen import HeyGenAvatarProvider

    settings = get_settings()
    if avatar_provider in ("heygen", "heygen_photo"):
        if not settings.heygen_api_key:
            raise ValidationFailedError("Profile uses HeyGen but HEYGEN_API_KEY is empty")
        return HeyGenAvatarProvider(
            settings.heygen_api_key, FFmpegComposer(), talking_photo=avatar_provider == "heygen_photo"
        )
    return None


@lru_cache
def get_vector_store() -> VectorStorePort:
    settings = get_settings()
    return LocalVectorStore(settings.data_dir / "vector_store.json")


@lru_cache
def get_thumbnail_renderer() -> ThumbnailPort:
    return PillowThumbnailRenderer()


def get_models() -> ModelRegistry:
    return get_model_registry()
