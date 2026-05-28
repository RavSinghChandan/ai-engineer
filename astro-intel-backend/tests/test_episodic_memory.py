"""
Tests for the episodic memory + persona injection system.
Run: pytest tests/test_episodic_memory.py -v
"""
from __future__ import annotations

import os
import tempfile
import time

# Use a temp file DB — :memory: gives a new connection each call so tables vanish
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["SQLITE_DB_PATH"] = _tmp.name

import pytest
import database
from memory.episodic import (
    init_episodic_tables,
    log_correction,
    retrieve_similar_corrections,
    list_corrections,
    correction_stats,
    set_persona_pref,
    get_persona_prefs,
)
from memory.persona import build_chandan_context, format_for_prompt, CHANDAN_PERSONA


@pytest.fixture(autouse=True)
def fresh_db():
    """Re-initialise tables before each test."""
    database.init_db()
    init_episodic_tables()
    yield


# ── log_correction ────────────────────────────────────────────────────────────

def test_log_correction_returns_int_id():
    row_id = log_correction(
        insight_id="q1_i1",
        original_text="Saturn may suggest challenges.",
        corrected_text="Saturn in your 10th house indicates a demanding career phase.",
        intent="career",
        reason_tag="tone",
    )
    assert isinstance(row_id, int)
    assert row_id >= 1


def test_log_multiple_corrections():
    ids = []
    for i in range(5):
        ids.append(log_correction(
            insight_id=f"q1_i{i}",
            original_text=f"Original insight number {i} about career growth.",
            corrected_text=f"Corrected insight {i}: specific and direct career prediction.",
            intent="career",
        ))
    assert len(set(ids)) == 5  # all unique IDs


# ── retrieve_similar_corrections ─────────────────────────────────────────────

def test_retrieve_returns_similar_entry():
    log_correction(
        insight_id="q1_i1",
        original_text="Saturn may suggest career challenges in the coming months.",
        corrected_text="Saturn in 10th house indicates demanding growth through mid-2026.",
        intent="career",
        reason_tag="tone",
    )
    results = retrieve_similar_corrections("Saturn career challenges growth", intent="career")
    assert len(results) >= 1
    assert results[0]["score"] > 0.1
    assert "corrected" in results[0]


def test_retrieve_empty_when_no_match():
    log_correction(
        insight_id="q1_i1",
        original_text="Jupiter brings spiritual abundance and inner peace.",
        corrected_text="Jupiter in your 9th house ignites a profound spiritual quest.",
        intent="spirituality",
    )
    # Query on completely unrelated topic
    results = retrieve_similar_corrections("xyzmno qwerty gibberish", intent="career")
    assert results == []


def test_retrieve_respects_top_k():
    for i in range(10):
        log_correction(
            insight_id=f"q1_i{i}",
            original_text=f"Mars may suggest career energy in month {i}.",
            corrected_text=f"Mars activates career drive in month {i} — take decisive action.",
            intent="career",
        )
    results = retrieve_similar_corrections("Mars career energy", intent="career", top_k=3)
    assert len(results) <= 3


def test_retrieve_scores_sorted_descending():
    log_correction(
        insight_id="q1_i1",
        original_text="Career challenges may arise this year.",
        corrected_text="Career obstacles are temporary — Saturn rewards sustained effort.",
        intent="career",
    )
    log_correction(
        insight_id="q1_i2",
        original_text="Mars career drive energy month activation.",
        corrected_text="Mars activates raw career drive — channel it into the project that matters most.",
        intent="career",
    )
    results = retrieve_similar_corrections("career challenges this year", intent="career", top_k=5)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


# ── list_corrections + stats ──────────────────────────────────────────────────

def test_list_corrections_default():
    log_correction(insight_id="q1_i1", original_text="Original.", corrected_text="Corrected.", intent="career")
    log_correction(insight_id="q1_i2", original_text="Original 2.", corrected_text="Corrected 2.", intent="spirituality")
    rows = list_corrections()
    assert len(rows) >= 2
    assert "original" in rows[0]
    assert "corrected" in rows[0]


def test_list_corrections_filter_by_intent():
    log_correction(insight_id="q1_i1", original_text="Original.", corrected_text="Corrected.", intent="career")
    log_correction(insight_id="q1_i2", original_text="Original 2.", corrected_text="Corrected 2.", intent="health")
    rows = list_corrections(intent="career")
    assert all(r["intent"] == "career" for r in rows)


def test_correction_stats_counts_correctly():
    log_correction(insight_id="q1_i1", original_text="Career original.", corrected_text="Career corrected.", intent="career")
    log_correction(insight_id="q1_i2", original_text="Career original 2.", corrected_text="Career corrected 2.", intent="career")
    log_correction(insight_id="q1_i3", original_text="Spiritual original.", corrected_text="Spiritual corrected.", intent="spirituality")
    stats = correction_stats()
    assert stats["total_corrections"] >= 3
    assert stats["by_intent"].get("career", 0) >= 2
    assert stats["by_intent"].get("spirituality", 0) >= 1


# ── persona preferences ───────────────────────────────────────────────────────

def test_set_and_get_persona_pref():
    set_persona_pref("remedy_format", "Always include specific day and time.")
    prefs = get_persona_prefs()
    assert "remedy_format" in prefs
    assert "specific day" in prefs["remedy_format"]


def test_persona_pref_upsert():
    set_persona_pref("tone", "scientific-spiritual")
    set_persona_pref("tone", "precise-vedic")  # overwrite
    prefs = get_persona_prefs()
    assert prefs["tone"] == "precise-vedic"


# ── persona context builder ───────────────────────────────────────────────────

def test_build_chandan_context_structure():
    ctx = build_chandan_context("Will my career improve?", intent="career")
    assert "persona_prompt" in ctx
    assert "past_corrections" in ctx
    assert "preference_overrides" in ctx
    assert "correction_summary" in ctx
    assert CHANDAN_PERSONA in ctx["persona_prompt"]


def test_build_chandan_context_includes_past_corrections():
    log_correction(
        insight_id="q1_i1",
        original_text="Saturn may suggest career delays this year.",
        corrected_text="Saturn directly indicates a period of structured career growth — delays are temporary.",
        intent="career",
    )
    ctx = build_chandan_context("career delays Saturn year", intent="career")
    assert len(ctx["past_corrections"]) >= 1


def test_format_for_prompt_includes_persona():
    ctx = build_chandan_context("general reading", intent="general")
    block = format_for_prompt(ctx)
    assert "TONE RULES" in block
    assert "FORBIDDEN PATTERNS" in block


def test_format_for_prompt_includes_corrections_when_present():
    log_correction(
        insight_id="q1_i1",
        original_text="Jupiter may suggest spiritual growth opportunities.",
        corrected_text="Jupiter in 9th house opens a direct path to spiritual mastery.",
        intent="spirituality",
    )
    ctx = build_chandan_context("Jupiter spiritual growth opportunities", intent="spirituality")
    block = format_for_prompt(ctx)
    if ctx["past_corrections"]:
        assert "LEARNED CORRECTIONS" in block


def test_format_for_prompt_includes_preference_overrides():
    set_persona_pref("closing_style", "End each insight with a specific actionable remedy.")
    ctx = build_chandan_context("general query", intent="general")
    block = format_for_prompt(ctx)
    assert "closing_style" in block
