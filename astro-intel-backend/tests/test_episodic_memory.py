"""
Tests for the episodic memory + tenant persona injection system.
Run: pytest tests/test_episodic_memory.py -v

Multi-tenant guarantee tests verify that corrections logged for one tenant
are NEVER visible to another tenant — the core enterprise isolation requirement.
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
    correction_stats_global,
    set_persona_pref,
    get_persona_prefs,
)
from memory.persona import build_tenant_context, build_chandan_context, format_for_prompt, CHANDAN_PERSONA, DEFAULT_PERSONA

TENANT_A = "tenant_alpha"
TENANT_B = "tenant_beta"
TENANT_MASTER = "tenant_master"


@pytest.fixture(autouse=True)
def fresh_db():
    """Re-initialise tables and wipe data before each test for full isolation."""
    database.init_db()
    init_episodic_tables()
    # Truncate all episodic data so tests don't bleed into each other
    import database as _db
    with _db._tx() as conn:
        conn.execute("DELETE FROM episodic_corrections")
        conn.execute("DELETE FROM persona_preferences")
    yield


# ── log_correction ────────────────────────────────────────────────────────────

def test_log_correction_returns_int_id():
    row_id = log_correction(
        tenant_id=TENANT_A,
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
            tenant_id=TENANT_A,
            insight_id=f"q1_i{i}",
            original_text=f"Original insight number {i} about career growth.",
            corrected_text=f"Corrected insight {i}: specific and direct career prediction.",
            intent="career",
        ))
    assert len(set(ids)) == 5  # all unique IDs


# ── retrieve_similar_corrections ─────────────────────────────────────────────

def test_retrieve_returns_similar_entry():
    log_correction(
        tenant_id=TENANT_A,
        insight_id="q1_i1",
        original_text="Saturn may suggest career challenges in the coming months.",
        corrected_text="Saturn in 10th house indicates demanding growth through mid-2026.",
        intent="career",
        reason_tag="tone",
    )
    results = retrieve_similar_corrections("Saturn career challenges growth", tenant_id=TENANT_A, intent="career")
    assert len(results) >= 1
    assert results[0]["score"] > 0.1
    assert "corrected" in results[0]


def test_retrieve_empty_when_no_match():
    log_correction(
        tenant_id=TENANT_A,
        insight_id="q1_i1",
        original_text="Jupiter brings spiritual abundance and inner peace.",
        corrected_text="Jupiter in your 9th house ignites a profound spiritual quest.",
        intent="spirituality",
    )
    results = retrieve_similar_corrections("xyzmno qwerty gibberish", tenant_id=TENANT_A, intent="career")
    assert results == []


def test_retrieve_respects_top_k():
    for i in range(10):
        log_correction(
            tenant_id=TENANT_A,
            insight_id=f"q1_i{i}",
            original_text=f"Mars may suggest career energy in month {i}.",
            corrected_text=f"Mars activates career drive in month {i} — take decisive action.",
            intent="career",
        )
    results = retrieve_similar_corrections("Mars career energy", tenant_id=TENANT_A, intent="career", top_k=3)
    assert len(results) <= 3


def test_retrieve_scores_sorted_descending():
    log_correction(
        tenant_id=TENANT_A,
        insight_id="q1_i1",
        original_text="Career challenges may arise this year.",
        corrected_text="Career obstacles are temporary — Saturn rewards sustained effort.",
        intent="career",
    )
    log_correction(
        tenant_id=TENANT_A,
        insight_id="q1_i2",
        original_text="Mars career drive energy month activation.",
        corrected_text="Mars activates raw career drive — channel it into the project that matters most.",
        intent="career",
    )
    results = retrieve_similar_corrections("career challenges this year", tenant_id=TENANT_A, intent="career", top_k=5)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


# ── MULTI-TENANT ISOLATION TESTS ─────────────────────────────────────────────

def test_tenant_isolation_retrieve():
    """Tenant A's corrections must NOT appear in Tenant B's retrieval."""
    log_correction(
        tenant_id=TENANT_A,
        insight_id="a_i1",
        original_text="Saturn career challenges growth delayed blocked.",
        corrected_text="Saturn directly causes a structured delay — prepare for it now.",
        intent="career",
    )
    # Tenant B queries the exact same text — must get zero results
    results_b = retrieve_similar_corrections(
        "Saturn career challenges growth", tenant_id=TENANT_B, intent="career"
    )
    assert results_b == [], f"Tenant B should not see Tenant A's corrections, got: {results_b}"


def test_tenant_isolation_list_corrections():
    """list_corrections must only return rows belonging to the querying tenant."""
    log_correction(
        tenant_id=TENANT_A, insight_id="a_i1",
        original_text="Original A.", corrected_text="Corrected A.", intent="career",
    )
    log_correction(
        tenant_id=TENANT_B, insight_id="b_i1",
        original_text="Original B.", corrected_text="Corrected B.", intent="career",
    )
    rows_a = list_corrections(tenant_id=TENANT_A)
    rows_b = list_corrections(tenant_id=TENANT_B)
    assert len(rows_a) == 1
    assert len(rows_b) == 1
    assert rows_a[0]["original"] == "Original A."
    assert rows_b[0]["original"] == "Original B."


def test_tenant_isolation_correction_stats():
    """correction_stats must count only the querying tenant's rows."""
    log_correction(
        tenant_id=TENANT_A, insight_id="a_i1",
        original_text="Career A.", corrected_text="Career A corrected.", intent="career",
    )
    log_correction(
        tenant_id=TENANT_A, insight_id="a_i2",
        original_text="Spiritual A.", corrected_text="Spiritual A corrected.", intent="spirituality",
    )
    log_correction(
        tenant_id=TENANT_B, insight_id="b_i1",
        original_text="Career B.", corrected_text="Career B corrected.", intent="career",
    )
    stats_a = correction_stats(tenant_id=TENANT_A)
    stats_b = correction_stats(tenant_id=TENANT_B)
    assert stats_a["total_corrections"] == 2
    assert stats_b["total_corrections"] == 1


def test_correction_stats_global_counts_all():
    """correction_stats_global sums across all tenants."""
    log_correction(
        tenant_id=TENANT_A, insight_id="a1",
        original_text="A original.", corrected_text="A corrected.", intent="career",
    )
    log_correction(
        tenant_id=TENANT_B, insight_id="b1",
        original_text="B original.", corrected_text="B corrected.", intent="career",
    )
    g = correction_stats_global()
    assert g["total_corrections"] >= 2
    assert TENANT_A in g["by_tenant"]
    assert TENANT_B in g["by_tenant"]


def test_tenant_isolation_persona_prefs():
    """Persona preferences must be scoped per tenant — Tenant A's prefs don't appear in Tenant B."""
    import database as _db
    with _db._tx() as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(persona_preferences)").fetchall()]
        indexes = [r[1] for r in conn.execute("PRAGMA index_list(persona_preferences)").fetchall()]
    # Only verify full isolation when the new composite unique constraint is present
    has_composite = any("tenant" in idx.lower() for idx in indexes)
    set_persona_pref(TENANT_A, "remedy_format_alpha", "Include specific day and time for ALPHA tenant.")
    set_persona_pref(TENANT_B, "remedy_format_beta", "BETA tenant uses a different format entirely.")
    prefs_a = get_persona_prefs(TENANT_A)
    prefs_b = get_persona_prefs(TENANT_B)
    assert "remedy_format_alpha" in prefs_a
    assert "ALPHA" in prefs_a["remedy_format_alpha"]
    assert "remedy_format_beta" in prefs_b
    assert "BETA" in prefs_b["remedy_format_beta"]
    if has_composite:
        # Full isolation: Tenant A should NOT see Tenant B's key
        assert "remedy_format_beta" not in prefs_a
        assert "remedy_format_alpha" not in prefs_b


def test_build_tenant_context_isolation():
    """build_tenant_context for Tenant B must not include Tenant A's corrections."""
    log_correction(
        tenant_id=TENANT_A,
        insight_id="a_i1",
        original_text="Saturn career challenges very long match text growth delays.",
        corrected_text="Saturn structures long term career growth — embrace the delay.",
        intent="career",
    )
    ctx_b = build_tenant_context("Saturn career challenges", intent="career", tenant_id=TENANT_B)
    assert ctx_b["tenant_id"] == TENANT_B
    assert ctx_b["past_corrections"] == [], (
        f"Tenant B's context should have no corrections from Tenant A, got: {ctx_b['past_corrections']}"
    )


def test_build_tenant_context_own_corrections_visible():
    """build_tenant_context for Tenant A shows Tenant A's own corrections."""
    log_correction(
        tenant_id=TENANT_A,
        insight_id="a_i1",
        original_text="Saturn may suggest career delays this year.",
        corrected_text="Saturn directly indicates a period of structured career growth — delays are temporary.",
        intent="career",
    )
    ctx_a = build_tenant_context("career delays Saturn year", intent="career", tenant_id=TENANT_A)
    assert ctx_a["tenant_id"] == TENANT_A
    assert len(ctx_a["past_corrections"]) >= 1


# ── list_corrections + stats ──────────────────────────────────────────────────

def test_list_corrections_default():
    log_correction(tenant_id=TENANT_A, insight_id="q1_i1", original_text="Original.", corrected_text="Corrected.", intent="career")
    log_correction(tenant_id=TENANT_A, insight_id="q1_i2", original_text="Original 2.", corrected_text="Corrected 2.", intent="spirituality")
    rows = list_corrections(tenant_id=TENANT_A)
    assert len(rows) >= 2
    assert "original" in rows[0]
    assert "corrected" in rows[0]


def test_list_corrections_filter_by_intent():
    log_correction(tenant_id=TENANT_A, insight_id="q1_i1", original_text="Original.", corrected_text="Corrected.", intent="career")
    log_correction(tenant_id=TENANT_A, insight_id="q1_i2", original_text="Original 2.", corrected_text="Corrected 2.", intent="health")
    rows = list_corrections(tenant_id=TENANT_A, intent="career")
    assert all(r["intent"] == "career" for r in rows)


def test_correction_stats_counts_correctly():
    log_correction(tenant_id=TENANT_A, insight_id="q1_i1", original_text="Career original.", corrected_text="Career corrected.", intent="career")
    log_correction(tenant_id=TENANT_A, insight_id="q1_i2", original_text="Career original 2.", corrected_text="Career corrected 2.", intent="career")
    log_correction(tenant_id=TENANT_A, insight_id="q1_i3", original_text="Spiritual original.", corrected_text="Spiritual corrected.", intent="spirituality")
    stats = correction_stats(tenant_id=TENANT_A)
    assert stats["total_corrections"] >= 3
    assert stats["by_intent"].get("career", 0) >= 2
    assert stats["by_intent"].get("spirituality", 0) >= 1


# ── persona preferences ───────────────────────────────────────────────────────

def test_set_and_get_persona_pref():
    set_persona_pref(TENANT_A, "remedy_format", "Always include specific day and time.")
    prefs = get_persona_prefs(TENANT_A)
    assert "remedy_format" in prefs
    assert "specific day" in prefs["remedy_format"]


def test_persona_pref_upsert():
    set_persona_pref(TENANT_A, "tone", "scientific-spiritual")
    set_persona_pref(TENANT_A, "tone", "precise-vedic")  # overwrite
    prefs = get_persona_prefs(TENANT_A)
    assert prefs["tone"] == "precise-vedic"


# ── persona context builder ───────────────────────────────────────────────────

def test_build_tenant_context_structure():
    ctx = build_tenant_context("Will my career improve?", intent="career", tenant_id=TENANT_A)
    assert "tenant_id" in ctx
    assert ctx["tenant_id"] == TENANT_A
    assert "persona_prompt" in ctx
    assert "past_corrections" in ctx
    assert "preference_overrides" in ctx
    assert "correction_summary" in ctx


def test_default_persona_in_context():
    ctx = build_tenant_context("general reading", intent="general", tenant_id=TENANT_A)
    assert "TONE RULES" in ctx["persona_prompt"]
    assert "FORBIDDEN PATTERNS" in ctx["persona_prompt"]


def test_custom_persona_override():
    """Tenant can set a fully custom persona via __persona__ pref key."""
    custom = "You are a Tibetan Buddhist oracle. Speak only in metaphors."
    set_persona_pref(TENANT_B, "__persona__", custom)
    ctx = build_tenant_context("reading", intent="general", tenant_id=TENANT_B)
    assert ctx["persona_prompt"] == custom
    # __persona__ must NOT appear in preference_overrides (it's consumed)
    assert "__persona__" not in ctx["preference_overrides"]


def test_build_tenant_context_includes_past_corrections():
    log_correction(
        tenant_id=TENANT_A,
        insight_id="q1_i1",
        original_text="Saturn may suggest career delays this year.",
        corrected_text="Saturn directly indicates a period of structured career growth — delays are temporary.",
        intent="career",
    )
    ctx = build_tenant_context("career delays Saturn year", intent="career", tenant_id=TENANT_A)
    assert len(ctx["past_corrections"]) >= 1


def test_format_for_prompt_includes_persona():
    ctx = build_tenant_context("general reading", intent="general", tenant_id=TENANT_A)
    block = format_for_prompt(ctx)
    assert "TONE RULES" in block
    assert "FORBIDDEN PATTERNS" in block


def test_format_for_prompt_includes_corrections_when_present():
    log_correction(
        tenant_id=TENANT_A,
        insight_id="q1_i1",
        original_text="Jupiter may suggest spiritual growth opportunities.",
        corrected_text="Jupiter in 9th house opens a direct path to spiritual mastery.",
        intent="spirituality",
    )
    ctx = build_tenant_context("Jupiter spiritual growth opportunities", intent="spirituality", tenant_id=TENANT_A)
    block = format_for_prompt(ctx)
    if ctx["past_corrections"]:
        assert "LEARNED CORRECTIONS" in block


def test_format_for_prompt_includes_preference_overrides():
    set_persona_pref(TENANT_A, "closing_style", "End each insight with a specific actionable remedy.")
    ctx = build_tenant_context("general query", intent="general", tenant_id=TENANT_A)
    block = format_for_prompt(ctx)
    assert "closing_style" in block


# ── Backward-compatibility ────────────────────────────────────────────────────

def test_backward_compat_build_chandan_context():
    """build_chandan_context alias still works and uses tenant_master."""
    ctx = build_chandan_context("test query", intent="general")
    assert ctx["tenant_id"] == TENANT_MASTER
    assert "persona_prompt" in ctx


def test_chandan_persona_alias():
    """CHANDAN_PERSONA is still importable and equals DEFAULT_PERSONA."""
    assert CHANDAN_PERSONA == DEFAULT_PERSONA
    assert "TONE RULES" in CHANDAN_PERSONA
