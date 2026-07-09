"""Media agents: Voice (TTS), Thumbnail, Video (FFmpeg) and caption generation."""
import re
from pathlib import Path
from typing import Any

from app.agents.base import Agent, AgentContext
from app.agents.content_agents import script_full_text
from app.domain.enums import AgentName, EventType

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def _format_srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    hours, rem = divmod(ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def build_srt(narration: str, total_duration: float) -> str:
    """Distribute sentences across the audio duration proportionally to word count."""
    sentences = [s.strip() for s in _SENTENCE_RE.split(narration) if s.strip()]
    if not sentences:
        return ""
    total_words = sum(len(s.split()) for s in sentences) or 1
    lines: list[str] = []
    cursor = 0.0
    for index, sentence in enumerate(sentences, start=1):
        share = len(sentence.split()) / total_words * total_duration
        start, end = cursor, min(cursor + share, total_duration)
        lines += [str(index), f"{_format_srt_time(start)} --> {_format_srt_time(end)}", sentence, ""]
        cursor = end
    return "\n".join(lines)


class VoiceAgent(Agent):
    name = AgentName.VOICE

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        narration = script_full_text(state["script"])
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Synthesizing narration ({len(narration.split())} words)…",
            None,
        )
        result = await ctx.tts.synthesize(narration, ctx.job_dir)
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Narration audio ready ({result.duration_seconds:.1f}s, voice: {result.voice})",
            {"duration": result.duration_seconds},
        )
        return {
            "voice": {
                "audio_path": str(result.audio_path),
                "duration_seconds": result.duration_seconds,
                "voice": result.voice,
            }
        }


class AvatarAgent(Agent):
    """Renders the creator's avatar speaking the narration audio.

    Which person appears is entirely profile-driven (avatar_id from the
    project's CreatorProfile). With no avatar configured, the step is
    skipped and the pipeline falls back to the slideshow video. If the
    provider fails and the profile does not *require* an avatar, the
    pipeline degrades gracefully instead of failing the whole job.
    """

    name = AgentName.AVATAR

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        profile = ctx.profile
        if ctx.avatar is None or not profile.avatar_id:
            await ctx.emit(
                EventType.AGENT_PROGRESS,
                f"No avatar configured on profile “{profile.name}” — skipping (slideshow fallback)",
                None,
            )
            return {"avatar": {"skipped": True}}

        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Rendering avatar “{profile.avatar_id}” via {profile.avatar_provider} — this takes a few minutes…",
            None,
        )
        try:
            result = await ctx.avatar.render(
                avatar_id=profile.avatar_id,
                audio_path=Path(state["voice"]["audio_path"]),
                out_dir=ctx.job_dir,
                width=ctx.settings.video_width,
                height=ctx.settings.video_height,
            )
        except Exception as exc:
            if profile.avatar_required:
                raise
            await ctx.emit(
                EventType.AGENT_PROGRESS,
                f"Avatar render failed ({exc}) — continuing without avatar",
                None,
            )
            return {"avatar": {"skipped": True, "error": str(exc)}}

        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Avatar video ready ({result.duration_seconds:.1f}s)",
            {"provider_video_id": result.provider_video_id},
        )
        return {
            "avatar": {
                "video_path": str(result.video_path),
                "duration_seconds": result.duration_seconds,
                "provider_video_id": result.provider_video_id,
            }
        }


class ThumbnailAgent(Agent):
    """Designs the thumbnail with an LLM (headline, kicker, colors — honoring the
    creator's instructions) and composites it with the creator's photo."""

    name = AgentName.THUMBNAIL

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        from app.domain.enums import ModelRole
        from app.providers.ports import ThumbnailSpec  # local import avoids cycle at module load

        title = state.get("seo", {}).get("best_title") or state["script"].get("title", state["topic"])
        await ctx.emit(EventType.AGENT_PROGRESS, "Designing thumbnail concept…", None)
        try:
            concept = await self._ask_json(
                ctx,
                ModelRole.SEO_EXPERT,
                {
                    "title": title,
                    "hook": state["script"].get("hook", ""),
                    "topic": state.get("topic", ""),
                    "instructions": state.get("thumbnail_instructions", "") or "(none)",
                },
            )
        except Exception as exc:  # design is nice-to-have; never fail the video for it
            await ctx.emit(EventType.AGENT_PROGRESS, f"Concept LLM failed ({exc}) — using defaults", None)
            concept = {}

        photo = ctx.profile.photo_path
        out_path = ctx.job_dir / "thumbnail.png"
        ctx.thumbnails.render(
            ThumbnailSpec(
                title=title,
                subtitle=state.get("niche", ""),
                headline=concept.get("headline"),
                kicker=concept.get("kicker"),
                bg_from=concept.get("bg_from", "#0f172a"),
                bg_to=concept.get("bg_to", "#1e3a8a"),
                accent=concept.get("accent", "#38bdf8"),
                photo_path=Path(photo) if photo else None,
                out_path=out_path,
                width=ctx.settings.video_width,
                height=ctx.settings.video_height,
            )
        )
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Thumbnail rendered — “{concept.get('headline', title)[:60]}”"
            + (" with your photo" if photo else ""),
            None,
        )
        return {"thumbnail": {"path": str(out_path), "concept": concept}}


class VideoAgent(Agent):
    name = AgentName.VIDEO

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        from app.providers.ports import ComposeSpec  # local import avoids cycle at module load

        narration = script_full_text(state["script"])
        avatar = state.get("avatar") or {}
        avatar_video = avatar.get("video_path")
        duration = avatar.get("duration_seconds") or state["voice"]["duration_seconds"]

        srt_path = ctx.job_dir / "captions.srt"
        srt_path.write_text(build_srt(narration, duration), encoding="utf-8")
        out_path = ctx.job_dir / "final.mp4"

        if avatar_video:
            await ctx.emit(EventType.AGENT_PROGRESS, "Muxing captions onto avatar footage…", None)
            await ctx.composer.mux_subtitles(Path(avatar_video), srt_path, out_path)
            await ctx.emit(EventType.AGENT_PROGRESS, f"Final video composed ({duration:.1f}s)", None)
            return {"video": {"video_path": str(out_path), "srt_path": str(srt_path)}}

        # Audio + text mode: dynamic content slides synced to the narration.
        try:
            slide_count = await self._compose_slide_deck(state, ctx, srt_path, out_path, duration)
            await ctx.emit(
                EventType.AGENT_PROGRESS,
                f"Final video composed: {slide_count} content slides synced to narration ({duration:.1f}s)",
                None,
            )
        except Exception as exc:
            await ctx.emit(
                EventType.AGENT_PROGRESS,
                f"Slide deck failed ({exc}) — falling back to static background",
                None,
            )
            await ctx.composer.compose(
                ComposeSpec(
                    background_image=Path(state["thumbnail"]["path"]),
                    audio_path=Path(state["voice"]["audio_path"]),
                    srt_path=srt_path,
                    out_path=out_path,
                    width=ctx.settings.video_width,
                    height=ctx.settings.video_height,
                    fps=ctx.settings.video_fps,
                )
            )
            await ctx.emit(EventType.AGENT_PROGRESS, f"Final video composed ({duration:.1f}s)", None)
        return {"video": {"video_path": str(out_path), "srt_path": str(srt_path)}}

    async def _design_diagrams(self, state: dict[str, Any], ctx: AgentContext) -> list[dict]:
        """One LLM call: a content-specific diagram spec per slide (never static/templated)."""
        import json

        from app.domain.enums import ModelRole

        script = state["script"]
        slide_summaries = []
        idx = 0
        if (script.get("hook") or "").strip():
            slide_summaries.append({"slide": idx, "heading": "HOOK", "text": script["hook"]})
            idx += 1
        for section in script.get("sections", []):
            slide_summaries.append({"slide": idx, "heading": section.get("heading", ""), "text": section.get("narration", "")})
            idx += 1
        if (script.get("cta") or "").strip():
            slide_summaries.append({"slide": idx, "heading": "CALL TO ACTION", "text": script["cta"]})

        data = await self._ask_json(
            ctx,
            ModelRole.SEO_EXPERT,
            {
                "slides": json.dumps(slide_summaries, ensure_ascii=False),
                "instructions": state.get("thumbnail_instructions", "") or "(none)",
            },
            temperature=0.4,
        )
        diagrams = data.get("diagrams") or []
        return diagrams if isinstance(diagrams, list) else []

    async def _compose_slide_deck(
        self, state: dict[str, Any], ctx: AgentContext, srt_path: Path, out_path: Path, duration: float
    ) -> int:
        from app.providers.media.slides import SlideRenderer

        await ctx.emit(EventType.AGENT_PROGRESS, "Designing per-slide diagrams from your content…", None)
        try:
            diagrams = await self._design_diagrams(state, ctx)
            await ctx.emit(EventType.AGENT_PROGRESS, f"{len(diagrams)} content diagrams designed", None)
        except Exception as exc:  # diagrams enhance slides; never block the video
            await ctx.emit(EventType.AGENT_PROGRESS, f"Diagram design failed ({exc}) — slides without diagrams", None)
            diagrams = []

        await ctx.emit(EventType.AGENT_PROGRESS, "Rendering dynamic content slides…", None)
        concept = (state.get("thumbnail") or {}).get("concept") or {}
        renderer = SlideRenderer(ctx.settings.video_width, ctx.settings.video_height)
        deck = renderer.render_deck(
            ctx.job_dir / "slides",
            state["script"],
            brand=ctx.profile.name if ctx.profile.profile_id else state.get("niche", ""),
            bg_from=concept.get("bg_from", "#0f172a"),
            bg_to=concept.get("bg_to", "#1e3a8a"),
            accent=concept.get("accent", "#38bdf8"),
            diagrams=diagrams,
            presenter_photo=Path(ctx.profile.photo_path) if ctx.profile.photo_path else None,
        )
        if not deck:
            raise ValueError("script produced no slides")
        total_words = sum(slide.word_count for slide in deck) or 1
        timed = [(slide.path, slide.word_count / total_words * duration) for slide in deck]
        await ctx.composer.compose_slides(
            timed,
            Path(state["voice"]["audio_path"]),
            srt_path,
            out_path,
            ctx.settings.video_width,
            ctx.settings.video_height,
            ctx.settings.video_fps,
        )
        return len(deck)
