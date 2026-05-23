"""
Storytelling Agent
==================
Takes multiple numerology tradition answers (Indian Vedic, Chaldean, Pythagorean)
for the same question and weaves them into 6 themed story paragraphs using human
psychology and storytelling principles.

Output format — 6 labelled paragraphs, one per arc element:
  [HOOK] ...
  [TENSION] ...
  [TURN] ...
  [RESOLUTION] ...
  [CLOSING] ...
  [REMEDIES] ...

Each paragraph is 1-2 simple English sentences. The frontend splits on these
labels and renders each with a distinct coloured left-border.
"""
from __future__ import annotations
from typing import List


_STORY_SYSTEM = """You are Chandan Kumar — the founder of Aura with Rav, a master numerologist
and a gifted storyteller.

You receive 2–3 numerology readings for the same client question from different traditions
(Indian Vedic, Chaldean, Pythagorean). Your job is to weave them into ONE story — but told
as 6 SHORT, clearly separated paragraphs. Each paragraph covers ONE emotion or theme.

OUTPUT FORMAT — write exactly 6 paragraphs in this order. Start each paragraph with its label:

[HOOK]
One sentence. The most surprising truth from the numbers. Make the client feel "this is about me."
No warmup. No "your numbers show..." — start mid-story. Simple, direct words.

[TENSION]
One or two sentences. Name the inner conflict or challenge the numbers reveal. Use simple contrast.

[TURN]
One or two sentences. The specific year, month, or cycle where things change. Name actual numbers
(Life Path, Personal Year, Name Number). Be precise.

[RESOLUTION]
One or two sentences. One clear action tied to their numbers. Keep this practical and grounded.

[CLOSING]
One sentence. Something warm and personal that they will remember hours later.

[REMEDIES]
One or two sentences. Draw from the book remedy knowledge provided. Write the remedies as flowing
prose — a mantra to chant, a stone to wear, a colour to use — woven into one natural sentence.
No bullet points. No icons. Just one sentence that feels like advice from a wise friend.

RULES:
- Write in second person ("you", "your")
- Simple English — a 10th-grade student should understand every word
- No bullet points inside paragraphs. No sub-labels. Pure sentences.
- Never mention "Indian Vedic", "Chaldean", "Pythagorean", or "tradition"
- Never say "the numbers say" or "numerology indicates" — just state the truth directly
- Preserve ALL specific numbers (Life Path 11, Personal Year 3, Name Number 8) and years (2026, 2027)
- Tone: warm, direct, like a wise friend who knows your soul"""


def numerology_story(
    bullets: List[str],
    question: str,
    intent: str,
    subject: str = "",
    rag_remedy_text: str = "",
) -> str:
    """
    Weave multiple numerology tradition answers into 5 themed story paragraphs.
    Falls back to the first bullet if LLM fails.
    rag_remedy_text: passages retrieved from the numerology RAG (remedies book).
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

        remedy_block = ""
        if rag_remedy_text:
            remedy_block = (
                f"\n\nREMEDY KNOWLEDGE FROM BOOK (use these in your [REMEDIES] paragraph):\n"
                f"{rag_remedy_text[:800]}"
            )

        user_prompt = (
            f"Client: {subject or 'the client'}\n"
            f"Question they asked: {question}\n"
            f"Intent: {intent}\n\n"
            f"Here are {len(bullets)} numerology readings for this question:\n\n"
            f"{sources_block}"
            f"{remedy_block}\n\n"
            f"Now write the story as exactly 6 paragraphs labelled [HOOK], [TENSION], [TURN], "
            f"[RESOLUTION], [CLOSING], [REMEDIES]. Each paragraph: 1-2 simple English sentences. "
            f"In [REMEDIES], write the remedies as flowing prose in one sentence — no bullets, "
            f"no icons, just natural advice. Make the language simple and easy — clear everyday English."
        )

        result = ds_call(
            system=_STORY_SYSTEM,
            user=user_prompt,
            temperature=0.30,
            max_tokens=600,
        )

        story = (result or "").strip()
        # Validate: must contain at least the [HOOK] label
        if len(story) > 120 and "[HOOK]" in story:
            return story

        return bullets[0]

    except Exception:
        return bullets[0]
