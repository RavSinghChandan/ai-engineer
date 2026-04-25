# Agentic Growth OS — Dynamic Code Flow
> `agentic-growth-os/backend/`

---

## What This Project Does

An **AI-powered marketing campaign optimizer** that learns from its own history.
Give it a campaign brief (product, budget, audience, platform) → 5 AI agents run in sequence → you get audience targeting, ad copy, budget allocation, campaign structure, and performance forecast.

Run it again for a similar campaign → it reads previous results → automatically improves tone, headlines, and budget split.

**Type:** LangGraph Sequential Pipeline + File-based Memory Learning  
**Framework:** FastAPI + LangGraph  
**No LLM calls inside nodes** — all nodes use deterministic rule-based logic (fast, free).  
**The intelligence is in the learning loop** — past results improve future runs.

---

## Mind Map

```
              ┌──────────────────────────────────────────┐
              │         POST /api/execute-workflow       │
              │         (campaign brief)                 │
              └───────────────────┬──────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │       main.py              │
                    │                            │
                    │  1. Memory Lookup          │
                    │     find_similar()         │
                    │     → similar past campaigns│
                    │     get_improvements()     │
                    │     → improvement hints    │
                    │                            │
                    │  2. Build initial_state    │
                    │     (includes improvements)│
                    │                            │
                    │  3. campaign_graph.invoke()│
                    └─────────────┬──────────────┘
                                  │
            ┌─────────────────────▼──────────────────────────┐
            │                LangGraph Pipeline               │
            │                                                 │
            │   audience_node                                 │
            │        ↓ (fixed edge)                           │
            │   ad_copy_node                                  │
            │        ↓ (fixed edge)                           │
            │   budget_node                                   │
            │        ↓ (fixed edge)                           │
            │   campaign_node                                 │
            │        ↓ (fixed edge)                           │
            │   performance_node                              │
            │        ↓                                        │
            │       END                                       │
            └─────────────────────┬──────────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  main.py (post-graph)       │
                    │                            │
                    │  4. learning_mode=True?     │
                    │     store_campaign()        │
                    │     → save to JSON file     │
                    │                            │
                    │  5. Build + return response │
                    └────────────────────────────┘


MEMORY SYSTEM (flat JSON file):

  campaign_store.json
  ┌─────────────────────────────────────┐
  │  [                                  │
  │   { run1: metrics, decisions },     │
  │   { run2: metrics, decisions },     │
  │   { run3: metrics, decisions }  ← current learns from these
  │  ]                                  │
  └─────────────────────────────────────┘
       ↑ read before graph runs    ↑ write after graph finishes
```

---

## Step-by-Step Code Flow

```
Step 1   User sends: POST /api/execute-workflow
         Body: {
           campaign: {
             name: "TechLeap Academy Q1",
             campaign_type: "coaching",
             product_name: "TechLeap Academy",
             budget: 30000,
             target_audience: "Working professionals 24-35",
             key_benefit: "Get placed in top tech companies in 90 days",
             platform: "meta_ads",
             learning_mode: true
           }
         }

Step 2   main.py — Memory lookup (if learning_mode=True):
         find_similar("coaching", "TechLeap Academy", "Working professionals 24-35")
           → loads campaign_store.json
           → Jaccard similarity between current campaign and stored campaigns
           → score > 0.15 → include in results
           → returns top-3 similar past campaigns

         If similar campaigns found:
           get_improvements(similar)
             → reads best past campaign's metrics
             → roi < 1.5? → tone = "urgent_cta"
             → ctr < 2.5? → headline_strategy = "question_hook"
             → low conv? → audience_refinement = narrow age 28-40
             → returns improvements dict

Step 3   Build initial_state dict:
         {
           campaign_type: "coaching",
           product_name: "TechLeap Academy",
           budget: 30000,
           target_audience: "Working professionals 24-35",
           improvements: { tone: "urgent_cta", ... },  ← if learned
           audience_output: None,   ad_copy_output: None,
           budget_output: None,     campaign_output: None,
           performance_output: None,
           agent_log: [],           all_insights: []
         }

Step 4   campaign_graph.invoke(initial_state)
         → LangGraph runs 5 nodes in sequence:

         NODE 1: audience_node(state)
           → looks up PROFILES["coaching"]
           → age: "22-38", interests: ["career growth", "skill development"]
           → If improvements → refine age to "28-40"
           → calculates estimated reach = budget × 150 = 4,500,000
           → returns: { audience_output: { profile, reach, quality_score }, agent_log: [...] }

         NODE 2: ad_copy_node(state)
           → reads improvements.tone_recommendation = "urgent_cta"
           → picks from COPY_TEMPLATES["coaching"]["urgent_cta"]
           → headline: "Batch Starting Monday — Enroll NOW"
           → description: "Miss this batch and wait 3 months..."
           → If improvements → headline_strategy = "question_hook"
               → headline overridden: "Still Waiting for Your Career to Take Off?"
           → returns: { ad_copy_output: { headline, description, cta, tone }, agent_log: [...] }

         NODE 3: budget_node(state)
           → base allocation for "coaching": search 45%, display 20%, social 35%
           → If improvements.budget_reallocation → adjust ratios
           → calculates per-channel: amount, estimated impressions, clicks
           → bid_strategy = "target_cpa" (coaching default)
           → returns: { budget_output: { allocation, breakdown, daily_budget }, agent_log: [...] }

         NODE 4: campaign_node(state)
           → platform = "meta_ads" → types: [Awareness, Traffic, Conversions]
           → creates ad groups: Working Professionals, Fresh Graduates, Career Switchers
           → quality_score = random(5-9) + 0.5 if improvements
           → returns: { campaign_output: { ad_groups, quality_score, status }, agent_log: [...] }

         NODE 5: performance_node(state)
           → BASELINE["coaching"] = { ctr: 3.4, conv: 4.8, roi: 2.2, cpc: 28.0 }
           → tone lift from "urgent_cta": ctr×1.28, conv×1.22
           → audience quality boost: (8.5 - 7.0) × 0.05 = 0.075
           → If improvements → add random boost (0.3-0.8 CTR, 0.4-1.0 conv)
           → calculate: total_clicks = budget/cpc, impressions, conversions, revenue, roi
           → grade: roi >= 2.5 → "A"
           → returns: { metrics, improvement_percentage, performance_grade, forecast_30_days }

Step 5   Back in main.py:
         learning_mode=True + metrics exist?
           → store_campaign(campaign_data, metrics, agent_decisions)
           → appends to campaign_store.json
           ← next run for similar campaign will benefit from this

Step 6   Build and return response with all fields
```

---

## One Complete Example — First vs Second Run

### First Run (no prior data):

**Input:**
```json
{ campaign_type: "coaching", product_name: "TechLeap", budget: 30000,
  target_audience: "Working professionals 24-35", learning_mode: true }
```

**Trace:**
```
find_similar() → [] (empty store)
learning_applied = False
improvements = {}

audience_node:
  age = "22-38" (default, not refined)
  reach = 30000 × 150 = 4,500,000

ad_copy_node:
  tone = "professional" (default)
  headline = "Expert-Led Training Programs"

budget_node:
  search 45% = ₹13,500 | display 20% = ₹6,000 | social 35% = ₹10,500

performance_node:
  ctr = 3.4 (baseline)
  roi = 2.2
  grade = "A"

store_campaign():
  campaign_store.json now has 1 entry:
  { metrics: { ctr:3.4, roi:2.2 }, decisions: { tone:"professional" } }
```

**Output:** Grade A, baseline results, no learning message.

---

### Second Run (same type, learns from first):

**Input:** Same campaign_type "coaching", similar audience

**Trace:**
```
find_similar() → [{ similarity: 0.72, campaign: { run1 data } }]
learning_applied = True

get_improvements(similar):
  roi = 2.2 (from run1)
  ctr = 3.4 (from run1)
  conv = 4.8 (from run1)

  roi > 1.5 → not urgent_cta
  ctr >= 2.5 → not question_hook
  → tone = "emotional_storytelling"
  → headline_strategy = "testimonial_style"
  → audience: conv >= 3.0 → keep broad "25-45"

audience_node:
  improvements.audience_refinement.refined = False → age stays "25-45"
  reach = 30000 × 150 × 1.12 = 5,040,000  ← +12% (learned)

ad_copy_node:
  tone = "emotional_storytelling"
  headline_strategy = "testimonial_style"
  → headline overridden: '"Got placed at MNC in 3 months" — Rahul K.'
  insights: ["Social proof headline applied based on high CTR pattern"]

performance_node:
  base ctr 3.4 × emotional_storytelling lift 1.18 = 4.01
  + audience quality boost + random improvement boost
  roi = 2.8  (was 2.2 → +27%)
  grade = "A+"

learning_summary:
  "System learned from 1 previous run(s) and improved performance by 27%"
  changes_applied: ["Headline strategy → 'testimonial_style'"]
```

**Output:** Grade A+, 27% ROI improvement, learning message with specific changes applied.

---

## File Map

```
agentic-growth-os/backend/
├── main.py                         → FastAPI + 5 endpoints + memory orchestration
├── models/
│   └── campaign.py                 → Pydantic models (CampaignInput, WorkflowExecuteRequest)
├── graph/
│   ├── state.py                    → CampaignState TypedDict (all graph fields)
│   ├── workflow.py                 → Builds sequential LangGraph pipeline
│   └── nodes/
│       ├── audience_node.py        → Audience profile + reach calculation
│       ├── ad_copy_node.py         → Headline + description + CTA selection
│       ├── budget_node.py          → Channel allocation + bid strategy
│       ├── campaign_node.py        → Ad groups + quality score
│       └── performance_node.py    → Metrics + ROI + grade + forecast
└── memory/
    ├── campaign_memory.py          → Load/save campaign_store.json + similarity search
    └── campaign_store.json         → Flat JSON store (grows with each run)
```

---

## Key LangGraph Concepts in This Project

```
1. SEQUENTIAL PIPELINE (simplest LangGraph pattern):
   No conditional edges. Every node always goes to the next.
   audience → ad_copy → budget → campaign → performance → END

   Why use LangGraph at all then?
   → CampaignState TypedDict gives structure
   → Each node reads ALL previous nodes' outputs from state
   → agent_log and all_insights accumulate across all 5 nodes automatically

2. STATE ACCUMULATION (the power):
   After audience_node: state has audience_output
   After ad_copy_node:  state has audience_output + ad_copy_output
   After budget_node:   state has all above + budget_output
   performance_node reads ALL of them to calculate metrics

3. LEARNING LOOP (outside LangGraph):
   This is NOT in the graph — it's in main.py wrapping the graph:
   BEFORE graph → read similar past campaigns → build improvements dict
   AFTER  graph → store results to JSON file
   improvements dict flows INTO the graph as part of initial_state
   Each node reads improvements and adjusts its output accordingly

4. NO LLM IN NODES:
   All nodes use rule-based lookup tables (PROFILES, COPY_TEMPLATES, etc.)
   This makes the pipeline instant, deterministic, and free to run.
   The "intelligence" is the learning loop, not LLM calls inside nodes.
```
