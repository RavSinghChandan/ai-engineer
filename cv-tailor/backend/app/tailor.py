"""DeepSeek-powered tailoring: rewrite CV text to match a job description for ATS."""
import json

from openai import AsyncOpenAI

from app.config import get_settings
from app.cv_engine import CVFields, CVTemplate

_SYSTEM = (
    "You are an expert ATS resume optimizer. You rewrite resume TEXT to maximize "
    "keyword and skill match with a specific job description, while keeping every "
    "claim truthful to the candidate's real experience. You never invent employers, "
    "degrees, dates, or technologies the candidate hasn't listed. You may re-word, "
    "re-emphasize, and weave in the job's exact keywords/phrasing where the candidate "
    "genuinely has that experience. Keep each rewritten field roughly the same length "
    "as the original so the resume layout is unchanged. Preserve any \\textbf{...} "
    "markers. Always answer with a single JSON object, no prose."
)


def _build_user_prompt(fields: CVFields, job_description: str) -> str:
    payload = {
        "summary_1": fields.summary_1,
        "summary_2": fields.summary_2,
        "skills": fields.skills,
        "experience": fields.experience,
        "projects": fields.projects,
    }
    return (
        f"JOB DESCRIPTION:\n{job_description.strip()[:6000]}\n\n"
        f"CANDIDATE RESUME TEXT (rewrite each field for ATS match with the job above):\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "Rewrite EVERY field. Rules:\n"
        "- Mirror the job's exact keywords, tools, and phrasing wherever the candidate "
        "truly has that skill (Java, Python, FastAPI, Spring Boot, LangGraph, RAG, Kafka, "
        "microservices, AWS, etc.).\n"
        "- Keep the same JSON shape and the same keys. skills is label->string. "
        "experience/projects are name->list-of-bullets with the SAME number of bullets.\n"
        "- Keep lengths close to the originals. Stay truthful.\n"
        "- Also return an integer 'ats_score' (0-100): how well the REWRITTEN resume now "
        "matches the job, and 'matched_keywords' (list) and 'missing_keywords' (list of "
        "important job keywords the candidate genuinely lacks).\n\n"
        'Return JSON: {"summary_1": str, "summary_2": str, "skills": {label: str}, '
        '"experience": {company: [str]}, "projects": {name: [str]}, '
        '"ats_score": int, "matched_keywords": [str], "missing_keywords": [str]}'
    )


class TailorResult:
    def __init__(self, fields: CVFields, ats_score: int, matched: list, missing: list):
        self.fields = fields
        self.ats_score = ats_score
        self.matched = matched
        self.missing = missing


async def tailor_cv(job_description: str) -> TailorResult:
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not configured")

    template = CVTemplate()
    base = template.parse()

    client = AsyncOpenAI(base_url=settings.deepseek_base_url, api_key=settings.deepseek_api_key)
    response = await client.chat.completions.create(
        model=settings.deepseek_model,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": _build_user_prompt(base, job_description)},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    data = json.loads(response.choices[0].message.content or "{}")

    tailored = CVFields(
        summary_1=data.get("summary_1", base.summary_1),
        summary_2=data.get("summary_2", base.summary_2),
        skills={**base.skills, **(data.get("skills") or {})},
        experience=_merge_bullets(base.experience, data.get("experience") or {}),
        projects=_merge_bullets(base.projects, data.get("projects") or {}),
    )
    return TailorResult(
        tailored,
        int(data.get("ats_score", 0)),
        data.get("matched_keywords") or [],
        data.get("missing_keywords") or [],
    )


def _merge_bullets(base_map: dict, new_map: dict) -> dict:
    """Keep the base's keys and bullet counts; only accept same-count rewrites."""
    out = {}
    for key, base_bullets in base_map.items():
        new_bullets = new_map.get(key)
        if isinstance(new_bullets, list) and len(new_bullets) == len(base_bullets):
            out[key] = [str(b) for b in new_bullets]
        else:
            out[key] = base_bullets
    return out


def render_tex(result: TailorResult) -> str:
    return CVTemplate().render(result.fields)
