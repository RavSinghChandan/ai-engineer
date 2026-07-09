"""Thumbnail renderer — Pillow-composited YouTube thumbnail.

v2 design: creator's photo on the right with a soft fade into a dark
gradient, a huge 3-5 word headline with outline on the left, a small
accent "kicker" badge. Concept (words + colors) comes from the Thumbnail
agent's LLM call; this module only renders. An image-generation provider
can replace this behind ThumbnailPort when a key is available.
"""
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

from app.providers.ports import ThumbnailSpec

_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
]

_TEXT = (255, 255, 255)


def _load_font(size: int) -> ImageFont.FreeTypeFont:
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


class PillowThumbnailRenderer:
    def render(self, spec: ThumbnailSpec) -> Path:
        bg_from = _hex_to_rgb(spec.bg_from, (15, 23, 42))
        bg_to = _hex_to_rgb(spec.bg_to, (30, 58, 138))
        accent = _hex_to_rgb(spec.accent, (56, 189, 248))

        image = Image.new("RGB", (spec.width, spec.height))
        draw = ImageDraw.Draw(image)
        for y in range(spec.height):
            blend = y / spec.height
            color = tuple(int(bg_from[i] + (bg_to[i] - bg_from[i]) * blend) for i in range(3))
            draw.line([(0, y), (spec.width, y)], fill=color)

        text_right_edge = spec.width - 60
        if spec.photo_path and Path(spec.photo_path).exists():
            text_right_edge = self._paste_photo_right(image, Path(spec.photo_path), spec)

        draw = ImageDraw.Draw(image)

        # Kicker badge (small accent label, top-left)
        kicker = (spec.kicker or "").strip().upper()
        text_x = 64
        y_cursor = 80
        if kicker:
            kicker_font = _load_font(34)
            pad = 14
            box = draw.textbbox((0, 0), kicker, font=kicker_font)
            draw.rounded_rectangle(
                [text_x, y_cursor, text_x + (box[2] - box[0]) + pad * 2, y_cursor + (box[3] - box[1]) + pad * 2],
                radius=10,
                fill=accent,
            )
            draw.text((text_x + pad, y_cursor + pad - box[1]), kicker, font=kicker_font, fill=(10, 10, 20))
            y_cursor += (box[3] - box[1]) + pad * 2 + 36

        # Headline — huge, wrapped to the text column, black outline for pop
        headline = (spec.headline or spec.title).strip().upper()
        column_width = max(text_right_edge - text_x, 400)
        font_size = 110
        headline_font = _load_font(font_size)
        wrap_chars = max(int(column_width / (font_size * 0.52)), 8)
        lines = textwrap.wrap(headline, width=wrap_chars)[:4]
        while len(lines) > 3 and font_size > 64:
            font_size -= 12
            headline_font = _load_font(font_size)
            wrap_chars = max(int(column_width / (font_size * 0.52)), 8)
            lines = textwrap.wrap(headline, width=wrap_chars)[:4]
        for line in lines:
            draw.text(
                (text_x, y_cursor),
                line,
                font=headline_font,
                fill=_TEXT,
                stroke_width=max(font_size // 18, 3),
                stroke_fill=(0, 0, 0),
            )
            y_cursor += int(font_size * 1.18)

        # Subtitle under the headline
        if spec.subtitle:
            subtitle_font = _load_font(36)
            draw.text(
                (text_x, y_cursor + 16),
                textwrap.shorten(spec.subtitle, 46),
                font=subtitle_font,
                fill=accent,
            )

        # Accent baseline bar
        draw.rectangle([(0, spec.height - 16), (spec.width, spec.height)], fill=accent)

        spec.out_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(spec.out_path, "PNG")
        return spec.out_path

    @staticmethod
    def _paste_photo_right(canvas: Image.Image, photo_path: Path, spec: ThumbnailSpec) -> int:
        """Paste the creator's photo on the right 45% with a soft left fade. Returns text column right edge."""
        photo = Image.open(photo_path).convert("RGB")
        target_width = int(spec.width * 0.45)
        scale = spec.height / photo.height
        photo = photo.resize((int(photo.width * scale), spec.height))
        if photo.width > target_width:
            photo = photo.crop((int((photo.width - target_width) / 2), 0, int((photo.width + target_width) / 2), spec.height))
        photo = ImageEnhance.Contrast(photo).enhance(1.08)

        fade_width = int(photo.width * 0.45)
        mask = Image.new("L", photo.size, 255)
        mask_draw = ImageDraw.Draw(mask)
        for x in range(fade_width):
            mask_draw.line([(x, 0), (x, photo.height)], fill=int(255 * x / fade_width))

        paste_x = spec.width - photo.width
        canvas.paste(photo, (paste_x, 0), mask)
        return paste_x + int(fade_width * 0.4)
