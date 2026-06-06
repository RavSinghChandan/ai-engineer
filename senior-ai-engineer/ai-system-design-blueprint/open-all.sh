#!/bin/bash
# Open all 15 AI System Design flow diagrams in the browser — one command.
DIR="$(cd "$(dirname "$0")" && pwd)"

# TIER 1 — LLM Application Patterns
open "$DIR/P1-plain-llm/flow.html"
open "$DIR/P2-rag/flow.html"
open "$DIR/P3-agent-tool-calling/flow.html"
open "$DIR/P4-memory-based-ai/flow.html"
open "$DIR/P5-streaming-async/flow.html"
open "$DIR/P6-multi-agent-systems/flow.html"
open "$DIR/P7-guardrails-safety/flow.html"

# TIER 2 — Data & Retrieval
open "$DIR/P8-vector-database-design/flow.html"
open "$DIR/P9-hybrid-search/flow.html"
open "$DIR/P10-fine-tuning-peft/flow.html"

# TIER 3 — Production Infrastructure
open "$DIR/P11-caching-strategy/flow.html"
open "$DIR/P12-observability-evals/flow.html"
open "$DIR/P13-cost-latency-optimisation/flow.html"

# TIER 4 — Security & Compliance
open "$DIR/P14-prompt-injection-defence/flow.html"
open "$DIR/P15-pii-data-privacy/flow.html"

echo "Opened P1–P15 AI System Design flow diagrams in your browser."
echo "See INDEX.md for the full blueprint."
