import { Component, OnInit, signal, computed, HostListener, ElementRef, QueryList, ViewChildren, AfterViewInit, PLATFORM_ID, Inject, ViewChild, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService } from './chat.service';
import { LiveMap } from './live-map';
import { Magnetic } from './magnetic';
import { ProofViz } from './proof-viz';
import { HeroBlueprint } from './hero-blueprint';
import { CityLights, CycleRows, ScrollFill } from './motion';
import { ProjectReel } from './project-reel';
import { LiveStatus } from './live-status.service';

/** A node in the interactive knowledge graph. */
interface GraphNode {
  id: string;
  label: string;
  kind: 'system' | 'tech' | 'oss' | 'work' | 'practice';
  detail: string;
  url?: string;
  /** Element id the node scrolls to when clicked (a project card or a section). */
  target?: string;
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
  imports: [CommonModule, FormsModule, LiveMap, Magnetic, ProofViz, HeroBlueprint, CycleRows, ScrollFill, CityLights, ProjectReel],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, AfterViewInit {

  // Dark by default; the nav toggle switches to light and remembers the choice.
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
  tagsExpanded = signal(false);
  readonly tagPreviewCount = 10;

  /** Tags shared by the most projects first; the rest sit behind "+N more". */
  get visibleFilterTags(): string[] {
    const count = (tag: string) =>
      this.projects.filter(p => p.tags.some(t => t.label.toLowerCase() === tag.toLowerCase())).length;
    const ranked = [...this.filterTags].sort((a, b) => count(b) - count(a));
    if (this.tagsExpanded()) return ranked;
    const top = ranked.slice(0, this.tagPreviewCount);
    const active = this.activeTagFilter();
    return active && !top.includes(active) ? [...top, active] : top;
  }

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
    this.projPage.set(1);
  }

  clearTagFilter() {
    this.activeTagFilter.set(null);
    this.projPage.set(1);
  }

  // ── Projects browser: sort + paginate, same pattern as open source ──────
  //    Each project card is long (challenges + screenshots), so one per page.
  readonly projPageSize = 1;
  /** Flagship order: the three most forward-deployed stories lead. */
  private readonly featuredOrder = ['01', '08', '09', '02', '05', '06', '03', '04', '07'];
  isFlagship(num: string): boolean { return this.featuredOrder.indexOf(num) < 4; }
  projSort = signal<'featured' | 'newest' | 'oldest' | 'az' | 'tests'>('featured');
  projPage = signal(1);

  private projTests(p: { tags: { label: string }[] }): number {
    const t = p.tags.find(x => /\d+\s+Tests/i.test(x.label));
    return t ? parseInt(t.label, 10) : 0;
  }

  get sortedProjects() {
    const rows = [...this.filteredProjects];
    switch (this.projSort()) {
      case 'featured': return rows.sort((a, b) => this.featuredOrder.indexOf(a.num) - this.featuredOrder.indexOf(b.num));
      case 'oldest': return rows.sort((a, b) => a.num.localeCompare(b.num));
      case 'az':     return rows.sort((a, b) => a.title.localeCompare(b.title));
      case 'tests':  return rows.sort((a, b) => this.projTests(b) - this.projTests(a) || b.num.localeCompare(a.num));
      default:       return rows.sort((a, b) => b.num.localeCompare(a.num));
    }
  }

  get projTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredProjects.length / this.projPageSize));
  }

  get visibleProjects() {
    const page = Math.min(this.projPage(), this.projTotalPages);
    const start = (page - 1) * this.projPageSize;
    return this.sortedProjects.slice(start, start + this.projPageSize);
  }

  get projPageNumbers(): number[] {
    return Array.from({ length: this.projTotalPages }, (_, i) => i + 1);
  }

  get projRangeLabel(): string {
    const total = this.filteredProjects.length;
    if (!total) return 'No matches';
    const page = Math.min(this.projPage(), this.projTotalPages);
    return `Project ${page} of ${total}`;
  }

  setProjSort(sort: 'featured' | 'newest' | 'oldest' | 'az' | 'tests'): void {
    this.projSort.set(sort);
    this.projPage.set(1);
  }

  goProjPage(n: number): void {
    this.projPage.set(Math.min(Math.max(1, n), this.projTotalPages));
    document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // PDF resume — user to replace with actual hosted PDF URL
  readonly RESUME_PDF = 'Chandan_Kumar_Forward_Deployed_Engineer_Resume.pdf';


  @ViewChildren('fadeEl') fadeEls!: QueryList<ElementRef>;

  private typingLines = [
    'Multi-Agent Orchestration with LangGraph',
    'Hybrid RAG: FAISS + BM25 + HyDE + CRAG',
    'Production Guardrails G1–G5 implemented',
    'SSE Streaming · Kafka · Redis · JWT Auth',
    '637 tests passing · under 4s · Zero shortcuts',
  ];
  private li = 0; private ci = 0; private deleting = false;

  projects = [
    {
      num: '01', accent: 'purple',
      liveUrl: 'https://aurawithrav.com',
      inProduction: true,
      title: 'Aura with Rav',
      subtitle: 'Live AI Product — aurawithrav.com',
      story: [
        { k: 'Problem', v: 'People want numerology and astrology readings in plain language, not jargon — and they want to ask their own questions.' },
        { k: 'Constraint', v: 'A public product: real sign-ups, untrusted input, LLM cost and latency, and readings that must not invent facts.' },
        { k: 'Decision', v: 'Angular on Vercel, Dockerized FastAPI + LangGraph on Render; security and persona-injection checks, domain agents, a hallucination check, a grammar pass and human approval before release.' },
        { k: 'Result', v: 'Live at aurawithrav.com on a custom domain with HTTPS, sign-up and health monitoring — owned end to end, from idea to uptime.' },
      ],
      desc: '16 AI agents coordinate dynamically to generate personalized intelligence reports across Vedic Astrology, Numerology, Palmistry, Tarot & Vastu Shastra — in 23 Indian languages.',
      github: 'https://github.com/RavSinghChandan',
      tags: [
        { label: 'Python', cls: 'tag-purple' }, { label: 'FastAPI', cls: 'tag-purple' },
        { label: 'LangGraph', cls: 'tag-purple' }, { label: 'DeepSeek LLM', cls: 'tag-purple' },
        { label: 'Multi-Agent', cls: 'tag-purple' }, { label: 'Angular 17', cls: 'tag-cyan' },
        { label: 'JWT Auth', cls: 'tag-green' }, { label: '415 Tests', cls: 'tag-amber' }, { label: 'G1–G5 Guardrails', cls: 'tag-red' },
      ],
      challenges: [
        { p: '16 agents coordinating without conflicts', s: 'LangGraph stateful orchestration — each agent is a node, edges are conditional' },
        { p: 'Multi-tenant SaaS — 3 roles (USER / ADMIN / SUPERADMIN)', s: 'JWT Bearer + X-API-Key dual auth, role-based route guards, 76 auth tests' },
        { p: 'Retrieval quality on spiritual domain queries', s: 'Hybrid RAG + Multi-Query expansion — ambiguous queries matched at higher confidence' },
        { p: 'LLM hallucination on sensitive predictions', s: 'G1–G5 guardrails: rate limit, injection detection, PII filter, faithfulness gate' },
        { p: 'Reports in 23 Indian languages', s: 'Language-aware prompt templating + dynamic PDF rendering per locale' },
        { p: 'Reliability without LLM in the test loop', s: '415 tests, seconds not minutes — full stack with mock LLM, zero flakiness' },
      ],
      imgSrc: 'project-aura.png',
    },
    {
      num: '08', accent: 'green',
      liveUrl: 'https://aaina-ai.vercel.app',
      inProduction: true,
      title: 'Aaina',
      subtitle: 'Live AI Product — aaina-ai.vercel.app',
      story: [
        { k: 'Problem', v: 'Salons pick haircuts by guesswork, and customers cannot picture a cut on their own face before it is done.' },
        { k: 'Constraint', v: 'A public app on free hosting: untrusted visitors on a paid AI key, photo privacy, no GPU, and a server that sleeps when idle.' },
        { k: 'Decision', v: 'Angular on Vercel, Dockerized FastAPI on Render; seven agents run as a YAML-defined DAG with schema checks and rule fallbacks; face shape is measured on the phone; multi-tenant onboarding where salons register, I approve, and they sign in with a signed tenant key.' },
        { k: 'Result', v: 'Live at aaina-ai.vercel.app in 11 languages. Evals against the live model found it broke a customer\'s dislikes in 3 of 15 consultations; the harness now enforces the rule in code, and every check runs at 100% on each build.' },
      ],
      desc: 'A multi-tenant AI mirror for salons: one selfie and a few taps give the three haircuts that suit a customer, hair and face routines and a care calendar. Seven agents run as a declarative harness, so new features are YAML, not code.',
      github: 'https://github.com/RavSinghChandan',
      tags: [
        { label: 'Python', cls: 'tag-green' }, { label: 'FastAPI', cls: 'tag-green' },
        { label: 'DeepSeek LLM', cls: 'tag-green' }, { label: 'Agent DAG harness', cls: 'tag-green' },
        { label: 'Angular 21', cls: 'tag-cyan' }, { label: 'MediaPipe on-device', cls: 'tag-cyan' },
        { label: 'Docker + Render', cls: 'tag-amber' }, { label: 'Multi-tenant auth', cls: 'tag-red' }, { label: 'Evals in CI', cls: 'tag-red' }, { label: '55 Tests', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'New features without touching core code', s: 'Agents, workflows and the intake form are YAML manifests; the engine runs any DAG in parallel' },
        { p: 'An LLM recommending cuts that do not exist', s: 'Answers are grounded in a style catalog with an audience filter, schema-checked, and fall back to rules' },
        { p: 'The model ignoring "never give me a fade"', s: 'Live evals caught it in 20% of answers; the catalog is now narrowed to what the customer allows before the model sees it, checked after, with one repair retry: 100%' },
        { p: 'Knowing how the agents behave in production', s: 'Ops panel: per agent step, how often the AI answer was kept, repaired or replaced, with p50 / p95 latency' },
        { p: 'The text model cannot see the photo', s: 'Face shape, hair colour, length and beard are measured on the phone with MediaPipe and sent as data' },
        { p: 'Many salons on one paid AI key', s: 'Multi-tenant: register, owner approval, HMAC-signed tenant key + username; each salon isolated; daily caps; fails closed' },
        { p: 'Photo privacy for real customers', s: 'Explicit consent, measurement on the device, and the photo is never stored on the server' },
        { p: 'Free hosting that sleeps when idle', s: 'The app wakes the API as soon as someone lands, so it is ready by the last step' },
      ],
      imgSrc: 'project-aaina.png',
    },
    {
      num: '09', accent: 'amber',
      liveUrl: 'https://poultry-360.onrender.com',
      inProduction: true,
      title: 'Poultry 360',
      subtitle: 'Live AI Product — poultry-360.onrender.com',
      story: [
        { k: 'Problem', v: 'Small poultry farmers in India count birds by hand, guess feed, and get advice that is not in their language and not traceable to any source.' },
        { k: 'Constraint', v: 'Farmers on cheap phones in a shed, reading Bengali or Hindi; a public app on free hosting with a CPU-only vision model and a paid AI key.' },
        { k: 'Decision', v: 'One Docker image on Render: FastAPI serves the API and the Angular app; a YOLO11 ONNX model counts birds from a photo or video on the CPU; every feed number comes from a published table and the LLM only explains it; farms register, I approve, and they sign in with a signed tenant key.' },
        { k: 'Result', v: 'Live at poultry-360.onrender.com in 13 Indian languages with read-aloud. Evals on 40 farmer questions found Hinglish trouble reports misrouted (5 of 13 right); fixed to 100%, and the guard against invented feed numbers from 78% to 100%.' },
      ],
      desc: 'A multi-tenant AI assistant for poultry farms: count the flock from a photo or video, get the exact ration for the birds\' age, and check flock health, in 13 Indian languages. Every number a farmer acts on is traced to a cited source; the model never invents one.',
      github: 'https://github.com/RavSinghChandan/poultry-360',
      tags: [
        { label: 'Python', cls: 'tag-amber' }, { label: 'FastAPI', cls: 'tag-amber' },
        { label: 'YOLO11 ONNX vision', cls: 'tag-amber' }, { label: 'DeepSeek LLM', cls: 'tag-green' },
        { label: 'Angular 17', cls: 'tag-cyan' }, { label: '13 Indian languages', cls: 'tag-cyan' },
        { label: 'Docker + Render', cls: 'tag-amber' }, { label: 'Multi-tenant auth', cls: 'tag-red' }, { label: 'Evals in CI', cls: 'tag-red' }, { label: '230 Tests', cls: 'tag-amber' },
      ],
      challenges: [
        { p: 'An AI telling a farmer a wrong feed number', s: 'Numbers come only from NRC and BIS tables with the source shown; the LLM explains them and never originates one' },
        { p: 'Counting birds without a GPU', s: 'YOLO11n exported to ONNX runs on the CPU in one 630 MB image; video samples frames and reports the best one' },
        { p: 'A model count trusted blindly', s: 'Every bird is boxed as clear or uncertain, a likely range is shown, and the farmer confirms the number that is recorded' },
        { p: 'Farmers who do not read English', s: '13 Indian languages with read-aloud and picture-first screens; English first, each language falls back cleanly' },
        { p: 'Farmers texting in Hinglish', s: 'A router eval on English, Hindi and Hinglish questions runs in CI; it caught sick-flock reports sent to the chart path and fixed them' },
        { p: 'Many farms on one paid AI key and CPU', s: 'Multi-tenant: register, owner approval, HMAC-signed tenant key; daily caps per farm, per network and overall; fails closed on deploy' },
        { p: 'Free hosting that sleeps when idle', s: 'One-click sign-in link keeps retrying while the server wakes, and approved farms survive restarts with no database' },
      ],
      imgSrc: 'project-poultry.png',
    },
    {
      num: '02', accent: 'amber',
      liveUrl: 'demo',
      title: 'Bench Resource Optimizer',
      subtitle: 'Enterprise AI HR Platform',
      story: [
        { k: 'Problem', v: 'Skilled engineers sit on the bench while projects struggle to find the right capabilities.' },
        { k: 'Constraint', v: 'Skills are ambiguous, CVs are untrusted, and every LLM call adds latency, cost and a failure mode.' },
        { k: 'Decision', v: 'Hybrid RAG (FAISS + BM25, HyDE, CRAG) with multi-agent planning, Redis caching, Kafka, SSE streaming and G1–G5 guardrails.' },
        { k: 'Result', v: '222 tests · semantic caching · circuit breakers · injection detection · live streaming · persistent memory.' },
      ],
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
        { p: 'Verifying the entire enterprise stack', s: '222 tests, seconds not minutes — zero external dependencies in CI' },
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
      story: [
        { k: 'Problem', v: 'Engineers need the right incident-response commands, in the right order, under pressure.' },
        { k: 'Constraint', v: 'A hallucinated kubectl command mid-incident is worse than no answer at all.' },
        { k: 'Decision', v: 'RAGless: commands extracted once at ingest and returned verbatim from SQLite; a NetworkX DAG enforces execution order; internal vs official docs ranked and conflict-checked.' },
        { k: 'Result', v: 'Zero hallucinated commands · safe step ordering · automatic conflict detection · 137 tests.' },
      ],
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
      story: [
        { k: 'Problem', v: 'Every app needed its own chatbot, so agent code was being duplicated across four products.' },
        { k: 'Constraint', v: 'Different stacks (FastAPI, Angular, React, plain HTML), different domains, and no lock-in to one LLM provider.' },
        { k: 'Decision', v: 'One agent core; domain, persona and tools set in YAML; an LLM abstraction layer; SDKs for each frontend.' },
        { k: 'Result', v: 'Build once, configure per domain: one engine serving four apps; switching LLM providers is a one-line config change.' },
      ],
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
      tag:   'SHIPPED',
      stat:  'LIVE',
      title: 'Three real AI products in production.',
      sub:   'Aura with Rav, Aaina and Poultry 360: live today, with multi-tenant sign-in, cost caps and health checks, on Vercel and Docker on Render. I own each from idea to uptime.',
      askQuestion: 'How did Chandan take Aura with Rav to production?',
      aaravImg: 'guide-chandan-happy.svg',
      aaravSay: 'Live right now — go try it! 🚀',
      link: 'https://aurawithrav.com',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2"/>
        <path d="M8 24h32M24 8c5 5 5 27 0 32M24 8c-5 5-5 27 0 32" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
        <circle cx="38" cy="10" r="5" fill="#26890D"/>
      </svg>`,
    },
    {
      tag:   'INTEGRATED',
      link:  '',
      stat:  '4 → 1',
      title: 'Apps served by one agent engine.',
      sub:   'Fits the customer’s stack — FastAPI, Angular, React or plain HTML via SDKs and YAML. Integration, not rewrites.',
      askQuestion: 'How does one Universal Agent engine serve four different apps?',
      aaravImg: 'guide-chandan-happy.svg',
      aaravSay: 'Build once, plug in anywhere! 🔌',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="6" stroke="currentColor" stroke-width="2"/>
        <rect x="4" y="6" width="10" height="8" rx="1.5" stroke="#26890D" stroke-width="2"/>
        <rect x="34" y="6" width="10" height="8" rx="1.5" stroke="#26890D" stroke-width="2"/>
        <rect x="4" y="34" width="10" height="8" rx="1.5" stroke="#26890D" stroke-width="2"/>
        <rect x="34" y="34" width="10" height="8" rx="1.5" stroke="#26890D" stroke-width="2"/>
        <path d="M14 12l6 7M34 12l-6 7M14 36l6-7M34 36l-6-7" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
      </svg>`,
    },
    {
      tag:   'TRUSTED',
      link:  '',
      stat:  '82',
      title: 'PRs merged by outside maintainers.',
      sub:   'Strangers reviewed the code and shipped it — pypdf, fontTools, Pillow, fpdf2, Joblib, Sentence Transformers, NLTK and Authlib.',
      askQuestion: 'What kind of open-source contributions has Chandan merged?',
      aaravImg: 'guide-chandan-wow.svg',
      aaravSay: '82 merged, all reviewed! ✅',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="10" r="4" stroke="currentColor" stroke-width="2"/>
        <circle cx="14" cy="38" r="4" stroke="currentColor" stroke-width="2"/>
        <circle cx="34" cy="20" r="4" stroke="#26890D" stroke-width="2"/>
        <path d="M14 14v20M34 24c0 8-8 8-16 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M29 36l3 3 6-6" stroke="#26890D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      tag:   'FAST',
      link:  '',
      stat:  '78s → 4s',
      title: 'Wait time cut by 95%.',
      sub:   'From a 78-second wait to 4 seconds — a 3-tier cache and parallel agents, measured before and after.',
      askQuestion: 'How did Chandan reduce latency from 78 seconds to 4 seconds?',
      aaravImg: 'guide-chandan-thinking.svg',
      aaravSay: '78s → 4s. Ask me how! ⚡',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" opacity="0.3"/>
        <path d="M24 12v12l7 4" stroke="#26890D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 24h4M36 24h4M24 8v4M24 40v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
        <path d="M10 38 L20 28" stroke="#ef4444" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        <path d="M38 10 L28 20" stroke="#046A38" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        <circle cx="24" cy="24" r="3" fill="#26890D"/>
      </svg>`,
    },
    {
      tag:   'AFFORDABLE',
      link:  '',
      stat:  '$0.000137',
      title: 'Per AI analysis.',
      sub:   'Unit economics a customer can sign off on: DeepSeek + semantic cache, 500× cheaper than GPT-4o, tracked per call.',
      askQuestion: 'How did Chandan achieve $0.000137 per AI analysis cost?',
      aaravImg: 'guide-chandan-happy.svg',
      aaravSay: '500× cheaper than GPT-4o! 💰',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 6 L28 18 L40 18 L30 26 L34 38 L24 30 L14 38 L18 26 L8 18 L20 18 Z" stroke="#ED8B00" stroke-width="2" stroke-linejoin="round" fill="rgba(237,139,0,0.1)"/>
        <path d="M24 13 L26 19 L32 19 L28 23 L29 29 L24 25 L19 29 L20 23 L16 19 L22 19 Z" fill="#ED8B00" opacity="0.4"/>
        <text x="24" y="44" text-anchor="middle" font-size="7" font-weight="700" fill="#ED8B00" font-family="monospace">COST</text>
      </svg>`,
    },
    {
      tag:   'SAFE',
      link:  '',
      stat:  '0',
      title: 'Hallucinated commands.',
      sub:   'Under incident pressure, RunbookAI returns commands verbatim from SQL — the design removes the risk, not a prompt.',
      askQuestion: 'How does RunbookAI achieve zero hallucinated commands?',
      aaravImg: 'guide-chandan-wow.svg',
      aaravSay: 'Zero hallucinations. Real. 🎯',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="16" stroke="#046A38" stroke-width="2"/>
        <path d="M17 24l5 5 9-10" stroke="#046A38" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 10 L38 38" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" opacity="0.3" stroke-dasharray="3 2"/>
        <rect x="13" y="20" width="10" height="3" rx="1" stroke="currentColor" stroke-width="1" opacity="0.25"/>
        <rect x="13" y="25" width="7" height="3" rx="1" stroke="currentColor" stroke-width="1" opacity="0.25"/>
      </svg>`,
    },
    {
      tag:   'SECURE',
      link:  '',
      stat:  'G1–G5',
      title: 'Guardrails a security team can review.',
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
    {
      tag:   'RELIABLE',
      link:  '',
      stat:  '637',
      title: 'Tests, running in under 4 seconds.',
      sub:   'Fast enough to run on every change, so shipping to a customer is routine, not risky.',
      askQuestion: 'How does Chandan keep 637 tests under four seconds?',
      aaravImg: 'guide-chandan-wow.svg',
      aaravSay: '637 tests, zero flakes! 🤩',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="2"/>
        <path d="M14 22l4 4 8-8" stroke="#046A38" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M30 20h6M30 24h4M30 28h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
        <circle cx="38" cy="36" r="7" fill="#09090b" stroke="#046A38" stroke-width="2"/>
        <path d="M35 36l2 2 4-4" stroke="#046A38" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      tag:   'ORCHESTRATED',
      link:  '',
      stat:  '18+',
      title: 'Agents in production-oriented systems.',
      sub:   'LangGraph graphs with parallel domain agents, conditional edges and human approval before results go out.',
      askQuestion: 'How does Chandan coordinate 16 AI agents without conflicts?',
      aaravImg: 'guide-chandan.svg',
      aaravSay: '16 agents, zero conflicts! 🤖',
      svgIcon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="10" r="5" stroke="#26890D" stroke-width="2"/>
        <circle cx="10" cy="34" r="5" stroke="#0D8390" stroke-width="2"/>
        <circle cx="38" cy="34" r="5" stroke="#046A38" stroke-width="2"/>
        <circle cx="24" cy="34" r="5" stroke="#ED8B00" stroke-width="2"/>
        <path d="M24 15 L10 29M24 15 L38 29M24 15 L24 29" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.5"/>
        <path d="M15 34 L19 34M29 34 L33 34" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
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
      title: 'Reject a pre_dispatch below one',
      desc: 'A pre_dispatch of 0 or a negative expression dispatched no tasks at all and returned an empty result, silently, instead of reporting the invalid value. joblib powers parallelism across scikit-learn and the ML stack.',
      pr: 'https://github.com/joblib/joblib/pull/1839',
      merged: 'Sep 2026',
    },
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
    {
      repo: 'authlib/authlib',
      logo: 'authlib-logo.svg',
      org: 'Authlib',
      stars: '5.4k★',
      title: 'correct protocol name in InsecureTransportError description',
      desc: 'Bug fix: the OAuth1 InsecureTransportError carried the description string from its OAuth2 counterpart, so an OAuth 1.0a client hitting an http:// endpoint was told "OAuth 2 MUST utilize https." Merged by the project lead. Authlib is the OAuth/OIDC layer behind a large share of Python auth.',
      pr: 'https://github.com/authlib/authlib/pull/919',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type pages as a Sequence rather than a list',
      desc: 'Bug fix: PdfDocCommon.pages was annotated list[PageObject] but returns a lazily-evaluated _VirtualList, with the mismatch suppressed by a type: ignore. A type checker therefore accepted reader.pages.append(page), which raises at runtime. Also cleared 16 typeguard failures in the test suite.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3957',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Always define PdfWriter._reader',
      desc: 'Bug fix: PdfWriterProtocol declares _reader, but PdfWriter only assigned it in incremental mode — so a writer built the normal way did not satisfy the protocol it gets passed as. Cleared 62 runtime type-check failures across the test suite.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3960',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type _id_translated to match what it holds',
      desc: 'Bug fix: the writer\'s object-translation table is declared int-to-int, but each entry also stores the source document under a "PreventGC" key to keep it alive. Two type: ignore comments hid the mismatch and a runtime protocol check rejected the writer outright.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3970',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Detect minor version bumps in the release script',
      desc: 'Release tooling: the version bump always assumed a patch release, so every release containing an enhancement had to be corrected by hand. Now it reads the generated changelog sections — verified against all 39 releases in the project history.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3969',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Default decode_parms to a DictionaryObject',
      desc: 'Bug fix: a stream without an explicit /DecodeParms handed every filter a plain dict, but the decoders are typed for a DictionaryObject. Static checking missed it because the value flows through a stream lookup that returns Any.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3971',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Collect the fonts declared in the AcroForm /DR dictionary',
      desc: 'Bug fix: iterating a PDF dictionary yields its keys, so the AcroForm font walk was passing font names where font objects were expected and silently collecting nothing. Form fields inheriting their font from the document resources came back with an empty font set.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3983',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Accept an ArrayObject when constructing a RectangleObject',
      desc: 'RectangleObject was typed to accept only a tuple or another RectangleObject, but every caller inside pypdf hands it an ArrayObject read from the PDF. Widened to the sequence it actually consumes, which cleared thirteen runtime type-check failures and a now-dead type: ignore.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3984',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Return None from remove_objects_from_page',
      desc: 'The early return handed back two empty lists from a function annotated to return None, suppressed with a type: ignore. Returning None matches the annotation and the other exit in the same function.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3985',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type the annotation list as holding PdfObject',
      desc: 'The annotations parameter was declared as a list of DictionaryObject, but the list read back from a page holds IndirectObject references. Typed to the base class both actually satisfy.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3986',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Accept any sequence of fit arguments in Fit',
      desc: 'Fit was typed to take a tuple, but the destination builder unpacks the PDF array and hands over a list, and the writer passes the list stored under /fit_args. Typed as the sequence the constructor actually iterates.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3990',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Accept any sequence as the annotation border',
      desc: 'The Link annotation and add_link declared the border as an ArrayObject, but the documented usage is a plain list and the argument is only sliced and indexed.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3991',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type the XMP stream as StreamObject rather than ContentStream',
      desc: 'XmpInformation is built from the /Metadata stream, a DecodedStreamObject. ContentStream is a sibling of that class rather than a parent, so the annotation could never hold. The class only calls get_data, set_data and write_to_stream, all on the shared base.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3995',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type character widths as float',
      desc: 'The /W array in a CIDFont may hold real numbers, and both parsing branches store the entry as read. A font with a width of 443.35938 put a float into a mapping annotated dict[str, int].',
      pr: 'https://github.com/py-pdf/pypdf/pull/3996',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type the xref stream as StreamObject rather than ContentStream',
      desc: 'A compressed cross-reference stream is read as an EncodedStreamObject, which is a sibling of ContentStream rather than a subclass, so the declared type could never hold. Typed to the base class the reader actually works with.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3972',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type the destination and field trees as DictionaryObject',
      desc: 'Both name-tree walks cast to TreeObject on objects that are plain dictionaries at runtime, and neither function calls anything TreeObject adds. Sixteen runtime type-check failures across the reader, writer and form tests.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3988',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type the second argument of mult as the mapping it accepts',
      desc: 'The layout-mode text extractor passes a ChainMap into a function annotated for two lists, suppressed with a type: ignore. Narrowed the key type to a Literal so the suppression could go.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3989',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Use the AnnotationFlag enum instead of a plain int',
      desc: 'The documentation set annotation.flags = 4 directly under a comment telling the reader to see AnnotationFlag for the other options, so it pointed at the enum while demonstrating a magic number.',
      pr: 'https://github.com/py-pdf/pypdf/pull/3997',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Note why the entity declaration flag is typed as a bool',
      desc: 'expat passes an int for is_parameter_entity, documented in expat.h and unchanged since 2003, but typeshed declares the handler with a bool. Records why the annotation stays as it is so the next reader does not repeat the detour.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4000',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Resolve the font resource before building a Font from it',
      desc: 'Two callers handed the raw /Font entry to a function that reads it as a dictionary. It only worked because IndirectObject forwards unknown attributes to the object it points at, so the lookups landed on the resolved dictionary by accident.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4002',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Reject a non-positive number when building a Roman numeral',
      desc: 'number2uppercase_roman_numeral(-1) returned CMXCIX: the loop subtracts each value it emits and stops once the remainder reaches zero, which a negative input satisfies after one pass. The letter styles beside it already refused non-positive input.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4005',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Reject a page range with a zero stride',
      desc: 'PageRange("::0") was accepted and PageRange.valid("::0") returned True, but slice() only raises once the range is applied, far from the string that caused it. Through PdfWriter.append the same input surfaced as a TypeError about the pages argument.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4004',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Use the FfBits enum instead of a plain integer for form flags',
      desc: 'update_page_form_field_values documents its flags as FieldDictionaryAttributes.FfBits, but the tests passed a bare 1 in five places. FfBits(1) is ReadOnly, so spelling it out says what the call is asking for.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4003',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'List the valid layouts in the page layout warning',
      desc: 'The warning passed a set built from an empty string and every layout joined with no separator, so it read as one run-on blob. page_mode next to it already joins its values with a comma.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4010',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Reject too few values when setting a page box',
      desc: 'page.mediabox = ArrayObject([0, 0]) was accepted, but reading the box back raised ValueError, so a page could be written with a box that could not be read. The getter still tolerates more than four values for backwards compatibility.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4009',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Check the value assigned to print_scaling',
      desc: '/PrintScaling was declared with an empty list of acceptable values, so any name was written through and the generated docstring read "Acceptable values: []". The spec allows /None and /AppDefault.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4011',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Reject an odd-length print page range',
      desc: '/PrintPageRange holds first/last page pairs, so an array with an odd number of entries leaves a range without its end. It was written through unchecked.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4013',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Reject a negative number of copies',
      desc: '/NumCopies was written through without a check, so a negative value was stored just as readily as a real count and no reader can interpret it. Zero stays allowed, since the spec gives no lower bound.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4012',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Check the box names assigned to the area and clip preferences',
      desc: '/ViewArea, /ViewClip, /PrintArea and /PrintClip were each declared with an empty list of acceptable values, so any name was written through. All four name one of the five page boundaries.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4014',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Report an out-of-range page number when adding a destination or URI',
      desc: 'add_named_destination and add_uri index the kids array with the page number directly, so a number past the end surfaced as a bare IndexError with nothing pointing at the argument that caused it.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4016',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Check the page label style and type it as the strings it accepts',
      desc: 'set_page_label never validated its style, so an unknown one was written into /S and then dropped on the way back out, leaving the caller with plain page numbers and a log line. PageLabelStyle is now a StrEnum.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4017',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the AcroForm fields entry is not an array',
      desc: 'get_fields casts /Fields to an ArrayObject and iterates it, so a file where that entry holds a number, a string or a dictionary brought down the whole read with a raw TypeError.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4019',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the viewer preferences are not a dictionary',
      desc: 'The property hands whatever /ViewerPreferences holds to a constructor that calls .items() on it, so a malformed entry raised AttributeError instead of being treated as absent.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4021',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash on a form field entry that is not a dictionary',
      desc: 'Building the field map tested /T membership on each entry of /Fields, so an array holding a number, a string or an array raised a TypeError instead of skipping the malformed entry.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4031',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the AcroForm entry is not a dictionary',
      desc: 'Reading the form fields looked for /Fields inside /AcroForm without checking it was a dictionary, so a number, a string or an array there raised a TypeError instead of returning None the way a missing /AcroForm already did.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4029',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the XObject resources are not a dictionary',
      desc: 'Collecting the images on a page iterated the /XObject resources without checking they were a dictionary, so a number, a string or an array there raised a TypeError instead of reporting no images.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4030',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Type read_object as the PdfObject it always returns',
      desc: 'The core object parser was annotated to return an int or a str it can never produce, so every caller worked around the phantom types; narrowing it removed six suppressions across three functions, including the last bare type: ignore in the package.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4038',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Reject a page box that is not an array',
      desc: 'A /MediaBox that was not an array fell through to a length check behind a type: ignore and failed with an error naming neither the box nor the problem; it now raises a ValueError naming the box, matching the existing too-few-values message.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4041',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when a destination tree node entry is not an array',
      desc: 'A name tree node holds its entries under /Names or /Kids, both read without a type check, so a malformed file crashed named_destinations on len() or iteration instead of reporting no destinations.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4039',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the annotations are not an array',
      desc: 'The annotations property cast the /Annots entry to an array and returned it unchecked, so a page whose /Annots was a number, a string or a dictionary crashed as soon as anything iterated it.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4046',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when a page tree entry is not a dictionary',
      desc: 'The page tree walk guarded the /Kids array but not the entries inside it, so a child that was a number, a string or an array crashed the whole document instead of being skipped.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4048',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the page resources are not a dictionary',
      desc: 'extract_text cast the inherited /Resources to a dictionary and then tested "/Font" in it, so a page whose /Resources was a number, a string or an array crashed instead of returning no text.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4054',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the font encoding differences are not an array',
      desc: 'A font /Encoding whose /Differences was a number, string or dictionary was cast to an array and iterated, so text extraction raised TypeError. Layout mode propagated it; the default mode silently dropped the font and returned wrong glyphs.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4058',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the XFA entry is not a well-formed array',
      desc: 'reader.xfa walked /XFA in tag/value pairs after a bare cast, so a non-array entry raised TypeError and an odd-length array raised StopIteration straight out of the property.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4064',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not look up a page size that does not exist yet',
      desc: 'insert_blank_page read an existing page\'s size before checking the caller supplied one, so on a writer with no pages it failed on the lookup instead of raising the documented PageSizeNotDefinedError.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4069',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Parse a string rect for add_uri into a rectangle',
      desc: 'add_uri documents a string rect in the form "[ xLL yLL xUR yUR ]", but wrapped it in a single NumberObject, which cannot parse that — the annotation /Rect became 0, leaving the link with no clickable area.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4074',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash on an outline action without a type',
      desc: 'An outline item whose /A action omits the required /S subtype raised a bare KeyError while reading the outline, so one malformed entry made the whole document unreadable. The entry is now reported and the item kept.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4098',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the font resources are not a dictionary',
      desc: 'A /Font entry that was a number, string or array made extract_text() fail with a TypeError, in plain and layout mode alike. Font resources are now read through one helper: a null entry counts as missing, anything else malformed is reported and treated as empty.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4138',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Keep the text shown before a change of direction',
      desc: 'A 6.19.0 regression: when Arabic or Persian text switched direction mid-line, extract_text() dropped everything shown before the switch, so digits and Latin words beside right-to-left text vanished. The completed runs are now kept and reach the visitor once.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4155',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the font /FirstChar is not a number',
      desc: 'A /FirstChar of null, a name or a string made layout-mode extract_text() fail with a TypeError. It is now reported and the widths are skipped, the same way a negative /FirstChar was already handled.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4163',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/fpdf2',
      logo: 'fpdf2-logo.png',
      org: 'py-pdf',
      stars: '1.5k★',
      title: 'Continue lettered list markers past z in write_html()',
      desc: 'Any <ol type="a"> list with more than 26 items crashed write_html() with IndexError. Markers now continue like browsers: a … z, aa, ab. On review I moved the loop into the shared int_to_letters() helper, replacing its recursive version. Approved and merged by andersonhc.',
      pr: 'https://github.com/py-pdf/fpdf2/pull/1987',
      merged: 'Oct 2026',
    },
    {
      repo: 'python-pillow/Pillow',
      logo: 'pillow-logo.png',
      org: 'python-pillow',
      stars: '13.9k★',
      title: 'Raise OSError for truncated or corrupt gzip FITS data',
      desc: 'Opening a damaged gzip-compressed FITS image raised a raw zlib.error or EOFError, so code catching OSError, as Pillow documents for broken images, missed it. Both are now raised as OSError, like the BLP decoder already does. Merged by radarhere.',
      pr: 'https://github.com/python-pillow/Pillow/pull/10146',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/fpdf2',
      logo: 'fpdf2-logo.png',
      org: 'py-pdf',
      stars: '1.5k★',
      title: 'Render an <a> without href as plain text in write_html()',
      desc: 'write_html() crashed with KeyError: \'href\' on a named anchor such as <a name="intro">. An <a> without href marks a spot, it is not a link, so its text is now printed as plain text. Approved and merged by andersonhc, who added me to the project\'s contributors.',
      pr: 'https://github.com/py-pdf/fpdf2/pull/1984',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Raise a clear error for a non-ASCII OS/2 Vendor',
      desc: 'A feature file with Vendor "éé" compiled, then saving the font crashed with a bare UnicodeEncodeError and no line number. A vendor ID is four ASCII characters, so feaLib now rejects it at the line. Follow-up to my #4259; merged by anthrotype.',
      pr: 'https://github.com/fonttools/fonttools/pull/4269',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Raise a clear error for a STAT axis location with no or too many values',
      desc: 'A STAT location takes 1, 2 or 3 values. With none or four, feaLib accepted it, silently skipped the record and then crashed in otlLib with a bare KeyError. The parser now rejects it at the right line. Merged by anthrotype.',
      pr: 'https://github.com/fonttools/fonttools/pull/4268',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Raise a clear error for a name string that cannot be encoded or decoded',
      desc: 'An unpaired surrogate such as \\d800 in a Windows name, or an emoji in a Mac Roman name, crashed feaLib with a bare UnicodeError and no line number. It now raises FeatureLibError at the string. Reviewed and merged by anthrotype after one round.',
      pr: 'https://github.com/fonttools/fonttools/pull/4267',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Raise a clear error for a UnicodeRange bit outside 0-127',
      desc: 'A feature file with UnicodeRange 200 was accepted by the parser and then failed while building with a bare ValueError and no line number. The parser now checks each bit and raises FeatureLibError at the right line. Merged by anthrotype.',
      pr: 'https://github.com/fonttools/fonttools/pull/4266',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Raise a clear error for a BASE script list without a matching tag list',
      desc: 'A feature file with a BaseScriptList before its BaseTagList crashed feaLib with UnboundLocalError, and a default baseline missing from the tag list failed later with a bare ValueError. Both now raise FeatureLibError with the line number. Merged by anthrotype.',
      pr: 'https://github.com/fonttools/fonttools/pull/4263',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Skip a Tj operator whose operand is not a string',
      desc: 'A Tj text operator with a number instead of a string made extract_text() raise a TypeError, in plain and layout mode alike. Such a Tj is now skipped and the text around it is kept. Merged by stefan6419846.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4171',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Skip a TJ operator whose operand is not an array',
      desc: 'A TJ text operator with a number instead of an array made extract_text() raise a TypeError, in plain and layout mode alike. Such a TJ is now skipped and the text around it is kept. Merged by stefan6419846.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4166',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Skip a Do operator without an operand in extract_text',
      desc: 'A content stream with a bare Do operator made extract_text() raise an IndexError, from inside its own warning. A Do without an operand is now skipped, as the image extraction loop already did, and the text around it is kept.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4165',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Pad a short OS/2 Vendor ID with spaces in feaLib',
      desc: 'A feature file with a short vendor ID such as Vendor "AB" was written as AB followed by two NUL bytes, while the OpenType spec pads a Tag with spaces. feaLib now pads the vendor ID to four characters with spaces, as the fontTools maintainers settled in #3280. Approved and merged by anthrotype.',
      pr: 'https://github.com/fonttools/fonttools/pull/4259',
      merged: 'Oct 2026',
    },
    {
      repo: 'fonttools/fonttools',
      logo: 'fonttools-logo.svg',
      org: 'fonttools',
      stars: '5.3k★',
      title: 'Read CFF font names as latin-1, like the compiler writes them',
      desc: 'fontTools could save a CFF font with a non-ASCII name but not read it back: the Name INDEX was decoded as ASCII while the compiler writes latin-1, so reopening the file made the whole CFF table unreadable. Names are now read the way they are written. Approved and merged by anthrotype.',
      pr: 'https://github.com/fonttools/fonttools/pull/4253',
      merged: 'Oct 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Raise a clear error for a rectangle without four values',
      desc: 'RectangleObject asserted its length, so a malformed box failed with a bare AssertionError carrying no values — and vanished entirely under python -O. It now raises a ValueError naming the count and the sequence it was given.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4123',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash on a composite font without descendant fonts',
      desc: 'from_font_resource read /DescendantFonts directly on the composite-font branch, with a comment stating the entry need not be tested for. That holds for the subtype, not the entry: a /Type0 font omitting it raised a bare KeyError out of extract_text().',
      pr: 'https://github.com/py-pdf/pypdf/pull/4119',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the font widths are not an array',
      desc: 'A /Widths entry holding a string was iterated character by character and passed to int(), raising ValueError out of extract_text(). The entry is now checked and an unreadable width table is reported and skipped.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4118',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the page label kids are not an array',
      desc: 'index2label cast the /Kids entry of a number tree to a list of dictionaries and iterated it, so a file storing a string there raised AttributeError from reader.page_labels.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4102',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Use the page top for a named destination instead of a fixed value',
      desc: 'add_named_destination built its /FitH destination with a hardcoded top of 826, a value matching no real page size. On US Letter it pointed 34 units above the page, so the viewer scrolled past the content instead of to it; it now reads the page mediabox.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4099',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Raise a clear TypeError for an unsupported page_number',
      desc: 'add_outline_item only assigned page_ref for three accepted types; anything else fell through unassigned, so the next line raised UnboundLocalError instead of naming the bad argument.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4080',
      merged: 'Sep 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the outlines entry is not a dictionary',
      desc: 'The outline reader cast the catalog /Outlines entry to a DictionaryObject and subscripted it, so a file storing a number or an array there brought down the read with a TypeError.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4023',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the page labels are not a dictionary',
      desc: 'index2label casts /PageLabels to a DictionaryObject and tests membership on the result, so a malformed entry raised a TypeError rather than falling back to the page position.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4022',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash on an outline node that is not a dictionary',
      desc: 'The outline walk casts /First to a DictionaryObject and subscripts it, so a file where that entry holds a number, a string or an array brought down the whole read with a raw TypeError. The same loop already warns and stops on a cycle.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4018',
      merged: 'Aug 2026',
    },
    {
      repo: 'py-pdf/pypdf',
      logo: 'pypdf-logo.svg',
      org: 'py-pdf',
      stars: '10.1k★',
      title: 'Do not crash when the destination tree is not a dictionary',
      desc: '_get_named_destinations casts /Dests and /Names to a DictionaryObject and then tests membership on the result, so a file where either holds a number, a string or an array brought down the whole read with a raw TypeError.',
      pr: 'https://github.com/py-pdf/pypdf/pull/4020',
      merged: 'Aug 2026',
    },
    // Next merges go here — e.g. pypdf #3972, uvicorn #3062 (in review).
  ];

  // ── Open-source browser: filter by library, sort, paginate ──────────────
  //    56 cards at once is a wall. Show 9, let people narrow it down.
  readonly ossPageSize = 9;
  ossLibrary = signal<string>('all');
  ossSort = signal<'newest' | 'oldest' | 'stars' | 'library'>('newest');
  ossPage = signal(1);

  /** Library tabs with counts, biggest first. */
  readonly ossLibraries = computed(() => {
    const counts = new Map<string, { org: string; logo: string; n: number }>();
    for (const o of this.openSource) {
      const e = counts.get(o.repo) ?? { org: o.org, logo: o.logo, n: 0 };
      e.n++;
      counts.set(o.repo, e);
    }
    return [...counts.entries()]
      .map(([repo, v]) => ({
        repo,
        ...v,
        // Slug from the repo name: the `org` field is free text
        // ('Hugging Face', 'NLTK'), so it cannot key a CSS selector.
        slug: repo.split('/')[1].toLowerCase(),
      }))
      .sort((a, b) => b.n - a.n);
  });

  private starValue(s: string): number {
    const v = s.replace('★', '').trim();
    return v.endsWith('k') ? parseFloat(v) * 1000 : parseFloat(v);
  }

  /** PR number is the only reliable chronology — the merged label is month-level. */
  private prNumber(url: string): number {
    return Number(url.split('/').pop() ?? 0);
  }

  readonly ossFiltered = computed(() => {
    const lib = this.ossLibrary();
    const rows = lib === 'all'
      ? [...this.openSource]
      : this.openSource.filter(o => o.repo === lib);

    switch (this.ossSort()) {
      case 'oldest':
        return rows.sort((a, b) => this.prNumber(a.pr) - this.prNumber(b.pr));
      case 'stars':
        return rows.sort((a, b) =>
          this.starValue(b.stars) - this.starValue(a.stars) ||
          this.prNumber(b.pr) - this.prNumber(a.pr));
      case 'library':
        return rows.sort((a, b) =>
          a.repo.localeCompare(b.repo) || this.prNumber(b.pr) - this.prNumber(a.pr));
      default:
        return rows.sort((a, b) => this.prNumber(b.pr) - this.prNumber(a.pr));
    }
  });

  readonly ossTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.ossFiltered().length / this.ossPageSize)));

  readonly ossVisible = computed(() => {
    // Clamp: a filter change can leave us past the last page.
    const page = Math.min(this.ossPage(), this.ossTotalPages());
    const start = (page - 1) * this.ossPageSize;
    return this.ossFiltered().slice(start, start + this.ossPageSize);
  });

  readonly ossPageNumbers = computed(() =>
    Array.from({ length: this.ossTotalPages() }, (_, i) => i + 1));

  readonly ossRangeLabel = computed(() => {
    const total = this.ossFiltered().length;
    if (!total) return 'No matches';
    const page = Math.min(this.ossPage(), this.ossTotalPages());
    const from = (page - 1) * this.ossPageSize + 1;
    return `${from}\u2013${Math.min(from + this.ossPageSize - 1, total)} of ${total}`;
  });

  setOssLibrary(repo: string): void {
    this.ossLibrary.set(repo);
    this.ossPage.set(1);
  }

  setOssSort(sort: 'newest' | 'oldest' | 'stars' | 'library'): void {
    this.ossSort.set(sort);
    this.ossPage.set(1);
  }

  goOssPage(n: number): void {
    this.ossPage.set(Math.min(Math.max(1, n), this.ossTotalPages()));
    document.getElementById('opensource')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }


  // ── Interactive knowledge graph (hero section below the fold) ──────────────
  //    Nodes are the real things on this page; edges are how they actually
  //    connect. Physics runs in a canvas — see initGraph() further down.
  graphNodes: GraphNode[] = [];
  graphEdges: [string, string][] = [];

  /** The technologies on the cage, matched against each project's and job's own text. */
  private readonly GRAPH_TECH: { id: string; label: string; detail: string; match: RegExp }[] = [
    { id: 'python',    label: 'Python',          detail: 'Primary language for all AI work',              match: /python|fastapi|pytest/i },
    { id: 'langgraph', label: 'LangGraph',       detail: 'Stateful multi-agent orchestration',            match: /langgraph/i },
    { id: 'langchain', label: 'LangChain',       detail: 'LLM chains, tools, retrievers',                 match: /langchain/i },
    { id: 'llm',       label: 'LLMs',            detail: 'DeepSeek, OpenAI and Claude behind one interface', match: /\bllms?\b|deepseek|openai|gpt|claude|gemini/i },
    { id: 'rag',       label: 'RAG',             detail: 'Hybrid retrieval · HyDE · CRAG · RRF fusion',   match: /\brag\b|faiss|bm25|retriev/i },
    { id: 'vision',    label: 'Computer vision', detail: 'YOLO11 on CPU · MediaPipe on the phone',        match: /vision|yolo|mediapipe|onnx/i },
    { id: 'fastapi',   label: 'FastAPI',         detail: 'Async Python APIs',                             match: /fastapi/i },
    { id: 'angular',   label: 'Angular',         detail: 'This portfolio, and every project UI',          match: /angular/i },
    { id: 'java',      label: 'Java/Spring',     detail: '4 years of production backend',                 match: /java\b|spring/i },
    { id: 'kafka',     label: 'Kafka',           detail: 'Async jobs, DLQ, event streaming',              match: /kafka/i },
    { id: 'cloud',     label: 'Docker · Cloud',  detail: 'Docker, Render, Vercel, AWS, CI/CD',            match: /docker|render|vercel|aws|kubernetes|ci\/cd/i },
    { id: 'security',  label: 'AI security',     detail: 'Guardrails, injection and PII checks, evals',   match: /guardrail|security|injection|pii|hallucinat/i },
    { id: 'auth',      label: 'Multi-tenant auth', detail: 'Signed tenant keys, JWT, roles, daily caps',  match: /tenant|jwt|rbac|\bauth/i },
  ];

  private readonly GRAPH_LIBRARY_NAMES: Record<string, string> = {
    'sentence-transformers': 'Sentence Transformers', nltk: 'NLTK', authlib: 'Authlib', fonttools: 'fontTools', fpdf2: 'fpdf2', Pillow: 'Pillow',
  };

  /** Short hover lines for the projects; anything else falls back to its subtitle. */
  private readonly GRAPH_PROJECT_DETAIL: Record<string, string> = {
    '01': 'Live · 16 agents · 415 tests · 23 languages',
    '08': 'Live · 7 agents · multi-tenant · 34 tests',
    '09': 'Live · on-CPU vision · 3 languages · 211 tests',
    '02': 'Hybrid RAG + multi-agent · G1–G5 guardrails · 222 tests',
  };

  /**
   * Everything on this page as nodes on the cage, built from the page's own data so
   * it never drifts: every project, every job, each open-source library with its live
   * merge count, the technologies, and the six steps of how I work. Edges are real:
   * a project or job links to a technology only when its own text names it.
   */
  private buildGraph(): void {
    const nodes: GraphNode[] = [];
    const edges: [string, string][] = [];
    const textOf = (...parts: unknown[]) => JSON.stringify(parts);

    for (const t of this.GRAPH_TECH) nodes.push({ id: t.id, label: t.label, kind: 'tech', detail: t.detail });

    for (const p of this.projects) {
      const id = `project-${p.num}`;
      nodes.push({
        id, label: p.title, kind: 'system',
        detail: this.GRAPH_PROJECT_DETAIL[p.num] ?? p.subtitle,
        target: id,
      });
      const text = textOf(p.title, p.subtitle, p.desc, p.tags, p.challenges);
      for (const t of this.GRAPH_TECH) if (t.match.test(text)) edges.push([id, t.id]);
      if (p.inProduction) edges.push([id, 'step-4'], [id, 'step-3']);   // live: integrated and hardened
    }

    this.experience.forEach((e, i) => {
      const id = `work-${i}`;
      nodes.push({ id, label: e.company.split(' — ')[0], kind: 'work', detail: `${e.role} · ${e.company}`, target: 'experience' });
      const text = textOf(e);
      for (const t of this.GRAPH_TECH) if (t.match.test(text)) edges.push([id, t.id]);
      if (i > 0) edges.push([id, `work-${i - 1}`]);                     // the career path, in order
    });
    edges.push(['work-0', 'step-0']);                                     // forward deployed at Deloitte: embedded with the team

    const libs = new Map<string, number>();
    for (const o of this.openSource) libs.set(o.repo, (libs.get(o.repo) ?? 0) + 1);
    for (const [repo, count] of [...libs].sort((a, b) => b[1] - a[1])) {
      const name = repo.split('/')[1];
      const id = `oss-${name.toLowerCase()}`;
      nodes.push({
        id, label: this.GRAPH_LIBRARY_NAMES[name] ?? name, kind: 'oss',
        detail: `${count} PR${count === 1 ? '' : 's'} merged by its maintainers`,
        url: `https://github.com/${repo}/pulls?q=is%3Apr+author%3ARavSinghChandan+is%3Amerged`,
      });
      edges.push([id, 'python'], [id, 'step-4']);                        // open source here is hardening Python libraries
    }

    this.deployLoop.forEach((s, i) => {
      nodes.push({ id: `step-${i}`, label: s.name, kind: 'practice', detail: `How I work · ${s.desc}`, target: 'skills' });
      edges.push([`step-${i}`, `step-${(i + 1) % this.deployLoop.length}`]);
    });

    this.graphNodes = nodes;
    this.graphEdges = edges;
  }

  /** Open what a node stands for: its PR list, its project card or its section. */
  private openGraphNode(node: GraphNode): void {
    if (node.url) {
      window.open(node.url, '_blank', 'noopener');
      return;
    }
    if (!node.target) return;
    if (node.target.startsWith('project-')) {
      this.clearTagFilter();
      const index = this.sortedProjects.findIndex(p => `project-${p.num}` === node.target);
      if (index < 0) return;
      this.projPage.set(index + 1);
      // the card renders on the next change detection; scroll to it, not the section top
      setTimeout(() => document.getElementById(node.target!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
    document.getElementById(node.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  graphHover = signal<GraphNode | null>(null);
  graphReady = signal(false);

  // ── Forward deployed engineering: how I work + what I bring, with evidence ──
  readonly deployLoop = [
    { name: 'Embed',     desc: 'Sit with users, data and constraints' },
    { name: 'Scope',     desc: 'Turn ambiguity into a design' },
    { name: 'Prototype', desc: 'A working agent, fast' },
    { name: 'Integrate', desc: 'Into existing auth, APIs and data' },
    { name: 'Harden',    desc: 'Tests, guardrails, evals, cost' },
    { name: 'Hand over', desc: 'Docs, demos, a team that owns it' },
  ];

  // The loop turns forward forever: loopTurn only ever increases, so the
  // highlighted sector never spins backwards from step 6 to step 1.
  loopTurn = signal(0);
  readonly loopStep = computed(() => this.loopTurn() % this.deployLoop.length);
  private loopHover = false;
  private loopHoldUntil = 0;                       // any interaction holds auto-play
  private loopTimer: ReturnType<typeof setInterval> | undefined;

  readonly live = inject(LiveStatus);
  readonly prTrack = ['opened', 'review', 'CI', 'merged'];

  /** Built for Forward Deployed Work: each card acts out its skill. */
  private readonly fdeSteps: Record<string, { labels: string[]; caption: string; live: boolean }> = {
    'Discover & Scope': { labels: ['problem', 'constraint', 'decision', 'result'], caption: 'every flagship is written up this way', live: false },
    'Full-Stack Delivery': { labels: ['UI', 'API', 'DB', 'API', 'UI'], caption: 'Angular / React → FastAPI / Spring → Postgres, and back', live: false },
    'Enterprise Integration': { labels: ['Spring', 'Kafka', 'consumer', 'Postgres'], caption: 'into existing auth, APIs and data, no rewrites', live: false },
    'Production Engineering': { labels: ['build', 'test', 'docker', 'deploy', 'health'], caption: 'the last stage is real', live: true },
    'Communication & Ownership': { labels: ['brief', 'demo', 'handover'], caption: 'docs, demos, a team that owns it', live: false },
  };
  fdeViz(title: string) { return this.fdeSteps[title] ?? null; }

  /** Proof cards: a soft light follows the pointer across the card. */
  spot(e: PointerEvent): void {
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }

  setLoop(i: number): void {
    const n = this.deployLoop.length;
    const cur = this.loopTurn();
    this.loopTurn.set(cur + ((i - (cur % n)) + n) % n);
    this.loopHoldUntil = Date.now() + 8000;
  }
  pauseLoop(): void { this.loopHover = true; this.loopHoldUntil = Date.now() + 8000; }
  resumeLoop(): void { this.loopHover = false; }
  private startLoop(): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.loopTimer = setInterval(() => {
      if (!this.loopHover && Date.now() > this.loopHoldUntil) this.loopTurn.update(t => t + 1);
    }, 2800);
  }

  readonly stackLayers = [
    { layer: 'AI & Agents', items: 'LangGraph · LangChain · RAG · Tool calling · Evals' },
    { layer: 'Backend',     items: 'Python · Java · FastAPI · Spring Boot' },
    { layer: 'Frontend',    items: 'Angular · React · TypeScript' },
    { layer: 'Data',        items: 'PostgreSQL · Redis · Kafka · FAISS' },
    { layer: 'Ship & Run',  items: 'Docker · Kubernetes · AWS · CI/CD' },
    { layer: 'Security',    items: 'Guardrails · PII · Injection defence' },
  ];

  skills = [
    { title: 'Discover & Scope', color: 'cyan', items: ['md','figma'],
      what: 'Turn an ambiguous ask into a scoped, defensible design before writing code.',
      evidence: 'Every flagship is written up as Problem → Constraint → Decision → Result. RunbookAI went RAGless after scoping the real risk: a hallucinated command mid-incident.',
      labels: ['Problem framing','System design','Trade-off analysis','Build vs buy','Risk mapping'] },
    { title: 'Agentic AI Engineering', color: 'purple', items: ['python','pytorch','fastapi'],
      what: 'Agents that plan, call tools and recover from failure — not just chat.',
      evidence: '18+ agents across production-oriented systems; 16 coordinated in one LangGraph graph; hybrid RAG with HyDE, CRAG and reranking.',
      labels: ['LangGraph','LangChain','Multi-agent','Tool calling','RAG','AI evaluation','Prompt engineering'] },
    { title: 'Full-Stack Delivery', color: 'blue', items: ['angular','react','typescript','fastapi'],
      what: 'From API to interface — something a real user can pick up and use.',
      evidence: 'Every system ships with its own UI: Angular dashboards, live SSE/WebSocket pipeline views, and Angular, React and plain-JS SDKs for Universal Agent.',
      labels: ['Angular','React','TypeScript','FastAPI','Spring Boot','SSE','WebSockets'] },
    { title: 'Enterprise Integration', color: 'green', items: ['java','spring','kafka','postgres'],
      what: 'Fit into the systems a customer already runs, instead of asking them to change.',
      evidence: 'One agent engine embedded in 4 apps through SDKs and YAML; multi-tenant JWT with 3 roles; Kafka pipelines in a Bank of America environment; LLM provider switched by config.',
      labels: ['REST APIs','SDKs','JWT / RBAC','Multi-tenant','Kafka','Event-driven','LLM abstraction'] },
    { title: 'Production Engineering', color: 'amber', items: ['docker','kubernetes','aws','githubactions'],
      what: 'Fast, cheap, observable and hard to break once real traffic arrives.',
      evidence: '637 tests running in under 4 s; latency cut from 78 s to 4 s; $0.000137 per analysis; circuit breakers and two-tier semantic caching.',
      labels: ['Testing','Caching','Circuit breakers','Observability','Cost control','Docker','Kubernetes','AWS','CI/CD'] },
    { title: 'AI Security', color: 'red', items: ['regex','linux','python'],
      what: 'Agents a security team will actually sign off on.',
      evidence: 'G1–G5 guardrails — rate limiting, injection detection, PII filtering, faithfulness gate, output validation. Now in Deloitte USI\'s Agentic AI & Security work.',
      labels: ['Prompt-injection defence','PII protection','Output validation','Secure tool use','Threat modelling'] },
    { title: 'Communication & Ownership', color: 'cyan', items: ['github','md','linkedin'],
      what: 'Explain the system to engineers, leaders and reviewers — and own the outcome.',
      evidence: '82 PRs merged through outside maintainers\' review; teaches AI on YouTube (AI with Rav); wrote the AI System Design Blueprint explaining 15 production patterns.',
      labels: ['Technical writing','Demos','Stakeholder updates','Code review','Teaching'] },
  ];

  experience = [
    {
      company: 'Deloitte USI',
      role: 'Software Engineer II · Agentic AI & AI Security',
      location: 'Bengaluru, India',
      period: 'Sep 2026 – Present',
      color: 'purple',
      isPresent: true,
      points: [
        'Working at the intersection of Agentic AI and Security, building on an enterprise agentic application / harness platform for engineering and security workflows',
        'Building agentic capabilities focused on automation, secure AI adoption, application integration and reliable enterprise execution',
        'Applying Java, Python, APIs and distributed-systems principles to production-oriented enterprise solutions',
      ],
      companyBadge: '',
    },
    {
      company: 'Infosys — Bank of America',
      companyLogo: 'https://skillicons.dev/icons?i=azure',
      logoAlt: 'Infosys',
      role: 'Senior Software Engineer',
      location: 'Pune, India',
      period: 'Nov 2025 – Sep 2026',
      color: 'cyan',
      isPresent: false,
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
      period: 'Dec 2023 – Oct 2025',
      color: 'green',
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
      period: 'May 2023 – Dec 2023',
      color: 'amber',
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
      period: 'Aug 2022 – May 2023',
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
    experience: { img: 'guide-chandan-thinking.svg', quote: 'Self-made. 🎯',       sub: '5 companies. Real.' },
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
      quote: "Right person! 👋 An engineer who takes AI past the demo.",
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
      quote: "16 AI agents, 23 languages, 415 tests. Real engineering. 🔮",
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
      quote: "Kolkata → Masai bootcamp → 4 companies → Deloitte. 🏆",
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
    '09': [
      { img: 'poultry-step1-welcome.png', label: '☸️ Step 1 — Every flow is a chakra', caption: 'The welcome page: getting access is four steps around one wheel, and each tool shows its own steps, in Bengali, Hindi or English.' },
      { img: 'poultry-step2-admin.png', label: '🔑 Step 2 — I approve, the farm gets a key', caption: 'A farm registers; on the owner page I approve it and get a signed tenant key, a username and a one-click sign-in link to send on WhatsApp.' },
      { img: 'poultry-step3-count.png', label: '📷 Step 3 — Signed in, ready to count', caption: 'The farm is signed in with its own name; the chakra shows step 1 of the count: take a photo or a video of the shed.' },
      { img: 'poultry-step4-counted.png', label: '🐔 Step 4 — Every bird boxed', caption: 'YOLO11 on the CPU finds each bird, marks it clear or uncertain, gives a likely range, and the farmer confirms the number that is kept.' },
      { img: 'poultry-step5-feed.png', label: '🌾 Step 5 — Feed from a published table', caption: 'The exact ration for the birds\' age, with protein, energy and kilograms for today, each traced to NRC and BIS standards.' },
    ],
    '08': [
      { img: 'aaina-step1-home.png', label: '🪞 Step 1 — Eight steps, one chakra', caption: 'The landing page: the consultation is eight steps around one wheel, and each step fills in as you go.' },
      { img: 'aaina-step2-photo.png', label: '📏 Step 2 — Measured on your phone', caption: 'One selfie. MediaPipe finds 478 face points on the device and measures face shape, hair colour and length; the photo is never stored.' },
      { img: 'aaina-step3-agents.png', label: '⚙️ Step 3 — Seven agents at work', caption: 'Spin the chakra: the profile, haircut, hair-care and face-care agents run as a DAG, each one lighting up as it finishes.' },
      { img: 'aaina-step4-looks.png', label: '✂️ Step 4 — Three cuts that suit you', caption: 'Your real photo next to the three best cuts, each drawn in your face shape, skin tone, hair colour and beard, with why it suits you.' },
      { img: 'aaina-step5-routines.png', label: '🗓️ Step 5 — Routines and a calendar', caption: 'Hair and face routines and a care calendar, written by DeepSeek and checked against a schema before they reach you.' },
    ],
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
        speech: 'Hmm... now let me fill in my birth details. This powers ALL 16 agents! 🔮',
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
        speech: '222 tests, seconds not minutes, zero shortcuts — and now you can see it all live in production metrics! 🚀',
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
        caption: 'Agent responds with deep knowledge of all 4 enterprise platforms. It knows AstroIntel (16 agents, G1–G5 guardrails), Bench (Hybrid RAG, 222 tests), RunbookAI (RAGless SQL), and Agentic Growth OS (auto-learning). Cross-platform intelligence from a single configured agent.',
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
  statOss    = signal(0);
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
    const CLUSTER_COLORS = ['#26890D', '#0D8390', '#6366f1', '#2dd4bf', '#a855f7', '#3b82f6'];

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
      let saved: string | null = null;
      try { saved = localStorage.getItem('ck-theme'); } catch { /* storage blocked */ }
      this.applyTheme(saved === 'light' ? 'light' : 'dark');
    }
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08 });
    this.fadeEls.forEach(el => observer.observe(el.nativeElement));

    // Section diagrams animate only while their section is on screen.
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const geoIo = new IntersectionObserver(entries => {
        entries.forEach(e => e.target.querySelector('.sec-geo')?.classList.toggle('geo-live', e.isIntersecting));
      }, { threshold: 0.05 });
      document.querySelectorAll('section').forEach(sec => { if (sec.querySelector(':scope > .sec-geo')) geoIo.observe(sec); });
    }
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
          this.animateCount(this.statOss,      this.openSource.length, 1200);
          this.animateCount(this.statTests,    637, 1400);
          this.animateCount(this.statAgents,    18,  900);
          this.animateCount(this.statProjects, this.projects.length, 600);
          this.animateCount(this.statYears,       4,  600);
        }
      }, { threshold: 0.5 });
      statsObs.observe(heroEl);
    }

    this.initFloatingGuide();
    this.startLoop();

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
    try { localStorage.setItem('ck-theme', next); } catch { /* storage blocked */ }
  }

  private applyTheme(t: 'dark' | 'light') {
    this.theme.set(t);
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
    document.body.style.background = t === 'dark' ? '#000000' : '#ffffff';
    document.body.style.color = t === 'dark' ? '#ffffff' : '#000000';
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
    const sections = ['skills','projects','by-numbers','opensource','experience','story','contact'];
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
        ? `${reply}<div style="margin-top:0.6rem;padding:0.3rem 0.6rem;border-radius:6px;background:var(--cb-head-bg);border-left:3px solid #C26E00;color:var(--cb-text);font-size:0.72rem;font-style:italic">⚠️ <strong style="color:var(--cb-head-color)">2 questions remaining</strong> in this session</div>`
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

  // ── Interactive knowledge graph — a C60 buckminsterfullerene ───────────────
  //  The real nodes (see buildGraph) are carried on the vertices of a truncated icosahedron:
  //  60 vertices, 90 edges, 12 pentagons and 20 hexagons — the actual buckyball.
  //  It rotates in 3D; drag to spin it, hover a carried vertex to trace what it
  //  touches, click a green one to open the merged PR.
  //
  //  Geometry: a truncated icosahedron is the icosahedron with each vertex cut
  //  off. Its 60 vertices are the even permutations of
  //      (0, ±1, ±3φ) · (±1, ±(2+φ), ±2φ) · (±2, ±(1+2φ), ±φ)
  //  with φ the golden ratio. Two vertices share an edge iff they sit at the
  //  minimum separation (2), which is what gives the hexagon/pentagon mesh.

  private gBodies: GraphBody[] = [];
  private gCtx: CanvasRenderingContext2D | null = null;
  private gCanvas: HTMLCanvasElement | null = null;
  private gRaf = 0;
  private gDrag: GraphBody | null = null;
  private gPointer = { x: -9999, y: -9999, down: false };
  private gHoverId: string | null = null;
  private gNeighbours = new Map<string, Set<string>>();

  // buckyball state
  private bVerts: { x: number; y: number; z: number }[] = [];   // unit-sphere vertices
  private bBonds: [number, number][] = [];                      // the 90 C–C bonds
  private bProj: { x: number; y: number; z: number; s: number }[] = [];
  private bCarrier: number[] = [];        // which vertex carries graphNodes[i]
  private bRotX = -0.35;                  // current orientation
  private bRotY = 0.6;
  private bSpinX = 0;                     // idle spin
  private bSpinY = 0.0022;
  private bDragging = false;
  private bLast = { x: 0, y: 0 };
  private bRadius = 200;

  private readonly G_COLORS: Record<GraphNode['kind'], string> = {
    system: '#00ABAB',  // teal       — things I built
    tech:   '#62B5E5',  // light blue — technologies
    oss:    '#86BC25',  // green      — merged open source
    work:   '#FFB81C',  // gold       — experience
    practice: '#C4D600', // lime      — how I work
  };

  //  The cage carries seven colours, one per family: the four node kinds above,
  //  with the open-source vertices split by the library they landed in so a
  //  glance shows the spread rather than one wall of green.
  private readonly OSS_COLORS: Record<string, string> = {
    pypdf:    '#86BC25',  // Deloitte green
    joblib:   '#fb7185',  // rose
    'sentence-transformers': '#f472b6', // pink
    nltk:     '#E3E48D',  // pale lime
    authlib:  '#A0DCFF',  // sky
    fonttools: '#7C9CFF', // periwinkle
    fpdf2:    '#F87171',  // coral, from its logo
    Pillow:   '#FB923C',  // orange, from its logo
  };

  /** Colour for a node: open-source vertices are keyed by library. */
  // Deeper versions of the same hues, readable on the light theme's white stage.
  private readonly G_COLORS_LIGHT: Record<GraphNode['kind'], string> = {
    system: '#0D8390', tech: '#007CB0', oss: '#26890D', work: '#C26E00', practice: '#6B7A00',
  };
  private readonly OSS_COLORS_LIGHT: Record<string, string> = {
    pypdf: '#26890D', joblib: '#E11D48', 'sentence-transformers': '#DB2777', nltk: '#A16207', authlib: '#0369A1', fonttools: '#3B5BDB', fpdf2: '#DC2626', Pillow: '#EA580C',
  };

  private nodeColor(n: GraphNode): string {
    const light = this.theme() === 'light';
    if (n.kind === 'oss') {
      const library = n.id.replace(/^oss-/, '');
      return (light ? this.OSS_COLORS_LIGHT : this.OSS_COLORS)[library] ?? (light ? this.G_COLORS_LIGHT : this.G_COLORS).oss;
    }
    return (light ? this.G_COLORS_LIGHT : this.G_COLORS)[n.kind];
  }

  /** Build the 60 vertices + 90 bonds of a truncated icosahedron. */
  private buildBuckyball() {
    const P = (1 + Math.sqrt(5)) / 2;              // golden ratio
    const raw: number[][] = [];
    // even cyclic permutations of the three coordinate triples, all sign combos
    const seeds = [
      [0, 1, 3 * P],
      [1, 2 + P, 2 * P],
      [2, 1 + 2 * P, P],
    ];
    const cyc = (t: number[]) => [
      [t[0], t[1], t[2]],
      [t[1], t[2], t[0]],
      [t[2], t[0], t[1]],
    ];
    for (const seed of seeds) {
      for (const p of cyc(seed)) {
        for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
          const v = [p[0] * sx, p[1] * sy, p[2] * sz];
          // skip duplicates produced when a component is 0
          if (!raw.some(o => Math.abs(o[0] - v[0]) < 1e-9 && Math.abs(o[1] - v[1]) < 1e-9 && Math.abs(o[2] - v[2]) < 1e-9)) {
            raw.push(v);
          }
        }
      }
    }
    // normalise onto the unit sphere
    const norm = Math.hypot(raw[0][0], raw[0][1], raw[0][2]);
    this.bVerts = raw.map(v => ({ x: v[0] / norm, y: v[1] / norm, z: v[2] / norm }));

    // bonds = pairs at the minimum separation
    let min = Infinity;
    for (let i = 0; i < this.bVerts.length; i++) {
      for (let j = i + 1; j < this.bVerts.length; j++) {
        const d = this.v3dist(this.bVerts[i], this.bVerts[j]);
        if (d < min) min = d;
      }
    }
    this.bBonds = [];
    for (let i = 0; i < this.bVerts.length; i++) {
      for (let j = i + 1; j < this.bVerts.length; j++) {
        if (this.v3dist(this.bVerts[i], this.bVerts[j]) < min * 1.12) this.bBonds.push([i, j]);
      }
    }
  }

  private v3dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  /**
   * Spread the real nodes over the sphere so no two land adjacent — a greedy
   * farthest-point pick, grouped by kind so each colour reads as a cluster.
   */
  private assignCarriers() {
    // The buckyball has 60 vertices, so at most 60 nodes can be carried.
    const n = Math.min(this.graphNodes.length, this.bVerts.length);
    const chosen: number[] = [];
    // start from the vertex nearest the +Y pole for a stable, repeatable layout
    let start = 0, bestY = -Infinity;
    this.bVerts.forEach((v, i) => { if (v.y > bestY) { bestY = v.y; start = i; } });
    chosen.push(start);
    while (chosen.length < n) {
      let best = -1, bestD = -Infinity;
      for (let i = 0; i < this.bVerts.length; i++) {
        if (chosen.includes(i)) continue;
        let d = Infinity;
        for (const c of chosen) d = Math.min(d, this.v3dist(this.bVerts[i], this.bVerts[c]));
        if (d > bestD) { bestD = d; best = i; }
      }
      chosen.push(best);
    }
    // order carriers so same-kind nodes end up near each other on the sphere
    const order = [...this.graphNodes.keys()].sort((a, b) => {
      const rank = { system: 0, oss: 1, tech: 2, work: 3, practice: 4 } as Record<string, number>;
      return rank[this.graphNodes[a].kind] - rank[this.graphNodes[b].kind];
    }).slice(0, n);
    this.bCarrier = new Array(n);
    order.forEach((nodeIdx, k) => { this.bCarrier[nodeIdx] = chosen[k]; });
  }

  private initGraph() {
    const canvas = document.getElementById('kg-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.gCanvas = canvas;
    this.gCtx = canvas.getContext('2d');
    if (!this.gCtx) return;

    this.buildGraph();

    // adjacency, used for hover highlighting
    this.gNeighbours = new Map(this.graphNodes.map(n => [n.id, new Set<string>()]));
    for (const [a, b] of this.graphEdges) {
      this.gNeighbours.get(a)?.add(b);
      this.gNeighbours.get(b)?.add(a);
    }

    this.buildBuckyball();
    this.assignCarriers();

    // Bodies now just mirror their carrier vertex each frame; x/y are filled in
    // by the projection step before anything reads them.
    this.gBodies = this.graphNodes.map(n => ({
      ...n,
      x: 0, y: 0, vx: 0, vy: 0,
      r: n.kind === 'system' ? 13 : n.kind === 'oss' ? 12 : 10,
      pinned: false,
    }));

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

    let downAt = { x: 0, y: 0 };
    let moved = 0;
    let downOn: GraphBody | null = null;

    canvas.addEventListener('pointermove', e => {
      const p = pos(e);
      this.gPointer.x = p.x; this.gPointer.y = p.y;
      if (this.bDragging) {
        // Drag anywhere spins the ball; vertical drag tilts, horizontal turns.
        const dx = p.x - this.bLast.x, dy = p.y - this.bLast.y;
        this.bRotY += dx * 0.006;
        this.bRotX -= dy * 0.006;
        this.bRotX = Math.max(-1.4, Math.min(1.4, this.bRotX));
        this.bLast = { x: p.x, y: p.y };
        moved += Math.abs(dx) + Math.abs(dy);
        // hand the spin back as momentum when released
        this.bSpinY = dx * 0.0012;
        this.bSpinX = -dy * 0.0012;
        return;
      }
      const h = hit(p.x, p.y);
      const id = h?.id ?? null;
      if (id !== this.gHoverId) {
        this.gHoverId = id;
        this.graphHover.set(h ? this.graphNodes.find(n => n.id === id) ?? null : null);
        canvas.style.cursor = h && (h.url || h.target) ? 'pointer' : 'grab';
      }
    });

    canvas.addEventListener('pointerdown', e => {
      const p = pos(e);
      downAt = p; moved = 0;
      // Remember what was under the cursor at press time: the ball keeps
      // rotating, so by pointerup a different atom may have moved into place.
      downOn = hit(p.x, p.y);
      this.bDragging = true;
      this.bLast = { x: p.x, y: p.y };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });

    const release = () => {
      this.bDragging = false;
      downOn = null;
      // settle back to the idle drift rather than stopping dead
      if (Math.abs(this.bSpinY) < 0.0004) this.bSpinY = 0.0022;
      canvas.style.cursor = this.gHoverId ? 'grab' : 'grab';
    };
    canvas.addEventListener('pointerup', e => {
      // A click (press and release in the same spot) on a lit atom opens what it
      // stands for: a library's merged PRs, a project card or a section. Distance from the press point is the only test that matters --
      // `moved` accumulates across the preceding hover sweep too.
      const p = pos(e);
      const wasClick = Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6;
      if (wasClick && downOn) this.openGraphNode(downOn);
      downOn = null;
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
    const light = this.theme() === 'light';

    // ---- rotate ----
    if (!this.bDragging) { this.bRotX += this.bSpinX; this.bRotY += this.bSpinY; }
    const sx = Math.sin(this.bRotX), cxr = Math.cos(this.bRotX);
    const sy = Math.sin(this.bRotY), cyr = Math.cos(this.bRotY);
    // Fit to the smaller axis, leaving room for the perspective bulge, the node
    // glow and the labels that sit above the top-most atoms.
    this.bRadius = Math.min(W, H) * 0.385;

    // ---- project all 60 vertices ----
    this.bProj = this.bVerts.map(v => {
      // rotate about Y then X
      const x1 = v.x * cyr + v.z * sy;
      const z1 = -v.x * sy + v.z * cyr;
      const y2 = v.y * cxr - z1 * sx;
      const z2 = v.y * sx + z1 * cxr;
      const persp = 1 / (1 - z2 * 0.28);        // gentle perspective
      return {
        x: cx + x1 * this.bRadius * persp,
        y: cy + y2 * this.bRadius * persp,
        z: z2,
        s: persp,
      };
    });

    // mirror carrier positions onto the real nodes so hit-testing/tooltips work
    this.gBodies.forEach((b, i) => {
      const p = this.bProj[this.bCarrier[i]];
      if (p) { b.x = p.x; b.y = p.y; }
    });

    // ---- draw ----
    ctx.clearRect(0, 0, W, H);
    const hovered = this.gHoverId;
    const near = hovered ? this.gNeighbours.get(hovered) : null;
    const carrierOf = new Map(this.gBodies.map((b, i) => [this.bCarrier[i], b]));

    // 1. the cage: 90 C–C bonds, depth-sorted so the far side sits behind
    const bonds = this.bBonds
      .map(([i, j]) => ({ i, j, z: (this.bProj[i].z + this.bProj[j].z) / 2 }))
      .sort((a, b) => a.z - b.z);
    for (const { i, j, z } of bonds) {
      const A = this.bProj[i], B = this.bProj[j];
      const depth = (z + 1) / 2;                       // 0 back … 1 front
      const a = 0.14 + depth * 0.62;
      const grad = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      if (light) {
        grad.addColorStop(0, `rgba(38,137,13,${a})`);
        grad.addColorStop(0.5, `rgba(13,131,144,${Math.min(1, a * 1.15)})`);
        grad.addColorStop(1, `rgba(0,124,176,${a})`);
      } else {
        grad.addColorStop(0, `rgba(134,188,37,${a})`);         // Deloitte green
        grad.addColorStop(0.5, `rgba(0,171,171,${a * 1.15})`);  // teal
        grad.addColorStop(1, `rgba(98,181,229,${a})`);         // light blue
      }
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.7 + depth * 2.0;
      // front-facing bonds get a soft bloom so the cage reads as lit glass
      if (depth > 0.62) {
        ctx.shadowColor = light ? `rgba(38,137,13,${(depth - 0.62) * 0.35})` : `rgba(134,188,37,${(depth - 0.62) * 0.9})`;
        ctx.shadowBlur = 7;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 2. bare lattice vertices (the carbons that carry nothing)
    for (let i = 0; i < this.bProj.length; i++) {
      if (carrierOf.has(i)) continue;
      const p = this.bProj[i];
      const depth = (p.z + 1) / 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8 + depth * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = light ? `rgba(83,86,90,${0.18 + depth * 0.5})` : `rgba(186,209,232,${0.22 + depth * 0.62})`;
      ctx.fill();
    }

    // 3. relationship chords between real nodes, drawn across the sphere
    for (const [a, c] of this.graphEdges) {
      const ia = this.gBodies.findIndex(b => b.id === a);
      const ic = this.gBodies.findIndex(b => b.id === c);
      if (ia < 0 || ic < 0) continue;
      const A = this.bProj[this.bCarrier[ia]], B = this.bProj[this.bCarrier[ic]];
      if (!A || !B) continue;
      const lit = !!hovered && (a === hovered || c === hovered);
      if (!lit && (A.z < -0.15 || B.z < -0.15)) continue;   // hide far-side clutter
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      // bow the chord outward so it reads as wrapping the sphere
      const mx = (A.x + B.x) / 2 - cx, my = (A.y + B.y) / 2 - cy;
      const bow = 1.18;
      ctx.quadraticCurveTo(cx + mx * bow, cy + my * bow, B.x, B.y);
      ctx.strokeStyle = lit ? (light ? 'rgba(38,137,13,0.9)' : 'rgba(166,216,110,0.9)') : (light ? 'rgba(83,86,90,0.14)' : 'rgba(148,163,184,0.16)');
      ctx.lineWidth = lit ? 2 : 0.7;
      ctx.stroke();
    }

    // 4. the real nodes, painted back-to-front
    const drawOrder = this.gBodies
      .map((b, i) => ({ b, p: this.bProj[this.bCarrier[i]] }))
      .filter(m => !!m.p)
      .sort((m, n) => m.p.z - n.p.z);

    for (const { b, p } of drawOrder) {
      const isHover = b.id === hovered;
      const isNear = !!near?.has(b.id);
      const dim = !!hovered && !isHover && !isNear;
      const color = this.nodeColor(b);
      const depth = (p.z + 1) / 2;
      const r = b.r * (0.62 + depth * 0.55);

      ctx.globalAlpha = dim ? 0.18 : 0.35 + depth * 0.65;

      // glow
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4);
      halo.addColorStop(0, color + (light ? '55' : 'cc'));
      halo.addColorStop(0.45, color + (light ? '18' : '33'));
      halo.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.4, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      // the atom
      const body = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.35, color);
      body.addColorStop(1, color + 'bb');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();

      if (isHover) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // labels: front-facing systems always, others on hover/neighbour
      if (((b.kind === 'system' || b.kind === 'oss') && p.z > -0.1) || isHover || isNear) {
        ctx.font = `${isHover ? 600 : 500} ${isHover ? 12.5 : 11}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = isHover ? color : (light ? 'rgba(0,0,0,0.85)' : 'rgba(226,232,240,0.95)');
        ctx.textAlign = 'center';
        ctx.shadowColor = light ? 'rgba(255,255,255,0.95)' : 'rgba(2,6,23,0.9)';
        ctx.shadowBlur = 6;
        // keep the label inside the canvas: a centred label on a rim atom
        // otherwise runs off the edge and gets clipped
        const half = ctx.measureText(b.label).width / 2 + 4;
        const lx = Math.max(half, Math.min(W - half, p.x));
        ctx.fillText(b.label, lx, p.y - r - 9);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    this.gRaf = requestAnimationFrame(() => this.stepGraph());
  }

  stopGraph() {
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
  }
}
