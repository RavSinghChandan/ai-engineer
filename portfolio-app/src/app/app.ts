import { Component, OnInit, signal, HostListener, ElementRef, QueryList, ViewChildren, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, AfterViewInit {

  theme = signal<'dark' | 'light'>('dark');
  typedText = signal('');
  scrolled = signal(false);
  mobileNavOpen = signal(false);

  toggleMobileNav() { this.mobileNavOpen.update(v => !v); }
  closeMobileNav() { this.mobileNavOpen.set(false); }

  // PDF resume — user to replace with actual hosted PDF URL
  readonly RESUME_PDF = 'AI_Engineer_Chandan_Kumar_4_Yrs.pdf';

  // Your photo
  readonly PHOTO = 'https://i.imgur.com/placeholder.jpg'; // replace with imgur link

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
      num: '04', accent: 'green',
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
  ];

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
    if (e.key === 'Escape')     this.closeDemo();
    if (e.key === 'ArrowRight') this.demoNext();
    if (e.key === 'ArrowLeft')  this.demoPrev();
  }

  // ── ANIMATED STAT COUNTERS ───────────────────────────────────────
  statTests  = signal(0);
  statAgents = signal(0);
  statProjects = signal(0);
  statYears  = signal(0);
  private statsAnimated = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const saved = (localStorage.getItem('ck-theme') as 'dark' | 'light') || 'dark';
      this.applyTheme(saved);
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
    if (isPlatformBrowser(this.platformId)) localStorage.setItem('ck-theme', next);
  }

  private applyTheme(t: 'dark' | 'light') {
    this.theme.set(t);
    // Set on BOTH html and body so CSS selectors always match
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
    document.body.style.background = t === 'dark' ? '#09090b' : '#ffffff';
    document.body.style.color = t === 'dark' ? '#fafafa' : '#09090b';
  }

  @HostListener('window:scroll')
  onScroll() { this.scrolled.set(window.scrollY > 40); }

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
}
