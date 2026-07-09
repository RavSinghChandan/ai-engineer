"""FFmpeg adapter — audio transcoding, media probing, final video composition."""
import asyncio
import json
from pathlib import Path

from app.core.exceptions import ProviderUnavailableError
from app.core.logging import get_logger
from app.providers.ports import ComposeSpec

logger = get_logger(__name__)


async def _run(*args: str, cwd: Path | None = None) -> tuple[bytes, bytes]:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=cwd
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        raise ProviderUnavailableError(f"{args[0]} failed: {stderr.decode()[-800:]}")
    return stdout, stderr


class FFmpegComposer:
    async def transcode_audio(self, src: Path, dst: Path) -> Path:
        await _run("ffmpeg", "-y", "-i", str(src), "-ar", "44100", "-ac", "2", str(dst))
        return dst

    async def media_duration(self, path: Path) -> float:
        stdout, _ = await _run(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)
        )
        info = json.loads(stdout.decode())
        return float(info["format"]["duration"])

    async def transcode_to_mp3(self, src: Path, dst: Path) -> Path:
        """Normalize any recorded/uploaded audio (webm/m4a/wav…) to clean mp3."""
        await _run("ffmpeg", "-y", "-i", str(src), "-vn", "-ar", "44100", "-b:a", "192k", str(dst))
        return dst

    async def extract_frame(self, video: Path, out_png: Path, at_seconds: float = 1.0) -> Path:
        out_png.parent.mkdir(parents=True, exist_ok=True)
        await _run("ffmpeg", "-y", "-ss", str(at_seconds), "-i", str(video), "-frames:v", "1", str(out_png))
        return out_png

    async def compose_slides(
        self,
        slides: list[tuple[Path, float]],
        audio_path: Path,
        srt_path: Path | None,
        out_path: Path,
        width: int,
        height: int,
        fps: int,
    ) -> Path:
        """Timed slide deck + narration audio + soft subtitles → MP4.

        Uses the concat demuxer with explicit per-slide durations so slides
        change exactly in sync with the narration.
        """
        out_path.parent.mkdir(parents=True, exist_ok=True)
        list_path = out_path.parent / "slides_concat.txt"
        lines = []
        for slide_path, duration in slides:
            lines.append(f"file '{slide_path}'")
            lines.append(f"duration {max(duration, 0.5):.3f}")
        lines.append(f"file '{slides[-1][0]}'")  # concat spec: repeat last frame
        list_path.write_text("\n".join(lines), encoding="utf-8")

        with_subs = srt_path is not None and srt_path.exists()
        args: list[str] = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_path), "-i", str(audio_path)]
        if with_subs:
            args += ["-i", str(srt_path), "-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:s", "mov_text"]
        args += [
            "-vf", f"scale={width}:{height},format=yuv420p",
            "-r", str(fps),
            "-c:v", "libx264",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(out_path),
        ]
        await _run(*args)
        logger.info("slides_composed", out=str(out_path), slides=len(slides))
        return out_path

    async def mux_subtitles(self, video: Path, srt: Path, out_path: Path) -> Path:
        """Remux an existing video with a soft mov_text subtitle track (no re-encode of video)."""
        out_path.parent.mkdir(parents=True, exist_ok=True)
        await _run(
            "ffmpeg", "-y",
            "-i", str(video), "-i", str(srt),
            "-map", "0:v", "-map", "0:a?", "-map", "1:s",
            "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
            str(out_path),
        )
        return out_path

    async def compose(self, spec: ComposeSpec) -> Path:
        """Still background + narration audio + soft subtitle track → MP4.

        Subtitles are muxed as a mov_text stream (not burned in): Homebrew's
        ffmpeg ships without libass, and platforms like YouTube want captions
        as a separate track/file anyway. The raw .srt stays a job asset.
        """
        spec.out_path.parent.mkdir(parents=True, exist_ok=True)
        with_subs = spec.srt_path is not None and spec.srt_path.exists()
        args: list[str] = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", str(spec.background_image),
            "-i", str(spec.audio_path),
        ]
        if with_subs:
            args += ["-i", str(spec.srt_path), "-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:s", "mov_text"]
        args += [
            "-vf", f"scale={spec.width}:{spec.height}",
            "-r", str(spec.fps),
            "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(spec.out_path),
        ]
        await _run(*args)
        logger.info("video_composed", out=str(spec.out_path), subtitles=with_subs)
        return spec.out_path
