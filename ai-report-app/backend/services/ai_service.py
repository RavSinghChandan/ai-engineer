import json
import logging
import re
from typing import Dict, Any

import requests
from config import settings

log = logging.getLogger(__name__)

# ── Unified prompt (single DeepSeek call → report + carousel) ─────────────────
UNIFIED_PROMPT = """You are an expert data analyst and content designer.

Your task is to convert user input into structured data, insights, and carousel-ready content for a PDF report.

INPUT:
{user_input}

OUTPUT FORMAT (STRICT JSON):
{{
  "report": {{
    "title": "Report title",
    "x_label": "X axis label",
    "y_label": "Y axis label",
    "x_values": [],
    "y_values": [],
    "insights": [
      "Insight 1",
      "Insight 2",
      "Insight 3"
    ]
  }},
  "carousel": {{
    "slides": [
      {{
        "title": "Slide 1 title",
        "content": "Short engaging content"
      }}
    ]
  }}
}}

REQUIREMENTS:

DATA REPORT:
- Extract clean numerical trends from input
- Ensure x_values and y_values are same length
- Create meaningful labels
- Insights must be business-friendly and actionable

CAROUSEL PDF — Generate 6 to 8 slides:
1. Hook (attention-grabbing)
2. Problem or context
3 to 5. Explanation of trend (simple)
6. Key takeaway
7. CTA (follow for more insights)

STYLE RULES:
- Keep content concise (2 to 3 lines per slide)
- Use simple English
- Avoid technical jargon
- Make it engaging and slightly emotional
- Use real-world tone like LinkedIn posts

EXTRA LOGIC:
- If input is unclear, infer a reasonable dataset
- If no numbers exist, generate sample trend data
- Always ensure output is usable for graph plotting

IMPORTANT:
- Output ONLY valid JSON
- No explanation outside JSON
- No markdown
- No extra text"""

# ── Fallback ──────────────────────────────────────────────────────────────────
FALLBACK: Dict[str, Any] = {
    "report": {
        "title": "Sample Analysis Report",
        "x_label": "Month",
        "y_label": "Value",
        "x_values": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        "y_values": [12, 28, 22, 45, 38, 60],
        "insights": [
            "Consistent upward trend across the 6-month period.",
            "Peak value reached in June (60) — highest on record.",
            "Notable acceleration between March and April (+23 points).",
            "Minor dip in March warrants investigation into seasonal factors.",
        ],
    },
    "carousel": {
        "slides": [
            {"title": "What if your data could tell a story?",
             "content": "It already does. Here's what the numbers reveal — and why it matters to you."},
            {"title": "The problem with raw data",
             "content": "Most people see numbers and feel nothing. The insight is hidden. We're here to change that."},
            {"title": "The trend in simple words",
             "content": "Values climbed steadily from January through June with one small dip in March."},
            {"title": "Why the dip happened",
             "content": "A seasonal slowdown in March is common. What matters is the strong recovery in April."},
            {"title": "The real story: growth",
             "content": "From 12 in January to 60 in June — that's a 5x increase in just 6 months."},
            {"title": "What this means for you",
             "content": "Momentum is building. If the trend holds, July could break all previous records."},
            {"title": "Want insights like this daily?",
             "content": "Follow for daily data breakdowns in plain English. No jargon. Just clarity. 🚀"},
        ]
    },
}


def get_unified_analysis(user_input: str) -> Dict[str, Any]:
    """Single DeepSeek call that returns both report data and carousel slides."""
    prompt  = UNIFIED_PROMPT.format(user_input=user_input)
    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }

    try:
        resp = requests.post(settings.DEEPSEEK_API_URL, headers=headers, json=payload, timeout=40)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        # Strip any accidental markdown fences
        content = re.sub(r"```(?:json)?", "", content).strip().rstrip("`").strip()

        match  = re.search(r"\{.*\}", content, re.DOTALL)
        result = json.loads(match.group() if match else content)

        # Validate structure
        assert "report"   in result, "missing 'report' key"
        assert "carousel" in result, "missing 'carousel' key"

        log.info(
            "Unified AI response received — title: %s, slides: %d",
            result["report"].get("title"),
            len(result["carousel"].get("slides", [])),
        )
        return result

    except Exception as exc:
        log.warning("DeepSeek unified call failed (%s) — using fallback.", exc)
        return FALLBACK
