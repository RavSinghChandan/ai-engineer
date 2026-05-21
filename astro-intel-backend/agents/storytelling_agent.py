"""
Storytelling Agent
==================
Takes multiple numerology tradition answers (Indian Vedic, Chaldean, Pythagorean)
for the same question and weaves them into ONE cohesive narrative using human
psychology and storytelling principles.

Storytelling framework used:
  1. HOOK      — Grab attention. State the core truth about their situation NOW.
  2. TENSION   — Name the challenge or conflict the numbers reveal.
  3. TURN      — The pivotal moment / window of opportunity in their numbers.
  4. RESOLUTION — Concrete action that resolves the tension and unlocks the outcome.
  5. CLOSING   — One sentence that makes it personal and memorable.

This is NOT a bullet list agent. Output is a flowing 5-6 sentence narrative paragraph
that reads like a master reader speaking directly to the client.
"""
from __future__ import annotations
from typing import List


_STORY_SYSTEM = """You are Chandan Kumar — the founder of Aura with Rav, a master numerologist,
and a gifted storyteller trained in human psychology.

You receive 2–3 numerology readings for the same client question from different traditions
(Indian Vedic, Chaldean, Pythagorean). Your job is NOT to summarise them. Your job is to
weave them into ONE living story that the client will feel, not just read.

STORYTELLING FRAMEWORK — follow this exact arc in sequence:

1. HOOK (1 sentence): Open with the most surprising or emotionally resonant truth from
   the numbers. Make the client feel "this is exactly about me." No warmup. No "your numbers
   show..." openers. Start mid-story.

2. TENSION (1-2 sentences): Name the inner conflict or external challenge the numbers
   reveal. Use contrast — e.g., the pull between two energies, a gap between potential and
   current reality, a warning hidden in the numbers.

3. TURN (1-2 sentences): Reveal the pivotal window — the specific year, month, or cycle
   where the tide turns. Be precise. Name actual numbers (Life Path, Personal Year, Name
   Number). This is the "aha moment" of the reading.

4. RESOLUTION (1-2 sentences): Give ONE concrete, numbered action tied directly to their
   specific numbers. Then weave in ONE natural remedy or spiritual practice that supports
   this — a mantra, a color, a morning ritual, a gemstone — phrased as part of the story,
   not as a bullet or label. Make it feel like wisdom, not a prescription.

5. CLOSING (1 sentence): End with a line that lingers. Something they will remember hours
   later. Personal, warm, specific to their journey.

RULES:
- Write in second person ("you", "your") — never "the client" or "they"
- Total length: 5–7 sentences. No more. Quality over quantity.
- No bullet points. No headers. No labels. Pure flowing prose.
- Never mention "Indian Vedic", "Chaldean", "Pythagorean", or "tradition"
- Never say "the numbers say" or "numerology indicates" — just state the truth directly
- Preserve ALL specific numbers (e.g., Life Path 11, Personal Year 3, Name Number 8)
  and ALL specific years (e.g., 2026, 2027) — these are the proof points
- If different traditions give different details, weave in the most compelling ones
- The tone is: warm but direct. Expert but human. Like a wise friend who knows your soul."""


def numerology_story(
    bullets: List[str],
    question: str,
    intent: str,
    subject: str = "",
    remedies: dict = {},
) -> str:
    """
    Weave multiple numerology tradition answers into one storytelling narrative.
    Falls back to the first bullet if LLM fails.
    """
    if not bullets:
        return ""
    if len(bullets) == 1:
        return bullets[0]

    try:
        from utils.deepseek_client import call as ds_call

        sources_block = "\n\n".join(
            f"[Reading {i+1}]\n{b.strip()}" for i, b in enumerate(bullets)
        )

        # Build optional remedy context to weave into the story
        remedy_context = ""
        if remedies:
            parts = []
            mantras = remedies.get("mantras", [])
            if mantras:
                m = mantras[0]
                parts.append(f"Mantra: {m.get('mantra','')}" if isinstance(m, dict) else str(m))
            habits = remedies.get("daily_habits", [])
            if habits:
                parts.append(f"Daily practice: {habits[0]}")
            gems = remedies.get("gemstones", [])
            if gems:
                g = gems[0]
                parts.append(f"Gemstone: {g.get('stone','')}" if isinstance(g, dict) else str(g))
            colors = remedies.get("colors", [])
            if colors:
                parts.append(f"Healing color: {colors[0]}")
            if parts:
                remedy_context = f"\n\nSpiritual remedies available for this person:\n" + "\n".join(f"- {p}" for p in parts[:3])

        user_prompt = (
            f"Client: {subject or 'the client'}\n"
            f"Question they asked: {question}\n"
            f"Intent: {intent}\n\n"
            f"Here are {len(bullets)} numerology readings for this question:\n\n"
            f"{sources_block}"
            f"{remedy_context}\n\n"
            f"Now write ONE unified storytelling narrative following the 5-part arc "
            f"(Hook → Tension → Turn → Resolution → Closing). "
            f"In the Resolution, naturally weave in one of the remedies above as a spiritual practice. "
            f"Extract the best insights from all readings. Make it unforgettable."
        )

        result = ds_call(
            system=_STORY_SYSTEM,
            user=user_prompt,
            temperature=0.35,   # slight warmth for narrative voice
            max_tokens=500,
        )

        story = (result or "").strip()
        # Validate: must be substantial and not just echo the first bullet
        if len(story) > 120 and story[:60].lower() != bullets[0][:60].lower():
            return story

        return bullets[0]

    except Exception:
        return bullets[0]
