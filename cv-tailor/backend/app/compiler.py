"""Tectonic wrapper: compile a .tex string to a PDF file."""
import asyncio
import uuid
from pathlib import Path

from app.config import OUT_DIR, get_settings


class CompileError(RuntimeError):
    pass


async def compile_tex(tex_source: str, stem: str | None = None) -> tuple[Path, Path]:
    """Write .tex, run tectonic, return (tex_path, pdf_path). Raises CompileError."""
    settings = get_settings()
    stem = stem or uuid.uuid4().hex[:12]
    job_dir = OUT_DIR / stem
    job_dir.mkdir(parents=True, exist_ok=True)
    tex_path = job_dir / f"{stem}.tex"
    tex_path.write_text(tex_source, encoding="utf-8")

    proc = await asyncio.create_subprocess_exec(
        settings.tectonic, str(tex_path), "--outdir", str(job_dir),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    pdf_path = job_dir / f"{stem}.pdf"
    if proc.returncode != 0 or not pdf_path.exists():
        raise CompileError(stderr.decode()[-1200:])
    return tex_path, pdf_path
