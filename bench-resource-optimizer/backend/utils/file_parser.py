"""PDF text extraction utility."""
import PyPDF2
from io import BytesIO


def extract_text_from_pdf(file_bytes: bytes) -> str:
    # BUG FIX: PyPDF2.PdfReader raises PdfReadError on corrupt/encrypted files — without a
    # try/except this propagated as an unhandled 500 instead of the correct 400 Bad Request.
    # Raise ValueError so the GuardrailError handler in main.py returns HTTP 400.
    try:
        reader = PyPDF2.PdfReader(BytesIO(file_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages).strip()
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc
