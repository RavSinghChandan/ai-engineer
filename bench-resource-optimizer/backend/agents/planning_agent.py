"""
Planning Agent — two-phase async parallel generation.

Phase 1 (1 call, pipe-delimited text): get N day themes   → fast, never mis-parsed
Phase 2 (N parallel calls):            generate 2 tasks per day  → asyncio.gather

Resources injected from static map (no LLM) — removes URL truncation risk.
In-memory cache: same (role, skills, num_days) returns instantly on repeat.
"""
import asyncio
import json
import re
from typing import List

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from utils.json_parser import parse_llm_json

# ── Static resource map ───────────────────────────────────────────────────────
SKILL_RESOURCES: dict = {
    "java":           "https://docs.oracle.com/en/java/",
    "spring boot":    "https://spring.io/guides",
    "docker":         "https://docs.docker.com/get-started/",
    "kubernetes":     "https://kubernetes.io/docs/tutorials/",
    "jwt":            "https://jwt.io/introduction/",
    "angular":        "https://angular.io/tutorial",
    "typescript":     "https://www.typescriptlang.org/docs/",
    "rxjs":           "https://rxjs.dev/guide/overview",
    "react":          "https://react.dev/learn",
    "node.js":        "https://nodejs.org/en/docs",
    "tensorflow":     "https://www.tensorflow.org/tutorials",
    "pytorch":        "https://pytorch.org/tutorials/",
    "scikit-learn":   "https://scikit-learn.org/stable/user_guide.html",
    "mlflow":         "https://mlflow.org/docs/latest/",
    "langchain":      "https://python.langchain.com/docs/",
    "python":         "https://docs.python.org/3/tutorial/",
    "fastapi":        "https://fastapi.tiangolo.com/tutorial/",
    "sql":            "https://www.w3schools.com/sql/",
    "postgresql":     "https://www.postgresql.org/docs/",
    "kafka":          "https://kafka.apache.org/quickstart",
    "airflow":        "https://airflow.apache.org/docs/",
    "aws":            "https://docs.aws.amazon.com/",
    "terraform":      "https://developer.hashicorp.com/terraform/tutorials",
    "jenkins":        "https://www.jenkins.io/doc/tutorials/",
    "git":            "https://git-scm.com/doc",
    "linux":          "https://linuxcommand.org/",
    "pyspark":        "https://spark.apache.org/docs/latest/api/python/",
    "maven":          "https://maven.apache.org/guides/",
    "rest api":       "https://restfulapi.net/",
    "mongodb":        "https://www.mongodb.com/docs/manual/tutorial/",
    "redux":          "https://redux.js.org/tutorials/essentials/part-1-overview-concepts",
    "ansible":        "https://docs.ansible.com/ansible/latest/getting_started/",
    "prometheus":     "https://prometheus.io/docs/introduction/overview/",
    "ngrok":          "https://ngrok.com/docs/",
    "pandas":         "https://pandas.pydata.org/docs/getting_started/",
    "dbt":            "https://docs.getdbt.com/docs/introduction",
}

def _resource_for(skill: str) -> str:
    key = skill.lower().split(",")[0].strip()
    return SKILL_RESOURCES.get(
        key,
        f"https://www.google.com/search?q={key.replace(' ', '+')}+tutorial"
    )


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
                    "day":   int(re.sub(r"[^0-9]", "", parts[0]) or str(len(items)+1)),
                    "theme": parts[1],
                    "skill": parts[2],
                })
            except ValueError:
                continue
    # Fallback: if parsing fails, create generic entries
    if not items:
        skills = []
        for i in range(num_days):
            items.append({"day": i+1, "theme": f"Day {i+1}", "skill": "General"})
    return items[:num_days]


async def _get_outline(role: str, missing_skills: List[str], num_days: int, llm) -> list:
    prompt  = ChatPromptTemplate.from_messages([("human", OUTLINE_PROMPT)])
    bounded = llm.bind(max_tokens=num_days * 12 + 10)
    chain   = prompt | bounded
    result  = await chain.ainvoke({
        "role":           role,
        "missing_skills": ", ".join(missing_skills) or "core skills",
        "num_days":       num_days,
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
    prompt  = ChatPromptTemplate.from_messages([("human", DAY_PROMPT)])
    bounded = llm.bind(max_tokens=120)
    chain   = prompt | bounded
    async with _SEM:
        result = await chain.ainvoke({
            "role":  role,
            "day":   day_info["day"],
            "theme": day_info["theme"],
            "skill": day_info["skill"],
        })
    try:
        day = parse_llm_json(result.content)
    except Exception:
        # Fallback if JSON parse fails: build a minimal valid day
        day = {
            "day":   day_info["day"],
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
    # Inject resource URLs (never ask LLM for URLs)
    for task in day.get("tasks", []):
        task["resource"] = _resource_for(task.get("skill", day_info["skill"]))
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
    current_skills: List[str],
    llm: ChatOpenAI,
    num_days: int = 7,
) -> dict:
    key = _cache_key(role, missing_skills, num_days)
    if key in _cache:
        return _cache[key]

    outline     = await _get_outline(role, missing_skills, num_days, llm)
    day_results = await asyncio.gather(
        *[_generate_one_day(d, role, llm) for d in outline]
    )

    focus_skills = list(dict.fromkeys(d["skill"] for d in outline))[:5]

    plan = {
        "role":         role,
        "total_days":   num_days,
        "focus_skills": focus_skills,
        "plan":         sorted(day_results, key=lambda d: d["day"]),
    }

    if len(_cache) >= _MAX_CACHE:
        _cache.pop(next(iter(_cache)))
    _cache[key] = plan
    return plan
