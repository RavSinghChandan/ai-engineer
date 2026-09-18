"""Run the campaign graph one node at a time, reporting progress as it goes.

The compiled LangGraph invokes the whole pipeline in one call, which gives the
UI nothing to show until everything is finished. Here the same five node
functions are called in the graph's own order, so each one's sub-steps can be
reported as they complete.

The node functions are imported from the same modules the graph is built from,
so this path and `campaign_graph.invoke()` always execute identical logic.
"""

import asyncio
from typing import Any, AsyncIterator, Callable, Dict

from graph.model import steps as step_defs
from graph.nodes.ad_copy_node import ad_copy_node
from graph.nodes.audience_node import audience_node
from graph.nodes.budget_node import budget_node
from graph.nodes.campaign_node import campaign_node
from graph.nodes.performance_node import performance_node

NODES: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    "audience": audience_node,
    "ad_copy": ad_copy_node,
    "budget": budget_node,
    "campaign": campaign_node,
    "performance": performance_node,
}


async def run_with_progress(state: Dict[str, Any]) -> AsyncIterator[Dict[str, Any]]:
    """Yield an event per sub-step, then a final event carrying the state.

    The node's real work runs on the step that represents it (the last one),
    so the progress a viewer sees is tied to work actually completing rather
    than to a timer running independently of the backend.
    """
    total_steps = sum(len(step_defs.STEPS[k]) for k in step_defs.AGENT_ORDER)
    completed = 0

    for agent_key in step_defs.AGENT_ORDER:
        agent_steps = step_defs.STEPS[agent_key]
        agent_label = step_defs.AGENT_LABELS[agent_key]

        yield {
            "type": "agent_start",
            "agent": agent_key,
            "agent_label": agent_label,
            "agent_role": step_defs.AGENT_ROLES[agent_key],
            "agent_index": step_defs.AGENT_ORDER.index(agent_key) + 1,
            "agent_total": len(step_defs.AGENT_ORDER),
            "steps": [
                {"key": s["key"], "label": s["label"], "detail": s["detail"]}
                for s in agent_steps
            ],
            "overall_progress": round((completed / total_steps) * 100),
        }

        agent_progress = 0.0
        for index, step in enumerate(agent_steps):
            is_last = index == len(agent_steps) - 1

            yield {
                "type": "step_start",
                "agent": agent_key,
                "agent_label": agent_label,
                "agent_role": step_defs.AGENT_ROLES[agent_key],
                "step": step["key"],
                "step_label": step["label"],
                "step_detail": step["detail"],
                "step_index": index + 1,
                "step_total": len(agent_steps),
                "agent_progress": round(agent_progress * 100),
                "overall_progress": round((completed / total_steps) * 100),
            }

            # Latency shaping for the steps that carry no real I/O.
            pause = step_defs.pace_seconds(step["real_ms"])

            if is_last:
                # The node's actual work, executed off the event loop so a slow
                # LLM call cannot stall the stream. Whatever it genuinely costs
                # is credited against this step's shaping, so a real DeepSeek
                # call is never padded on top of its own latency.
                started = asyncio.get_running_loop().time()
                state = await asyncio.to_thread(NODES[agent_key], state)
                spent = asyncio.get_running_loop().time() - started
                pause = max(0.0, pause - spent)

            if pause > 0:
                await asyncio.sleep(pause)

            agent_progress += step["weight"]
            completed += 1

            yield {
                "type": "step_done",
                "agent": agent_key,
                "agent_label": agent_label,
                "step": step["key"],
                "step_label": step["label"],
                "agent_progress": round(min(agent_progress, 1.0) * 100),
                "overall_progress": round((completed / total_steps) * 100),
            }

        yield {
            "type": "agent_done",
            "agent": agent_key,
            "agent_label": agent_label,
            "insights": (state.get("agent_log") or [{}])[-1].get("insights", []),
            "overall_progress": round((completed / total_steps) * 100),
        }

    yield {"type": "state", "state": state}
