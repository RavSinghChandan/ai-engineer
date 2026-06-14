import { Component, OnInit, signal, HostListener, ElementRef, QueryList, ViewChildren, AfterViewInit, PLATFORM_ID, Inject, ViewChild, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService } from './chat.service';

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
  scrollProgress = signal(0);
  activeSection = signal('');
  showBackToTop = signal(false);

  toggleMobileNav() { this.mobileNavOpen.update(v => !v); }
  closeMobileNav() { this.mobileNavOpen.set(false); }

  @ViewChildren('fadeEl') fadeEls!: QueryList<ElementRef>;

  private typingLines = [
    'AI Agents that work while you sleep',
    'RAG Systems powered by your own data',
    'Business Automation at enterprise scale',
    'LLM Applications built for production',
    'AI Transformation — end to end, zero shortcuts',
  ];
  private li = 0; private ci = 0; private deleting = false;

  // ── Animated stat counters ────────────────────────────────────────
  statClients   = signal(0);
  statAutomated = signal(0);
  statAgents    = signal(0);
  statROI       = signal(0);
  private statsAnimated = false;

  private readonly chatSvc = inject(ChatService);

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private sanitizer: DomSanitizer
  ) {}

  safeIcon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  // ── Services ──────────────────────────────────────────────────────
  services = [
    {
      icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="2"/><path d="M24 6v4M24 38v4M6 24h4M38 24h4M10.9 10.9l2.8 2.8M34.3 34.3l2.8 2.8M10.9 37.1l2.8-2.8M34.3 13.7l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.7"/></svg>`,
      title: 'AI Audit & Roadmap',
      color: 'purple',
      desc: 'Identify every automation opportunity in your business with a structured AI readiness assessment and prioritised roadmap.',
      points: ['Process mapping & gap analysis', 'ROI opportunity sizing', 'AI readiness score', 'Prioritised 90-day roadmap'],
    },
    {
      icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="14" width="32" height="20" rx="3" stroke="currentColor" stroke-width="2"/><path d="M16 24h16M24 18v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 34l4 6M40 34l-4 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/></svg>`,
      title: 'AI Automation',
      color: 'cyan',
      desc: 'Automate repetitive workflows using AI — reclaim hours every day, eliminate human error, and scale without headcount.',
      points: ['Document processing pipelines', 'Email & report automation', 'Data extraction at scale', 'Workflow orchestration'],
    },
    {
      icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="10" width="20" height="16" rx="3" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="18" r="2" fill="currentColor"/><circle cx="28" cy="18" r="2" fill="currentColor"/><path d="M14 26l-4 4H10v6h6v-3l4-3M34 26l4 4h4v6h-6v-3l-4-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/></svg>`,
      title: 'AI Agents',
      color: 'amber',
      desc: 'Deploy intelligent agents for customer support, lead qualification, HR queries, and internal operations — running 24/7.',
      points: ['24/7 customer support agents', 'Lead qualification bots', 'Internal HR & IT assistants', 'Sales automation agents'],
    },
    {
      icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="24" cy="12" rx="14" ry="5" stroke="currentColor" stroke-width="2"/><path d="M10 12v12c0 2.76 6.27 5 14 5s14-2.24 14-5V12" stroke="currentColor" stroke-width="2"/><path d="M10 24v8c0 2.76 6.27 5 14 5s14-2.24 14-5v-8" stroke="currentColor" stroke-width="2"/><line x1="24" y1="7" x2="24" y2="37" stroke="currentColor" stroke-width="1" opacity="0.4"/></svg>`,
      title: 'RAG Systems',
      color: 'green',
      desc: 'Build enterprise knowledge assistants powered by your own company data, documents, and internal knowledge bases.',
      points: ['Document ingestion pipelines', 'Hybrid FAISS + BM25 retrieval', 'Q&A over internal knowledge', 'Zero hallucination guardrails'],
    },
    {
      icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 4L38 10v14c0 8-6 14-14 18C16 38 10 32 10 24V10L24 4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M18 24l4 4 8-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      title: 'AI Transformation',
      color: 'red',
      desc: 'End-to-end AI adoption consulting — strategy, implementation, team training, change management, and ongoing support.',
      points: ['Executive AI strategy workshops', 'Team upskilling programmes', 'Change management support', 'AI governance framework'],
    },
    {
      icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="8" width="36" height="28" rx="3" stroke="currentColor" stroke-width="2"/><rect x="6" y="8" width="36" height="8" rx="3" fill="currentColor" opacity="0.15"/><rect x="12" y="22" width="8" height="8" rx="1" fill="currentColor" opacity="0.5"/><rect x="24" y="22" width="14" height="2" rx="1" fill="currentColor" opacity="0.4"/><rect x="24" y="26" width="10" height="2" rx="1" fill="currentColor" opacity="0.3"/><path d="M16 40v4M32 40v4M10 44h28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/></svg>`,
      title: 'LLM Applications',
      color: 'blue',
      desc: 'Custom LLM-powered applications — from proposal generators to intelligent dashboards and search systems.',
      points: ['Proposal generation systems', 'Content creation pipelines', 'Intelligent search & discovery', 'Custom AI chat interfaces'],
    },
  ];

  // ── AI Solutions ──────────────────────────────────────────────────
  solutions = [
    {
      num: '01', accent: 'purple',
      title: 'Lead Qualification Agent',
      subtitle: 'Never waste time on unqualified leads again',
      desc: 'An AI agent that engages every inbound lead 24/7, asks qualifying questions, scores leads by fit, and routes hot prospects directly to your sales team — all automatically.',
      outcome: '80% reduction in time spent on unqualified leads',
      tags: [
        { label: 'AI Agent', cls: 'tag-purple' }, { label: 'LangGraph', cls: 'tag-purple' },
        { label: 'CRM Integration', cls: 'tag-cyan' }, { label: '24/7 Automation', cls: 'tag-green' },
      ],
      challenges: [
        { p: 'Sales team spending 70% of time on unqualified leads', s: 'AI agent pre-qualifies every lead using BANT criteria before any human involvement' },
        { p: 'Leads going cold during off-hours', s: '24/7 AI engagement — responds in seconds, any timezone, any device' },
        { p: 'Inconsistent qualification questions across reps', s: 'Standardised AI-driven qualification flow, consistent every single time' },
      ],
    },
    {
      num: '02', accent: 'amber',
      title: 'Proposal Generation System',
      subtitle: 'From brief to proposal in 90 seconds',
      desc: 'Upload a client brief, select a template, and let AI generate a fully customised professional proposal — pulling from your pricing, case studies, and service descriptions automatically.',
      outcome: '90% reduction in proposal creation time',
      tags: [
        { label: 'RAG System', cls: 'tag-amber' }, { label: 'Document AI', cls: 'tag-amber' },
        { label: 'PDF Generation', cls: 'tag-cyan' }, { label: 'Template Engine', cls: 'tag-green' },
      ],
      challenges: [
        { p: 'Proposals taking 4–8 hours to write from scratch', s: 'RAG pulls relevant case studies, pricing, and service details automatically' },
        { p: 'Inconsistent quality and missed upsell opportunities', s: 'AI always includes the optimal service mix based on client brief analysis' },
        { p: 'Reformatting for different client types manually', s: 'Template-aware generation — different styles for different industries' },
      ],
    },
    {
      num: '03', accent: 'cyan',
      title: 'Internal Knowledge Assistant',
      subtitle: 'Your company brain — always available',
      desc: 'A RAG-powered AI assistant trained on your SOPs, policies, product docs, and internal wikis. Staff get instant accurate answers instead of hunting through folders or asking colleagues.',
      outcome: '60% reduction in internal support queries',
      tags: [
        { label: 'RAG System', cls: 'tag-cyan' }, { label: 'FAISS + BM25', cls: 'tag-cyan' },
        { label: 'Slack Integration', cls: 'tag-purple' }, { label: 'Zero Hallucination', cls: 'tag-green' },
      ],
      challenges: [
        { p: 'Staff spending 2+ hours/day searching for internal information', s: 'AI searches all docs instantly, returns precise answers with source citations' },
        { p: 'Knowledge locked in the heads of senior employees', s: 'Systematic knowledge extraction and embedding into searchable AI system' },
        { p: 'Onboarding new staff takes weeks', s: 'New staff get instant answers to any process question, 24/7' },
      ],
    },
    {
      num: '04', accent: 'green',
      title: 'Document Processing Automation',
      subtitle: 'Invoices, contracts, forms — processed in milliseconds',
      desc: 'Upload any document type — invoice, contract, application form — and AI extracts structured data, validates it, and pushes it directly into your systems of record.',
      outcome: '95% faster document processing, near-zero errors',
      tags: [
        { label: 'Document AI', cls: 'tag-green' }, { label: 'OCR + LLM', cls: 'tag-green' },
        { label: 'API Integration', cls: 'tag-cyan' }, { label: 'Validation Pipeline', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'Manual data entry from documents taking hours per day', s: 'AI extracts all fields in milliseconds with 99%+ accuracy' },
        { p: 'Errors from manual entry causing downstream issues', s: 'Multi-layer validation — schema check, business rule check, anomaly detection' },
        { p: 'Different document formats require different handling', s: 'LLM-based extraction handles any format without template rules' },
      ],
    },
  ];

  // ── Proof stats ───────────────────────────────────────────────────
  readonly proofStats = [
    {
      stat: '90%',
      title: 'Proposal time cut.',
      sub: 'From 6 hours to 35 minutes. Same quality, fraction of the time.',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 8v16l8 5" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" opacity="0.3"/></svg>`,
    },
    {
      stat: '80%',
      title: 'Lead qualification automated.',
      sub: 'Sales team focuses only on hot leads. Pipeline velocity 3× faster.',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="14" r="6" stroke="#06b6d4" stroke-width="2"/><circle cx="12" cy="34" r="5" stroke="#a78bfa" stroke-width="2"/><circle cx="36" cy="34" r="5" stroke="#10b981" stroke-width="2"/><path d="M24 20v6M18 30l-4 2M30 30l4 2" stroke="currentColor" stroke-width="1.5" opacity="0.5"/></svg>`,
    },
    {
      stat: '24/7',
      title: 'AI agents working.',
      sub: 'Customer support, lead handling, knowledge queries — all automated around the clock.',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" opacity="0.3"/><path d="M24 12v12l6 6" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    },
    {
      stat: '60%',
      title: 'Cost reduction achieved.',
      sub: 'AI replaces repetitive manual tasks — same output, fraction of the cost.',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 6L28 18L40 18L30 26L34 38L24 30L14 38L18 26L8 18L20 18Z" stroke="#f59e0b" stroke-width="2" fill="rgba(245,158,11,0.1)"/></svg>`,
    },
    {
      stat: '3×',
      title: 'Faster client onboarding.',
      sub: 'AI-powered knowledge base cuts onboarding from weeks to days.',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 38V18l12-10 12 10v20" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="20" y="28" width="8" height="10" stroke="currentColor" stroke-width="1.5"/></svg>`,
    },
    {
      stat: 'G1–G5',
      title: 'Guardrails on every AI output.',
      sub: 'Rate limit · injection detection · PII filter · faithfulness gate · output validation.',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 4L38 10v14c0 8-6 14-14 18C16 38 10 32 10 24V10L24 4z" stroke="#10b981" stroke-width="2"/><path d="M18 24l4 4 8-8" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
  ];

  // ── Team ──────────────────────────────────────────────────────────
  team = [
    {
      name: 'Chandan Kumar (Rav)',
      role: 'Founder & AI Engineer',
      focus: 'Technical',
      desc: 'Senior AI Engineer with 4+ years building production LLM systems. LangGraph, Hybrid RAG, FastAPI, multi-agent orchestration. The technical brain behind every AI solution we deliver.',
      photo: 'chandan-photo.jpg',
      linkedin: 'https://www.linkedin.com/in/rav-chandan-kumar-singh-767374315/',
      github: 'https://github.com/RavSinghChandan',
      tags: ['AI Engineering', 'LangGraph', 'RAG Systems', 'FastAPI'],
      color: 'purple',
    },
    {
      name: 'Anita Basu',
      role: 'Co-Founder & Head of Operations',
      focus: 'Business',
      desc: 'Leads HR, client management, and business operations. Ensures every client engagement runs smoothly from discovery to delivery — the bridge between business needs and technical solutions.',
      photo: 'ankita-photo.jpg',
      linkedin: 'https://www.linkedin.com/in/anita-basu-28b372317/',
      github: '',
      tags: ['Operations', 'Client Success', 'HR Management', 'Business Strategy'],
      color: 'cyan',
    },
  ];

  // ── Contact form ──────────────────────────────────────────────────
  contactForm = { name: '', company: '', email: '', phone: '', challenge: '' };
  formSubmitted = signal(false);
  formSending   = signal(false);

  submitForm() {
    if (this.formSending()) return;
    this.formSending.set(true);
    setTimeout(() => { this.formSending.set(false); this.formSubmitted.set(true); }, 1200);
  }

  // ── Neural canvas ─────────────────────────────────────────────────
  private initNeuralCanvas() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('neural-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const NODE_COUNT    = 90;
    const CLUSTER_COUNT = 7;
    const AXON_PER_NODE = 3;
    const MAX_AXON_LEN  = 260;
    const DRIFT_SPEED   = 0.08;
    const SIGNAL_SPEED  = 0.012;
    const SIGNAL_INTERVAL = 90;

    const rgb = (hex: string) => ({
      r: parseInt(hex.slice(1,3),16),
      g: parseInt(hex.slice(3,5),16),
      b: parseInt(hex.slice(5,7),16),
    });

    const CLUSTER_COLORS = ['#1e3a8a','#0891b2','#1d4ed8','#0f766e','#1e40af','#0369a1','#1d4ed8'];

    interface Cluster { cx: number; cy: number; color: string; }
    let clusters: Cluster[] = [];
    const buildClusters = () => {
      clusters = Array.from({ length: CLUSTER_COUNT }, (_, i) => ({
        cx: (0.1 + 0.8 * Math.random()) * canvas.width,
        cy: (0.1 + 0.8 * Math.random()) * canvas.height,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      }));
    };

    interface Neuron { x: number; y: number; vx: number; vy: number; r: number; clusterId: number; glow: number; glowDir: number; }
    interface Axon { from: number; to: number; }
    interface Signal { axonIdx: number; t: number; }

    let neurons: Neuron[] = [];
    let axons: Axon[] = [];
    let signals: Signal[] = [];
    let frameCount = 0;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      buildClusters();
      init();
    };

    const init = () => {
      neurons = Array.from({ length: NODE_COUNT }, (_, i) => {
        const cid = i % CLUSTER_COUNT;
        const cl  = clusters[cid];
        const spread = 80 + Math.random() * 120;
        const angle  = Math.random() * Math.PI * 2;
        return { x: cl.cx + Math.cos(angle)*spread*Math.random(), y: cl.cy + Math.sin(angle)*spread*Math.random(), vx: (Math.random()-0.5)*DRIFT_SPEED, vy: (Math.random()-0.5)*DRIFT_SPEED, r: 1.2+Math.random()*2, clusterId: cid, glow: Math.random(), glowDir: Math.random() > 0.5 ? 1 : -1 };
      });
      axons = [];
      for (let i = 0; i < neurons.length; i++) {
        const candidates: { j: number; d: number }[] = [];
        for (let j = 0; j < neurons.length; j++) {
          if (i === j) continue;
          const dx = neurons[i].x - neurons[j].x; const dy = neurons[i].y - neurons[j].y;
          const d = Math.sqrt(dx*dx+dy*dy);
          if (d < MAX_AXON_LEN) candidates.push({ j, d });
        }
        candidates.sort((a,b) => a.d - b.d);
        const same = candidates.filter(c => neurons[c.j].clusterId === neurons[i].clusterId);
        const diff = candidates.filter(c => neurons[c.j].clusterId !== neurons[i].clusterId);
        const chosen = [...same.slice(0,AXON_PER_NODE-1), ...diff.slice(0,1)].slice(0,AXON_PER_NODE);
        for (const c of chosen) axons.push({ from: i, to: c.j });
      }
      signals = [];
    };

    window.addEventListener('resize', resize);
    resize();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frameCount++;
      for (const n of neurons) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 20) n.vx += 0.02; if (n.x > canvas.width-20) n.vx -= 0.02;
        if (n.y < 20) n.vy += 0.02; if (n.y > canvas.height-20) n.vy -= 0.02;
        n.glow += n.glowDir*0.005;
        if (n.glow > 1) { n.glow=1; n.glowDir=-1; } if (n.glow < 0) { n.glow=0; n.glowDir=1; }
      }
      if (frameCount % SIGNAL_INTERVAL === 0 && axons.length > 0) {
        const ax = axons[Math.floor(Math.random()*axons.length)];
        signals.push({ axonIdx: axons.indexOf(ax), t: 0 });
      }
      const done: number[] = [];
      for (let s = 0; s < signals.length; s++) {
        signals[s].t += SIGNAL_SPEED;
        if (signals[s].t >= 1) {
          done.push(s);
          const arrivedAt = axons[signals[s].axonIdx].to;
          const outgoing = axons.map((a,i) => ({a,i})).filter(({a}) => a.from === arrivedAt);
          if (outgoing.length > 0 && Math.random() > 0.35) {
            const pick = outgoing[Math.floor(Math.random()*outgoing.length)];
            signals.push({ axonIdx: pick.i, t: 0 });
          }
        }
      }
      for (let i = done.length-1; i >= 0; i--) signals.splice(done[i],1);
      if (signals.length > 60) signals.splice(0, signals.length-60);

      for (const ax of axons) {
        const a = neurons[ax.from]; const b = neurons[ax.to];
        const cl = clusters[a.clusterId]; const { r, g, b: bl } = rgb(cl.color);
        ctx.beginPath(); ctx.moveTo(a.x,a.y);
        const mx=(a.x+b.x)/2+(b.y-a.y)*0.15; const my=(a.y+b.y)/2-(b.x-a.x)*0.15;
        ctx.quadraticCurveTo(mx,my,b.x,b.y);
        ctx.strokeStyle=`rgba(${r},${g},${bl},0.10)`; ctx.lineWidth=0.6; ctx.stroke();
      }
      for (const sig of signals) {
        const ax = axons[sig.axonIdx]; if (!ax) continue;
        const a = neurons[ax.from]; const b = neurons[ax.to]; const t = sig.t;
        const mx=(a.x+b.x)/2+(b.y-a.y)*0.15; const my=(a.y+b.y)/2-(b.x-a.x)*0.15;
        const px=(1-t)*(1-t)*a.x+2*(1-t)*t*mx+t*t*b.x; const py=(1-t)*(1-t)*a.y+2*(1-t)*t*my+t*t*b.y;
        const cl = clusters[neurons[ax.from].clusterId]; const { r, g, b: bl } = rgb(cl.color);
        const sg = ctx.createRadialGradient(px,py,0,px,py,6);
        sg.addColorStop(0,`rgba(${r},${g},${bl},0.9)`); sg.addColorStop(0.4,`rgba(${r},${g},${bl},0.4)`); sg.addColorStop(1,`rgba(${r},${g},${bl},0)`);
        ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fillStyle=sg; ctx.fill();
        ctx.beginPath(); ctx.arc(px,py,1.5,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fill();
      }
      for (const n of neurons) {
        const cl = clusters[n.clusterId]; const { r, g, b: bl } = rgb(cl.color);
        const gAlpha = 0.12 + n.glow*0.2;
        const sg = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*4);
        sg.addColorStop(0,`rgba(${r},${g},${bl},${gAlpha})`); sg.addColorStop(1,`rgba(${r},${g},${bl},0)`);
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r*4,0,Math.PI*2); ctx.fillStyle=sg; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fillStyle=`rgba(${r},${g},${bl},0.7)`; ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  // ── Floating guide ────────────────────────────────────────────────
  fgVisible = signal(false);
  fgQuote   = signal('');
  fgSub     = signal('');

  private initFloatingGuide() {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      this.fgQuote.set("Let's make your business AI-first! 🚀");
      this.fgSub.set('Book a free consultation today');
      this.fgVisible.set(true);
      setTimeout(() => this.fgVisible.set(false), 5000);
    }, 2000);

    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const sec = (e.target as HTMLElement).dataset['guide'];
        if (!sec) continue;
        const scripts: Record<string, {q:string;s:string}> = {
          hero:      { q: 'Transform your business with AI! 🤖', s: 'Book your free AI audit today' },
          services:  { q: 'Every service is production-proven. 💪', s: 'Real systems, real business results' },
          solutions: { q: 'These solutions are live. Not demos. 🚀', s: 'See the outcomes your peers got' },
          numbers:   { q: 'Real numbers. Verified results. 📊', s: 'Not marketing copy — real client data' },
          team:      { q: 'Technical + business — complete team. 🤝', s: 'We own your success end to end' },
          contact:   { q: "Ready to go AI-first? Let's talk! 🎯", s: 'Book your free consultation now' },
        };
        const item = scripts[sec];
        if (!item) continue;
        this.fgVisible.set(false);
        setTimeout(() => {
          this.fgQuote.set(item.q);
          this.fgSub.set(item.s);
          this.fgVisible.set(true);
          setTimeout(() => this.fgVisible.set(false), 5000);
        }, 200);
      }
    }, { threshold: 0.25 });
    document.querySelectorAll('section[data-guide]').forEach(s => obs.observe(s));
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

    const heroEl = document.querySelector('.hero-stats');
    const runStats = () => {
      if (this.statsAnimated) return;
      this.statsAnimated = true;
      this.animateCount(this.statClients,   50,  1200);
      this.animateCount(this.statAutomated, 200, 1400);
      this.animateCount(this.statAgents,    18,  900);
      this.animateCount(this.statROI,       60,  1000);
    };
    // Always fire after 600ms — hero stats are always above the fold
    setTimeout(runStats, 600);
    if (heroEl) {
      const statsObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) runStats();
      }, { threshold: 0.05 });
      statsObs.observe(heroEl);
    }

    this.initFloatingGuide();
    this.initNeuralCanvas();
  }

  private animateCount(sig: ReturnType<typeof signal<number>>, target: number, duration: number) {
    const steps = 40; const interval = duration / steps; let current = 0;
    const step = () => { current++; sig.set(Math.round((target*current)/steps)); if (current < steps) setTimeout(step, interval); };
    setTimeout(step, interval);
  }

  toggleTheme() { this.applyTheme(this.theme() === 'dark' ? 'light' : 'dark'); }
  private applyTheme(t: 'dark' | 'light') {
    this.theme.set(t);
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
    document.body.style.background = t === 'dark' ? '#09090b' : '#ffffff';
    document.body.style.color = t === 'dark' ? '#fafafa' : '#09090b';
  }

  @HostListener('window:scroll')
  onScroll() {
    const sy = window.scrollY;
    this.scrolled.set(sy > 40);
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress.set(docH > 0 ? Math.round((sy/docH)*100) : 0);
    this.showBackToTop.set(sy > document.documentElement.scrollHeight*0.35);
    const sections = ['hero','services','solutions','numbers','team','contact'];
    let current = '';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 100) current = id;
    }
    this.activeSection.set(current);
  }

  scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  private startTyping() {
    const lines = this.typingLines;
    const tick = () => {
      const line = lines[this.li];
      if (!this.deleting) {
        this.ci++; this.typedText.set(line.slice(0,this.ci));
        if (this.ci === line.length) { this.deleting = true; setTimeout(tick, 2000); return; }
      } else {
        this.ci--; this.typedText.set(line.slice(0,this.ci));
        if (this.ci === 0) { this.deleting = false; this.li = (this.li+1) % lines.length; }
      }
      setTimeout(tick, this.deleting ? 25 : 55);
    };
    tick();
  }

  // ── RAV AI CHATBOT ────────────────────────────────────────────────
  @ViewChild('cbScroll') cbScrollEl!: ElementRef;

  cbOpen    = signal(false);
  cbTyping  = signal(false);
  cbUnread  = signal(0);
  cbDraft   = '';
  cbMessages = signal<{ role: 'bot'|'user'; html: string; safeHtml?: SafeHtml; followups?: string[] }[]>([]);
  cbPanelW  = signal(380);
  cbPanelH  = signal(560);
  private _cbResizing = false;
  private _cbResizeStartX = 0; private _cbResizeStartY = 0;
  private _cbResizeStartW = 380; private _cbResizeStartH = 560;

  readonly cbQuickPrompts = [
    '🤖 What AI services do you offer?',
    '📞 Book a free consultation',
    '💰 How much does it cost?',
    '⚡ How fast can you deliver?',
  ];

  cbResizeStart(e: MouseEvent) {
    this._cbResizing = true;
    this._cbResizeStartX = e.clientX; this._cbResizeStartY = e.clientY;
    this._cbResizeStartW = this.cbPanelW(); this._cbResizeStartH = this.cbPanelH();
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!this._cbResizing) return;
      this.cbPanelW.set(Math.max(300, Math.min(700, this._cbResizeStartW + (this._cbResizeStartX - ev.clientX))));
      this.cbPanelH.set(Math.max(360, Math.min(900, this._cbResizeStartH + (this._cbResizeStartY - ev.clientY))));
    };
    const onUp = () => { this._cbResizing = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  cbToggle() {
    this.cbOpen.update(v => !v);
    if (this.cbOpen()) { this.cbUnread.set(0); this._cbResetSession(); }
  }

  private _cbResetSession() {
    const greet = `Hi! 👋 I'm <strong style="color:var(--cb-head-color)">Rav AI Assistant</strong> — your AI business guide.<br><br>How can I help you transform your business with AI today?`;
    this.cbMessages.set([{ role: 'bot', html: greet, safeHtml: this.sanitizer.bypassSecurityTrustHtml(greet) }]);
    setTimeout(() => this._scrollChat(), 50);
  }

  cbSend(text: string) {
    const q = (text || '').trim();
    if (!q) return;
    this.cbDraft = '';
    this.cbMessages.update(m => [...m, { role: 'user', html: q }]);
    this.cbTyping.set(true);
    setTimeout(() => this._scrollChat(), 30);
    setTimeout(() => {
      const reply = this.chatSvc.match(q);
      const followups = this.chatSvc.followups(q);
      this.cbTyping.set(false);
      this.cbMessages.update(m => [...m, { role: 'bot', html: reply, safeHtml: this.sanitizer.bypassSecurityTrustHtml(reply), followups }]);
      if (!this.cbOpen()) this.cbUnread.update(n => n+1);
      setTimeout(() => this._scrollChat(), 50);
    }, 400 + Math.random()*400);
  }

  private _scrollChat() {
    if (this.cbScrollEl?.nativeElement) {
      const el = this.cbScrollEl.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
