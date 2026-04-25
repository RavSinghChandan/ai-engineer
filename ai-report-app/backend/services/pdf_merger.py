import logging
import os
import tempfile
from typing import List

from pypdf import PdfReader, PdfWriter

log = logging.getLogger(__name__)


def merge_pdfs(pdf_paths: List[str]) -> str:
    """Concatenate multiple PDF files into one and return the output path."""
    writer = PdfWriter()

    for path in pdf_paths:
        if not os.path.exists(path):
            log.warning("PDF to merge not found, skipping: %s", path)
            continue
        reader = PdfReader(path)
        for page in reader.pages:
            writer.add_page(page)

    output_path = os.path.join(tempfile.gettempdir(), "ai_full_report.pdf")
    with open(output_path, "wb") as f:
        writer.write(f)

    log.info("Merged PDF → %s  (%d bytes)", output_path, os.path.getsize(output_path))
    return output_path
