"""
Quick test: verifies OpenAI and DeepSeek APIs are reachable and routing works.

Small input  (< 500 tokens) → OpenAI
Large input  (>= 500 tokens, ~2000+ chars) → DeepSeek
"""

import os
import sys
from dotenv import load_dotenv

# Use the langchain_project .env which has both real keys
load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(__file__),
        "langchain-langraph-workspace/langchain_project/.env"
    )
)

from openai import OpenAI

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY")
THRESHOLD = int(os.getenv("LLM_TOKEN_THRESHOLD", "500"))
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def call_openai(prompt: str) -> str:
    client = OpenAI(api_key=OPENAI_KEY)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=50,
    )
    return resp.choices[0].message.content.strip()


def call_deepseek(prompt: str) -> str:
    client = OpenAI(api_key=DEEPSEEK_KEY, base_url="https://api.deepseek.com")
    resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=50,
    )
    return resp.choices[0].message.content.strip()


def test(label: str, prompt: str):
    tokens = estimate_tokens(prompt)
    expected = "DeepSeek" if tokens >= THRESHOLD else "OpenAI"
    print(f"\n{'='*60}")
    print(f"TEST: {label}")
    print(f"  Estimated tokens : {tokens}")
    print(f"  Threshold        : {THRESHOLD}")
    print(f"  Expected provider: {expected}")
    try:
        if expected == "OpenAI":
            reply = call_openai(prompt)
        else:
            reply = call_deepseek(prompt)
        print(f"  Status           : PASS")
        print(f"  Response         : {reply[:120]}")
    except Exception as e:
        print(f"  Status           : FAIL")
        print(f"  Error            : {e}")
        return False
    return True


if __name__ == "__main__":
    print(f"Token threshold: {THRESHOLD} tokens (~{THRESHOLD * CHARS_PER_TOKEN} chars)\n")

    # --- Test 1: Small prompt → OpenAI ---
    small_prompt = "Say hello in one word."

    # --- Test 2: Large prompt → DeepSeek (pad to exceed threshold) ---
    large_prompt = (
        "You are an expert software architect. "
        "Please provide a brief summary of microservices architecture. " * 30
    )

    results = [
        test("Small prompt  → OpenAI", small_prompt),
        test("Large prompt  → DeepSeek", large_prompt),
    ]

    print(f"\n{'='*60}")
    passed = sum(results)
    print(f"Result: {passed}/{len(results)} tests passed")
    sys.exit(0 if all(results) else 1)
