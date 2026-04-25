import logging
import os
import tempfile
from typing import List, Dict

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

log = logging.getLogger(__name__)

SLIDE_PALETTES = [
    {"bg": "#0D47A1", "accent": "#42A5F5", "text": "#FFFFFF", "num": "#90CAF9"},
    {"bg": "#1B5E20", "accent": "#66BB6A", "text": "#FFFFFF", "num": "#A5D6A7"},
    {"bg": "#4A148C", "accent": "#CE93D8", "text": "#FFFFFF", "num": "#E1BEE7"},
    {"bg": "#BF360C", "accent": "#FF8A65", "text": "#FFFFFF", "num": "#FFCCBC"},
    {"bg": "#006064", "accent": "#4DD0E1", "text": "#FFFFFF", "num": "#B2EBF2"},
    {"bg": "#37474F", "accent": "#90A4AE", "text": "#FFFFFF", "num": "#CFD8DC"},
    {"bg": "#F57F17", "accent": "#FFF176", "text": "#212121", "num": "#FFF9C4"},
]

PAGE_W, PAGE_H = A4


def _wrap_text(text: str, max_chars: int = 44) -> List[str]:
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


def generate_carousel_pdf(slides: List[Dict]) -> str:
    pdf_path = os.path.join(tempfile.gettempdir(), "ai_carousel.pdf")
    c = canvas.Canvas(pdf_path, pagesize=A4)

    for idx, slide in enumerate(slides):
        p       = SLIDE_PALETTES[idx % len(SLIDE_PALETTES)]
        bg      = HexColor(p["bg"])
        accent  = HexColor(p["accent"])
        txt_col = HexColor(p["text"])
        num_col = HexColor(p["num"])

        c.setFillColor(bg)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

        c.setFillColor(accent)
        c.rect(0, PAGE_H - 18, PAGE_W, 18,  fill=1, stroke=0)
        c.rect(0, 0,           PAGE_W, 12,  fill=1, stroke=0)

        # watermark number
        hex_bytes = bytes.fromhex(p["num"].lstrip("#"))
        r, g, b   = hex_bytes[0] / 255, hex_bytes[1] / 255, hex_bytes[2] / 255
        c.setFillColorRGB(r, g, b, alpha=0.18)
        c.setFont("Helvetica-Bold", 120)
        c.drawString(PAGE_W - 175, 42, str(idx + 1))

        # badge
        c.setFillColor(accent)
        c.roundRect(28, PAGE_H - 56, 64, 26, 8, fill=1, stroke=0)
        c.setFillColor(HexColor(p["bg"]))
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(60, PAGE_H - 46, f"{idx + 1} / {len(slides)}")

        # title
        y = PAGE_H - 118
        c.setFillColor(txt_col)
        for line in _wrap_text(slide.get("title", ""), max_chars=28):
            c.setFont("Helvetica-Bold", 34)
            c.drawString(40, y, line)
            y -= 44

        # divider
        c.setStrokeColor(accent)
        c.setLineWidth(3)
        c.line(40, y - 8, PAGE_W - 40, y - 8)
        y -= 36

        # content
        for sentence in (slide.get("content", "") or "").replace("\n", ". ").split(". "):
            sentence = sentence.strip()
            if not sentence:
                continue
            if not sentence.endswith("."):
                sentence += "."
            for wline in _wrap_text(sentence, max_chars=46):
                c.setFont("Helvetica", 19)
                c.setFillColor(txt_col)
                c.drawString(40, y, wline)
                y -= 28
            y -= 8

        # footer
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(PAGE_W / 2, 22, "AI Learning Series  •  Follow for daily insights")

        c.showPage()

    c.save()
    log.info("Carousel PDF saved to %s", pdf_path)
    return pdf_path
