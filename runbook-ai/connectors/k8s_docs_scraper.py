"""
Kubernetes Official Docs Scraper
Pulls troubleshooting pages from github.com/kubernetes/website markdown files.
Ingests them as source_type='official' runbooks into the same DB.

Run from the runbook-ai/ directory:
  DEEPSEEK_API_KEY=sk-xxx python3 connectors/k8s_docs_scraper.py
"""
from __future__ import annotations
import json, os, re, sqlite3, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.llm import call_llm

K8S_DOCS_PAGES = [
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/tasks/debug/debug-application/debug-pods.md",
     "web_url": "https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/",
     "hint": "Kubernetes Debug Pods — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/tasks/debug/debug-application/debug-running-pod.md",
     "web_url": "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
     "hint": "Kubernetes Debug Running Pod — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/tasks/debug/debug-cluster/_index.md",
     "web_url": "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
     "hint": "Kubernetes Cluster Troubleshooting — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/tasks/administer-cluster/certificates.md",
     "web_url": "https://kubernetes.io/docs/tasks/administer-cluster/certificates/",
     "hint": "Kubernetes Certificate Management — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/tasks/run-application/horizontal-pod-autoscale.md",
     "web_url": "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
     "hint": "Kubernetes HorizontalPodAutoscaler — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/storage/persistent-volumes.md",
     "web_url": "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
     "hint": "Kubernetes PersistentVolumes — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/reference/access-authn-authz/rbac.md",
     "web_url": "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
     "hint": "Kubernetes RBAC — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/workloads/pods/pod-lifecycle.md",
     "web_url": "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/",
     "hint": "Kubernetes Pod Lifecycle — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/tasks/debug/debug-cluster/resource-pressure.md",
     "web_url": "https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-pressure/",
     "hint": "Kubernetes Node Resource Pressure — Official"},
    {"url": "https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/scheduling-eviction/node-pressure-eviction.md",
     "web_url": "https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/",
     "hint": "Kubernetes Node Pressure Eviction — Official"},
]

CLASSIFY_SYSTEM = """You are an IT runbook classifier. Given text from Kubernetes official documentation,
extract classification metadata. Respond with JSON only — no markdown fences:
{
  "title": "short descriptive title",
  "description": "one sentence — what problem does this doc help solve",
  "category": "kubernetes",
  "severity": "P2",
  "tags": ["kubernetes", "relevant", "tags"],
  "estimated_duration_minutes": 20
}"""

STEPS_SYSTEM = """You are an IT runbook step extractor. Given Kubernetes official documentation text,
extract actionable troubleshooting steps. Respond with JSON only — no markdown fences:
{
  "steps": [
    {
      "step_number": 1,
      "title": "step title",
      "description": "what this step does",
      "commands": ["kubectl command here"],
      "expected_output": "what you expect to see",
      "depends_on": [],
      "is_optional": false,
      "timeout_seconds": 60
    }
  ],
  "rollback_steps": []
}
Extract ONLY steps that have concrete kubectl commands or actionable instructions.
Ignore pure conceptual/background text. Maximum 8 steps."""


def _fetch(url: str) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RunbookAI/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode("utf-8")
    except Exception as e:
        print(f"  FETCH ERR: {e}")
        return None


def _clean_md(text: str) -> str:
    # Strip YAML frontmatter
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            text = text[end + 4:]
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"```\w*\n?", "\n", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\{\{[^}]+\}\}", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    return m.group(1).strip() if m else text


def _save_runbook(conn, title, desc, category, severity, tags, steps, rollback,
                  source_name, source_url, tenant_id, duration):
    now = time.time()
    slug = re.sub(r"[^a-z0-9]+", "-", source_url.rstrip("/").split("/")[-1])
    cur = conn.execute(
        """INSERT INTO runbooks
           (filename,title,description,category,severity,tags,prerequisites,
            estimated_duration_minutes,total_pages,status,tenant_id,
            source_type,source_name,source_url,ingested_at,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (f"official-{slug}.md", title, desc, category, severity,
         json.dumps(tags), json.dumps([]),
         duration, 1, "active", tenant_id,
         "official", source_name, source_url,
         now, now, now),
    )
    rb_id = cur.lastrowid
    for step in steps:
        conn.execute(
            """INSERT INTO steps
               (runbook_id,step_number,title,description,commands,
                expected_output,depends_on,is_optional,timeout_seconds,is_rollback)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (rb_id, step.get("step_number", 1), step.get("title", ""),
             step.get("description", ""),
             json.dumps(step.get("commands", [])),
             step.get("expected_output", ""),
             json.dumps(step.get("depends_on", [])),
             step.get("is_optional", False),
             step.get("timeout_seconds", 60), False),
        )
    for step in rollback:
        conn.execute(
            """INSERT INTO steps
               (runbook_id,step_number,title,description,commands,
                expected_output,depends_on,is_optional,timeout_seconds,is_rollback)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (rb_id, step.get("step_number", 1), step.get("title", ""),
             step.get("description", ""),
             json.dumps(step.get("commands", [])),
             step.get("expected_output", ""),
             json.dumps(step.get("depends_on", [])),
             step.get("is_optional", False),
             step.get("timeout_seconds", 60), True),
        )
    conn.commit()
    return rb_id


def run_scraper(db_path: str = "runbookai.db", tenant_id: int = 1):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    ok, fail, skip = [], [], []

    for page in K8S_DOCS_PAGES:
        hint = page["hint"]
        web_url = page["web_url"]
        print(f"\n{'=' * 60}\n{hint}")

        # Skip if already ingested
        if conn.execute("SELECT id FROM runbooks WHERE source_url=? AND tenant_id=?",
                        (web_url, tenant_id)).fetchone():
            print("  SKIP (already ingested)")
            skip.append(hint)
            continue

        raw = _fetch(page["url"])
        if not raw:
            fail.append(hint)
            continue

        text = _clean_md(raw)
        chunk = text[:5000]
        print(f"  chars: {len(text)} → LLM chunk: {len(chunk)}")

        # Classify
        try:
            cls_raw = call_llm(CLASSIFY_SYSTEM, f"Documentation text:\n\n{chunk}", max_tokens=400)
            cls = json.loads(_strip_fences(cls_raw))
            title = cls.get("title", hint)
            desc = cls.get("description", hint)
            category = cls.get("category", "kubernetes")
            severity = cls.get("severity", "P2")
            tags = cls.get("tags", ["kubernetes"])
            duration = int(cls.get("estimated_duration_minutes", 20))
            print(f"  classified: {category}/{severity} — {title}")
        except Exception as e:
            print(f"  CLASSIFY ERR: {e}")
            title, desc, category, severity, tags, duration = hint, hint, "kubernetes", "P2", ["kubernetes"], 20

        # Extract steps
        try:
            steps_raw = call_llm(STEPS_SYSTEM, f"Documentation text:\n\n{chunk}", max_tokens=2000)
            steps_data = json.loads(_strip_fences(steps_raw))
            steps = steps_data.get("steps", [])
            rollback = steps_data.get("rollback_steps", [])
            print(f"  steps: {len(steps)} exec + {len(rollback)} rollback")
        except Exception as e:
            print(f"  STEPS ERR: {e}")
            steps, rollback = [], []

        if not steps:
            print("  SKIP — no steps extracted")
            fail.append(hint)
            continue

        rb_id = _save_runbook(conn, f"[Official] {title}", desc, category, severity,
                              tags, steps, rollback, "Kubernetes Official Docs",
                              web_url, tenant_id, duration)
        print(f"  SAVED → id={rb_id}")
        ok.append({"hint": hint, "id": rb_id, "title": title})
        time.sleep(1.5)

    conn.close()
    sep = "=" * 60
    print(f"\n{sep}")
    print(f"Done  success={len(ok)}  failed={len(fail)}  skipped={len(skip)}")
    for r in ok:
        print(f"  ✓ id={r['id']}  {r['title'][:55]}")
    for f in fail:
        print(f"  ✗ {f}")
    return ok


if __name__ == "__main__":
    run_scraper()
