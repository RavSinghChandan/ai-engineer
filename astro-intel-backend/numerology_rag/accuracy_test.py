"""
Accuracy Comparison Test
========================
Compares static template output vs hybrid RAGless+RAG output
across 5 intent categories, 3 traditions, standard test cases.

Run from astro-intel-backend/:
    python -m numerology_rag.accuracy_test

Saves: numerology_rag/accuracy_report.md
"""
from __future__ import annotations
import sys
import os
import time
from pathlib import Path
from datetime import datetime

# Allow imports from backend root
sys.path.insert(0, str(Path(__file__).parent.parent))

# ── Test cases ────────────────────────────────────────────────────────────────

TEST_CASES = [
    {
        "id": "TC01",
        "name": "Priya Sharma",
        "dob":  "1990-03-15",
        "question": "Will I get married this year?",
        "intent":   "marriage",
    },
    {
        "id": "TC02",
        "name": "Rahul Mehta",
        "dob":  "1985-07-22",
        "question": "Should I start a new business in 2026?",
        "intent":   "career",
    },
    {
        "id": "TC03",
        "name": "Anjali Singh",
        "dob":  "1995-11-08",
        "question": "When will my financial situation improve?",
        "intent":   "finance",
    },
    {
        "id": "TC04",
        "name": "Vikram Nair",
        "dob":  "1988-01-29",
        "question": "What does my spiritual path look like in the next 2 years?",
        "intent":   "spirituality",
    },
    {
        "id": "TC05",
        "name": "Meera Patel",
        "dob":  "1992-05-03",
        "question": "Will I get a promotion or job change this year?",
        "intent":   "career",
    },
]

TRADITIONS = ["Indian Numerology", "Chaldean Numerology", "Pythagorean Numerology"]

# ── Scoring rubric ────────────────────────────────────────────────────────────

def score_answer(answer: str, question: str, intent: str) -> dict:
    """Score an answer on 4 dimensions (0-25 each, total 0-100)."""
    al = answer.lower()
    ql = question.lower()

    # 1. Directness: does sentence 1 answer the question directly?
    sentences = [s.strip() for s in answer.split(".") if s.strip()]
    first_sent = sentences[0].lower() if sentences else ""
    intent_words = {
        "marriage":    ["marry","marriage","partner","relationship","wed","union"],
        "career":      ["business","career","job","promotion","work","profession","start"],
        "finance":     ["financ","money","wealth","income","improv","prosper"],
        "spirituality":["spiritual","soul","path","dharma","consciousness","awakening"],
    }
    direct_kws = intent_words.get(intent, [])
    directness = 25 if any(kw in first_sent for kw in direct_kws) else (
                 12 if any(kw in al for kw in direct_kws) else 0)

    # 2. Specificity: does it mention a specific year (2025 or 2026)?
    specificity = 25 if ("2025" in answer or "2026" in answer) else 0

    # 3. Number grounding: does it reference actual numbers (digits 1-9, 11, 22, 33)?
    import re
    nums_found = re.findall(r'\b(life path|personal year|destiny|soul urge)\b', al)
    number_refs = re.findall(r'\b([1-9]|11|22|33)\b', answer)
    grounding = min(25, len(nums_found) * 10 + len(number_refs) * 5)

    # 4. No generic opener (penalty for "From the X perspective", "As a numerologist")
    bad_openers = ["from the", "as a numerologist", "in numerology,", "numerology says"]
    opener_penalty = 25 if not any(bo in first_sent for bo in bad_openers) else 5

    total = directness + specificity + grounding + opener_penalty
    return {
        "directness":    directness,
        "specificity":   specificity,
        "grounding":     grounding,
        "no_generic_opener": opener_penalty,
        "total":         total,
    }


def fmt_score(s: dict) -> str:
    return (f"[{s['total']:3d}/100] direct={s['directness']} "
            f"specific={s['specificity']} ground={s['grounding']} opener={s['no_generic_opener']}")


# ── Run comparison ────────────────────────────────────────────────────────────

def run_test():
    from utils.numerics import reduce_number
    from agents.numerology_agent import TRADITION_MAPS, _build_numerology_prediction
    from numerology_rag.hybrid_engine import hybrid_numerology_answer

    rows = []
    total_static = 0
    total_hybrid = 0
    count = 0

    for tc in TEST_CASES:
        for tradition in TRADITIONS:
            lmap_fn = TRADITION_MAPS[tradition]
            lmap = lmap_fn()

            # Compute numbers from DOB and name
            lp   = reduce_number(sum(int(c) for c in tc["dob"].replace("-", "")))
            name_lower = tc["name"].replace(" ", "").lower()
            nm  = reduce_number(sum(ord(c) - 96 for c in name_lower if c.isalpha()))
            su  = reduce_number(sum(ord(c) - 96 for c in name_lower if c in "aeiou") or 9)
            dest = reduce_number(nm)
            pn  = reduce_number(nm - su if nm > su else nm + su)

            # ── Static baseline ──────────────────────────────────────────────
            t0 = time.time()
            static_ans = _build_numerology_prediction(lp, nm, dest, su, pn, tradition, tc["intent"], tc["dob"])
            static_ms = int((time.time() - t0) * 1000)

            # ── Hybrid answer ────────────────────────────────────────────────
            t1 = time.time()
            hybrid_ans = hybrid_numerology_answer(
                name=tc["name"], dob=tc["dob"],
                life_path=lp, destiny=dest,
                soul_urge_num=su, name_number_val=nm,
                tradition=tradition, intent=tc["intent"], question=tc["question"],
                static_fallback=static_ans,
                timeout_seconds=25,
            )
            hybrid_ms = int((time.time() - t1) * 1000)

            ss = score_answer(static_ans, tc["question"], tc["intent"])
            hs = score_answer(hybrid_ans, tc["question"], tc["intent"])

            total_static += ss["total"]
            total_hybrid += hs["total"]
            count += 1

            rows.append({
                "tc":        tc["id"],
                "tradition": tradition.replace(" Numerology", ""),
                "question":  tc["question"],
                "intent":    tc["intent"],
                "static_ans":  static_ans,
                "hybrid_ans":  hybrid_ans,
                "static_score": ss,
                "hybrid_score": hs,
                "static_ms": static_ms,
                "hybrid_ms": hybrid_ms,
                "improved": hs["total"] > ss["total"],
            })

            print(f"  {tc['id']} {tradition[:8]:8s} | static={ss['total']:3d} hybrid={hs['total']:3d} "
                  f"({'↑' if hs['total'] > ss['total'] else '=' if hs['total'] == ss['total'] else '↓'}) "
                  f"| {hybrid_ms}ms")

    return rows, total_static / count, total_hybrid / count


# ── Report generation ─────────────────────────────────────────────────────────

def write_report(rows, avg_static, avg_hybrid):
    improvement = avg_hybrid - avg_static
    pct = (improvement / avg_static * 100) if avg_static else 0

    lines = [
        "# Numerology Hybrid RAG — Accuracy Report",
        f"\n**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"\n## Summary\n",
        f"| Metric | Static Template | Hybrid RAG+RAGless | Delta |",
        f"|--------|----------------|-------------------|-------|",
        f"| Avg Score (0-100) | {avg_static:.1f} | {avg_hybrid:.1f} | **{improvement:+.1f} ({pct:+.1f}%)** |",
        f"| Test cases | {len(rows)} | {len(rows)} | — |",
        f"\n## Scoring Rubric\n",
        "Each answer is scored on 4 dimensions (25 pts each):",
        "- **Directness** (25): First sentence answers the question intent",
        "- **Specificity** (25): Names a specific year (2025 or 2026)",
        "- **Grounding** (25): References actual numerology numbers",
        "- **No Generic Opener** (25): Avoids 'From the X perspective' type openers",
        "",
    ]

    improved = sum(1 for r in rows if r["improved"])
    lines.append(f"\n## Results: {improved}/{len(rows)} cases improved\n")

    for r in rows:
        ss, hs = r["static_score"], r["hybrid_score"]
        marker = "↑ IMPROVED" if hs["total"] > ss["total"] else ("= SAME" if hs["total"] == ss["total"] else "↓ REGRESSED")
        lines += [
            f"### {r['tc']} — {r['tradition']} | Intent: `{r['intent']}` | {marker}",
            f"> **Question:** {r['question']}",
            f"",
            f"**Static** `{fmt_score(ss)}` ({r['static_ms']}ms)",
            f"```",
            r["static_ans"],
            f"```",
            f"",
            f"**Hybrid** `{fmt_score(hs)}` ({r['hybrid_ms']}ms)",
            f"```",
            r["hybrid_ans"],
            f"```",
            f"",
        ]

    out = Path(__file__).parent / "accuracy_report.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nReport saved → {out}")
    return out


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Running accuracy comparison test...\n")
    print(f"{'TC':4s} {'Tradition':8s}  static  hybrid  diff  latency")
    print("─" * 60)
    rows, avg_s, avg_h = run_test()
    print(f"\n{'─'*60}")
    print(f"Average → static: {avg_s:.1f}  hybrid: {avg_h:.1f}  delta: {avg_h-avg_s:+.1f}")
    write_report(rows, avg_s, avg_h)
