import os
import tempfile

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas

# Palette — alternates across slides
SLIDE_PALETTES = [
    {"bg": "#0D47A1", "accent": "#42A5F5", "text": "#FFFFFF", "num": "#90CAF9"},  # deep blue
    {"bg": "#1B5E20", "accent": "#66BB6A", "text": "#FFFFFF", "num": "#A5D6A7"},  # green
    {"bg": "#4A148C", "accent": "#CE93D8", "text": "#FFFFFF", "num": "#E1BEE7"},  # purple
    {"bg": "#BF360C", "accent": "#FF8A65", "text": "#FFFFFF", "num": "#FFCCBC"},  # orange
    {"bg": "#006064", "accent": "#4DD0E1", "text": "#FFFFFF", "num": "#B2EBF2"},  # teal
    {"bg": "#37474F", "accent": "#90A4AE", "text": "#FFFFFF", "num": "#CFD8DC"},  # slate
    {"bg": "#F57F17", "accent": "#FFF176", "text": "#212121", "num": "#FFF9C4"},  # yellow (CTA)
]

PAGE_W, PAGE_H = A4  # 595 x 842 pts


def _wrap_text(text: str, max_chars: int = 42) -> list[str]:
    """Naively wrap text to lines of max_chars without splitting words."""
    words = text.split()
    lines, current = [], []
    for w in words:
        if sum(len(x) for x in current) + len(current) + len(w) <= max_chars:
            current.append(w)
        else:
            if current:
                lines.append(" ".join(current))
            current = [w]
    if current:
        lines.append(" ".join(current))
    return lines


def generate_carousel_pdf(slides: list[dict]) -> str:
    """Render a LinkedIn-style carousel PDF. Each slide = one full A4 page."""
    pdf_path = os.path.join(tempfile.gettempdir(), "ai_carousel.pdf")
    c = canvas.Canvas(pdf_path, pagesize=A4)

    for idx, slide in enumerate(slides):
        palette = SLIDE_PALETTES[idx % len(SLIDE_PALETTES)]
        bg      = HexColor(palette["bg"])
        accent  = HexColor(palette["accent"])
        txt_col = HexColor(palette["text"])
        num_col = HexColor(palette["num"])

        # ── Background ──────────────────────────────────────
        c.setFillColor(bg)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

        # ── Accent stripe (top) ──────────────────────────────
        c.setFillColor(accent)
        c.rect(0, PAGE_H - 18, PAGE_W, 18, fill=1, stroke=0)

        # ── Accent stripe (bottom) ───────────────────────────
        c.rect(0, 0, PAGE_W, 12, fill=1, stroke=0)

        # ── Slide number (big watermark) ─────────────────────
        c.setFillColor(num_col)
        c.setFont("Helvetica-Bold", 120)
        c.setFillColorRGB(*[x / 255 for x in bytes.fromhex(palette["num"].lstrip("#"))], alpha=0.18)
        c.drawString(PAGE_W - 180, 40, str(idx + 1))

        # ── Slide counter badge (top-left) ───────────────────
        c.setFillColor(accent)
        c.roundRect(28, PAGE_H - 56, 64, 26, 8, fill=1, stroke=0)
        c.setFillColor(HexColor(palette["bg"]))
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(60, PAGE_H - 46, f"{idx + 1} / {len(slides)}")

        # ── Title ────────────────────────────────────────────
        title = slide.get("title", "")
        title_lines = _wrap_text(title, max_chars=30)
        c.setFillColor(txt_col)
        y = PAGE_H - 120
        for line in title_lines:
            c.setFont("Helvetica-Bold", 34)
            c.drawString(40, y, line)
            y -= 44

        # ── Divider ──────────────────────────────────────────
        c.setStrokeColor(accent)
        c.setLineWidth(3)
        c.line(40, y - 10, PAGE_W - 40, y - 10)
        y -= 40

        # ── Content ──────────────────────────────────────────
        content = slide.get("content", "")
        # Split on ". " or "\n" to get sentences/lines
        raw_lines = []
        for part in content.replace("\n", ". ").split(". "):
            part = part.strip()
            if part:
                raw_lines.append(part if part.endswith(".") else part + ".")

        for sentence in raw_lines:
            wrapped = _wrap_text(sentence, max_chars=46)
            for wline in wrapped:
                c.setFont("Helvetica", 19)
                c.setFillColor(txt_col)
                c.drawString(40, y, wline)
                y -= 28
            y -= 8  # extra gap between sentences

        # ── Branding footer ──────────────────────────────────
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(PAGE_W / 2, 24, "AI Learning Series  •  Follow for daily insights")

        c.showPage()

    c.save()
    return pdf_path
