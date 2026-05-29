"""
Planning Agent — two-phase async parallel generation.

Phase 1 (1 call, pipe-delimited text): get N day themes   → fast, never mis-parsed
Phase 2 (N parallel calls):            generate 2 tasks per day  → asyncio.gather

Resources injected from internal_resources.json (company-internal, no public URLs).
In-memory cache: same (role, skills, num_days) returns instantly on repeat.

Privacy: LLM only receives skill names, role title, and day themes.
It never receives raw CV text, employee PII, or internal document content.
"""
import asyncio
import re
from typing import List

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from utils.json_parser import parse_llm_json
from rag.document_store import get_internal_resource, resource_location_for


def _resource_for(skill: str) -> str:
    """
    Returns the internal knowledge-portal location for a skill.
    Always returns an internal:// URI — never a public internet URL.
    """
    return resource_location_for(skill)


def _resource_meta_for(skill: str) -> dict:
    """Returns full internal resource metadata (title, location, owner, classification)."""
    return get_internal_resource(skill)


# ── Phase 1: pipe-delimited outline (reliable, never mis-parsed) ─────────────
OUTLINE_PROMPT = """List exactly {num_days} training day themes for this role.
Role: {role}. Skills to cover: {missing_skills}.

Output format — one line per day, nothing else:
1|Theme Name|PrimarySkill
2|Theme Name|PrimarySkill
...

Distribute skills evenly. {num_days} lines total."""


def _parse_outline(text: str, num_days: int) -> list:
    """Parse pipe-delimited outline lines into dicts."""
    items = []
    for line in text.strip().splitlines():
        line = line.strip().lstrip("- *")
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 3:
            try:
                items.append({
                    "day": int(re.sub(r"\D", "", parts[0]) or str(len(items) + 1)),
                    "theme": parts[1],
                    "skill": parts[2],
                })
            except ValueError:
                continue
    # Fallback: if parsing fails, create generic entries
    if not items:
        for i in range(num_days):
            items.append({"day": i + 1, "theme": f"Day {i+1}", "skill": "General"})
    return items[:num_days]


async def _get_outline(role: str, missing_skills: List[str], num_days: int, llm) -> list:
    prompt = ChatPromptTemplate.from_messages([("human", OUTLINE_PROMPT)])
    bounded = llm.bind(max_tokens=num_days * 12 + 10)
    chain = prompt | bounded
    result = await chain.ainvoke({
        "role": role,
        "missing_skills": ", ".join(missing_skills) or "core skills",
        "num_days": num_days,
    })
    return _parse_outline(result.content, num_days)


# ── Phase 2: per-day tasks ────────────────────────────────────────────────────
DAY_PROMPT = """Return ONLY a JSON object (no markdown, no prose):
{{"day":{day},"theme":"{theme}","tasks":[
  {{"id":"d{day}t1","title":"<action verb + object, max 6 words>","skill":"{skill}","hours":2}},
  {{"id":"d{day}t2","title":"<hands-on project, max 6 words>","skill":"{skill}","hours":2}}
]}}

Role: {role}. Day {day}. Theme: {theme}. Skill: {skill}."""

_SEM = asyncio.Semaphore(6)


async def _generate_one_day(day_info: dict, role: str, llm) -> dict:
    prompt = ChatPromptTemplate.from_messages([("human", DAY_PROMPT)])
    bounded = llm.bind(max_tokens=120)
    chain = prompt | bounded
    async with _SEM:
        result = await chain.ainvoke({
            "role": role,
            "day": day_info["day"],
            "theme": day_info["theme"],
            "skill": day_info["skill"],
        })
    try:
        day = parse_llm_json(result.content)
    except Exception:
        # Fallback if JSON parse fails: build a minimal valid day
        day = {
            "day": day_info["day"],
            "theme": day_info["theme"],
            "tasks": [
                {"id": f"d{day_info['day']}t1",
                 "title": f"Study {day_info['skill']} fundamentals",
                 "skill": day_info["skill"], "hours": 2},
                {"id": f"d{day_info['day']}t2",
                 "title": f"Build {day_info['skill']} mini-project",
                 "skill": day_info["skill"], "hours": 2},
            ]
        }
    # Inject internal resource metadata (never ask LLM for resources)
    for task in day.get("tasks", []):
        skill = task.get("skill", day_info["skill"])
        meta = _resource_meta_for(skill)
        task["resource"] = meta["location"]   # internal:// URI
        task["resource_title"] = meta["title"]
        task["resource_owner"] = meta["owner"]
        task["resource_classification"] = meta["classification"]
        task["resource_type"] = meta["type"]
        # Ensure description field exists for frontend
        task.setdefault("description", task["title"])
    return day


# ── Cache ─────────────────────────────────────────────────────────────────────
_cache: dict = {}
_MAX_CACHE = 30


def _cache_key(role: str, missing: List[str], num_days: int) -> str:
    return f"{role.lower()}|{'|'.join(sorted(s.lower() for s in missing))}|{num_days}"


# ── Public entry point ─────────────────────────────────────────────────────────
async def generate_plan(
    role: str,
    missing_skills: List[str],
    llm: ChatOpenAI,
    num_days: int = 7,
) -> dict:
    key = _cache_key(role, missing_skills, num_days)
    if key in _cache:
        return _cache[key]

    outline = await _get_outline(role, missing_skills, num_days, llm)
    day_results = await asyncio.gather(
        *[_generate_one_day(d, role, llm) for d in outline]
    )

    focus_skills = list(dict.fromkeys(d["skill"] for d in outline))[:5]

    plan = {
        "role": role,
        "total_days": num_days,
        "focus_skills": focus_skills,
        "plan": sorted(day_results, key=lambda d: d["day"]),
    }

    if len(_cache) >= _MAX_CACHE:
        _cache.pop(next(iter(_cache)))
    _cache[key] = plan
    return plan
