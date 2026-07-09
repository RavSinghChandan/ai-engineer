"""Kokoro local TTS adapter — free, offline, near-human neural voices.

No API key, no per-character cost: the open-source Kokoro model (~330MB,
downloaded once into data/) runs on-device via ONNX. This is the
almost-free voice path; ElevenLabs remains available only for cloning
the creator's own voice.

Voices include am_michael, am_adam, am_liam (male US), af_heart,
af_bella (female US), bm_george (male UK) and more.
"""
import asyncio
import re
import uuid
from pathlib import Path

import httpx
import numpy as np

from app.core.exceptions import ProviderUnavailableError
from app.core.logging import get_logger
from app.providers.media.ffmpeg import FFmpegComposer
from app.providers.ports import TTSResult

logger = get_logger(__name__)

_RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
_MODEL_FILE = "kokoro-v1.0.onnx"
_VOICES_FILE = "voices-v1.0.bin"
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_CHUNK_CHARS = 400
_PAUSE_SECONDS = 0.25
DEFAULT_VOICE = "am_michael"


class KokoroTTS:
    def __init__(self, voice: str, data_dir: Path, composer: FFmpegComposer):
        self._voice = voice or DEFAULT_VOICE
        self._model_dir = data_dir / "kokoro"
        self._composer = composer
        self._engine = None

    async def synthesize(self, text: str, out_dir: Path) -> TTSResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(self._ensure_engine)
        samples, sample_rate = await asyncio.to_thread(self._synth_all, text)

        stem = uuid.uuid4().hex[:12]
        raw_path = out_dir / f"voice_{stem}_kokoro.wav"
        import soundfile

        soundfile.write(raw_path, samples, sample_rate)
        wav_path = out_dir / f"voice_{stem}.wav"
        await self._composer.transcode_audio(raw_path, wav_path)
        raw_path.unlink(missing_ok=True)
        duration = await self._composer.media_duration(wav_path)
        logger.info("kokoro_synthesized", voice=self._voice, duration=duration)
        return TTSResult(audio_path=wav_path, duration_seconds=duration, voice=f"kokoro/{self._voice}")

    # --- internals (run in a worker thread) ---

    def _ensure_engine(self) -> None:
        if self._engine is not None:
            return
        self._model_dir.mkdir(parents=True, exist_ok=True)
        model_path = self._model_dir / _MODEL_FILE
        voices_path = self._model_dir / _VOICES_FILE
        for filename, path in ((_MODEL_FILE, model_path), (_VOICES_FILE, voices_path)):
            if not path.exists():
                logger.info("kokoro_downloading", file=filename)
                self._download(f"{_RELEASE}/{filename}", path)
        from kokoro_onnx import Kokoro

        self._engine = Kokoro(str(model_path), str(voices_path))

    @staticmethod
    def _download(url: str, path: Path) -> None:
        try:
            with httpx.Client(timeout=600, follow_redirects=True) as client, client.stream("GET", url) as response:
                response.raise_for_status()
                tmp = path.with_suffix(".part")
                with tmp.open("wb") as file:
                    for chunk in response.iter_bytes():
                        file.write(chunk)
                tmp.rename(path)
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"Kokoro model download failed: {exc}") from exc

    def _synth_all(self, text: str) -> tuple[np.ndarray, int]:
        chunks: list[str] = []
        current = ""
        for sentence in _SENTENCE_RE.split(text.strip()):
            if len(current) + len(sentence) > _CHUNK_CHARS and current:
                chunks.append(current.strip())
                current = ""
            current += " " + sentence
        if current.strip():
            chunks.append(current.strip())

        pieces: list[np.ndarray] = []
        sample_rate = 24_000
        for chunk in chunks:
            samples, sample_rate = self._engine.create(chunk, voice=self._voice, speed=1.0, lang="en-us")
            pieces.append(samples)
            pieces.append(np.zeros(int(sample_rate * _PAUSE_SECONDS), dtype=samples.dtype))
        if not pieces:
            raise ProviderUnavailableError("Kokoro produced no audio (empty text?)")
        return np.concatenate(pieces), sample_rate
