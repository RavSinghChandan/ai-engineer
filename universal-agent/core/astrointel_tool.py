"""
AstroIntel 360° reading tool for Jyoti.

When a user provides their name, date of birth, and question,
this tool calls the real AstroIntel backend pipeline, runs the
full 18-agent analysis, approves all insights, and returns a
human-readable verdict from the actual report — not LLM imagination.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, Optional

import requests
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# ── Config (read from env so nothing is hardcoded) ────────────────────────────
_BACKEND_URL = os.environ.get("ASTROINTEL_BACKEND_URL", "http://localhost:8080")
_API_KEY     = os.environ.get("ASTROINTEL_API_KEY", "sk-master-astrointel-change-me")
_TIMEOUT     = 120   # full pipeline can take ~20-30s

# ── Auth helper ───────────────────────────────────────────────────────────────

_jwt_token: str = ""


def _get_jwt(force: bool = False) -> str:
    """Login as superadmin and return a JWT. Re-fetches when force=True or empty."""
    global _jwt_token
    if _jwt_token and not force:
        return _jwt_token
    backend = os.environ.get("ASTROINTEL_BACKEND_URL", _BACKEND_URL)
    password = os.environ.get("SUPERADMIN_PASSWORD", "AuraAdmin2024!")
    try:
        resp = requests.post(
            f"{backend}/auth/login",
            json={"email": "admin@aura.local", "password": password},
            timeout=10,
        )
        resp.raise_for_status()
        _jwt_token = resp.json()["access_token"]
    except Exception as e:
        logger.warning("AstroIntel login failed: %s", e)
    return _jwt_token


def _headers(refresh: bool = False) -> Dict[str, str]:
    api_key = os.environ.get("ASTROINTEL_API_KEY", _API_KEY)
    return {
        "Content-Type":  "application/json",
        "X-API-Key":     api_key,
        "Authorization": f"Bearer {_get_jwt(force=refresh)}",
    }


# ── Parse DOB from natural language ─────────────────────────────────────────

def _parse_dob(raw: str) -> str:
    """Convert '15 March 1990', '1990-03-15', '15/03/1990' → 'YYYY-MM-DD'."""
    raw = raw.strip()
    # Already ISO
    if re.match(r"\d{4}-\d{2}-\d{2}", raw):
        return raw
    # DD/MM/YYYY or DD-MM-YYYY
    m = re.match(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", raw)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # "15 March 1990" or "March 15 1990"
    MONTHS = {
        "jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
        "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12,
        "january":1,"february":2,"march":3,"april":4,"june":6,
        "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    }
    parts = re.split(r"[\s,]+", raw.lower())
    day = month = year = None
    for p in parts:
        if p in MONTHS:
            month = MONTHS[p]
        elif re.match(r"\d{4}", p):
            year = int(p)
        elif re.match(r"\d{1,2}", p):
            day = int(p)
    if day and month and year:
        return f"{year}-{str(month).zfill(2)}-{str(day).zfill(2)}"
    return raw   # return as-is; backend will validate


# ── Format report into spoken verdict ────────────────────────────────────────

def _format_verdict(report: Dict[str, Any], user_name: str, question: str) -> str:
    """
    Distil the full report into a short spoken verdict — 3-4 sentences max.
    Insights are dicts with a 'content' key. Remedies live at report top-level.
    """
    first_name = user_name.split()[0] if user_name else user_name

    # ── Pick the single strongest insight ─────────────────────────────────────
    best_insight = ""
    for sec in report.get("sections", []):
        for ins in sec.get("insights", []):
            content = ins.get("content", "") if isinstance(ins, dict) else str(ins)
            content = re.sub(r"\*+", "", content).strip()
            # Take first sentence only — insights can be very long
            first_sent = re.split(r"(?<=[.!?])\s+", content)[0].strip()
            if len(first_sent) > 20:
                best_insight = first_sent
                break
        if best_insight:
            break

    if not best_insight:
        return (
            f"The stars have spoken for you, {first_name}. "
            "The reading was completed but the core insight was unclear — "
            "please try asking again with a more specific question."
        )

    # ── Pick one remedy ────────────────────────────────────────────────────────
    remedies = report.get("remedies", {}) or {}
    remedy_line = ""

    mantras = remedies.get("mantras", [])
    if mantras:
        m = mantras[0]
        mantra_text = m.get("mantra", m) if isinstance(m, dict) else str(m)
        remedy_line = f"For your remedy, chant: {mantra_text}."

    if not remedy_line:
        habits = remedies.get("daily_habits", [])
        if habits:
            remedy_line = f"A practice for you: {habits[0]}"

    # ── Assemble the spoken verdict (3-4 sentences, voice-friendly) ───────────
    parts = [
        f"The reading is complete, {first_name}.",
        best_insight,
    ]
    if remedy_line:
        parts.append(remedy_line)

    return " ".join(parts)


# ── The actual LangChain tool ─────────────────────────────────────────────────

@tool
def run_astrointel_reading(
    full_name: str,
    date_of_birth: str,
    question: str,
    place_of_birth: str = "",
    time_of_birth: str = "",
    modules: str = "astrology,numerology,palmistry,tarot,vastu",
) -> str:
    """
    Run a complete AstroIntel 360° spiritual reading for a user.

    Use this tool WHENEVER a user provides their name AND date of birth AND a question.
    Do NOT answer from your own knowledge — always call this tool to get the real reading.

    Args:
        full_name:      The user's full name (e.g. "Priya Sharma")
        date_of_birth:  Date of birth in any format (e.g. "15 March 1990", "1990-03-15")
        question:       Their spiritual question (e.g. "What is my career path?")
        place_of_birth: City or place of birth (optional but improves accuracy)
        time_of_birth:  Time of birth HH:MM (optional but improves accuracy)
        modules:        Comma-separated list of modules to run (default: all five)

    Returns:
        A spoken verdict summarising the real AstroIntel report.
    """
    dob = _parse_dob(date_of_birth)
    selected = [m.strip() for m in modules.split(",") if m.strip()]

    payload: Dict[str, Any] = {
        "user_profile": {
            "full_name":      full_name,
            "alias_name":     full_name.split()[0] if full_name else "",
            "date_of_birth":  dob,
            "time_of_birth":  time_of_birth,
            "place_of_birth": place_of_birth,
        },
        "user_id":          "jyoti-voice",
        "user_question":    question,
        "questions":        [question],
        "selected_modules": selected,
        "prompt_version":   "v2",
        "bypass_cache":     False,
    }

    # Read backend URL at call time so env vars set after import are respected
    backend_url = os.environ.get("ASTROINTEL_BACKEND_URL", _BACKEND_URL)

    # ── Step 1: Run the full pipeline ─────────────────────────────────────────
    try:
        logger.info("AstroIntel tool: running pipeline for %s", full_name)
        run_resp = requests.post(
            f"{backend_url}/api/v1/analysis/run",
            headers=_headers(),
            json=payload,
            timeout=_TIMEOUT,
        )
        if run_resp.status_code == 401:
            run_resp = requests.post(
                f"{backend_url}/api/v1/analysis/run",
                headers=_headers(refresh=True),
                json=payload,
                timeout=_TIMEOUT,
            )
        run_resp.raise_for_status()
    except requests.Timeout:
        return (
            "The reading is taking longer than expected. "
            "Please try again in a moment — the pipeline is processing your chart."
        )
    except Exception as e:
        logger.exception("AstroIntel pipeline error: %s", e)
        return (
            "I was unable to reach the AstroIntel analysis engine right now. "
            "Please make sure the platform backend is running and try again."
        )

    run_data = run_resp.json()
    session_id = run_data.get("session_id")
    admin_review = run_data.get("admin_review", {})

    if not session_id:
        return "The analysis pipeline did not return a session. Please try again."

    # ── Step 2: Auto-approve all insights → generate final report ─────────────
    approved_ids: list[str] = [
        ins["id"]
        for q in admin_review.get("questions", [])
        for ins in q.get("insights", [])
    ]

    approval_payload = {
        "session_id":            session_id,
        "approved_insight_ids":  approved_ids,
        "rejected_insight_ids":  [],
        "brand_name":            "AstroIntel 360°",
        "logo_url":              "",
        "image_url":             "",
        "edited_insights":       [],
    }

    try:
        approve_resp = requests.post(
            f"{backend_url}/api/v1/analysis/approve",
            headers=_headers(),
            json=approval_payload,
            timeout=60,
        )
        approve_resp.raise_for_status()
    except Exception as e:
        logger.exception("AstroIntel approval error: %s", e)
        return (
            "The analysis ran successfully but the report could not be finalised. "
            f"Session ID: {session_id}"
        )

    final = approve_resp.json().get("final_report", {})
    return _format_verdict(final, full_name, question)
