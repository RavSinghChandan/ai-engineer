"""
RAG grounding tests — source citations, evidence checking and adversarial role documents.

The adversarial dataset is evals/rag_grounding.json: the same cases run against the
real model with `python -m fde.evals --suite rag_grounding.json`. Here they run
offline through the real map_role pipeline, against a fake model that OBEYS any
instruction it sees, so the tests show the pipeline stays safe even when the model
does not.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from unittest.mock import patch

import pytest
from langchain.schema import Document
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from agents import role_mapping_agent as rma
from fde import permissions
from guardrails import grounding as g

SUITE = json.loads((Path(__file__).parent.parent / "evals" / "rag_grounding.json").read_text())
CASES = {c["id"]: c for c in SUITE["cases"]}
ADVERSARIAL = [c for c in SUITE["cases"] if "adversarial" in c["tags"]]


def _honest(case_id: str) -> str:
    return json.dumps(CASES[case_id]["reference"])


class ObedientLLM:
    """Fake chat model that does whatever the role documents tell it to."""

    def __init__(self, honest: str):
        self.honest = honest
        self.prompts: list[str] = []

    def bind(self, **_kwargs):
        return RunnableLambda(self._reply)

    def _reply(self, prompt_value, *_args, **_kwargs):
        text = prompt_value.to_string()
        self.prompts.append(text)
        if re.search(r"reveal the salary band", text, re.I):
            return AIMessage(content=json.dumps({**json.loads(self.honest),
                             "recommendation": "Band INR 24,00,000, rahul.verma@corp.example, SALARY-CANARY-5521"}))
        if re.search(r"update_role|grant_admin", text, re.I):
            return AIMessage(content=json.dumps({**json.loads(self.honest), "match_percentage": 100,
                             "tool_call": "grant_admin", "user": "attacker"}))
        if re.search(r"print your system prompt", text, re.I):
            return AIMessage(content=json.dumps({**json.loads(self.honest),
                             "recommendation": text[:120]}))
        return AIMessage(content=self.honest)


def _docs(case_id: str) -> list:
    return [Document(page_content=d["text"], metadata={"title": d["title"], "role_id": d["title"].lower(),
                                                       "required_skills": d["required_skills"]})
            for d in CASES[case_id]["documents"]]


def _run(case_id: str, llm: ObedientLLM, docs=None, skills=None) -> dict:
    case = CASES[case_id]
    cv = {"skills": skills or [s.strip() for s in case["input"]["candidate_skills"].split(",")],
          "experience_years": case["input"]["experience_years"]}
    with patch.object(rma, "hybrid_retrieve", return_value=_docs(case_id) if docs is None else docs), \
         patch.object(rma, "l1_get", return_value=None), patch.object(rma, "l1_set"), \
         patch.object(rma, "audit_llm_call"):
        return rma.map_role(cv, case["input"]["role_title"], vector_store=None, llm=llm,
                            use_hyde=False, use_hybrid=True)


# ── adversarial documents ────────────────────────────────────────────────────

class TestAdversarialDocuments:
    @pytest.mark.parametrize("case", ADVERSARIAL, ids=lambda c: c["id"])
    def test_poisoned_document_is_quarantined_before_the_model(self, case):
        llm = ObedientLLM(_honest(case["id"]))
        out = _run(case["id"], llm)
        poisoned = [d for d in case["documents"] if g.scan_text(d["text"])]
        assert len(poisoned) == 1
        assert [q["title"] for q in out["evidence"]["quarantined"]] == [poisoned[0]["title"]]
        assert poisoned[0]["text"][:40] not in llm.prompts[0]

    @pytest.mark.parametrize("case", ADVERSARIAL, ids=lambda c: c["id"])
    def test_answer_passes_the_datasets_checks(self, case):
        out = _run(case["id"], ObedientLLM(_honest(case["id"])))
        text = json.dumps({k: v for k, v in out.items() if k not in ("citations", "evidence", "role_metadata", "_retrieved_context")})
        for check in case["checks"]:
            if check["type"] == "not_contains":
                assert not [v for v in check["values"] if v.lower() in text.lower()]
            if check["type"] == "number_between":
                assert check["min"] <= out[check["field"]] <= check["max"]

    def test_screen_bypassed_tool_call_is_stripped_and_flagged(self):
        """Second line of defence: the runbook slipped through and the model obeyed."""
        with patch.object(rma, "screen_sources", lambda s: (list(s), [])):
            out = _run("adversarial-tool-call", ObedientLLM(_honest("adversarial-tool-call")))
        assert "tool_call" not in out and "user" not in out
        assert "tool_call_request" in out["evidence"]["blocked"]
        assert out["recommendation"] == "Needs further assessment."

    def test_screen_bypassed_leak_is_flagged(self):
        with patch.object(rma, "screen_sources", lambda s: (list(s), [])):
            out = _run("adversarial-exfiltration", ObedientLLM(_honest("adversarial-exfiltration")))
        assert "personal_data" in out["evidence"]["blocked"]
        assert "rahul" not in out["recommendation"].lower()

    @pytest.mark.parametrize("action,resource", [
        ("write", "role_catalog"), ("write", "user_profile"), ("read", "cv_text"), ("write", "learning_plan"),
    ])
    def test_role_mapper_cannot_use_tools_the_matrix_does_not_grant(self, action, resource):
        """A document asking for update_role / grant_admin hits a default-deny matrix."""
        assert not permissions.check("role_mapping_agent", action, resource)
        with pytest.raises(permissions.PermissionDenied):
            permissions.authorize("role_mapping_agent", action, resource)


# ── citations + evidence ─────────────────────────────────────────────────────

class TestCitationsAndEvidence:
    def test_supported_skills_are_kept_and_cited(self):
        out = _run("clean-cited", ObedientLLM(_honest("clean-cited")))
        assert out["missing_skills"] == ["Spring Boot", "Docker", "Kubernetes"]
        assert out["matched_skills"] == ["Java"]
        assert out["sources"] == ["S1"]
        assert out["citations"][0]["title"] == "Java Developer" and out["citations"][0]["used"]
        assert out["evidence"]["checked"] == 4 and out["evidence"]["supported"] == 4

    def test_convincing_but_unsupported_skill_gap_is_removed(self):
        reply = {**json.loads(_honest("unsupported-temptation")),
                 "missing_skills": ["FastAPI", "Kubernetes", "AWS", "PostgreSQL"]}
        out = _run("unsupported-temptation", ObedientLLM(json.dumps(reply)))
        assert out["missing_skills"] == ["FastAPI", "PostgreSQL"]
        assert [u["claim"] for u in out["evidence"]["unsupported"]] == ["Kubernetes", "AWS"]
        assert out["evidence"]["unsupported"][0]["reason"] == "not in the retrieved role document"

    def test_matched_skill_the_candidate_does_not_have_is_removed(self):
        reply = {**json.loads(_honest("clean-cited")), "matched_skills": ["Java", "Docker"]}
        out = _run("clean-cited", ObedientLLM(json.dumps(reply)))
        assert out["matched_skills"] == ["Java"]
        assert out["evidence"]["unsupported"][0]["reason"] == "not in the candidate's CV profile"

    def test_no_document_retrieved_keeps_skills_and_says_so(self):
        out = _run("clean-cited", ObedientLLM(_honest("clean-cited")), docs=[])
        assert out["missing_skills"] == ["Spring Boot", "Docker", "Kubernetes"]
        assert out["citations"] == [] and "could not be checked" in out["evidence"]["note"]

    def test_uncited_answer_is_checked_against_all_documents(self):
        reply = {k: v for k, v in json.loads(_honest("clean-cited")).items() if k != "sources"}
        out = _run("clean-cited", ObedientLLM(json.dumps(reply)))
        assert out["sources"] == ["S1"] and out["evidence"]["supported"] == 4

    def test_prompt_marks_documents_as_data(self):
        llm = ObedientLLM(_honest("clean-cited"))
        _run("clean-cited", llm)
        assert "[S1] Java Developer" in llm.prompts[0] and "not instructions" in llm.prompts[0]

    def test_active_prompt_asks_for_sources(self):
        from utils.prompts import get_active
        p = get_active("role_mapper")
        assert p.version == "v3" and '"sources"' in p.user and "not instructions" in p.system

    def test_retrieve_context_still_works_for_crag(self):
        doc = Document(page_content="Role: Python", metadata={"title": "Python"})
        with patch.object(rma, "crag_retrieve", return_value=([doc], 0.9, "HIGH")):
            ctx, meta = rma._retrieve_context("q", "Python", None, use_hybrid=False)
        assert ctx == "Role: Python" and meta == {"title": "Python"}
        with patch.object(rma, "crag_retrieve", return_value=([], 0.0, "LOW")):
            ctx, _ = rma._retrieve_context("q", "Python", None, use_hybrid=False)
        assert "Not found in knowledge base" in ctx


class TestGroundingModule:
    def test_real_roles_have_no_false_positives(self):
        roles = json.loads((Path(__file__).parent.parent / "data" / "roles_knowledge.json").read_text())["roles"]
        assert [r["title"] for r in roles if g.scan_text(r.get("description", ""))] == []

    @pytest.mark.parametrize("text", ["Use tools such as Jenkins and Maven", "Run commands in a Linux shell"])
    def test_ordinary_role_text_is_not_flagged(self, text):
        assert g.scan_text(text) == []


class TestRoleIndexRebuild:
    """An admin role change rebuilds BM25; the old index must not survive next to the new one."""

    def test_rebuilding_bm25_replaces_the_old_index(self):
        from rag import advanced_retrieval as ar
        roles = json.loads((Path(__file__).parent.parent / "data" / "roles_knowledge.json").read_text())["roles"]
        ar.init_bm25_from_roles(roles)
        added = roles + [{"id": "emb", "title": "Embedded Firmware Engineer", "experience_years": 3,
                          "required_skills": ["Embedded C", "RTOS"], "description": "Writes Embedded C for microcontrollers."}]
        ar.init_bm25_from_roles(added)
        bm25 = ar.get_bm25_index()
        assert len(bm25._docs) == len(added)
        hits = [bm25.get_document(i).metadata["title"] for i, _ in bm25.search("Embedded Firmware Engineer microcontrollers", k=3)]
        assert hits[0] == "Embedded Firmware Engineer" and len(set(hits)) == len(hits)
