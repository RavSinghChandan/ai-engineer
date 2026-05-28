import { Component, inject, computed, signal, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ApiService } from '../../services/api.service';
import { catchError, of, forkJoin } from 'rxjs';

/* ─────────────────────────────────────────────────────────────────────────────
   GRAPH DATA  — mirrors backend graph/pipeline.py exactly
   Pipeline (LangGraph nodes in order):
     persona_injection → security_check → question_agent → domain_agents (parallel fan-out)
     → meta_agent → hallucination_check → remedy_agent
     → admin_review_agent → grammar_agent → END
   persona_injection: per-tenant episodic recall → formats persona_context string
     → prepended to every subsequent agent's LLM system prompt via build_prompt()
   Post-approve HTTP calls (outside LangGraph):
     admin → report_agent + simplify_agent → translation_agent → Final Report
───────────────────────────────────────────────────────────────────────────── */
interface GNode {
  id: string;
  label: string;
  sub: string;
  icon: string;
  stepIds: string[];
  color: string;
  x: number; y: number; r: number;
}
interface GEdge { from: string; to: string; label?: string; dashed?: boolean; }

const W = 820;
const CX = W / 2;

/* Y positions — 11 LangGraph nodes + episodic memory + input layer + post-approve section */
const Y_INPUT   =   70;
const Y_PERSONA =  160;   // Node -1: persona_injection (episodic memory recall)  ← NEW
const Y_SEC     =  310;   // Node 0: security_check
const Y_NODE1   =  465;   // Node 1: question_agent
const Y_NODE2   =  645;   // Node 2: domain_agents (parallel fan-out)
const Y_NODE3   =  825;   // Node 3: meta_agent
const Y_NODE3B  =  965;   // Node 3.5: hallucination_check
const Y_NODE4   = 1110;   // Node 4: remedy_agent
const Y_NODE5   = 1255;   // Node 5: admin_review_agent
const Y_NODE5B  = 1400;   // Node 5.5: grammar_agent
const Y_NODE6A  = 1555;   // Post-approve: report_agent
const Y_NODE6B  = 1555;   // Post-approve: simplify_agent
const Y_NODE7   = 1705;   // Post-approve: translation_agent
const Y_OUT     = 1845;   // END
const Y_FEAT    = 1945;   // Feature badges strip

const H = Y_FEAT + 120;

/* Domain agent x-positions — 5 nodes spaced across width */
const DX: number[] = [70, 230, CX, 590, 750];

const NODES: GNode[] = [
  /* ── Input layer ──────────────────────────────────── */
  { id: 'inp-profile',  label: 'User Profile',  sub: 'Name · DOB · Time · Place',    icon: '👤', stepIds: [], color: '#6366f1', x: CX - 200, y: Y_INPUT, r: 36 },
  { id: 'inp-question', label: 'Questions',      sub: 'Topic · Intent · Focus',       icon: '💬', stepIds: [], color: '#6366f1', x: CX,       y: Y_INPUT, r: 36 },
  { id: 'inp-prompt',   label: 'Prompt Style',   sub: 'v1 Warm · v2 Laser-Sharp',     icon: '⚡', stepIds: [], color: '#818cf8', x: CX + 200, y: Y_INPUT, r: 36 },

  /* ── Node -1 — persona_injection (EPISODIC MEMORY) ── */
  { id: 'persona', label: 'Tenant Persona Injection', sub: 'Per-tenant episodic recall · Top-K corrections · Tone rules', icon: '🧬',
    stepIds: ['persona'], color: '#0891b2', x: CX, y: Y_PERSONA, r: 42 },

  /* ── Node 0 — security_check ──────────────────────── */
  { id: 'security', label: 'Security Check', sub: 'Inject · Jailbreak · Leak · Audit', icon: '🛡',
    stepIds: ['security'], color: '#dc2626', x: CX, y: Y_SEC, r: 44 },

  /* ── Node 1 — question_agent ──────────────────────── */
  { id: 'q', label: 'Question Agent', sub: 'Multi-Query RAG · Normalize · Intent', icon: '🧩',
    stepIds: ['question'], color: '#f59e0b', x: CX, y: Y_NODE1, r: 44 },

  /* ── Node 2 — domain_agents (parallel fan-out) ─────── */
  { id: 'astro',  label: 'Astrology',  sub: 'Vedic · KP · Western',         icon: '🪐', stepIds: ['astro-vedic','astro-kp','astro-western'],      color: '#3b82f6', x: DX[0], y: Y_NODE2, r: 38 },
  { id: 'num',    label: 'Numerology', sub: 'Indian · Chaldean · Pythag',    icon: '🔢', stepIds: ['num-indian','num-chaldean','num-pythagorean'], color: '#8b5cf6', x: DX[1], y: Y_NODE2, r: 38 },
  { id: 'palm',   label: 'Palmistry',  sub: 'Indian · Chinese · Western',    icon: '✋', stepIds: ['palm-indian','palm-chinese','palm-western'],   color: '#10b981', x: DX[2], y: Y_NODE2, r: 38 },
  { id: 'tarot',  label: 'Tarot',      sub: 'Rider-Waite · Intuitive',       icon: '🃏', stepIds: ['tarot-rw','tarot-int'],                        color: '#f43f5e', x: DX[3], y: Y_NODE2, r: 38 },
  { id: 'vastu',  label: 'Vastu',      sub: 'Traditional · Modern',          icon: '🏠', stepIds: ['vastu-trad','vastu-modern'],                   color: '#f97316', x: DX[4], y: Y_NODE2, r: 38 },

  /* ── Node 3 — meta_agent ──────────────────────────── */
  { id: 'meta', label: 'Meta Agent', sub: 'Cross-tradition merge · Consensus', icon: '🧠',
    stepIds: ['meta'], color: '#7c3aed', x: CX, y: Y_NODE3, r: 44 },

  /* ── Node 3.5 — hallucination_check (NEW) ─────────── */
  { id: 'hallucination', label: 'Hallucination Check', sub: 'Fact-check · Leak detect · Confidence', icon: '🔍',
    stepIds: ['hallucination'], color: '#b45309', x: CX, y: Y_NODE3B, r: 42 },

  /* ── Node 4 — remedy_agent ────────────────────────── */
  { id: 'remedy', label: 'Remedy Agent', sub: 'Habits · Mantras · Gems · Colors', icon: '🌿',
    stepIds: ['remedy'], color: '#059669', x: CX, y: Y_NODE4, r: 42 },

  /* ── Node 5 — admin_review_agent ─────────────────── */
  { id: 'admin', label: 'Admin Review', sub: 'Validate · Quality Gate · Approve', icon: '📋',
    stepIds: ['admin'], color: '#0ea5e9', x: CX, y: Y_NODE5, r: 42 },

  /* ── Node 5.5 — grammar_agent (NEW) ──────────────── */
  { id: 'grammar', label: 'Grammar Agent', sub: 'Bullet polish · Grammar · Tone fix', icon: '✍️',
    stepIds: ['grammar'], color: '#4f46e5', x: CX, y: Y_NODE5B, r: 42 },

  /* ── Post-approve HTTP: report + simplify ─────────── */
  { id: 'report',   label: 'Report Agent',   sub: 'Narrative · 360° Analysis', icon: '📝',
    stepIds: ['report'],   color: '#a855f7', x: CX - 120, y: Y_NODE6A, r: 38 },
  { id: 'simplify', label: 'Simplify Agent', sub: 'WHO/WHAT/WHEN/WHERE · LLM', icon: '✨',
    stepIds: ['simplify'], color: '#ec4899', x: CX + 120, y: Y_NODE6B, r: 38 },

  /* ── Post-approve HTTP: translation_agent ────────── */
  { id: 'translate', label: 'Translation Agent', sub: '22 Languages · Parallel · DeepSeek', icon: '🌐',
    stepIds: ['translate'], color: '#0891b2', x: CX, y: Y_NODE7, r: 42 },

  /* ── END — Final Report ───────────────────────────── */
  { id: 'out', label: 'Final Report', sub: 'Branded · PDF-ready · 360°', icon: '✅',
    stepIds: [], color: '#16a34a', x: CX, y: Y_OUT, r: 42 },
];

const EDGES: GEdge[] = [
  /* inputs → persona_injection (episodic memory lookup runs first) */
  { from: 'inp-profile',  to: 'persona' },
  { from: 'inp-question', to: 'persona', label: 'query' },
  { from: 'inp-prompt',   to: 'persona', label: 'prompt_v' },
  /* persona_injection → security_check (tenant_preferences injected into state) */
  { from: 'persona', to: 'security', label: 'tenant_prefs' },
  /* security_check → question_agent */
  { from: 'security', to: 'q', label: 'validated' },
  /* question_agent → all 5 domain agents (parallel) */
  { from: 'q', to: 'astro', label: 'intent[]' },
  { from: 'q', to: 'num' },
  { from: 'q', to: 'palm' },
  { from: 'q', to: 'tarot' },
  { from: 'q', to: 'vastu' },
  /* all domain agents → meta_agent */
  { from: 'astro', to: 'meta' },
  { from: 'num',   to: 'meta' },
  { from: 'palm',  to: 'meta' },
  { from: 'tarot', to: 'meta' },
  { from: 'vastu', to: 'meta' },
  /* meta → hallucination_check → remedy → admin → grammar (LangGraph backbone) */
  { from: 'meta',          to: 'hallucination', label: 'insights[]' },
  { from: 'hallucination', to: 'remedy',         label: 'verified' },
  { from: 'remedy',        to: 'admin',          label: 'remedies[]' },
  { from: 'admin',         to: 'grammar',        label: 'approved' },
  /* grammar → END (LangGraph terminates here) */
  { from: 'grammar', to: 'report',   dashed: true, label: 'POST /approve' },
  { from: 'grammar', to: 'simplify', dashed: true },
  /* report + simplify → translation (on-demand HTTP) */
  { from: 'report',   to: 'translate', label: 'narrative' },
  { from: 'simplify', to: 'translate', label: 'hw_bullets' },
  { from: 'translate', to: 'out', dashed: true, label: 'POST /translate' },
];

const NM = new Map(NODES.map(n => [n.id, n]));

/* ── Feature badge definitions (static metadata; enabled state loaded at runtime) */
interface FeatureBadge {
  key: string; label: string; icon: string;
  desc: string; color: string; disabledColor: string;
}
const FEATURE_BADGES: FeatureBadge[] = [
  { key: 'episodic',      label: 'Tenant Episodic Memory', icon: '🧬', desc: 'Per-tenant correction learning', color: '#0891b2', disabledColor: '#94a3b8' },
  { key: 'reranker',      label: 'CrossEncoder',    icon: '🎯', desc: 'RAG Reranking',       color: '#f59e0b', disabledColor: '#94a3b8' },
  { key: 'semantic',      label: 'Semantic Cache',  icon: '💡', desc: 'Cosine Sim',           color: '#8b5cf6', disabledColor: '#94a3b8' },
  { key: 'redis',         label: 'Redis Cache',     icon: '⚡', desc: 'Distributed',          color: '#ef4444', disabledColor: '#94a3b8' },
  { key: 'kafka',         label: 'Kafka Async',     icon: '📨', desc: 'Job Queue',             color: '#10b981', disabledColor: '#94a3b8' },
  { key: 'ragas',         label: 'RAGAS Eval',      icon: '📊', desc: 'Quality Scores',       color: '#6366f1', disabledColor: '#94a3b8' },
  { key: 'prometheus',    label: 'Prometheus',      icon: '🔥', desc: 'Metrics Export',       color: '#dc2626', disabledColor: '#94a3b8' },
];

/* Backend node labels in execution order (for the live ticker) */
const PIPELINE_STEPS: { id: string; label: string }[] = [
  { id: 'persona',       label: 'Node -1 · Tenant Persona Injection — per-tenant episodic memory recall: top-K past corrections injected into LangGraph state' },
  { id: 'security',      label: 'Node 0 · Security Check — injection detection, jailbreak guard, audit logging (Layer 1–4)' },
  { id: 'question',      label: 'Node 1 · Question Agent — Multi-Query RAG: 2 variants → best-confidence intent classification' },
  { id: 'domain',        label: 'Node 2 · Domain Agents — Astrology · Numerology · Palmistry · Tarot · Vastu running in parallel' },
  { id: 'meta',          label: 'Node 3 · Meta Agent — merging cross-tradition insights & resolving conflicts' },
  { id: 'hallucination', label: 'Node 4 · Hallucination Check — fact-checking insights, output leak detection, confidence scoring' },
  { id: 'remedy',        label: 'Node 5 · Remedy Agent — generating habits, mantras, colors & gemstones' },
  { id: 'admin',         label: 'Node 6 · Admin Review — validating quality, approving insights' },
  { id: 'grammar',       label: 'Node 7 · Grammar Agent — polishing all insight bullets for grammar, tone & clarity' },
  { id: 'report',        label: 'Node 8 · Report Agent — assembling narrative 360° report (POST /approve)' },
  { id: 'simplify',      label: 'Node 8 · Simplify Agent — structuring WHO/WHAT/WHEN/WHERE bullets (POST /approve)' },
  { id: 'translate',     label: 'Node 9 · Translation Agent — translating to target language via DeepSeek (POST /translate)' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────────── */
@Component({
  selector: 'app-agent-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="af-host" [class.af-maximized]="maximized">

  <!-- ── Header bar ──────────────────────────────────────────────────────── -->
  <div class="af-bar">
    <div class="af-bar-left">
      <span class="af-dot" [class.af-dot-live]="anyRunning()"></span>
      <span class="af-title">Agent Pipeline</span>
      <span class="af-sub">10 Nodes · 4-Layer Security · Hallucination Check · Grammar Agent · Multi-Query RAG · 5 Traditions · 22 Languages · LangGraph</span>
    </div>
    <div class="af-bar-right">
      <span class="af-feat-count" [title]="activeFeatureCount() + ' production features active'">
        {{ activeFeatureCount() }}/{{ FEATURE_BADGES.length }} Features Active
      </span>
      @if (orch.cacheHit()) {
        <span class="af-cache-badge">⚡ Cached</span>
      }
      <span class="af-leg"><span class="af-led af-led-idle"></span>Queued</span>
      <span class="af-leg"><span class="af-led af-led-run"></span>Running</span>
      <span class="af-leg"><span class="af-led af-led-done"></span>Done</span>

      <!-- Zoom controls -->
      <div class="zoom-group">
        <button class="af-icon-btn" (click)="zoomOut()" [disabled]="zoom() <= 0.4" title="Zoom out">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M4 6h4M10 10l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <span class="zoom-label" (click)="resetZoom()" title="Reset zoom">{{ zoomPct() }}</span>
        <button class="af-icon-btn" (click)="zoomIn()" [disabled]="zoom() >= 2.5" title="Zoom in">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 4v4M4 6h4M10 10l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <button class="af-icon-btn" (click)="maximized = !maximized" [title]="maximized ? 'Restore' : 'Fullscreen'">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          @if (!maximized) {
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          } @else {
            <path d="M5 1v4H1M9 1v4h4M9 13v-4h4M5 13v-4H1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          }
        </svg>
      </button>
    </div>
  </div>

  <!-- ── Live status ticker ──────────────────────────────────────────────── -->
  <div class="af-ticker">
    @if (orch.isRunning()) {
      <span class="ticker-dot-live"></span>
      <span class="ticker-text">{{ activePipelineLabel() }}</span>
    } @else if (orch.isDone() && !orch.isRunning()) {
      <span class="ticker-done">✓</span>
      <span class="ticker-text ticker-complete">Pipeline complete — 360° analysis ready</span>
    } @else {
      <span class="ticker-idle">◦</span>
      <span class="ticker-text ticker-idle-txt">Waiting for analysis input…</span>
    }
  </div>

  <!-- ── SVG graph ────────────────────────────────────────────────────────── -->
  <div class="af-canvas-wrap">
    <svg class="af-svg" [attr.viewBox]="'0 0 ' + W + ' ' + H"
         [style.width]="svgWidth()"
         xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="afGrid" width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M36 0L0 0 0 36" fill="none" stroke="rgba(99,102,241,0.055)" stroke-width="0.8"/>
        </pattern>
        <filter id="afGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="afShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="rgba(0,0,0,0.07)"/>
        </filter>
        <marker id="arGreen" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 1L6 4L0 7z" fill="#10b981" opacity="0.9"/>
        </marker>
        <marker id="arBlue" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 1L6 4L0 7z" fill="#6366f1" opacity="0.8"/>
        </marker>
        <marker id="arGray" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 1L6 4L0 7z" fill="rgba(148,163,184,0.5)"/>
        </marker>
      </defs>

      <!-- Background -->
      <rect width="100%" height="100%" fill="#fafbff"/>
      <rect width="100%" height="100%" fill="url(#afGrid)"/>

      <!-- Security node zone (Node 0 highlight) -->
      <rect x="220" [attr.y]="Y_SEC - 58" width="380" height="118" rx="14"
            fill="rgba(220,38,38,0.028)" stroke="rgba(220,38,38,0.22)"
            stroke-width="1.2" stroke-dasharray="6 4"/>
      <text [attr.x]="W - 44" [attr.y]="Y_SEC - 38" class="zone-lbl"
            text-anchor="end" style="fill:rgba(220,38,38,0.55);font-size:8px">
        Layer 1: Injection · Jailbreak
      </text>
      <text [attr.x]="W - 44" [attr.y]="Y_SEC - 26" class="zone-lbl"
            text-anchor="end" style="fill:rgba(220,38,38,0.55);font-size:8px">
        Layer 2: Prompt Hardening
      </text>
      <text [attr.x]="W - 44" [attr.y]="Y_SEC - 14" class="zone-lbl"
            text-anchor="end" style="fill:rgba(220,38,38,0.55);font-size:8px">
        Layer 3: Output Leak Detection
      </text>
      <text [attr.x]="W - 44" [attr.y]="Y_SEC + 50" class="zone-lbl"
            text-anchor="end" style="fill:rgba(220,38,38,0.45);font-size:8px">
        Layer 4: Audit Log · Rate Limit
      </text>

      <!-- Guardrails band — spans question_agent through grammar_agent -->
      <rect x="6" [attr.y]="Y_NODE1 - 62" [attr.width]="W - 12"
            [attr.height]="Y_NODE5B - Y_NODE1 + 148" rx="14"
            fill="rgba(99,102,241,0.012)" stroke="rgba(99,102,241,0.14)"
            stroke-width="1" stroke-dasharray="8 5"/>
      <rect x="6" [attr.y]="Y_NODE1 - 62" [attr.width]="W - 12" height="22" rx="14"
            fill="rgba(99,102,241,0.065)"/>
      <text [attr.x]="CX" [attr.y]="Y_NODE1 - 51" class="guard-lbl" text-anchor="middle">
        🛡 Guardrails · SECURITY_HEADER/FOOTER injected · Output Validation · Hallucination Check · Retry / Fallback
      </text>

      <!-- Multi-Query RAG annotation (Node 1 — question_agent sub-step) -->
      <rect x="560" [attr.y]="Y_NODE1 - 46" width="220" height="68" rx="9"
            fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.3)"
            stroke-width="1" stroke-dasharray="4 3"/>
      <text [attr.x]="670" [attr.y]="Y_NODE1 - 30" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(180,113,9,0.75);font-size:8.5px;font-weight:700">
        Multi-Query RAG
      </text>
      <text [attr.x]="670" [attr.y]="Y_NODE1 - 16" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(180,113,9,0.6);font-size:7.5px">
        LLM → 2 query variants
      </text>
      <text [attr.x]="670" [attr.y]="Y_NODE1 - 3" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(180,113,9,0.6);font-size:7.5px">
        Best confidence wins
      </text>
      <text [attr.x]="670" [attr.y]="Y_NODE1 + 12" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(180,113,9,0.5);font-size:7px">
        Fallback: keyword classifier
      </text>

      <!-- Parallel zone band -->
      <rect x="36" [attr.y]="Y_NODE2 - 52" [attr.width]="W - 72" height="104" rx="12"
            fill="rgba(99,102,241,0.018)" stroke="rgba(99,102,241,0.1)"
            stroke-width="1" stroke-dasharray="5 4"/>
      <text [attr.x]="W - 44" [attr.y]="Y_NODE2 + 6" class="zone-lbl"
            text-anchor="end">∥ parallel fan-out</text>

      <!-- Node 6 zone (post-approve) -->
      <rect x="260" [attr.y]="Y_NODE6A - 50" width="300" height="96" rx="12"
            fill="rgba(168,85,247,0.025)" stroke="rgba(168,85,247,0.13)"
            stroke-width="1" stroke-dasharray="5 4"/>
      <text [attr.x]="CX" [attr.y]="Y_NODE6A + 55" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(168,85,247,0.45)">
        narrative + structured output (POST /approve)
      </text>

      <!-- Node 7 zone (on-demand translation) -->
      <rect x="220" [attr.y]="Y_NODE7 - 52" width="380" height="100" rx="12"
            fill="rgba(8,145,178,0.022)" stroke="rgba(8,145,178,0.15)"
            stroke-width="1" stroke-dasharray="5 4"/>
      <text [attr.x]="CX" [attr.y]="Y_NODE7 + 58" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(8,145,178,0.45)">
        22 languages · parallel DeepSeek calls (POST /translate)
      </text>

      <!-- Node lane labels -->
      <text x="14" [attr.y]="Y_SEC"   class="lane-lbl" style="fill:rgba(220,38,38,0.55)">Node 0</text>
      <text x="14" [attr.y]="Y_NODE1" class="lane-lbl">Node 1</text>
      <text x="14" [attr.y]="Y_NODE2" class="lane-lbl">Node 2</text>
      <text x="14" [attr.y]="Y_NODE3" class="lane-lbl">Node 3</text>
      <text x="14" [attr.y]="Y_NODE4" class="lane-lbl">Node 4</text>
      <text x="14" [attr.y]="Y_NODE5" class="lane-lbl">Node 5</text>
      <text x="14" [attr.y]="Y_NODE6A" class="lane-lbl">Node 6</text>
      <text x="14" [attr.y]="Y_NODE7"  class="lane-lbl">Node 7</text>

      <!-- Cache overlay -->
      @if (orch.cacheHit()) {
        <rect x="270" [attr.y]="Y_NODE3 - 36" width="280" height="72" rx="12"
              fill="rgba(254,243,199,0.97)" stroke="#f59e0b" stroke-width="1.5"
              filter="url(#afShadow)"/>
        <text [attr.x]="CX" [attr.y]="Y_NODE3 - 14" text-anchor="middle"
              style="font-size:16px">⚡</text>
        <text [attr.x]="CX" [attr.y]="Y_NODE3 + 8" text-anchor="middle"
              style="font-size:11px;font-weight:700;fill:#92400e;font-family:'Inter',sans-serif">
          Response served from cache
        </text>
        <text [attr.x]="CX" [attr.y]="Y_NODE3 + 24" text-anchor="middle"
              style="font-size:9px;fill:#b45309;font-family:'Inter',sans-serif">
          No LLM calls made · Instant result
        </text>
      }

      <!-- Edges -->
      @for (edge of EDGES; track edge.from + edge.to) {
        @if (edgePath(edge); as ep) {
          <path [attr.d]="ep.d" [attr.stroke]="ep.stroke" [attr.stroke-width]="ep.w"
                [attr.stroke-dasharray]="ep.dash" [attr.marker-end]="ep.marker"
                fill="none" opacity="0.88" [class.anim-dash]="ep.animated"/>
          @if (edge.label) {
            <text [attr.x]="ep.lx" [attr.y]="ep.ly" class="edge-lbl" text-anchor="middle">
              {{ edge.label }}
            </text>
          }
        }
      }

      <!-- Nodes -->
      @for (node of NODES; track node.id) {
        @if (nr(node); as n) {
          <g [attr.transform]="'translate('+node.x+','+node.y+')'">

            <!-- Pulse rings when running -->
            @if (n.status === 'running') {
              <circle [attr.r]="node.r + 13" fill="none" [attr.stroke]="node.color"
                      stroke-width="1.4" class="ring1" opacity="0.3"/>
              <circle [attr.r]="node.r + 23" fill="none" [attr.stroke]="node.color"
                      stroke-width="0.7" class="ring2" opacity="0.15"/>
            }

            <!-- Done halo -->
            @if (n.status === 'done') {
              <circle [attr.r]="node.r + 9" fill="none" stroke="#10b981"
                      stroke-width="1.4" opacity="0.38"/>
            }

            <!-- Shadow disc -->
            <circle [attr.r]="node.r + 2" fill="rgba(0,0,0,0.055)" cy="3"/>

            <!-- Main circle -->
            <circle [attr.r]="node.r" [attr.fill]="n.fill" [attr.stroke]="n.stroke"
                    [attr.stroke-width]="n.sw"
                    [attr.filter]="n.status !== 'idle' ? 'url(#afGlow)' : 'url(#afShadow)'"/>

            <!-- Inner ring -->
            <circle [attr.r]="node.r - 5" fill="none"
                    [attr.stroke]="n.status === 'idle' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'"
                    stroke-width="0.9"/>

            <!-- Icon -->
            <text class="node-icon" text-anchor="middle" dy="-5">{{ node.icon }}</text>

            <!-- Label -->
            <text class="node-lbl" [attr.fill]="n.lc" text-anchor="middle" dy="14">{{ node.label }}</text>

            <!-- Sub-label: placed BELOW circle, never inside -->
            @if (node.sub) {
              <text class="node-sub" text-anchor="middle"
                    [attr.y]="node.r + 15" [attr.fill]="n.subc">{{ node.sub }}</text>
            }

            <!-- Status badge -->
            @if (n.status !== 'idle') {
              <g [attr.transform]="'translate('+(node.r - 4)+','+(-node.r + 4)+')'">
                <circle r="9" [attr.fill]="n.badgeFill"/>
                <text class="badge-txt" text-anchor="middle" dy="4">
                  {{ n.status === 'running' ? '●' : '✓' }}
                </text>
              </g>
            }

          </g>
        }
      }

      <!-- ── Production Features Strip ──────────────────────────────────── -->
      <!-- Separator line -->
      <line [attr.x1]="60" [attr.y1]="Y_FEAT - 20" [attr.x2]="W - 60" [attr.y2]="Y_FEAT - 20"
            stroke="rgba(99,102,241,0.12)" stroke-width="1" stroke-dasharray="5 4"/>
      <text [attr.x]="CX" [attr.y]="Y_FEAT - 6" text-anchor="middle"
            style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;fill:rgba(99,102,241,0.45);font-family:'Inter',sans-serif">
        Production Features
      </text>

      @for (badge of FEATURE_BADGES; track badge.key; let i = $index) {
        @if (featPos(i); as fp) {
          <!-- Badge background pill -->
          <rect [attr.x]="fp.x - 48" [attr.y]="Y_FEAT + 10"
                width="96" height="68" rx="10"
                [attr.fill]="isFeatOn(badge.key) ? fp.bgFill : 'rgba(241,245,249,0.9)'"
                [attr.stroke]="isFeatOn(badge.key) ? badge.color : '#cbd5e1'"
                [attr.stroke-width]="isFeatOn(badge.key) ? 1.5 : 1"
                [attr.opacity]="isFeatOn(badge.key) ? 1 : 0.7"/>
          <!-- Icon -->
          <text [attr.x]="fp.x" [attr.y]="Y_FEAT + 34"
                text-anchor="middle"
                style="font-size:18px;dominant-baseline:middle">{{ badge.icon }}</text>
          <!-- Label -->
          <text [attr.x]="fp.x" [attr.y]="Y_FEAT + 52"
                text-anchor="middle"
                [attr.fill]="isFeatOn(badge.key) ? '#1e1b4b' : '#94a3b8'"
                style="font-size:9px;font-weight:700;font-family:'Inter',sans-serif;dominant-baseline:middle">
            {{ badge.label }}
          </text>
          <!-- Desc -->
          <text [attr.x]="fp.x" [attr.y]="Y_FEAT + 64"
                text-anchor="middle"
                [attr.fill]="isFeatOn(badge.key) ? badge.color : '#cbd5e1'"
                style="font-size:7.5px;font-family:'Inter',sans-serif;dominant-baseline:middle">
            {{ badge.desc }}
          </text>
          <!-- Status dot -->
          <circle [attr.cx]="fp.x + 36" [attr.cy]="Y_FEAT + 16" r="5"
                  [attr.fill]="isFeatOn(badge.key) ? badge.color : '#e2e8f0'"
                  [attr.stroke]="isFeatOn(badge.key) ? badge.color : '#cbd5e1'"
                  stroke-width="1.5"/>
          <!-- ON/OFF label -->
          <text [attr.x]="fp.x + 36" [attr.y]="Y_FEAT + 16"
                text-anchor="middle"
                [attr.fill]="isFeatOn(badge.key) ? '#fff' : '#94a3b8'"
                style="font-size:5.5px;font-weight:900;font-family:'Inter',sans-serif;dominant-baseline:middle">
            {{ isFeatOn(badge.key) ? 'ON' : 'OFF' }}
          </text>
        }
      }

    </svg>
  </div>

</div>
  `,
  styles: [`
:host { display: flex; flex-direction: column; height: 100%; }

.af-host {
  display: flex; flex-direction: column;
  height: 100%; width: 100%;
  background: transparent;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
}
.af-maximized {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9999 !important;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.af-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(99,102,241,0.11);
  flex-shrink: 0; background: #fff;
}
.af-bar-left  { display: flex; align-items: center; gap: 9px; }
.af-bar-right { display: flex; align-items: center; gap: 12px; }

.af-dot { width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; }
.af-dot-live { background: #10b981; box-shadow: 0 0 7px rgba(16,185,129,0.6); animation: dotPulse 1.5s ease-in-out infinite; }
@keyframes dotPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

.af-title { font-size: 12.5px; font-weight: 700; color: #1e1b4b; }
.af-sub   { font-size: 10px; color: #94a3b8; }

.af-leg { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #64748b; }
.af-led { width: 7px; height: 7px; border-radius: 50%; }
.af-led-idle { background: #e2e8f0; border: 1px solid #cbd5e1; }
.af-led-run  { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.5); animation: dotPulse 1.3s infinite; }
.af-led-done { background: #10b981; }

.af-feat-count {
  padding: 3px 9px; border-radius: 99px;
  background: linear-gradient(90deg,#eef2ff,#e0e7ff);
  border: 1px solid rgba(99,102,241,0.3);
  font-size: 10px; font-weight: 700; color: #4338ca; white-space: nowrap; cursor: default;
}

.af-cache-badge {
  padding: 3px 9px; border-radius: 99px;
  background: linear-gradient(90deg,#fef3c7,#fde68a);
  border: 1px solid #f59e0b;
  font-size: 10.5px; font-weight: 700; color: #92400e; white-space: nowrap;
}

.af-icon-btn {
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid rgba(99,102,241,0.18);
  background: #f8f9ff; color: #6366f1; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.14s;
}
.af-icon-btn:hover { background: #eef2ff; border-color: #6366f1; }
.af-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.af-icon-btn:disabled:hover { background: #f8f9ff; border-color: rgba(99,102,241,0.18); }

.zoom-group { display: flex; align-items: center; gap: 2px; }
.zoom-label {
  font-size: 10px; font-weight: 700; color: #6366f1; min-width: 34px;
  text-align: center; cursor: pointer; user-select: none;
  padding: 3px 4px; border-radius: 5px; transition: background 0.12s;
}
.zoom-label:hover { background: #eef2ff; }

/* ── Live ticker ─────────────────────────────────────────────────────────── */
.af-ticker {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 16px;
  background: #f8f9ff;
  border-bottom: 1px solid rgba(99,102,241,0.09);
  flex-shrink: 0; min-height: 34px;
  overflow: hidden;
}
.ticker-dot-live {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.55);
  animation: dotPulse 1.2s infinite;
}
.ticker-done {
  font-size: 11px; color: #10b981; font-weight: 700; flex-shrink: 0;
}
.ticker-idle {
  font-size: 14px; color: #cbd5e1; flex-shrink: 0; line-height: 1;
}
.ticker-text {
  font-size: 10.5px; font-weight: 500; color: #4338ca;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ticker-complete { color: #059669; }
.ticker-idle-txt { color: #9ca3af; font-weight: 400; }

/* ── Canvas ──────────────────────────────────────────────────────────────── */
.af-canvas-wrap {
  flex: 1; overflow: auto; background: #fafbff;
  display: flex; justify-content: center; align-items: flex-start; padding: 10px 6px;
}
.af-canvas-wrap::-webkit-scrollbar { width: 5px; height: 5px; }
.af-canvas-wrap::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.18); border-radius: 3px; }
.af-svg { display: block; height: auto; flex-shrink: 0; }

/* ── SVG text ────────────────────────────────────────────────────────────── */
.lane-lbl {
  font-size: 9px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase;
  fill: rgba(99,102,241,0.35); font-family: 'Inter', system-ui, sans-serif;
  dominant-baseline: middle;
}
.guard-lbl {
  font-size: 8.5px; font-family: 'Inter', system-ui, sans-serif;
  fill: #6366f1; dominant-baseline: middle;
}
.zone-lbl {
  font-size: 9px; font-weight: 600; letter-spacing: 0.04em;
  fill: rgba(99,102,241,0.32); font-family: 'Inter', system-ui, sans-serif;
  dominant-baseline: middle;
}
.node-icon { font-size: 20px; dominant-baseline: middle; }
.node-lbl  { font-size: 11px; font-weight: 700; font-family: 'Inter', system-ui, sans-serif; dominant-baseline: middle; }
.node-sub  { font-size: 9px; font-family: 'Inter', system-ui, sans-serif; dominant-baseline: hanging; }
.edge-lbl  {
  font-size: 9px; font-weight: 600; font-family: 'Inter', system-ui, sans-serif;
  fill: #6366f1; paint-order: stroke; stroke: #fafbff; stroke-width: 3.5;
  dominant-baseline: middle;
}
.badge-txt {
  font-size: 7.5px; font-weight: 900; fill: #fff;
  font-family: 'Inter', sans-serif; dominant-baseline: middle;
}

/* ── Animations ──────────────────────────────────────────────────────────── */
.anim-dash { stroke-dasharray: 8 5; animation: dashFlow 1.3s linear infinite; }
@keyframes dashFlow { to { stroke-dashoffset: -26; } }
.ring1 { animation: ringPulse 1.8s ease-in-out infinite; }
.ring2 { animation: ringPulse 1.8s ease-in-out infinite 0.55s; }
@keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.3} 50%{transform:scale(1.07);opacity:0.08} }

/* ── Responsive ── */
@media (max-width: 860px) {
  .af-bar { flex-wrap: wrap; gap: 6px; padding: 8px 12px; }
  .af-bar-left { gap: 7px; }
  .af-bar-right { gap: 6px; flex-wrap: wrap; }
  .af-sub { display: none; }
  .af-cache-badge { font-size: 9.5px; padding: 2px 7px; }
  /* Canvas: SVG fills full width, scales via viewBox — no horizontal scroll needed */
  .af-canvas-wrap {
    justify-content: flex-start; padding: 8px 4px;
    overflow-x: hidden; overflow-y: auto;
  }
  .af-svg { width: 100% !important; max-width: 100%; }
  .af-ticker { padding: 6px 10px; }
  /* Hide zoom controls on mobile — viewBox handles scaling */
  .zoom-group { display: none; }
}
@media (max-width: 480px) {
  .af-bar { padding: 6px 8px; }
  .af-title { font-size: 11px; }
  .af-icon-btn { width: 24px; height: 24px; }
  .af-ticker { padding: 5px 8px; min-height: 28px; }
  .ticker-text { font-size: 9.5px; }
}
  `]
})
export class AgentFlowComponent implements OnInit, OnDestroy {
  readonly orch = inject(OrchestratorService);
  protected readonly router = inject(Router);
  private readonly api = inject(ApiService);

  maximized = false;
  readonly zoom = signal(1.0);

  /* Feature enabled states — fetched from backend metrics */
  readonly featureStates = signal<Record<string, boolean>>({
    episodic: true, reranker: false, semantic: false, redis: false,
    kafka: false, ragas: false, prometheus: true,
  });

  readonly zoomPct  = computed(() => Math.round(this.zoom() * 100) + '%');
  readonly svgWidth = computed(() => Math.round(820 * this.zoom()) + 'px');

  zoomIn()    { this.zoom.set(Math.min(2.5, +(this.zoom() + 0.2).toFixed(1))); }
  zoomOut()   { this.zoom.set(Math.max(0.4, +(this.zoom() - 0.2).toFixed(1))); }
  resetZoom() { this.zoom.set(1.0); }

  /* expose to template */
  readonly NODES         = NODES;
  readonly EDGES         = EDGES;
  readonly FEATURE_BADGES = FEATURE_BADGES;
  readonly W = W;
  readonly H = H;
  readonly Y_PERSONA = Y_PERSONA;
  readonly Y_SEC    = Y_SEC;
  readonly Y_NODE1  = Y_NODE1;
  readonly Y_NODE2  = Y_NODE2;
  readonly Y_NODE3  = Y_NODE3;
  readonly Y_NODE3B = Y_NODE3B;
  readonly Y_NODE4  = Y_NODE4;
  readonly Y_NODE5  = Y_NODE5;
  readonly Y_NODE5B = Y_NODE5B;
  readonly Y_NODE6A = Y_NODE6A;
  readonly Y_NODE7  = Y_NODE7;
  readonly Y_FEAT   = Y_FEAT;
  readonly CX = CX;

  ngOnInit() { this._loadFeatureStates(); }
  ngOnDestroy() {}

  private _loadFeatureStates() {
    forkJoin({
      metrics:  this.api.getMetrics().pipe(catchError(() => of(null))),
      jobStats: this.api.getJobStats().pipe(catchError(() => of(null))),
    }).subscribe(({ metrics, jobStats }) => {
      const states: Record<string, boolean> = {
        episodic:   (metrics?.episodic_memory?.total_corrections ?? 0) >= 0, /* always wired — live from day 1 */
        reranker:   false,
        semantic:   metrics?.semantic_cache?.enabled  ?? false,
        redis:      metrics?.redis_cache?.enabled     ?? false,
        kafka:      jobStats?.kafka_enabled           ?? false,
        ragas:      true,  /* always wired — runs on every /approve call */
        prometheus: true,
      };
      this.featureStates.set(states);
    });
  }

  readonly activeFeatureCount = computed(() =>
    Object.values(this.featureStates()).filter(Boolean).length
  );

  /* Feature badge x-position: 6 badges evenly spaced across W=820 */
  featPos(i: number): { x: number; bgFill: string } {
    const badge = FEATURE_BADGES[i];
    const cols = 7;
    const step = W / cols;
    const x = step * i + step / 2;
    const on = this.featureStates()[badge.key] ?? false;
    const bgFill = on ? `${badge.color}12` : 'rgba(241,245,249,0.9)';
    return { x, bgFill };
  }

  isFeatOn(key: string): boolean {
    return this.featureStates()[key] ?? false;
  }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.maximized) this.maximized = false; }

  /* ── Real-time status ── */
  readonly anyRunning = computed(() =>
    this.orch.steps().some(s => s.status === 'running')
  );

  readonly activePipelineLabel = computed(() => {
    const steps = this.orch.steps();
    const running = steps.find(s => s.status === 'running');
    if (!running) return '';

    // Map individual step ID → pipeline stage label
    const id = running.id;
    if (id === 'persona' || id === 'persona_injection')   return PIPELINE_STEPS[0].label;
    if (id === 'security')  return PIPELINE_STEPS[1].label;
    if (id === 'question')  return PIPELINE_STEPS[2].label;
    if (id.startsWith('astro') || id.startsWith('num') || id.startsWith('palm') || id.startsWith('tarot') || id.startsWith('vastu'))
      return PIPELINE_STEPS[3].label;
    if (id === 'meta')      return PIPELINE_STEPS[4].label;
    if (id === 'remedy')    return PIPELINE_STEPS[5].label;
    if (id === 'admin')     return PIPELINE_STEPS[6].label;
    if (id === 'report')    return PIPELINE_STEPS[7].label;
    if (id === 'simplify')  return PIPELINE_STEPS[8].label;
    if (id === 'translate') return PIPELINE_STEPS[9].label;
    return `Running: ${running.label}`;
  });

  /* ── Step map — real orchestrator state only ── */
  private sm = computed(() => {
    const m: Record<string, string> = {};
    for (const s of this.orch.steps()) m[s.id] = s.status;
    return m;
  });

  private status(node: GNode): 'idle' | 'running' | 'done' {
    if (!node.stepIds.length) return 'idle';
    const m = this.sm();
    if (node.stepIds.some(id => m[id] === 'running')) return 'running';
    if (node.stepIds.every(id => m[id] === 'done'))   return 'done';
    return 'idle';
  }

  nr(node: GNode) {
    const s = this.status(node);
    const isIO = !node.stepIds.length;
    let fill: string, stroke: string, sw: number, lc: string, subc: string, badgeFill = node.color;

    if (s === 'running') {
      fill = `${node.color}22`; stroke = node.color; sw = 2.5;
      lc = '#1e1b4b'; subc = '#6366f1';
    } else if (s === 'done') {
      fill = 'rgba(16,185,129,0.10)'; stroke = '#10b981'; sw = 2.5;
      lc = '#065f46'; subc = '#059669'; badgeFill = '#10b981';
    } else if (isIO) {
      fill = 'rgba(99,102,241,0.065)'; stroke = 'rgba(99,102,241,0.22)'; sw = 1.4;
      lc = '#4338ca'; subc = '#94a3b8';
    } else {
      fill = `${node.color}10`; stroke = `${node.color}4a`; sw = 1.4;
      lc = '#374151'; subc = '#9ca3af';
    }
    return { status: s, fill, stroke, sw, lc, subc, badgeFill };
  }

  edgePath(edge: GEdge) {
    const f = NM.get(edge.from), t = NM.get(edge.to);
    if (!f || !t) return null;
    const m = this.sm();

    const fDone    = f.stepIds.length > 0 && f.stepIds.every(id => m[id] === 'done');
    const fRunning = f.stepIds.some(id => m[id] === 'running');
    const tRunning = t.stepIds.some(id => m[id] === 'running');
    const animated = fDone || fRunning || tRunning;

    let stroke: string, w: number, marker: string;
    if (fDone)         { stroke = 'rgba(16,185,129,0.75)'; w = 2.0; marker = 'url(#arGreen)'; }
    else if (animated) { stroke = 'rgba(99,102,241,0.72)'; w = 2.0; marker = 'url(#arBlue)'; }
    else               { stroke = 'rgba(203,213,225,0.75)'; w = 1.4; marker = 'url(#arGray)'; }

    const dash = animated ? (edge.dashed ? '7 5' : '9 5') : (edge.dashed ? '4 4' : undefined);

    /* Bezier: exit bottom of source, enter top of target */
    const fx = f.x, fy = f.y + f.r + 2;
    const tx = t.x, ty = t.y - t.r - 2;
    const dy = ty - fy;
    const cp1y = fy + dy * 0.44;
    const cp2y = ty - dy * 0.44;
    const d = `M${fx} ${fy} C${fx} ${cp1y},${tx} ${cp2y},${tx} ${ty}`;

    /* Edge label: placed in the safe vertical band between source sub-label and target circle */
    const safeTop = f.y + f.r + 20;
    const safeBot = t.y - t.r - 12;
    const ly = (safeTop + safeBot) / 2;
    /* horizontal: lean away from centre so label doesn't sit on the bezier spine */
    const isVertical = Math.abs(fx - tx) < 10;
    const lx = isVertical ? fx - 40 : fx + (tx - fx) * 0.38 + 22;

    return { d, stroke, w, dash, marker, animated, lx, ly };
  }
}
