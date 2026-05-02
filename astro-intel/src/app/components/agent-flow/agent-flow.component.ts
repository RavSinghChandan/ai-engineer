import { Component, inject, computed, signal, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrchestratorService } from '../../services/orchestrator.service';

/* ─────────────────────────────────────────────────────────────────────────────
   GRAPH DATA
───────────────────────────────────────────────────────────────────────────── */
interface GNode {
  id: string; label: string; sub?: string; icon: string;
  stepIds: string[]; color: string; x: number; y: number; r: number;
}
interface GEdge { from: string; to: string; label?: string; dashed?: boolean; }

/*
  Canvas: 960 wide × 1420 tall
  Layer centres:
    inputs      y=80
    q-agent     y=230   gap=150
    parallel    y=440   gap=210
    meta        y=650   gap=210
    remedy      y=830   gap=180
    admin       y=990   gap=160
    translate   y=1160  gap=170
    output      y=1330  gap=170
*/
const W = 960, H = 1420;
const CX = W / 2;

const NODES: GNode[] = [
  /* Layer 0 — inputs */
  { id: 'user',      label: 'User Profile',       sub: 'Name · DOB · Place of birth',           icon: '👤', stepIds: [],                                               color: '#6366f1', x: CX - 180, y:   80, r: 44 },
  { id: 'ques',      label: 'Questions',          sub: 'What you seek to know',                  icon: '💬', stepIds: [],                                               color: '#6366f1', x: CX + 180, y:   80, r: 44 },

  /* Layer 1 — question agent */
  { id: 'q',         label: 'Question Agent',     sub: 'Normalize · Classify · Intent',          icon: '🧩', stepIds: ['question'],                                     color: '#f59e0b', x: CX,        y:  230, r: 48 },

  /* Layer 2 — 5 parallel domain agents */
  { id: 'astro',     label: 'Astrology',          sub: 'Vedic · KP · Western',                   icon: '🪐', stepIds: ['astro-vedic','astro-kp','astro-western'],       color: '#3b82f6', x:  96,        y:  440, r: 42 },
  { id: 'num',       label: 'Numerology',         sub: 'Indian · Chaldean · Pythagorean',        icon: '🔢', stepIds: ['num-indian','num-chaldean','num-pythagorean'],  color: '#8b5cf6', x: 280,        y:  440, r: 42 },
  { id: 'palm',      label: 'Palmistry',          sub: 'Indian · Chinese · Western',             icon: '✋', stepIds: ['palm-indian','palm-chinese','palm-western'],    color: '#10b981', x: CX,         y:  440, r: 42 },
  { id: 'tarot',     label: 'Tarot',              sub: 'Rider-Waite · Intuitive',                icon: '🃏', stepIds: ['tarot-rw','tarot-int'],                         color: '#f43f5e', x: 680,        y:  440, r: 42 },
  { id: 'vastu',     label: 'Vastu Shastra',      sub: 'Traditional · Modern',                   icon: '🏠', stepIds: ['vastu-trad','vastu-modern'],                    color: '#f97316', x: 864,        y:  440, r: 42 },

  /* Layer 3 — meta consensus */
  { id: 'meta',      label: 'Meta Consensus',     sub: 'Cross-domain merge · Conflict resolve',  icon: '🧠', stepIds: ['meta'],                                        color: '#7c3aed', x: CX,         y:  650, r: 48 },

  /* Layer 4 — remedy */
  { id: 'remedy',    label: 'Remedy Agent',       sub: 'Habits · Mantras · Colors',              icon: '🌿', stepIds: ['remedy'],                                       color: '#059669', x: CX,         y:  830, r: 44 },

  /* Layer 5 — admin review */
  { id: 'admin',     label: 'Admin Review',       sub: 'Human-in-the-loop · Edit · Approve',     icon: '📋', stepIds: ['admin'],                                        color: '#0ea5e9', x: CX,         y:  990, r: 44 },

  /* Layer 6 — translation agent */
  { id: 'translate', label: 'Translation Agent',  sub: '22 Indian Constitutional Languages',     icon: '🌐', stepIds: ['translate'],                                    color: '#e879f9', x: CX,         y: 1160, r: 46 },

  /* Layer 7 — output */
  { id: 'out',       label: 'Final Report',       sub: 'PDF-ready · Multilingual · Branded',     icon: '✅', stepIds: [],                                               color: '#16a34a', x: CX,         y: 1330, r: 44 },
];

const EDGES: GEdge[] = [
  /* inputs → question agent */
  { from: 'user',      to: 'q' },
  { from: 'ques',      to: 'q' },
  /* question agent → all 5 domain agents */
  { from: 'q',         to: 'astro',     label: 'norm_q[]' },
  { from: 'q',         to: 'num' },
  { from: 'q',         to: 'palm' },
  { from: 'q',         to: 'tarot' },
  { from: 'q',         to: 'vastu' },
  /* all domain agents → meta */
  { from: 'astro',     to: 'meta' },
  { from: 'num',       to: 'meta' },
  { from: 'palm',      to: 'meta' },
  { from: 'tarot',     to: 'meta' },
  { from: 'vastu',     to: 'meta' },
  /* sequential pipeline */
  { from: 'meta',      to: 'remedy',    label: 'consensus[]' },
  { from: 'remedy',    to: 'admin',     label: 'remedies[]'  },
  { from: 'admin',     to: 'translate', label: 'approved',   dashed: true },
  { from: 'translate', to: 'out',       label: 'translated[]' },
];

const NM = new Map(NODES.map(n => [n.id, n]));

/* ─────────────────────────────────────────────────────────────────────────────
   DEMO SEQUENCE
   Each entry is a "frame": which stepIds are 'running' and which are 'done'.
   Parallel agents (Step 2) all run together in one frame, then all done.
───────────────────────────────────────────────────────────────────────────── */
interface DemoFrame {
  label: string;
  running: string[];
  done: string[];
}

const ALL_DOMAIN_IDS = ['astro-vedic','astro-kp','astro-western','num-indian','num-chaldean','num-pythagorean','palm-indian','palm-chinese','palm-western','tarot-rw','tarot-int','vastu-trad','vastu-modern'];

const DEMO_FRAMES: DemoFrame[] = [
  {
    label: 'Step 1 · Question Agent normalizing input…',
    running: ['question'],
    done: [],
  },
  {
    label: 'Step 2 · All domain agents running in parallel…',
    running: ALL_DOMAIN_IDS,
    done:    ['question'],
  },
  {
    label: 'Step 3 · Meta Consensus merging all insights…',
    running: ['meta'],
    done:    ['question', ...ALL_DOMAIN_IDS],
  },
  {
    label: 'Step 4 · Remedy Agent generating guidance…',
    running: ['remedy'],
    done:    ['question', ...ALL_DOMAIN_IDS, 'meta'],
  },
  {
    label: 'Step 5 · Admin Review — awaiting approval…',
    running: ['admin'],
    done:    ['question', ...ALL_DOMAIN_IDS, 'meta', 'remedy'],
  },
  {
    label: 'Step 6 · Translation Agent — rendering in selected language…',
    running: ['translate'],
    done:    ['question', ...ALL_DOMAIN_IDS, 'meta', 'remedy', 'admin'],
  },
  {
    label: '✓ Final Report generated successfully in all languages',
    running: [],
    done:    ['question', ...ALL_DOMAIN_IDS, 'meta', 'remedy', 'admin', 'translate'],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────────── */
@Component({
  selector: 'app-agent-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
<!-- ── Full-panel wrapper ─────────────────────────────────────────────────── -->
<div class="af-host" [class.af-maximized]="maximized()">

  <!-- Top bar -->
  <div class="af-bar">
    <div class="af-bar-left">
      <span class="af-dot" [class.af-dot-live]="anyActive()"></span>
      <span class="af-title">Agent Pipeline</span>
      <span class="af-sub">360° · Multi-Tradition Neural Orchestration</span>
    </div>
    <div class="af-bar-right">
      <span class="af-leg"><span class="af-led af-led-idle"></span>Queued</span>
      <span class="af-leg"><span class="af-led af-led-run"></span>Running</span>
      <span class="af-leg"><span class="af-led af-led-done"></span>Done</span>
      <button class="af-icon-btn" (click)="maximized.set(!maximized())" [title]="maximized() ? 'Restore' : 'Full screen'">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          @if (!maximized()) {
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          } @else {
            <path d="M5 1v4H1M9 1v4h4M9 13v-4h4M5 13v-4H1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          }
        </svg>
      </button>
    </div>
  </div>

  <!-- ── Demo control bar ──────────────────────────────────────────────────── -->
  <div class="demo-bar">
    <div class="demo-bar-left">
      @if (!demoActive()) {
        <!-- idle: show both mode buttons -->
        <button class="demo-btn demo-btn-auto" (click)="startAuto()">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
          Auto
        </button>
        <button class="demo-btn demo-btn-manual" (click)="startManual()">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="10" rx="1" fill="currentColor"/><rect x="7" y="1" width="4" height="10" rx="1" fill="currentColor"/></svg>
          Step-by-Step
        </button>
      } @else {
        <!-- active: show mode indicator + stop -->
        <span class="demo-mode-badge" [class.badge-auto]="demoMode()==='auto'" [class.badge-manual]="demoMode()==='manual'">
          {{ demoMode() === 'auto' ? '▶ Auto' : '⏸ Manual' }}
        </span>
        <button class="demo-btn demo-btn-stop" (click)="stopDemo()">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>
          Reset
        </button>
      }
    </div>

    <div class="demo-bar-center">
      @if (demoActive()) {
        <!-- Step dots -->
        <div class="demo-dots">
          @for (f of demoFrames; track $index) {
            <span class="demo-dot"
                  [class.dot-done]="$index < demoStep()"
                  [class.dot-active]="$index === demoStep()"></span>
          }
        </div>
        <!-- Current step label -->
        <span class="demo-step-label">{{ currentFrameLabel() }}</span>
      } @else {
        <span class="demo-hint">Demo mode · visualise execution without running real agents</span>
      }
    </div>

    <div class="demo-bar-right">
      @if (demoActive() && demoMode() === 'manual') {
        <button class="demo-btn demo-btn-next" (click)="nextStep()" [disabled]="demoStep() >= demoFrames.length - 1">
          Next
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l5 4-5 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      }
    </div>
  </div>

  <!-- SVG Graph -->
  <div class="af-canvas-wrap" #canvasWrap>
    <svg class="af-svg" [attr.viewBox]="viewBox()" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- Grid -->
        <pattern id="afGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0L0 0 0 40" fill="none" stroke="rgba(99,102,241,0.06)" stroke-width="1"/>
        </pattern>
        <!-- Glow filters -->
        <filter id="afGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="afGlowSm" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <!-- Drop shadow for cards -->
        <filter id="afShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="rgba(0,0,0,0.08)"/>
        </filter>
        <!-- Arrowheads -->
        <marker id="arGreen" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 1 L6 4 L0 7z" fill="#10b981" opacity="0.9"/>
        </marker>
        <marker id="arBlue" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 1 L6 4 L0 7z" fill="#6366f1" opacity="0.7"/>
        </marker>
        <marker id="arGray" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 1 L6 4 L0 7z" fill="rgba(148,163,184,0.5)"/>
        </marker>
      </defs>

      <!-- Background -->
      <rect width="100%" height="100%" fill="#fafbff"/>
      <rect width="100%" height="100%" fill="url(#afGrid)"/>

      <!-- Step lane labels — left margin, centred on each layer's Y -->
      <text x="14" y="230"  class="lane-label">Step 1</text>
      <text x="14" y="440"  class="lane-label">Step 2</text>
      <text x="14" y="650"  class="lane-label">Step 3</text>
      <text x="14" y="830"  class="lane-label">Step 4</text>
      <text x="14" y="990"  class="lane-label">Step 5</text>
      <text x="14" y="1160" class="lane-label">Step 6</text>

      <!-- Parallel zone highlight — from just above nodes to just below sub-labels -->
      <rect x="40" y="386" [attr.width]="W - 80" height="128" rx="18"
            fill="rgba(99,102,241,0.025)" stroke="rgba(99,102,241,0.13)"
            stroke-width="1" stroke-dasharray="6 4"/>
      <text [attr.x]="W - 50" y="452" class="lane-label"
            style="text-anchor:end;fill:rgba(99,102,241,0.4)">∥ parallel</text>

      <!-- Translation zone highlight -->
      <rect x="200" y="1096" width="560" height="128" rx="18"
            fill="rgba(232,121,249,0.025)" stroke="rgba(232,121,249,0.18)"
            stroke-width="1" stroke-dasharray="6 4"/>
      <text [attr.x]="W - 50" y="1162" class="lane-label"
            style="text-anchor:end;fill:rgba(232,121,249,0.45)">🌐 22 langs</text>

      <!-- ── Edges ── -->
      @for (edge of edges(); track edge.from + edge.to) {
        @if (edgePath(edge); as ep) {
          <path [attr.d]="ep.d" [attr.stroke]="ep.stroke" [attr.stroke-width]="ep.w"
                [attr.stroke-dasharray]="ep.dash" [attr.marker-end]="ep.marker"
                fill="none" opacity="0.85" [class.anim-dash]="ep.animated"/>
          @if (edge.label) {
            <text [attr.x]="ep.lx" [attr.y]="ep.ly" class="edge-lbl" text-anchor="middle">{{ edge.label }}</text>
          }
        }
      }

      <!-- ── Nodes ── -->
      @for (node of nodes(); track node.id) {
        @if (nr(node); as n) {
          <g [attr.transform]="'translate('+node.x+','+node.y+')'">

            <!-- Pulse rings (running) -->
            @if (n.status === 'running') {
              <circle [attr.r]="node.r + 14" fill="none" [attr.stroke]="node.color"
                      stroke-width="1.5" class="ring1" opacity="0.35"/>
              <circle [attr.r]="node.r + 24" fill="none" [attr.stroke]="node.color"
                      stroke-width="0.8" class="ring2" opacity="0.18"/>
            }

            <!-- Done ring -->
            @if (n.status === 'done') {
              <circle [attr.r]="node.r + 10" fill="none" stroke="#10b981"
                      stroke-width="1.5" opacity="0.4"/>
            }

            <!-- Card shadow -->
            <circle [attr.r]="node.r + 2" fill="rgba(0,0,0,0.06)" cy="3"/>

            <!-- Main circle -->
            <circle [attr.r]="node.r" [attr.fill]="n.fill" [attr.stroke]="n.stroke"
                    [attr.stroke-width]="n.sw" [attr.filter]="n.status!=='idle'?'url(#afGlow)':'url(#afShadow)'"/>

            <!-- Subtle inner ring -->
            <circle [attr.r]="node.r - 5" fill="none"
                    [attr.stroke]="n.status==='idle'?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.3)'"
                    stroke-width="1"/>

            <!-- Icon (upper half of circle) -->
            <text class="node-icon" text-anchor="middle" dy="-6">{{ node.icon }}</text>

            <!-- Label (lower half of circle) -->
            <text class="node-lbl" [attr.fill]="n.lc" text-anchor="middle" dy="16">{{ node.label }}</text>

            <!-- Sub label: absolutely positioned BELOW the circle, never inside it -->
            @if (node.sub) {
              <text class="node-sub" text-anchor="middle"
                    [attr.y]="node.r + 16" [attr.fill]="n.subc">{{ node.sub }}</text>
            }

            <!-- Status badge -->
            @if (n.status !== 'idle') {
              <g [attr.transform]="'translate('+(node.r-5)+','+(-node.r+5)+')'">
                <circle r="9" [attr.fill]="n.badgeFill"/>
                <text class="badge-txt" text-anchor="middle" dy="4">{{ n.status==='running'?'●':'✓' }}</text>
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

/* ── Host wrapper ────────────────────────────────────────────────────────── */
.af-host {
  display: flex; flex-direction: column;
  height: 100%; width: 100%;
  background: #ffffff;
  border-radius: 0;
  overflow: hidden;
  transition: all 0.28s cubic-bezier(0.4,0,0.2,1);
}
.af-maximized {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9999 !important;
  border-radius: 0 !important;
}

/* ── Top bar ─────────────────────────────────────────────────────────────── */
.af-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px;
  background: #ffffff;
  border-bottom: 1px solid rgba(99,102,241,0.12);
  flex-shrink: 0;
}
.af-bar-left  { display: flex; align-items: center; gap: 10px; }
.af-bar-right { display: flex; align-items: center; gap: 14px; }

.af-dot { width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; flex-shrink: 0; }
.af-dot-live { background: #10b981; box-shadow: 0 0 8px rgba(16,185,129,0.6); animation: dotPulse 1.6s ease-in-out infinite; }
@keyframes dotPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

.af-title { font-size: 13px; font-weight: 700; color: #1e1b4b; letter-spacing: 0.01em; }
.af-sub   { font-size: 10.5px; color: #94a3b8; }

.af-leg { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: #64748b; }
.af-led { width: 7px; height: 7px; border-radius: 50%; }
.af-led-idle { background: #e2e8f0; border: 1px solid #cbd5e1; }
.af-led-run  { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.5); animation: dotPulse 1.4s infinite; }
.af-led-done { background: #10b981; }

.af-icon-btn {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(99,102,241,0.18);
  background: #f8f9ff; color: #6366f1; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.af-icon-btn:hover { background: #eef2ff; border-color: #6366f1; }

/* ── SVG canvas ──────────────────────────────────────────────────────────── */
.af-canvas-wrap {
  flex: 1; overflow: auto; background: #fafbff;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 8px;
}
.af-canvas-wrap::-webkit-scrollbar { width: 6px; height: 6px; }
.af-canvas-wrap::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.2); border-radius: 3px; }
.af-svg { display: block; width: 100%; max-width: 900px; height: auto; }

/* ── SVG text styles ─────────────────────────────────────────────────────── */
.lane-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  fill: rgba(99,102,241,0.4); font-family: 'Inter', system-ui, sans-serif;
  dominant-baseline: middle;
}
.node-icon { font-size: 22px; dominant-baseline: middle; }
.node-lbl  { font-size: 12px; font-weight: 700; font-family: 'Inter', system-ui, sans-serif; dominant-baseline: middle; }
.node-sub  { font-size: 9.5px; font-family: 'Inter', system-ui, sans-serif; }
.edge-lbl  {
  font-size: 9.5px; font-family: 'Inter', system-ui, sans-serif; font-weight: 600;
  fill: #6366f1; paint-order: stroke; stroke: #fafbff; stroke-width: 4;
}
.badge-txt { font-size: 8px; font-weight: 900; fill: #fff; font-family: 'Inter', sans-serif; dominant-baseline: middle; }

/* ── Animations ──────────────────────────────────────────────────────────── */
.anim-dash { stroke-dasharray: 8 5; animation: dashFlow 1.4s linear infinite; }
@keyframes dashFlow { to { stroke-dashoffset: -26; } }
.ring1 { animation: ringPulse 1.8s ease-in-out infinite; }
.ring2 { animation: ringPulse 1.8s ease-in-out infinite 0.5s; }
@keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.35} 50%{transform:scale(1.06);opacity:0.1} }

/* ── Demo control bar ────────────────────────────────────────────────────── */
.demo-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 16px;
  background: #f8f9ff;
  border-bottom: 1px solid rgba(99,102,241,0.1);
  flex-shrink: 0; min-height: 44px;
}
.demo-bar-left  { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.demo-bar-center { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden; }
.demo-bar-right { flex-shrink: 0; }

/* Buttons */
.demo-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 8px; border: 1.5px solid transparent;
  font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.15s; white-space: nowrap;
}
.demo-btn-auto {
  background: #6366f1; color: #fff; border-color: #6366f1;
  box-shadow: 0 2px 8px rgba(99,102,241,0.3);
}
.demo-btn-auto:hover { background: #4f46e5; border-color: #4f46e5; }

.demo-btn-manual {
  background: #fff; color: #374151; border-color: rgba(0,0,0,0.15);
}
.demo-btn-manual:hover { border-color: #6366f1; color: #6366f1; background: #eef2ff; }

.demo-btn-stop {
  background: #fff; color: #6b7280; border-color: rgba(0,0,0,0.12);
}
.demo-btn-stop:hover { border-color: #ef4444; color: #ef4444; background: #fff5f5; }

.demo-btn-next {
  background: #6366f1; color: #fff; border-color: #6366f1;
  box-shadow: 0 2px 8px rgba(99,102,241,0.25);
}
.demo-btn-next:hover:not(:disabled) { background: #4f46e5; }
.demo-btn-next:disabled { opacity: 0.4; cursor: not-allowed; }

/* Mode badge */
.demo-mode-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; font-weight: 700; padding: 3px 10px;
  border-radius: 99px; letter-spacing: 0.04em;
}
.badge-auto   { background: rgba(99,102,241,0.12); color: #4338ca; }
.badge-manual { background: rgba(245,158,11,0.12); color: #b45309; }

/* Step dots */
.demo-dots { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.demo-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #e2e8f0; border: 1.5px solid #cbd5e1; transition: all 0.2s;
}
.demo-dot.dot-done   { background: #10b981; border-color: #10b981; }
.demo-dot.dot-active {
  background: #6366f1; border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
  transform: scale(1.3);
}

/* Step label */
.demo-step-label {
  font-size: 11px; color: #4338ca; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.demo-hint { font-size: 10.5px; color: #9ca3af; }
  `]
})
export class AgentFlowComponent implements OnDestroy {
  private orch = inject(OrchestratorService);

  readonly maximized = signal(false);
  readonly W = W; readonly H = H;

  /* ── Demo state ── */
  readonly demoActive = signal(false);
  readonly demoMode   = signal<'auto' | 'manual'>('auto');
  readonly demoStep   = signal(0);
  readonly demoFrames = DEMO_FRAMES;

  readonly currentFrameLabel = computed(() =>
    this.demoActive() ? DEMO_FRAMES[this.demoStep()]?.label ?? '' : ''
  );

  private _autoTimer: ReturnType<typeof setInterval> | null = null;

  startAuto() {
    this.demoMode.set('auto');
    this.demoStep.set(0);
    this.demoActive.set(true);
    this._autoTimer = setInterval(() => {
      const next = this.demoStep() + 1;
      if (next >= DEMO_FRAMES.length) { this.stopDemo(); return; }
      this.demoStep.set(next);
    }, 1800);
  }

  startManual() {
    this.demoMode.set('manual');
    this.demoStep.set(0);
    this.demoActive.set(true);
  }

  nextStep() {
    const next = this.demoStep() + 1;
    if (next < DEMO_FRAMES.length) this.demoStep.set(next);
  }

  stopDemo() {
    if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
    this.demoActive.set(false);
    this.demoStep.set(0);
  }

  ngOnDestroy() { this.stopDemo(); }

  /* ── Step map: demo overrides real orchestrator ── */
  private sm = computed(() => {
    if (this.demoActive()) {
      const frame = DEMO_FRAMES[this.demoStep()];
      const m: Record<string, string> = {};
      frame.done.forEach(id => m[id] = 'done');
      frame.running.forEach(id => m[id] = 'running');
      return m;
    }
    const m: Record<string, string> = {};
    for (const s of this.orch.steps()) m[s.id] = s.status;
    return m;
  });

  readonly anyActive = computed(() =>
    this.demoActive()
      ? DEMO_FRAMES[this.demoStep()]?.running.length > 0
      : this.orch.steps().some(s => s.status === 'running')
  );

  readonly nodes = computed(() => NODES);
  readonly edges = computed(() => EDGES);
  readonly viewBox = computed(() => `0 0 ${W} ${H}`);

  @HostListener('document:keydown.escape')
  onEsc() { if (this.maximized()) this.maximized.set(false); }

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
      fill = `${node.color}28`; stroke = node.color; sw = 2.5;
      lc = '#1e1b4b'; subc = '#6366f1';
    } else if (s === 'done') {
      fill = 'rgba(16,185,129,0.12)'; stroke = '#10b981'; sw = 2.5;
      lc = '#065f46'; subc = '#10b981'; badgeFill = '#10b981';
    } else if (isIO) {
      fill = 'rgba(99,102,241,0.07)'; stroke = 'rgba(99,102,241,0.25)'; sw = 1.5;
      lc = '#4338ca'; subc = '#94a3b8';
    } else {
      fill = `${node.color}0f`; stroke = `${node.color}55`; sw = 1.5;
      lc = '#374151'; subc = '#9ca3af';
    }

    return { status: s, fill, stroke, sw, lc, subc, badgeFill, lines: node.label.split('\n') };
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
    if (fDone)         { stroke = 'rgba(16,185,129,0.8)'; w = 2.2; marker = 'url(#arGreen)'; }
    else if (animated) { stroke = 'rgba(99,102,241,0.7)'; w = 2.2; marker = 'url(#arBlue)'; }
    else               { stroke = 'rgba(203,213,225,0.8)'; w = 1.5; marker = 'url(#arGray)'; }

    const dash = animated ? (edge.dashed ? '7 5' : '9 5') : (edge.dashed ? '5 4' : undefined);

    /* Cubic bezier: exit bottom of source circle, enter top of target circle */
    const fx = f.x, fy = f.y + f.r + 2;   /* +2 so arrow tip clears the circle edge */
    const tx = t.x, ty = t.y - t.r - 2;
    const dy = ty - fy;
    /* control points: vertical tangent at each end so curves are smooth */
    const cp1y = fy + dy * 0.45;
    const cp2y = ty - dy * 0.45;
    const d = `M${fx} ${fy} C${fx} ${cp1y},${tx} ${cp2y},${tx} ${ty}`;

    /*
      Edge label safe zone: the clear vertical band between
        source sub-label bottom  = f.y + f.r + 32
        target circle top        = t.y - t.r - 14
      Place label at midpoint of that band; for vertical edges shift left,
      for diagonal edges shift right so it clears the curve.
    */
    const safeTop = f.y + f.r + 32;
    const safeBot = t.y - t.r - 14;
    const safeMidY = (safeTop + safeBot) / 2;
    const isVertical = Math.abs(fx - tx) < 8;
    const lx = isVertical ? fx - 38 : fx + (tx - fx) * 0.35 + 26;
    const ly = safeMidY;

    return { d, stroke, w, dash, marker, animated, lx, ly };
  }
}
