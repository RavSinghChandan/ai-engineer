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


def _shorten(label: str, limit: int = 22) -> str:
    label = str(label).strip()
    return label if len(label) <= limit else label[: limit - 1] + "…"


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
        diagrams: list[dict] | None = None,
    ) -> list[Slide]:
        """`diagrams` is an LLM-designed, content-specific spec per slide index —
        every slide gets its own diagram derived from what it actually says."""
        out_dir.mkdir(parents=True, exist_ok=True)
        colors = (_hex_to_rgb(bg_from, (15, 23, 42)), _hex_to_rgb(bg_to, (30, 58, 138)), _hex_to_rgb(accent, (56, 189, 248)))
        diagram_by_index: dict[int, dict] = {
            int(d.get("slide", -1)): d for d in (diagrams or []) if isinstance(d, dict)
        }

        sections = script.get("sections", [])
        total = len(sections) + 2  # hook + sections + cta
        slides: list[Slide] = []
        slide_index = 0

        hook = (script.get("hook") or "").strip()
        if hook:
            slides.append(self._render(out_dir / "slide_00.png", colors, brand, kicker=script.get("title", "").upper()[:60], heading=None, body=hook, big_body=True, index=1, total=total, diagram=diagram_by_index.get(slide_index)))
            slide_index += 1

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
                    diagram=diagram_by_index.get(slide_index),
                )
            )
            slide_index += 1

        cta = (script.get("cta") or "").strip()
        if cta:
            slides.append(self._render(out_dir / f"slide_{len(sections) + 1:02d}.png", colors, brand, kicker="ONE MORE THING", heading=None, body=cta, big_body=True, index=total, total=total, diagram=diagram_by_index.get(slide_index)))
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
        diagram: dict | None = None,
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
        y_cursor = 56

        if kicker:
            kicker_font = _font(28)
            draw.text((margin, y_cursor), kicker[:70], font=kicker_font, fill=accent)
            y_cursor += 54

        if heading:
            heading_font = _font(52)
            for line in textwrap.wrap(heading, width=38)[:2]:
                draw.text((margin, y_cursor), line, font=heading_font, fill=_TEXT)
                y_cursor += 64
            y_cursor += 10

        # Content-specific diagram (LLM-designed per slide) above the text.
        has_diagram = bool(diagram) and diagram.get("type") not in (None, "", "none")
        if has_diagram:
            diagram_height = 250 if not big_body else 230
            self._draw_diagram(
                draw,
                diagram,
                x0=margin,
                y0=y_cursor,
                x1=self.width - margin,
                y1=y_cursor + diagram_height,
                accent=accent,
            )
            y_cursor += diagram_height + 26

        # Body: narration as sentence lines, auto-sized to fit remaining space.
        sentences = [s.strip() for s in _SENTENCE_RE.split(body) if s.strip()]
        available = self.height - y_cursor - 100
        font_size = (40 if big_body else 34) if has_diagram else (44 if big_body else 36)
        while font_size >= 20:
            body_font = _font(font_size)
            wrap_width = int((self.width - margin * 2) / (font_size * 0.52))
            lines: list[tuple[str, bool]] = []  # (text, is_sentence_start)
            for sentence in sentences:
                wrapped = textwrap.wrap(sentence, width=wrap_width)
                for j, chunk in enumerate(wrapped):
                    lines.append((chunk, j == 0))
            line_height = int(font_size * 1.38)
            if len(lines) * line_height <= available:
                break
            font_size -= 4
        for text, is_start in lines:
            x = margin
            if not big_body:
                if is_start:
                    draw.ellipse(
                        [margin - 4, y_cursor + line_height // 2 - 8, margin + 8, y_cursor + line_height // 2 + 4],
                        fill=accent,
                    )
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

    # ---------- diagram drawing (content-specific, LLM-designed specs) ----------

    def _draw_diagram(self, draw: ImageDraw.ImageDraw, spec: dict, *, x0: int, y0: int, x1: int, y1: int, accent: tuple[int, int, int]) -> None:
        kind = str(spec.get("type", "")).lower()
        panel = (30, 41, 59)  # slate-800-ish panel over the gradient
        title = _shorten(spec.get("title", ""), 60)
        if title:
            draw.text(((x0 + x1) // 2, y0), title, font=_font(24), fill=(203, 213, 225), anchor="ma")
            y0 += 42
        if kind == "flow":
            self._diagram_flow(draw, spec, x0, y0, x1, y1, accent, panel)
        elif kind == "steps":
            self._diagram_steps(draw, spec, x0, y0, x1, y1, accent, panel)
        elif kind == "comparison":
            self._diagram_comparison(draw, spec, x0, y0, x1, y1, accent, panel)
        else:  # pillars / anything else with items
            self._diagram_pillars(draw, spec, x0, y0, x1, y1, accent, panel)

    @staticmethod
    def _boxed_label(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int], label: str, accent, panel, font_size: int = 26) -> None:
        draw.rounded_rectangle(rect, radius=14, fill=panel, outline=accent, width=3)
        cx, cy = (rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2
        lines = textwrap.wrap(label, width=max(int((rect[2] - rect[0]) / (font_size * 0.6)), 6))[:2]
        line_height = int(font_size * 1.15)
        start_y = cy - (len(lines) * line_height) // 2 + 2
        for i, line in enumerate(lines):
            draw.text((cx, start_y + i * line_height), line, font=_font(font_size), fill=_TEXT, anchor="ma")

    def _diagram_flow(self, draw, spec, x0, y0, x1, y1, accent, panel) -> None:
        items = [_shorten(i) for i in (spec.get("items") or [])][:5] or ["…"]
        n = len(items)
        gap = 48
        box_w = min(230, (x1 - x0 - gap * (n - 1)) // n)
        box_h = min(96, y1 - y0)
        total_w = box_w * n + gap * (n - 1)
        start_x = x0 + (x1 - x0 - total_w) // 2
        cy = (y0 + y1) // 2
        for i, item in enumerate(items):
            bx = start_x + i * (box_w + gap)
            self._boxed_label(draw, (bx, cy - box_h // 2, bx + box_w, cy + box_h // 2), item, accent, panel)
            if i < n - 1:
                ax0, ax1 = bx + box_w + 8, bx + box_w + gap - 8
                draw.line([(ax0, cy), (ax1 - 10, cy)], fill=accent, width=5)
                draw.polygon([(ax1, cy), (ax1 - 14, cy - 9), (ax1 - 14, cy + 9)], fill=accent)

    def _diagram_steps(self, draw, spec, x0, y0, x1, y1, accent, panel) -> None:
        items = [_shorten(i, 46) for i in (spec.get("items") or [])][:4] or ["…"]
        n = len(items)
        row_h = min(58, (y1 - y0 - (n - 1) * 14) // n)
        width = min(640, x1 - x0)
        start_x = x0 + (x1 - x0 - width) // 2
        y = y0 + (y1 - y0 - (row_h * n + 14 * (n - 1))) // 2
        for i, item in enumerate(items, start=1):
            cy = y + row_h // 2
            draw.ellipse([start_x, cy - 22, start_x + 44, cy + 22], fill=accent)
            draw.text((start_x + 22, cy), str(i), font=_font(26), fill=(10, 10, 20), anchor="mm")
            self._boxed_label(draw, (start_x + 64, y, start_x + width, y + row_h), item, accent, panel, font_size=24)
            if i < n:
                draw.line([(start_x + 22, cy + 24), (start_x + 22, cy + row_h - 8)], fill=accent, width=4)
            y += row_h + 14

    def _diagram_pillars(self, draw, spec, x0, y0, x1, y1, accent, panel) -> None:
        items = [_shorten(i) for i in (spec.get("items") or [])][:4] or ["…"]
        n = len(items)
        gap = 40
        col_w = min(260, (x1 - x0 - gap * (n - 1)) // n)
        col_h = y1 - y0 - 10
        total_w = col_w * n + gap * (n - 1)
        start_x = x0 + (x1 - x0 - total_w) // 2
        for i, item in enumerate(items):
            bx = start_x + i * (col_w + gap)
            draw.rounded_rectangle([bx, y0, bx + col_w, y0 + col_h], radius=16, fill=panel, outline=accent, width=3)
            draw.rectangle([bx, y0, bx + col_w, y0 + 12], fill=accent)
            lines = textwrap.wrap(item, width=max(int(col_w / 15), 6))[:3]
            start_y = y0 + col_h // 2 - len(lines) * 16
            for j, line in enumerate(lines):
                draw.text((bx + col_w // 2, start_y + j * 32), line, font=_font(25), fill=_TEXT, anchor="ma")

    def _diagram_comparison(self, draw, spec, x0, y0, x1, y1, accent, panel) -> None:
        half = (x1 - x0 - 90) // 2
        sides = [
            (x0, spec.get("left_title", "A"), spec.get("left_items") or spec.get("items") or []),
            (x1 - half, spec.get("right_title", "B"), spec.get("right_items") or []),
        ]
        for sx, side_title, side_items in sides:
            draw.rounded_rectangle([sx, y0, sx + half, y1], radius=16, fill=panel, outline=accent, width=3)
            draw.text((sx + half // 2, y0 + 12), _shorten(str(side_title), 24), font=_font(28), fill=accent, anchor="ma")
            iy = y0 + 58
            for item in [str(i) for i in side_items][:3]:
                draw.ellipse([sx + 24, iy + 8, sx + 34, iy + 18], fill=accent)
                draw.text((sx + 48, iy), _shorten(item, 34), font=_font(23), fill=_TEXT)
                iy += 40
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        draw.ellipse([cx - 32, cy - 32, cx + 32, cy + 32], fill=accent)
        draw.text((cx, cy), "VS", font=_font(26), fill=(10, 10, 20), anchor="mm")
