import { Injectable } from '@angular/core';

// ── Guardrail patterns G1–G5 ──────────────────────────────────────────────
const GUARDS = {
  injection: /\bignore\b.{0,30}\b(instructions?|prompt|system)\b|\bjailbreak\b|\bact\s+as\b|\bpretend\s+(you\s+are|to\s+be)\b|\bDAN\b|\bdo\s+anything\s+now\b|\boverride\b|\broleplay\s+as\b/i,
  harmful:   /\b(kill|hack|attack|exploit|bomb|violence|drug|weapon|suicide|self.harm|password|credentials)\b/i,
  pii:       /\b(ssn|aadhar|pan\s+card|credit\s+card|bank\s+account|\d{12}|\d{16})\b/i,
  offTopic:  /\b(politics|religion|sex|nude|porn|adult\s+content|racism|bitcoin|crypto\s+currency|stock\s+market|investment\s+advice)\b/i,
  nonsense:  /^(.)\1{9,}$|^[^a-zA-Z0-9\s?!.,'-]{5,}$/,
};

@Injectable({ providedIn: 'root' })
export class ChatService {

  // ── Fuzzy normalizer ────────────────────────────────────────────────────
  normalize(raw: string): string {
    return raw.toLowerCase()
      .replace(/\bbnch\b|\bbench\s*resourc\w*/g, 'bench resource optimizer')
      .replace(/\baur[ae]\b|\baura\s*rav\b|\bauraa\b/g, 'aura with rav')
      .replace(/\bagen?ti[ck]\b|\bagentic\s*grwoth\b|\bagentic\s*groth\b/g, 'agentic growth os')
      .replace(/\brunboo?k\s*ai\b|\brunbookai\b/g, 'runbook ai')
      .replace(/\brunboo?k\b|\brunbok\b|\brun\s*book\b/g, 'runbook')
      .replace(/\blang\s*gra?ph\b|\blanggraph?\b|\blanggrph\b/g, 'langgraph')
      .replace(/\blang\s*chain\b|\blangchin\b/g, 'langchain')
      .replace(/\bfas\s*tapi\b|\bfasapi\b|\bfast\s*api\b/g, 'fastapi')
      .replace(/\bangul[ae]r\b/g, 'angular')
      .replace(/\bkafk[ae]\b/g, 'kafka')
      .replace(/\brai[ds]\b|\breddis\b/g, 'redis')
      .replace(/\bdoker\b|\bdokcer\b/g, 'docker')
      .replace(/\bkubernets\b|\bk8\b(?!s)/g, 'kubernetes')
      .replace(/\bpython\s*3?\b|\bpyhton\b|\bpytohn\b/g, 'python')
      .replace(/\bhwo\b|\bhw\b/g, 'how')
      .replace(/\bwaht\b|\bwath\b/g, 'what')
      .replace(/\bproejct\b|\bproect\b|\bporject\b/g, 'project')
      .replace(/\bimplment\b|\bimplmnt\b|\bimpelemnt\b/g, 'implement')
      .replace(/\bexplian\b|\bexplain\s*me\b/g, 'explain')
      .replace(/\barchitechture\b|\barchitecture\b/g, 'architecture')
      .replace(/\brepsoitory\b|\brepoisitory\b|\brepo\s*sitory\b/g, 'repository');
  }

  // ── Topic classifier for rate-limit deduplication ──────────────────────
  getTopic(q: string): string {
    const t = q.toLowerCase();
    if (/\b(aura|astro|spiritual)\b/.test(t))              return 'aura';
    if (/\b(bench|hr.?ai|upload.?cv)\b/.test(t))           return 'bench';
    if (/\b(agentic|growth.?os|campaign)\b/.test(t))       return 'agentic';
    if (/\b(runbook|incident|ragless)\b/.test(t))          return 'runbook';
    if (/\b(project|built|shipped|portfolio|production\s*ai|ai\s*system)\b/.test(t)) return 'projects';
    if (/\b(skill|tech|stack|language|framework)\b/.test(t)) return 'skills';
    if (/\b(experience|career|company|worked)\b/.test(t))  return 'career';
    if (/\b(hire|available|recruit|contact|email|phone)\b/.test(t)) return 'hire';
    if (/\b(story|origin|mechanical|console)\b/.test(t))   return 'story';
    if (/\b(education|college|degree|masai)\b/.test(t))    return 'education';
    if (/\b(demo|live|screenshot)\b/.test(t))              return 'demo';
    if (/\b(github|repo|code|folder)\b/.test(t))           return 'github';
    if (/\b(rag|langgraph|faiss|multi.?agent)\b/.test(t))  return 'architecture';
    if (/\b(test|guardrail|637)\b/.test(t))                return 'testing';
    return q.slice(0, 30).toLowerCase().replace(/\s+/g, '_');
  }

  // ── Main intent matcher — returns safe HTML string ─────────────────────
  match(q: string): string {
    const t = this.normalize(q);

    // G1–G5 guardrail checks
    if (GUARDS.injection.test(q))
      return `Namaste! 🙏 I'm Aarav, Chandan's professional assistant. I can only answer questions about Chandan Kumar's professional profile. How can I help you?`;
    if (GUARDS.harmful.test(q))
      return `I appreciate you reaching out! I'm here to share Chandan's professional story. Could I tell you about his work in AI engineering instead? 😊`;
    if (GUARDS.offTopic.test(q))
      return `Great question, but that's outside my area! I'm best at talking about Chandan — his skills, projects, and experience. What would you like to know? 🤔`;
    if (GUARDS.pii.test(q))
      return `I'm not able to process personal identification details. I can share Chandan's professional contact info though — would that help?`;
    if (GUARDS.nonsense.test(q.trim()))
      return `Hmm, I didn't quite catch that! Try asking something like "What projects has Chandan built?" or "Is he available to hire?" 😄`;

    // Delegate to focused intent handlers
    return this._matchDemo(t)
        ?? this._matchCodeDeepDive(t)
        ?? this._matchIdentity(t)
        ?? this._matchGreeting(t)
        ?? this._matchAppreciation(t)
        ?? this._matchSocial(t)
        ?? this._matchContact(t)
        ?? this._matchHiring(t)
        ?? this._matchResume(t)
        ?? this._matchUnknown(t)
        ?? this._matchTech(t)
        ?? this._matchSkills(t)
        ?? this._matchProjects(t)
        ?? this._matchTesting(t)
        ?? this._matchEducation(t)
        ?? this._matchStory(t)
        ?? this._matchCurrentRole(t)
        ?? this._matchExperience(t)
        ?? this._matchBroadIdentity(t)
        ?? this._matchOffTopic(t)
        ?? this._fallback();
  }

  // ── Follow-up suggestions ───────────────────────────────────────────────
  followups(q: string): string[] {
    const t = q.toLowerCase();
    if (/\b(demo|live\s*demo|screenshot|preview)\b/i.test(t))
      return ['🔮 How does Aura with Rav work?', '🏢 Explain Bench Optimizer code', '📖 How does RunbookAI work?', '🚀 What projects has he built?'];
    if (/\b(who is|about chandan|introduce|chandan kumar|what does he do)\b/i.test(t))
      return ['🚀 What projects has he built?', '💼 What companies has he worked at?', '🧠 What is his tech stack?', '📞 How can I hire him?'];
    if (/\b(skill|tech stack|stack|language|framework|expertise)\b/i.test(t))
      return ['🔮 Show me a project using these skills', '🧠 How does LangGraph work in his code?', '🔍 What is his RAG implementation?', '📊 How many tests does he have?'];
    if (/\b(project|portfolio|built|shipped|systems)\b/i.test(t))
      return ['🔮 How does Aura with Rav work?', '🏢 Explain the Bench Resource Optimizer', '📖 How does RunbookAI work?', '🚀 How does Agentic Growth OS work?'];
    if (/\b(aura|astro.?intel|spiritual|vedic|18\s*agent)\b/i.test(t))
      return ['🔑 What API endpoints does Aura have?', '🧠 How does LangGraph work in this?', '🛡️ What are the G1-G5 guardrails?', '▶️ Can I see a demo?'];
    if (/\b(bench|hr\s*ai|upload.?cv|map.?role|skill\s*gap)\b/i.test(t))
      return ['🔍 How does the hybrid RAG work?', '💾 How does episodic memory work?', '📡 How does SSE streaming work?', '🛡️ How is the circuit breaker implemented?'];
    if (/\b(agentic|growth\s*os|campaign|marketing|learning\s*engine)\b/i.test(t))
      return ['🔑 How does the learning engine improve ROI?', '🗂️ What is the folder structure?', '🧠 How is LangGraph used here?', '▶️ Can I see the demo?'];
    if (/\b(runbook|runbook\s*ai|ragless|networkx|incident|conflict\s*detect|k8s)\b/i.test(t))
      return ['🔑 What APIs does RunbookAI expose?', '🗂️ Show me the folder structure', '🧠 How does the dependency graph work?', '▶️ Can I see the demo?'];
    if (/\b(langgraph|rag|retrieval|faiss|multi.?agent|stategraph)\b/i.test(t))
      return ['🔮 Show me Aura\'s LangGraph pipeline', '🏢 How is RAG used in Bench Optimizer?', '🛡️ How do guardrails work?', '📊 How many tests validate this?'];
    if (/\b(experience|career|company|infosys|nexsys|texala|flyboard|worked)\b/i.test(t))
      return ['💼 What is his current role?', '🎓 Where did he study?', '✨ What is his origin story?', '🚀 What AI projects did he build?'];
    if (/\b(contact|email|hire|available|recruit|linkedin|github|youtube|resume)\b/i.test(t))
      return ['🚀 What projects has he built?', '💼 What is his current role?', '🧠 What is his tech stack?', '✨ What is his story?'];
    if (/\b(test|guardrail|637|quality|ci)\b/i.test(t))
      return ['🛡️ How do G1-G5 guardrails work?', '📊 How is RAG quality measured?', '🏢 Show me Bench Optimizer tests', '🔮 Show me Aura test suite'];
    return ['🚀 What projects has he built?', '🧠 What is his tech stack?', '💼 Is he available to hire?', '✨ What is his story?'];
  }

  // ── Private intent handlers ─────────────────────────────────────────────

  private _matchDemo(t: string): string | null {
    if (!/\b(demo|live\s*demo|see\s*(it|the|a)\s*(demo|app|live|project)|watch|preview|screenshot|show\s*(me\s*)?(the\s*)?(app|demo|live|project|screen))\b/i.test(t)) return null;
    return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">▶️ Live Demos — 4 Projects</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🔮</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-01" style="color:var(--cb-link);font-weight:700;text-decoration:none">Aura with Rav ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 01 → click the <strong style="color:var(--cb-text);font-weight:800">Live Demo</strong> button</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🏢</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-02" style="color:var(--cb-link);font-weight:700;text-decoration:none">Bench Resource Optimizer ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 02 → click the <strong style="color:var(--cb-text);font-weight:800">Live Demo</strong> button</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📈</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-03" style="color:var(--cb-link);font-weight:700;text-decoration:none">Agentic Growth OS ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 03 → click the <strong style="color:var(--cb-text);font-weight:800">Live Demo</strong> button</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📖</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-04" style="color:var(--cb-link);font-weight:700;text-decoration:none">RunbookAI ↗</a> &nbsp;<a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:var(--green);font-size:0.7rem;font-weight:600;text-decoration:none">[Open Live App ↗]</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 04 on portfolio · or open the live deployed app</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic;margin-top:0.3rem">Projects 01–03: each shows step-by-step screenshots with Aarav guiding you. 🎬</div>`;
  }

  private _matchCodeDeepDive(t: string): string | null {
    const isCode = /\b(code|how\s*(does|do|it|the)|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail|show\s*me)\b/i.test(t);
    if (!isCode) return null;
    if (/\b(aura|aura\s*with\s*rav|astro.?intel|spiritual|vedic|numerolog|palmist|tarot|vastu|astrology)\b/i.test(t))
      return `<strong>Aura with Rav</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>astro-intel-backend/</strong><br>• <code>main.py</code> — FastAPI, JWT + Kafka consumer on startup<br>• <code>POST /api/v1/analysis/run</code> — 18-agent LangGraph pipeline<br>• <code>GET /api/v1/stream/{session_id}</code> — SSE live updates<br>• LangGraph: normalize → 5 parallel domain agents → meta_consensus → remedy → admin_review<br><br>📁 <strong>astro-intel/</strong> (Angular 17)<br>• <code>services/orchestrator.service.ts</code> — SSE + reactive signals<br><br>🔑 StateGraph, immutable state, <code>interrupt_before=["approve"]</code>.`;
    if (/\b(bench|bench\s*resource|bench\s*optim|hr\s*ai|upload.?cv|map.?role|generate.?plan)\b/i.test(t))
      return `<strong>Bench Resource Optimizer</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>bench-resource-optimizer/backend/</strong><br>• <code>POST /upload-cv</code> · <code>POST /map-role</code> · <code>POST /generate-plan/stream</code><br>• <code>GET /memory/{user_id}</code> · <code>GET /metrics</code> · <code>GET /guardrails/stats</code><br><br>🔑 FAISS + BM25 + RRF + HyDE + CRAG + cross-encoder. Semantic cache L1/L2. 222 tests.<br><hr class="cb-divider"/><a href="#project-02" style="color:var(--amber);font-weight:700">↗ Jump to Bench on portfolio</a>`;
    if (/\b(agentic|agentic\s*growth|growth\s*os|campaign\s*(agent|node|state)|audience\s*node|ad\s*copy|budget\s*node)\b/i.test(t))
      return `<strong>Agentic Growth OS</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>agentic-growth-os/backend/</strong><br>• <code>graph/state.py</code> — <code>CampaignState</code> TypedDict<br>• <code>graph/nodes/</code> — audience → ad_copy → budget → campaign → performance<br>• <code>memory/campaign_memory.py</code> — keyword similarity match past campaigns<br><br>🔑 Each run stores decisions. Re-run retrieves closest campaign → applies improvements → logs ROI delta.<br><hr class="cb-divider"/><a href="#project-03" style="color:var(--cyan);font-weight:700">↗ Jump to Agentic on portfolio</a>`;
    if (/\b(runbook|runbookai|ragless|networkx|dependency\s*graph|conflict\s*detect|kubectl|incident\s*response)\b/i.test(t))
      return `<strong>RunbookAI</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>runbook-ai/</strong><br>• <code>agents/</code> · <code>connectors/</code> · <code>database/</code> · <code>graph/</code> · <code>routers/</code><br>• NetworkX DiGraph — topological sort → safe execution order<br>• <code>POST /api/query</code> · <code>POST /api/ingest</code> · <code>GET /api/runbooks</code><br><br>🔑 RAGless — LLM runs ONCE at ingest. Query = pure SQL + graph.<br><hr class="cb-divider"/><a href="#project-04" style="color:var(--green);font-weight:700">↗ Jump to RunbookAI</a>`;
    if (/\b(langgraph|stategraph|agent\s*(pipeline|flow|orchestrat)|campaign\s*state)\b/i.test(t))
      return this._langgraphSnippet();
    return null;
  }

  private _langgraphSnippet(): string {
    return `LangGraph pattern from the actual repo code:<br><br><pre><code>graph = StateGraph(CampaignState)\ngraph.add_node("audience",    audience_node)\ngraph.add_node("ad_copy",     ad_copy_node)\ngraph.add_node("budget",      budget_node)\ngraph.add_node("campaign",    campaign_node)\ngraph.add_node("performance", performance_node)\ngraph.add_edge(START, "audience")\napp = graph.compile()</code></pre><br>🔑 <code>CampaignState</code> TypedDict — immutable state merges per node<br>🔑 Conditional edges — <code>route_fn</code> reads state to pick next node<br>🔑 Parallel branches — <code>Send()</code> for simultaneous agents<br>🔑 Human-in-the-loop — <code>interrupt_before=["approve"]</code>`;
  }

  private _matchIdentity(t: string): string | null {
    if (!/\b(aarav|who are you|what are you|you a bot|are you (a |an )?(bot|ai|chatbot|assistant))\b/i.test(t)) return null;
    return `Namaste! 🙏 I'm <strong>Aarav</strong> — Chandan's AI assistant, built into this portfolio.<br>I know everything about his projects, skills, experience, and story. Ask me anything! 😄`;
  }

  private _matchGreeting(t: string): string | null {
    if (!/^(hello|hi|hey|hi there|namaste|good\s*(morning|afternoon|evening)|how are you|sup|hola|greetings|howdy)[!?,.\s]*$/i.test(t)
        && !/^(hi|hey|hello)\b/i.test(t)) return null;
    return `Namaste! 👋 I'm <strong>Aarav</strong>, Chandan's AI guide!<br><br>You can ask me about:<br>• His <strong>skills & tech stack</strong><br>• His <strong>4 production AI projects</strong><br>• His <strong>career & experience</strong><br>• Whether he's <strong>available to hire</strong><br>• His <strong>social profiles</strong> & contact<br><br>What would you like to know? 😊`;
  }

  private _matchAppreciation(t: string): string | null {
    if (!/\b(thank(s| you)?|great (work|answer|job)|awesome|well done|impressive|perfect|excellent|brilliant)\b/i.test(t)) return null;
    return `Thank you so much! 😊 It means a lot. If you're thinking of hiring Chandan or want to know more — I'm right here!<br><br><a href="mailto:ravchandan15@gmail.com" style="color:var(--purple-lt)">Drop him a message ↗</a>`;
  }

  private _matchSocial(t: string): string | null {
    if (/\b(github|git\s*hub|open[\s-]source|code repo|repository|repositories)\b/i.test(t))
      return `🐙 <strong>GitHub: <a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--purple-lt)">github.com/RavSinghChandan ↗</a></strong><br><br>All 4 production AI projects — Aura with Rav, Bench Resource Optimizer, Agentic Growth OS, and RunbookAI. All open source.`;
    if (/\b(linkedin|linked in|professional\s*profile|connect on)\b/i.test(t))
      return `💼 <strong>LinkedIn: <a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)">Rav Chandan Kumar Singh ↗</a></strong><br><br>4+ years of AI engineering, Infosys/Bank of America, production AI systems.`;
    if (/\b(youtube|you\s*tube|videos?|channel|content|watch)\b/i.test(t))
      return `▶️ <strong>YouTube: <a href="https://www.youtube.com/@aiwithrav" target="_blank" style="color:var(--purple-lt)">@aiwithrav ↗</a></strong><br><br>AI engineering content, project walkthroughs, and learning journeys.`;
    if (/\b(social\s*media|social\s*profiles?|online\s*presence|find him online|profiles?)\b/i.test(t))
      return `Chandan's online presence:<br><br>🐙 <a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--purple-lt)"><strong>GitHub — RavSinghChandan ↗</strong></a><br>💼 <a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)"><strong>LinkedIn ↗</strong></a><br>▶️ <a href="https://www.youtube.com/@aiwithrav" target="_blank" style="color:var(--purple-lt)"><strong>YouTube — @aiwithrav ↗</strong></a><br>📧 ravchandan15@gmail.com<br>📞 +91 62909 09518`;
    return null;
  }

  private _matchContact(t: string): string | null {
    if (!/\b(contact|email|phone|mobile|reach|connect|get in touch|message him|call him|write to)\b/i.test(t)) return null;
    return `<div style="margin:0 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">📬 Reach Chandan</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>📧</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="mailto:ravchandan15@gmail.com" style="color:var(--cb-link);font-weight:700;text-decoration:none">ravchandan15@gmail.com</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>📞</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="tel:+916290909518" style="color:var(--cb-link);font-weight:700;text-decoration:none">+91 62909 09518</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>💼</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--cb-link);font-weight:700;text-decoration:none">LinkedIn — Rav Chandan Kumar Singh ↗</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🐙</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--cb-link);font-weight:700;text-decoration:none">GitHub — RavSinghChandan ↗</a></span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic">Responds fast — usually within hours! ⚡</div><a href="#contact" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid var(--cyan);margin:0.2rem 0 0;text-decoration:none">↗ Go to Contact Section</a>`;
  }

  private _matchHiring(t: string): string | null {
    if (/\b(salary|ctc|compensation|pay|package|remuneration|lpa)\b/i.test(t))
      return `I don't have details on Chandan's salary expectations — that's best discussed directly with him. 🙏<br><br>📧 <a href="mailto:ravchandan15@gmail.com" style="color:var(--purple-lt)">ravchandan15@gmail.com</a><br>📞 +91 62909 09518`;
    if (/\b(hire|available|open to work|recruit|interview|position|opportunit|notice period|join|remote|relocat|freelanc)\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">✅ Open to Senior AI Engineer Roles</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🌍</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Availability</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">Remote and on-site · responds within hours</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>📧</span><span><a href="mailto:ravchandan15@gmail.com" style="color:var(--green)">ravchandan15@gmail.com</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>💼</span><span><a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--green)">LinkedIn ↗</a></span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><a href="AI_Engineer_Chandan_Kumar_4_Yrs.pdf" target="_blank" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid var(--purple);margin:0.2rem 0.2rem 0 0;text-decoration:none">📄 Download Resume</a><a href="#contact" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid var(--cyan);margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ Contact Section</a>`;
    return null;
  }

  private _matchResume(t: string): string | null {
    if (!/\b(resume|cv|download|pdf|curriculum)\b/i.test(t)) return null;
    return `📄 <a href="AI_Engineer_Chandan_Kumar_4_Yrs.pdf" target="_blank" style="color:var(--purple-lt)"><strong>Download Chandan's Resume →</strong></a><br><br>4 years of AI engineering. 637 tests. Zero shortcuts. All in one PDF.`;
  }

  private _matchUnknown(t: string): string | null {
    if (!/\b(age|born|\bhow old\b|birth(day|date)?|married|family|hobbies|religion|caste|height|weight|masters?\s*degree|mba|phd|react\b|vue\b|flutter\b|swift\b|ios\b|android\b|google\b|amazon\b|microsoft\b|meta\b|facebook\b|apple\b|uber\b|flipkart\b|ola\b)\b/i.test(t)) return null;
    return `I don't have that information about Chandan — I only share what's verified. 🙏<br><br>📧 <a href="mailto:ravchandan15@gmail.com" style="color:var(--purple-lt)">ravchandan15@gmail.com</a><br>💼 <a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)">LinkedIn ↗</a>`;
  }

  private _matchTech(t: string): string | null {
    if (!/\b(java\b|python\b|javascript\b|typescript\b|\bsql\b|langchain\b|langgraph\b|faiss\b|kafka\b|redis\b|angular\b|spring\s*boot|docker\b|kubernetes\b|\baws\b|fastapi\b|flask\b|openai\b|numpy\b|pandas\b|\bnlp\b|prompt\s*engineer|frontend|backend|database|databases)\b/i.test(t)) return null;
    return this._skillsHtml();
  }

  private _matchSkills(t: string): string | null {
    if (!/\b(skills?|tech\s*stack|stack|languages?|frameworks?|tools?|technologies?|expertise|proficien|speciali[sz]|ai\s*tools?|ai\s*frameworks?)\b/i.test(t)) return null;
    return this._skillsHtml();
  }

  private _skillsHtml(): string {
    return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🤖 AI &amp; LLM Engineering</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem">Python</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem">FastAPI</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem">LangGraph</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem">LangChain</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem">OpenAI API</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🔍 Retrieval &amp; RAG</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem">FAISS</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem">BM25</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem">HyDE</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem">CRAG</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem">Cross-Encoder</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">☕ Backend &amp; Frontend</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem">Java</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem">Spring Boot</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem">Kafka</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem">Redis</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem">Angular 17</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem">Docker</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem">AWS</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic">All battle-tested in production. 637 tests. Zero shortcuts. 💪</div><a href="#skills" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid var(--purple);margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ See Skills Section</a>`;
  }

  private _matchProjects(t: string): string | null {
    if (!/\b(projects?|portfolio|built?\b|shipped?\b|developed|created\b|aura\b|bench\b|agentic\b|growth\s*os|runbookai|production\s*ai)\b/i.test(t)) return null;
    return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🚀 4 Production AI Systems</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🔮</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-01" style="color:var(--cb-link);font-weight:700;text-decoration:none">Aura with Rav ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">18+ agents · 23 Indian languages · 415 tests · G1-G5 guardrails</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🏢</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-02" style="color:var(--cb-link);font-weight:700;text-decoration:none">Bench Resource Optimizer ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">Hybrid RAG · circuit breaker · episodic memory · 222 tests</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>📈</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-03" style="color:var(--cb-link);font-weight:700;text-decoration:none">Agentic Growth OS ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">5 LangGraph agents · auto-learning · ROI lift 40–80%</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>📖</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-04" style="color:var(--cb-link);font-weight:700;text-decoration:none">RunbookAI ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">RAGless · 22 runbooks · conflict detection · zero vectors</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic">Click any project name above to jump to it! 🤩</div>`;
  }

  private _matchTesting(t: string): string | null {
    if (!/\b(tests?\b|testing\b|guardrails?\b|quality\b|\bci\b|coverage\b|reliable\b|637\b|tdd\b)\b/i.test(t)) return null;
    return `<h3 class="h-green">📊 Test Coverage</h3><ul><li><span class="li-icon">✅</span><span class="li-main"><strong>637 tests</strong> across all 4 AI systems</span><span class="li-sub">3.6s full suite · zero external dependencies in CI</span></li><li><span class="li-icon">🤖</span><span class="li-main">Mock LLM strategy</span><span class="li-sub">Tests pass without API keys — no flakiness</span></li></ul><h3 class="h-red">🛡️ Production Guardrails</h3><ul><li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G1</span> Rate Limiting</span><span class="li-sub">Per IP/user — blocks abuse before LLM is touched</span></li><li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G2</span> Injection Detection</span><span class="li-sub">Scans every input — jailbreak patterns blocked</span></li><li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G3</span> PII Filter</span><span class="li-sub">No personal data ever reaches the LLM</span></li><li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G4</span> Faithfulness Gate</span><span class="li-sub">Output must be grounded in retrieved context</span></li><li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G5</span> Output Validation</span><span class="li-sub">Final check before response is returned</span></li></ul><hr/><span class="fn"><em>Philosophy: test everything, shortcut nothing. 💪</em></span>`;
  }

  private _matchEducation(t: string): string | null {
    if (!/\b(graduat|when\s*did\b|2018|2014|b\.?tech\b|bachelor\b|cgpa\b|gpa\b|future\s*institute|kolkata\b|masai\b|bootcamp\b|degree\b|qualif|education\b|college\b|university\b|study\b|studied\b|school\b)\b/i.test(t)) return null;
    return `<h3 class="h-amber">🎓 Education</h3><ul><li><span class="li-icon">🏛️</span><span class="li-main">B.Tech — Computer Science &amp; Engineering</span><span class="li-sub"><em>Future Institute of Engineering &amp; Management, Kolkata</em><br>2014–2018 · <strong>CGPA: 8.7</strong></span></li><li><span class="li-icon">🚀</span><span class="li-main">Masai School</span><span class="li-sub"><em>Full-Stack &amp; AI Bootcamp</em> — where the AI journey truly began</span></li></ul><hr/><span class="fn">Mechanical engineer → CS bootcamp → 4 companies → Senior AI Engineer. <em>Self-made. ✨</em></span>`;
  }

  private _matchStory(t: string): string | null {
    if (!/\b(?:story|journey|motivat|inspir|how (?:did|he)|why (?:did|he)|started?|began?|origin|background|mechanical|console|fuel|become|became|what drove)/i.test(t)) return null;
    return `A friend once said: <em>"You can't even spell console."</em><br><br>That taunt became the fuel. Chandan — a mechanical engineering graduate with no job offers — joined Masai School, outworked everyone quietly, and never stopped.<br><br>Today: <strong>637 tests · 4 AI systems · 0 shortcuts taken.</strong><br><br><a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)">Connect on LinkedIn ↗</a> · <a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a><hr class="cb-divider"/><a href="#story" style="color:#c4b5fd;font-weight:700">↗ Read the full story on portfolio</a> ✨`;
  }

  private _matchCurrentRole(t: string): string | null {
    if (!/\b(current(ly)?\b|present\b|today\b|now\s*(work|at)\b|where\s*(does|is)\s*he\s*work|senior\s*(engineer|developer|swe)\b)\b/i.test(t)) return null;
    return `Currently, Chandan is a <strong>Senior Software Engineer at Infosys</strong>, working on the Bank of America project (Nov 2025–Present, Pune).<br><br>He's designing LLM-integrated backend systems, Kafka-based AI pipelines, and event-driven microservices — improving banking workflow efficiency by 40%. 🚀`;
  }

  private _matchExperience(t: string): string | null {
    if (!/\b(experience\b|career\b|companies\b|jobs?\b|work(ed)?\s*(at|on|for)\b|timeline\b|accelya\b|nexsys\b|texala\b|flyboard\b|infosys\b|bank(ing)?\b|aviation\b|years?\s*of\b|role\s*at\b)\b/i.test(t)) return null;
    return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">💼 Career Timeline — 4+ Years</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🟣</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Infosys / Bank of America &nbsp;<span style="font-size:0.62rem;padding:0.05rem 0.4rem;border-radius:999px;background:var(--cb-chip-bg);color:var(--cb-chip-color)">Current</span></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">Senior SWE · Nov 2025–Present · Pune<br>LLM banking automation · Kafka · <strong style="color:var(--cb-text)">40% efficiency gain</strong></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🔵</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Nexsys / Accelya</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">SWE · Dec 2023–Nov 2025 · Mumbai<br>Aviation · 500K+ daily transactions</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🟢</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Texala</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">SWE · Jul–Nov 2023 · Pune · Java/Spring Boot</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🟡</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Flyboard Ventures</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic">SWE · Aug 2022–Jul 2023 · Chandigarh<br>Mobile · healthcare · e-learning with AI/ML</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><a href="#experience" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid var(--amber);margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ See Full Timeline</a>`;
  }

  private _matchBroadIdentity(t: string): string | null {
    if (!/\b(who is\s*(chandan|rav|he)\b|introduce\s*(chandan|him)\b|about\s*(chandan|rav)\b|chandan\s*kumar\b|what\s*does\s*(chandan|he)\s*(do|work)\b|is\s*(he|chandan)\s*an?\s*(ai|senior|software|engineer|developer)\b)\b/i.test(t)) return null;
    return `<h3 class="h-purple">👤 Chandan Kumar <em style="font-weight:400;color:#94a3b8;font-size:0.75rem">alias Rav</em></h3><ul><li><span class="li-icon">💼</span><span class="li-main">Role</span><span class="li-sub">Senior AI Engineer · 4+ years</span></li><li><span class="li-icon">🏢</span><span class="li-main">Currently</span><span class="li-sub">Infosys — Bank of America project · Pune</span></li><li><span class="li-icon">🧠</span><span class="li-main">Speciality</span><span class="li-sub">Multi-agent orchestration · RAG pipelines · Production AI</span></li><li><span class="li-icon">📊</span><span class="li-main">Track record</span><span class="li-sub"><strong>637 tests · 4 AI systems · zero shortcuts</strong></span></li></ul><hr/><a href="#projects" class="ca ca-p">↗ See His Projects</a><a href="#experience" class="ca ca-a">↗ Career Timeline</a>`;
  }

  private _matchOffTopic(t: string): string | null {
    if (!/\b(cricket|sport|movie|song|music|travel|food|weather|capital|country|president|actor|celebrity|meaning\s*of\s*life|universe|space|planet|god|philosophy)\b/i.test(t)) return null;
    return `Ha! I'm not sure about that — it's outside my area. 😄 I only know about Chandan Kumar — his work, projects, and how to reach him.`;
  }

  private _fallback(): string {
    return `Hmm, I'm not sure about that one! 🤔<br><br>I'm best at questions about Chandan's <strong>skills, projects, experience, and contact</strong>. Try:<br>• "What projects has he built?"<br>• "Is he available to hire?"<br>• "What is his tech stack?"<br>• "How to contact him?"`;
  }
}
