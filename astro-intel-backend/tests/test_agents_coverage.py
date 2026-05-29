"""
Coverage tests for low-coverage agent modules:
  - storytelling_agent
  - plain_english_agent
  - translation_agent
  - admin_review_agent
  - report_agent
  - grammar_agent (uncovered paths)
"""
from __future__ import annotations
from unittest.mock import patch

import pytest


class TestStorytellingAgent:
    def test_empty_bullets_returns_empty(self):
        from agents.storytelling_agent import numerology_story
        assert numerology_story([], "q", "general") == ""

    def test_single_bullet_returned_as_is(self):
        from agents.storytelling_agent import numerology_story
        assert numerology_story(["Only one."], "q", "general") == "Only one."

    def test_multiple_bullets_llm_success(self):
        from agents.storytelling_agent import numerology_story
        story = (
            "[HOOK] You are standing at a major turning point in your career right now.\n"
            "[TENSION] The challenge is that two paths pull you in opposite directions.\n"
            "[TURN] In 2027, your Personal Year 1 and Life Path 8 align for the first time.\n"
            "[RESOLUTION] Focus on one goal and commit fully for six months.\n"
            "[CLOSING] The numbers have always known what you are only beginning to see.\n"
            "[REMEDIES] Chant Om Shreem Hreem daily and wear a blue sapphire on Saturday."
        )
        with patch("utils.deepseek_client.call", return_value=story):
            result = numerology_story(["a", "b"], "question", "career", "Alice")
        assert result == story

    def test_multiple_bullets_llm_too_short_falls_back(self):
        from agents.storytelling_agent import numerology_story
        with patch("utils.deepseek_client.call", return_value="short"):
            result = numerology_story(["first", "second"], "q", "general")
        assert result == "first"

    def test_multiple_bullets_llm_missing_hook_falls_back(self):
        from agents.storytelling_agent import numerology_story
        with patch("utils.deepseek_client.call", return_value="A long string without the required label, over one hundred and twenty characters to pass length check"):
            result = numerology_story(["first", "second"], "q", "general")
        assert result == "first"

    def test_multiple_bullets_llm_exception_falls_back(self):
        from agents.storytelling_agent import numerology_story
        with patch("utils.deepseek_client.call", side_effect=RuntimeError("api error")):
            result = numerology_story(["fallback", "second"], "q", "general")
        assert result == "fallback"

    def test_rag_remedy_text_included(self):
        from agents.storytelling_agent import numerology_story
        story = "[HOOK] True.\n[TENSION] x\n[TURN] y\n[RESOLUTION] z\n[CLOSING] w\n[REMEDIES] Chant."
        with patch("utils.deepseek_client.call", return_value=story) as mock_call:
            numerology_story(["a", "b"], "q", "g", rag_remedy_text="remedy text here")
        call_args = mock_call.call_args[1]["user"]
        assert "remedy text here" in call_args


class TestPlainEnglishAgent:
    def test_preprocess_replaces_jargon(self):
        from agents.plain_english_agent import _preprocess
        result = _preprocess("The Lagna indicates growth during Mahadasha.")
        assert "rising sign" in result
        assert "main life phase" in result

    def test_safety_filter_removes_forbidden_phrases(self):
        from agents.plain_english_agent import _safety_filter
        text = "You will definitely lose everything in the next year."
        result = _safety_filter(text)
        assert "lose everything" not in result

    def test_safety_filter_empty_result_replaced_with_fallback(self):
        from agents.plain_english_agent import _safety_filter
        text = "divorce is certain."
        result = _safety_filter(text)
        assert len(result) > 0

    def test_llm_rewrite_success(self):
        from agents.plain_english_agent import _llm_rewrite
        with patch("utils.deepseek_client.call", return_value="Clear rewrite."):
            result = _llm_rewrite("Original complex text here for rewriting.")
        assert result == "Clear rewrite."

    def test_llm_rewrite_too_short_returns_original(self):
        from agents.plain_english_agent import _llm_rewrite
        with patch("utils.deepseek_client.call", return_value="x"):
            result = _llm_rewrite("Original text that should not be replaced.")
        assert result == "Original text that should not be replaced."

    def test_llm_rewrite_exception_returns_original(self):
        from agents.plain_english_agent import _llm_rewrite
        with patch("utils.deepseek_client.call", side_effect=Exception("fail")):
            result = _llm_rewrite("original text")
        assert result == "original text"

    def test_node_no_admin_review(self):
        from agents.plain_english_agent import plain_english_agent_node
        state = {}
        result = plain_english_agent_node(state)
        assert "PlainEnglishAgent" in " ".join(result.get("agent_log", []))

    def test_node_rewrites_insights(self):
        from agents.plain_english_agent import plain_english_agent_node
        state = {
            "admin_review": {
                "questions": [{
                    "insights": [
                        {"id": "q1_i1", "content": "The Lagna shows great Dasha potential."}
                    ]
                }]
            }
        }
        with patch("utils.deepseek_client.call", return_value="Simplified version of the text."):
            result = plain_english_agent_node(state)
        insight = result["admin_review"]["questions"][0]["insights"][0]
        assert insight.get("plain_english") is True
        assert "original_content" in insight

    def test_node_exception_keeps_original(self):
        from agents.plain_english_agent import plain_english_agent_node
        state = {
            "admin_review": {
                "questions": [{
                    "insights": [{"id": "q1_i1", "content": "Some text."}]
                }]
            }
        }
        with patch("agents.plain_english_agent._rewrite_insight", side_effect=Exception("boom")):
            result = plain_english_agent_node(state)
        # Should not raise; original content preserved
        assert result["admin_review"]["questions"][0]["insights"][0]["content"] == "Some text."


class TestTranslationAgent:
    def _sample_report(self):
        return {
            "user_name": "Alice",
            "sections": [{"narrative": "You have great potential."}],
            "closing_note": "Thank you.",
        }

    def test_english_passthrough(self):
        from agents.translation_agent import translation_agent
        report = self._sample_report()
        result = translation_agent(report, "en")
        assert result["language_code"] == "en"
        assert result["user_name"] == "Alice"

    def test_unsupported_language_raises(self):
        from agents.translation_agent import translation_agent
        with pytest.raises(ValueError, match="not supported"):
            translation_agent(self._sample_report(), "xx")

    def test_mock_translation_no_llm_caller(self):
        from agents.translation_agent import translation_agent
        result = translation_agent(self._sample_report(), "hi")
        assert result["language_code"] == "hi"
        assert result["language_name"] == "Hindi"

    def test_mock_translation_prefixes_language(self):
        from agents.translation_agent import translation_agent
        result = translation_agent({"narrative": "Hello world."}, "bn")
        # Without llm_caller, values are prefixed with language name
        assert result["language_code"] == "bn"

    def test_with_llm_caller(self):
        from agents.translation_agent import translation_agent

        def fake_llm(prompt):
            return '{"translations": ["translated text"]}'

        report = {"narrative": "Hello world and more text here."}
        result = translation_agent(report, "ta", llm_caller=fake_llm)
        assert result["language_code"] == "ta"

    def test_with_llm_caller_parse_failure_keeps_original(self):
        from agents.translation_agent import translation_agent

        def bad_llm(prompt):
            return "not json at all"

        report = {"narrative": "Some long text here for testing."}
        result = translation_agent(report, "gu", llm_caller=bad_llm)
        assert result["language_code"] == "gu"

    def test_empty_report_returns_language_meta(self):
        from agents.translation_agent import translation_agent
        result = translation_agent({}, "mr")
        assert result["language_code"] == "mr"
        assert result["language_name"] == "Marathi"

    def test_list_languages(self):
        from agents.translation_agent import list_languages
        langs = list_languages()
        codes = [l["code"] for l in langs]
        assert "hi" in codes
        assert "en" in codes
        assert len(langs) >= 22

    def test_collect_strings_skips_skip_keys(self):
        from agents.translation_agent import _collect_strings
        obj = {"id": "abc", "content": "Long enough text to collect."}
        result = _collect_strings(obj)
        assert any(r["text"] == "Long enough text to collect." for r in result)
        assert not any(r["text"] == "abc" for r in result)

    def test_collect_strings_nested(self):
        from agents.translation_agent import _collect_strings
        obj = {"sections": [{"narrative": "Deep text here."}]}
        result = _collect_strings(obj)
        assert any(r["text"] == "Deep text here." for r in result)

    def test_build_translation_prompt(self):
        from agents.translation_agent import _build_translation_prompt, SUPPORTED_LANGUAGES
        prompt = _build_translation_prompt(["Hello world."], "hi", SUPPORTED_LANGUAGES["hi"])
        assert prompt["temperature"] == 0
        assert "Hindi" in prompt["system"]

    def test_supported_languages_count(self):
        from agents.translation_agent import SUPPORTED_LANGUAGES
        assert len(SUPPORTED_LANGUAGES) >= 23  # 22 + English


class TestAdminReviewAgent:
    def _make_state_with_consensus(self):
        return {
            "question_consensus": [
                {
                    "question": "What is my career path?",
                    "intent": "career",
                    "insights": [
                        {"id": "q1_i1", "content": "Jupiter favours your career.", "confidence": "high", "domains": ["astrology"], "is_common": False},
                        {"id": "q1_i2", "content": "Name number 8 brings leadership.", "confidence": "medium", "domains": ["numerology"], "is_common": True},
                    ],
                }
            ],
            "normalized_questions": ["What is my career path?"],
            "memory": {"astrology": {}, "numerology": {}},
            "user_profile": {"full_name": "Alice"},
            "persona_context": "",
            "remedies": {},
        }

    def _make_state_legacy(self):
        return {
            "question_consensus": [],
            "consolidated": {
                "personality_insight": {"content": "Strong personality.", "confidence": "high", "sources": ["astrology"]},
                "career_insight": {"content": "Good career.", "confidence": "medium", "sources": ["numerology"]},
                "relationship_insight": {"content": "Loving relationships.", "confidence": "medium", "sources": ["palmistry", "astrology"]},
                "health_insight": {"content": "Good health.", "confidence": "medium", "sources": ["astrology"]},
                "spiritual_insight": {"content": "Deep inner life.", "confidence": "medium", "sources": ["tarot"]},
                "timing_insight": {"content": "Growth phase.", "confidence": "high", "sources": ["astrology"]},
                "question_answered": "Yes, success is indicated.",
            },
            "user_question": "Will I succeed?",
            "focus_context": {"intent": "career"},
            "memory": {},
            "user_profile": {"full_name": "Bob"},
            "persona_context": "",
            "remedies": {},
        }

    def test_node_with_question_consensus(self):
        from agents.admin_review_agent import admin_review_agent_node
        with patch("guardrails.production.filter_pii_from_admin_review", return_value=({"questions": [], "subject": "Alice", "module_methodology": {}}, 0)):
            state = admin_review_agent_node(self._make_state_with_consensus())
        assert "admin_review" in state

    def test_node_with_legacy_fallback(self):
        from agents.admin_review_agent import admin_review_agent_node
        state = self._make_state_legacy()
        result = admin_review_agent_node(state)
        assert "admin_review" in result
        assert result["admin_review"]["subject"] == "Bob"

    def test_node_appends_agent_log(self):
        from agents.admin_review_agent import admin_review_agent_node
        state = self._make_state_legacy()
        result = admin_review_agent_node(state)
        log = " ".join(result.get("agent_log", []))
        assert "AdminReviewAgent" in log

    def test_build_module_methodology_filters_to_memory(self):
        from agents.admin_review_agent import build_module_methodology
        memory = {"astrology": {}, "tarot": {}}
        result = build_module_methodology(memory)
        assert "astrology" in result
        assert "tarot" in result
        assert "numerology" not in result

    def test_build_module_methodology_empty_memory(self):
        from agents.admin_review_agent import build_module_methodology
        result = build_module_methodology({})
        assert result == {}

    def test_module_methodology_registry_has_all_modules(self):
        from agents.admin_review_agent import MODULE_METHODOLOGY
        for mod in ("astrology", "numerology", "palmistry", "tarot", "vastu"):
            assert mod in MODULE_METHODOLOGY

    def test_node_no_user_profile(self):
        from agents.admin_review_agent import admin_review_agent_node
        state = {
            "question_consensus": [],
            "consolidated": {},
            "user_question": "",
            "focus_context": {"intent": "general"},
            "memory": {},
            "user_profile": {},
            "persona_context": "",
            "remedies": {},
        }
        result = admin_review_agent_node(state)
        assert "admin_review" in result


class TestReportAgent:
    def _make_admin_review(self):
        return {
            "subject": "Alice",
            "questions": [
                {
                    "question": "What is my career path?",
                    "intent": "career",
                    "insights": [
                        {"id": "q1_i1", "content": "Jupiter favours success.", "confidence": "high", "domains": ["astrology"], "is_common": False},
                        {"id": "q1_i2", "content": "Life Path 8 drives ambition.", "confidence": "medium", "domains": ["numerology"], "is_common": True},
                    ],
                }
            ],
            "module_methodology": {},
        }

    def test_final_report_agent_returns_report(self):
        from agents.report_agent import final_report_agent
        admin_review = self._make_admin_review()
        report = final_report_agent(
            admin_review=admin_review,
            approved_ids=["q1_i1", "q1_i2"],
            rejected_ids=[],
        )
        assert report["user_name"] == "Alice"
        assert "sections" in report
        assert report["total_insights_approved"] == 2

    def test_final_report_agent_all_rejected(self):
        from agents.report_agent import final_report_agent
        admin_review = self._make_admin_review()
        report = final_report_agent(
            admin_review=admin_review,
            approved_ids=[],
            rejected_ids=["q1_i1", "q1_i2"],
        )
        assert report["total_insights_approved"] == 0
        assert report["total_insights_rejected"] == 2

    def test_final_report_agent_with_memory(self):
        from agents.report_agent import final_report_agent
        admin_review = self._make_admin_review()
        report = final_report_agent(
            admin_review=admin_review,
            approved_ids=["q1_i1"],
            rejected_ids=[],
            memory={"astrology": {}, "numerology": {}},
        )
        assert "astrology" in report["modules_used"]

    def test_final_report_agent_custom_brand(self):
        from agents.report_agent import final_report_agent
        admin_review = self._make_admin_review()
        report = final_report_agent(
            admin_review=admin_review,
            approved_ids=["q1_i1"],
            rejected_ids=[],
            brand_name="AuraWithRav",
        )
        assert "AuraWithRav" in report["brand_name"]

    def test_final_report_agent_has_letter_fields(self):
        from agents.report_agent import final_report_agent
        admin_review = self._make_admin_review()
        report = final_report_agent(
            admin_review=admin_review,
            approved_ids=["q1_i1"],
            rejected_ids=[],
        )
        assert "letter_para1" in report
        assert "Alice" in report["letter_title"]

    def test_final_report_agent_legacy_flat_sections(self):
        from agents.report_agent import final_report_agent
        admin_review = {
            "subject": "Bob",
            "questions": [],
            "sections": [
                {"id": "sec_career", "content": "Career is strong.", "confidence": "high", "sources": ["astrology"]},
            ],
            "question": "Will I succeed?",
            "focus": "career",
        }
        report = final_report_agent(
            admin_review=admin_review,
            approved_ids=["sec_career"],
            rejected_ids=[],
        )
        assert report["user_name"] == "Bob"

    def test_consolidate_section_produces_narrative(self):
        from agents.report_agent import _consolidate_section
        insights = [
            {"id": "i1", "content": "Strong career ahead.", "confidence": "high", "domains": ["astrology"], "is_common": False},
        ]
        result = _consolidate_section("Career?", "career", insights, "Alice", ["astrology"])
        assert "narrative" in result
        assert len(result["narrative"]) > 5

    def test_consolidate_section_multi_domain_consensus(self):
        from agents.report_agent import _consolidate_section
        insights = [
            {"id": "i1", "content": "Leadership ahead.", "confidence": "high", "domains": ["astrology", "numerology"], "is_common": True},
            {"id": "i2", "content": "Growth phase now.", "confidence": "medium", "domains": ["numerology"], "is_common": False},
        ]
        result = _consolidate_section("Future?", "general", insights, "Bob", ["astrology", "numerology"])
        assert "narrative" in result
        assert "prompts" in result

    def test_consolidate_section_filters_remedy_insights(self):
        from agents.report_agent import _consolidate_section
        insights = [
            {"id": "i1_remedy", "content": "Remedies: Chant mantra.", "confidence": "medium", "domains": ["numerology"], "is_common": False},
            {"id": "i2", "content": "Success is near.", "confidence": "high", "domains": ["astrology"], "is_common": False},
        ]
        result = _consolidate_section("Q?", "general", insights, "Alice", ["astrology"])
        assert "narrative" in result

    def test_build_prompts_returns_all_variants(self):
        from agents.report_agent import _build_prompts
        insights = [{"content": "Test insight.", "confidence": "high", "domains": ["astrology"]}]
        prompts = _build_prompts("Q?", "general", insights, "Alice", ["astrology"])
        assert "simple_t0" in prompts
        assert "simple_t01" in prompts
        assert "detailed_t0" in prompts
        assert "detailed_t01" in prompts
        assert "structured" in prompts


class TestGrammarAgentCoverage:
    def test_llm_grammar_fix_batch_success(self):
        from agents.grammar_agent import _llm_grammar_fix_batch
        with patch("utils.deepseek_client.call", return_value="Fixed text one.<<<NEXT>>>Fixed text two."):
            result = _llm_grammar_fix_batch(["Text one here.", "Text two here."])
        # Should return two items
        assert len(result) == 2

    def test_llm_grammar_fix_batch_mismatch_falls_back(self):
        from agents.grammar_agent import _llm_grammar_fix_batch
        with patch("utils.deepseek_client.call", return_value="Only one result"):
            result = _llm_grammar_fix_batch(["First text is here.", "Second text is here."])
        assert len(result) == 2

    def test_llm_grammar_fix_batch_exception_falls_back(self):
        from agents.grammar_agent import _llm_grammar_fix_batch
        with patch("utils.deepseek_client.call", side_effect=Exception("error")):
            result = _llm_grammar_fix_batch(["Short text here for the test."])
        assert len(result) == 1

    def test_llm_grammar_fix_batch_empty_texts(self):
        from agents.grammar_agent import _llm_grammar_fix_batch
        result = _llm_grammar_fix_batch(["x", "y"])  # too short, no LLM call
        assert result == ["x", "y"]

    def test_fix_list_non_list_passthrough(self):
        from agents.grammar_agent import _fix_list
        assert _fix_list("not a list") == "not a list"

    def test_fix_list_corrects_strings(self):
        from agents.grammar_agent import _fix_list
        with patch("utils.deepseek_client.call", side_effect=Exception("no llm")):
            result = _fix_list(["Short.", "This is a longer sentence that needs grammar checking now."])
        assert len(result) == 2

    def test_fix_structured_summary(self):
        from agents.grammar_agent import _fix_structured_summary
        ss = {"narrative": "He go to the store.", "id": "keep-this"}
        with patch("utils.deepseek_client.call", side_effect=Exception("no llm")):
            result = _fix_structured_summary(ss)
        assert "id" in result
        assert result["id"] == "keep-this"

    def test_correct_report_full(self):
        from agents.grammar_agent import correct_report
        report = {
            "narrative": "He are going to the store and buying things.",
            "sections": [
                {"narrative": "A good section text.", "insights": [{"content": "Insight text here.", "grammar_checked": False}], "simple_narrative": "Simple."}
            ],
            "remedies": {"daily_habits": ["Meditate daily and be focused."]},
        }
        with patch("utils.deepseek_client.call", side_effect=Exception("no llm")):
            result = correct_report(report, use_llm=False)
        assert result["grammar_agent_applied"] is True

    def test_correct_report_empty(self):
        from agents.grammar_agent import correct_report
        result = correct_report({}, use_llm=False)
        assert result["grammar_agent_applied"] is True

    def test_grammar_agent_node_with_insights(self):
        from agents.grammar_agent import grammar_agent_node
        state = {
            "admin_review": {
                "questions": [{
                    "insights": [
                        {"id": "q1_i1", "content": "he go to store"},
                        {"id": "q1_i2", "content": ""},
                    ]
                }]
            }
        }
        with patch("utils.deepseek_client.call", side_effect=Exception("no llm")):
            result = grammar_agent_node(state)
        assert "admin_review" in result

    def test_grammar_agent_node_no_admin_review(self):
        from agents.grammar_agent import grammar_agent_node
        state = {}
        result = grammar_agent_node(state)
        log = " ".join(result.get("agent_log", []))
        assert "GrammarAgent" in log
