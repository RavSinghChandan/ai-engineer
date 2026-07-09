"""LLM-driven content agents: Trend, Research, Knowledge, Script, Review, SEO, Metadata.

Each agent reads its slice of pipeline state and returns a partial update.
Media agents (voice/thumbnail/video) live in media_agents.py.
"""
import json
from typing import Any

from app.agents.base import Agent, AgentContext
from app.domain.enums import AgentName, EventType, ModelRole

_RESEARCH_COLLECTION = "research"
_SCRIPT_COLLECTION = "scripts"


def script_full_text(script: dict[str, Any]) -> str:
    parts = [script.get("hook", "")]
    parts += [section.get("narration", "") for section in script.get("sections", [])]
    parts.append(script.get("cta", ""))
    return " ".join(part.strip() for part in parts if part and part.strip())


class TrendAgent(Agent):
    name = AgentName.TREND

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Analyzing trending angles…", None)
        data = await self._ask_json(
            ctx,
            ModelRole.TREND_ANALYST,
            {"topic": state["topic"], "niche": state.get("niche", ""), "audience": state.get("audience", "")},
        )
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Selected angle: {data.get('selected_angle', '')[:120]}",
            {"angles": data.get("angles", [])},
        )
        return {"trend": data}


class ResearchAgent(Agent):
    name = AgentName.RESEARCH

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Researching the selected angle…", None)
        data = await self._ask_json(
            ctx,
            ModelRole.RESEARCHER,
            {
                "angle": state["trend"]["selected_angle"],
                "topic": state["topic"],
                "audience": state.get("audience", ""),
            },
        )
        facts = data.get("key_facts", [])
        if facts:
            await ctx.vector.add(
                _RESEARCH_COLLECTION,
                facts,
                [{"job_id": ctx.job_id, "topic": state["topic"]} for _ in facts],
            )
        await ctx.emit(EventType.AGENT_PROGRESS, f"Collected {len(facts)} key facts", None)
        return {"research": data}


class KnowledgeAgent(Agent):
    name = AgentName.KNOWLEDGE

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Recalling knowledge from past videos…", None)
        hits = await ctx.vector.search(_SCRIPT_COLLECTION, state["topic"], k=3)
        related = "\n".join(f"- {hit.text[:300]}" for hit in hits) or "(none)"
        data = await self._ask_json(
            ctx,
            ModelRole.RESEARCHER,
            {
                "summary": state["research"].get("summary", ""),
                "key_facts": json.dumps(state["research"].get("key_facts", []), ensure_ascii=False),
                "related": related,
            },
        )
        await ctx.emit(EventType.AGENT_PROGRESS, f"Distilled {len(data.get('insights', []))} core insights", None)
        return {"knowledge": data}


class ScriptAgent(Agent):
    name = AgentName.SCRIPT

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        review = state.get("review") or {}
        is_revision = bool(review.get("feedback")) and not review.get("approved", False)
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            "Revising script from reviewer feedback…" if is_revision else "Writing the script…",
            None,
        )
        data = await self._ask_json(
            ctx,
            ModelRole.SCRIPT_WRITER,
            {
                "angle": state["trend"]["selected_angle"],
                "audience": state.get("audience", ""),
                "outline": json.dumps(state["research"].get("outline", []), ensure_ascii=False),
                "insights": json.dumps(state["knowledge"].get("insights", []), ensure_ascii=False),
                "notes": state["knowledge"].get("notes_for_writer", ""),
                "feedback": review.get("feedback", "") if is_revision else "",
            },
        )
        word_count = len(script_full_text(data).split())
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Script draft ready: “{data.get('title', '')[:80]}” ({word_count} words)",
            {"title": data.get("title"), "words": word_count},
        )
        return {"script": data}


class ScriptIntakeAgent(Agent):
    """Structures a creator-provided script — the author's words stay verbatim.

    Used when the job carries its own script: trend/research/knowledge/script/
    review are all bypassed; production starts here and goes straight to SEO.
    """

    name = AgentName.SCRIPT_INTAKE

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Using your script — structuring it for production…", None)
        data = await self._ask_json(
            ctx,
            ModelRole.SCRIPT_WRITER,
            {"raw_script": state["user_script_text"]},
            temperature=0.1,
        )
        word_count = len(script_full_text(data).split())
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Script accepted verbatim: “{data.get('title', '')[:80]}” ({word_count} words)",
            {"title": data.get("title"), "words": word_count},
        )
        # Provide the slices downstream agents expect without running them.
        return {
            "script": data,
            "trend": {"selected_angle": data.get("title", state.get("topic", "")), "angles": [], "rationale": "creator-provided script"},
            "research": {"summary": "", "key_facts": [], "outline": [s.get("heading", "") for s in data.get("sections", [])]},
            "knowledge": {"insights": [], "notes_for_writer": ""},
            "review": {"score": 10, "approved": True, "feedback": "Creator-provided script — review bypassed.", "revision_count": 0},
        }


class ReviewAgent(Agent):
    name = AgentName.REVIEW

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Reviewing script quality…", None)
        previous = state.get("review") or {}
        data = await self._ask_json(
            ctx,
            ModelRole.REVIEWER,
            {
                "script": json.dumps(state["script"], ensure_ascii=False),
                "key_facts": json.dumps(state["research"].get("key_facts", []), ensure_ascii=False),
                "pass_score": ctx.settings.review_pass_score,
            },
            temperature=0.2,
        )
        data["revision_count"] = previous.get("revision_count", 0) + (0 if data.get("approved") else 1)
        # Force-approve once the revision budget is spent so the pipeline always terminates.
        if not data.get("approved") and data["revision_count"] > ctx.settings.max_script_revisions:
            data["approved"] = True
            data["feedback"] += " (Auto-approved: revision budget reached.)"
        verdict = "approved" if data.get("approved") else "revision requested"
        await ctx.emit(
            EventType.AGENT_PROGRESS,
            f"Review score {data.get('score')}/10 — {verdict}",
            {"score": data.get("score"), "approved": data.get("approved")},
        )
        return {"review": data}


class SeoAgent(Agent):
    name = AgentName.SEO

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Optimizing title, description and tags…", None)
        data = await self._ask_json(
            ctx,
            ModelRole.SEO_EXPERT,
            {
                "title": state["script"].get("title", ""),
                "hook": state["script"].get("hook", ""),
                "topic": state["topic"],
                "audience": state.get("audience", ""),
            },
        )
        await ctx.emit(
            EventType.AGENT_PROGRESS, f"Best title: “{data.get('best_title', '')[:90]}”", None
        )
        return {"seo": data}


class MetadataAgent(Agent):
    name = AgentName.METADATA

    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        await ctx.emit(EventType.AGENT_PROGRESS, "Packaging final upload metadata…", None)
        data = await self._ask_json(
            ctx,
            ModelRole.METADATA_WRITER,
            {
                "title": state["seo"].get("best_title", ""),
                "description": state["seo"].get("description", ""),
                "tags": json.dumps(state["seo"].get("tags", []), ensure_ascii=False),
                "sections": json.dumps(
                    [s.get("heading", "") for s in state["script"].get("sections", [])], ensure_ascii=False
                ),
                "duration": round(state.get("voice", {}).get("duration_seconds", 60)),
            },
        )
        # Persist the finished script into long-term memory for future Knowledge runs.
        await ctx.vector.add(
            _SCRIPT_COLLECTION,
            [script_full_text(state["script"])],
            [{"job_id": ctx.job_id, "title": state["seo"].get("best_title", ""), "topic": state["topic"]}],
        )
        await ctx.emit(EventType.AGENT_PROGRESS, "Metadata ready (description, chapters, shorts ideas)", None)
        return {"metadata": data}
