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
