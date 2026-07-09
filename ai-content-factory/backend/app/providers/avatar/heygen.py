"""HeyGen avatar adapter.

Flow (all pushed from local — no public URL needed):
  1. upload the narration audio as a HeyGen asset
  2. submit a video-generation job for the profile's avatar_id speaking that audio
  3. poll until completed (renders take minutes)
  4. download the MP4 into the job directory

The avatar_id is always caller-supplied (from a CreatorProfile row) —
nothing about a specific person is hardcoded here.
"""
import asyncio
import mimetypes
from pathlib import Path
from typing import Any

import httpx

from app.core.exceptions import ProviderContentError, ProviderRateLimitedError, ProviderUnavailableError
from app.core.logging import get_logger
from app.providers.media.ffmpeg import FFmpegComposer
from app.providers.ports import AvatarResult

logger = get_logger(__name__)

API_BASE = "https://api.heygen.com"
UPLOAD_BASE = "https://upload.heygen.com"

_POLL_INITIAL_SECONDS = 10
_POLL_MAX_SECONDS = 30
_RENDER_TIMEOUT_SECONDS = 30 * 60  # trial-tier HeyGen renders regularly exceed 15 min
_TERMINAL_FAILURE_STATUSES = {"failed", "error"}
_TRANSPORT_RETRIES = 3


async def _with_transport_retries(request_factory, action: str) -> httpx.Response:
    """Retry transport-level failures (DNS blips, resets) with backoff.

    HTTP-status errors are NOT retried here — callers map those explicitly.
    """
    delay = 2.0
    for attempt in range(1, _TRANSPORT_RETRIES + 1):
        try:
            return await request_factory()
        except httpx.HTTPError as exc:
            if attempt == _TRANSPORT_RETRIES:
                raise ProviderUnavailableError(
                    f"HeyGen {action} network failure after {_TRANSPORT_RETRIES} attempts: {exc}"
                ) from exc
            logger.warning("heygen_transient_error", action=action, attempt=attempt, error=str(exc))
            await asyncio.sleep(delay)
            delay *= 2
    raise ProviderUnavailableError(f"HeyGen {action} failed")  # unreachable


class HeyGenAvatarProvider:
    def __init__(self, api_key: str, composer: FFmpegComposer, talking_photo: bool = False):
        self._api_key = api_key
        self._composer = composer
        self._talking_photo = talking_photo

    def _headers(self) -> dict[str, str]:
        return {"X-Api-Key": self._api_key}

    async def render(self, avatar_id: str, audio_path: Path, out_dir: Path, width: int, height: int) -> AvatarResult:
        async with httpx.AsyncClient(timeout=300) as client:
            audio_asset_id = await self._upload_audio(client, audio_path)
            video_id = await self._submit(client, avatar_id, audio_asset_id, width, height)
            video_url = await self._poll(client, video_id)
            video_path = await self._download(client, video_url, out_dir)
        duration = await self._composer.media_duration(video_path)
        logger.info("heygen_render_done", video_id=video_id, duration=duration)
        return AvatarResult(video_path=video_path, provider_video_id=video_id, duration_seconds=duration)

    async def list_avatars(self) -> list[dict[str, Any]]:
        """Catalog for the dashboard picker (stock + the user's trained avatars)."""
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.get(f"{API_BASE}/v2/avatars", headers=self._headers())
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"HeyGen catalog unreachable: {exc}") from exc
        self._raise_for_status(response, "list avatars")
        avatars = (response.json().get("data") or {}).get("avatars") or []
        return [
            {
                "avatar_id": a.get("avatar_id"),
                "name": a.get("avatar_name"),
                "gender": a.get("gender"),
                "preview_image_url": a.get("preview_image_url"),
                "premium": a.get("premium", False),
            }
            for a in avatars
        ]

    async def create_talking_photo(self, image_path: Path) -> str:
        """Upload a face image → talking_photo_id usable as an avatar."""
        content_type = mimetypes.guess_type(image_path.name)[0] or "image/png"
        content = image_path.read_bytes()

        async def do_request() -> httpx.Response:
            async with httpx.AsyncClient(timeout=180) as client:
                return await client.post(
                    f"{UPLOAD_BASE}/v1/talking_photo",
                    headers={**self._headers(), "Content-Type": content_type},
                    content=content,
                )

        response = await _with_transport_retries(do_request, "talking-photo upload")
        self._raise_for_status(response, "talking-photo upload")
        photo_id = (response.json().get("data") or {}).get("talking_photo_id")
        if not photo_id:
            raise ProviderContentError(f"HeyGen returned no talking_photo_id: {response.text[:300]}")
        return photo_id

    async def _upload_audio(self, client: httpx.AsyncClient, audio_path: Path) -> str:
        content_type = mimetypes.guess_type(audio_path.name)[0] or "audio/x-wav"
        content = audio_path.read_bytes()
        response = await _with_transport_retries(
            lambda: client.post(
                f"{UPLOAD_BASE}/v1/asset",
                headers={**self._headers(), "Content-Type": content_type},
                content=content,
            ),
            "upload audio",
        )
        self._raise_for_status(response, "upload audio")
        asset_id = (response.json().get("data") or {}).get("id")
        if not asset_id:
            raise ProviderContentError(f"HeyGen upload returned no asset id: {response.text[:300]}")
        return asset_id

    async def _submit(
        self, client: httpx.AsyncClient, avatar_id: str, audio_asset_id: str, width: int, height: int
    ) -> str:
        character = (
            {"type": "talking_photo", "talking_photo_id": avatar_id}
            if self._talking_photo
            else {"type": "avatar", "avatar_id": avatar_id, "avatar_style": "normal"}
        )
        payload = {
            "video_inputs": [
                {
                    "character": character,
                    "voice": {"type": "audio", "audio_asset_id": audio_asset_id},
                }
            ],
            "dimension": {"width": width, "height": height},
        }
        response = await _with_transport_retries(
            lambda: client.post(f"{API_BASE}/v2/video/generate", headers=self._headers(), json=payload),
            "submit render",
        )
        self._raise_for_status(response, "submit render")
        video_id = (response.json().get("data") or {}).get("video_id")
        if not video_id:
            raise ProviderContentError(f"HeyGen generate returned no video_id: {response.text[:300]}")
        return video_id

    async def _poll(self, client: httpx.AsyncClient, video_id: str) -> str:
        elapsed, delay = 0.0, float(_POLL_INITIAL_SECONDS)
        while elapsed < _RENDER_TIMEOUT_SECONDS:
            try:
                response = await client.get(
                    f"{API_BASE}/v1/video_status.get", headers=self._headers(), params={"video_id": video_id}
                )
            except httpx.HTTPError as exc:
                # Transient network blip mid-render: keep polling, the render continues server-side.
                logger.warning("heygen_poll_transient_error", error=str(exc))
                await asyncio.sleep(delay)
                elapsed += delay
                continue
            self._raise_for_status(response, "poll status")
            data = response.json().get("data") or {}
            status = data.get("status")
            if status == "completed":
                video_url = data.get("video_url")
                if not video_url:
                    raise ProviderContentError("HeyGen reports completed but returned no video_url")
                return video_url
            if status in _TERMINAL_FAILURE_STATUSES:
                error = data.get("error") or {}
                raise ProviderUnavailableError(f"HeyGen render failed: {error.get('message') or error or status}")
            await asyncio.sleep(delay)
            elapsed += delay
            delay = min(delay * 1.5, _POLL_MAX_SECONDS)
        raise ProviderUnavailableError(f"HeyGen render timed out after {_RENDER_TIMEOUT_SECONDS}s")

    async def _download(self, client: httpx.AsyncClient, video_url: str, out_dir: Path) -> Path:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "avatar.mp4"
        async with client.stream("GET", video_url) as response:
            response.raise_for_status()
            with out_path.open("wb") as file:
                async for chunk in response.aiter_bytes():
                    file.write(chunk)
        return out_path

    @staticmethod
    def _raise_for_status(response: httpx.Response, action: str) -> None:
        if response.status_code == 429:
            raise ProviderRateLimitedError(f"HeyGen rate limited during {action}")
        if response.status_code >= 400:
            raise ProviderUnavailableError(
                f"HeyGen {action} failed ({response.status_code}): {response.text[:300]}"
            )
