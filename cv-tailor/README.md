# CV Tailor

Paste a job description → get an **ATS-optimized PDF of your CV** (same format, reworded
text) → download it and click through to apply. Backend-heavy (FastAPI), thin frontend (Angular).

## How it works

**Primary — auto-find (no pasting):** pick a role from the dropdown, choose how many jobs +
location + freshness, click **Find jobs & tailor**. Pulls live openings from company career
sites / ATS (Greenhouse, Lever, Workday, SmartRecruiters, Breezy, Comeet…) via jobdataapi —
apply links go **directly to the employer's careers page**, never a third-party aggregator.
Tailors a CV per job. **Secondary — manual paste** (collapsible) for one-off jobs.

Jobs API key: works keyless for a few searches (~10/hr) then rate-limits. Free key at
**jobdataapi.com** → put `JOBDATA_API_KEY=...` in `backend/.env` for reliable, filtered search.

### Tailoring (both flows)

1. A job description (auto-fetched or pasted) drives the rewrite.
2. DeepSeek rewrites **only the text** of your CV's editable fields (summary, skills,
   experience bullets, project bullets) to mirror the job's keywords — truthfully, no
   invented experience.
3. The rewritten text is spliced back into your **exact LaTeX structure** — the schema,
   layout, fonts, and spacing never change. Only words change.
4. Tectonic compiles it to a PDF. You get an ATS match score, matched/missing keywords,
   a **Download PDF** button, and your **Apply** link — in a table, one row per job.

The base CV lives at `backend/app/base/base_cv.tex`. To change your CV permanently, edit
that file (its structure is what every tailored version reuses).

## Run

**Backend** (port 8090):
```
cd backend
export DEEPSEEK_API_KEY=<your key>   # or put it in backend/.env
.venv/bin/uvicorn app.main:app --port 8090
```

**Frontend** (port 4300):
```
cd frontend
npm start           # proxies /api to :8090
```

Open http://localhost:4300.

## Requirements
- Python 3.13 (`backend/.venv`), deps in `requirements.txt`
- `tectonic` (LaTeX compiler): `brew install tectonic`
- DeepSeek API key (only external cost — ~₹1 per tailored CV)

## Notes
- Job data comes from **you pasting descriptions** — reliable, works with any portal,
  no scraping/blocking. (Auto-fetching from LinkedIn/Naukri is blocked by those sites.)
- Everything is stored locally in SQLite (`backend/data/cvtailor.db`); PDFs in
  `backend/data/cvs/`.
