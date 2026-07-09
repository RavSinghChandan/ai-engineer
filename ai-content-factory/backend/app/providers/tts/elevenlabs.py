"""ElevenLabs TTS adapter — drop-in higher-quality voice once a key is set.

Enable with: TTS_PROVIDER=elevenlabs and ELEVENLABS_API_KEY=... in backend/.env
"""
import uuid
from pathlib import Path

import httpx

from app.core.exceptions import ProviderRateLimitedError, ProviderUnavailableError
from app.providers.media.ffmpeg import FFmpegComposer
from app.providers.ports import TTSResult

API_BASE = "https://api.elevenlabs.io/v1"


class ElevenLabsVoiceLab:
    """Voice management: list voices and create instant voice clones.

    Cloning is per-person and data-driven: the caller passes the person's
    name and their recorded samples; the returned voice_id is stored on
    that person's CreatorProfile.
    """

    def __init__(self, api_key: str):
        self._api_key = api_key

    async def list_voices(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(f"{API_BASE}/voices", headers={"xi-api-key": self._api_key})
        if response.status_code != 200:
            raise ProviderUnavailableError(f"ElevenLabs voices error {response.status_code}: {response.text[:300]}")
        return [
            {
                "voice_id": v.get("voice_id"),
                "name": v.get("name"),
                "category": v.get("category"),
            }
            for v in response.json().get("voices", [])
        ]

    async def clone_voice(self, name: str, samples: list[tuple[str, bytes, str]]) -> str:
        """Instant voice clone from (filename, content, mime) samples → voice_id."""
        import asyncio

        files = [("files", (filename, content, mime)) for filename, content, mime in samples]
        response = None
        for attempt in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=300) as client:
                    response = await client.post(
                        f"{API_BASE}/voices/add",
                        headers={"xi-api-key": self._api_key},
                        data={"name": name, "description": "Cloned via AI Content Factory"},
                        files=files,
                    )
                break
            except httpx.HTTPError as exc:
                if attempt == 3:
                    raise ProviderUnavailableError(f"ElevenLabs clone network failure: {exc}") from exc
                await asyncio.sleep(2**attempt)
        if response.status_code == 429:
            raise ProviderRateLimitedError("ElevenLabs rate limited during voice clone")
        if response.status_code != 200:
            raise ProviderUnavailableError(f"ElevenLabs clone error {response.status_code}: {response.text[:400]}")
        voice_id = response.json().get("voice_id")
        if not voice_id:
            raise ProviderUnavailableError(f"ElevenLabs clone returned no voice_id: {response.text[:300]}")
        return voice_id

    async def delete_voice(self, voice_id: str) -> None:
        async with httpx.AsyncClient(timeout=60) as client:
            await client.delete(f"{API_BASE}/voices/{voice_id}", headers={"xi-api-key": self._api_key})


class ElevenLabsTTS:
    def __init__(self, api_key: str, voice_id: str, composer: FFmpegComposer):
        self._api_key = api_key
        self._voice_id = voice_id
        self._composer = composer

    async def synthesize(self, text: str, out_dir: Path) -> TTSResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = uuid.uuid4().hex[:12]
        mp3_path = out_dir / f"voice_{stem}.mp3"
        wav_path = out_dir / f"voice_{stem}.wav"

        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{API_BASE}/text-to-speech/{self._voice_id}",
                headers={"xi-api-key": self._api_key},
                json={"text": text, "model_id": "eleven_multilingual_v2"},
            )
        if response.status_code == 429:
            raise ProviderRateLimitedError("ElevenLabs rate limited")
        if response.status_code != 200:
            raise ProviderUnavailableError(f"ElevenLabs error {response.status_code}: {response.text[:300]}")

        mp3_path.write_bytes(response.content)
        await self._composer.transcode_audio(mp3_path, wav_path)
        mp3_path.unlink(missing_ok=True)
        duration = await self._composer.media_duration(wav_path)
        return TTSResult(audio_path=wav_path, duration_seconds=duration, voice=self._voice_id)
