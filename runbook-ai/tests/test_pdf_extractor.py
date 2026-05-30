"""Tests for PDF extractor — uses an in-memory PDF built with reportlab."""
import io
import pytest

try:
    from reportlab.pdfgen import canvas as rl_canvas
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

from extractor.pdf_extractor import extract_pdf_bytes, _clean_text


def _make_pdf(text: str) -> bytes:
    """Create a minimal in-memory PDF with the given text."""
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf)
    y = 750
    for line in text.split("\n"):
        c.drawString(50, y, line)
        y -= 20
        if y < 50:
            c.showPage()
            y = 750
    c.save()
    return buf.getvalue()


@pytest.mark.skipif(not HAS_REPORTLAB, reason="reportlab not installed")
def test_extract_basic_text():
    pdf = _make_pdf("Step 1: Check pod status\nkubectl get pods -n default")
    doc = extract_pdf_bytes("test.pdf", pdf)
    assert "kubectl" in doc.full_text
    assert doc.filename == "test.pdf"
    assert doc.total_pages >= 1


@pytest.mark.skipif(not HAS_REPORTLAB, reason="reportlab not installed")
def test_extract_multipage():
    long_text = "\n".join([f"Line {i}: some content here" for i in range(100)])
    pdf = _make_pdf(long_text)
    doc = extract_pdf_bytes("multipage.pdf", pdf)
    assert doc.total_pages >= 1
    assert len(doc.pages) >= 1


def test_clean_text_strips_whitespace():
    result = _clean_text("  hello   world  ")
    assert result == "hello world"


def test_clean_text_fixes_hyphenation():
    result = _clean_text("config- uration")
    assert result == "configuration"


def test_extract_missing_file_raises():
    from extractor.pdf_extractor import extract_pdf
    with pytest.raises(FileNotFoundError):
        extract_pdf("/nonexistent/path/file.pdf")


def test_extract_empty_bytes_raises():
    with pytest.raises(Exception):
        extract_pdf_bytes("empty.pdf", b"")
