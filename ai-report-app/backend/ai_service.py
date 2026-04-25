import os
import requests
import json
import re

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

PROMPT_TEMPLATE = """You are a data analyst AI.

Convert the input into structured data and insights.

INPUT:
{user_input}

OUTPUT FORMAT (STRICT JSON):
{{
  "title": "Report title",
  "x_label": "X axis",
  "y_label": "Y axis",
  "x_values": [],
  "y_values": [],
  "insights": []
}}

Rules:
- Extract meaningful trends
- Keep arrays same length
- No extra text outside JSON"""

FALLBACK_DATA = {
    "title": "Sample Analysis Report",
    "x_label": "Month",
    "y_label": "Value",
    "x_values": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    "y_values": [12, 28, 22, 45, 38, 60],
    "insights": [
        "Consistent upward trend observed across the 6-month period.",
        "Peak performance reached in June with a value of 60.",
        "Notable acceleration between March and April (+23 points).",
        "February to March shows a slight dip before recovery.",
    ],
}


def get_ai_analysis(user_input: str) -> dict:
    """Call DeepSeek API and parse the JSON response. Falls back to sample data on any error."""
    prompt = PROMPT_TEMPLATE.format(user_input=user_input)

    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
    }

    try:
        resp = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        # Strip markdown code fences if present
        content = re.sub(r"```(?:json)?", "", content).strip()

        # Extract the first JSON object in the response
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(content)

    except Exception:
        # Return sample data so the app still works without a valid API key
        return FALLBACK_DATA
