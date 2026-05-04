import { Component, inject, computed, signal, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';

/* ─────────────────────────────────────────────────────────────────────────────
   GRAPH DATA  — mirrors backend graph/pipeline.py exactly
   Canvas: 820 × 1260
   Vertical rhythm: each layer 155px apart, enough room for circle + sub-label
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

/* Y positions — each layer needs: circle(r=44) + sub-text(~18px) + gap(30px) = ~92px min */
const Y_INPUT   =   70;
const Y_NODE1   =  200;   // question_agent
const Y_NODE2   =  390;   // domain_agents (parallel fan-out display)
const Y_NODE3   =  590;   // meta_agent
const Y_NODE4   =  740;   // remedy_agent
const Y_NODE5   =  895;   // admin_review_agent
const Y_NODE6A  = 1055;   // report_agent   (post-approve)
const Y_NODE6B  = 1055;   // simplify_agent (post-approve)
const Y_OUT     = 1215;   // END

const H = Y_OUT + 55;

/* Domain agent x-positions — 5 nodes spaced across width */
const DX: number[] = [70, 230, CX, 590, 750];

const NODES: GNode[] = [
  /* ── Input layer ──────────────────────────────────── */
  { id: 'inp-profile',  label: 'User Profile',   sub: 'Name · DOB · Time · Place',        icon: '👤', stepIds: [],                                               color: '#6366f1', x: CX - 200, y: Y_INPUT, r: 36 },
  { id: 'inp-question', label: 'Questions',       sub: 'Topic · Intent · Focus',           icon: '💬', stepIds: [],                                               color: '#6366f1', x: CX,       y: Y_INPUT, r: 36 },
  { id: 'inp-prompt',   label: 'Prompt Style',    sub: 'v1 Warm · v2 Laser-Sharp',         icon: '⚡', stepIds: [],                                               color: '#818cf8', x: CX + 200, y: Y_INPUT, r: 36 },

  /* ── Node 1 — question_agent ──────────────────────── */
  { id: 'q', label: 'Question Agent', sub: 'Normalize · Classify · Intent', icon: '🧩',
    stepIds: ['question'], color: '#f59e0b', x: CX, y: Y_NODE1, r: 44 },

  /* ── Node 2 — domain_agents (fan-out display) ─────── */
  { id: 'astro',  label: 'Astrology',  sub: 'Vedic · KP · Western',          icon: '🪐',
    stepIds: ['astro-vedic','astro-kp','astro-western'],      color: '#3b82f6', x: DX[0], y: Y_NODE2, r: 38 },
  { id: 'num',    label: 'Numerology', sub: 'Indian · Chaldean · Pythag',     icon: '🔢',
    stepIds: ['num-indian','num-chaldean','num-pythagorean'], color: '#8b5cf6', x: DX[1], y: Y_NODE2, r: 38 },
  { id: 'palm',   label: 'Palmistry',  sub: 'Indian · Chinese · Western',     icon: '✋',
    stepIds: ['palm-indian','palm-chinese','palm-western'],   color: '#10b981', x: DX[2], y: Y_NODE2, r: 38 },
  { id: 'tarot',  label: 'Tarot',      sub: 'Rider-Waite · Intuitive',        icon: '🃏',
    stepIds: ['tarot-rw','tarot-int'],                        color: '#f43f5e', x: DX[3], y: Y_NODE2, r: 38 },
  { id: 'vastu',  label: 'Vastu',      sub: 'Traditional · Modern',           icon: '🏠',
    stepIds: ['vastu-trad','vastu-modern'],                   color: '#f97316', x: DX[4], y: Y_NODE2, r: 38 },

  /* ── Node 3 — meta_agent ──────────────────────────── */
  { id: 'meta', label: 'Meta Agent', sub: 'Cross-tradition merge · Consensus', icon: '🧠',
    stepIds: ['meta'], color: '#7c3aed', x: CX, y: Y_NODE3, r: 44 },

  /* ── Node 4 — remedy_agent ────────────────────────── */
  { id: 'remedy', label: 'Remedy Agent', sub: 'Habits · Mantras · Gems · Colors', icon: '🌿',
    stepIds: ['remedy'], color: '#059669', x: CX, y: Y_NODE4, r: 42 },

  /* ── Node 5 — admin_review_agent ─────────────────── */
  { id: 'admin', label: 'Admin Review', sub: 'Validate · Quality Gate · Approve', icon: '📋',
    stepIds: ['admin'], color: '#0ea5e9', x: CX, y: Y_NODE5, r: 42 },

  /* ── Node 6 — report + simplify (post-approve) ────── */
  { id: 'report',   label: 'Report Agent',   sub: 'Narrative · 360° Analysis', icon: '📝',
    stepIds: [], color: '#a855f7', x: CX - 120, y: Y_NODE6A, r: 38 },
  { id: 'simplify', label: 'Simplify Agent', sub: 'WHO/WHAT/WHEN/WHERE · LLM', icon: '✨',
    stepIds: [], color: '#ec4899', x: CX + 120, y: Y_NODE6B, r: 38 },

  /* ── END — Final Report ───────────────────────────── */
  { id: 'out', label: 'Final Report', sub: 'Branded · PDF-ready · 360°', icon: '✅',
    stepIds: [], color: '#16a34a', x: CX, y: Y_OUT, r: 42 },
];

const EDGES: GEdge[] = [
  /* inputs → question agent */
  { from: 'inp-profile',  to: 'q' },
  { from: 'inp-question', to: 'q' },
  { from: 'inp-prompt',   to: 'q', label: 'prompt_v' },
  /* question agent → all 5 domain agents */
  { from: 'q', to: 'astro', label: 'intent[]' },
  { from: 'q', to: 'num' },
  { from: 'q', to: 'palm' },
  { from: 'q', to: 'tarot' },
  { from: 'q', to: 'vastu' },
  /* all domain agents → meta */
  { from: 'astro', to: 'meta' },
  { from: 'num',   to: 'meta' },
  { from: 'palm',  to: 'meta' },
  { from: 'tarot', to: 'meta' },
  { from: 'vastu', to: 'meta' },
  /* sequential backbone */
  { from: 'meta',    to: 'remedy', label: 'insights[]' },
  { from: 'remedy',  to: 'admin',  label: 'remedies[]' },
  { from: 'admin',   to: 'report',   label: 'approved[]' },
  { from: 'admin',   to: 'simplify' },
  { from: 'report',   to: 'out', dashed: true, label: 'narrative' },
  { from: 'simplify', to: 'out', dashed: true, label: 'hw_bullets' },
];

const NM = new Map(NODES.map(n => [n.id, n]));

/* Backend node labels in execution order (for the live ticker) */
const PIPELINE_STEPS: { id: string; label: string }[] = [
  { id: 'question', label: 'Node 1 · Question Agent — normalizing & classifying intent' },
  { id: 'domain',   label: 'Node 2 · Domain Agents — Astrology · Numerology · Palmistry · Tarot · Vastu running in parallel' },
  { id: 'meta',     label: 'Node 3 · Meta Agent — merging cross-tradition insights & resolving conflicts' },
  { id: 'remedy',   label: 'Node 4 · Remedy Agent — generating habits, mantras, colors & gemstones' },
  { id: 'admin',    label: 'Node 5 · Admin Review — validating quality, approving insights' },
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
      <span class="af-sub">6 Nodes · 5 Traditions · Prompt v1/v2 · LangGraph Orchestration</span>
    </div>
    <div class="af-bar-right">
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

      <!-- Guardrails band -->
      <rect x="6" [attr.y]="Y_NODE1 - 62" [attr.width]="W - 12"
            [attr.height]="Y_NODE5 - Y_NODE1 + 148" rx="14"
            fill="rgba(99,102,241,0.012)" stroke="rgba(99,102,241,0.14)"
            stroke-width="1" stroke-dasharray="8 5"/>
      <rect x="6" [attr.y]="Y_NODE1 - 62" [attr.width]="W - 12" height="22" rx="14"
            fill="rgba(99,102,241,0.065)"/>
      <text [attr.x]="CX" [attr.y]="Y_NODE1 - 51" class="guard-lbl" text-anchor="middle">
        🛡 Guardrails · Input Validation · Prompt Version Control · Safety Checks · Retry / Fallback
      </text>

      <!-- Parallel zone band -->
      <rect x="36" [attr.y]="Y_NODE2 - 52" [attr.width]="W - 72" height="104" rx="12"
            fill="rgba(99,102,241,0.018)" stroke="rgba(99,102,241,0.1)"
            stroke-width="1" stroke-dasharray="5 4"/>
      <text [attr.x]="W - 44" [attr.y]="Y_NODE2 + 6" class="zone-lbl"
            text-anchor="end">∥ parallel fan-out</text>

      <!-- Node 6 zone -->
      <rect x="260" [attr.y]="Y_NODE6A - 50" width="300" height="96" rx="12"
            fill="rgba(168,85,247,0.025)" stroke="rgba(168,85,247,0.13)"
            stroke-width="1" stroke-dasharray="5 4"/>
      <text [attr.x]="CX" [attr.y]="Y_NODE6A + 55" class="zone-lbl"
            text-anchor="middle" style="fill:rgba(168,85,247,0.45)">
        narrative + structured output (post-approve)
      </text>

      <!-- Node lane labels -->
      <text x="14" [attr.y]="Y_NODE1" class="lane-lbl">Node 1</text>
      <text x="14" [attr.y]="Y_NODE2" class="lane-lbl">Node 2</text>
      <text x="14" [attr.y]="Y_NODE3" class="lane-lbl">Node 3</text>
      <text x="14" [attr.y]="Y_NODE4" class="lane-lbl">Node 4</text>
      <text x="14" [attr.y]="Y_NODE5" class="lane-lbl">Node 5</text>
      <text x="14" [attr.y]="Y_NODE6A" class="lane-lbl">Node 6</text>

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

    </svg>
  </div>

</div>
  `,
  styles: [`
:host { display: flex; flex-direction: column; height: 100%; }

.af-host {
  display: flex; flex-direction: column;
  height: 100%; width: 100%;
  background: #ffffff;
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
  `]
})
export class AgentFlowComponent implements OnDestroy {
  readonly orch = inject(OrchestratorService);
  protected readonly router = inject(Router);

  maximized = false;
  readonly zoom = signal(1.0);

  readonly zoomPct  = computed(() => Math.round(this.zoom() * 100) + '%');
  readonly svgWidth = computed(() => Math.round(820 * this.zoom()) + 'px');

  zoomIn()    { this.zoom.set(Math.min(2.5, +(this.zoom() + 0.2).toFixed(1))); }
  zoomOut()   { this.zoom.set(Math.max(0.4, +(this.zoom() - 0.2).toFixed(1))); }
  resetZoom() { this.zoom.set(1.0); }

  /* expose to template */
  readonly NODES = NODES;
  readonly EDGES = EDGES;
  readonly W = W;
  readonly H = H;
  readonly Y_NODE1 = Y_NODE1;
  readonly Y_NODE2 = Y_NODE2;
  readonly Y_NODE3 = Y_NODE3;
  readonly Y_NODE4 = Y_NODE4;
  readonly Y_NODE5 = Y_NODE5;
  readonly Y_NODE6A = Y_NODE6A;
  readonly CX = CX;

  ngOnDestroy() {}

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
    if (id === 'question') return PIPELINE_STEPS[0].label;
    if (id.startsWith('astro') || id.startsWith('num') || id.startsWith('palm') || id.startsWith('tarot') || id.startsWith('vastu'))
      return PIPELINE_STEPS[1].label;
    if (id === 'meta')   return PIPELINE_STEPS[2].label;
    if (id === 'remedy') return PIPELINE_STEPS[3].label;
    if (id === 'admin')  return PIPELINE_STEPS[4].label;
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
