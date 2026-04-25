import logging
import os
import tempfile
from datetime import datetime
from typing import Dict, Any, Optional

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle, HRFlowable,
)

log = logging.getLogger(__name__)

PAGE_W, PAGE_H = letter
MARGIN = 0.75 * inch


def _scale_image(path: str, max_w: float, max_h: float) -> Optional[Image]:
    """Return an Image flowable scaled to fit within max_w × max_h.
    Returns None if the file cannot be read (wrong format, corrupted, etc.)."""
    try:
        img = Image(path)
        iw, ih = img.imageWidth, img.imageHeight
        if not iw or not ih:
            log.warning("Image %s has zero dimensions — skipping.", path)
            return None
        scale = min(max_w / iw, max_h / ih, 1.0)
        img.drawWidth  = iw * scale
        img.drawHeight = ih * scale
        return img
    except Exception as exc:
        log.warning("Could not load image '%s': %s — skipping.", path, exc)
        return None


def generate_pdf(
    analysis: Dict[str, Any],
    graph_path: str,
    logo_path: Optional[str]    = None,
    profile_path: Optional[str] = None,
    author_name: str            = "",
) -> str:
    pdf_path = os.path.join(tempfile.gettempdir(), "ai_report_output.pdf")

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=MARGIN,   bottomMargin=MARGIN,
    )

    base = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle", parent=base["Title"],
        fontSize=22, textColor=HexColor("#0D47A1"),
        spaceAfter=4, alignment=0,
    )
    meta_style = ParagraphStyle(
        "Meta", parent=base["Normal"],
        fontSize=9, textColor=HexColor("#757575"), spaceAfter=0,
    )
    section_style = ParagraphStyle(
        "Section", parent=base["Heading2"],
        fontSize=13, textColor=HexColor("#1565C0"),
        spaceBefore=12, spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body", parent=base["BodyText"],
        fontSize=11, leading=17, spaceAfter=5,
    )
    footer_style = ParagraphStyle(
        "Footer", parent=base["Normal"],
        fontSize=9, textColor=HexColor("#9E9E9E"), alignment=1,
    )
    author_style = ParagraphStyle(
        "Author", parent=base["Normal"],
        fontSize=11, textColor=HexColor("#2D3748"), leading=16,
    )

    story = []
    content_w = PAGE_W - 2 * MARGIN   # usable width

    # ── Header row: title + logo ──────────────────────────────────────────
    title_cell = [
        Paragraph(analysis.get("title", "AI Analysis Report"), title_style),
        Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y  %H:%M')}", meta_style),
    ]
    logo_img = _scale_image(logo_path, max_w=1.6 * inch, max_h=0.7 * inch) \
               if (logo_path and os.path.exists(logo_path)) else None

    if logo_img:
        logo_img.hAlign = "RIGHT"
        header_data  = [[title_cell, logo_img]]
        header_table = Table(
            header_data,
            colWidths=[content_w - 1.8 * inch, 1.8 * inch],
        )
        header_table.setStyle(TableStyle([
            ("VALIGN",  (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",   (1, 0), (1, 0),  "RIGHT"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
    else:
        for item in title_cell:
            story.append(item)

    story.append(HRFlowable(width="100%", thickness=1.5, color=HexColor("#1565C0"), spaceAfter=10))

    # ── Graph ─────────────────────────────────────────────────────────────
    if os.path.exists(graph_path):
        graph_img = _scale_image(graph_path, max_w=content_w, max_h=3.4 * inch)
        if graph_img:
            story.append(Paragraph("Data Visualization", section_style))
            graph_img.hAlign = "CENTER"
            story.append(graph_img)
            story.append(Spacer(1, 0.15 * inch))

    # ── Data table ────────────────────────────────────────────────────────
    x_vals  = analysis.get("x_values", [])
    y_vals  = analysis.get("y_values", [])
    x_label = analysis.get("x_label", "X")
    y_label = analysis.get("y_label", "Y")

    story.append(Paragraph("Data Summary", section_style))
    rows = [[x_label, y_label]] + [[str(x), str(y)] for x, y in zip(x_vals, y_vals)]
    col_w = content_w / 2
    tbl = Table(rows, colWidths=[col_w, col_w])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0),  HexColor("#0D47A1")),
        ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0),  11),
        ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS",(0,1), (-1, -1), [HexColor("#E3F2FD"), colors.white]),
        ("GRID",         (0, 0), (-1, -1), 0.5, HexColor("#BDBDBD")),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.15 * inch))

    # ── Insights ──────────────────────────────────────────────────────────
    insights = analysis.get("insights", [])
    if insights:
        story.append(Paragraph("Key Insights", section_style))
        for i, insight in enumerate(insights, start=1):
            story.append(Paragraph(f"{i}.&nbsp;&nbsp;{insight}", body_style))

    # ── Author / profile footer ───────────────────────────────────────────
    story.append(Spacer(1, 0.25 * inch))
    story.append(HRFlowable(width="100%", thickness=0.8, color=HexColor("#BDBDBD"), spaceAfter=10))

    has_author  = bool(author_name.strip())
    profile_img = _scale_image(profile_path, max_w=0.55 * inch, max_h=0.55 * inch) \
                  if (profile_path and os.path.exists(profile_path)) else None

    if profile_img or has_author:
        profile_cell: Any = profile_img if profile_img else ""

        name_lines = []
        if has_author:
            name_lines.append(Paragraph(f"<b>Prepared by:</b> {author_name}", author_style))
        name_lines.append(Paragraph("<i>Generated with AI Report Generator</i>", footer_style))

        footer_data  = [[profile_cell, name_lines]]
        footer_table = Table(
            footer_data,
            colWidths=[0.7 * inch, content_w - 0.7 * inch],
        )
        footer_table.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ]))
        story.append(footer_table)
    else:
        story.append(
            Paragraph("<i>Generated with AI Report Generator</i>", footer_style)
        )

    doc.build(story)
    log.info("PDF saved to %s  (%d bytes)", pdf_path, os.path.getsize(pdf_path))
    return pdf_path
