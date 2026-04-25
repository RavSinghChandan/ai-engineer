import json
import logging
import re
from typing import List, Dict

import requests
from config import settings

log = logging.getLogger(__name__)

CAROUSEL_PROMPT = '''You are an expert AI educator and content creator.

Your task is to generate content for a PDF carousel (LinkedIn style) on the topic:
"{topic}"

Generate 7 slides in JSON format:
{{
  "slides": [
    {{ "title": "...", "content": "..." }}
  ]
}}

Slide structure:
Slide 1: Hook (attention-grabbing, curiosity-driven)
Slide 2: Problem (why people struggle to understand this topic)
Slide 3: Simple Definition (very easy language)
Slide 4: How it Works (basic explanation with analogy)
Slide 5: Real-world Examples
Slide 6: Why it Matters (career + future)
Slide 7: CTA (Follow for daily learning)

Style rules:
- Keep each slide short (2-3 lines max)
- Simple English, no jargon
- Beginner-friendly, use analogies
- Engaging and slightly emotional
- No long paragraphs

Tone: Confident, simple, slightly inspiring.
Output ONLY valid JSON. No explanation outside JSON.'''

FALLBACK_SLIDES: List[Dict] = [
    {"title": "What if machines could think?",
     "content": "They already do. AI is all around you — and most people don't even notice it."},
    {"title": "Why AI feels confusing",
     "content": "Movies show robots taking over. Scientists use words like 'neural networks'. No wonder it feels hard!"},
    {"title": "AI in simple words",
     "content": "AI is software that learns from experience. It gets smarter over time — just like you do."},
    {"title": "How does AI actually work?",
     "content": "Think of training a dog. Show it examples, reward right answers, correct mistakes. AI learns the same way — but with data."},
    {"title": "AI is already in your life",
     "content": "Netflix recommendations. Google Maps routes. Face unlock. Spam filters. That's all AI."},
    {"title": "Why this matters for you",
     "content": "AI is creating millions of new jobs. Understanding it — even at a basic level — gives you a massive career edge."},
    {"title": "Want to learn AI every day?",
     "content": "Follow me for daily AI breakdowns in simple English. No jargon. No fluff. Just clarity. 🚀"},
]


def get_carousel_slides(topic: str) -> List[Dict]:
    prompt  = CAROUSEL_PROMPT.format(topic=topic)
    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }

    try:
        resp = requests.post(settings.DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        content = re.sub(r"```(?:json)?", "", content).strip().rstrip("`").strip()

        match   = re.search(r"\{.*\}", content, re.DOTALL)
        data    = json.loads(match.group() if match else content)
        log.info("Carousel slides received from DeepSeek for topic: %s", topic)
        return data["slides"]

    except Exception as exc:
        log.warning("Carousel DeepSeek error (%s) — using fallback.", exc)
        return FALLBACK_SLIDES
