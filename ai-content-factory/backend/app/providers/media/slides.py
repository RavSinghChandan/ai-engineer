"""Dynamic content-slide renderer.

When a video runs without an avatar (audio + text mode), the script is
rendered as a designed slide deck: hook slide, one slide per section with
the narration text as readable lines, and a CTA slide. Slide colors follow
the thumbnail concept so the whole video reads as one brand.

Pillow-only (local-first). Durations are word-proportional and computed by
the caller against the real narration audio length.
"""
import re
import textwrap
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
]
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

_TEXT = (248, 250, 252)
_MUTED = (148, 163, 184)


def _font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in _FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size)


def _hex_to_rgb(value: str, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    value = (value or "").lstrip("#")
    if len(value) != 6:
        return fallback
    try:
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return fallback


@dataclass
class Slide:
    path: Path
    word_count: int


class SlideRenderer:
    """Renders a script into a branded slide deck. One class, no providers."""

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height

    def render_deck(
        self,
        out_dir: Path,
        script: dict,
        *,
        brand: str = "",
        bg_from: str = "#0f172a",
        bg_to: str = "#1e3a8a",
        accent: str = "#38bdf8",
    ) -> list[Slide]:
        out_dir.mkdir(parents=True, exist_ok=True)
        colors = (_hex_to_rgb(bg_from, (15, 23, 42)), _hex_to_rgb(bg_to, (30, 58, 138)), _hex_to_rgb(accent, (56, 189, 248)))

        sections = script.get("sections", [])
        total = len(sections) + 2  # hook + sections + cta
        slides: list[Slide] = []

        hook = (script.get("hook") or "").strip()
        if hook:
            slides.append(self._render(out_dir / "slide_00.png", colors, brand, kicker=script.get("title", "").upper()[:60], heading=None, body=hook, big_body=True, index=1, total=total))

        for number, section in enumerate(sections, start=1):
            narration = (section.get("narration") or "").strip()
            slides.append(
                self._render(
                    out_dir / f"slide_{number:02d}.png",
                    colors,
                    brand,
                    kicker=f"PART {number}",
                    heading=(section.get("heading") or "").strip(),
                    body=narration,
                    big_body=False,
                    index=number + 1,
                    total=total,
                )
            )

        cta = (script.get("cta") or "").strip()
        if cta:
            slides.append(self._render(out_dir / f"slide_{len(sections) + 1:02d}.png", colors, brand, kicker="ONE MORE THING", heading=None, body=cta, big_body=True, index=total, total=total))
        return slides

    def _render(
        self,
        path: Path,
        colors: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]],
        brand: str,
        *,
        kicker: str,
        heading: str | None,
        body: str,
        big_body: bool,
        index: int,
        total: int,
    ) -> Slide:
        bg_from, bg_to, accent = colors
        image = Image.new("RGB", (self.width, self.height))
        draw = ImageDraw.Draw(image)
        for y in range(self.height):
            blend = y / self.height
            draw.line(
                [(0, y), (self.width, y)],
                fill=tuple(int(bg_from[i] + (bg_to[i] - bg_from[i]) * blend) for i in range(3)),
            )

        margin = 90
        draw.rectangle([(0, 0), (14, self.height)], fill=accent)
        y_cursor = 70

        if kicker:
            kicker_font = _font(30)
            draw.text((margin, y_cursor), kicker[:70], font=kicker_font, fill=accent)
            y_cursor += 62

        if heading:
            heading_font = _font(58)
            for line in textwrap.wrap(heading, width=34)[:2]:
                draw.text((margin, y_cursor), line, font=heading_font, fill=_TEXT)
                y_cursor += 72
            y_cursor += 18

        # Body: narration as sentence lines, auto-sized to fit remaining space.
        sentences = [s.strip() for s in _SENTENCE_RE.split(body) if s.strip()]
        available = self.height - y_cursor - 110
        font_size = 44 if big_body else 36
        while font_size >= 24:
            body_font = _font(font_size)
            wrap_width = int((self.width - margin * 2) / (font_size * 0.52))
            lines: list[tuple[str, bool]] = []  # (text, is_sentence_start)
            for sentence in sentences:
                wrapped = textwrap.wrap(sentence, width=wrap_width)
                for j, chunk in enumerate(wrapped):
                    lines.append((chunk, j == 0))
            line_height = int(font_size * 1.42)
            if len(lines) * line_height <= available:
                break
            font_size -= 4
        for text, is_start in lines:
            x = margin if not is_start else margin
            if is_start and not big_body:
                draw.ellipse(
                    [margin - 4, y_cursor + line_height // 2 - 8, margin + 8, y_cursor + line_height // 2 + 4],
                    fill=accent,
                )
                x = margin + 30
            elif not big_body:
                x = margin + 30
            draw.text((x, y_cursor), text, font=body_font, fill=_TEXT if big_body else (226, 232, 240))
            y_cursor += line_height

        # Footer: brand left, progress dots right.
        footer_y = self.height - 62
        if brand:
            draw.text((margin, footer_y), brand, font=_font(26), fill=_MUTED)
        dot_x = self.width - margin - total * 26
        for i in range(total):
            fill = accent if i < index else (71, 85, 105)
            draw.ellipse([dot_x + i * 26, footer_y + 6, dot_x + i * 26 + 12, footer_y + 18], fill=fill)

        image.save(path, "PNG")
        return Slide(path=path, word_count=max(len(body.split()) + len((heading or "").split()), 1))
