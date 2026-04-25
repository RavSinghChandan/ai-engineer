import os
import tempfile
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def generate_pdf(analysis: dict, graph_path: str) -> str:
    """Build a PDF report containing the graph and structured analysis. Returns the file path."""
    pdf_path = os.path.join(tempfile.gettempdir(), "ai_report_output.pdf")

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    base = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=base["Title"],
        fontSize=22,
        textColor=HexColor("#0D47A1"),
        spaceAfter=6,
        alignment=1,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=base["Normal"],
        fontSize=10,
        textColor=HexColor("#757575"),
        spaceAfter=18,
        alignment=1,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=base["Heading2"],
        fontSize=14,
        textColor=HexColor("#1565C0"),
        spaceBefore=14,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=base["BodyText"],
        fontSize=11,
        leading=17,
        spaceAfter=6,
    )

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph(analysis.get("title", "AI Analysis Report"), title_style))
    story.append(
        Paragraph(
            f"Generated on {datetime.now().strftime('%B %d, %Y at %H:%M')}",
            subtitle_style,
        )
    )

    # ── Graph ───────────────────────────────────────────────────────────────
    if os.path.exists(graph_path):
        story.append(Paragraph("Data Visualization", section_style))
        story.append(Image(graph_path, width=6.5 * inch, height=3.5 * inch))
        story.append(Spacer(1, 0.2 * inch))

    # ── Data Table ──────────────────────────────────────────────────────────
    story.append(Paragraph("Data Summary", section_style))

    x_values = analysis.get("x_values", [])
    y_values = analysis.get("y_values", [])
    x_label = analysis.get("x_label", "X")
    y_label = analysis.get("y_label", "Y")

    rows = [[x_label, y_label]] + [
        [str(x), str(y)] for x, y in zip(x_values, y_values)
    ]

    col_w = 3 * inch
    tbl = Table(rows, colWidths=[col_w, col_w])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#0D47A1")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 12),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#E3F2FD"), colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#BDBDBD")),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 0.2 * inch))

    # ── Insights ────────────────────────────────────────────────────────────
    insights = analysis.get("insights", [])
    if insights:
        story.append(Paragraph("Key Insights", section_style))
        for i, insight in enumerate(insights, start=1):
            story.append(Paragraph(f"{i}.&nbsp;&nbsp;{insight}", body_style))

    # ── Footer note ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.3 * inch))
    story.append(
        Paragraph(
            "<i>This report was generated automatically by the AI Report Generator.</i>",
            ParagraphStyle("Footer", parent=base["Normal"], fontSize=9, textColor=HexColor("#9E9E9E"), alignment=1),
        )
    )

    doc.build(story)
    return pdf_path
