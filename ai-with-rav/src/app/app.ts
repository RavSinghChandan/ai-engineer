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
      icon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="2"/><path d="M24 6v4M24 38v4M6 24h4M38 24h4M10.9 10.9l2.8 2.8M34.3 34.3l2.8 2.8M10.9 37.1l2.8-2.8M34.3 13.7l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.7"/></svg>`,
      title: 'AI Audit & Roadmap',
      color: 'purple',
      desc: 'Identify every automation opportunity in your business with a structured AI readiness assessment and prioritised roadmap.',
      points: ['Process mapping & gap analysis', 'ROI opportunity sizing', 'AI readiness score', 'Prioritised 90-day roadmap'],
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="14" width="32" height="20" rx="3" stroke="currentColor" stroke-width="2"/><path d="M16 24h16M24 18v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 34l4 6M40 34l-4 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/></svg>`,
      title: 'AI Automation',
      color: 'cyan',
      desc: 'Automate repetitive workflows using AI — reclaim hours every day, eliminate human error, and scale without headcount.',
      points: ['Document processing pipelines', 'Email & report automation', 'Data extraction at scale', 'Workflow orchestration'],
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="10" width="20" height="16" rx="3" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="18" r="2" fill="currentColor"/><circle cx="28" cy="18" r="2" fill="currentColor"/><path d="M14 26l-4 4H10v6h6v-3l4-3M34 26l4 4h4v6h-6v-3l-4-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/></svg>`,
      title: 'AI Agents',
      color: 'amber',
      desc: 'Deploy intelligent agents for customer support, lead qualification, HR queries, and internal operations — running 24/7.',
      points: ['24/7 customer support agents', 'Lead qualification bots', 'Internal HR & IT assistants', 'Sales automation agents'],
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="24" cy="12" rx="14" ry="5" stroke="currentColor" stroke-width="2"/><path d="M10 12v12c0 2.76 6.27 5 14 5s14-2.24 14-5V12" stroke="currentColor" stroke-width="2"/><path d="M10 24v8c0 2.76 6.27 5 14 5s14-2.24 14-5v-8" stroke="currentColor" stroke-width="2"/><line x1="24" y1="7" x2="24" y2="37" stroke="currentColor" stroke-width="1" opacity="0.4"/></svg>`,
      title: 'RAG Systems',
      color: 'green',
      desc: 'Build enterprise knowledge assistants powered by your own company data, documents, and internal knowledge bases.',
      points: ['Document ingestion pipelines', 'Hybrid FAISS + BM25 retrieval', 'Q&A over internal knowledge', 'Zero hallucination guardrails'],
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 4L38 10v14c0 8-6 14-14 18C16 38 10 32 10 24V10L24 4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M18 24l4 4 8-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      title: 'AI Transformation',
      color: 'red',
      desc: 'End-to-end AI adoption consulting — strategy, implementation, team training, change management, and ongoing support.',
      points: ['Executive AI strategy workshops', 'Team upskilling programmes', 'Change management support', 'AI governance framework'],
    },
    {
      icon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="8" width="36" height="28" rx="3" stroke="currentColor" stroke-width="2"/><rect x="6" y="8" width="36" height="8" rx="3" fill="currentColor" opacity="0.15"/><rect x="12" y="22" width="8" height="8" rx="1" fill="currentColor" opacity="0.5"/><rect x="24" y="22" width="14" height="2" rx="1" fill="currentColor" opacity="0.4"/><rect x="24" y="26" width="10" height="2" rx="1" fill="currentColor" opacity="0.3"/><path d="M16 40v4M32 40v4M10 44h28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/></svg>`,
      title: 'LLM Applications',
      color: 'blue',
      desc: 'Custom LLM-powered applications — from proposal generators to intelligent dashboards and search systems.',
      points: ['Proposal generation systems', 'Content creation pipelines', 'Intelligent search & discovery', 'Custom AI chat interfaces'],
    },
  ];

  // ── AI Solutions (Before / After format) ─────────────────────────
  solutions = [
    {
      title: 'Lead Qualification',
      outcome: '80% faster',
      before: 'Sales team manually sorting 200+ leads/week. Hot prospects going cold.',
      after: 'AI agent qualifies every lead 24/7. Only hot prospects reach your team.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="14" r="6" stroke="#7C3AED" stroke-width="2"/><circle cx="12" cy="34" r="5" stroke="#a78bfa" stroke-width="2" opacity="0.4"/><circle cx="36" cy="34" r="5" stroke="#10b981" stroke-width="2"/><path d="M24 20v6M18 30l-4 2M30 30l4 2" stroke="#7C3AED" stroke-width="1.5" opacity="0.5"/><path d="M33 32l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
    {
      title: 'Proposal Writing',
      outcome: '90% faster',
      before: '6–8 hours writing proposals from scratch. Inconsistent quality.',
      after: 'Brief in → polished proposal out in 90 seconds. Every time.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="8" width="28" height="32" rx="3" stroke="#f59e0b" stroke-width="2"/><line x1="16" y1="16" x2="32" y2="16" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="22" x2="32" y2="22" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/><line x1="16" y1="28" x2="24" y2="28" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/><circle cx="36" cy="36" r="8" fill="#f59e0b" opacity="0.15"/><path d="M32 36l3 3 5-5" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
    {
      title: 'Internal Knowledge',
      outcome: '60% fewer tickets',
      before: 'Staff spend 2+ hrs/day hunting for info across docs, Slack, folders.',
      after: 'AI knows your entire company. Answers in seconds with sources.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="24" cy="12" rx="14" ry="5" stroke="#06b6d4" stroke-width="2"/><path d="M10 12v10c0 2.76 6.27 5 14 5s14-2.24 14-5V12" stroke="#06b6d4" stroke-width="2"/><path d="M10 22v8c0 2.76 6.27 5 14 5s14-2.24 14-5v-8" stroke="#06b6d4" stroke-width="2" opacity="0.5"/><path d="M22 28l-4 8h12l-4-8" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/></svg>`,
    },
    {
      title: 'Document Processing',
      outcome: '95% faster',
      before: 'Hours of manual data entry from invoices, contracts, and forms daily.',
      after: 'Any document → structured data in milliseconds. 99%+ accuracy.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="6" width="20" height="26" rx="2" stroke="#10b981" stroke-width="2"/><path d="M14 13h8M14 18h8M14 23h5" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/><rect x="24" y="22" width="16" height="16" rx="8" fill="#10b981" opacity="0.12"/><rect x="24" y="22" width="16" height="16" rx="8" stroke="#10b981" stroke-width="2"/><path d="M28 30l3 3 5-5" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
    {
      title: 'Customer Support',
      outcome: '58% ticket drop',
      before: 'Support team overwhelmed. Tickets piling up. Slow response times.',
      after: 'AI handles 80% of queries instantly. Humans handle only complex cases.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M38 20a14 14 0 1 0-26.93 5.4L8 38l12.6-3.07A14 14 0 0 0 38 20z" stroke="#8b5cf6" stroke-width="2"/><circle cx="18" cy="20" r="1.5" fill="#8b5cf6"/><circle cx="24" cy="20" r="1.5" fill="#8b5cf6"/><circle cx="30" cy="20" r="1.5" fill="#8b5cf6"/></svg>`,
    },
    {
      title: 'Sales Automation',
      outcome: '3× pipeline speed',
      before: 'Reps doing manual follow-ups, CRM updates, and reporting for hours.',
      after: 'AI handles follow-ups, updates CRM, flags next best action automatically.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="8,36 16,24 24,28 32,16 40,10" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="40" cy="10" r="4" fill="#f59e0b" opacity="0.3" stroke="#f59e0b" stroke-width="2"/><path d="M36 14l4-4" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    },
  ];

  // ── Proof stats ───────────────────────────────────────────────────
  readonly proofStats = [
    {
      stat: '90%',
      title: 'Proposal time cut.',
      sub: 'From 6 hours to 35 minutes. Same quality, fraction of the time.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 8v16l8 5" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" opacity="0.3"/></svg>`,
    },
    {
      stat: '80%',
      title: 'Lead qualification automated.',
      sub: 'Sales team focuses only on hot leads. Pipeline velocity 3× faster.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="14" r="6" stroke="#06b6d4" stroke-width="2"/><circle cx="12" cy="34" r="5" stroke="#a78bfa" stroke-width="2"/><circle cx="36" cy="34" r="5" stroke="#10b981" stroke-width="2"/><path d="M24 20v6M18 30l-4 2M30 30l4 2" stroke="currentColor" stroke-width="1.5" opacity="0.5"/></svg>`,
    },
    {
      stat: '24/7',
      title: 'AI agents working.',
      sub: 'Customer support, lead handling, knowledge queries — all automated around the clock.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" opacity="0.3"/><path d="M24 12v12l6 6" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    },
    {
      stat: '60%',
      title: 'Cost reduction achieved.',
      sub: 'AI replaces repetitive manual tasks — same output, fraction of the cost.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 6L28 18L40 18L30 26L34 38L24 30L14 38L18 26L8 18L20 18Z" stroke="#f59e0b" stroke-width="2" fill="rgba(245,158,11,0.1)"/></svg>`,
    },
    {
      stat: '3×',
      title: 'Faster client onboarding.',
      sub: 'AI-powered knowledge base cuts onboarding from weeks to days.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 38V18l12-10 12 10v20" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="20" y="28" width="8" height="10" stroke="currentColor" stroke-width="1.5"/></svg>`,
    },
    {
      stat: 'G1–G5',
      title: 'Guardrails on every AI output.',
      sub: 'Rate limit · injection detection · PII filter · faithfulness gate · output validation.',
      svgIcon: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 4L38 10v14c0 8-6 14-14 18C16 38 10 32 10 24V10L24 4z" stroke="#10b981" stroke-width="2"/><path d="M18 24l4 4 8-8" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
  ];

  // ── Testimonials ──────────────────────────────────────────────────
  readonly testimonials = [
    {
      quote: 'Within 6 weeks of deploying their AI agent, our support ticket volume dropped by 58%. The team built and shipped a production system — not a prototype.',
      name: 'Rajesh Mehta',
      title: 'VP Operations, FinServ Startup',
      industry: 'Financial Services',
      initials: 'RM',
      color: 'purple',
    },
    {
      quote: 'Our proposal turnaround went from 6 hours to under 40 minutes. That alone paid for the entire engagement in month one.',
      name: 'Sarah Thompson',
      title: 'CEO, B2B SaaS Company',
      industry: 'Technology',
      initials: 'ST',
      color: 'cyan',
    },
    {
      quote: 'The RAG system they built on our internal docs has become something our entire operations team uses every day. Zero hallucinations, fast, and it actually knows our business.',
      name: 'Priya Nair',
      title: 'Head of Digital Transformation',
      industry: 'Healthcare',
      initials: 'PN',
      color: 'green',
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
    const f = this.contactForm;
    const payload = {
      from_name:    f.name,
      from_company: f.company,
      from_email:   f.email,
      from_phone:   f.phone || 'Not provided',
      message:      f.challenge,
      to_email:     'aiwithravofficial@gmail.com',
    };
    (window as any)['emailjs']
      .send('YOUR_EMAILJS_SERVICE_ID', 'YOUR_EMAILJS_TEMPLATE_ID', payload)
      .then(() => {
        this.formSending.set(false);
        this.formSubmitted.set(true);
      })
      .catch(() => {
        this.formSending.set(false);
        // fallback: open mailto so the lead is never lost
        const body = `Name: ${f.name}%0ACompany: ${f.company}%0AEmail: ${f.email}%0APhone: ${f.phone}%0A%0AChallenge:%0A${encodeURIComponent(f.challenge)}`;
        window.open(`mailto:aiwithravofficial@gmail.com?subject=Free AI Consultation Request — ${encodeURIComponent(f.company)}&body=${body}`);
        this.formSubmitted.set(true);
      });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.setAttribute('data-theme', 'light');
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

  }

  private animateCount(sig: ReturnType<typeof signal<number>>, target: number, duration: number) {
    const steps = 40; const interval = duration / steps; let current = 0;
    const step = () => { current++; sig.set(Math.round((target*current)/steps)); if (current < steps) setTimeout(step, interval); };
    setTimeout(step, interval);
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
