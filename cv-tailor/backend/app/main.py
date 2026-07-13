"""CV Tailor API — paste a job, get an ATS-tailored PDF of Chandan's CV."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.compiler import CompileError, compile_tex
from app.config import get_settings
from app.jobs_source import available_roles, find_jobs
from app.store import (
    add_application,
    delete_application,
    get_application,
    init_db,
    list_applications,
)
from app.tailor import render_tex, tailor_cv

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="CV Tailor", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TailorRequest(BaseModel):
    company: str = Field(default="", max_length=200)
    role: str = Field(default="", max_length=200)
    apply_url: str = Field(default="", max_length=1000)
    job_description: str = Field(min_length=30, max_length=20000)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "deepseek": bool(settings.deepseek_api_key), "tectonic": settings.tectonic}


@app.post("/api/tailor")
async def tailor(req: TailorRequest) -> dict:
    """Tailor the CV to the pasted job, compile the PDF, store the row."""
    try:
        result = await tailor_cv(req.job_description)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Tailoring failed: {exc}")

    tex_source = render_tex(result)
    try:
        tex_path, pdf_path = await compile_tex(tex_source)
    except CompileError as exc:
        raise HTTPException(status_code=500, detail=f"PDF compile failed: {exc}")

    app_id = add_application(
        company=req.company,
        role=req.role,
        apply_url=req.apply_url,
        job_description=req.job_description,
        ats_score=result.ats_score,
        matched_keywords=result.matched,
        missing_keywords=result.missing,
        tex_path=str(tex_path),
        pdf_path=str(pdf_path),
    )
    return {
        "id": app_id,
        "company": req.company,
        "role": req.role,
        "apply_url": req.apply_url,
        "ats_score": result.ats_score,
        "matched_keywords": result.matched,
        "missing_keywords": result.missing,
    }


@app.get("/api/roles")
async def roles() -> list[str]:
    return available_roles()


class AutoSearchRequest(BaseModel):
    role: str
    count: int = Field(default=10, ge=1, le=30)
    location: str = Field(default="IN", max_length=4)   # country code, e.g. IN
    max_age_days: int = Field(default=14, ge=1, le=60)


@app.post("/api/auto-search")
async def auto_search(req: AutoSearchRequest) -> dict:
    """Find N real jobs (direct company links) for a role, tailor + build a PDF for each."""
    try:
        postings = await find_jobs(req.role, req.count, req.location, req.max_age_days)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Job search failed: {exc}")

    if not postings:
        return {"found": 0, "created": 0, "note": "No direct-link jobs found for that role/filters."}

    created = 0
    errors: list[str] = []
    for job in postings:
        try:
            result = await tailor_cv(job.description or f"{job.role} at {job.company}")
            tex_source = render_tex(result)
            tex_path, pdf_path = await compile_tex(tex_source)
            add_application(
                company=job.company,
                role=job.role,
                apply_url=job.apply_url,
                job_description=job.description,
                ats_score=result.ats_score,
                matched_keywords=result.matched,
                missing_keywords=result.missing,
                tex_path=str(tex_path),
                pdf_path=str(pdf_path),
            )
            created += 1
        except Exception as exc:  # one bad job shouldn't sink the batch
            errors.append(f"{job.company}: {exc}")

    return {"found": len(postings), "created": created, "errors": errors[:5]}


@app.get("/api/applications")
async def applications() -> list[dict]:
    # strip heavy fields for the list view
    out = []
    for a in list_applications():
        out.append({
            "id": a["id"], "company": a["company"], "role": a["role"],
            "apply_url": a["apply_url"], "ats_score": a["ats_score"],
            "matched_keywords": a["matched_keywords"], "missing_keywords": a["missing_keywords"],
            "created_at": a["created_at"],
        })
    return out


@app.get("/api/applications/{app_id}/pdf")
async def download_pdf(app_id: str) -> FileResponse:
    a = get_application(app_id)
    if not a or not Path(a["pdf_path"]).exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    company = (a["company"] or "cv").replace(" ", "_").replace("/", "-")[:40]
    return FileResponse(a["pdf_path"], media_type="application/pdf",
                        filename=f"Chandan_Kumar_{company}.pdf")


@app.get("/api/applications/{app_id}/tex")
async def download_tex(app_id: str) -> FileResponse:
    a = get_application(app_id)
    if not a or not Path(a["tex_path"]).exists():
        raise HTTPException(status_code=404, detail="TeX not found")
    return FileResponse(a["tex_path"], media_type="text/plain",
                        filename=f"Chandan_Kumar_{app_id}.tex")


@app.delete("/api/applications/{app_id}")
async def remove(app_id: str) -> dict:
    delete_application(app_id)
    return {"deleted": app_id}
