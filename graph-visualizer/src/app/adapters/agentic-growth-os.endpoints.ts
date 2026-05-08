import { ExecutionStep, EndpointDef as EndpointConfig, FormField as EndpointField } from '../models/visualizer.models';

// ── Step helpers ─────────────────────────────────────────────────────────────

function userStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'User Request', description: desc, file: 'frontend/app.component.ts', functionName: 'submit()', nodeId: 'user', badge: 'Angular', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function routeStep(id: number, method: string, path: string, fn: string, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: `${method} ${path}`, description: desc, file: 'backend/main.py', functionName: fn, nodeId: 'routes', badge: 'FastAPI', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function memStep(id: number, op: string, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: `Memory: ${op}`, description: desc, file: 'memory/campaign_memory.py', functionName: op, nodeId: 'memory', badge: 'FAISS Memory', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function audienceStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'Audience Agent Node', description: desc, file: 'graph/nodes/audience_node.py', functionName: 'audience_node()', nodeId: 'audience', badge: 'LangGraph Node', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function adCopyStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'Ad Copy Agent Node', description: desc, file: 'graph/nodes/ad_copy_node.py', functionName: 'ad_copy_node()', nodeId: 'ad-copy', badge: 'LangGraph Node', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function budgetStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'Budget Agent Node', description: desc, file: 'graph/nodes/budget_node.py', functionName: 'budget_node()', nodeId: 'budget', badge: 'LangGraph Node', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function campaignStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'Campaign Assembly Node', description: desc, file: 'graph/nodes/campaign_node.py', functionName: 'campaign_node()', nodeId: 'campaign', badge: 'LangGraph Node', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function perfStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'Performance Prediction Node', description: desc, file: 'graph/nodes/performance_node.py', functionName: 'performance_node()', nodeId: 'performance', badge: 'LangGraph Node', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function doneStep(id: number, model: string, desc: string, fields: string): ExecutionStep {
  return {
    id, name: 'Response Serialised', description: desc,
    file: 'backend/main.py', functionName: 'execute_workflow()',
    nodeId: 'response', badge: 'FastAPI', highlightLine: 1, status: 'pending',
    code: `# Final response assembled from all node outputs\nreturn {\n${fields}\n}`,
    lineOutputs: { 1: '# All LangGraph node outputs merged', 2: 'return final JSON to Angular' },
  };
}

// ── Shared code snippets ─────────────────────────────────────────────────────

const WORKFLOW_CODE = `from langgraph.graph import StateGraph, END
from graph.state import CampaignState
from graph.nodes.audience_node    import audience_node
from graph.nodes.ad_copy_node     import ad_copy_node
from graph.nodes.budget_node      import budget_node
from graph.nodes.campaign_node    import campaign_node
from graph.nodes.performance_node import performance_node

def build_campaign_graph():
    g = StateGraph(CampaignState)
    g.add_node("audience",    audience_node)
    g.add_node("ad_copy",     ad_copy_node)
    g.add_node("budget",      budget_node)
    g.add_node("campaign",    campaign_node)
    g.add_node("performance", performance_node)
    g.set_entry_point("audience")
    g.add_edge("audience",    "ad_copy")
    g.add_edge("ad_copy",     "budget")
    g.add_edge("budget",      "campaign")
    g.add_edge("campaign",    "performance")
    g.add_edge("performance", END)
    return g.compile()

campaign_graph = build_campaign_graph()`;

const AUDIENCE_CODE = `PROFILES = {
    "real_estate": {
        "primary_age": "30-50", "income_level": "upper-middle to high",
        "interests": ["property investment", "home ownership", "luxury living"],
        "platform_split": {"search_ads": 0.55, "display_ads": 0.25, "social_ads": 0.20},
        "best_hours": "7PM-10PM weekdays, 10AM-2PM weekends",
    },
    # coaching / ecommerce / custom ...
}

def audience_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    profile = PROFILES.get(ct, PROFILES["custom"])
    improvements = state.get("improvements") or {}
    age_group = profile["primary_age"]
    if improvements.get("audience_refinement", {}).get("refined"):
        age_group = improvements["audience_refinement"]["age_group"]
    quality_score  = round(random.uniform(7.2, 9.2), 1)
    estimated_reach = int(state["budget"] * 150)
    output = {
        "audience_profile": {...},
        "estimated_reach": estimated_reach,
        "audience_quality_score": quality_score,
    }
    return {**state, "audience_output": output, "agent_log": [...], "all_insights": [...]}`;

const AD_COPY_CODE = `COPY_TEMPLATES = {
    "real_estate": {
        "professional":          {"h": ["Premium Properties Await You"], "d": ["..."]},
        "urgent_cta":            {"h": ["Last 5 Units Left — Book NOW"], "d": ["..."]},
        "emotional_storytelling":{"h": ["Where Your Family's Story Begins"], "d": ["..."]},
        "benefit_focused":       {"h": ["0% Brokerage, 100% Transparency"], "d": ["..."]},
    },
    # coaching / ecommerce / custom ...
}

def ad_copy_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    improvements = state.get("improvements") or {}
    tone = improvements.get("tone_recommendation", "professional")
    hl_strategy = improvements.get("headline_strategy", "standard")
    templates = COPY_TEMPLATES.get(ct, COPY_TEMPLATES["custom"])
    t = templates.get(tone, templates["professional"])
    headline    = t["h"][0]
    description = t["d"][0]
    output = {
        "headline": headline, "description": description,
        "cta": CTAS.get(tone, "Get Started"),
        "tone_applied": tone, "headline_strategy": hl_strategy,
    }
    return {**state, "ad_copy_output": output}`;

const BUDGET_CODE = `BASE_ALLOC = {
    "real_estate": {"search_ads": 0.55, "display_ads": 0.25, "social_ads": 0.20},
    "coaching":    {"search_ads": 0.45, "display_ads": 0.20, "social_ads": 0.35},
    "ecommerce":   {"search_ads": 0.35, "display_ads": 0.25, "social_ads": 0.40},
}
BID_STRATEGIES = {
    "real_estate": "maximize_conversions",
    "coaching":    "target_cpa",
    "ecommerce":   "target_roas",
}

def budget_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    budget = state["budget"]
    improvements = state.get("improvements") or {}
    alloc = BASE_ALLOC.get(ct, BASE_ALLOC["real_estate"]).copy()
    if improvements.get("budget_reallocation"):
        r = improvements["budget_reallocation"]
        alloc.update({"search_ads": r.get("search_ads", alloc["search_ads"]), ...})
    breakdown = {
        ch: {"amount": round(budget * pct, 2), "estimated_clicks": int(budget * pct * CLK[ch])}
        for ch, pct in alloc.items()
    }
    return {**state, "budget_output": {"allocation": breakdown, "bid_strategy": BID_STRATEGIES[ct]}}`;

const CAMPAIGN_CODE = `def campaign_node(state: CampaignState) -> CampaignState:
    ad_copy = state.get("ad_copy_output") or {}
    budget  = state.get("budget_output") or {}
    audience= state.get("audience_output") or {}
    # Assemble all node outputs into campaign package
    campaign_output = {
        "campaign_name":   state["product_name"] + " Campaign",
        "headline":        ad_copy.get("headline", ""),
        "description":     ad_copy.get("description", ""),
        "cta":             ad_copy.get("cta", "Get Started"),
        "budget_split":    budget.get("allocation", {}),
        "bid_strategy":    budget.get("bid_strategy", ""),
        "target_audience": audience.get("audience_profile", {}),
        "ad_formats": ["responsive_search_ad", "display_banner", "social_carousel"],
        "extensions": ["sitelinks", "callouts", "structured_snippets"],
    }
    log_entry = {"agent": "Campaign Assembler", "status": "completed"}
    return {**state, "campaign_output": campaign_output,
            "agent_log": [*state.get("agent_log", []), log_entry]}`;

const PERFORMANCE_CODE = `BASELINE = {
    "real_estate": {"ctr": 2.1, "conv": 3.2, "roi": 1.8, "cpc": 45.0},
    "coaching":    {"ctr": 3.4, "conv": 4.8, "roi": 2.2, "cpc": 28.0},
    "ecommerce":   {"ctr": 2.8, "conv": 2.9, "roi": 1.6, "cpc": 18.0},
}
TONE_LIFT = {
    "urgent_cta":            {"ctr": 1.28, "conv": 1.22},
    "emotional_storytelling":{"ctr": 1.18, "conv": 1.15},
    "benefit_focused":       {"ctr": 1.10, "conv": 1.12},
}

def performance_node(state: CampaignState) -> CampaignState:
    ct = state["campaign_type"]
    budget = state["budget"]
    tone = state.get("ad_copy_output", {}).get("tone_applied", "professional")
    base = BASELINE.get(ct, BASELINE["real_estate"])
    lift = TONE_LIFT.get(tone, {"ctr": 1.0, "conv": 1.0})
    ctr  = round(base["ctr"] * lift["ctr"], 2)
    conv = round(base["conv"] * lift["conv"], 2)
    roi  = round(base["roi"] * (lift["ctr"] + lift["conv"]) / 2, 2)
    metrics = {"ctr": ctr, "conv_rate": conv, "roi_score": roi, "estimated_cost_per_lead": base["cpc"]}
    grade = "A+" if roi > 2.5 else "A" if roi > 2.0 else "B+" if roi > 1.7 else "B"
    return {**state, "metrics": metrics, "performance_grade": grade,
            "forecast_30_days": {"estimated_leads": int(budget * conv / 100)}}`;

const MEMORY_CODE = `import json
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

_model = SentenceTransformer("all-MiniLM-L6-v2")
_store: list = []   # in-process FAISS-style store

def find_similar(campaign_type, product_name, target_audience, top_k=3):
    if not _store:
        return []
    query = f"{campaign_type} {product_name} {target_audience}"
    q_vec = _model.encode([query])
    candidates = [c for c in _store if c["campaign_type"] == campaign_type]
    if not candidates:
        return []
    vecs = _model.encode([f"{c['product_name']} {c['target_audience']}" for c in candidates])
    scores = cosine_similarity(q_vec, vecs)[0]
    ranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
    return [c for c, s in ranked[:top_k] if s > 0.5]

def store_campaign(campaign_data, metrics, agent_decisions):
    _store.append({**campaign_data, "metrics": metrics, "agent_decisions": agent_decisions})`;

// ── WORKFLOW endpoint ─────────────────────────────────────────────────────────

function buildWorkflowSteps(form: Record<string,any>): ExecutionStep[] {
  const ct   = form['campaign_type'] || 'real_estate';
  const name = form['name'] || 'My Campaign';
  const budget = form['budget'] || 50000;
  const learning = form['learning_mode'] ? 'enabled' : 'disabled';

  return [
    userStep(0, `User fills the campaign form — campaign type: ${ct}, budget: ₹${budget}, learning mode: ${learning}. Angular POSTs to /api/execute-workflow.`,
      `interface CampaignInput {
  name: string;            // "${name}"
  campaign_type: string;   // "${ct}"
  budget: number;          // ${budget}
  target_audience: string;
  key_benefit: string;
  platform: string;
  learning_mode: boolean;  // ${form['learning_mode'] || false}
}

fetch('/api/execute-workflow', {
  method: 'POST',
  body: JSON.stringify({ campaign: payload }),
});`,
      { 1: 'CampaignInput form validated', 7: `campaign_type = "${ct}"`, 8: `budget = ${budget}`, 11: `learning_mode = ${form['learning_mode'] || false}`, 13: 'POST /api/execute-workflow dispatched' }),

    routeStep(1, 'POST', '/api/execute-workflow', 'execute_workflow()',
      'FastAPI validates the request, performs memory lookup if learning_mode=true, builds LangGraph initial state, and invokes campaign_graph.',
      `@app.post("/api/execute-workflow")
async def execute_workflow(request: WorkflowExecuteRequest):
    c = request.campaign
    campaign_id = str(uuid.uuid4())[:8]
    # Memory lookup — find similar past campaigns
    similar, improvements = [], {}
    if c.learning_mode:
        similar = find_similar(c.campaign_type.value, c.product_name, c.target_audience)
        if similar:
            improvements = get_improvements(similar)
    initial_state = {
        "campaign_type": c.campaign_type.value,
        "product_name":  c.product_name,
        "budget":        c.budget,
        "improvements":  improvements,
        "agent_log":     [],
    }
    final_state = campaign_graph.invoke(initial_state)
    return build_response(final_state, campaign_id, c)`,
      { 1: '▶ execute_workflow() — main orchestrator', 3: 'campaign_id generated', 5: 'learning_mode check', 7: 'find_similar() — memory lookup', 9: 'get_improvements() — extract learnings', 10: 'initial_state assembled for LangGraph', 16: '▶ campaign_graph.invoke() — graph starts' }),

    memStep(2, 'find_similar()',
      'SentenceTransformer embeddings used to find past campaigns of same type. Cosine similarity > 0.5 → learning applied.',
      MEMORY_CODE,
      { 1: '# campaign_memory.py — in-process store', 4: '_store: list — all past campaigns', 6: '▶ find_similar() called', 8: 'query = "real_estate Skyline Heights Home buyers..."', 9: 'q_vec = SentenceTransformer.encode(query)', 11: 'cosine_similarity → scores per campaign', 13: 'ranked by score, threshold 0.5' }),

    audienceStep(3,
      'audience_node runs first in the LangGraph pipeline. Maps campaign_type to audience profile — zero LLM cost, pure Python lookup.',
      AUDIENCE_CODE,
      { 1: 'PROFILES dict — campaign_type → audience profile', 9: '▶ audience_node(state) invoked by LangGraph', 10: `ct = "${ct}"`, 11: 'PROFILES lookup — no LLM call', 13: 'learning: age_group may be refined by improvements', 15: 'quality_score = 8.4 (random.uniform 7.2-9.2)', 16: `estimated_reach = ${Math.round(budget * 150)}` }),

    adCopyStep(4,
      'ad_copy_node selects tone and headline strategy. If learning_mode and improvements exist, uses data-driven tone instead of default "professional".',
      AD_COPY_CODE,
      { 1: 'COPY_TEMPLATES — all tones per campaign type', 9: '▶ ad_copy_node(state) invoked', 11: 'tone = improvements.tone_recommendation or "professional"', 12: 'hl_strategy from improvements or "standard"', 14: `COPY_TEMPLATES["${ct}"][tone]`, 15: 'headline selected from template', 18: 'output: headline, description, cta, tone_applied' }),

    budgetStep(5,
      'budget_node allocates the budget across search, display, and social channels. Applies reallocation from learning if available.',
      BUDGET_CODE,
      { 1: `BASE_ALLOC["${ct}"] → channel percentages`, 8: '▶ budget_node(state) invoked', 10: 'improvements.budget_reallocation checked', 11: 'channel percentages updated if learning applied', 13: 'breakdown: amount + estimated_clicks per channel', 16: `bid_strategy = "${ct === 'ecommerce' ? 'target_roas' : ct === 'coaching' ? 'target_cpa' : 'maximize_conversions'}"` }),

    campaignStep(6,
      'campaign_node assembles all previous node outputs (audience + ad_copy + budget) into a unified campaign package with ad formats and extensions.',
      CAMPAIGN_CODE,
      { 1: '▶ campaign_node(state) invoked', 3: 'ad_copy, budget, audience extracted from state', 5: 'campaign_output assembled', 6: `campaign_name = "${name} Campaign"`, 10: 'ad_formats: responsive_search_ad, display_banner, social_carousel', 11: 'extensions: sitelinks, callouts, structured_snippets' }),

    perfStep(7,
      'performance_node predicts CTR, conversion rate, ROI, and grade using tone-based lift multipliers applied to campaign-type baselines.',
      PERFORMANCE_CODE,
      { 1: 'BASELINE — per campaign_type performance', 8: '▶ performance_node(state) invoked', 11: 'ctr = baseline * tone_lift', 12: 'conv = baseline * tone_lift', 13: 'roi computed from ctr + conv lifts', 14: 'metrics: ctr, conv_rate, roi_score, cost_per_lead', 15: 'grade = "A+" / "A" / "B+" / "B" based on ROI' }),

    doneStep(8, 'WorkflowResponse',
      'All 5 LangGraph node outputs merged into final JSON. Includes metrics, ad copy, budget breakdown, insights, and learning summary.',
      `    "campaign_id":             campaign_id,
    "campaign_name":           c.name,
    "metrics":                 final_state["metrics"],
    "performance_grade":       final_state["performance_grade"],
    "forecast_30_days":        final_state["forecast_30_days"],
    "agent_log":               final_state["agent_log"],
    "agent_decisions":         agent_decisions,
    "ai_insights":             final_state["all_insights"],
    "learning_summary":        _learning_summary(...)`),
  ];
}

// ── DEMO CAMPAIGNS endpoint ───────────────────────────────────────────────────

function buildDemoSteps(): ExecutionStep[] {
  return [
    userStep(0, 'UI requests pre-built demo campaigns to populate the campaign selector.',
      `fetch('/api/demo-campaigns').then(r => r.json()).then(data => {
  console.log(data.campaigns.length);  // 3 demo campaigns
  // UI populates campaign type dropdown
});`,
      { 1: 'GET /api/demo-campaigns', 2: 'campaigns: [real_estate, coaching, ecommerce]' }),

    routeStep(1, 'GET', '/api/demo-campaigns', 'get_demo_campaigns()',
      'Returns 3 hardcoded demo campaigns — no LLM, no graph execution.',
      `DEMO_CAMPAIGNS = [
    { "id": "demo-001", "name": "Premium Residences Launch",
      "campaign_type": "real_estate", "budget": 50000,
      "platform": "google_ads" },
    { "id": "demo-002", "name": "Data Science Bootcamp",
      "campaign_type": "coaching", "budget": 30000,
      "platform": "meta_ads" },
    { "id": "demo-003", "name": "Fashion Flash Sale",
      "campaign_type": "ecommerce", "budget": 20000,
      "platform": "both" },
]

@app.get("/api/demo-campaigns")
def get_demo_campaigns():
    return {"campaigns": DEMO_CAMPAIGNS}`,
      { 1: 'DEMO_CAMPAIGNS — 3 hardcoded entries', 14: '▶ get_demo_campaigns() invoked', 15: 'return {"campaigns": DEMO_CAMPAIGNS}' }),

    memStep(2, 'no op', 'Demo campaigns are static — no memory lookup.',
      `# Memory not used for demo campaigns
# Memory is only accessed in /api/execute-workflow
# when learning_mode = true`,
      { 1: '# Memory bypassed for GET /api/demo-campaigns' }),

    audienceStep(3, 'No graph execution for demo — audience node is not invoked.',
      `# audience_node NOT called for /api/demo-campaigns
# This endpoint only returns static configuration
# audience_node runs during /api/execute-workflow`,
      { 1: '# audience_node not invoked', 3: '# Graph runs on /api/execute-workflow' }),

    adCopyStep(4, 'Ad copy node not invoked for demo endpoint.',
      `# ad_copy_node NOT called for /api/demo-campaigns
# Returns static demo data only`,
      { 1: '# ad_copy_node not invoked' }),

    budgetStep(5, 'Budget node not invoked for demo endpoint.',
      `# budget_node NOT called for /api/demo-campaigns`,
      { 1: '# budget_node not invoked' }),

    campaignStep(6, 'Campaign node not invoked for demo endpoint.',
      `# campaign_node NOT called for /api/demo-campaigns`,
      { 1: '# campaign_node not invoked' }),

    perfStep(7, 'Performance node not invoked for demo endpoint.',
      `# performance_node NOT called for /api/demo-campaigns`,
      { 1: '# performance_node not invoked' }),

    doneStep(8, 'DemoCampaignsResponse', 'Static JSON with 3 demo campaigns.',
      `    "campaigns": [{ id, name, campaign_type, budget, platform }, ...]`),
  ];
}

// ── MEMORY GET endpoint ───────────────────────────────────────────────────────

function buildMemoryGetSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User views stored campaigns that the system has learned from.',
      `fetch('/api/campaign-memory').then(r => r.json()).then(data => {
  console.log('total:', data.total_campaigns);
  data.campaigns.forEach(c => console.log(c.campaign_type, c.metrics.roi_score));
});`,
      { 1: 'GET /api/campaign-memory', 2: 'total_campaigns: number', 3: 'last 10 campaigns returned' }),

    routeStep(1, 'GET', '/api/campaign-memory', 'get_memory()',
      'Returns last 10 stored campaigns from the in-process memory store.',
      `@app.get("/api/campaign-memory")
def get_memory():
    data = get_all_campaigns()
    camps = data.get("campaigns", [])
    return {"total_campaigns": len(camps), "campaigns": camps[-10:]}`,
      { 1: 'GET /api/campaign-memory', 2: '▶ get_memory() invoked', 3: 'get_all_campaigns() — read _store', 5: 'return last 10 + total count' }),

    memStep(2, 'get_all_campaigns()',
      'get_all_campaigns() returns the full _store list. Campaigns are stored after each execute-workflow run.',
      `def get_all_campaigns() -> dict:
    return {"campaigns": list(_store)}

# _store is populated by store_campaign():
# _store.append({
#   "campaign_type": ..., "product_name": ...,
#   "metrics": {"ctr": ..., "roi_score": ...},
#   "agent_decisions": {"tone_used": ..., "bid_strategy": ...},
# })`,
      { 1: '▶ get_all_campaigns() → _store list', 4: '_store populated by store_campaign()', 6: 'metrics + agent_decisions stored per campaign' }),

    audienceStep(3, 'No graph execution for memory read.', `# audience_node not invoked for GET /api/campaign-memory`, { 1: '# Graph not invoked for memory read' }),
    adCopyStep(4, 'No graph execution.', `# ad_copy_node not invoked`, { 1: '# Not invoked' }),
    budgetStep(5, 'No graph execution.', `# budget_node not invoked`, { 1: '# Not invoked' }),
    campaignStep(6, 'No graph execution.', `# campaign_node not invoked`, { 1: '# Not invoked' }),
    perfStep(7, 'No graph execution.', `# performance_node not invoked`, { 1: '# Not invoked' }),
    doneStep(8, 'MemoryResponse', 'Returns last 10 stored campaigns with metrics and agent decisions.',
      `    "total_campaigns": len(_store),
    "campaigns": _store[-10:]   // last 10`),
  ];
}

// ── MEMORY DELETE endpoint ────────────────────────────────────────────────────

function buildMemoryDeleteSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User clears all learned campaign data to start fresh.',
      `fetch('/api/campaign-memory', { method: 'DELETE' }).then(r => r.json()).then(d => {
  console.log(d.message);  // "Memory cleared"
});`,
      { 1: 'DELETE /api/campaign-memory', 2: 'message: "Memory cleared"' }),

    routeStep(1, 'DELETE', '/api/campaign-memory', 'delete_memory()',
      'Calls clear_memory() to empty the in-process _store list.',
      `@app.delete("/api/campaign-memory")
def delete_memory():
    clear_memory()
    return {"message": "Memory cleared"}`,
      { 1: 'DELETE /api/campaign-memory', 2: '▶ delete_memory() invoked', 3: 'clear_memory() — _store.clear()' }),

    memStep(2, 'clear_memory()', 'Empties the _store list — all learned improvements are lost.',
      `def clear_memory():
    _store.clear()
    # _store is now []
    # Next execute-workflow run will be a fresh baseline
    # No FAISS index to rebuild — pure Python list`,
      { 1: '▶ clear_memory()', 2: '_store.clear() — O(1) operation', 4: 'Next workflow run = fresh baseline', 5: '# No FAISS rebuild needed' }),

    audienceStep(3, 'No graph execution.', `# audience_node not invoked for DELETE /api/campaign-memory`, { 1: '# Not invoked' }),
    adCopyStep(4, 'No graph execution.', `# ad_copy_node not invoked`, { 1: '# Not invoked' }),
    budgetStep(5, 'No graph execution.', `# budget_node not invoked`, { 1: '# Not invoked' }),
    campaignStep(6, 'No graph execution.', `# campaign_node not invoked`, { 1: '# Not invoked' }),
    perfStep(7, 'No graph execution.', `# performance_node not invoked`, { 1: '# Not invoked' }),
    doneStep(8, 'ClearResponse', 'Confirmation that all memory was cleared.',
      `    "message": "Memory cleared"`),
  ];
}

// ── LEARNING INSIGHTS endpoint ────────────────────────────────────────────────

function buildInsightsSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User views aggregated learning insights across all campaign types.',
      `fetch('/api/learning-insights').then(r => r.json()).then(data => {
  console.log('total learned:', data.total_learned);
  data.insights.forEach(i => {
    console.log(i.campaign_type, 'ROI +', i.roi_improvement, 'CTR +', i.ctr_improvement);
  });
});`,
      { 1: 'GET /api/learning-insights', 2: 'total_learned: campaigns in memory', 4: 'ROI/CTR improvement per campaign type' }),

    routeStep(1, 'GET', '/api/learning-insights', 'learning_insights()',
      'Aggregates stored campaigns by type, computes ROI/CTR improvement from first to last run per type.',
      `@app.get("/api/learning-insights")
def learning_insights():
    data = get_all_campaigns()
    camps = data.get("campaigns", [])
    if len(camps) < 2:
        return {"insights": [], "total_learned": len(camps)}
    by_type: Dict[str, list] = {}
    for c in camps:
        by_type.setdefault(c.get("campaign_type", "custom"), []).append(c)
    result = []
    for ct, items in by_type.items():
        if len(items) >= 2:
            first_m, last_m = items[0]["metrics"], items[-1]["metrics"]
            result.append({
                "campaign_type":   ct,
                "runs":            len(items),
                "roi_improvement": round(last_m["roi_score"] - first_m["roi_score"], 2),
                "ctr_improvement": round(last_m["ctr"] - first_m["ctr"], 2),
                "best_tone":       items[-1]["agent_decisions"]["tone_used"],
            })
    return {"insights": result, "total_learned": len(camps)}`,
      { 1: '▶ learning_insights() invoked', 5: 'need ≥ 2 campaigns to compute improvement', 7: 'group campaigns by campaign_type', 10: 'first vs last run comparison', 14: 'roi_improvement: last - first', 15: 'ctr_improvement: last - first' }),

    memStep(2, 'get_all_campaigns()',
      'Reads _store and groups by campaign_type to compute learning trajectory.',
      `# Learning insights read from _store
data = get_all_campaigns()   # returns {"campaigns": _store}
# Group by type:
# by_type = {
#   "real_estate": [camp1, camp2, camp3],
#   "coaching":    [camp1, camp2],
#   "ecommerce":   [camp1],
# }
# Needs ≥ 2 runs per type to show improvement`,
      { 2: '▶ get_all_campaigns() — _store read', 4: 'by_type grouping', 8: 'Needs ≥ 2 runs per type' }),

    audienceStep(3, 'No graph execution for insights endpoint.', `# audience_node not invoked`, { 1: '# Not invoked' }),
    adCopyStep(4, 'No graph execution.', `# ad_copy_node not invoked`, { 1: '# Not invoked' }),
    budgetStep(5, 'No graph execution.', `# budget_node not invoked`, { 1: '# Not invoked' }),
    campaignStep(6, 'No graph execution.', `# campaign_node not invoked`, { 1: '# Not invoked' }),
    perfStep(7, 'No graph execution.', `# performance_node not invoked`, { 1: '# Not invoked' }),
    doneStep(8, 'InsightsResponse', 'Per-campaign-type ROI/CTR improvement trajectory with best tone and strategy.',
      `    "total_learned": len(camps),
    "insights": [{ campaign_type, runs, roi_improvement, ctr_improvement, best_tone }]`),
  ];
}

// ── Health endpoint ───────────────────────────────────────────────────────────

function buildHealthSteps(): ExecutionStep[] {
  return [
    userStep(0, 'Health check — confirms API and LangGraph engine are ready.',
      `fetch('/').then(r => r.json()).then(d => {
  console.log(d.engine);   // "LangGraph"
  console.log(d.version);  // "2.0.0"
});`,
      { 1: 'GET /', 2: 'engine: "LangGraph"', 3: 'version: "2.0.0"' }),

    routeStep(1, 'GET', '/', 'root()',
      'Root health endpoint — returns engine name and version.',
      `@app.get("/")
def root():
    return {
        "message": "Agentic Growth OS API",
        "engine":  "LangGraph",
        "version": "2.0.0",
    }`,
      { 1: 'GET / mounted', 2: '▶ root() invoked', 3: 'message: "Agentic Growth OS API"', 4: 'engine: "LangGraph"' }),

    memStep(2, 'no op', 'Memory not used for health check.', `# Memory not accessed for GET /`, { 1: '# Memory bypassed' }),
    audienceStep(3, 'No graph execution.', `# audience_node not invoked for health check`, { 1: '# Not invoked' }),
    adCopyStep(4, 'No graph execution.', `# ad_copy_node not invoked`, { 1: '# Not invoked' }),
    budgetStep(5, 'No graph execution.', `# budget_node not invoked`, { 1: '# Not invoked' }),
    campaignStep(6, 'No graph execution.', `# campaign_node not invoked`, { 1: '# Not invoked' }),
    perfStep(7, 'No graph execution.', `# performance_node not invoked`, { 1: '# Not invoked' }),
    doneStep(8, 'HealthResponse', 'Simple JSON confirming API is live.',
      `    "message": "Agentic Growth OS API",
    "engine":  "LangGraph",
    "version": "2.0.0"`),
  ];
}

// ── Endpoint configs ──────────────────────────────────────────────────────────

const CAMPAIGN_FIELDS: EndpointField[] = [
  { name: 'name',            label: 'Campaign Name',    type: 'text',   placeholder: 'My Campaign',     default: 'Premium Residences Launch' },
  { name: 'campaign_type',   label: 'Campaign Type',    type: 'select', options: ['real_estate','coaching','ecommerce','custom'], default: 'real_estate' },
  { name: 'product_name',    label: 'Product Name',     type: 'text',   placeholder: 'Product Name',    default: 'Skyline Heights' },
  { name: 'budget',          label: 'Budget (₹)',       type: 'number', placeholder: '50000',           default: 50000 },
  { name: 'target_audience', label: 'Target Audience',  type: 'text',   placeholder: 'Home buyers...',  default: 'Home buyers aged 30-50' },
  { name: 'key_benefit',     label: 'Key Benefit',      type: 'text',   placeholder: 'Key benefit...',  default: 'Ready to move luxury apartments' },
  { name: 'platform',        label: 'Platform',         type: 'select', options: ['google_ads','meta_ads','both'], default: 'google_ads' },
  { name: 'learning_mode',   label: 'Learning Mode',    type: 'toggle', default: true },
];

export const AGENTIC_GROWTH_OS_ENDPOINT_CONFIGS: EndpointConfig[] = [
  {
    id: 'health',
    label: 'GET /',
    method: 'GET',
    path: '/',
    emoji: '💚',
    tagline: 'API health — LangGraph engine status',
    color: '#22c55e',
    fields: [],
    buildSteps: buildHealthSteps,
    buildBody: () => null,
  },
  {
    id: 'execute-workflow',
    label: 'POST /execute-workflow',
    method: 'POST',
    path: '/api/execute-workflow',
    emoji: '🚀',
    tagline: 'Run 5-node LangGraph campaign pipeline',
    color: '#6366f1',
    fields: CAMPAIGN_FIELDS,
    buildSteps: buildWorkflowSteps,
    buildBody: (form) => ({
      campaign: {
        name:            form['name']            || 'Campaign',
        campaign_type:   form['campaign_type']   || 'real_estate',
        product_name:    form['product_name']    || 'Product',
        budget:          Number(form['budget'])  || 50000,
        target_audience: form['target_audience'] || 'General audience',
        key_benefit:     form['key_benefit']     || 'Value',
        platform:        form['platform']        || 'google_ads',
        learning_mode:   form['learning_mode']   ?? true,
      },
    }),
  },
  {
    id: 'demo-campaigns',
    label: 'GET /demo-campaigns',
    method: 'GET',
    path: '/api/demo-campaigns',
    emoji: '📋',
    tagline: 'Load 3 pre-built campaign examples',
    color: '#f59e0b',
    fields: [],
    buildSteps: buildDemoSteps,
    buildBody: () => null,
  },
  {
    id: 'memory-get',
    label: 'GET /campaign-memory',
    method: 'GET',
    path: '/api/campaign-memory',
    emoji: '🧠',
    tagline: 'View stored campaign learnings',
    color: '#30d158',
    fields: [],
    buildSteps: buildMemoryGetSteps,
    buildBody: () => null,
  },
  {
    id: 'memory-delete',
    label: 'DELETE /campaign-memory',
    method: 'DELETE',
    path: '/api/campaign-memory',
    emoji: '🗑️',
    tagline: 'Clear all learning memory',
    color: '#ef4444',
    fields: [],
    buildSteps: buildMemoryDeleteSteps,
    buildBody: () => null,
  },
  {
    id: 'insights',
    label: 'GET /learning-insights',
    method: 'GET',
    path: '/api/learning-insights',
    emoji: '📊',
    tagline: 'ROI/CTR improvement trajectory per type',
    color: '#8b5cf6',
    fields: [],
    buildSteps: buildInsightsSteps,
    buildBody: () => null,
  },
];
