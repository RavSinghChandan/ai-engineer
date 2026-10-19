"""
Model-comparison evaluation — reproducible.

    python -m fde.evals                                  # suite + models from config
    python -m fde.evals --models deepseek-chat,deepseek-reasoner
    python -m fde.evals --offline                        # no API calls (pipeline smoke test)

Inputs (committed to the repo):
    evals/<suite>.json   prompt template, system prompt, test cases, checks

Outputs (committed, so anyone can diff runs):
    evals/reports/<suite>_<UTC timestamp>.json   every prompt, output, check, score, latency, tokens, cost
    evals/reports/<suite>_<UTC timestamp>.md     human-readable summary
    evals/reports/<suite>_latest.json            copy of the newest live run (the dashboard reads it)

Reproducibility: temperature 0, fixed cases, and the report stores the git
commit, a SHA-256 of the suite file, the exact prompts sent, model names,
parameters and the pricing used for cost. LLM outputs can still vary slightly
between runs even at temperature 0, which is why the raw outputs are kept.

Check types (each scores 0..1; case score = mean; pass = score ≥ threshold):
    json_valid                              output parses as JSON
    has_keys       keys=[...]               all keys present
    recall         field, expected=[...]    share of expected items found (case-insensitive)
    contains_any   field?, values=[...]     at least one value appears
    not_contains   field?, values=[...]     none of the values appear (e.g. invented facts, PII)
    number_between field, min, max          numeric field within range
    equals         field, value             exact match (case-insensitive for strings)
    max_words      field?, max              length limit
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import statistics
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fde import config


# ── model client (OpenAI-compatible chat completions) ────────────────────────

def call_model(model: str, system: str, user: str, *, temperature: float, max_tokens: int,
               timeout: float = 120) -> Dict[str, Any]:
    key = os.environ.get(config.EVAL_API_KEY_ENV, "")
    if not key:
        raise RuntimeError(f"{config.EVAL_API_KEY_ENV} is not set")
    body = json.dumps({
        "model": model, "temperature": temperature, "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(
        config.EVAL_BASE_URL.rstrip("/") + "/chat/completions", data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode())
    latency_ms = (time.perf_counter() - t0) * 1000
    usage = data.get("usage", {})
    return {
        "text": data["choices"][0]["message"].get("content") or "",
        "latency_ms": round(latency_ms, 1),
        "prompt_tokens": int(usage.get("prompt_tokens", 0)),
        "completion_tokens": int(usage.get("completion_tokens", 0)),
    }


def _offline_model(case: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic stand-in that returns the case's reference answer (pipeline test only)."""
    ref = case.get("reference", {})
    return {"text": json.dumps(ref) if not isinstance(ref, str) else ref,
            "latency_ms": 0.0, "prompt_tokens": 0, "completion_tokens": 0}


# ── scoring ───────────────────────────────────────────────────────────────────

def parse_json(text: str) -> Optional[Any]:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        return json.loads(t)
    except ValueError:
        m = re.search(r"\{.*\}|\[.*\]", t, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except ValueError:
                return None
    return None


def _field(parsed: Any, text: str, path: Optional[str]) -> Any:
    if not path:
        return text
    cur = parsed
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _as_text(v: Any) -> str:
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False).lower()
    return str(v if v is not None else "").lower()


def run_check(check: Dict[str, Any], text: str, parsed: Any) -> Tuple[float, str]:
    kind = check["type"]
    val = _field(parsed, text, check.get("field"))
    if kind == "json_valid":
        return (1.0, "valid JSON") if parsed is not None else (0.0, "not JSON")
    if kind == "has_keys":
        missing = [k for k in check["keys"] if not isinstance(parsed, dict) or k not in parsed]
        return (1.0 - len(missing) / len(check["keys"]), f"missing {missing}" if missing else "all keys")
    if kind == "recall":
        hay = _as_text(val)
        found = [e for e in check["expected"] if e.lower() in hay]
        return (len(found) / len(check["expected"]), f"{len(found)}/{len(check['expected'])} found")
    if kind == "contains_any":
        hay = _as_text(val)
        hit = [v for v in check["values"] if v.lower() in hay]
        return (1.0, f"found {hit[0]!r}") if hit else (0.0, "none found")
    if kind == "not_contains":
        hay = _as_text(val)
        hit = [v for v in check["values"] if v.lower() in hay]
        return (0.0, f"contains {hit}") if hit else (1.0, "clean")
    if kind == "number_between":
        try:
            n = float(val)
        except (TypeError, ValueError):
            return 0.0, f"not a number: {val!r}"
        ok = check["min"] <= n <= check["max"]
        return (1.0 if ok else 0.0, f"{n} {'in' if ok else 'outside'} [{check['min']}, {check['max']}]")
    if kind == "equals":
        a, b = val, check["value"]
        ok = (str(a).lower() == str(b).lower()) if isinstance(b, str) else a == b
        return (1.0 if ok else 0.0, f"{a!r}")
    if kind == "max_words":
        n = len(_as_text(val).split())
        return (1.0 if n <= check["max"] else 0.0, f"{n} words")
    raise ValueError(f"unknown check type '{kind}'")


def score_case(case: Dict[str, Any], text: str) -> Dict[str, Any]:
    parsed = parse_json(text)
    results = []
    for chk in case.get("checks", []):
        try:
            s, note = run_check(chk, text, parsed)
        except Exception as exc:
            s, note = 0.0, f"check error: {exc}"
        results.append({**chk, "score": round(s, 3), "note": note})
    score = statistics.fmean(r["score"] for r in results) if results else 0.0
    return {"score": round(score, 3), "passed": score >= case.get("pass_threshold", 0.8), "checks": results}


# ── run ───────────────────────────────────────────────────────────────────────

def _cost(model: str, pt: int, ct: int) -> float:
    p = config.MODEL_PRICING.get(model) or {"input": 0.0, "output": 0.0}
    return (pt * p["input"] + ct * p["output"]) / 1_000_000


def _git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True,
                              text=True, timeout=5, cwd=config.PROJECT_ROOT).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def run_suite(suite_path: Path, models: List[str], *, offline: bool = False) -> Dict[str, Any]:
    raw = suite_path.read_bytes()
    suite = json.loads(raw)
    if suite.get("prompt_ref"):
        # Evaluate the exact prompt production uses, not a copy that can drift.
        system, template, version = config.load_prompt(suite["prompt_ref"])
        suite["user_template"] = template
        suite["prompt_version"] = f"{suite['prompt_ref']}@{version}"
    else:
        system = suite["system_prompt"]
    params = {"temperature": suite.get("temperature", 0.0), "max_tokens": suite.get("max_tokens", 800)}
    rows: List[Dict[str, Any]] = []
    for model in models:
        for case in suite["cases"]:
            prompt = suite["user_template"].format(**case["input"])
            try:
                res = _offline_model(case) if offline else call_model(model, system, prompt, **params)
                err = None
            except (urllib.error.URLError, RuntimeError, KeyError, ValueError, TimeoutError) as exc:
                res, err = {"text": "", "latency_ms": 0.0, "prompt_tokens": 0, "completion_tokens": 0}, str(exc)
            scored = score_case(case, res["text"]) if err is None else {"score": 0.0, "passed": False, "checks": []}
            rows.append({
                "model": model, "case_id": case["id"], "tags": case.get("tags", []),
                "prompt": prompt, "output": res["text"], "error": err,
                "latency_ms": res["latency_ms"], "prompt_tokens": res["prompt_tokens"],
                "completion_tokens": res["completion_tokens"],
                "cost_usd": round(_cost(model, res["prompt_tokens"], res["completion_tokens"]), 6),
                **scored,
            })
    summary = []
    for model in models:
        mr = [r for r in rows if r["model"] == model]
        passed = sum(r["passed"] for r in mr)
        cost = sum(r["cost_usd"] for r in mr)
        lat = sorted(r["latency_ms"] for r in mr if not r["error"])
        summary.append({
            "model": model,
            "cases": len(mr),
            "passed": passed,
            "pass_rate_pct": round(passed / len(mr) * 100, 1) if mr else 0.0,
            "mean_score": round(statistics.fmean(r["score"] for r in mr), 3) if mr else 0.0,
            "errors": sum(1 for r in mr if r["error"]),
            "latency_p50_ms": round(statistics.median(lat), 1) if lat else None,
            "latency_max_ms": max(lat) if lat else None,
            "total_tokens": sum(r["prompt_tokens"] + r["completion_tokens"] for r in mr),
            "total_cost_usd": round(cost, 6),
            "cost_per_passed_case_usd": round(cost / passed, 6) if passed else None,
        })
    return {
        "suite": suite["name"],
        "description": suite.get("description", ""),
        "mode": "offline-smoke-test" if offline else "live",
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reproducibility": {
            "git_commit": _git_commit(),
            "suite_file": str(suite_path.relative_to(config.PROJECT_ROOT)) if suite_path.is_relative_to(config.PROJECT_ROOT) else str(suite_path),
            "suite_sha256": hashlib.sha256(raw).hexdigest(),
            "system_prompt_sha256": hashlib.sha256(system.encode()).hexdigest(),
            "prompt_version": suite.get("prompt_version", "inline"),
            "params": params,
            "provider_base_url": config.EVAL_BASE_URL,
            "pricing_usd_per_1m_tokens": {m: config.MODEL_PRICING.get(m) for m in models},
            "pricing_note": config.PRICING_NOTE,
            "python": platform.python_version(),
            "command": f"python -m fde.evals --suite {suite_path.name} --models {','.join(models)}"
                       + (" --offline" if offline else ""),
        },
        "system_prompt": system,
        "user_template": suite["user_template"],
        "summary": summary,
        "results": rows,
    }


def to_markdown(rep: Dict[str, Any]) -> str:
    r = rep["reproducibility"]
    lines = [
        f"# Model comparison — {rep['suite']}",
        "",
        rep["description"],
        "",
        f"- **Run:** {rep['run_at']} · mode `{rep['mode']}` · commit `{r['git_commit']}`",
        f"- **Suite:** `{r['suite_file']}` (sha256 `{r['suite_sha256'][:12]}…`) · prompt `{r['prompt_version']}`",
        f"- **Params:** temperature {r['params']['temperature']}, max_tokens {r['params']['max_tokens']}",
        f"- **Reproduce:** `{r['command']}`",
        f"- **Pricing:** {r['pricing_note']}",
        "",
        "| Model | Pass rate | Mean score | P50 latency | Total tokens | Total cost | Cost per passed case | Errors |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for s in rep["summary"]:
        cpp = f"${s['cost_per_passed_case_usd']:.6f}" if s["cost_per_passed_case_usd"] is not None else "—"
        lat = f"{s['latency_p50_ms'] / 1000:.2f} s" if s["latency_p50_ms"] is not None else "—"
        lines.append(f"| `{s['model']}` | {s['passed']}/{s['cases']} ({s['pass_rate_pct']}%) | {s['mean_score']} "
                     f"| {lat} | {s['total_tokens']} | ${s['total_cost_usd']:.6f} | {cpp} | {s['errors']} |")
    lines += ["", "## Per case", "", "| Case | Model | Score | Pass | Latency | Notes |", "|---|---|---:|:---:|---:|---|"]
    for x in rep["results"]:
        notes = x["error"] or "; ".join(f"{c['type']}: {c['note']}" for c in x["checks"] if c["score"] < 1)
        lines.append(f"| {x['case_id']} | `{x['model']}` | {x['score']} | {'✅' if x['passed'] else '❌'} "
                     f"| {x['latency_ms'] / 1000:.2f} s | {notes or 'all checks passed'} |")
    lines += ["", "Prompts and raw outputs for every case are in the JSON report next to this file.", ""]
    return "\n".join(lines)


def write_report(rep: Dict[str, Any], out_dir: Path) -> Tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = rep["run_at"].replace(":", "").replace("-", "").replace("+0000", "Z")
    tag = "_offline" if rep["mode"] != "live" else ""
    base = out_dir / f"{rep['suite']}{tag}_{stamp}"
    jpath, mpath = base.with_suffix(".json"), base.with_suffix(".md")
    jpath.write_text(json.dumps(rep, indent=2, ensure_ascii=False) + "\n")
    mpath.write_text(to_markdown(rep))
    if rep["mode"] == "live":
        shutil.copyfile(jpath, out_dir / f"{rep['suite']}_latest.json")
    return jpath, mpath


def latest_report(suite: Optional[str] = None) -> Optional[Dict[str, Any]]:
    d = config.EVAL_REPORTS_DIR
    candidates = sorted(d.glob(f"{suite or '*'}_latest.json")) if d.exists() else []
    if not candidates:
        return None
    rep = json.loads(max(candidates, key=lambda p: p.stat().st_mtime).read_text())
    # The dashboard needs the summary and per-case scores, not every raw output.
    rep["results"] = [{k: v for k, v in r.items() if k not in ("prompt", "output")} for r in rep["results"]]
    return rep


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--suite", default=config.EVAL_DEFAULT_SUITE, help="file name inside evals/")
    ap.add_argument("--models", default=",".join(config.EVAL_MODELS))
    ap.add_argument("--offline", action="store_true", help="no API calls; reference answers")
    ap.add_argument("--out", default=str(config.EVAL_REPORTS_DIR))
    a = ap.parse_args(argv)
    suite_path = config.EVAL_DIR / a.suite
    rep = run_suite(suite_path, [m.strip() for m in a.models.split(",") if m.strip()], offline=a.offline)
    jpath, mpath = write_report(rep, Path(a.out))
    for s in rep["summary"]:
        print(f"{s['model']:<22} pass {s['passed']}/{s['cases']}  score {s['mean_score']:<6} "
              f"p50 {s['latency_p50_ms']} ms  cost ${s['total_cost_usd']:.6f}")
    print(f"report: {jpath}\n        {mpath}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
