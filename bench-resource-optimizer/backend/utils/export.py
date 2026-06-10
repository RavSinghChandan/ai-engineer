"""
Plan Export Utility — Optimization: export training plans as CSV or JSON summary.

Provides two formats:
  - CSV: importable into Excel/Sheets for manager reporting
  - Summary JSON: lightweight digest for dashboards / email

Why useful: managers need to share progress reports outside the app.
"""
from __future__ import annotations

import csv
import io
import json
import time
from typing import Any, Dict, List, Optional


def plan_to_csv(user_id: str, role: str, plan: Dict[str, Any], completed_ids: List[str]) -> str:
    """
    Convert a training plan to CSV string.

    Columns: day, task_id, task_title, skill, hours, status, resource
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header row
    writer.writerow(["day", "task_id", "task_title", "skill", "hours", "status", "resource"])

    tasks = plan.get("tasks", [])
    completed_set = set(completed_ids)

    for task in tasks:
        task_id = task.get("id", "")
        status = "completed" if task_id in completed_set else "pending"
        writer.writerow([
            task.get("day", ""),
            task_id,
            task.get("title", task.get("task", "")),
            task.get("skill", ""),
            task.get("hours", ""),
            status,
            task.get("resource", ""),
        ])

    return output.getvalue()


def plan_to_summary(
    user_id: str,
    role: str,
    plan: Dict[str, Any],
    completed_ids: List[str],
    readiness_score: float,
) -> Dict[str, Any]:
    """
    Lightweight JSON digest of a training plan — for dashboards and email digests.
    """
    tasks = plan.get("tasks", [])
    total = len(tasks)
    completed_set = set(completed_ids)
    done = len([t for t in tasks if t.get("id", "") in completed_set])
    remaining = total - done

    # Group tasks by skill
    skill_counts: Dict[str, int] = {}
    skill_done: Dict[str, int] = {}
    for task in tasks:
        skill = task.get("skill", "unknown")
        skill_counts[skill] = skill_counts.get(skill, 0) + 1
        if task.get("id", "") in completed_set:
            skill_done[skill] = skill_done.get(skill, 0) + 1

    skills_breakdown = [
        {
            "skill": skill,
            "total_tasks": skill_counts[skill],
            "completed": skill_done.get(skill, 0),
            "progress_pct": round(skill_done.get(skill, 0) / skill_counts[skill] * 100, 1),
        }
        for skill in skill_counts
    ]
    skills_breakdown.sort(key=lambda x: x["progress_pct"], reverse=True)

    return {
        "user_id": user_id,
        "role": role,
        "readiness_score": readiness_score,
        "total_tasks": total,
        "completed_tasks": done,
        "remaining_tasks": remaining,
        "completion_pct": round(done / total * 100, 1) if total else 0.0,
        "skills_breakdown": skills_breakdown,
        "plan_duration_days": plan.get("duration_days", 7),
        "generated_at": plan.get("generated_at", ""),
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def predict_completion(
    history: List[Dict[str, Any]],
    current_score: float,
    total_tasks: int,
    completed_tasks: int,
) -> Dict[str, Any]:
    """
    Predict when a user will reach 100% readiness based on task completion velocity.

    Algorithm:
      1. Compute average tasks completed per day from readiness history
      2. Extrapolate linearly to 100%
      3. Return predicted date + confidence band

    Returns a dict with prediction details. If insufficient history, returns
    a conservative estimate based on industry average (2 tasks/day).
    """
    INDUSTRY_AVG_TASKS_PER_DAY = 2.0

    remaining_tasks = total_tasks - completed_tasks
    if remaining_tasks <= 0:
        return {
            "status": "complete",
            "predicted_days_remaining": 0,
            "predicted_completion_date": time.strftime("%Y-%m-%d"),
            "confidence": "HIGH",
            "tasks_per_day": 0.0,
            "basis": "already_complete",
        }

    # Need at least 2 history points to compute velocity
    if len(history) < 2:
        days_remaining = max(1, round(remaining_tasks / INDUSTRY_AVG_TASKS_PER_DAY))
        completion_ts = time.time() + days_remaining * 86400
        return {
            "status": "in_progress",
            "predicted_days_remaining": days_remaining,
            "predicted_completion_date": time.strftime("%Y-%m-%d", time.gmtime(completion_ts)),
            "confidence": "LOW",
            "tasks_per_day": INDUSTRY_AVG_TASKS_PER_DAY,
            "basis": "industry_average",
            "note": "Need more activity data for a personalised prediction. Check back after completing a few tasks.",
        }

    # Compute score velocity: points gained per day
    oldest = history[0]
    newest = history[-1]
    elapsed_days = (newest["ts"] - oldest["ts"]) / 86400
    if elapsed_days < 0.01:
        elapsed_days = 0.01

    score_gain_per_day = (newest["score"] - oldest["score"]) / elapsed_days

    if score_gain_per_day <= 0:
        # No progress or going backwards — use conservative estimate
        days_remaining = round(remaining_tasks / INDUSTRY_AVG_TASKS_PER_DAY)
        completion_ts = time.time() + days_remaining * 86400
        return {
            "status": "stalled",
            "predicted_days_remaining": days_remaining,
            "predicted_completion_date": time.strftime("%Y-%m-%d", time.gmtime(completion_ts)),
            "confidence": "LOW",
            "tasks_per_day": INDUSTRY_AVG_TASKS_PER_DAY,
            "basis": "no_recent_progress",
            "note": "No progress detected in recent sessions. Estimate based on industry average.",
        }

    # Extrapolate: days to go from current_score to 100
    score_remaining = 100.0 - current_score
    days_to_complete = score_remaining / score_gain_per_day

    # Clamp to sane range
    days_remaining = max(1, round(days_to_complete))
    completion_ts = time.time() + days_remaining * 86400

    # Confidence based on data density
    if len(history) >= 5:
        confidence = "HIGH"
    elif len(history) >= 3:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # Tasks per day approximation
    tasks_per_day = round(score_gain_per_day / 100 * total_tasks, 1) if total_tasks else 0

    return {
        "status": "in_progress",
        "predicted_days_remaining": days_remaining,
        "predicted_completion_date": time.strftime("%Y-%m-%d", time.gmtime(completion_ts)),
        "confidence": confidence,
        "tasks_per_day": tasks_per_day,
        "score_velocity_per_day": round(score_gain_per_day, 2),
        "basis": "historical_velocity",
        "history_points_used": len(history),
    }
