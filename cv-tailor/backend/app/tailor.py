"""DeepSeek-powered tailoring with an iterative refinement loop.

We don't just tailor once. We tailor → score → if below the target ATS score,
feed the still-missing keywords back and re-tailor, repeating until the target
is met or we run out of rounds. The rewrite stays truthful: missing keywords
are woven in only where the candidate has genuinely adjacent experience.
"""
import json

from openai import AsyncOpenAI

from app.config import get_settings
from app.cv_engine import CVFields, CVTemplate

_SYSTEM = (
    "You are an elite ATS resume optimizer. Your job is to make the candidate's resume "
    "score as high as possible against a specific job description so it passes ATS "
    "keyword screening and reaches a human recruiter. You aggressively mirror the job's "
    "exact keywords, tools, phrasing, and required skills THROUGHOUT the resume — summary, "
    "skills, every bullet — wherever the candidate has that experience or genuinely adjacent "
    "experience. You may reframe and re-emphasize existing work to surface relevant skills. "
    "You must stay truthful: never invent employers, degrees, dates, or a technology the "
    "candidate has zero basis for. Keep each field close to its original length so the "
    "layout is unchanged, and preserve any \\textbf{...} markers. "
    "HARD RULES you must never break: (1) keep total experience as '4+ years' — never say "
    "5+, 6+, or any higher number; (2) keep every field's length close to the original so the "
    "resume stays ONE PAGE — never lengthen bullets or add content that grows the page. "
    "Always answer with a single JSON object, no prose."
)


def _base_prompt(fields: CVFields, job_description: str, target: int) -> str:
    payload = {
        "summary_1": fields.summary_1,
        "summary_2": fields.summary_2,
        "skills": fields.skills,
        "experience": fields.experience,
        "projects": fields.projects,
    }
    return (
        f"JOB DESCRIPTION:\n{job_description.strip()[:6000]}\n\n"
        f"CANDIDATE RESUME TEXT:\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        f"TARGET: the rewritten resume must score at least {target}/100 for ATS match with "
        f"this job. Push hard to reach it.\n\n"
        "Rewrite EVERY field to maximize match:\n"
        "- Mirror the job's exact keywords, tools, frameworks, and phrasing wherever the "
        "candidate truly has that skill or closely adjacent experience. Front-load the most "
        "important job keywords into the summary and skills.\n"
        "- Weave required keywords naturally into the experience and project bullets too.\n"
        "- Keep the SAME JSON shape and keys. skills is label->string. experience/projects are "
        "name->list-of-bullets with the SAME number of bullets. Keep lengths close to originals.\n"
        "- Stay truthful — reframe real work, do not fabricate.\n\n"
        'Return JSON: {"summary_1": str, "summary_2": str, "skills": {label: str}, '
        '"experience": {company: [str]}, "projects": {name: [str]}, '
        '"ats_score": int, "matched_keywords": [str], "missing_keywords": [str]}'
    )


def _refine_prompt(prev_fields: CVFields, job_description: str, target: int,
                   prev_score: int, missing: list[str]) -> str:
    payload = {
        "summary_1": prev_fields.summary_1,
        "summary_2": prev_fields.summary_2,
        "skills": prev_fields.skills,
        "experience": prev_fields.experience,
        "projects": prev_fields.projects,
    }
    return (
        f"JOB DESCRIPTION:\n{job_description.strip()[:6000]}\n\n"
        f"CURRENT RESUME (scored {prev_score}/100, need {target}+):\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        f"STILL-MISSING / UNDER-WEIGHTED JOB KEYWORDS: {json.dumps(missing, ensure_ascii=False)}\n\n"
        f"Rewrite again to reach {target}+/100. Specifically work the missing keywords above into "
        "the resume wherever the candidate has real or adjacent experience (skills line, summary, "
        "and the most relevant bullets). Do NOT drop keywords you already matched. Keep the SAME "
        "JSON shape/keys and the SAME number of bullets, lengths close to originals, stay truthful.\n\n"
        'Return JSON: {"summary_1": str, "summary_2": str, "skills": {label: str}, '
        '"experience": {company: [str]}, "projects": {name: [str]}, '
        '"ats_score": int, "matched_keywords": [str], "missing_keywords": [str]}'
    )


class TailorResult:
    def __init__(self, fields: CVFields, ats_score: int, matched: list, missing: list, rounds: int):
        self.fields = fields
        self.ats_score = ats_score
        self.matched = matched
        self.missing = missing
        self.rounds = rounds


def _apply(base: CVFields, data: dict) -> CVFields:
    return CVFields(
        summary_1=data.get("summary_1", base.summary_1),
        summary_2=data.get("summary_2", base.summary_2),
        skills={**base.skills, **(data.get("skills") or {})},
        experience=_merge_bullets(base.experience, data.get("experience") or {}),
        projects=_merge_bullets(base.projects, data.get("projects") or {}),
    )


async def tailor_cv(job_description: str, target: int = 95, max_rounds: int = 4) -> TailorResult:
    """Iteratively tailor until the CV scores >= target (or max_rounds reached)."""
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not configured")

    base = CVTemplate().parse()
    client = AsyncOpenAI(base_url=settings.deepseek_base_url, api_key=settings.deepseek_api_key)

    async def _ask(prompt: str) -> dict:
        resp = await client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content or "{}")

    data = await _ask(_base_prompt(base, job_description, target))
    current = _apply(base, data)
    score = int(data.get("ats_score", 0))
    matched = data.get("matched_keywords") or []
    missing = data.get("missing_keywords") or []
    rounds = 1

    while score < target and rounds < max_rounds:
        data = await _ask(_refine_prompt(current, job_description, target, score, missing))
        current = _apply(base, data)
        new_score = int(data.get("ats_score", score))
        matched = data.get("matched_keywords") or matched
        missing = data.get("missing_keywords") or missing
        rounds += 1
        # stop early if it stalls (no improvement) to avoid burning rounds
        if new_score <= score:
            score = new_score
            break
        score = new_score

    return TailorResult(current, score, matched, missing, rounds)


def _merge_bullets(base_map: dict, new_map: dict) -> dict:
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
