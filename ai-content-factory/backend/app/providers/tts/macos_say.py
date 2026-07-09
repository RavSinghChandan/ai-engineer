"""Local TTS adapter using the built-in macOS `say` engine.

Zero API keys, fully offline — the local-first default. The adapter
contract (TTSPort) is identical to ElevenLabs/OpenAI adapters, so
upgrading voice quality later is a config change.
"""
import asyncio
import uuid
from pathlib import Path

from app.core.exceptions import ProviderUnavailableError
from app.core.logging import get_logger
from app.providers.media.ffmpeg import FFmpegComposer
from app.providers.ports import TTSResult

logger = get_logger(__name__)


class MacOsSayTTS:
    def __init__(self, voice: str, rate: int, composer: FFmpegComposer):
        self._voice = voice
        self._rate = rate
        self._composer = composer

    async def synthesize(self, text: str, out_dir: Path) -> TTSResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = uuid.uuid4().hex[:12]
        aiff_path = out_dir / f"voice_{stem}.aiff"
        wav_path = out_dir / f"voice_{stem}.wav"

        process = await asyncio.create_subprocess_exec(
            "say", "-v", self._voice, "-r", str(self._rate), "-o", str(aiff_path), text,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        if process.returncode != 0 or not aiff_path.exists():
            raise ProviderUnavailableError(f"macOS say failed: {stderr.decode()[:500]}")

        await self._composer.transcode_audio(aiff_path, wav_path)
        aiff_path.unlink(missing_ok=True)
        duration = await self._composer.media_duration(wav_path)
        logger.info("tts_synthesized", voice=self._voice, duration=duration, path=str(wav_path))
        return TTSResult(audio_path=wav_path, duration_seconds=duration, voice=self._voice)
