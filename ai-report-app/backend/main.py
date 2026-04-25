import logging
import os
import tempfile
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import settings
from middleware.auth import verify_api_key
from middleware.rate_limiter import rate_limit
from services.ai_service import get_unified_analysis
from services.carousel_ai import get_carousel_slides
from services.carousel_service import generate_carousel_pdf
from services.graph_service import generate_graph
from services.pdf_merger import merge_pdfs
from services.pdf_service import generate_pdf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
log = logging.getLogger("main")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered report & carousel generator — unified pipeline.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_SHARED_DEPS = [Depends(verify_api_key), Depends(rate_limit)]


def _save_upload(upload: UploadFile, content: bytes, name: str) -> str:
    """Save upload bytes preserving the original file extension so reportlab can detect format."""
    _, ext = os.path.splitext(upload.filename or "")
    ext = ext.lower() if ext else ".png"          # default to .png if unknown
    path = os.path.join(tempfile.gettempdir(), f"{name}{ext}")
    with open(path, "wb") as f:
        f.write(content)
    log.info("Saved upload %s → %s  (%d bytes)", upload.filename, path, len(content))
    return path


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Utility"])
def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# ── Report (unified: report PDF + carousel PDF merged) ────────────────────────

@app.post("/generate-report", tags=["Report"], dependencies=_SHARED_DEPS)
async def generate_report(
    text_input:  Optional[str]        = Form(None),
    file:        Optional[UploadFile] = File(None),
    logo:        Optional[UploadFile] = File(None),
    profile_pic: Optional[UploadFile] = File(None),
    author_name: str                  = Form(""),
):
    """
    Single AI call → structured report data + carousel slides.
    Returns one merged PDF:
      • Part 1: branded data report (graph + insights)
      • Part 2: LinkedIn-style carousel slides
    """
    if not text_input and not file:
        raise HTTPException(status_code=400, detail="Provide either text_input or a file.")

    # ── Resolve data input ──────────────────────────────────────────────────
    user_input = text_input or ""
    if file:
        raw = await file.read()
        try:
            user_input = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File must be UTF-8 encoded.")
        log.info("Input from file: %s  (%d chars)", file.filename, len(user_input))
    else:
        log.info("Input from text  (%d chars)", len(user_input))

    # ── Branding assets ──────────────────────────────────────────────────────
    logo_path: Optional[str] = None
    if logo and logo.filename:
        logo_bytes = await logo.read()
        if logo_bytes:
            logo_path = _save_upload(logo, logo_bytes, "ai_report_logo")

    profile_path: Optional[str] = None
    if profile_pic and profile_pic.filename:
        pic_bytes = await profile_pic.read()
        if pic_bytes:
            profile_path = _save_upload(profile_pic, pic_bytes, "ai_report_profile")

    # ── Single AI call → report + carousel ──────────────────────────────────
    ai_output  = get_unified_analysis(user_input)
    report_data = ai_output["report"]
    carousel_slides = ai_output["carousel"]["slides"]

    # ── Generate report PDF (Part 1) ─────────────────────────────────────────
    graph_path  = generate_graph(report_data)
    report_pdf  = generate_pdf(
        report_data,
        graph_path,
        logo_path    = logo_path,
        profile_path = profile_path,
        author_name  = author_name,
    )

    # ── Generate carousel PDF (Part 2) ───────────────────────────────────────
    carousel_pdf = generate_carousel_pdf(carousel_slides)

    # ── Merge into one download ──────────────────────────────────────────────
    final_pdf = merge_pdfs([report_pdf, carousel_pdf])
    log.info("Final merged PDF ready — %s", final_pdf)

    return FileResponse(
        final_pdf,
        media_type="application/pdf",
        filename="ai_report_full.pdf",
        headers={"Content-Disposition": "attachment; filename=ai_report_full.pdf"},
    )


# ── Standalone carousel (topic-only, no data input) ──────────────────────────

@app.post("/generate-carousel", tags=["Carousel"], dependencies=_SHARED_DEPS)
async def generate_carousel(topic: str = Form(...)):
    """Generate a standalone LinkedIn-style carousel PDF for a given topic."""
    log.info("Standalone carousel requested — topic: %s", topic)
    slides   = get_carousel_slides(topic)
    pdf_path = generate_carousel_pdf(slides)
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename="carousel.pdf",
        headers={"Content-Disposition": "attachment; filename=carousel.pdf"},
    )
