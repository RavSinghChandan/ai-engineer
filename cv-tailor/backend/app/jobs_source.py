"""Job discovery via jobdataapi.com — DIRECT company-careers / ATS links only.

Hard rule (user): apply links must go straight to the employer's own careers
page / ATS (Greenhouse, Lever, Workday, SmartRecruiters, Breezy, Comeet, …).
NEVER a third-party aggregator (LinkedIn, Indeed, Naukri, Glassdoor).
jobdataapi returns `application_url` sourced directly from company ATS systems,
which satisfies this. Works keyless for light use (~10 req/hr); an optional
JOBDATA_API_KEY raises the limit.
"""
import os
from dataclasses import dataclass

import httpx

API_URL = "https://jobdataapi.com/api/jobs/"

# Role dropdown → the title keyword sent to the API.
ROLE_QUERIES: dict[str, str] = {
    "Senior AI Engineer": "Senior AI Engineer",
    "AI / GenAI Engineer": "AI Engineer",
    "Machine Learning Engineer": "Machine Learning Engineer",
    "Full Stack Developer (AI)": "Full Stack AI",
    "Java Backend + AI": "Java Backend",
    "Python Backend Engineer": "Python Backend",
    "GenAI Engineer": "Generative AI Engineer",
    "LLM Engineer": "LLM Engineer",
}

# Aggregator hosts we refuse to surface as "apply" links (defense-in-depth;
# jobdataapi already excludes these, but we double-check).
_AGGREGATOR_HOSTS = ("linkedin.", "indeed.", "naukri.", "glassdoor.", "monster.", "ziprecruiter.")


@dataclass
class JobPosting:
    company: str
    role: str
    apply_url: str          # direct company/ATS careers link
    description: str
    location: str = ""
    source: str = ""


def available_roles() -> list[str]:
    return list(ROLE_QUERIES.keys())


def _is_direct(url: str) -> bool:
    u = (url or "").lower()
    return bool(u) and not any(h in u for h in _AGGREGATOR_HOSTS)


def _matches_location(item: dict, want: str) -> bool:
    """India filter done client-side (country_code param needs a paid key)."""
    if not want or want.upper() in ("ANY", "WORLD", ""):
        return True
    codes = [c.get("code", "").upper() for c in (item.get("countries") or []) if isinstance(c, dict)]
    if want.upper() in codes:
        return True
    # fallback only on an explicit India mention in the location text (not remote-anywhere)
    return want.upper() == "IN" and "india" in (item.get("location") or "").lower()


async def find_jobs(role: str, count: int, location: str = "IN", max_age_days: int = 14) -> list[JobPosting]:
    """Fetch up to `count` jobs for the role with DIRECT company apply links.

    Keyless tier accepts only `title`; the `country_code`/`max_age` filters need a
    paid key. So without a key we send just `title` and filter India + freshness
    ourselves. With a key we push the filters server-side for efficiency.
    """
    title = ROLE_QUERIES.get(role, role)
    has_key = bool(os.environ.get("JOBDATA_API_KEY"))
    headers = {"Accept": "application/json"}
    params: dict = {"title": title}
    if has_key:
        headers["Authorization"] = f"Api-Key {os.environ['JOBDATA_API_KEY']}"
        params["max_age"] = max_age_days
        if location and location.upper() not in ("ANY", "WORLD"):
            params["country_code"] = location

    jobs: list[JobPosting] = []
    seen: set[str] = set()
    url: str | None = API_URL
    pages = 0
    max_pages = 6 if has_key else 3  # keyless tier is rate-limited (~10 req/hr)
    async with httpx.AsyncClient(timeout=40, headers=headers) as client:
        while url and len(jobs) < count and pages < max_pages:
            resp = await client.get(url, params=params if url == API_URL else None)
            pages += 1
            if resp.status_code == 403:
                raise RuntimeError(
                    "jobdataapi rate limit / subscription reached. Add a free JOBDATA_API_KEY "
                    "(jobdataapi.com) to backend/.env for reliable, higher-volume searches."
                )
            if resp.status_code != 200:
                break
            data = resp.json()
            for item in data.get("results", []):
                apply = item.get("application_url") or ""
                if not _is_direct(apply) or apply in seen:
                    continue
                if not has_key and not _matches_location(item, location):
                    continue
                seen.add(apply)
                company = item.get("company")
                company_name = company.get("name") if isinstance(company, dict) else (company or "Unknown")
                jobs.append(
                    JobPosting(
                        company=company_name,
                        role=item.get("title") or role,
                        apply_url=apply,
                        description=(item.get("description") or "")[:6000],
                        location=item.get("location") or "",
                        source="company careers (direct)",
                    )
                )
                if len(jobs) >= count:
                    break
            url = data.get("next")
    return jobs[:count]
