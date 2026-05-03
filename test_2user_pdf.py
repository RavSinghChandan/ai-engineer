#!/usr/bin/env python3
"""
End-to-end test: 2 users × 1 question each
Runs /run → /approve → captures structured_summary + full report
Prints side-by-side diff so we can see if answers are unique.
"""
import json, time, urllib.request, sys

BASE = "http://localhost:8000"

USERS = [
    {
        "label": "User 1 — Priya Sharma (marriage)",
        "profile": {
            "full_name":       "Priya Sharma",
            "date_of_birth":   "1995-03-14",
            "time_of_birth":   "08:30",
            "place_of_birth":  "Mumbai, Maharashtra",
            "pincode":         "400001",
            "alias_name":      "",
        },
        "question": "When will I get married and what kind of partner should I expect?",
    },
    {
        "label": "User 2 — Rahul Mehta (marriage, different DOB/place)",
        "profile": {
            "full_name":       "Rahul Mehta",
            "date_of_birth":   "1990-11-22",
            "time_of_birth":   "18:45",
            "place_of_birth":  "Delhi",
            "pincode":         "110001",
            "alias_name":      "",
        },
        "question": "When will I get married and what kind of partner should I expect?",
    },
]


def post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())


def run_user(u: dict) -> dict:
    label = u["label"]
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")

    # ── Step 1: /run ─────────────────────────────────────────────
    t0 = time.time()
    print("  [1/3] POST /api/v1/analysis/run ...", end="", flush=True)
    run_res = post("/api/v1/analysis/run", {
        "user_profile":     u["profile"],
        "user_id":          u["profile"]["full_name"].replace(" ", "_").lower(),
        "user_question":    u["question"],
        "questions":        [],
        "selected_modules": ["astrology", "numerology"],
        "module_inputs":    {},
        "prompt_version":   "v2",
    })
    session_id = run_res["session_id"]
    print(f" done ({time.time()-t0:.1f}s)  session={session_id[:8]}...")

    # Dasha info from focus_context
    fc = run_res.get("focus_context", {})
    print(f"  intent={fc.get('intent')}  confidence={fc.get('confidence')}")

    admin = run_res.get("admin_review", {})
    questions = admin.get("questions", [])
    if not questions:
        print("  ERROR: no questions in admin_review")
        return {}

    all_ids = [i["id"] for q in questions for i in q.get("insights", [])]
    print(f"  insights available: {len(all_ids)}")

    # ── Step 2: /approve ─────────────────────────────────────────
    t1 = time.time()
    print("  [2/3] POST /api/v1/analysis/approve ...", end="", flush=True)
    approve_res = post("/api/v1/analysis/approve", {
        "session_id":           session_id,
        "approved_insight_ids": all_ids,
        "rejected_insight_ids": [],
        "brand_name":           "Aura with Rav",
    })
    elapsed = time.time() - t1
    print(f" done ({elapsed:.1f}s)")

    report = approve_res.get("final_report", {})
    sections = report.get("sections", [])
    print(f"  sections in report: {len(sections)}")

    # ── Step 3: Print structured_summary ─────────────────────────
    print(f"\n  [3/3] Structured Summary for: \"{u['question'][:60]}\"")
    for si, sec in enumerate(sections):
        ss = sec.get("structured_summary", {})
        hw = ss.get("hw_bullets", [])
        llm_gen = ss.get("llm_generated", False)
        print(f"\n  Section {si+1}  llm_generated={llm_gen}")
        for b in hw:
            btype = b.get("type", "")
            label = b.get("label", "")
            answer = b.get("answer", "")
            if btype == "list" and isinstance(answer, list):
                print(f"    [{btype.upper()}] {label}")
                for pt in answer:
                    print(f"          • {pt[:90]}")
            elif btype == "timing" and isinstance(answer, dict):
                print(f"    [TIMING] {label}")
                print(f"          window:   {answer.get('window','')}")
                print(f"          peak:     {answer.get('peak','')}")
                print(f"          duration: {answer.get('duration','')}")
            else:
                print(f"    [{btype.upper()}] {label}: {str(answer)[:80]}")

    return {
        "label":    label,
        "sections": sections,
    }


results = []
for u in USERS:
    try:
        r = run_user(u)
        results.append(r)
    except Exception as e:
        print(f"\n  FAILED: {e}")
        results.append({})

# ── Side-by-side diff ────────────────────────────────────────────
print(f"\n\n{'='*70}")
print("  UNIQUENESS CHECK — WHO bullet[0] per user")
print(f"{'='*70}")
for res in results:
    label = res.get("label", "?")
    secs  = res.get("sections", [])
    who0  = ""
    if secs:
        hw = secs[0].get("structured_summary", {}).get("hw_bullets", [])
        for b in hw:
            if b.get("type") == "list":
                ans = b.get("answer", [])
                if ans:
                    who0 = ans[0] if isinstance(ans, list) else str(ans)
                break
    print(f"  {label}")
    print(f"    WHO[0]: {who0[:100]}")
    print()

if len(results) == 2:
    secs0 = results[0].get("sections", [])
    secs1 = results[1].get("sections", [])
    if secs0 and secs1:
        hw0 = secs0[0].get("structured_summary", {}).get("hw_bullets", [])
        hw1 = secs1[0].get("structured_summary", {}).get("hw_bullets", [])
        # Compare WHO lists
        who_pts0 = next((b["answer"] for b in hw0 if b.get("type")=="list"), [])
        who_pts1 = next((b["answer"] for b in hw1 if b.get("type")=="list"), [])
        same = (who_pts0 == who_pts1)
        print(f"  WHO answers identical? {'YES — BUG STILL PRESENT' if same else 'NO — CORRECTLY UNIQUE'}")

        # Compare WHEN windows
        when0 = next((b["answer"] for b in hw0 if b.get("type")=="timing"), {})
        when1 = next((b["answer"] for b in hw1 if b.get("type")=="timing"), {})
        same_when = (when0.get("window") == when1.get("window"))
        print(f"  WHEN windows identical? {'YES (same dasha+birth_month — expected)' if same_when else 'NO — unique'}")
        print(f"    User 1 window: {when0.get('window','?')}")
        print(f"    User 2 window: {when1.get('window','?')}")

print()
