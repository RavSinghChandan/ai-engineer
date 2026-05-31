import { Component, OnInit, signal, HostListener, ElementRef, QueryList, ViewChildren, AfterViewInit, PLATFORM_ID, Inject, ViewChild } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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

  // ── FLOATING GUIDE CHARACTER — AARAV ────────────────────────────
  fgVisible = signal(false);
  fgIntro   = signal(false);   // true only during the intro slide
  fgImg     = signal('guide-chandan-happy.svg');
  fgQuote   = signal('');
  fgSub     = signal('');
  fgEntry   = signal('from-bottom-left');

  private _fgTimer: any = null;
  private _fgSection = '';

  // Entry directions cycle per section so character always comes from a new corner
  private _fgDirs = ['from-left','from-right','from-top-left','from-top-right','from-bottom-left','from-bottom-right'];
  private _fgDirIdx = 0;

  private readonly _fgScript: Record<string, { img: string; quote: string; sub: string }[]> = {
    hero:       { img: 'guide-chandan-happy.svg',   quote: 'Right person! 😄',    sub: 'Ships. For real.' },
    skills:     { img: 'guide-chandan.svg',          quote: 'All in prod. 💪',     sub: 'Zero tutorials.' },
    projects:   { img: 'guide-chandan-wow.svg',      quote: '4 systems! 🤩',       sub: 'Click Live Demo ↗' },
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

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private sanitizer: DomSanitizer
  ) {}

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

  // Log webhook — replace with your Google Apps Script deployment URL
  private readonly _logUrl = 'https://script.google.com/macros/s/AKfycbzXfq_SmxwgQm-6z2TZBCky5UkGGWwERDGCw64uyWkpBIWAjg35Cef4UaeY09iaoYBuwA/exec';

  private _cbLog(question: string, answer: string, limitHit = false) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this._logUrl || this._logUrl.includes('PASTE_YOUR')) return;
    const payload = {
      session:  this._cbSession,
      qNum:     this.cbQCount(),
      question: question.slice(0, 500),
      answer:   answer.replace(/<[^>]+>/g, ' ').slice(0, 300),
      limitHit,
      ua:       navigator.userAgent.slice(0, 120),
    };
    // fire-and-forget, no await — never block the UI
    fetch(this._logUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      mode: 'no-cors',   // Google Apps Script doesn't need CORS preflight
    }).catch(() => {});  // silently ignore any network errors
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

  // ── Knowledge base ─────────────────────────────────────────────────
  private readonly _kb = {
    name:       'Chandan Kumar',
    alias:      'Rav',
    role:       'Senior AI Engineer',
    experience: '4+ years',
    location:   'India',
    email:      'ravchandan15@gmail.com',
    phone:      '+91 62909 09518',
    linkedin:   'https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/',
    github:     'https://github.com/RavSinghChandan',
    youtube:    'https://www.youtube.com/@aiwithrav',
    resume:     'AI_Engineer_Chandan_Kumar_4_Yrs.pdf',
    education:  'B.Tech Computer Science, Future Institute of Engineering & Management, Kolkata (2014–2018, CGPA 8.7). Masai School full-stack bootcamp.',
    story:      'Started as a mechanical engineer with no job offers. A friend\'s taunt — "you can\'t even spell console" — became the fuel. Joined Masai School bootcamp, outworked everyone, and self-built into a Senior AI Engineer. 637 tests. 4 production AI systems. Zero shortcuts.',
    skills:     'Python, FastAPI, LangChain, LangGraph, Multi-Agent Orchestration, RAG (FAISS+BM25+HyDE+CRAG), Kafka, Redis, Angular 17, TypeScript, Java, Spring Boot, Docker, AWS, JWT Auth, SQLite WAL, Guardrails G1–G5',
    currentJob: 'Senior Software Engineer at Infosys (Bank of America project) — Nov 2025 to Present. Designing LLM-integrated banking automation, Kafka pipelines, AI microservices.',
    companies:  'Infosys/Bank of America (current, Senior SWE), Nexsys/Accelya (2023–2025, SWE aviation), Texala (2023, SWE), Flyboard Ventures (2022–2023, SWE)',
    projects: [
      { name: 'Aura with Rav', desc: '360° Astro-Spiritual AI platform. 18+ agents, LangGraph, 23 Indian languages, 415 tests, G1–G5 guardrails, JWT multi-tenant.' },
      { name: 'Bench Resource Optimizer', desc: 'Enterprise HR AI — maps bench employees to open roles using Hybrid RAG (FAISS+BM25+HyDE+CRAG), circuit breaker, episodic memory, 222 tests.' },
      { name: 'Agentic Growth OS', desc: 'Autonomous marketing platform — 5 LangGraph agents, drag-and-drop canvas, auto-learning engine improves ROI 40–80% per run.' },
      { name: 'RunbookAI', desc: 'RAGless IT incident response — 22 runbooks, SQL+dependency graph, conflict detection between internal & official K8s docs, zero vectors.' },
    ],
    availability: 'Open to Senior AI Engineer roles. Responds fast. Reach out via email or LinkedIn.',
    testCount:  637,
    openToWork: true,
  };

  // ── Guardrail patterns (G1–G5) ────────────────────────────────────
  private readonly _guards = {
    // Word-bounded so "Chandan" doesn't match "DAN", "contact" doesn't match "act as"
    injection:  /\bignore\b.{0,30}\b(instructions?|prompt|system)\b|\bjailbreak\b|\bact\s+as\b|\bpretend\s+(you\s+are|to\s+be)\b|\bDAN\b|\bdo\s+anything\s+now\b|\boverride\b|\broleplay\s+as\b/i,
    harmful:    /\b(kill|hack|attack|exploit|bomb|violence|drug|weapon|suicide|self.harm|password|credentials)\b/i,
    pii:        /\b(ssn|aadhar|pan\s+card|credit\s+card|bank\s+account|\d{12}|\d{16})\b/i,
    offTopic:   /\b(politics|religion|sex|nude|porn|adult\s+content|racism|bitcoin|crypto\s+currency|stock\s+market|investment\s+advice)\b/i,
    nonsense:   /^(.)\1{9,}$|^[^a-zA-Z0-9\s?!.,'-]{5,}$/,
  };

  // ── Fuzzy normalizer — corrects common typos before intent matching ──
  private _normalize(raw: string): string {
    return raw
      .toLowerCase()
      // Project name typos
      .replace(/\bbnch\b|\bbench\s*resourc\w*/g, 'bench resource optimizer')
      .replace(/\baur[ae]\b|\baura\s*rav\b|\bauraa\b/g, 'aura with rav')
      .replace(/\bagen?ti[ck]\b|\bagentic\s*grwoth\b|\bagentic\s*groth\b/g, 'agentic growth os')
      .replace(/\brunboo?k\s*ai\b|\brunbookai\b/g, 'runbook ai')
      .replace(/\brunboo?k\b|\brunbok\b|\brun\s*book\b/g, 'runbook')
      // Tech typos
      .replace(/\blang\s*gra?ph\b|\blanggraph?\b|\blanggrph\b/g, 'langgraph')
      .replace(/\blang\s*chain\b|\blangchin\b/g, 'langchain')
      .replace(/\bfas\s*tapi\b|\bfasapi\b|\bfast\s*api\b/g, 'fastapi')
      .replace(/\bangul[ae]r\b/g, 'angular')
      .replace(/\bkafk[ae]\b/g, 'kafka')
      .replace(/\brai[ds]\b|\breddis\b/g, 'redis')
      .replace(/\bdoker\b|\bdokcer\b/g, 'docker')
      .replace(/\bkubernets\b|\bk8\b(?!s)/g, 'kubernetes')
      .replace(/\bpython\s*3?\b|\bpyhton\b|\bpytohn\b/g, 'python')
      // Common question typos
      .replace(/\bhwo\b|\bhw\b/g, 'how')
      .replace(/\bwaht\b|\bwath\b/g, 'what')
      .replace(/\bproejct\b|\bproect\b|\bporject\b/g, 'project')
      .replace(/\bimplment\b|\bimplmnt\b|\bimpelemnt\b/g, 'implement')
      .replace(/\bexplian\b|\bexplain\s*me\b/g, 'explain')
      .replace(/\barchitechture\b|\barchitecture\b/g, 'architecture')
      .replace(/\brepsoitory\b|\brepoisitory\b|\brepo\s*sitory\b/g, 'repository');
  }

  // ── Intent matching ───────────────────────────────────────────────
  private _match(q: string): string {
    const t = this._normalize(q);

    // Injection / jailbreak guard
    if (this._guards.injection.test(q))
      return `Namaste! 🙏 I'm Aarav, Chandan's professional assistant. I can only answer questions about Chandan Kumar's professional profile. How can I help you?`;

    // Harmful content guard
    if (this._guards.harmful.test(q))
      return `I appreciate you reaching out! I'm here to share Chandan's professional story. Could I tell you about his work in AI engineering instead? 😊`;

    // Off-topic guard
    if (this._guards.offTopic.test(q))
      return `Great question, but that's outside my area! I'm best at talking about Chandan — his skills, projects, and experience. What would you like to know? 🤔`;

    // PII guard
    if (this._guards.pii.test(q))
      return `I'm not able to process personal identification details. I can share Chandan's professional contact info though — would that help?`;

    // Nonsense guard
    if (this._guards.nonsense.test(q.trim()))
      return `Hmm, I didn't quite catch that! Try asking something like "What projects has Chandan built?" or "Is he available to hire?" 😄`;

    // ── Intents — ordered most-specific → most-general ───────────────

    // 0a. Demo intent — checked before everything
    if (/\b(demo|live\s*demo|see\s*(it|the|a)\s*(demo|app|live|project)|watch|preview|screenshot|show\s*(me\s*)?(the\s*)?(app|demo|live|project|screen))\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">▶️ Live Demos — 4 Projects</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🔮</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-01" style="color:var(--cb-link);font-weight:700;text-decoration:none">Aura with Rav ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 01 → click the <strong style="color:var(--cb-text)">Live Demo</strong> button</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🏢</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-02" style="color:var(--cb-link);font-weight:700;text-decoration:none">Bench Resource Optimizer ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 02 → click the <strong style="color:var(--cb-text)">Live Demo</strong> button</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📈</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-03" style="color:var(--cb-link);font-weight:700;text-decoration:none">Agentic Growth OS ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 03 → click the <strong style="color:var(--cb-text)">Live Demo</strong> button</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📖</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-04" style="color:var(--cb-link);font-weight:700;text-decoration:none">RunbookAI ↗</a> &nbsp;<a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#059669;font-size:0.7rem;font-weight:600;text-decoration:none">[Open Live App ↗]</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Jump to Project 04 on portfolio · or open the live deployed app</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic;margin-top:0.3rem">Projects 01–03: each shows step-by-step screenshots with Aarav guiding you. 🎬</div>`;

    // 0. Code / repo deep-dives — checked FIRST before any other intent
    const isCodeQ = /\b(code|how\s*(does|do|it|the)|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail|show\s*me)\b/i.test(t);

    if (isCodeQ && /\b(aura|aura\s*with\s*rav|astro.?intel|spiritual|vedic|numerolog|palmist|tarot|vastu|astrology)\b/i.test(t))
      return `<strong>Aura with Rav</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>astro-intel-backend/</strong><br>• <code>main.py</code> — FastAPI, JWT + Kafka consumer on startup<br>• <code>POST /api/v1/analysis/run</code> — trigger 18-agent LangGraph pipeline<br>• <code>POST /api/v1/analysis/submit</code> — async via Kafka<br>• <code>GET /api/v1/stream/{session_id}</code> — SSE live updates<br>• <code>GET /health</code> · <code>GET /metrics</code> · <code>GET /guardrails/stats</code><br>• LangGraph: normalize → 5 parallel domain agents → meta_consensus → remedy → admin_review<br><br>📁 <strong>astro-intel/</strong> (Angular 17)<br>• <code>pages/intake/</code> — 3-panel form · <code>components/agent-flow/</code> — live SVG neural graph<br>• <code>services/orchestrator.service.ts</code> — SSE + reactive signals<br><br>🔑 StateGraph, immutable state, conditional edges, <code>interrupt_before=["approve"]</code>.`;

    if (isCodeQ && /\b(bench|bench\s*resource|bench\s*optim|hr\s*ai|upload.?cv|map.?role|generate.?plan)\b/i.test(t))
      return `<strong>Bench Resource Optimizer</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>bench-resource-optimizer/backend/</strong><br>• <code>POST /upload-cv</code> — parse PDF, extract skills<br>• <code>POST /map-role</code> — FAISS + BM25 + RRF + HyDE + CRAG + cross-encoder hybrid RAG<br>• <code>POST /generate-plan/stream</code> — SSE streaming plan, TTFT &lt;1.5s<br>• <code>GET /memory/{user_id}</code> — episodic sessions + long-term facts (SQLite WAL)<br>• <code>GET /metrics</code> · <code>GET /ragas</code> · <code>GET /guardrails/stats</code><br>• <code>GET /health/ready</code> — checks LLM + FAISS + BM25 + SQLite<br><br>📁 <strong>bench-resource-optimizer/frontend/</strong> (Angular 17 + AG Grid)<br><br>🔑 Semantic cache L1 (exact &lt;1ms) → L2 (cosine ≥0.92) → LLM. 222 tests.<br><hr class="cb-divider"/><a href="#project-02" style="color:#fde68a;font-weight:700">↗ Jump to Bench on portfolio</a>`;

    if (isCodeQ && /\b(agentic|agentic\s*growth|growth\s*os|campaign\s*(agent|node|state)|audience\s*node|ad\s*copy|budget\s*node)\b/i.test(t))
      return `<strong>Agentic Growth OS</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>agentic-growth-os/backend/</strong><br>• <code>graph/state.py</code> — <code>CampaignState</code> TypedDict<br>• <code>graph/workflow.py</code> — LangGraph StateGraph definition<br>• <code>graph/nodes/</code> — audience → ad_copy → budget → campaign → performance<br>• <code>memory/campaign_memory.py</code> — keyword similarity match past campaigns<br>• <code>memory/campaign_store.json</code> — persistent run history<br>• <code>start.sh</code> — one-click startup<br><br>📁 <strong>agentic-growth-os/frontend/</strong> (Angular 17 + Tailwind)<br>• SVG drag-and-drop canvas, Dashboard, Learning Insights tabs<br><br>🔑 Each run stores decisions. Re-run retrieves closest campaign → applies improvements → logs ROI delta.<br><hr class="cb-divider"/><a href="#project-03" style="color:#67e8f9;font-weight:700">↗ Jump to Agentic on portfolio</a>`;

    if (isCodeQ && /\b(runbook|runbookai|ragless|networkx|dependency\s*graph|conflict\s*detect|kubectl|incident\s*response)\b/i.test(t))
      return `<strong>RunbookAI</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>runbook-ai/</strong><br>• <code>agents/</code> — classification, step extraction, validation, response composition<br>• <code>connectors/</code> — K8s docs scraper + conflict detector<br>• <code>database/</code> — SQLite: runbooks + steps with <code>depends_on</code> edges<br>• <code>graph/</code> — NetworkX DiGraph: topological sort → safe execution order<br>• <code>routers/</code> — <code>POST /api/query</code> · <code>POST /api/ingest</code> · <code>GET /api/runbooks</code><br><br>📁 <strong>runbook-ai/ui/</strong> (Angular 21) — 3-panel response + Execution Graph tab<br><br>🔑 RAGless — LLM runs ONCE at ingest. Query = pure SQL + graph. Zero hallucinated commands.<br><hr class="cb-divider"/><a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#86efac;font-weight:700">▶️ Open RunbookAI Live ↗</a> · <a href="#project-04" style="color:var(--purple-lt)">Jump to project ↗</a>`;

    if (isCodeQ && /\b(langgraph|stategraph|agent\s*(pipeline|flow|orchestrat)|campaign\s*state)\b/i.test(t))
      return `LangGraph pattern from the actual repo code:<br><br><pre><code>graph = StateGraph(CampaignState)\ngraph.add_node("audience",    audience_node)\ngraph.add_node("ad_copy",     ad_copy_node)\ngraph.add_node("budget",      budget_node)\ngraph.add_node("campaign",    campaign_node)\ngraph.add_node("performance", performance_node)\ngraph.add_edge(START, "audience")\napp = graph.compile()</code></pre><br>🔑 <code>CampaignState</code> TypedDict — immutable state merges per node<br>🔑 Conditional edges — <code>route_fn</code> reads state to pick next node<br>🔑 Parallel branches — <code>Send()</code> for simultaneous agents (Aura)<br>🔑 Human-in-the-loop — <code>interrupt_before=["approve"]</code><br><br>See <a href="https://github.com/RavSinghChandan/ai-engineer/tree/main/agentic-growth-os/backend/graph" target="_blank" style="color:var(--purple-lt)">agentic-growth-os/backend/graph/ ↗</a>`;

    // 1. Self-identity
    if (/\b(aarav|who are you|what are you|you a bot|are you (a |an )?(bot|ai|chatbot|assistant))\b/i.test(t))
      return `Namaste! 🙏 I'm <strong>Aarav</strong> — Chandan's AI assistant, built into this portfolio.<br>I know everything about his projects, skills, experience, and story. Ask me anything! 😄`;

    // 2. Greetings
    if (/^(hello|hi|hey|hi there|namaste|good\s*(morning|afternoon|evening)|how are you|sup|hola|greetings|howdy)[!?,.\s]*$/i.test(t)
        || /^(hi|hey|hello)\b/i.test(t))
      return `Namaste! 👋 I'm <strong>Aarav</strong>, Chandan's AI guide!<br><br>You can ask me about:<br>• His <strong>skills & tech stack</strong><br>• His <strong>4 production AI projects</strong><br>• His <strong>career & experience</strong><br>• Whether he's <strong>available to hire</strong><br>• His <strong>social profiles</strong> & contact<br><br>What would you like to know? 😊`;

    // 3. Appreciation
    if (/\b(thank(s| you)?|great (work|answer|job)|awesome|well done|impressive|perfect|excellent|brilliant)\b/i.test(t))
      return `Thank you so much! 😊 It means a lot. If you're thinking of hiring Chandan or want to know more — I'm right here!<br><br><a href="mailto:ravchandan15@gmail.com" style="color:var(--purple-lt)">Drop him a message ↗</a>`;

    // 4. Social media & contact profiles (very specific — check before generic contact)
    if (/\b(github|git\s*hub|open[\s-]source|code repo|repository|repositories)\b/i.test(t))
      return `🐙 <strong>GitHub: <a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--purple-lt)">github.com/RavSinghChandan ↗</a></strong><br><br>Find all 4 production AI projects here — Aura with Rav, Bench Resource Optimizer, Agentic Growth OS, and RunbookAI. All open source.`;

    if (/\b(linkedin|linked in|professional\s*profile|connect on)\b/i.test(t))
      return `💼 <strong>LinkedIn: <a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)">Rav Chandan Kumar Singh ↗</a></strong><br><br>4+ years of AI engineering, Infosys/Bank of America, production AI systems. Connect with him there!`;

    if (/\b(youtube|you\s*tube|videos?|channel|content|watch)\b/i.test(t))
      return `▶️ <strong>YouTube: <a href="https://www.youtube.com/@aiwithrav" target="_blank" style="color:var(--purple-lt)">@aiwithrav ↗</a></strong><br><br>Chandan shares AI engineering content, project walkthroughs, and learning journeys on his channel.`;

    if (/\b(social\s*media|social\s*profiles?|online\s*presence|find him online|profiles?)\b/i.test(t))
      return `Chandan's online presence:<br><br>🐙 <a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--purple-lt)"><strong>GitHub — RavSinghChandan ↗</strong></a><br>💼 <a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)"><strong>LinkedIn — Rav Chandan Kumar Singh ↗</strong></a><br>▶️ <a href="https://www.youtube.com/@aiwithrav" target="_blank" style="color:var(--purple-lt)"><strong>YouTube — @aiwithrav ↗</strong></a><br>📧 ravchandan15@gmail.com<br>📞 +91 62909 09518`;

    // 5. Contact details
    if (/\b(contact|email|phone|mobile|reach|connect|get in touch|message him|call him|write to)\b/i.test(t))
      return `<div style="margin:0 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">📬 Reach Chandan</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📧</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="mailto:ravchandan15@gmail.com" style="color:var(--cb-link);font-weight:700;text-decoration:none">ravchandan15@gmail.com</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📞</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="tel:+916290909518" style="color:var(--cb-link);font-weight:700;text-decoration:none">+91 62909 09518</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">💼</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--cb-link);font-weight:700;text-decoration:none">LinkedIn — Rav Chandan Kumar Singh ↗</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🐙</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--cb-link);font-weight:700;text-decoration:none">GitHub — RavSinghChandan ↗</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">▶️</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="https://www.youtube.com/@aiwithrav" target="_blank" style="color:var(--cb-link);font-weight:700;text-decoration:none">YouTube — @aiwithrav ↗</a></span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic">Responds fast — usually within hours! ⚡</div><a href="#contact" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid #0891b2;margin:0.2rem 0 0;text-decoration:none">↗ Go to Contact Section</a>`;

    // 6. Hiring (salary/ctc are NOT known — honest redirect to contact)
    if (/\b(salary|ctc|compensation|pay|package|remuneration|lpa)\b/i.test(t))
      return `I don't have details on Chandan's salary expectations — that's best discussed directly with him. 🙏<br><br>📧 <a href="mailto:ravchandan15@gmail.com" style="color:var(--purple-lt)">ravchandan15@gmail.com</a><br>📞 +91 62909 09518<br><br>He's open to Senior AI Engineer roles and responds fast!`;

    if (/\b(hire|available|open to work|recruit|interview|position|opportunit|notice period|join|remote|relocat|freelanc)\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">✅ Open to Senior AI Engineer Roles</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🌍</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Availability</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Remote and on-site · responds within hours</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📧</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="mailto:ravchandan15@gmail.com" style="color:#86efac">ravchandan15@gmail.com</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">💼</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:#86efac">LinkedIn ↗</a></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📞</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">+91 62909 09518</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><a href="AI_Engineer_Chandan_Kumar_4_Yrs.pdf" target="_blank" style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid #7c3aed;margin:0.2rem 0.2rem 0 0;text-decoration:none">📄 Download Resume</a><a href="#contact"  style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid #0891b2;margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ Contact Section</a>`;

    // 7. Resume
    if (/\b(resume|cv|download|pdf|curriculum)\b/i.test(t))
      return `📄 <a href="AI_Engineer_Chandan_Kumar_4_Yrs.pdf" target="_blank" style="color:var(--purple-lt)"><strong>Download Chandan's Resume →</strong></a><br><br>4 years of AI engineering. 637 tests. Zero shortcuts. All in one PDF.`;

    // 8. NOT-KNOWN (before broad identity to prevent hallucination)
    if (/\b(age|born|\bhow old\b|birth(day|date)?|married|family|hobbies|religion|caste|height|weight|masters?\s*degree|mba|phd|react\b|vue\b|flutter\b|swift\b|ios\b|android\b|google\b|amazon\b|microsoft\b|meta\b|facebook\b|apple\b|uber\b|flipkart\b|ola\b)\b/i.test(t))
      return `I don't have that information about Chandan — I only share what's verified. 🙏<br><br>For detailed discussions, reach him directly:<br>📧 <a href="mailto:ravchandan15@gmail.com" style="color:var(--purple-lt)">ravchandan15@gmail.com</a><br>💼 <a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)">LinkedIn ↗</a>`;

    // 9. Specific tech keywords (before broad "what is" catch)
    if (/\b(java\b|python\b|javascript\b|typescript\b|\bsql\b|langchain\b|langgraph\b|faiss\b|kafka\b|redis\b|angular\b|spring\s*boot|docker\b|kubernetes\b|\baws\b|fastapi\b|flask\b|openai\b|numpy\b|pandas\b|\bnlp\b|prompt\s*engineer|frontend|backend|database|databases)\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🤖 AI &amp; LLM Engineering</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Python</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">FastAPI</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">LangGraph</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">LangChain</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">OpenAI API</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🔍 Retrieval &amp; RAG</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">FAISS</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">BM25</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">HyDE</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">CRAG</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Cross-Encoder</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Semantic Cache</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">☕ Backend</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Java</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Spring Boot</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Kafka</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Redis</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">SSE Streaming</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#86efac">🅰️ Frontend &amp; Infra</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Angular 17</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">TypeScript</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Docker</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">AWS</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Kubernetes</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic;margin-top:0.3rem">All battle-tested in production. 637 tests. Zero shortcuts. 💪</div><a href="#skills"  style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid #7c3aed;margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ See Skills Section</a>`;

    // 10. Skills & tech (general)
    if (/\b(skills?|tech\s*stack|stack|languages?|frameworks?|tools?|technologies?|expertise|proficien|speciali[sz]|ai\s*tools?|ai\s*frameworks?)\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🤖 AI &amp; LLM Engineering</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Python</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">FastAPI</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">LangGraph</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">LangChain</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(124,58,237,0.1);color:#c4b5fd;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">OpenAI API</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🔍 Retrieval &amp; RAG</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">FAISS</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">BM25</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">HyDE</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">CRAG</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Cross-Encoder</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(6,182,212,0.1);color:#67e8f9;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Semantic Cache</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">☕ Backend</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Java</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Spring Boot</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Kafka</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Redis</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(245,158,11,0.1);color:#fde68a;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">SSE Streaming</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#86efac">🅰️ Frontend &amp; Infra</div><div style="margin:0.3rem 0 0.6rem"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Angular 17</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">TypeScript</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Docker</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">AWS</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(16,185,129,0.1);color:#86efac;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">Kubernetes</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic;margin-top:0.3rem">All battle-tested in production. 637 tests. Zero shortcuts. 💪</div><a href="#skills"  style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid #7c3aed;margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ See Skills Section</a>`;

    // 11. RunbookAI specific
    // RunbookAI code deep-dive (must be before general runbook catch)
    if (/\b(runbook|ragless|networkx|dag\b|depend(ency)?\s*graph|conflict\s*detect|kubectl|k8s\s*scraper|topological|incident\s*response)\b/i.test(t)
        && /\b(code|how|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail)\b/i.test(t))
      return `<strong>RunbookAI</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>runbook-ai/</strong><br>• <code>agents/</code> — classification, step extraction, validation, response composition<br>• <code>connectors/</code> — K8s docs scraper + conflict detector<br>• <code>database/</code> — SQLite: runbooks + steps with <code>depends_on</code> edges<br>• <code>graph/</code> — NetworkX DiGraph: topological sort → safe execution order<br>• <code>routers/</code> — <code>POST /api/query</code> · <code>POST /api/ingest</code> · <code>GET /api/runbooks</code><br><br>📁 <strong>runbook-ai/ui/</strong> (Angular 21)<br>• 3-panel: Internal (green) · Combined (purple) · Official (blue)<br>• Execution Graph tab — parallel steps visualised<br><br>🔑 RAGless — LLM runs ONCE at ingest. Query = pure SQL + graph. Zero hallucinated commands.<br><hr class="cb-divider"/><a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#86efac;font-weight:700">▶️ Open RunbookAI Live ↗</a> · <a href="#project-04" style="color:var(--purple-lt)">Jump to project ↗</a>`;

    if (/\b(runbook|incident|it\s*ops|sre|k8s|conflict\s*detect)\b/i.test(t))
      return `<strong>RunbookAI</strong> — Chandan's 4th production AI system.<br><br>🧠 RAGless architecture: SQL + dependency graph, zero vector embeddings<br>📚 22 runbooks (internal + official Kubernetes docs)<br>🔀 Conflict detection between internal & official K8s steps<br>🎯 3-panel incident response: Internal → Combined → Official<br><br><a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#86efac;font-weight:700">▶️ Open RunbookAI Live App ↗</a> · <a href="#project-04" style="color:var(--purple-lt)">See on portfolio ↗</a>`;

    // LangGraph implementation deep-dive (must be before general RAG/agent catch)
    if (/\b(langgraph|agent\s*(orchestrat|pipelin|system|framework))\b/i.test(t)
        && /\b(how\s*(does|do)|implement(ation)?|code|work|explain|detail|pattern|example)\b/i.test(t))
      return `LangGraph pattern from the actual repo code:<br><br><pre><code>graph = StateGraph(CampaignState)\ngraph.add_node("audience",    audience_node)\ngraph.add_node("ad_copy",     ad_copy_node)\ngraph.add_node("budget",      budget_node)\ngraph.add_node("campaign",    campaign_node)\ngraph.add_node("performance", performance_node)\ngraph.add_edge(START, "audience")\napp = graph.compile()</code></pre><br>🔑 <code>CampaignState</code> TypedDict — immutable state merges per node<br>🔑 Conditional edges — <code>route_fn</code> reads state to pick next node<br>🔑 Parallel branches — <code>Send()</code> for simultaneous agents (Aura)<br>🔑 Human-in-the-loop — <code>interrupt_before=["approve"]</code><br><br>See <a href="https://github.com/RavSinghChandan/ai-engineer/tree/main/agentic-growth-os/backend/graph" target="_blank" style="color:var(--purple-lt)">agentic-growth-os/backend/graph/ ↗</a>`;

    // 12. RAG / AI architecture specific
    if (/\b(rag\b|retrieval|vector\s*(db|search|embed)|faiss|bm25|hyde|crag|rerank|langgraph|multi.?agent|agent\s*(orchestrat|pipelin|system|framework))\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🔍 Hybrid RAG Stack</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📥</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Retrieval</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">FAISS (semantic) + BM25 (keyword) + RRF fusion</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">💡</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Query Expansion</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">HyDE + CRAG + multi-query reformulation</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🎯</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Reranking</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Cross-encoder — final precision pass before LLM</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🤖 Multi-Agent Orchestration</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🔗</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Framework: LangGraph StateGraph</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Immutable state · conditional edges · parallel Send()</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">⚡</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Scale</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">18+ agents in Aura · 5 agents in Bench &amp; Agentic</span></div><div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🛡️ Guardrails G1–G5</div><div style="margin:0.3rem 0"><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(239,68,68,0.1);color:#fca5a5;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">G1 Rate Limit</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(239,68,68,0.1);color:#fca5a5;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">G2 Injection</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(239,68,68,0.1);color:#fca5a5;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">G3 PII Filter</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(239,68,68,0.1);color:#fca5a5;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">G4 Faithfulness</span><span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:0.07rem 0.45rem;border-radius:999px;background:rgba(239,68,68,0.1);color:#fca5a5;margin:0.07rem 0.1rem;white-space:nowrap;vertical-align:middle">G5 Output</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic;margin-top:0.3rem"><strong style="color:var(--cb-text)">637 tests</strong> · mock LLM · 3.6s runtime · zero flakiness</div>`;

    // 13a. Code / architecture deep-dives — MUST be before general projects catch

    // Aura with Rav code
    if (/\b(aura\b|aura\s*with\s*rav|astro.?intel|spiritual|vedic|numerolog|palmist|tarot|vastu|astrology|18\s*agent|23\s*language)\b/i.test(t)
        && /\b(code|how|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail)\b/i.test(t))
      return `<strong>Aura with Rav</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>astro-intel-backend/</strong><br>• <code>main.py</code> — FastAPI, CORS for aurawithrav.com, JWT + Kafka consumer on startup<br>• <code>POST /api/v1/analysis/run</code> — trigger 18-agent LangGraph pipeline<br>• <code>POST /api/v1/analysis/submit</code> — async via Kafka<br>• <code>GET /api/v1/stream/{session_id}</code> — SSE live updates<br>• <code>GET /health</code> · <code>GET /metrics</code> · <code>GET /guardrails/stats</code><br>• LangGraph: normalize → 5 parallel domain agents → meta_consensus → remedy → admin_review<br><br>📁 <strong>astro-intel/</strong> (Angular 17)<br>• <code>pages/intake/</code> — 3-panel form · <code>components/agent-flow/</code> — live SVG neural graph<br>• <code>services/orchestrator.service.ts</code> — SSE + reactive signals<br><br>🔑 StateGraph, immutable state, conditional edges, <code>interrupt_before=["approve"]</code> for human review.`;

    // Bench Resource Optimizer code
    if (/\b(bench\s*resource|bench\s*optim|hr\s*ai|upload.?cv|map.?role|generate.?plan|episodic\s*mem|circuit\s*break)\b/i.test(t)
        && /\b(code|how|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail)\b/i.test(t))
      return `<strong>Bench Resource Optimizer</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>bench-resource-optimizer/backend/</strong><br>• <code>POST /upload-cv</code> — parse PDF, extract skills<br>• <code>POST /map-role</code> — FAISS + BM25 + RRF + HyDE + CRAG + cross-encoder hybrid RAG<br>• <code>POST /generate-plan/stream</code> — SSE streaming plan, TTFT &lt;1.5s<br>• <code>GET /memory/{user_id}</code> — episodic sessions + long-term facts (SQLite WAL)<br>• <code>GET /metrics</code> · <code>GET /ragas</code> · <code>GET /guardrails/stats</code><br>• <code>GET /health/ready</code> — checks LLM + FAISS + BM25 + SQLite<br><br>📁 <strong>bench-resource-optimizer/frontend/</strong> (Angular 17)<br>• AG Grid role tables, SSE EventSource for live streaming<br><br>🔑 Semantic cache L1 (exact &lt;1ms) → L2 (cosine ≥0.92) → LLM. 222 tests.<br><hr class="cb-divider"/><a href="#project-02" style="color:#fde68a;font-weight:700">↗ Jump to Bench on portfolio</a>`;

    // Agentic Growth OS code
    if (/\b(agentic\s*growth|growth\s*os|campaign\s*(agent|node|state)|audience\s*node|ad\s*copy|budget\s*node|performance\s*node)\b/i.test(t)
        && /\b(code|how|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail)\b/i.test(t))
      return `<strong>Agentic Growth OS</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>agentic-growth-os/backend/</strong><br>• <code>graph/state.py</code> — <code>CampaignState</code> TypedDict<br>• <code>graph/workflow.py</code> — LangGraph StateGraph<br>• <code>graph/nodes/</code> — audience_node → ad_copy_node → budget_node → campaign_node → performance_node<br>• <code>memory/campaign_memory.py</code> — keyword similarity match past campaigns<br>• <code>memory/campaign_store.json</code> — persistent run history<br>• <code>start.sh</code> — one-click startup<br><br>📁 <strong>agentic-growth-os/frontend/</strong> (Angular 17 + Tailwind)<br>• SVG drag-and-drop canvas, Dashboard tab, Learning Insights tab<br><br>🔑 Each run stores decisions. Re-run retrieves closest past campaign → applies improvements → logs ROI delta.<br><hr class="cb-divider"/><a href="#project-03" style="color:#67e8f9;font-weight:700">↗ Jump to Agentic on portfolio</a>`;

    // RunbookAI code
    if (/\b(runbook|ragless|networkx|dag\b|depend(ency)?\s*graph|conflict\s*detect|kubectl|k8s\s*scraper|topological|incident\s*response)\b/i.test(t)
        && /\b(code|how|work|architect|folder|file|struct|run|api|endpoint|explain|implement|backend|frontend|repo|detail)\b/i.test(t))
      return `<strong>RunbookAI</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>runbook-ai/</strong><br>• <code>agents/</code> — classification, step extraction, validation, response composition<br>• <code>connectors/</code> — K8s docs scraper + conflict detector<br>• <code>database/</code> — SQLite: runbooks + steps with <code>depends_on</code> edges<br>• <code>graph/</code> — NetworkX DiGraph: topological sort → safe execution order<br>• <code>routers/</code> — <code>POST /api/query</code> · <code>POST /api/ingest</code> · <code>GET /api/runbooks</code><br><br>📁 <strong>runbook-ai/ui/</strong> (Angular 21)<br>• 3-panel: Internal (green) · Combined (purple) · Official (blue)<br>• Execution Graph tab — parallel steps visualised<br><br>🔑 RAGless — LLM runs ONCE at ingest. Query = pure SQL + graph. Zero hallucinated commands.<br><hr class="cb-divider"/><a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#86efac;font-weight:700">▶️ Open RunbookAI Live ↗</a> · <a href="#project-04" style="color:var(--purple-lt)">Jump to project ↗</a>`;

    // How to run any project
    if (/\b(how\s*to\s*run|how\s*to\s*start|setup|install|clone|locally|get\s*it\s*running|run\s*(the\s*)?(project|server|app|backend|frontend)|which\s*port)\b/i.test(t))
      return `How to run Chandan's projects (from the repo):<br><br>🐳 <strong>One command (Docker)</strong><br><code>git clone https://github.com/RavSinghChandan/ai-engineer</code><br><code>docker-compose up --build</code><br><br>🔧 <strong>Backend (FastAPI)</strong><br><code>pip install -r requirements.txt</code><br><code>uvicorn main:app --reload --port 8080</code><br><br>🅰️ <strong>Frontend (Angular)</strong><br><code>npm install &amp;&amp; ng serve --port 4200</code><br><br>🧪 <strong>Tests</strong>: <code>pytest tests/ -v --tb=short</code><br><br>Every project has <code>README.md</code> + <code>.env.example</code> + <code>docker-compose.yml</code>.<br><a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">github.com/RavSinghChandan/ai-engineer ↗</a>`;

    // API endpoints
    if (/\b(api\s*(endpoint|route)|which\s*(api|route|endpoint)|what\s*(api|endpoint|route)|swagger|openapi)\b/i.test(t))
      return `Real API endpoints from the GitHub repo:<br><br>🔮 <strong>Aura with Rav</strong><br>• <code>POST /api/v1/analysis/run</code> — 18-agent pipeline<br>• <code>POST /api/v1/analysis/submit</code> — async via Kafka<br>• <code>GET /api/v1/stream/{session_id}</code> — SSE<br>• <code>GET /health</code> · <code>GET /metrics</code> · <code>GET /guardrails/stats</code><br><br>🏢 <strong>Bench Resource Optimizer</strong><br>• <code>POST /upload-cv</code> · <code>POST /map-role</code> · <code>POST /generate-plan/stream</code><br>• <code>GET /memory/{user_id}</code> · <code>GET /metrics</code> · <code>GET /ragas</code><br><br>📖 <strong>RunbookAI</strong><br>• <code>POST /api/query</code> · <code>POST /api/ingest</code> · <code>GET /api/runbooks</code><br><br>All FastAPI auto-docs at <code>/docs</code> when running locally.`;

    // LangGraph implementation
    if (/\b(how\s*(does|do)\s*(the\s*)?(langgraph|agent|pipeline|graph|flow)|implement(ation)?\s*(of\s*)?(langgraph|rag|guardrail|cache|circuit|memory|stream))\b/i.test(t))
      return `LangGraph pattern from the actual repo code:<br><br><pre><code>graph = StateGraph(CampaignState)\ngraph.add_node("audience",    audience_node)\ngraph.add_node("ad_copy",     ad_copy_node)\ngraph.add_node("budget",      budget_node)\ngraph.add_node("campaign",    campaign_node)\ngraph.add_node("performance", performance_node)\ngraph.add_edge(START, "audience")\napp = graph.compile()</code></pre><br>🔑 <code>CampaignState</code> TypedDict — immutable state merges per node<br>🔑 Conditional edges — <code>route_fn</code> reads state to pick next node<br>🔑 Parallel branches — <code>Send()</code> for simultaneous agents (Aura)<br>🔑 Human-in-the-loop — <code>interrupt_before=["approve"]</code><br><br>See <a href="https://github.com/RavSinghChandan/ai-engineer/tree/main/agentic-growth-os/backend/graph" target="_blank" style="color:var(--purple-lt)">agentic-growth-os/backend/graph/ ↗</a>`;

    // GitHub repo structure
    if (/\b(repo(sitory)?|source\s*code|where\s*is\s*(the\s*)?(code|repo)|codebase|open\s*source|show\s*(me\s*)?(the\s*)?code|folder\s*struct|file\s*struct)\b/i.test(t))
      return `All code is public on GitHub:<br><br>🐙 <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)"><strong>github.com/RavSinghChandan/ai-engineer ↗</strong></a><br><br>📁 <strong>Repo layout</strong>:<br>• <code>astro-intel/</code> + <code>astro-intel-backend/</code> — Aura with Rav<br>• <code>bench-resource-optimizer/</code> — HR AI platform<br>• <code>agentic-growth-os/</code> — autonomous marketing<br>• <code>runbook-ai/</code> — IT incident response<br>• <code>senior-ai-engineer/</code> — 12 interview prep modules<br>• <code>langchain_project/</code> + <code>langraph_project/</code> — RAG + agent demos<br>• <code>.github/workflows/</code> — CI/CD test → build → deploy to AWS ECS<br>• <code>docker-compose.yml</code> — one-command full stack<br><br>61 total repos. Each has <code>README.md</code> · <code>tests/</code> · <code>requirements.txt</code> · <code>.env.example</code>.`;

    // 13. Projects (general — includes "production AI systems")
    if (/\b(projects?|portfolio|built?\b|shipped?\b|developed|created\b|aura\b|bench\b|agentic\b|growth\s*os|runbookai|production\s*ai)\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">🚀 4 Production AI Systems</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🔮</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-01" style="color:var(--cb-link);font-weight:700;text-decoration:none">Aura with Rav ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">18+ agents · 23 Indian languages · 415 tests · G1-G5 guardrails</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🏢</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-02" style="color:var(--cb-link);font-weight:700;text-decoration:none">Bench Resource Optimizer ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">Hybrid RAG · circuit breaker · episodic memory · 222 tests</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📈</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-03" style="color:var(--cb-link);font-weight:700;text-decoration:none">Agentic Growth OS ↗</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">5 LangGraph agents · auto-learning engine · ROI lift 40–80%</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">📖</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem"><a href="#project-04" style="color:var(--cb-link);font-weight:700;text-decoration:none">RunbookAI ↗</a> &nbsp;<a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#059669;font-size:0.7rem;font-weight:600;text-decoration:none">[Live App ↗]</a></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem">RAGless · 22 runbooks · conflict detection · zero vectors</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><div style="color:var(--cb-text2);font-size:0.73rem;font-style:italic;margin-top:0.3rem">Click any project name above to jump to it or open the live app! 🤩</div>`;

    // 14. Testing / quality
    if (/\b(tests?\b|testing\b|guardrails?\b|quality\b|\bci\b|coverage\b|reliable\b|637\b|tdd\b)\b/i.test(t))
      return `<h3 class="h-green">📊 Test Coverage</h3>
<ul>
  <li>
    <span class="li-icon">✅</span>
    <span class="li-main"><strong>637 tests</strong> across all 4 AI systems</span>
    <span class="li-sub">3.6s full suite · zero external dependencies in CI</span>
  </li>
  <li>
    <span class="li-icon">🤖</span>
    <span class="li-main">Mock LLM strategy</span>
    <span class="li-sub">Tests pass without API keys — no flakiness</span>
  </li>
</ul>
<h3 class="h-red">🛡️ Production Guardrails</h3>
<ul>
  <li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G1</span> Rate Limiting</span><span class="li-sub">Per IP/user — blocks abuse before LLM is touched</span></li>
  <li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G2</span> Injection Detection</span><span class="li-sub">Scans every input — jailbreak patterns blocked</span></li>
  <li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G3</span> PII Filter</span><span class="li-sub">No personal data ever reaches the LLM</span></li>
  <li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G4</span> Faithfulness Gate</span><span class="li-sub">Output must be grounded in retrieved context</span></li>
  <li><span class="li-icon">🔴</span><span class="li-main"><span class="ct ct-r">G5</span> Output Validation</span><span class="li-sub">Final check before response is returned to user</span></li>
</ul>
<hr/>
<span class="fn"><em>Philosophy: test everything, shortcut nothing. 💪</em></span>`;

    // 15. Education (specific keywords — includes "when did he graduate")
    if (/\b(graduat|when\s*did\b|2018|2014|b\.?tech\b|bachelor\b|cgpa\b|gpa\b|future\s*institute|kolkata\b|masai\b|bootcamp\b|degree\b|qualif)\b/i.test(t))
      return `<h3 class="h-amber">🎓 Education</h3>
<ul>
  <li>
    <span class="li-icon">🏛️</span>
    <span class="li-main">B.Tech — Computer Science &amp; Engineering</span>
    <span class="li-sub"><em>Future Institute of Engineering &amp; Management, Kolkata</em><br>2014–2018 · <strong>CGPA: 8.7</strong></span>
  </li>
  <li>
    <span class="li-icon">🚀</span>
    <span class="li-main">Masai School</span>
    <span class="li-sub"><em>Full-Stack &amp; AI Bootcamp</em> — where the AI journey truly began</span>
  </li>
</ul>
<hr/>
<span class="fn">Mechanical engineer → CS bootcamp → 4 companies → Senior AI Engineer. <em>Self-made. ✨</em></span>`;

    // 16. Education (general)
    if (/\b(education\b|college\b|university\b|study\b|studied\b|school\b)\b/i.test(t))
      return `<h3 class="h-amber">🎓 Education</h3>
<ul>
  <li>
    <span class="li-icon">🏛️</span>
    <span class="li-main">B.Tech — Computer Science &amp; Engineering</span>
    <span class="li-sub"><em>Future Institute of Engineering &amp; Management, Kolkata</em><br>2014–2018 · <strong>CGPA: 8.7</strong></span>
  </li>
  <li>
    <span class="li-icon">🚀</span>
    <span class="li-main">Masai School</span>
    <span class="li-sub"><em>Full-Stack &amp; AI Bootcamp</em> — where the AI journey truly began</span>
  </li>
</ul>
<hr/>
<span class="fn">Mechanical engineer → CS bootcamp → 4 companies → Senior AI Engineer. <em>Self-made. ✨</em></span>`;

    // 17. Story / motivation / how he started
    if (/\b(?:story|journey|motivat|inspir|how (?:did|he)|why (?:did|he)|started?|began?|origin|background|mechanical|console|fuel|become|became|what drove)/i.test(t))
      return `A friend once said: <em>"You can't even spell console."</em><br><br>That taunt became the fuel. Chandan — a mechanical engineering graduate with no job offers — joined Masai School, outworked everyone quietly, and never stopped.<br><br>Today: <strong>637 tests · 4 AI systems · 0 shortcuts taken.</strong><br><br><a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="color:var(--purple-lt)">Connect on LinkedIn ↗</a> · <a href="https://github.com/RavSinghChandan" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a><hr class="cb-divider"/><a href="#story" style="color:#c4b5fd;font-weight:700">↗ Read the full story on portfolio</a> ✨`;

    // 18. Current role
    if (/\b(current(ly)?\b|present\b|today\b|now\s*(work|at)\b|where\s*(does|is)\s*he\s*work|senior\s*(engineer|developer|swe)\b)\b/i.test(t))
      return `Currently, Chandan is a <strong>Senior Software Engineer at Infosys</strong>, working on the Bank of America project (Nov 2025–Present, Pune).<br><br>He's designing LLM-integrated backend systems, Kafka-based AI pipelines, and event-driven microservices — improving banking workflow efficiency by 40%. 🚀`;

    // 19. Experience & career (general — includes "banking", "role at X", "work at X")
    if (/\b(experience\b|career\b|companies\b|jobs?\b|work(ed)?\s*(at|on|for)\b|timeline\b|accelya\b|nexsys\b|texala\b|flyboard\b|infosys\b|bank(ing)?\b|aviation\b|years?\s*of\b|role\s*at\b)\b/i.test(t))
      return `<div style="margin:0.9rem 0 0.5rem;padding:0.22rem 0.7rem;border-left:3px solid var(--cb-head-border);background:var(--cb-head-bg);border-radius:0 5px 5px 0;font-size:0.7rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--cb-head-color)">💼 Career Timeline — 4+ Years</div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🟣</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Infosys / Bank of America &nbsp;<span style="font-size:0.62rem;padding:0.05rem 0.4rem;border-radius:999px;background:var(--cb-chip-bg);color:var(--cb-chip-color)">Current</span></span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem"><em>Senior SWE · Nov 2025–Present · Pune</em><br>LLM banking automation · Kafka pipelines · <strong style="color:var(--cb-text)">40% efficiency gain</strong></span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🔵</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Nexsys / Accelya</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem"><em>SWE · Dec 2023–Nov 2025 · Mumbai</em><br>Aviation · 500K+ daily transactions · AI-ready architecture</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🟢</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Texala</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem"><em>SWE · Jul–Nov 2023 · Pune</em><br>Java / Spring Boot microservices</span></div><div style="display:grid;grid-template-columns:1.5rem 1fr;gap:0.2rem 0.5rem;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.95rem;line-height:1.5;color:inherit">🟡</span><span style="font-weight:700;color:var(--cb-text);font-size:0.82rem">Flyboard Ventures</span><span style="grid-column:2;color:var(--cb-text2);font-size:0.74rem;font-style:italic;line-height:1.45;margin-top:0.05rem"><em>SWE · Aug 2022–Jul 2023 · Chandigarh</em><br>Mobile app · healthcare · e-learning with AI/ML</span></div><div style="border-top:1px solid var(--cb-divider);margin:0.7rem 0"></div><a href="#experience"  style="display:inline-block;font-size:0.74rem;font-weight:700;padding:0.24rem 0.7rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);border:1px solid #d97706;margin:0.2rem 0.2rem 0 0;text-decoration:none">↗ See Full Timeline</a>`;

    // 20. Broad identity
    if (/\b(who is\s*(chandan|rav|he)\b|introduce\s*(chandan|him)\b|about\s*(chandan|rav)\b|chandan\s*kumar\b|what\s*does\s*(chandan|he)\s*(do|work)\b|is\s*(he|chandan)\s*an?\s*(ai|senior|software|engineer|developer)\b)\b/i.test(t))
      return `<h3 class="h-purple">👤 Chandan Kumar <em style="font-weight:400;color:#94a3b8;font-size:0.75rem">alias Rav</em></h3>
<ul>
  <li><span class="li-icon">💼</span><span class="li-main">Role</span><span class="li-sub">Senior AI Engineer · 4+ years</span></li>
  <li><span class="li-icon">🏢</span><span class="li-main">Currently</span><span class="li-sub">Infosys — Bank of America project · Pune</span></li>
  <li><span class="li-icon">🧠</span><span class="li-main">Speciality</span><span class="li-sub">Multi-agent orchestration · RAG pipelines · Production AI</span></li>
  <li><span class="li-icon">📊</span><span class="li-main">Track record</span><span class="li-sub"><strong>637 tests · 4 AI systems · zero shortcuts</strong></span></li>
</ul>
<hr/>
<a href="#projects" class="ca ca-p">↗ See His Projects</a>
<a href="#experience" class="ca ca-a">↗ Career Timeline</a>`;

    // 21a. Aura with Rav — code deep-dive (from github.com/RavSinghChandan/ai-engineer)
    if (/\b(aura\b|aura\s*with\s*rav|astro.?intel|spiritual|vedic|numerolog|palmist|tarot|vastu|astrology|18\s*agent|23\s*language)\b/i.test(t))
      return `<strong>Aura with Rav</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>astro-intel-backend/</strong><br>• <code>main.py</code> — FastAPI, CORS for aurawithrav.com, JWT + X-API-Key auth, Kafka consumer on startup<br>• <code>routers/</code> — <code>POST /api/v1/analysis/run</code> · <code>POST /api/v1/analysis/submit</code> (Kafka async) · <code>GET /api/v1/stream/{session_id}</code> (SSE)<br>• <code>routers/</code> — <code>GET /health</code> (Kafka+Redis status) · <code>GET /guardrails/stats</code> · <code>POST /guardrails/circuit-breaker/reset</code><br>• LangGraph pipeline: normalize → 5 parallel domain agents → meta_consensus → remedy → admin_review<br>• <code>GET /cache/stats</code> · <code>DELETE /cache/clear</code> · <code>GET /metrics</code> (admin only)<br><br>📁 <strong>astro-intel/</strong> (Angular 17)<br>• <code>pages/intake/</code> — 3-panel: birth profile + modules + live agent graph<br>• <code>components/agent-flow/</code> — SVG neural graph, 11 nodes, animated edges<br>• <code>services/orchestrator.service.ts</code> — SSE stream + reactive signals<br><br>🔑 <strong>Key pattern</strong>: LangGraph StateGraph — immutable state, conditional edges, parallel Send(). Human-in-the-loop via <code>interrupt_before=["approve"]</code>.`;

    // 21b. Bench Resource Optimizer — code deep-dive
    if (/\b(bench\s*resource|bench\s*optim|hr\s*ai|skill\s*(gap|match)|preparation\s*plan|circuit\s*break|episodic\s*mem|upload.?cv|map.?role|generate.?plan)\b/i.test(t))
      return `<strong>Bench Resource Optimizer</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>bench-resource-optimizer/backend/</strong><br>• <code>POST /upload-cv</code> — parse PDF, extract skills, store user profile<br>• <code>POST /map-role</code> — FAISS + BM25 + RRF + HyDE + CRAG + cross-encoder hybrid RAG<br>• <code>POST /generate-plan/stream</code> — SSE day-by-day plan, TTFT &lt;1.5s<br>• <code>POST /update-progress</code> — mark tasks, compute readiness score<br>• <code>GET /memory/{user_id}</code> — episodic sessions + long-term facts (SQLite WAL)<br>• <code>GET /metrics</code> — cache hit %, latency, token cost, RAGAS scores<br>• <code>GET /guardrails/stats</code> — live G1–G5 counters<br>• <code>GET /health/ready</code> — checks LLM + FAISS + BM25 + SQLite all live<br><br>📁 <strong>bench-resource-optimizer/frontend/</strong> (Angular 17)<br>• AG Grid role tables, SSE EventSource for streaming plan<br>• <code>FLOW.md</code> — full 3-step documented flow<br><br>🔑 <strong>Key pattern</strong>: Semantic cache L1 (exact, &lt;1ms) → L2 (cosine ≥0.92) → LLM. 222 tests, zero shortcuts.`;

    // 21c. Agentic Growth OS — code deep-dive
    if (/\b(agentic\s*growth|growth\s*os|marketing\s*(agent|workflow)|learning\s*engine|roi\s*(lift|improve)|campaign\s*(agent|node|state)|audience\s*node|ad\s*copy)\b/i.test(t))
      return `<strong>Agentic Growth OS</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>agentic-growth-os/backend/</strong><br>• <code>graph/state.py</code> — <code>CampaignState</code> TypedDict (shared state across all nodes)<br>• <code>graph/workflow.py</code> — LangGraph StateGraph definition<br>• <code>graph/nodes/audience_node.py</code> → <code>ad_copy_node.py</code> → <code>budget_node.py</code> → <code>campaign_node.py</code> → <code>performance_node.py</code><br>• <code>memory/campaign_memory.py</code> — keyword similarity match past campaigns<br>• <code>memory/campaign_store.json</code> — persistent run history<br>• <code>start.sh</code> — one-click startup for backend + frontend<br><br>📁 <strong>agentic-growth-os/frontend/</strong> (Angular 17 + Tailwind)<br>• SVG drag-and-drop canvas — nodes as circles, animated edges<br>• Dashboard tab — ROI metrics per run<br>• Learning Insights tab — auto-improvement log<br><br>🔑 <strong>Key pattern</strong>: Each run stores inputs + decisions. Re-run retrieves closest past campaign → applies rule-based improvements → logs ROI delta.<br><hr class="cb-divider"/><a href="#project-03" style="color:#67e8f9;font-weight:700">↗ Jump to Agentic on portfolio</a> Lifts 40–80% over baseline.`;

    // 21d. RunbookAI — code deep-dive
    if (/\b(runbook|ragless|networkx|dag\b|depend(ency|encies)\s*graph|conflict\s*detect|kubectl|k8s\s*scraper|topological|parallel\s*(group|step)|incident\s*response)\b/i.test(t))
      return `<strong>RunbookAI</strong> — real code from <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">GitHub ↗</a>:<br><br>📁 <strong>runbook-ai/</strong><br>• <code>agents/</code> — LLM agents: classification, step extraction, validation, response composition<br>• <code>connectors/</code> — K8s docs scraper (kubernetes/website GitHub raw markdown) + conflict detector<br>• <code>database/</code> — SQLite: runbooks table + steps table with <code>depends_on</code> edges<br>• <code>graph/</code> — NetworkX DiGraph: topological sort → safe execution order, parallel_groups calc<br>• <code>routers/</code> — <code>POST /api/query</code> (incident → 3-panel) · <code>POST /api/ingest</code> (PDF upload) · <code>GET /api/runbooks</code><br>• <code>utils/</code> — helper functions<br><br>📁 <strong>runbook-ai/ui/</strong> (Angular 21)<br>• 3-panel: Internal (green) · Combined (purple) · Official (blue)<br>• Execution Graph tab — parallel steps visualised<br>• Conflict flags with severity + recommendation<br><br>🔑 <strong>Key pattern</strong>: RAGless — LLM runs ONCE at ingest time. Query time = pure SQL + graph traversal. Zero hallucinated commands.<br><hr class="cb-divider"/><a href="https://portfolio-quyi2c8kj-ravsinghchandans-projects.vercel.app" target="_blank" style="color:#86efac;font-weight:700">▶️ Open RunbookAI Live ↗</a> · <a href="#project-04" style="color:var(--purple-lt)">Jump to project ↗</a>`;

    // 21e. How to run / setup
    if (/\b(how\s*to\s*run|how\s*to\s*start|setup|install|clone|locally|get\s*it\s*running|run\s*(the\s*)?(project|server|app|backend|frontend)|localhost|which\s*port)\b/i.test(t))
      return `How to run Chandan's projects (from the repo):<br><br>🐳 <strong>One command (Docker)</strong><br><code>git clone https://github.com/RavSinghChandan/ai-engineer</code><br><code>docker-compose up --build</code><br><br>🔧 <strong>Backend (FastAPI)</strong><br><code>pip install -r requirements.txt</code><br><code>uvicorn main:app --reload --port 8080</code><br><br>🅰️ <strong>Frontend (Angular)</strong><br><code>npm install && ng serve --port 4200</code><br><br>🧪 <strong>Tests</strong><br><code>pytest tests/ -v --tb=short</code><br><br>📄 Every project has a <code>README.md</code> and <code>.env.example</code>.<br>Full repo: <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)">github.com/RavSinghChandan/ai-engineer ↗</a>`;

    // 21f. API endpoints
    if (/\b(api\s*(endpoint|route)|endpoint|rest\s*api|swagger|openapi|which\s*(api|route)|what\s*(api|endpoint|route))\b/i.test(t))
      return `Real API endpoints from the GitHub repo:<br><br>🔮 <strong>Aura with Rav</strong> (<code>astro-intel-backend/</code>)<br>• <code>POST /api/v1/analysis/run</code> — trigger 18-agent pipeline<br>• <code>POST /api/v1/analysis/submit</code> — async via Kafka<br>• <code>GET  /api/v1/stream/{session_id}</code> — SSE live updates<br>• <code>GET  /health</code> · <code>GET /metrics</code> · <code>GET /guardrails/stats</code><br><br>🏢 <strong>Bench Resource Optimizer</strong><br>• <code>POST /upload-cv</code> · <code>POST /map-role</code> · <code>POST /generate-plan/stream</code><br>• <code>POST /update-progress</code> · <code>GET /memory/{user_id}</code><br>• <code>GET /metrics</code> · <code>GET /ragas</code> · <code>GET /guardrails/stats</code><br><br>📖 <strong>RunbookAI</strong><br>• <code>POST /api/query</code> · <code>POST /api/ingest</code> · <code>GET /api/runbooks</code><br><br>All FastAPI auto-docs at <code>/docs</code> when running locally.`;

    // 21g. LangGraph / implementation details
    if (/\b(how\s*(does|do)\s*(the\s*)?(langgraph|agent|pipeline|graph|flow)|implement(ation)?\s*(of\s*)?(langgraph|rag|guardrail|cache|kafka|stream|circuit|memory))\b/i.test(t))
      return `LangGraph pattern used across Chandan's projects (exact code from repo):<br><br><pre><code>graph = StateGraph(CampaignState)\ngraph.add_node("audience",   audience_node)\ngraph.add_node("ad_copy",    ad_copy_node)\ngraph.add_node("budget",     budget_node)\ngraph.add_node("campaign",   campaign_node)\ngraph.add_node("performance",performance_node)\ngraph.add_edge(START, "audience")\n# ... conditional edges\napp = graph.compile()</code></pre><br>🔑 <code>CampaignState</code> / <code>AgentState</code> — TypedDict, immutable merges<br>🔑 Conditional edges — <code>route_fn</code> reads state to pick next node<br>🔑 Parallel branches — <code>Send()</code> for simultaneous domain agents<br>🔑 Human-in-the-loop — <code>interrupt_before=["approve"]</code> in Aura<br><br>See <a href="https://github.com/RavSinghChandan/ai-engineer/tree/main/agentic-growth-os/backend/graph" target="_blank" style="color:var(--purple-lt)">agentic-growth-os/backend/graph/ ↗</a>`;

    // 21h. GitHub / repo structure
    if (/\b(repo(sitory)?|source\s*code|where\s*is\s*(the\s*)?(code|repo)|codebase|open\s*source|show\s*(me\s*)?(the\s*)?code|folder\s*struct|file\s*struct|director)\b/i.test(t))
      return `All code is public on GitHub:<br><br>🐙 <a href="https://github.com/RavSinghChandan/ai-engineer" target="_blank" style="color:var(--purple-lt)"><strong>github.com/RavSinghChandan/ai-engineer ↗</strong></a><br><br>📁 <strong>Repo layout</strong> (61 total repos):<br>• <code>astro-intel/</code> + <code>astro-intel-backend/</code> — Aura with Rav<br>• <code>bench-resource-optimizer/</code> — HR AI platform<br>• <code>agentic-growth-os/</code> — autonomous marketing<br>• <code>runbook-ai/</code> — IT incident response<br>• <code>senior-ai-engineer/</code> — 12 interview prep modules<br>• <code>langchain_project/</code> + <code>langraph_project/</code> — RAG + agent demos<br>• <code>.github/workflows/</code> — CI/CD (test → build → deploy to AWS ECS)<br>• <code>docker-compose.yml</code> — one-command full stack<br><br>Each project: <code>README.md</code> · <code>tests/</code> · <code>requirements.txt</code> · <code>.env.example</code>`;

    // 21. Off-topic / unknown (anything not matched above)
    if (/\b(cricket|sport|movie|song|music|travel|food|weather|capital|country|president|actor|celebrity|meaning\s*of\s*life|universe|space|planet|god|philosophy)\b/i.test(t))
      return `Ha! I'm not sure about that — it's outside my area. 😄 I only know about Chandan Kumar — his work, projects, and how to reach him. Try asking me something about him!`;

    // Default — honest fallback
    return `Hmm, I'm not sure about that one! 🤔<br><br>I'm best at questions about Chandan's <strong>skills, projects, experience, and contact</strong>. Try:<br>• "What projects has he built?"<br>• "Is he available to hire?"<br>• "What is his tech stack?"<br>• "How to contact him?"<br>• "Tell me his story"`;
  }

  // ── Follow-up suggestions — contextual to the answer just given ──────
  private _followups(q: string): string[] {
    const t = q.toLowerCase();

    // Demo
    if (/\b(demo|live\s*demo|see\s*(it|the|a)\s*(demo|app|live)|screenshot|preview)\b/i.test(t))
      return ['🔮 How does Aura with Rav work?', '🏢 Explain Bench Optimizer code', '📖 How does RunbookAI work?', '🚀 What projects has he built?'];

    // Identity / who is Chandan
    if (/\b(who is|about chandan|introduce|chandan kumar|what does he do)\b/i.test(t))
      return ['🚀 What projects has he built?', '💼 What companies has he worked at?', '🧠 What is his tech stack?', '📞 How can I hire him?'];

    // Skills / tech stack
    if (/\b(skill|tech stack|stack|language|framework|expertise)\b/i.test(t))
      return ['🔮 Show me a project using these skills', '🧠 How does LangGraph work in his code?', '🔍 What is his RAG implementation?', '📊 How many tests does he have?'];

    // Projects general
    if (/\b(project|portfolio|built|shipped|systems)\b/i.test(t))
      return ['🔮 How does Aura with Rav work?', '🏢 Explain the Bench Resource Optimizer', '📖 How does RunbookAI work?', '🚀 How does Agentic Growth OS work?'];

    // Aura with Rav
    if (/\b(aura|astro.?intel|spiritual|vedic|18\s*agent)\b/i.test(t))
      return ['🔑 What API endpoints does Aura have?', '🧠 How does LangGraph work in this?', '🛡️ What are the G1-G5 guardrails?', '▶️ Can I see a demo?'];

    // Bench Resource Optimizer
    if (/\b(bench|hr\s*ai|upload.?cv|map.?role|skill\s*gap)\b/i.test(t))
      return ['🔍 How does the hybrid RAG work?', '💾 How does episodic memory work?', '📡 How does SSE streaming work?', '🛡️ How is the circuit breaker implemented?'];

    // Agentic Growth OS
    if (/\b(agentic|growth\s*os|campaign|marketing|learning\s*engine)\b/i.test(t))
      return ['🔑 How does the learning engine improve ROI?', '🗂️ What is the folder structure?', '🧠 How is LangGraph used here?', '▶️ Can I see the demo?'];

    // RunbookAI
    if (/\b(runbook|runbook\s*ai|ragless|networkx|incident|conflict\s*detect|k8s)\b/i.test(t))
      return ['🔑 What APIs does RunbookAI expose?', '🗂️ Show me the folder structure', '🧠 How does the dependency graph work?', '▶️ Can I see the demo?'];

    // LangGraph / RAG / architecture
    if (/\b(langgraph|rag|retrieval|faiss|multi.?agent|stategraph)\b/i.test(t))
      return ['🔮 Show me Aura\'s LangGraph pipeline', '🏢 How is RAG used in Bench Optimizer?', '🛡️ How do guardrails work?', '📊 How many tests validate this?'];

    // API endpoints
    if (/\b(api|endpoint|route)\b/i.test(t))
      return ['🔮 Show me Aura\'s backend code', '🏢 Show me Bench Optimizer backend', '🐳 How do I run these APIs locally?', '📄 Where is the full repo?'];

    // How to run / setup
    if (/\b(run|setup|install|clone|docker|local)\b/i.test(t))
      return ['🐙 Where is the GitHub repo?', '🔮 What is the Aura project?', '🏢 What is Bench Resource Optimizer?', '📄 Can I download his resume?'];

    // GitHub / repo
    if (/\b(github|repo|source\s*code|folder|struct)\b/i.test(t))
      return ['🔮 How does Aura with Rav work?', '🏢 Explain Bench Optimizer code', '📖 How does RunbookAI work?', '🔑 What API endpoints exist?'];

    // Experience / career
    if (/\b(experience|career|company|infosys|nexsys|texala|flyboard|worked)\b/i.test(t))
      return ['💼 What is his current role?', '🎓 Where did he study?', '✨ What is his origin story?', '🚀 What AI projects did he build?'];

    // Current role
    if (/\b(current|present|infosys|bank\s*of\s*america)\b/i.test(t))
      return ['💼 What companies has he worked at?', '🚀 What projects has he built?', '📞 How can I hire him?', '📄 Download his resume'];

    // Education
    if (/\b(education|college|degree|masai|b\.?tech|cgpa)\b/i.test(t))
      return ['✨ What is his origin story?', '💼 Where does he work now?', '🧠 What is his tech stack?', '🚀 What projects did he build?'];

    // Story / motivation
    if (/\b(story|journey|motivat|mechanical|console|fuel|origin)\b/i.test(t))
      return ['💼 Where does he work now?', '🚀 What AI systems did he build?', '🎓 What is his educational background?', '📞 How to reach him?'];

    // Contact / hire
    if (/\b(contact|email|hire|available|recruit|linkedin|github|youtube|resume)\b/i.test(t))
      return ['🚀 What projects has he built?', '💼 What is his current role?', '🧠 What is his tech stack?', '✨ What is his story?'];

    // Testing / guardrails
    if (/\b(test|guardrail|637|quality|ci)\b/i.test(t))
      return ['🛡️ How do G1-G5 guardrails work?', '📊 How is RAG quality measured?', '🏢 Show me Bench Optimizer tests', '🔮 Show me Aura test suite'];

    // Default fallback suggestions
    return ['🚀 What projects has he built?', '🧠 What is his tech stack?', '💼 Is he available to hire?', '✨ What is his story?'];
  }

  cbToggle() {
    this.cbOpen.update(v => !v);
    if (this.cbOpen()) {
      this.cbUnread.set(0);
      // Reset session on every open
      this.cbQCount.set(0);
      this.cbLimited.set(false);
      const greet = `Namaste! 🙏 I'm <strong>Aarav</strong> — Chandan's AI assistant.<br>Ask me anything about his skills, projects, experience, or how to hire him!`;
      this.cbMessages.set([{ role: 'bot', html: greet, safeHtml: this.sanitizer.bypassSecurityTrustHtml(greet) }]);
      setTimeout(() => this._scrollChat(), 50);
    }
  }

  cbSend(text: string) {
    const q = (text || '').trim();
    if (!q || this.cbLimited()) return;
    this.cbDraft = '';

    // Check rate limit
    const newCount = this.cbQCount() + 1;
    this.cbQCount.set(newCount);

    if (newCount > this.CB_LIMIT) {
      this.cbLimited.set(true);
      this._cbLog(q, 'RATE_LIMIT_HIT', true);
      const limitHtml = `<div style="text-align:center;padding:0.5rem 0">
<div style="font-size:1.4rem;margin-bottom:0.5rem">🔒</div>
<div style="font-weight:800;color:#f1f5f9;font-size:0.9rem;margin-bottom:0.35rem">Session limit reached</div>
<div style="color:#94a3b8;font-size:0.78rem;margin-bottom:0.8rem">You've used all <strong style="color:var(--cb-head-color)">10 free questions</strong> for this session.</div>
<div style="color:#94a3b8;font-size:0.78rem;margin-bottom:0.9rem">Want to know more about Chandan? Reach him directly:</div>
<a href="mailto:ravchandan15@gmail.com" style="display:inline-block;margin:0.2rem;padding:0.3rem 0.9rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);font-size:0.75rem;font-weight:700;text-decoration:none">📧 Email Chandan</a>
<a href="https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/" target="_blank" style="display:inline-block;margin:0.2rem;padding:0.3rem 0.9rem;border-radius:6px;background:var(--cb-chip-bg);color:var(--cb-chip-color);font-size:0.75rem;font-weight:700;text-decoration:none">💼 LinkedIn</a>
<div style="margin-top:0.75rem;color:#64748b;font-size:0.7rem;font-style:italic">Close &amp; reopen chat to start a new session</div>
</div>`;
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
        ? `${reply}<div style="margin-top:0.6rem;padding:0.3rem 0.6rem;border-radius:6px;background:rgba(245,158,11,0.12);border-left:3px solid #d97706;color:#fde68a;font-size:0.72rem;font-style:italic">⚠️ <strong style="color:#fde68a">2 questions remaining</strong> in this session</div>`
        : remaining === 1
        ? `${reply}<div style="margin-top:0.6rem;padding:0.3rem 0.6rem;border-radius:6px;background:rgba(239,68,68,0.12);border-left:3px solid #dc2626;color:#fca5a5;font-size:0.72rem;font-style:italic">🔴 <strong style="color:#fca5a5">Last question</strong> in this session</div>`
        : reply;
      const finalHtml = warningHtml;
      this.cbTyping.set(false);
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
}
