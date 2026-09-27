"""p04 — Speculative fan-out and the counting pattern."""
from fake_typesafe import Noul


def count_matching(client, items, statement_for):
    """Ask one Noul per item and sum in Python.

    Do not ask a model to count. Parallel evaluation makes per-item questions
    cheap, and arithmetic in code is exact.
    """
    questions = {
        f"item_{i}": Noul(instructions=statement_for(i))
        for i in range(len(items))
    }
    r = client.system_one(state={"items": items}, questions=questions)
    probs = [r.answers[f"item_{i}"].noul for i in range(len(items))]
    return sum(p > 0.5 for p in probs), probs


def cost_per_decision(usage, n_questions, price_per_m_input=0.042):
    """Fan-out amortises the state encoding across every question."""
    if n_questions == 0:
        raise ValueError("no questions")
    return (usage.input_tokens / 1e6 * price_per_m_input) / n_questions
