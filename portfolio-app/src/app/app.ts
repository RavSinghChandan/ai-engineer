import { Component, OnInit, signal, HostListener, ElementRef, QueryList, ViewChildren, AfterViewInit, PLATFORM_ID, Inject, ViewChild, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService } from './chat.service';

/** A node in the interactive knowledge graph. */
interface GraphNode {
  id: string;
  label: string;
  kind: 'system' | 'tech' | 'oss' | 'work';
  detail: string;
  url?: string;
}

/** Runtime physics state for a graph node. */
interface GraphBody extends GraphNode {
  x: number; y: number;   // position
  vx: number; vy: number; // velocity
  r: number;              // radius
  pinned: boolean;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, AfterViewInit {

  theme = signal<'dark' | 'light'>('dark');
  typedText = signal('');
  scrolled = signal(false);
  mobileNavOpen = signal(false);
  scrollProgress = signal(0);       // 0–100, drives the top progress bar
  activeSection = signal('');       // current section id for nav highlight
  showBackToTop = signal(false);    // show back-to-top button after 40% scroll

  toggleMobileNav() { this.mobileNavOpen.update(v => !v); }
  closeMobileNav() { this.mobileNavOpen.set(false); }

  // ── Project tag filtering — Optimisation ─────────────────────────────────
  // Lets visitors filter projects by tech stack tag with a single click.
  // Builds the unique tag list lazily on first access so no maintenance overhead.
  activeTagFilter = signal<string | null>(null);

  get filterTags(): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const project of this.projects) {
      for (const t of project.tags) {
        const norm = t.label.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          tags.push(t.label);
        }
      }
    }
    return tags;
  }

  get filteredProjects() {
    const tag = this.activeTagFilter();
    if (!tag) return this.projects;
    const norm = tag.toLowerCase();
    return this.projects.filter(p =>
      p.tags.some(t => t.label.toLowerCase() === norm)
    );
  }

  setTagFilter(tag: string | null) {
    this.activeTagFilter.set(tag === this.activeTagFilter() ? null : tag);
  }

  clearTagFilter() {
    this.activeTagFilter.set(null);
  }

  // PDF resume — user to replace with actual hosted PDF URL
  readonly RESUME_PDF = 'AI_Engineer_Chandan_Kumar_4_Yrs.pdf';


  @ViewChildren('fadeEl') fadeEls!: QueryList<ElementRef>;

  private typingLines = [
    'Multi-Agent Orchestration with LangGraph',
    'Hybrid RAG: FAISS + BM25 + HyDE + CRAG',
    'Production Guardrails G1–G5 implemented',
    'SSE Streaming · Kafka · Redis · JWT Auth',
    '637 tests passing · 3.6s runtime · Zero shortcuts',
  ];
  private li = 0; private ci = 0; private deleting = false;

  projects = [
    {
      num: '01', accent: 'purple',
      liveUrl: 'demo',
      title: 'Aura with Rav',
      subtitle: 'AI Spiritual Intelligence Platform',
      desc: '18+ AI agents coordinate dynamically to generate personalized intelligence reports across Vedic Astrology, Numerology, Palmistry, Tarot & Vastu Shastra — in 23 Indian languages.',
      github: 'https://github.com/RavSinghChandan',
      tags: [
        { label: 'Python', cls: 'tag-purple' }, { label: 'FastAPI', cls: 'tag-purple' },
        { label: 'LangGraph', cls: 'tag-purple' }, { label: 'DeepSeek LLM', cls: 'tag-purple' },
        { label: 'Multi-Agent', cls: 'tag-purple' }, { label: 'Angular 17', cls: 'tag-cyan' },
        { label: 'JWT Auth', cls: 'tag-green' }, { label: '415 Tests', cls: 'tag-amber' }, { label: 'G1–G5 Guardrails', cls: 'tag-red' },
      ],
      challenges: [
        { p: '18+ agents coordinating without conflicts', s: 'LangGraph stateful orchestration — each agent is a node, edges are conditional' },
        { p: 'Multi-tenant SaaS — 3 roles (USER / ADMIN / SUPERADMIN)', s: 'JWT Bearer + X-API-Key dual auth, role-based route guards, 76 auth tests' },
        { p: 'Retrieval quality on spiritual domain queries', s: 'Hybrid RAG + Multi-Query expansion — ambiguous queries matched at higher confidence' },
        { p: 'LLM hallucination on sensitive predictions', s: 'G1–G5 guardrails: rate limit, injection detection, PII filter, faithfulness gate' },
        { p: 'Reports in 23 Indian languages', s: 'Language-aware prompt templating + dynamic PDF rendering per locale' },
        { p: 'Reliability without LLM in the test loop', s: '415 tests, 3.6s runtime — full stack with mock LLM, zero flakiness' },
      ],
      imgSrc: 'project-aura.png',
    },
    {
      num: '02', accent: 'amber',
      liveUrl: 'demo',
      title: 'Bench Resource Optimizer',
      subtitle: 'Enterprise AI HR Platform',
      desc: 'Maps bench employees to open roles using Hybrid RAG, surfaces skill gaps, and generates 7-day preparation roadmaps — production hardened with 222 tests and zero shortcuts.',
      github: 'https://github.com/RavSinghChandan',
      tags: [
        { label: 'Python', cls: 'tag-amber' }, { label: 'FastAPI', cls: 'tag-amber' },
        { label: 'FAISS + BM25', cls: 'tag-amber' }, { label: 'HyDE + CRAG', cls: 'tag-amber' },
        { label: 'Kafka', cls: 'tag-cyan' }, { label: 'Redis', cls: 'tag-cyan' },
        { label: 'Angular 17', cls: 'tag-cyan' }, { label: 'SQLite WAL', cls: 'tag-green' },
        { label: 'SSE Streaming', cls: 'tag-green' }, { label: '222 Tests', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'Accurate skill-to-role matching at scale', s: 'FAISS + BM25 + RRF + HyDE + CRAG + cross-encoder reranker — full hybrid stack' },
        { p: 'Repeated LLM calls hammering cost & latency', s: 'Semantic cache L1 (exact <1ms) + L2 (cosine ≥ 0.92) backed by Redis' },
        { p: 'CV text as untrusted input — injection risk', s: 'G2 injection detection scans every CV before any LLM call reaches the model' },
        { p: 'Agent failures cascading to user timeouts', s: 'Circuit breaker: 5 failures → opens → graceful fallback in milliseconds' },
        { p: 'Agent memory lost on every server restart', s: 'Write-through episodic memory to SQLite WAL — survives restarts' },
        { p: 'Slow plan generation blocking the UI', s: 'SSE streaming — Angular EventSource renders tokens live, TTFT under 1.5s' },
        { p: 'Role knowledge stuck as hardcoded JSON', s: 'Admin CRUD API + async FAISS/BM25 rebuild — live updates, zero downtime' },
        { p: 'Verifying the entire enterprise stack', s: '222 tests, 3.6s runtime — zero external dependencies in CI' },
      ],
      imgSrc: 'project-bench.png',
    },
    {
      num: '03', accent: 'cyan',
      liveUrl: 'demo',
      title: 'Agentic Growth OS',
      subtitle: 'Autonomous AI Marketing Platform',
      desc: 'Visual drag-and-drop AI agent platform for autonomous marketing workflow execution. Learns from every campaign run and improves ROI 40–80% via a built-in learning engine.',
      github: 'https://github.com/RavSinghChandan',
      tags: [
        { label: 'Python', cls: 'tag-cyan' }, { label: 'FastAPI', cls: 'tag-cyan' },
        { label: 'LangGraph', cls: 'tag-cyan' }, { label: 'Multi-Agent', cls: 'tag-cyan' },
        { label: 'Learning Engine', cls: 'tag-green' }, { label: 'Angular 17', cls: 'tag-purple' },
        { label: 'SVG Canvas', cls: 'tag-purple' }, { label: 'Feedback Loops', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'Marketing agents must collaborate without shared state conflicts', s: 'LangGraph StateGraph — 5 agents as nodes, conditional edges, immutable state mutations' },
        { p: 'System must improve on every run, not stay static', s: 'Learning engine: similarity match past campaigns, apply rule-based improvements, log ROI delta' },
        { p: 'Non-technical users need to design agent pipelines visually', s: 'SVG drag-and-drop canvas with animated edges showing live agent data flow' },
        { p: 'Campaign memory must persist and be queryable across runs', s: 'JSON campaign store with similarity matching — retrieves closest past run on new execution' },
      ],
      imgSrc: 'project-agentic.png',
    },
    {
      num: '04', accent: 'amber',
      liveUrl: 'demo',
      title: 'AI Content Factory',
      subtitle: 'Multi-Agent YouTube Video Production — Near-Zero Cost',
      desc: 'Topic or script in, finished YouTube video out. 11 LangGraph agents research, write, review, voice and assemble complete videos — content-adaptive diagram slides, AI-designed thumbnails, captions, SEO metadata and Shorts ideas — narrated by a free on-device neural voice. Cost per video: DeepSeek tokens only (~₹1).',
      github: 'https://github.com/RavSinghChandan/ai-engineer',
      tags: [
        { label: 'Python', cls: 'tag-amber' }, { label: 'FastAPI', cls: 'tag-amber' },
        { label: 'LangGraph', cls: 'tag-amber' }, { label: 'DeepSeek LLM', cls: 'tag-amber' },
        { label: 'Kokoro TTS (free)', cls: 'tag-green' }, { label: 'FFmpeg', cls: 'tag-green' },
        { label: 'Angular 20', cls: 'tag-cyan' }, { label: 'WebSocket Live', cls: 'tag-cyan' },
        { label: 'Creator Profiles', cls: 'tag-purple' }, { label: 'Zero-Cost Stack', cls: 'tag-red' },
      ],
      challenges: [
        { p: '11 production stages must run as one reliable pipeline', s: 'LangGraph StateGraph — conditional entry (own-script bypasses research/review), review loop with revision budget, per-agent runs persisted with live WebSocket events' },
        { p: 'Voice APIs bill per character — costs spiral with daily videos', s: 'Kokoro ONNX neural TTS runs fully on-device: model downloads once (~330MB), unlimited natural narration at ₹0 forever' },
        { p: 'Static slide videos bore viewers — engagement dies', s: 'LLM designs a content-specific diagram for every slide (flow / steps / pillars / comparison) from that slide\'s own words — rendered locally with Pillow, synced to narration' },
        { p: 'Creator identity hardcoded into the pipeline', s: 'Creator Profiles: per-person voice + avatar + photo, selectable per project. In-app training studio records audio/video in the browser — no external dashboards' },
        { p: 'Long renders with zero visibility — did it crash or is it working?', s: 'Every agent event persisted to SQLite AND broadcast over WebSocket — page refresh replays history then continues live, gap-free' },
        { p: 'Thumbnails looked amateur next to real YouTube content', s: 'LLM designs headline / kicker / colors honoring creator instructions; Pillow composites the creator\'s photo with a soft fade — real CTR-grade thumbnails' },
      ],
      imgSrc: 'project-content-factory.png',
    },
    {
      num: '05', accent: 'green',
      liveUrl: 'https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app',
      title: 'RunbookAI',
      subtitle: 'Enterprise IT Incident Response — RAGless + Multi-Source',
      desc: 'RAGless incident response engine: zero vectors, zero hallucinated commands. Every kubectl command pulled verbatim from SQLite. Three ranked panels per query — Internal (green), Combined (purple), Official (blue) — with automated conflict detection between your runbooks and kubernetes.io docs.',
      github: 'https://github.com/RavSinghChandan/ai-engineer',
      tags: [
        { label: 'Python', cls: 'tag-green' }, { label: 'FastAPI', cls: 'tag-green' },
        { label: 'LangGraph', cls: 'tag-green' }, { label: 'NetworkX DAG', cls: 'tag-green' },
        { label: 'SQLite WAL', cls: 'tag-cyan' }, { label: 'Angular 21', cls: 'tag-cyan' },
        { label: 'K8s Docs Scraper', cls: 'tag-purple' }, { label: 'Conflict Detection', cls: 'tag-amber' },
        { label: 'RAGless', cls: 'tag-red' }, { label: '137 Tests', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'LLM hallucinating kubectl commands under incident pressure', s: 'RAGless architecture: LLM extracts commands once at ingest, SQL returns them verbatim at query time — commands_source: "database" on every response' },
        { p: 'Step ordering lost when documents are chunked for RAG', s: 'NetworkX DiGraph built from depends_on links — topological sort guarantees safe execution order every time' },
        { p: 'Engineer doesn\'t know whether to follow company runbook or official K8s docs', s: 'Three-panel response: Internal (Priority 1) → Combined agreed steps (Priority 2) → Official fallback (Priority 3) — ranked, colour-coded, conflict-flagged' },
        { p: 'Numeric parameter conflicts between internal and official docs undetected', s: 'Conflict detector scans VALUE_CONFLICT, ORDER_CONFLICT, MISSING_STEP, EXTRA_STEP via regex — populates runbook_conflicts table, surfaced in UI with severity + recommendation' },
        { p: 'Official Kubernetes docs knowledge locked outside the system', s: 'K8s docs scraper pulls 10 pages from kubernetes/website GitHub raw markdown, LLM extracts steps, stored as source_type=official — 22 total runbooks' },
        { p: 'Parallel steps not identified — engineers run sequentially wasting time', s: 'NetworkX parallel_groups calculation — Steps 4 and 5 can run simultaneously is shown in the Execution Graph tab' },
      ],
      imgSrc: 'project-runbookai.png',
    },
    {
      num: '06', accent: 'blue',
      liveUrl: 'demo',
      title: 'Universal Agent',
      subtitle: 'Plug-and-Play AI Agent — Any App, Any Domain, One Config',
      desc: 'One AI agent that drops into any application — FastAPI, Angular, React, or plain HTML — via a single config file. Swap LLMs (Claude, GPT-4, Gemini, DeepSeek, Ollama) without changing code. Powers 4 enterprise apps simultaneously with per-domain personas and zero hardcoded logic.',
      github: 'https://github.com/RavSinghChandan/ai-engineer',
      tags: [
        { label: 'Python', cls: 'tag-blue' }, { label: 'FastAPI', cls: 'tag-blue' },
        { label: 'LangGraph ReAct', cls: 'tag-blue' }, { label: 'DeepSeek', cls: 'tag-blue' },
        { label: 'Claude / GPT-4', cls: 'tag-purple' }, { label: 'Angular SDK', cls: 'tag-cyan' },
        { label: 'React SDK', cls: 'tag-cyan' }, { label: 'JS Widget', cls: 'tag-cyan' },
        { label: 'YAML Config', cls: 'tag-green' }, { label: '20 Tests', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'Every project needs its own chatbot — duplicating agent code across 4 apps', s: 'Single universal agent core — swap domain persona via YAML only. AstroIntel, Bench, RunbookAI, Agentic Growth OS all share the same engine' },
        { p: 'LLM provider lock-in — switching from GPT-4 to DeepSeek requires code rewrites', s: 'LLM abstraction layer: change one line in config.yaml to switch providers. No code changes. Tested with DeepSeek, Claude, GPT-4, Ollama' },
        { p: 'Frontend teams need chat UI but can\'t set up a backend', s: 'JS SDK: one <script> tag in any HTML page. Angular service adapter. React hook + widget. All pointing at the same FastAPI backend' },
        { p: 'Agent needs domain knowledge without full RAG pipeline', s: 'YAML extra_facts inject structured knowledge directly into system prompt. Optional FAISS knowledge base for heavy document use cases' },
        { p: 'Conversation history lost on every page reload', s: 'Per-session in-process memory store with TTL. Sessions auto-expire, history carried across messages within session' },
        { p: 'Multi-app deployment — each app needs its own persona and tools', s: '5 pre-built configs: astrointel, bench, runbookai, agentic, universal. Each sets name, persona, tools, CORS origins independently' },
      ],
      imgSrc: 'project-universal-agent.png',
    },
    {
      num: '07', accent: 'blue',
      liveUrl: 'https://ai-blueprint-rust.vercel.app',
      title: 'AI System Design Blueprint',
      subtitle: 'P1–P15 Production Patterns · Angular · Interactive Flow Diagrams',
      desc: '15 production AI patterns — Plain LLM, RAG, Agents, Memory, Streaming, Multi-Agent, Guardrails, Vector DB, Hybrid Search, Fine-Tuning, Caching, Observability, Cost Optimisation, Prompt Injection Defence, and PII Privacy — each as an interactive flow diagram with real production code.',
      github: 'https://github.com/RavSinghChandan/ai-engineer',
      tags: [
        { label: 'Angular 17', cls: 'tag-indigo' }, { label: 'TypeScript', cls: 'tag-indigo' },
        { label: '15 Patterns', cls: 'tag-purple' }, { label: 'FastAPI', cls: 'tag-indigo' },
        { label: 'LangGraph', cls: 'tag-indigo' }, { label: 'RAG', cls: 'tag-cyan' },
        { label: 'Multi-Agent', cls: 'tag-cyan' }, { label: 'GDPR', cls: 'tag-green' },
        { label: 'Vercel', cls: 'tag-amber' },
      ],
      challenges: [
        { p: '15 complex flow diagrams with consistent design across all patterns', s: 'Single PatternFlowComponent driven by a data service — one template renders all 15 patterns identically' },
        { p: 'Code snippets need to be readable during YouTube screen sharing', s: 'White background, dark text, light syntax highlight — no solid fills, diamond nodes use saturated tint backgrounds' },
        { p: 'Code panel drag-to-resize must work identically on all 15 patterns', s: 'Shared HostListener mousemove/mouseup on the component — pixel-perfect symmetry guaranteed by a single implementation' },
        { p: 'AI assistant needs to explain any pattern in context', s: 'Aarav FAB on every page — LangGraph ReAct agent at localhost:8000, per-session memory, answers questions scoped to P1–P15' },
      ],
      imgSrc: '',
    },
  ];

  // ── 6 proof cards — each one a gut-punch stat readable in 2 seconds ──
  readonly proofStats = [
    {
      stat:  '637',
      title: 'Tests. 3.6 seconds.',
      sub:   'Every line of production code is tested. No shortcuts, no flakiness.',
      askQuestion: 'How does Chandan achieve 637 tests in 3.6 seconds?',
      aaravImg: 'guide-chandan-wow.svg',
      aaravSay: '637 tests, zero flakes! 🤩',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="2"/>
        <path d="M14 22l4 4 8-8" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M30 20h6M30 24h4M30 28h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
        <circle cx="38" cy="36" r="7" fill="#09090b" stroke="#10b981" stroke-width="2"/>
        <path d="M35 36l2 2 4-4" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      stat:  '78s → 4s',
      title: 'Latency reduced 95%.',
      sub:   'Measured, optimised, and shipped — 3-tier cache + parallel agents.',
      askQuestion: 'How did Chandan reduce latency from 78 seconds to 4 seconds?',
      aaravImg: 'guide-chandan-thinking.svg',
      aaravSay: '78s → 4s. Ask me how! ⚡',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" opacity="0.3"/>
        <path d="M24 12v12l7 4" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 24h4M36 24h4M24 8v4M24 40v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
        <path d="M10 38 L20 28" stroke="#ef4444" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        <path d="M38 10 L28 20" stroke="#10b981" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        <circle cx="24" cy="24" r="3" fill="#a78bfa"/>
      </svg>`,
    },
    {
      stat:  '18+',
      title: 'AI agents coordinated.',
      sub:   'LangGraph StateGraph — parallel domain agents, conditional edges, human-in-loop.',
      askQuestion: 'How does Chandan coordinate 18+ AI agents without conflicts?',
      aaravImg: 'guide-chandan.svg',
      aaravSay: '18 agents, zero conflicts! 🤖',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="10" r="5" stroke="#a78bfa" stroke-width="2"/>
        <circle cx="10" cy="34" r="5" stroke="#06b6d4" stroke-width="2"/>
        <circle cx="38" cy="34" r="5" stroke="#10b981" stroke-width="2"/>
        <circle cx="24" cy="34" r="5" stroke="#f59e0b" stroke-width="2"/>
        <path d="M24 15 L10 29M24 15 L38 29M24 15 L24 29" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.5"/>
        <path d="M15 34 L19 34M29 34 L33 34" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
      </svg>`,
    },
    {
      stat:  '$0.000137',
      title: 'Per AI analysis.',
      sub:   'DeepSeek + semantic cache. 500× cheaper than GPT-4o. Tracked and proven.',
      askQuestion: 'How did Chandan achieve $0.000137 per AI analysis cost?',
      aaravImg: 'guide-chandan-happy.svg',
      aaravSay: '500× cheaper than GPT-4o! 💰',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 6 L28 18 L40 18 L30 26 L34 38 L24 30 L14 38 L18 26 L8 18 L20 18 Z" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round" fill="rgba(245,158,11,0.1)"/>
        <path d="M24 13 L26 19 L32 19 L28 23 L29 29 L24 25 L19 29 L20 23 L16 19 L22 19 Z" fill="#f59e0b" opacity="0.4"/>
        <text x="24" y="44" text-anchor="middle" font-size="7" font-weight="700" fill="#f59e0b" font-family="monospace">COST</text>
      </svg>`,
    },
    {
      stat:  '0',
      title: 'Hallucinated commands.',
      sub:   'RunbookAI: RAGless architecture. Every kubectl command pulled from SQL, verbatim.',
      askQuestion: 'How does RunbookAI achieve zero hallucinated commands?',
      aaravImg: 'guide-chandan-wow.svg',
      aaravSay: 'Zero hallucinations. Real. 🎯',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="16" stroke="#10b981" stroke-width="2"/>
        <path d="M17 24l5 5 9-10" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 10 L38 38" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" opacity="0.3" stroke-dasharray="3 2"/>
        <rect x="13" y="20" width="10" height="3" rx="1" stroke="currentColor" stroke-width="1" opacity="0.25"/>
        <rect x="13" y="25" width="7" height="3" rx="1" stroke="currentColor" stroke-width="1" opacity="0.25"/>
      </svg>`,
    },
    {
      stat:  'G1–G5',
      title: 'Production guardrails.',
      sub:   'Rate limit · injection detection · PII filter · faithfulness gate · output validation.',
      askQuestion: 'What are the G1 to G5 production guardrails Chandan built?',
      aaravImg: 'guide-chandan-thinking.svg',
      aaravSay: 'G1–G5 means battle-tested! 🛡️',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 4 L38 10 L38 24 C38 32 32 39 24 42 C16 39 10 32 10 24 L10 10 Z" stroke="#ef4444" stroke-width="2" stroke-linejoin="round" fill="rgba(239,68,68,0.08)"/>
        <path d="M18 24l4 4 8-8" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 18h14M17 22h10M17 26h12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
      </svg>`,
    },
  ];

  /** Opens chatbot and sends a pre-filled question about the clicked stat */
  askAarav(question: string): void {
    if (!this.cbOpen()) {
      this.cbToggle();
    }
    // Small delay so panel opens first, then send
    setTimeout(() => this.cbSend(question), 350);
  }

  // Safe: svgIcon strings are hardcoded in this component — never user input
  safeIcon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  // ── Open Source: merged PRs into major libraries. Append a new entry per merge; the
  //    portfolio auto-counts and renders them (scales as more get merged over time). ──
  openSource = [
    {
      repo: 'joblib/joblib',
      logo: 'joblib-logo.svg',
      org: 'joblib',
      stars: '4.1k★',
      title: 'accept any os.PathLike in dump() and load()',
      desc: 'Bug fix: joblib.dump()/load() now accept os.PathLike subclasses (not just str/pathlib.Path), matching open() semantics. joblib powers parallelism & caching across scikit-learn and the ML stack.',
      pr: 'https://github.com/joblib/joblib/pull/1812',
      merged: 'Jul 2026',
    },
    {
      repo: 'joblib/joblib',
      logo: 'joblib-logo.svg',
      org: 'joblib',
      stars: '4.1k★',
      title: 'add missing docstrings to time-format helpers',
      desc: 'Documented format_time, short_format_time and pformat in joblib’s logging utilities.',
      pr: 'https://github.com/joblib/joblib/pull/1811',
      merged: 'Jul 2026',
    },
    {
      repo: 'huggingface/sentence-transformers',
      logo: 'huggingface-logo.svg',
      org: 'Hugging Face',
      stars: '18.9k★',
      title: 'add tests for append_to_last_row',
      desc: 'Regression tests for an untested CSV utility in the embeddings/reranking library used across the ML ecosystem.',
      pr: 'https://github.com/huggingface/sentence-transformers/pull/3855',
      merged: 'Jul 2026',
    },
    {
      repo: 'huggingface/sentence-transformers',
      logo: 'huggingface-logo.svg',
      org: 'Hugging Face',
      stars: '18.9k★',
      title: 'add missing docstring to to_scipy_coo',
      desc: 'Documented the sparse-tensor → SciPy COO conversion used by the sparse embedding pipeline, with a runnable example matching the library’s docstring conventions.',
      pr: 'https://github.com/huggingface/sentence-transformers/pull/3843',
      merged: 'Aug 2026',
    },
    {
      repo: 'nltk/nltk',
      logo: 'nltk-logo.svg',
      org: 'NLTK',
      stars: '14.7k★',
      title: 'add tests for transitive_closure',
      desc: 'Regression tests for an untested graph-closure utility in NLTK — covers chains, reflexive closure, cycles, empty graphs, and pins the guarantee that the input graph is never mutated.',
      pr: 'https://github.com/nltk/nltk/pull/3703',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Decode low-bit DeviceRGB images as RGB instead of palette',
      desc: 'Bug fix: 2- and 4-bit-per-component DeviceRGB images were forced to a palette mode, leaving an unrecognized Pillow mode that broke image extraction. Now unpacks the interleaved colour components and scales them to full range.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3929',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Expand low-bit samples for images without a filter',
      desc: 'Follow-up bug fix: the low-bit expansion only ran for FlateDecode images, so an unfiltered or inline image passed a raw "4bits" mode straight to Pillow and raised "unrecognized image mode". Extracted the dispatch so every decode path gets it.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3938',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Keep the Adobe CMYK inversion when an explicit /Decode is present',
      desc: 'Bug fix: Adobe writes CMYK JPEGs with inverted component values. An explicit /Decode array replaced that inversion instead of combining with it, so an identity /Decode left every extracted image colour-inverted. Now the two are composed by swapping each min/max pair.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3943',
      merged: 'Aug 2026',
    },
    // Next merges go here — e.g. authlib, spaCy, evaluate (PRs currently in review).
  ];

  // ── Interactive knowledge graph (hero section below the fold) ──────────────
  //    Nodes are the real things on this page; edges are how they actually
  //    connect. Physics runs in a canvas — see initGraph() further down.
  readonly graphNodes: GraphNode[] = [
    // Systems built (purple)
    { id: 'aura',    label: 'Aura with Rav',        kind: 'system', detail: '18+ agents · 415 tests · 23 languages' },
    { id: 'bench',   label: 'Bench Optimizer',      kind: 'system', detail: 'Enterprise AI HR platform · G1–G5 guardrails' },
    { id: 'growth',  label: 'Agentic Growth OS',    kind: 'system', detail: 'Autonomous AI marketing platform' },
    { id: 'factory', label: 'AI Content Factory',   kind: 'system', detail: 'Multi-agent video production pipeline' },

    // Core technologies (cyan)
    { id: 'python',    label: 'Python',      kind: 'tech', detail: 'Primary language for all AI work' },
    { id: 'langgraph', label: 'LangGraph',   kind: 'tech', detail: 'Stateful multi-agent orchestration' },
    { id: 'langchain', label: 'LangChain',   kind: 'tech', detail: 'LLM chains, tools, retrievers' },
    { id: 'fastapi',   label: 'FastAPI',     kind: 'tech', detail: 'Async Python APIs' },
    { id: 'rag',       label: 'RAG',         kind: 'tech', detail: 'Hybrid retrieval · HyDE · CRAG · RRF fusion' },
    { id: 'angular',   label: 'Angular',     kind: 'tech', detail: 'This portfolio, and every project UI' },
    { id: 'java',      label: 'Java/Spring', kind: 'tech', detail: '4 years of production backend' },
    { id: 'kafka',     label: 'Kafka',       kind: 'tech', detail: 'Async jobs, DLQ, event streaming' },
    { id: 'docker',    label: 'Docker/AWS',  kind: 'tech', detail: 'Containerised deploys, ECS, CI/CD' },

    // Merged open source (green)
    { id: 'pypdf',   label: 'pypdf #3929',    kind: 'oss', detail: 'Bug fix: low-bit DeviceRGB decoding', url: 'https://github.com/py-pdf/pypdf/pull/3929' },
    { id: 'nltk',    label: 'nltk #3703',     kind: 'oss', detail: 'Tests for transitive_closure',        url: 'https://github.com/nltk/nltk/pull/3703' },
    { id: 'joblib1', label: 'joblib #1812',   kind: 'oss', detail: 'Bug fix: os.PathLike in dump/load',    url: 'https://github.com/joblib/joblib/pull/1812' },
    { id: 'st1',     label: 'sent-tf #3855',  kind: 'oss', detail: 'Regression tests for a core utility',  url: 'https://github.com/huggingface/sentence-transformers/pull/3855' },
    { id: 'st2',     label: 'sent-tf #3843',  kind: 'oss', detail: 'Documented to_scipy_coo',              url: 'https://github.com/huggingface/sentence-transformers/pull/3843' },
    { id: 'pypdf2',  label: 'pypdf #3943',    kind: 'oss', detail: 'Bug fix: CMYK /Decode inversion',      url: 'https://github.com/py-pdf/pypdf/pull/3943' },

    // Experience (amber)
    { id: 'infosys', label: 'Infosys — BofA', kind: 'work', detail: 'Senior Software Engineer' },
    { id: 'nexsys',  label: 'Nexsys/Accelya', kind: 'work', detail: 'Software Engineer' },
    { id: 'texala',  label: 'Texala',         kind: 'work', detail: 'Software Engineer' },
  ];

  readonly graphEdges: [string, string][] = [
    // systems → the tech they actually run on
    ['aura','python'], ['aura','langgraph'], ['aura','fastapi'], ['aura','rag'], ['aura','angular'],
    ['bench','python'], ['bench','langgraph'], ['bench','fastapi'], ['bench','angular'], ['bench','rag'],
    ['growth','python'], ['growth','langchain'], ['growth','fastapi'], ['growth','angular'],
    ['factory','python'], ['factory','langgraph'], ['factory','fastapi'], ['factory','angular'],
    // tech ↔ tech
    ['langgraph','langchain'], ['langchain','rag'], ['python','fastapi'], ['python','langchain'],
    ['fastapi','kafka'], ['fastapi','docker'], ['angular','docker'], ['java','kafka'], ['java','docker'],
    // open source grows out of the language
    ['pypdf','python'], ['nltk','python'], ['joblib1','python'], ['st1','python'], ['st2','python'],
    ['pypdf2','python'], ['pypdf2','pypdf'],
    ['st1','rag'], ['st2','rag'], ['nltk','langchain'],
    // work history → what was used there
    ['infosys','java'], ['infosys','kafka'], ['nexsys','java'], ['nexsys','angular'], ['texala','java'],
  ];

  graphHover = signal<GraphNode | null>(null);
  graphReady = signal(false);

  skills = [
    { icon: 'python', type: 'skillicon', title: 'AI & LLM Engineering', color: 'purple', items: ['python','pytorch','tensorflow','fastapi'], labels: ['LangChain','LangGraph','OpenAI API','Prompt Engineering','RAG Pipelines','Agentic AI'] },
    { icon: 'postgresql', type: 'skillicon', title: 'Retrieval & Memory', color: 'cyan', items: ['postgresql'], labels: ['FAISS','BM25','HyDE','CRAG','RRF Fusion','Cross-Encoder','Semantic Cache','Vector DBs'] },
    { icon: 'java', type: 'skillicon', title: 'Backend & APIs', color: 'green', items: ['java','spring','fastapi','sqlite'], labels: ['FastAPI','Spring Boot','Java','Python','REST APIs','Microservices'] },
    { icon: 'kafka', type: 'skillicon', title: 'Real-Time & Events', color: 'amber', items: ['kafka','redis'], labels: ['Apache Kafka','SSE Streaming','WebSockets','Redis Cache','Async Workers','DLQ'] },
    { icon: 'docker', type: 'skillicon', title: 'DevOps & Cloud', color: 'cyan', items: ['docker','aws','githubactions','nginx'], labels: ['Docker','AWS','GitHub Actions','CI/CD','Nginx','Kubernetes'] },
    { icon: 'angular', type: 'skillicon', title: 'Frontend', color: 'red', items: ['angular','typescript','javascript','html','css'], labels: ['Angular 17','TypeScript','JavaScript','HTML5','SCSS','Figma'] },
  ];

  experience = [
    {
      company: 'Infosys — Bank of America',
      companyLogo: 'https://skillicons.dev/icons?i=azure',
      logoAlt: 'Infosys',
      role: 'Senior Software Engineer',
      location: 'Pune, India',
      period: 'Nov 2025 – Present',
      color: 'purple',
      isPresent: true,
      points: [
        'Designed LLM-integrated backend systems enabling intelligent automation of banking workflows',
        'Built AI-driven microservices with event-driven architecture and real-time processing pipelines',
        'Implemented Kafka-based data pipelines for continuous AI processing and autonomous decision flows',
        'Improved system efficiency by 40% through optimized AI-integrated microservices architecture',
        'Led integration of LLM APIs into Spring Boot services — enabling intelligent document processing',
      ],
      companyBadge: 'https://img.shields.io/badge/Infosys-007CC3?style=flat-square&logo=infosys&logoColor=white',
    },
    {
      company: 'Nexsys — Accelya',
      role: 'Software Engineer',
      location: 'Mumbai, India',
      period: 'Dec 2023 – Nov 2025',
      color: 'cyan',
      isPresent: false,
      points: [
        'Developed aviation industry systems processing 500K+ daily transactions with AI-ready architecture',
        'Built asynchronous pipelines supporting real-time intelligent data processing at scale',
        'Designed and delivered RESTful microservices integrated with Spring Boot and JPA/Hibernate',
        'Contributed to CI/CD automation and Docker-based deployment workflows',
      ],
      companyBadge: 'https://img.shields.io/badge/Accelya-1a1a2e?style=flat-square&logoColor=white',
    },
    {
      company: 'Texala',
      role: 'Software Engineer',
      location: 'Pune, India',
      period: 'Jul 2023 – Nov 2023',
      color: 'green',
      isPresent: false,
      points: [
        'Developed production-grade microservices using Java and Spring Boot',
        'Maintained and optimized backend systems handling concurrent API requests',
      ],
      companyBadge: 'https://img.shields.io/badge/Texala-10b981?style=flat-square&logoColor=white',
    },
    {
      company: 'Flyboard Ventures',
      role: 'Software Engineer',
      location: 'Chandigarh, India',
      period: 'Aug 2022 – Jul 2023',
      color: 'amber',
      isPresent: false,
      points: [
        'Built mobile app for e-commerce with secure payment gateway integration',
        'Developed web application for healthcare startup: patient records, real-time doctor communication',
        'Created e-learning platform with ML/NLP integration for AI-powered student support chatbot',
        'Built scalable APIs supporting high concurrency systems serving thousands of concurrent users',
      ],
      companyBadge: 'https://img.shields.io/badge/Flyboard-f59e0b?style=flat-square&logoColor=white',
    },
  ];

  // ── FLOATING GUIDE CHARACTER — AARAV ────────────────────────────
  fgVisible = signal(false);
  fgIntro   = signal(false);   // true only during the intro slide
  fgImg     = signal('guide-chandan-happy.svg');
  fgQuote   = signal('');
  fgSub     = signal('');
  fgEntry   = signal('from-bottom-left');

  private _fgTimer: ReturnType<typeof setTimeout> | undefined;
  private _fgSection = '';

  // Entry directions cycle per section so character always comes from a new corner
  private _fgDirs = ['from-left','from-right','from-top-left','from-top-right','from-bottom-left','from-bottom-right'];
  private _fgDirIdx = 0;

  private readonly _fgScript: Record<string, { img: string; quote: string; sub: string }[]> = {
    hero:       { img: 'guide-chandan-happy.svg',   quote: 'Right person! 😄',    sub: 'Ships. For real.' },
    skills:     { img: 'guide-chandan.svg',          quote: 'All in prod. 💪',     sub: 'Zero tutorials.' },
    projects:   { img: 'guide-chandan-wow.svg',      quote: '5 systems! 🤩',       sub: 'Click Live Demo ↗' },
    experience: { img: 'guide-chandan-thinking.svg', quote: 'Self-made. 🎯',       sub: '4 companies. Real.' },
    story:      { img: 'guide-chandan-happy.svg',    quote: 'His why. ✨',         sub: 'Read this one.' },
    contact:    { img: 'guide-chandan-wow.svg',      quote: "Let's build! 🚀",     sub: 'Reach out now.' },
  } as any;

  initFloatingGuide() {
    if (!isPlatformBrowser(this.platformId)) return;

    // ── INTRO: Aarav introduces himself 1.2s after page load ──────
    this._fgTimer = setTimeout(() => {
      this.fgIntro.set(true);
      this.fgImg.set('guide-chandan-happy.svg');
      this.fgQuote.set("Namaste! 🙏 I'm Aarav");
      this.fgSub.set("Chandan's AI guide. Let's go!");
      this.fgEntry.set('from-bottom-left');
      this.fgVisible.set(true);
      this._fgSection = 'intro'; // block section observer briefly

      // After 3.5s switch to hero script
      this._fgTimer = setTimeout(() => {
        this.fgIntro.set(false);
        this.fgVisible.set(false);
        this._fgTimer = setTimeout(() => {
          const hero = (this._fgScript as any)['hero'];
          this.fgImg.set(hero.img);
          this.fgQuote.set(hero.quote);
          this.fgSub.set(hero.sub);
          this.fgEntry.set('from-left');
          this.fgVisible.set(true);
          this._fgSection = 'hero';
          this._fgDirIdx = 1; // start cycling from next direction
          this._fgTimer = setTimeout(() => this.fgVisible.set(false), 5000);
        }, 300);
      }, 3500);
    }, 1200);

    // ── Section observer: fires on scroll ─────────────────────────
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const sec = (e.target as HTMLElement).dataset['guide'];
        if (!sec || sec === this._fgSection) continue;
        this._fgSection = sec;
        const item = (this._fgScript as any)[sec];
        if (!item) continue;

        const dir = this._fgDirs[this._fgDirIdx % this._fgDirs.length];
        this._fgDirIdx++;

        this.fgVisible.set(false);
        clearTimeout(this._fgTimer);
        this._fgTimer = setTimeout(() => {
          this.fgIntro.set(false);
          this.fgImg.set(item.img);
          this.fgQuote.set(item.quote);
          this.fgSub.set(item.sub);
          this.fgEntry.set(dir);
          this.fgVisible.set(true);
          this._fgTimer = setTimeout(() => this.fgVisible.set(false), 5500);
        }, 200);
      }
    }, { threshold: 0.25 });

    document.querySelectorAll('section[data-guide]').forEach(s => obs.observe(s));
  }

  // ── INLINE GUIDE BANNERS (appear between sections) ──────────────
  // Each guide banner is always in the DOM inside its section; CSS
  // handles the walk-in animation when the element enters the viewport.
  // No signals needed — pure CSS scroll-driven animations.

  readonly guideBanners = [
    {
      id: 'gb-hero',
      img: 'guide-chandan-happy.svg',
      dir: 'left',
      quote: "Right person! 👋 Senior AI Engineer who actually ships.",
      sub:   "4+ years · 637 tests · Zero shortcuts",
    },
    {
      id: 'gb-skills',
      img: 'guide-chandan.svg',
      dir: 'right',
      quote: "Every skill here? Battle-tested in production. No fluff. 💪",
      sub:   "LangGraph · FAISS · Kafka · Redis · Angular · FastAPI",
    },
    {
      id: 'gb-p01',
      img: 'guide-chandan-wow.svg',
      dir: 'left',
      quote: "18+ AI agents, 23 languages, 415 tests. Real engineering. 🔮",
      sub:   "Project 01 · Aura with Rav",
    },
    {
      id: 'gb-p02',
      img: 'guide-chandan-thinking.svg',
      dir: 'right',
      quote: "Hybrid RAG + circuit breaker + episodic memory. Done right. ⚡",
      sub:   "Project 02 · Bench Resource Optimizer",
    },
    {
      id: 'gb-p03',
      img: 'guide-chandan-happy.svg',
      dir: 'left',
      quote: "5 agents. Auto-learning. ROI improves every run. 🚀",
      sub:   "Project 03 · Agentic Growth OS",
    },
    {
      id: 'gb-p04',
      img: 'guide-chandan.svg',
      dir: 'right',
      quote: "RAGless SQL + dependency graph. Zero vectors. Zero hallucinations. 🧠",
      sub:   "Project 04 · RunbookAI",
    },
    {
      id: 'gb-exp',
      img: 'guide-chandan-thinking.svg',
      dir: 'left',
      quote: "Kolkata → Masai bootcamp → 4 companies → production AI. 🏆",
      sub:   "Self-made. Every role levelled up the craft.",
    },
    {
      id: 'gb-story',
      img: 'guide-chandan-happy.svg',
      dir: 'right',
      quote: "From 'you can't spell console' to AI systems at scale. ✨",
      sub:   "The person behind the code",
    },
    {
      id: 'gb-contact',
      img: 'guide-chandan-wow.svg',
      dir: 'left',
      quote: "You're here. That means you're serious. So is Chandan. 🤝",
      sub:   "Let's build something real together.",
    },
  ];

  // ── DEMO MODAL ──────────────────────────────────────────────────
  demoOpen   = signal(false);
  demoSlide  = signal(0);
  demoProject = signal<null | {
    num: string; title: string; accent: string;
    slides: { img: string; caption: string; label: string; guide?: string; speech?: string }[];
  }>(null);

  readonly demoData: Record<string, { img: string; caption: string; label: string; guide?: string; speech?: string }[]> = {
    '01': [
      {
        img: 'aura-step1-login.png',
        label: '🔐 Step 1 — Login Page',
        caption: 'The AURA with Rav platform — 360° Astro-Spiritual Intelligence. Secure JWT login with Sign In, Create Account, and OTP tab.',
        guide: 'guide-chandan.svg',
        speech: 'Welcome! 👋 This is the AURA platform I built. Let me show you the whole journey!',
      },
      {
        img: 'aura-step2-credentials.png',
        label: '✏️ Step 2 — Enter Credentials',
        caption: 'Admin credentials entered — email admin@aura.local and password filled. Single Sign In click launches the full authenticated session.',
        guide: 'guide-chandan.svg',
        speech: 'See? I\'m typing in the credentials right now. Email + Password → Sign In! Easy! 😄',
      },
      {
        img: 'aura-step3-form-empty.png',
        label: '📋 Step 3 — Birth Profile Form',
        caption: 'After login, the AI intake form loads. Fill Name, Date of Birth, Place of Birth, and your question for the Astrologer across 5 analysis modules.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'Hmm... now let me fill in my birth details. This powers ALL 18+ agents! 🔮',
      },
      {
        img: 'aura-step4-form-filled.png',
        label: '✅ Step 4 — Form Filled',
        caption: 'Chandan Kumar · 15/08/1990 · Patna, Bihar, India. Question: "Will my career in AI engineering grow in 2026?" — Laser Sharp report style selected.',
        guide: 'guide-chandan-happy.svg',
        speech: 'Done! All fields filled. Numerology selected. Laser Sharp mode. Let\'s GO! 🚀',
      },
      {
        img: 'aura-step5-reading-started.png',
        label: '🤖 Step 5 — AI Review (Findings)',
        caption: 'Agents complete the analysis. Admin Review panel shows AI findings with HIGH/MEDIUM priority tags. "Growth-oriented and positive period" — Numerology confidence.',
        guide: 'guide-chandan-wow.svg',
        speech: 'WOW! The AI agents found insights! Life Path 33, Destiny 33 — this is REAL AI! 🤩',
      },
      {
        img: 'aura-step7-review.png',
        label: '📊 Step 6 — Review & Approve',
        caption: 'Admin Review workspace with Approve All, Generate Report buttons. Agent Log, Raw JSON, Astrology, Translations tabs for full transparency.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'Now reviewing agent findings before generating the PDF report. Quality gate! 🎯',
      },
      {
        img: 'aura-step8-pipeline.png',
        label: '🔬 Step 7 — Agent Pipeline Graph',
        caption: 'Live AGENT PIPELINE · DYNAMIC GRAPH — 16 nodes including User Profile, Questions, Prompt Style, Tenant Persona Injection. 3/7 Features Active.',
        guide: 'guide-chandan-wow.svg',
        speech: 'This is my LangGraph pipeline! Every node is an AI agent working together! 🧠⚡',
      },
    ],
    '02': [
      {
        img: 'bench-step1-login.png',
        label: '🔐 Step 1 — Enterprise Login',
        caption: 'Bench Resource Optimizer — enterprise HR AI platform. Role-based JWT auth: USER and ADMIN tiers. Injection-hardened from the very first request.',
        guide: 'guide-chandan.svg',
        speech: 'Welcome to Bench! This is the enterprise HR AI platform I built. Let me show you the whole story! ⚡',
      },
      {
        img: 'bench-step2-credentials.png',
        label: '✏️ Step 2 — Admin Signs In',
        caption: 'Admin credentials entered — user_id "admin" and password. JWT tokens stored in sessionStorage with 24h expiry. No hardcoded defaults — all env vars.',
        guide: 'guide-chandan.svg',
        speech: 'See the "ADMIN" badge? Role-based access control kicks in immediately after login! 🛡️',
      },
      {
        img: 'bench-step3-upload.png',
        label: '📄 Step 3 — Upload Employee CV',
        caption: 'Step 1 of the 3-step flow: drag & drop a PDF resume. The AI extracts skills, years, seniority — all processed locally. Raw bytes discarded instantly. G2 injection guard active.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'Drop a CV here... AI will parse it with injection-hardened prompts. No raw data leaves the server! 🔒',
      },
      {
        img: 'bench-step4-mapping.png',
        label: '🎯 Step 4 — Role Mapping (Hybrid RAG)',
        caption: 'Step 2: select a target open role. AI compares employee skills vs. role requirements using FAISS + BM25 + HyDE + CRAG + cross-encoder reranker — the full hybrid stack.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'First upload CV (step 1), then AI maps skills to open roles using 5-layer hybrid RAG! No shortcuts! 🧠',
      },
      {
        img: 'bench-step7-graph.png',
        label: '🤖 Step 5 — Agent Pipeline Graph',
        caption: '4-Layer Security visible at top: L1 Injection Guard → L2 Prompt Hardening → L3 Output Leak Detection → L4 Audit. Graph shows: Employee CV → Role Requirement → Security Gate → CV Parser Agent.',
        guide: 'guide-chandan-wow.svg',
        speech: 'WOW! Look at this — Security Gate Node 0 runs BEFORE any LLM sees data. L1+L2+L3+L4 all firing! 🔥',
      },
      {
        img: 'bench-step6-memory.png',
        label: '🧠 Step 6 — Episodic Memory',
        caption: 'Module 4: Agent State Management. Episodic + Long-term + Context Injection tabs. Memory persists across restarts via SQLite WAL. Agent knows which roles you explored last session.',
        guide: 'guide-chandan-happy.svg',
        speech: 'The agent REMEMBERS you! Past sessions, explored roles, readiness score — all injected into LLM context! 🎉',
      },
      {
        img: 'bench-step8-admin.png',
        label: '🔒 Step 7 — HR Admin Knowledge Base',
        caption: 'Company Confidential: internal training docs chunked & embedded on-premise with HuggingFace. LLM only sees skill names + text chunks — never raw CVs, never PII.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'Only HR admins see this. Internal docs embedded locally — ZERO data sent to external APIs! 🏢',
      },
      {
        img: 'bench-step9-metrics.png',
        label: '📊 Step 8 — Production Metrics',
        caption: 'Live production metrics: request latency, cache hit rates (L1 exact < 1ms, L2 semantic), guardrail trigger counts, circuit breaker state, and SSE streaming TTFT.',
        guide: 'guide-chandan-wow.svg',
        speech: '222 tests, 3.6s runtime, zero shortcuts — and now you can see it all live in production metrics! 🚀',
      },
    ],
    '03': [
      {
        img: 'agentic-step1-workflow.png',
        label: '🎨 Step 1 — Workflow Builder Canvas',
        caption: 'Drag-and-drop LangGraph canvas — 5 AI agent nodes ready: Audience Agent, Ad Copy Agent, Budget Optimizer, Campaign Agent. LangGraph Powered + Auto-Learning ON badges live.',
        guide: 'guide-chandan.svg',
        speech: 'Welcome to Agentic Growth OS! This drag-and-drop canvas lets you build autonomous marketing workflows! 🚀',
      },
      {
        img: 'agentic-step2-demo-loaded.png',
        label: '⚡ Step 2 — Demo Campaign Loaded',
        caption: 'One click loads a real estate campaign: "Premium Residences Launch" — Real Estate type, Skyline Heights brand, ₹50,000 budget, Google Ads platform. All agents show ✓ Completed.',
        guide: 'guide-chandan-happy.svg',
        speech: 'Quick Load Demo Campaign — BOOM! Real campaign data filled automatically. All 5 agents ready to fire! 🎯',
      },
      {
        img: 'agentic-step3-executing.png',
        label: '🤖 Step 3 — Agents Executing',
        caption: 'LangGraph orchestrates all 5 agents in sequence — each node fires, processes, completes. Audience → Ad Copy → Budget Optimizer → Campaign Agent — all showing ✓ Completed status.',
        guide: 'guide-chandan-wow.svg',
        speech: 'WOW! Watch the agents fire one by one — each node completes before passing to the next! Pure LangGraph! ⚡',
      },
      {
        img: 'agentic-step4-dashboard.png',
        label: '📊 Step 4 — Campaign Dashboard',
        caption: 'Campaign Dashboard with real-time metrics from the last workflow execution. Google Ads + Meta Ads simulated platforms. LangGraph Engine Active — 5 agent nodes ready, Auto-learning ON.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'The dashboard shows ROI from every run. Run it again — the learning engine kicks in! 🧠',
      },
      {
        img: 'agentic-step5-learning.png',
        label: '🧠 Step 5 — Auto-Learning Engine',
        caption: 'HOW AUTO-LEARNING WORKS: Collect → Compare → Analyze → Improve. Each run stores campaign inputs + agent decisions. Similarity matching finds related past campaigns. Rule engine applies optimizations automatically.',
        guide: 'guide-chandan-wow.svg',
        speech: 'This is the magic! The system LEARNS from every campaign run and improves the next one automatically! 🤩',
      },
      {
        img: 'agentic-step6-config.png',
        label: '⚙️ Step 6 — Agent Config + LangGraph Flow',
        caption: 'Campaign Config panel alongside the live agent graph — name, type, brand, budget, target audience, platform. Toggle Auto-Learning ON/OFF. Execute LangGraph Workflow to trigger all agents.',
        guide: 'guide-chandan-happy.svg',
        speech: 'Configure any campaign here, hit Execute — and watch all 5 AI agents do the work for you! 40–80% ROI lift! 🎊',
      },
    ],
    '04': [
      {
        img: 'acf-step1-thumbnail.png',
        label: '🎨 Step 1 — AI-Designed Thumbnail',
        caption: 'The Thumbnail agent designs headline, kicker badge and colors from the script plus creator instructions, then composites the creator\'s photo locally with Pillow — a real CTR-grade YouTube thumbnail, generated in seconds.',
        guide: 'guide-chandan.svg',
        speech: 'Welcome to my AI Content Factory! 🎬 Topic in → finished YouTube video out. Look at this AI-designed thumbnail!',
      },
      {
        img: 'acf-step2-comparison.png',
        label: '📊 Step 2 — Content-Adaptive Diagram Slides',
        caption: 'Every slide gets its own diagram designed by the LLM from that slide\'s actual words. Here the chunking section became a "Fixed Size VS Semantic" comparison — never a fixed template.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'See this? The LLM read my script about chunking and drew a Bad-vs-Good comparison. Every slide, a unique diagram! 🧠',
      },
      {
        img: 'acf-step3-flow.png',
        label: '🔀 Step 3 — A Different Diagram Every Slide',
        caption: 'The retrieval section became a flow chart: Vector Search → Keyword Search → Rerank. Slides flip in exact sync with the narration — voiced by Kokoro, a free on-device neural TTS. Cost per video: DeepSeek tokens only.',
        guide: 'guide-chandan-wow.svg',
        speech: 'Same video, different slide — now it\'s a flow chart! And the voice is a FREE neural TTS running on-device. ₹0! 🤩',
      },
      {
        img: 'acf-step4-avatar.png',
        label: '🧑‍💼 Step 4 — Optional Talking Avatar',
        caption: 'Creator Profiles make identity configurable: with one photo, HeyGen\'s talking-photo mode renders the creator speaking the narration. Voice, avatar and photo are per-profile — train a new person by adding a row, never by changing code.',
        guide: 'guide-chandan-happy.svg',
        speech: 'And this is ME presenting — generated from one photo + my cloned voice. Avatar mode is one dropdown away! 🚀',
      },
    ],
    '05': [
      {
        img: 'runbook-step1-dashboard.png',
        label: '📋 Step 1 — Command Center',
        caption: 'RunbookAI Dashboard: 22 runbooks, 1 category (Kubernetes), 3 severities (P1→P3), RAGless architecture. Zero vectors — pure SQL + dependency graph. v1.0.0 · Phase 6 · OK.',
        guide: 'guide-chandan.svg',
        speech: 'Welcome to RunbookAI — enterprise incident response. No vectors, no RAG. Just SQL + graphs! 📋',
      },
      {
        img: 'runbook-step2-list.png',
        label: '📚 Step 2 — Runbooks Library',
        caption: '22 runbooks tagged by source — [Official] K8s docs scraped from GitHub alongside internal runbooks. Each tagged: Source, Category, Severity P1/P2/P3, Steps count, Duration, and domain Tags.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'See the "Official" badges? Those are real Kubernetes docs scraped from GitHub — live knowledge! 🔍',
      },
      {
        img: 'runbook-step3-detail.png',
        label: '🔧 Step 3 — Runbook Steps Detail',
        caption: 'Numbered dependency-linked steps with exact CLI commands, expected outputs, and "Depends on: step N" annotations. etcd compaction → defragment → NOSPACE alarm disarm — exact reproduction steps.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'Every step has a dependency chain! Step 4 depends on steps 1,2 — this is a GRAPH, not a flat list! 🔗',
      },
      {
        img: 'runbook-step4-ingest.png',
        label: '📥 Step 4 — Ingest New Runbook',
        caption: 'Upload a PDF runbook — structured extraction pulls steps, commands, severity, dependencies. No vector embedding. Structured extraction writes directly to SQLite with graph edges.',
        guide: 'guide-chandan-happy.svg',
        speech: 'Drop any incident PDF here and the AI extracts structured steps automatically. Zero vectors needed! 😄',
      },
      {
        img: 'runbook-step5-query-empty.png',
        label: '🔍 Step 5 — Query Interface',
        caption: 'Describe any incident in plain English — RAGless SQL + graph traversal finds the right runbook. Example incidents shown: CrashLoopBackOff, PostgreSQL connections, network flapping, CI/CD stuck.',
        guide: 'guide-chandan.svg',
        speech: 'Plain English → instant runbook. No cosine similarity, no embeddings. SQL + graph! Type your incident... ⌨️',
      },
      {
        img: 'runbook-step6-query-typed.png',
        label: '⌨️ Step 6 — Incident Described',
        caption: '"Kubernetes pods are crashlooping after a deployment — need to rollback immediately." Real-world P1 incident. The AI will match this to runbooks with conflict detection across sources.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'A real P1 incident! Pods crashlooping post-deploy. Let\'s see what runbook the AI finds for us... 🚨',
      },
      {
        img: 'runbook-step7-results.png',
        label: '✅ Step 7 — Results + Conflict Flag',
        caption: 'Match found: [Official] HorizontalPodAutoscaler Walkthrough — P2, HIGH match, ~20m, 8 steps, ⚠️ 2 conflicts detected. Triage Summary + Steps + Execution Graph + Multi-Source tabs.',
        guide: 'guide-chandan-wow.svg',
        speech: 'It found a match AND flagged 2 conflicts between internal and official docs! That\'s enterprise-grade! 🤩',
      },
      {
        img: 'runbook-step8-multi.png',
        label: '🔀 Step 8 — Multi-Runbook Reasoning',
        caption: 'Multi-Runbook page: merge runbooks, detect conflicts across sources, handle compound incidents requiring multiple runbooks. The system reasons across 22 runbooks simultaneously.',
        guide: 'guide-chandan-happy.svg',
        speech: 'One incident, multiple runbooks merged — conflict detection across ALL 22 sources at once! This is the magic! 🎊',
      },
    ],
    '06': [
      {
        img: 'ua-step1-landing.png',
        label: '🚀 Step 1 — Landing: What It Is',
        caption: 'Universal Agent landing page — "One agent. Any domain. Any application. Configure once, plug in anywhere." Shows FastAPI integration (3 lines of code) and HTML embed (1 script tag) side by side with live stats: 4 LLM providers, 3 lines to integrate, 20 tests passing.',
        guide: 'guide-chandan.svg',
        speech: 'Welcome to Universal Agent! I built this so ANY app — portfolio, SaaS, enterprise — can have AI in 3 lines of code! 🚀',
      },
      {
        img: 'ua-step2-widget-open.png',
        label: '💬 Step 2 — Widget Opens',
        caption: 'The chat widget opens from the bottom-right corner. Agent name "Aarav" from config.yaml is displayed in the header. The widget is injected by a single <script> tag — no frontend framework required.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'See this chat bubble? It appeared from just ONE script tag. No React, no Angular needed — just HTML! 🎯',
      },
      {
        img: 'ua-step3-first-response.png',
        label: '🤖 Step 3 — First AI Response',
        caption: 'Agent responds with deep knowledge of all 4 enterprise platforms. It knows AstroIntel (18+ agents, G1–G5 guardrails), Bench (Hybrid RAG, 222 tests), RunbookAI (RAGless SQL), and Agentic Growth OS (auto-learning). Cross-platform intelligence from a single configured agent.',
        guide: 'guide-chandan-wow.svg',
        speech: 'WOW — the agent knows ALL 4 of my platforms! AstroIntel, Bench, RunbookAI, Agentic — one brain, four domains! 🤩',
      },
      {
        img: 'ua-step4-integration-response.png',
        label: '⚡ Step 4 — FastAPI Integration',
        caption: 'Agent explains how to integrate into a FastAPI app in real time. The answer comes from the configured persona — no hardcoded answers, pure LLM reasoning with domain context injected from YAML extra_facts.',
        guide: 'guide-chandan-happy.svg',
        speech: 'The agent explains its own integration! It knows the exact 3-line FastAPI code because I put it in the config! 😄',
      },
      {
        img: 'ua-step5-llm-providers.png',
        label: '🔌 Step 5 — Multi-LLM Support',
        caption: 'Agent answers questions about LLM provider support — Claude, GPT-4, Gemini, DeepSeek, Ollama all supported. Swap providers by changing one line in config.yaml: provider: "claude" → provider: "openai". Zero code changes.',
        guide: 'guide-chandan-thinking.svg',
        speech: 'Claude, GPT-4, Gemini, Ollama — switch providers by changing ONE line in YAML. No code, no redeploy! 🔄',
      },
      {
        img: 'ua-step6-swagger.png',
        label: '📚 Step 6 — REST API (Swagger)',
        caption: 'Full REST API documented at /docs. Endpoints: POST /agent/chat (send message, get response), DELETE /agent/clear (reset session), GET /agent/health (status + model + tools + RAG state). Any frontend can call these directly.',
        guide: 'guide-chandan-wow.svg',
        speech: 'Full Swagger docs! /agent/chat, /agent/clear, /agent/health — any frontend can call this REST API directly! 🔥',
      },
    ],
  };

  openDemo(project: { num: string; title: string; accent: string }) {
    this.demoProject.set({ ...project, slides: this.demoData[project.num] || [] });
    this.demoSlide.set(0);
    this.demoOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  closeDemo() {
    this.demoOpen.set(false);
    this.demoProject.set(null);
    document.body.style.overflow = '';
  }

  demoNext() {
    const proj = this.demoProject();
    if (!proj) return;
    this.demoSlide.set((this.demoSlide() + 1) % proj.slides.length);
  }

  demoPrev() {
    const proj = this.demoProject();
    if (!proj) return;
    this.demoSlide.set((this.demoSlide() - 1 + proj.slides.length) % proj.slides.length);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (!this.demoOpen()) return;
    if (e.key === 'Escape')     { this.closeDemo(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.demoNext(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); this.demoPrev(); }
  }

  // ── SKILL BARS VISIBILITY (scroll-triggered) ─────────────────────
  skillsVisible = signal(false);

  // ── ANIMATED STAT COUNTERS ───────────────────────────────────────
  statTests  = signal(0);
  statAgents = signal(0);
  statProjects = signal(0);
  statYears  = signal(0);
  private statsAnimated = false;

  private readonly chatSvc = inject(ChatService);

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private sanitizer: DomSanitizer
  ) {}

  private initNeuralCanvas() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('neural-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    // ── tuning ──────────────────────────────────────────────────────────────
    const baseCount       = 96;   // neurons (scaled by viewport area)
    const CLUSTER_COUNT   = 6;    // cortical-region clusters
    const AXON_PER_NODE   = 3;    // sparse: each neuron connects to at most N
    const MAX_AXON_LEN    = 300;  // long-range fibres
    const DRIFT_SPEED     = 0.10; // slow ambient drift
    const SIGNAL_SPEED    = 0.014;// fraction of edge per frame
    const SIGNAL_INTERVAL = 42;   // frames between spontaneous firings
    const MOUSE_RADIUS    = 190;  // cursor influence radius
    const PARALLAX        = 14;    // px of depth parallax from cursor
    // ────────────────────────────────────────────────────────────────────────

    const rgb = (hex: string) => ({
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    });

    interface Cluster { cx: number; cy: number; color: string; }
    // luminous violet→cyan spectrum, tuned for additive glow on dark bg
    const CLUSTER_COLORS = ['#8b5cf6', '#22d3ee', '#6366f1', '#2dd4bf', '#a855f7', '#3b82f6'];

    let W = 0, H = 0;
    let clusters: Cluster[] = [];
    const buildClusters = () => {
      clusters = Array.from({ length: CLUSTER_COUNT }, (_, i) => ({
        cx: (0.12 + 0.76 * Math.random()) * W,
        cy: (0.12 + 0.76 * Math.random()) * H,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      }));
    };

    interface Neuron {
      x: number; y: number; hx: number; hy: number; // home + live pos
      vx: number; vy: number; r: number; z: number;  // z = depth 0..1
      clusterId: number; glow: number; glowDir: number;
      fire: number; // 0..1 activation flash when a signal arrives
    }
    let neurons: Neuron[] = [];

    interface Axon { from: number; to: number; heat: number; } // heat = recent-signal glow
    let axons: Axon[] = [];

    interface Signal { axonIdx: number; t: number; }
    let signals: Signal[] = [];
    let frameCount = 0;

    // pointer state (smoothed)
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };

    let NODE_COUNT = baseCount;

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      // scale node count to viewport area so it never looks sparse/crowded
      NODE_COUNT = Math.round(baseCount * Math.min(1.4, Math.max(0.55, (W * H) / (1440 * 900))));
      buildClusters();
      init();
    };

    const init = () => {
      neurons = Array.from({ length: NODE_COUNT }, (_, i) => {
        const cid = i % CLUSTER_COUNT;
        const cl = clusters[cid];
        const spread = 70 + Math.random() * 150;
        const angle = Math.random() * Math.PI * 2;
        const x = cl.cx + Math.cos(angle) * spread * Math.random();
        const y = cl.cy + Math.sin(angle) * spread * Math.random();
        const z = Math.random(); // depth: near nodes bigger/brighter/parallax more
        return {
          x, y, hx: x, hy: y,
          vx: (Math.random() - 0.5) * DRIFT_SPEED,
          vy: (Math.random() - 0.5) * DRIFT_SPEED,
          r: (1 + Math.random() * 2) * (0.6 + z * 0.9),
          z, clusterId: cid,
          glow: Math.random(), glowDir: Math.random() > 0.5 ? 1 : -1,
          fire: 0,
        };
      });

      axons = [];
      for (let i = 0; i < neurons.length; i++) {
        const candidates: { j: number; d: number }[] = [];
        for (let j = 0; j < neurons.length; j++) {
          if (i === j) continue;
          const dx = neurons[i].x - neurons[j].x;
          const dy = neurons[i].y - neurons[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_AXON_LEN) candidates.push({ j, d });
        }
        candidates.sort((a, b) => a.d - b.d);
        const same = candidates.filter(c => neurons[c.j].clusterId === neurons[i].clusterId);
        const diff = candidates.filter(c => neurons[c.j].clusterId !== neurons[i].clusterId);
        const chosen = [...same.slice(0, AXON_PER_NODE - 1), ...diff.slice(0, 1)].slice(0, AXON_PER_NODE);
        for (const c of chosen) axons.push({ from: i, to: c.j, heat: 0 });
      }
      signals = [];
    };

    // pre-index outgoing axons per neuron for fast cascades
    const outgoingOf = (nodeIdx: number) => {
      const out: number[] = [];
      for (let i = 0; i < axons.length; i++) if (axons[i].from === nodeIdx) out.push(i);
      return out;
    };

    const onMove = (e: MouseEvent) => { mouse.tx = e.clientX; mouse.ty = e.clientY; mouse.active = true; };
    const onLeave = () => { mouse.active = false; };
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseout', onLeave, { passive: true });
    resize();

    const spawnSignal = (axonIdx: number) => { if (axons[axonIdx]) { signals.push({ axonIdx, t: 0 }); axons[axonIdx].heat = 1; } };

    const draw = () => {
      frameCount++;

      // trail/afterglow: fade previous frame instead of hard clear (bloom look)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(8, 9, 20, 0.22)';
      ctx.fillRect(0, 0, W, H);

      // smooth pointer
      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;
      const pxOff = mouse.active ? (mouse.x / W - 0.5) * PARALLAX : 0;
      const pyOff = mouse.active ? (mouse.y / H - 0.5) * PARALLAX : 0;

      // physics
      for (const n of neurons) {
        n.hx += n.vx; n.hy += n.vy;
        if (n.hx < 20) n.vx += 0.02; if (n.hx > W - 20) n.vx -= 0.02;
        if (n.hy < 20) n.vy += 0.02; if (n.hy > H - 20) n.vy -= 0.02;
        // gentle damping so drift stays calm
        n.vx *= 0.996; n.vy *= 0.996;

        // depth parallax
        let x = n.hx + pxOff * (0.3 + n.z);
        let y = n.hy + pyOff * (0.3 + n.z);

        // cursor repulsion (nodes lean away, like a field)
        if (mouse.active) {
          const dx = x - mouse.x, dy = y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
            const d = Math.sqrt(d2) || 1;
            const force = (1 - d / MOUSE_RADIUS) * 14;
            x += (dx / d) * force; y += (dy / d) * force;
          }
        }
        n.x = x; n.y = y;

        n.glow += n.glowDir * 0.005;
        if (n.glow > 1) { n.glow = 1; n.glowDir = -1; }
        if (n.glow < 0) { n.glow = 0; n.glowDir = 1; }
        if (n.fire > 0) n.fire -= 0.03;
      }

      // spontaneous firing (+ a burst near the cursor for responsiveness)
      if (!prefersReduced && frameCount % SIGNAL_INTERVAL === 0 && axons.length) {
        spawnSignal(Math.floor(Math.random() * axons.length));
      }
      if (mouse.active && !prefersReduced && frameCount % 10 === 0) {
        // find nearest neuron to cursor and fire one of its axons
        let best = -1, bd = 1e9;
        for (let i = 0; i < neurons.length; i++) {
          const dx = neurons[i].x - mouse.x, dy = neurons[i].y - mouse.y;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
        if (best >= 0 && bd < MOUSE_RADIUS * MOUSE_RADIUS) {
          const out = outgoingOf(best);
          if (out.length) spawnSignal(out[Math.floor(Math.random() * out.length)]);
        }
      }

      // advance signals + cascade
      const done: number[] = [];
      for (let s = 0; s < signals.length; s++) {
        signals[s].t += SIGNAL_SPEED;
        const ax = axons[signals[s].axonIdx];
        if (ax) ax.heat = Math.max(ax.heat, 1 - Math.abs(signals[s].t - 0.5));
        if (signals[s].t >= 1) {
          done.push(s);
          if (ax) {
            neurons[ax.to].fire = 1; // flash the arrival neuron
            const out = outgoingOf(ax.to);
            if (out.length && Math.random() > 0.32) {
              spawnSignal(out[Math.floor(Math.random() * out.length)]);
            }
          }
        }
      }
      for (let i = done.length - 1; i >= 0; i--) signals.splice(done[i], 1);
      if (signals.length > 80) signals.splice(0, signals.length - 80);

      // ADDITIVE pass — everything glowing blends luminously
      ctx.globalCompositeOperation = 'lighter';

      // axons (base dim + heat brighten as signals pass)
      for (const ax of axons) {
        const a = neurons[ax.from], b = neurons[ax.to];
        const cl = clusters[a.clusterId];
        const { r, g, b: bl } = rgb(cl.color);
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.14;
        const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.14;
        const base = 0.05 + 0.14 * ((a.z + b.z) / 2);
        const alpha = base + ax.heat * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
        ctx.lineWidth = 0.5 + ax.heat * 1.4;
        ctx.stroke();
        ax.heat *= 0.92; // cool down
      }

      // travelling signals — comet head + soft glow
      for (const sig of signals) {
        const ax = axons[sig.axonIdx]; if (!ax) continue;
        const a = neurons[ax.from], b = neurons[ax.to];
        const t = sig.t;
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.14;
        const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.14;
        const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x;
        const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
        const { r, g, b: bl } = rgb(clusters[a.clusterId].color);
        const sg = ctx.createRadialGradient(px, py, 0, px, py, 9);
        sg.addColorStop(0, `rgba(${r},${g},${bl},0.95)`);
        sg.addColorStop(0.35, `rgba(${r},${g},${bl},0.35)`);
        sg.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fillStyle = sg; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.98)'; ctx.fill();
      }

      // soma — halo scales with depth, glow-breathe, and fire flash
      for (const n of neurons) {
        const { r, g, b: bl } = rgb(clusters[n.clusterId].color);
        const fire = n.fire > 0 ? n.fire : 0;
        const haloR = n.r * (3.4 + fire * 3);
        const gAlpha = 0.10 + n.glow * 0.20 + fire * 0.5;
        const sg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
        sg.addColorStop(0, `rgba(${r},${g},${bl},${gAlpha})`);
        sg.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.beginPath(); ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2); ctx.fillStyle = sg; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(255, r + fire * 120)},${Math.min(255, g + fire * 120)},${Math.min(255, bl + fire * 120)},${0.7 + fire * 0.3})`;
        ctx.fill();
      }

      requestAnimationFrame(draw);
    };
    // paint a solid base once so the fade-trail has something to fade from
    ctx.fillStyle = '#080914'; ctx.fillRect(0, 0, W, H);
    draw();
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.applyTheme('dark');
      this.startTyping();
    }
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08 });
    this.fadeEls.forEach(el => observer.observe(el.nativeElement));
    this.fadeEls.changes.subscribe((list: QueryList<ElementRef>) => {
      list.forEach(el => observer.observe(el.nativeElement));
    });

    // Knowledge graph — only start the animation loop once it is on screen,
    // and stop it again when it scrolls away, so it costs nothing otherwise.
    const kg = document.getElementById('kg-canvas');
    if (kg) {
      let started = false;
      const kgObs = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!started) { started = true; this.initGraph(); }
            else if (!this.gRaf) this.stepGraph();
          } else if (started) {
            this.stopGraph(); this.gRaf = 0;
          }
        }
      }, { threshold: 0.05 });
      kgObs.observe(kg);
    }

    // Animate stat counters when hero scrolls into view
    const heroEl = document.querySelector('.hero-stats');
    if (heroEl) {
      const statsObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !this.statsAnimated) {
          this.statsAnimated = true;
          this.animateCount(this.statTests,    637, 1400);
          this.animateCount(this.statAgents,    18,  900);
          this.animateCount(this.statProjects,   4,  600);
          this.animateCount(this.statYears,       4,  600);
        }
      }, { threshold: 0.5 });
      statsObs.observe(heroEl);
    }

    this.initFloatingGuide();
    this.initNeuralCanvas();

    // Trigger skill bars when the orbit section scrolls into view
    const skillsEl = document.querySelector('.skills-orbit-wrap');
    if (skillsEl) {
      const skillsObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) { this.skillsVisible.set(true); skillsObs.disconnect(); }
      }, { threshold: 0.2 });
      skillsObs.observe(skillsEl);
    }
  }

  private animateCount(sig: ReturnType<typeof signal<number>>, target: number, duration: number) {
    const steps = 40;
    const interval = duration / steps;
    let current = 0;
    const step = () => {
      current++;
      sig.set(Math.round((target * current) / steps));
      if (current < steps) setTimeout(step, interval);
    };
    setTimeout(step, interval);
  }

  toggleTheme() {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
  }

  private applyTheme(t: 'dark' | 'light') {
    this.theme.set(t);
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
    document.body.style.background = t === 'dark' ? '#09090b' : '#ffffff';
    document.body.style.color = t === 'dark' ? '#fafafa' : '#09090b';
    // Force chat panel to repaint with new CSS vars if open
    if (this.cbOpen()) {
      this.cbOpen.set(false);
      setTimeout(() => this.cbOpen.set(true), 10);
    }
  }

  @HostListener('window:scroll')
  onScroll() {
    const sy = window.scrollY;
    this.scrolled.set(sy > 40);
    // scroll progress bar
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress.set(docH > 0 ? Math.round((sy / docH) * 100) : 0);
    // back-to-top threshold
    this.showBackToTop.set(sy > document.documentElement.scrollHeight * 0.35);
    // active nav section
    const sections = ['story','opensource','skills','projects','by-numbers','experience','contact'];
    let current = '';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 100) current = id;
    }
    this.activeSection.set(current);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private startTyping() {
    const lines = this.typingLines;
    const tick = () => {
      const line = lines[this.li];
      if (!this.deleting) {
        this.ci++;
        this.typedText.set(line.slice(0, this.ci));
        if (this.ci === line.length) { this.deleting = true; setTimeout(tick, 2000); return; }
      } else {
        this.ci--;
        this.typedText.set(line.slice(0, this.ci));
        if (this.ci === 0) { this.deleting = false; this.li = (this.li + 1) % lines.length; }
      }
      setTimeout(tick, this.deleting ? 25 : 55);
    };
    tick();
  }

  getSkillIconUrl(icons: string[]): string {
    return `https://skillicons.dev/icons?i=${icons.join(',')}`;
  }

  // ── AARAV CHATBOT ─────────────────────────────────────────────────
  @ViewChild('cbScroll') cbScrollEl!: ElementRef;

  cbOpen    = signal(false);
  cbTyping  = signal(false);
  cbUnread  = signal(0);
  cbDraft   = '';
  cbMessages = signal<{ role: 'bot'|'user'; html: string; safeHtml?: SafeHtml; followups?: string[] }[]>([]);

  // Rate limit — 10 questions per session
  private readonly CB_LIMIT = 10;
  cbQCount  = signal(0);
  cbLimited = signal(false);

  // Session ID for log grouping
  private readonly _cbSession = Math.random().toString(36).slice(2, 10);

  // Track asked topics to detect rephrasing abuse
  private _cbAskedTopics = new Set<string>();

  private _cbGetTopic(q: string): string { return this.chatSvc.getTopic(q); }

  // Log webhook — replace with your Google Apps Script deployment URL
  private readonly _logUrl = 'https://script.google.com/macros/s/AKfycbzXfq_SmxwgQm-6z2TZBCky5UkGGWwERDGCw64uyWkpBIWAjg35Cef4UaeY09iaoYBuwA/exec';

  private _cbLog(question: string, answer: string, limitHit = false) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this._logUrl || this._logUrl.includes('PASTE_YOUR')) return;
    const payload = {
      session:   this._cbSession,
      qNum:      this.cbQCount(),
      question:  question.slice(0, 500),
      answer:    answer.replace(/<[^>]+>/g, ' ').slice(0, 300),
      limitHit,
      theme:     this.theme(),
      timestamp: new Date().toISOString(),
      ua:        navigator.userAgent.slice(0, 120),
    };
    const body = JSON.stringify(payload);
    const send = (attempt: number) => {
      fetch(this._logUrl, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, mode: 'no-cors' })
        .catch(() => { if (attempt < 2) setTimeout(() => send(attempt + 1), 1500 * attempt); });
    };
    send(1);
  }

  // Panel resize
  cbPanelW  = signal(380);
  cbPanelH  = signal(560);
  private _cbResizing = false;
  private _cbResizeStartX = 0;
  private _cbResizeStartY = 0;
  private _cbResizeStartW = 380;
  private _cbResizeStartH = 560;

  cbResizeStart(e: MouseEvent) {
    this._cbResizing = true;
    this._cbResizeStartX = e.clientX;
    this._cbResizeStartY = e.clientY;
    this._cbResizeStartW = this.cbPanelW();
    this._cbResizeStartH = this.cbPanelH();
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!this._cbResizing) return;
      const dw = this._cbResizeStartX - ev.clientX;
      const dh = this._cbResizeStartY - ev.clientY;
      this.cbPanelW.set(Math.max(300, Math.min(700, this._cbResizeStartW + dw)));
      this.cbPanelH.set(Math.max(360, Math.min(900, this._cbResizeStartH + dh)));
    };
    const onUp = () => {
      this._cbResizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  readonly cbQuickPrompts = [
    '👋 Who is Chandan?',
    '🚀 What projects did he build?',
    '🧠 How does LangGraph work here?',
    '📞 How to contact?',
  ];


  // Intent matching and follow-ups delegated to ChatService
  private _normalize(q: string): string { return this.chatSvc.normalize(q); }
  private _match(q: string): string     { return this.chatSvc.match(q); }
  private _followups(q: string): string[] { return this.chatSvc.followups(q); }


  cbToggle() {
    this.cbOpen.update(v => !v);
    if (this.cbOpen()) {
      this.cbUnread.set(0);
      this._cbResetSession();
    }
  }

  cbNewSession() {
    this._cbResetSession();
    setTimeout(() => this._scrollChat(), 50);
  }

  private _cbResetSession() {
    this.cbQCount.set(0);
    this.cbLimited.set(false);
    this._cbAskedTopics.clear();
    const greet = `Namaste! 👋 I'm <strong style="color:var(--cb-head-color)">Aarav</strong> — Chandan's AI guide.<br><br>` +
      `You have <strong style="color:var(--cb-head-color)">10 free questions</strong> this session. Ask anything about his skills, projects, career, or how to hire him!`;
    // Safe: greet is a hardcoded string — no user input involved
    this.cbMessages.set([{ role: 'bot', html: greet, safeHtml: this.sanitizer.bypassSecurityTrustHtml(greet) }]);
    setTimeout(() => this._scrollChat(), 50);
  }

  cbSend(text: string) {
    const q = (text || '').trim();
    if (!q || this.cbLimited()) return;
    this.cbDraft = '';

    // Topic-aware rate limit — rephrase of same topic doesn't cost extra question
    const topic = this._cbGetTopic(q);
    const isRephrase = this._cbAskedTopics.has(topic);
    if (!isRephrase) this._cbAskedTopics.add(topic);

    // Only count NEW topics against the limit
    const newCount = isRephrase ? this.cbQCount() : this.cbQCount() + 1;
    if (!isRephrase) this.cbQCount.set(newCount);

    if (newCount > this.CB_LIMIT) {
      this.cbLimited.set(true);
      this._cbLog(q, 'RATE_LIMIT_HIT', true);
      const limitHtml = `<div style="text-align:center;padding:0.5rem 0">
<div style="font-size:1.4rem;margin-bottom:0.5rem">🔒</div>
<div style="font-weight:800;color:var(--cb-text);font-size:0.9rem;margin-bottom:0.35rem">Session limit reached</div>
<div style="color:var(--cb-text2);font-size:0.78rem;margin-bottom:0.8rem">You've used all <strong style="color:var(--cb-head-color)">10 free questions</strong> this session.</div>
<div style="color:var(--cb-text2);font-size:0.78rem;margin-bottom:0.9rem">Want to know more? Reach Chandan directly:</div>
<a href="mailto:ravchandan15@gmail.com" style="display:inline-block;margin:0.2rem;padding:0.3rem 0.9rem;border-radius:6px;background:var(--cb-btn-bg);color:var(--cb-btn-color);font-size:0.75rem;font-weight:700;text-decoration:none;border:1px solid var(--cb-btn-border)">📧 Email Chandan</a>
<a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="display:inline-block;margin:0.2rem;padding:0.3rem 0.9rem;border-radius:6px;background:var(--cb-btn-bg);color:var(--cb-btn-color);font-size:0.75rem;font-weight:700;text-decoration:none;border:1px solid var(--cb-btn-border)">💼 LinkedIn</a>
</div>`;
      // Safe: limitHtml is a hardcoded template — q is only displayed as plain text in user bubble
      this.cbMessages.update(m => [...m, { role: 'user', html: q }, { role: 'bot', html: limitHtml, safeHtml: this.sanitizer.bypassSecurityTrustHtml(limitHtml) }]);
      setTimeout(() => this._scrollChat(), 50);
      return;
    }

    // Add user message
    this.cbMessages.update(m => [...m, { role: 'user', html: q }]);
    this.cbTyping.set(true);
    setTimeout(() => this._scrollChat(), 30);

    // Simulate thinking delay
    const delay = 400 + Math.random() * 500;
    setTimeout(() => {
      const reply = this._match(q);
      const followups = this.cbQCount() < this.CB_LIMIT ? this._followups(this._normalize(q)) : [];
      // Warn on question 8 — 2 left
      const remaining = this.CB_LIMIT - this.cbQCount();
      const warningHtml = remaining === 2
        ? `${reply}<div style="margin-top:0.6rem;padding:0.3rem 0.6rem;border-radius:6px;background:var(--cb-head-bg);border-left:3px solid #d97706;color:var(--cb-text);font-size:0.72rem;font-style:italic">⚠️ <strong style="color:var(--cb-head-color)">2 questions remaining</strong> in this session</div>`
        : remaining === 1
        ? `${reply}<div style="margin-top:0.6rem;padding:0.3rem 0.6rem;border-radius:6px;background:var(--cb-head-bg);border-left:3px solid #dc2626;color:var(--cb-text);font-size:0.72rem;font-style:italic">🔴 <strong style="color:var(--cb-head-color)">Last question</strong> in this session — make it count!</div>`
        : reply;
      const finalHtml = warningHtml;
      this.cbTyping.set(false);
      // Safe: finalHtml comes from ChatService hardcoded responses, never from raw user input
      this.cbMessages.update(m => [...m, { role: 'bot', html: finalHtml, safeHtml: this.sanitizer.bypassSecurityTrustHtml(finalHtml), followups }]);
      this._cbLog(q, reply);
      if (!this.cbOpen()) this.cbUnread.update(n => n + 1);
      setTimeout(() => this._scrollChat(), 50);
    }, delay);
  }

  private _scrollChat() {
    if (this.cbScrollEl?.nativeElement) {
      const el = this.cbScrollEl.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  // ── Interactive knowledge graph ────────────────────────────────────────────
  //  A small force-directed layout on a canvas: nodes repel each other, edges
  //  pull their endpoints together, and everything drifts back toward centre.
  //  Drag a node to pull the whole mesh around; hover to highlight neighbours.

  private gBodies: GraphBody[] = [];
  private gCtx: CanvasRenderingContext2D | null = null;
  private gCanvas: HTMLCanvasElement | null = null;
  private gRaf = 0;
  private gDrag: GraphBody | null = null;
  private gPointer = { x: -9999, y: -9999, down: false };
  private gHoverId: string | null = null;
  private gNeighbours = new Map<string, Set<string>>();

  private readonly G_COLORS: Record<GraphNode['kind'], string> = {
    system: '#a78bfa',  // purple — things I built
    tech:   '#22d3ee',  // cyan   — technologies
    oss:    '#34d399',  // green  — merged open source
    work:   '#fbbf24',  // amber  — experience
  };

  private initGraph() {
    const canvas = document.getElementById('kg-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.gCanvas = canvas;
    this.gCtx = canvas.getContext('2d');
    if (!this.gCtx) return;

    // adjacency, used for hover highlighting
    this.gNeighbours = new Map(this.graphNodes.map(n => [n.id, new Set<string>()]));
    for (const [a, b] of this.graphEdges) {
      this.gNeighbours.get(a)?.add(b);
      this.gNeighbours.get(b)?.add(a);
    }

    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    // seed on a circle so the layout unfolds outward rather than exploding
    this.gBodies = this.graphNodes.map((n, i) => {
      const a = (i / this.graphNodes.length) * Math.PI * 2;
      const spread = Math.min(rect.width, rect.height) * 0.32;
      return {
        ...n,
        x: cx + Math.cos(a) * spread + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(a) * spread + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0,
        r: n.kind === 'system' ? 13 : n.kind === 'oss' ? 11 : 10,
        pinned: false,
      };
    });

    this.resizeGraph();
    this.bindGraphEvents(canvas);
    this.graphReady.set(true);
    this.stepGraph();
  }

  private resizeGraph() {
    const canvas = this.gCanvas, ctx = this.gCtx;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private bindGraphEvents(canvas: HTMLCanvasElement) {
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // Generous grab radius, and when two nodes overlap pick the nearest one —
    // aiming at a 6px dot with a mouse is not a fair ask.
    const hit = (x: number, y: number) => {
      let best: GraphBody | null = null;
      let bestD = Infinity;
      for (const b of this.gBodies) {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < b.r + 22 && d < bestD) { bestD = d; best = b; }
      }
      return best;
    };

    canvas.addEventListener('pointermove', e => {
      const p = pos(e);
      this.gPointer.x = p.x; this.gPointer.y = p.y;
      if (this.gDrag) {
        this.gDrag.x = p.x; this.gDrag.y = p.y;
        this.gDrag.vx = 0; this.gDrag.vy = 0;
        return;
      }
      const h = hit(p.x, p.y);
      const id = h?.id ?? null;
      if (id !== this.gHoverId) {
        this.gHoverId = id;
        this.graphHover.set(h ? this.graphNodes.find(n => n.id === id) ?? null : null);
        canvas.style.cursor = h ? (h.url ? 'pointer' : 'grab') : 'default';
      }
    });

    canvas.addEventListener('pointerdown', e => {
      const p = pos(e);
      const h = hit(p.x, p.y);
      if (h) {
        this.gDrag = h; h.pinned = true;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
      }
    });

    const release = () => {
      if (this.gDrag) {
        // Stay where it was dropped rather than snapping back — the mesh
        // rearranges around it, which is the point of dragging.
        this.gDrag.vx = 0; this.gDrag.vy = 0;
        this.gDrag = null;
      }
      canvas.style.cursor = this.gHoverId ? 'grab' : 'default';
    };
    canvas.addEventListener('pointerup', e => {
      // a click without a drag on an OSS node opens the PR
      const p = pos(e);
      const h = hit(p.x, p.y);
      if (h?.url && this.gDrag === h) window.open(h.url, '_blank', 'noopener');
      release();
    });
    canvas.addEventListener('pointercancel', release);
    // Double-click anywhere releases every pinned node back into the layout.
    canvas.addEventListener('dblclick', () => {
      for (const b of this.gBodies) b.pinned = false;
    });
    canvas.addEventListener('pointerleave', () => {
      this.gPointer.x = -9999; this.gPointer.y = -9999;
      this.gHoverId = null; this.graphHover.set(null);
      release();
    });
    window.addEventListener('resize', () => this.resizeGraph());
  }

  private stepGraph() {
    const ctx = this.gCtx, canvas = this.gCanvas;
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const cx = W / 2, cy = H / 2;
    const byId = new Map(this.gBodies.map(b => [b.id, b]));

    // ---- forces ----
    for (const b of this.gBodies) {
      if (b.pinned) continue;
      // repulsion between every pair (n is small, so O(n²) is fine)
      for (const o of this.gBodies) {
        if (o === b) continue;
        let dx = b.x - o.x, dy = b.y - o.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 < 46000) {
          const f = 900 / d2;   // bigger nodes need more elbow room
          b.vx += dx * f; b.vy += dy * f;
        }
      }
      // gentle pull to centre keeps the mesh on screen
      b.vx += (cx - b.x) * 0.0016;
      b.vy += (cy - b.y) * 0.0016;
      // Nodes deliberately do NOT flee the cursor — they used to, which made
      // them almost impossible to grab. The mesh stays put so it can be aimed at.
    }
    // edge springs
    for (const [a, c] of this.graphEdges) {
      const A = byId.get(a), B = byId.get(c);
      if (!A || !B) continue;
      const dx = B.x - A.x, dy = B.y - A.y;
      const dist = Math.hypot(dx, dy) || 1;
      const f = (dist - 128) * 0.0055;
      const fx = dx / dist * f, fy = dy / dist * f;
      if (!A.pinned) { A.vx += fx; A.vy += fy; }
      if (!B.pinned) { B.vx -= fx; B.vy -= fy; }
    }
    // Integrate. Heavier damping than a typical force layout, plus a hard stop
    // below a threshold, so the mesh comes to rest and stays aimable instead of
    // jittering forever under the cursor.
    for (const b of this.gBodies) {
      if (b.pinned) continue;
      b.vx *= 0.78; b.vy *= 0.78;
      if (Math.abs(b.vx) < 0.02) b.vx = 0;
      if (Math.abs(b.vy) < 0.02) b.vy = 0;
      const max = 6;                        // no teleporting across the canvas
      b.vx = Math.max(-max, Math.min(max, b.vx));
      b.vy = Math.max(-max, Math.min(max, b.vy));
      b.x += b.vx; b.y += b.vy;
      const m = b.r + 6;
      b.x = Math.max(m, Math.min(W - m, b.x));
      b.y = Math.max(m, Math.min(H - m, b.y));
    }

    // ---- draw ----
    ctx.clearRect(0, 0, W, H);
    const hovered = this.gHoverId;
    const near = hovered ? this.gNeighbours.get(hovered) : null;

    for (const [a, c] of this.graphEdges) {
      const A = byId.get(a), B = byId.get(c);
      if (!A || !B) continue;
      const lit = !!hovered && (a === hovered || c === hovered);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = lit ? 'rgba(167,139,250,0.75)' : 'rgba(148,163,184,0.20)';
      ctx.lineWidth = lit ? 1.6 : 0.8;
      ctx.stroke();
    }

    for (const b of this.gBodies) {
      const isHover = b.id === hovered;
      const isNear = !!near?.has(b.id);
      const dim = !!hovered && !isHover && !isNear;
      const color = this.G_COLORS[b.kind];

      ctx.globalAlpha = dim ? 0.25 : 1;
      if (isHover || isNear) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + (isHover ? 14 : 6), 0, Math.PI * 2);
        ctx.fillStyle = color + '22';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // A crisp ring on the hovered node: shows exactly what a click will grab.
      if (isHover) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      // Pinned (being dragged) reads as solid white-cored.
      if (b.pinned) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      // labels: always for systems, on hover/neighbour for the rest
      if (b.kind === 'system' || isHover || isNear) {
        ctx.font = `${isHover ? 600 : 500} ${isHover ? 12 : 11}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = isHover ? color : 'rgba(203,213,225,0.92)';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x, b.y - b.r - 7);
      }
      ctx.globalAlpha = 1;
    }

    this.gRaf = requestAnimationFrame(() => this.stepGraph());
  }

  stopGraph() {
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
  }
}
