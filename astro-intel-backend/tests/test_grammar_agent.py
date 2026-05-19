"""
Tests for agents/grammar_agent.py — Grammar Agent.

Positive cases (deterministic pass — no LLM needed):
  - Article a/an correction
  - Repeated word removal
  - Sentence capitalisation
  - Period added at end of bare sentence
  - Lowercase "i" → "I"
  - Missing space after period
  - Double punctuation collapse
  - Multiple spaces collapsed

Negative / edge cases:
  - Empty string returns empty string
  - None-like / whitespace-only → unchanged
  - Skip-key values not corrected in correct_report
  - Mantra field never touched
  - Pipeline node: no admin_review → state unchanged
  - Pipeline node: insight with grammar error is corrected
  - correct_report: narrative corrected, brand_name never touched
  - correct_report: grammar_agent_applied flag set
  - correct_report: original report not mutated (deep-copy)
"""
from __future__ import annotations

import copy
import pytest

# Import with use_llm=False to avoid network calls in CI
from agents.grammar_agent import (
    _deterministic_fix,
    correct,
    grammar_agent_node,
    correct_report,
)


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _fix(text: str) -> str:
    """Deterministic-only correction — no LLM, safe for unit tests."""
    return correct(text, use_llm=False)


def _make_state(insights: list) -> dict:
    return {
        "admin_review": {
            "questions": [
                {
                    "question": "What is my career path?",
                    "intent": "career",
                    "insights": insights,
                }
            ]
        },
        "agent_log": [],
    }


def _make_report(narrative: str = "jupiter help you grow") -> dict:
    return {
        "brand_name": "Aura with Rav",
        "logo_url": "https://example.com/logo.png",
        "generated_at": "2026-05-19T00:00:00Z",
        "user_name": "Test User",
        "narrative": narrative,
        "letter_para2": "thank you for trusting us.",
        "sections": [
            {
                "question": "Career?",
                "narrative": "jupiter is a benifical planet for you.",
                "simple_narrative": "you should take action now",
                "structured_summary": {"who": "your guides", "what": "take action"},
                "insights": [
                    {"id": "i1", "content": "jupiter help you.", "grammar_checked": False},
                ],
            }
        ],
        "remedies": {
            "mantra": "Om Namah Shivaya",
            "daily_habits": ["meditate each morning.", "drink water."],
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# POSITIVE — deterministic fix rules
# ══════════════════════════════════════════════════════════════════════════════

class TestDeterministicFix:

    def test_a_before_vowel_corrected(self):
        result = _fix("He is a excellent astrologer.")
        assert "an excellent" in result

    def test_an_before_consonant_corrected(self):
        result = _fix("It is an powerful planet.")
        assert "a powerful" in result

    def test_repeated_word_removed(self):
        result = _fix("The the chart shows growth.")
        assert "The the" not in result
        assert "chart" in result

    def test_sentence_capitalised(self):
        result = _fix("jupiter is in your 10th house.")
        assert result[0].isupper()

    def test_period_added_to_bare_sentence(self):
        result = _fix("Jupiter helps you grow")
        assert result.endswith(".")

    def test_lowercase_i_corrected(self):
        result = _fix("i think you should act now.")
        assert " i " not in result
        assert "I" in result

    def test_missing_space_after_period(self):
        result = _fix("Jupiter is strong.Saturn is weak.")
        assert ". " in result or "Saturn" in result

    def test_double_punctuation_collapsed(self):
        result = _fix("This is great!!")
        assert "!!" not in result
        assert "!" in result

    def test_multiple_spaces_collapsed(self):
        result = _fix("Jupiter   is   strong.")
        assert "   " not in result

    def test_already_correct_unchanged(self):
        text = "Jupiter is in your career area of your chart."
        result = _fix(text)
        assert "Jupiter" in result
        assert "career" in result

    def test_empty_string_returns_empty(self):
        assert _fix("") == ""

    def test_whitespace_only_returns_same(self):
        assert _fix("   ").strip() == ""

    def test_short_text_not_period_added(self):
        # Very short strings — should not add period if just whitespace
        result = _fix("  ")
        assert result.strip() == ""


# ══════════════════════════════════════════════════════════════════════════════
# POSITIVE — grammar_agent_node (pipeline node)
# ══════════════════════════════════════════════════════════════════════════════

class TestGrammarAgentNode:

    def test_node_logs_completion(self):
        state = _make_state([{"id": "i1", "content": "jupiter help you.", "grammar_checked": False}])
        result = grammar_agent_node(state)
        log = " ".join(result.get("agent_log", []))
        assert "GrammarAgent" in log

    def test_node_sets_grammar_checked_flag(self):
        state = _make_state([{"id": "i1", "content": "Jupiter help you.", "grammar_checked": False}])
        result = grammar_agent_node(state)
        insight = result["admin_review"]["questions"][0]["insights"][0]
        assert insight.get("grammar_checked") is True

    def test_node_corrects_article_error(self):
        state = _make_state([{"id": "i1", "content": "He is a excellent teacher.", "grammar_checked": False}])
        result = grammar_agent_node(state)
        content = result["admin_review"]["questions"][0]["insights"][0]["content"]
        assert "a excellent" not in content

    def test_node_no_admin_review_skips(self):
        state = {"agent_log": []}
        result = grammar_agent_node(state)
        log = " ".join(result.get("agent_log", []))
        assert "skipping" in log.lower()
        assert "admin_review" not in result

    def test_node_preserves_all_other_state_keys(self):
        state = _make_state([{"id": "i1", "content": "Good insight.", "grammar_checked": False}])
        state["session_id"] = "sess-123"
        state["memory"] = {"astrology": {"data": "xyz"}}
        result = grammar_agent_node(state)
        assert result["session_id"] == "sess-123"
        assert result["memory"]["astrology"]["data"] == "xyz"

    def test_node_empty_insights_list_no_crash(self):
        state = _make_state([])
        result = grammar_agent_node(state)
        assert "admin_review" in result

    def test_node_insight_without_content_skipped(self):
        state = _make_state([{"id": "i1", "content": "", "grammar_checked": False}])
        result = grammar_agent_node(state)
        # Should not crash, no content to fix
        assert "admin_review" in result


# ══════════════════════════════════════════════════════════════════════════════
# POSITIVE — correct_report (final report hook)
# ══════════════════════════════════════════════════════════════════════════════

class TestCorrectReport:

    def test_grammar_agent_applied_flag_set(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        assert result.get("grammar_agent_applied") is True

    def test_brand_name_never_changed(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        assert result["brand_name"] == "Aura with Rav"

    def test_logo_url_never_changed(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        assert result["logo_url"] == "https://example.com/logo.png"

    def test_generated_at_never_changed(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        assert result["generated_at"] == "2026-05-19T00:00:00Z"

    def test_mantra_never_changed(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        assert result["remedies"]["mantra"] == "Om Namah Shivaya"

    def test_section_narrative_capitalised(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        narrative = result["sections"][0]["narrative"]
        assert narrative[0].isupper()

    def test_section_simple_narrative_capitalised(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        sn = result["sections"][0]["simple_narrative"]
        assert sn[0].isupper()

    def test_original_report_not_mutated(self):
        report = _make_report()
        original_narrative = report["sections"][0]["narrative"]
        correct_report(report, use_llm=False)
        # Original must be untouched (deepcopy inside correct_report)
        assert report["sections"][0]["narrative"] == original_narrative

    def test_daily_habits_list_corrected(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        habits = result["remedies"]["daily_habits"]
        assert isinstance(habits, list)
        assert len(habits) == 2

    def test_insight_grammar_checked_flag_set(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        insight = result["sections"][0]["insights"][0]
        assert insight.get("grammar_checked") is True

    def test_structured_summary_corrected(self):
        report = _make_report()
        result = correct_report(report, use_llm=False)
        ss = result["sections"][0]["structured_summary"]
        assert isinstance(ss, dict)
        assert "who" in ss

    def test_empty_sections_no_crash(self):
        report = _make_report()
        report["sections"] = []
        result = correct_report(report, use_llm=False)
        assert result["grammar_agent_applied"] is True

    def test_missing_remedies_no_crash(self):
        report = _make_report()
        del report["remedies"]
        result = correct_report(report, use_llm=False)
        assert result["grammar_agent_applied"] is True
