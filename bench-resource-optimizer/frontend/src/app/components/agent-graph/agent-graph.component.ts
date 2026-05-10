import { Component, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

// ─── Graph topology (matches the AstroIntel-style architecture diagram) ───────

interface GNode {
  id: string;
  label: string;
  icon: string;
  sub: string;          // sub-label under node
  row: number;          // layout row (0 = inputs, 1..N = agent rows)
  col: number;          // layout column within row
  color: string;
  nodeTag?: string;     // e.g. "NODE 1"
  api?: string;         // e.g. "POST /map-role"
  type: 'input' | 'agent' | 'output' | 'parallel';
}

interface GEdge {
  from: string;
  to: string;
  label?: string;
}

// Bench Resource Optimizer graph
const GRAPH_NODES: GNode[] = [
  // ── Row 0: Inputs ─────────────────────────────────────────────────────────
  { id: 'cv',       label: 'Employee CV',     icon: '📄', sub: 'PDF · Skills · Experience',    row: 0, col: 0, color: '#6366f1', type: 'input' },
  { id: 'role-req', label: 'Role Requirement', icon: '👔', sub: 'Target Role · Gap Analysis',   row: 0, col: 1, color: '#6366f1', type: 'input' },
  { id: 'config',   label: 'Plan Config',      icon: '⚙️', sub: 'Days · Prompt v1 / v2',        row: 0, col: 2, color: '#6366f1', type: 'input' },

  // ── Row 1: CV Parser Agent ────────────────────────────────────────────────
  { id: 'cv-agent', label: 'CV Parser Agent', icon: '🧠', sub: 'Extract · Normalize · Classify',
    row: 1, col: 0, color: '#7c3aed', nodeTag: 'NODE 1', api: 'POST /upload-cv', type: 'agent' },

  // ── Row 2: Skill agents (parallel) ───────────────────────────────────────
  { id: 'java',     label: 'Java Agent',     icon: '☕', sub: 'Spring · Microservices · JVM',    row: 2, col: 0, color: '#8b5cf6', nodeTag: 'NODE 2', type: 'parallel' },
  { id: 'react',    label: 'React Agent',    icon: '⚛️', sub: 'Hooks · Redux · TypeScript',      row: 2, col: 1, color: '#8b5cf6', nodeTag: 'NODE 2', type: 'parallel' },
  { id: 'devops',   label: 'DevOps Agent',   icon: '🐳', sub: 'Docker · K8s · CI/CD',            row: 2, col: 2, color: '#8b5cf6', nodeTag: 'NODE 2', type: 'parallel' },
  { id: 'data',     label: 'Data Sci Agent', icon: '📊', sub: 'Python · ML · Pandas',            row: 2, col: 3, color: '#8b5cf6', nodeTag: 'NODE 2', type: 'parallel' },
  { id: 'fullstack',label: 'Fullstack Agent',icon: '🔗', sub: 'Angular · Node · REST',           row: 2, col: 4, color: '#8b5cf6', nodeTag: 'NODE 2', type: 'parallel' },

  // ── Row 3: Role Mapper (meta / merge) ────────────────────────────────────
  { id: 'role-map', label: 'Role Mapper',    icon: '🎯', sub: 'FAISS · Gap Score · Readiness',
    row: 3, col: 0, color: '#0ea5e9', nodeTag: 'NODE 3', api: 'POST /map-role', type: 'agent' },

  // ── Row 4: RAG Planner ────────────────────────────────────────────────────
  { id: 'rag',      label: 'RAG Planner',    icon: '⟳',  sub: 'BM25 · FAISS · HyDE · RRF',
    row: 4, col: 0, color: '#f59e0b', nodeTag: 'NODE 4', api: 'POST /generate-plan', type: 'agent' },

  // ── Row 5: Quality Gate ───────────────────────────────────────────────────
  { id: 'judge',    label: 'LLM Judge',      icon: '⚖️', sub: 'Relevance · Accuracy · Score ≥ 3.5',
    row: 5, col: 0, color: '#ef4444', nodeTag: 'NODE 5', api: 'POST /evaluate', type: 'agent' },

  // ── Row 6: Output agents (parallel) ──────────────────────────────────────
  { id: 'plan-out', label: 'Plan Agent',     icon: '📅', sub: 'Day Tasks · asyncio.gather',      row: 6, col: 0, color: '#10b981', nodeTag: 'NODE 6', type: 'parallel' },
  { id: 'cache',    label: 'Cache Layer',    icon: '⚡', sub: 'L1 SHA-256 · L2 Cosine 0.92',     row: 6, col: 1, color: '#10b981', nodeTag: 'NODE 6', type: 'parallel' },

  // ── Row 7: Progress Tracker ───────────────────────────────────────────────
  { id: 'tracker',  label: 'Progress Tracker', icon: '✅', sub: 'Readiness % · Skill Coverage',
    row: 7, col: 0, color: '#06b6d4', nodeTag: 'NODE 7', api: 'POST /update-progress', type: 'agent' },

  // ── Row 8: Final output ───────────────────────────────────────────────────
  { id: 'output',   label: 'Learning Plan',  icon: '🎓', sub: 'N-Day Plan · Internal Resources · PDF',
    row: 8, col: 0, color: '#22c55e', type: 'output' },
];

const GRAPH_EDGES: GEdge[] = [
  // Inputs → CV Parser
  { from: 'cv',       to: 'cv-agent' },
  { from: 'role-req', to: 'cv-agent' },
  { from: 'config',   to: 'cv-agent' },

  // CV Parser → skill agents
  { from: 'cv-agent', to: 'java',      label: 'skills[]' },
  { from: 'cv-agent', to: 'react',     label: 'skills[]' },
  { from: 'cv-agent', to: 'devops',    label: 'skills[]' },
  { from: 'cv-agent', to: 'data',      label: 'skills[]' },
  { from: 'cv-agent', to: 'fullstack', label: 'skills[]' },

  // Skill agents → Role Mapper
  { from: 'java',      to: 'role-map', label: 'gap[]' },
  { from: 'react',     to: 'role-map', label: 'gap[]' },
  { from: 'devops',    to: 'role-map', label: 'gap[]' },
  { from: 'data',      to: 'role-map', label: 'gap[]' },
  { from: 'fullstack', to: 'role-map', label: 'gap[]' },

  // Role Mapper → RAG Planner
  { from: 'role-map', to: 'rag', label: 'missing_skills[]' },

  // RAG → Judge
  { from: 'rag',      to: 'judge', label: 'draft_plan' },

  // Judge → parallel outputs
  { from: 'judge',    to: 'plan-out', label: 'approved' },
  { from: 'judge',    to: 'cache',    label: 'approved' },

  // Parallel → Tracker
  { from: 'plan-out', to: 'tracker' },
  { from: 'cache',    to: 'tracker' },

  // Tracker → Final
  { from: 'tracker',  to: 'output', label: 'readiness%' },
];

// Execution sequence: which nodes light up in order when "Run" is clicked
const EXEC_SEQUENCE = [
  ['cv', 'role-req', 'config'],
  ['cv-agent'],
  ['java', 'react', 'devops', 'data', 'fullstack'],
  ['role-map'],
  ['rag'],
  ['judge'],
  ['plan-out', 'cache'],
  ['tracker'],
  ['output'],
];

// Which real API to call per sequence step
const API_CALLS: { step: number; method: string; path: string; body: any }[] = [
  { step: 1, method: 'GET',  path: '/health', body: null },
  { step: 2, method: 'GET',  path: '/roles',  body: null },
  { step: 3, method: 'POST', path: '/map-role', body: { user_id: 'demo-user-001', target_role: 'Java Backend Developer' } },
  { step: 4, method: 'POST', path: '/generate-plan', body: { user_id: 'demo-user-001', target_role: 'Java Backend Developer', missing_skills: ['Docker', 'Kubernetes'], num_days: 3 } },
  { step: 6, method: 'GET',  path: '/progress/demo-user-001', body: null },
];

@Component({
  selector: 'app-agent-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="ag-page">

  <!-- Header -->
  <div class="ag-header">
    <div class="ag-title">
      <span class="ag-icon">⬡</span>
      <div>
        <h1>Agent Graph</h1>
        <p>Bench Resource Optimizer · Live execution trace · DeepSeek LLM · FAISS RAG · FastAPI</p>
      </div>
    </div>
    <div class="ag-actions">
      <button class="run-btn" (click)="runFlow()" [disabled]="running()">
        @if (running()) {
          <span class="spinner"></span> Executing…
        } @else {
          ▶ Run Flow
        }
      </button>
      <button class="reset-btn" (click)="reset()" [disabled]="running()">↺ Reset</button>
      <div class="step-pill">{{ statusLabel() }}</div>
    </div>
  </div>

  <!-- Guardrails bar -->
  <div class="guardrails-bar">
    <span class="gr-icon">🛡️</span>
    Guardrails &nbsp;·&nbsp; Input Validation &nbsp;·&nbsp; Prompt Version Control &nbsp;·&nbsp; Safety Checks &nbsp;·&nbsp; Retry / Fallback &nbsp;·&nbsp; Circuit Breaker &nbsp;·&nbsp; Semantic Cache
  </div>

  <!-- Graph canvas -->
  <div class="graph-canvas">

    <!-- Row 0: Inputs -->
    <div class="graph-row row-inputs">
      @for (n of row(0); track n.id) {
        <div class="input-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color" (click)="selectNode(n)">
          <div class="in-icon">{{ n.icon }}</div>
          <div class="in-label">{{ n.label }}</div>
          <div class="in-sub">{{ n.sub }}</div>
        </div>
      }
    </div>

    <!-- Arrow down from inputs to node 1 -->
    <div class="row-connector">
      <div class="conn-line" [class.conn-active]="isDone('cv')"></div>
    </div>

    <!-- Row 1: CV Parser (single center) -->
    <div class="graph-row row-single">
      @for (n of row(1); track n.id) {
        <ng-container>
          <div class="agent-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
               (click)="selectNode(n)">
            @if (n.nodeTag) { <div class="node-tag">{{ n.nodeTag }}</div> }
            <div class="an-icon">{{ n.icon }}</div>
            <div class="an-label">{{ n.label }}</div>
            <div class="an-sub">{{ n.sub }}</div>
            @if (n.api) { <div class="an-api">{{ n.api }}</div> }
            @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
          </div>
          <div class="an-edge-label">skills[]</div>
        </ng-container>
      }
    </div>

    <!-- Fan-out connector row 1→2 -->
    <div class="fanout-connector" [class.conn-active]="isDone('cv-agent')">
      <div class="fanout-line"></div>
    </div>

    <!-- Row 2: Skill agents (5 parallel) -->
    <div class="graph-row row-parallel">
      @for (n of row(2); track n.id) {
        <div class="agent-node agent-node-sm" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          @if ($first) { <div class="node-tag">{{ n.nodeTag }}</div> }
          <div class="an-icon an-icon-sm">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
        </div>
      }
    </div>

    <!-- Fan-in connector row 2→3 -->
    <div class="fanout-connector fanin" [class.conn-active]="isDone('java')">
      <div class="fanout-line"></div>
    </div>
    <div class="an-edge-label">gap[]</div>

    <!-- Row 3: Role Mapper -->
    <div class="graph-row row-single">
      @for (n of row(3); track n.id) {
        <div class="agent-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          @if (n.nodeTag) { <div class="node-tag">{{ n.nodeTag }}</div> }
          <div class="an-icon">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (n.api) { <div class="an-api">{{ n.api }}</div> }
          @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
        </div>
      }
    </div>

    <div class="row-connector">
      <div class="conn-line" [class.conn-active]="isDone('role-map')"></div>
      <div class="conn-label">missing_skills[]</div>
    </div>

    <!-- Row 4: RAG Planner -->
    <div class="graph-row row-single">
      @for (n of row(4); track n.id) {
        <div class="agent-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          @if (n.nodeTag) { <div class="node-tag">{{ n.nodeTag }}</div> }
          <div class="an-icon">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (n.api) { <div class="an-api">{{ n.api }}</div> }
          @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
        </div>
      }
    </div>

    <div class="row-connector">
      <div class="conn-line" [class.conn-active]="isDone('rag')"></div>
      <div class="conn-label">draft_plan</div>
    </div>

    <!-- Row 5: LLM Judge -->
    <div class="graph-row row-single">
      @for (n of row(5); track n.id) {
        <div class="agent-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          @if (n.nodeTag) { <div class="node-tag">{{ n.nodeTag }}</div> }
          <div class="an-icon">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (n.api) { <div class="an-api">{{ n.api }}</div> }
          @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
        </div>
      }
    </div>

    <!-- Fan-out connector row 5→6 -->
    <div class="fanout-connector fanout-2" [class.conn-active]="isDone('judge')">
      <div class="fanout-line"></div>
    </div>
    <div class="an-edge-label">approved</div>

    <!-- Row 6: Plan Agent + Cache (parallel) -->
    <div class="graph-row row-parallel row-parallel-2">
      @for (n of row(6); track n.id) {
        <div class="agent-node agent-node-sm" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          @if ($first) { <div class="node-tag">{{ n.nodeTag }}</div> }
          <div class="an-icon an-icon-sm">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
        </div>
      }
    </div>

    <!-- Fan-in connector row 6→7 -->
    <div class="fanout-connector fanin fanout-2" [class.conn-active]="isDone('plan-out')">
      <div class="fanout-line"></div>
    </div>

    <!-- Row 7: Progress Tracker -->
    <div class="graph-row row-single">
      @for (n of row(7); track n.id) {
        <div class="agent-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          @if (n.nodeTag) { <div class="node-tag">{{ n.nodeTag }}</div> }
          <div class="an-icon">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (n.api) { <div class="an-api">{{ n.api }}</div> }
          @if (isActive(n.id)) { <div class="an-pulse-ring"></div> }
        </div>
      }
    </div>

    <div class="row-connector">
      <div class="conn-line" [class.conn-active]="isDone('tracker')"></div>
      <div class="conn-label">readiness%</div>
    </div>

    <!-- Row 8: Final output -->
    <div class="graph-row row-single">
      @for (n of row(8); track n.id) {
        <div class="output-node" [class.gn-active]="isActive(n.id)" [class.gn-done]="isDone(n.id)" [style.--nc]="n.color"
             (click)="selectNode(n)">
          <div class="an-icon">{{ n.icon }}</div>
          <div class="an-label">{{ n.label }}</div>
          <div class="an-sub">{{ n.sub }}</div>
          @if (isDone(n.id)) { <div class="output-glow"></div> }
        </div>
      }
    </div>

  </div><!-- /graph-canvas -->

  <!-- Detail panel (appears when a node is clicked) -->
  @if (selectedNode()) {
    <div class="detail-panel">
      <div class="dp-header" [style.background]="selectedNode()!.color">
        <span class="dp-icon">{{ selectedNode()!.icon }}</span>
        <div>
          <div class="dp-title">{{ selectedNode()!.label }}</div>
          @if (selectedNode()!.nodeTag) { <div class="dp-tag">{{ selectedNode()!.nodeTag }}</div> }
        </div>
        <button class="dp-close" (click)="selectedNode.set(null)">✕</button>
      </div>
      <div class="dp-body">
        <div class="dp-sub">{{ selectedNode()!.sub }}</div>
        @if (selectedNode()!.api) {
          <div class="dp-api">{{ selectedNode()!.api }}</div>
        }
        <div class="dp-desc">{{ nodeDescription(selectedNode()!.id) }}</div>
        @if (apiResponses()[selectedNode()!.id]) {
          <div class="dp-resp-title">Live API Response</div>
          <pre class="dp-resp">{{ apiResponses()[selectedNode()!.id] | json }}</pre>
        }
      </div>
    </div>
  }

</div>
  `,
  styles: [`
    /* ── Page ─────────────────────────────────────────────────────────────── */
    .ag-page {
      background: #f8fafc;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      position: relative;
    }

    /* ── Header ──────────────────────────────────────────────────────────── */
    .ag-header {
      background: #0f172a;
      padding: 18px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .ag-title { display: flex; align-items: center; gap: 14px; }
    .ag-icon { font-size: 28px; }
    .ag-title h1 { font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 2px; }
    .ag-title p  { font-size: 12px; color: #64748b; margin: 0; }
    .ag-actions  { display: flex; align-items: center; gap: 10px; }
    .run-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 20px; background: #0ea5e9; color: #fff;
      border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.15s;
    }
    .run-btn:hover:not(:disabled) { background: #0284c7; }
    .run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .reset-btn {
      padding: 9px 16px; background: #1e293b; color: #94a3b8;
      border: 1px solid #334155; border-radius: 8px; font-size: 13px;
      font-weight: 600; cursor: pointer;
    }
    .reset-btn:hover:not(:disabled) { background: #334155; color: #fff; }
    .reset-btn:disabled { opacity: 0.4; }
    .step-pill {
      padding: 6px 14px; background: #1e293b; color: #7dd3fc;
      border-radius: 999px; font-size: 12px; font-weight: 700;
      border: 1px solid #334155;
    }
    .spinner {
      width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
      border-radius: 50%; animation: spin .6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Guardrails bar ──────────────────────────────────────────────────── */
    .guardrails-bar {
      background: #e0e7ff; color: #3730a3;
      font-size: 12px; font-weight: 600;
      padding: 8px 32px;
      display: flex; align-items: center; gap: 8px;
      border-bottom: 1px solid #c7d2fe;
    }
    .gr-icon { font-size: 14px; }

    /* ── Graph canvas ────────────────────────────────────────────────────── */
    .graph-canvas {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 24px 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
    }

    /* ── Rows ────────────────────────────────────────────────────────────── */
    .graph-row {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      width: 100%;
    }
    .row-inputs  { gap: 40px; }
    .row-single  { gap: 0; }
    .row-parallel { gap: 16px; flex-wrap: nowrap; }
    .row-parallel-2 { gap: 40px; }

    /* ── Connectors ──────────────────────────────────────────────────────── */
    .row-connector {
      display: flex; flex-direction: column; align-items: center;
      height: 44px; position: relative;
    }
    .conn-line {
      width: 2px; flex: 1;
      background: #cbd5e1;
      position: relative;
    }
    .conn-line::after {
      content: '▼';
      position: absolute; bottom: -14px; left: 50%;
      transform: translateX(-50%);
      color: #cbd5e1; font-size: 12px;
    }
    .conn-line.conn-active { background: #0ea5e9; }
    .conn-line.conn-active::after { color: #0ea5e9; }
    .conn-label {
      font-size: 11px; font-weight: 700; color: #0ea5e9;
      position: absolute; right: -60px; top: 12px;
      white-space: nowrap;
    }

    /* Fan-out / fan-in lines */
    .fanout-connector {
      width: 100%; height: 32px;
      display: flex; justify-content: center; align-items: center;
      position: relative;
    }
    .fanout-line {
      width: 70%; height: 2px; background: #cbd5e1;
      position: relative;
    }
    .fanout-line::before,
    .fanout-line::after {
      content: '';
      position: absolute;
      width: 2px; height: 20px;
      background: inherit; top: 0;
    }
    .fanout-line::before { left: 0; }
    .fanout-line::after  { right: 0; }
    .fanout-connector.conn-active .fanout-line { background: #0ea5e9; }
    .fanin .fanout-line::before { top: auto; bottom: 0; }
    .fanin .fanout-line::after  { top: auto; bottom: 0; }
    .fanout-2 .fanout-line { width: 30%; }
    .an-edge-label {
      font-size: 11px; font-weight: 700; color: #6366f1;
      text-align: center; margin: 2px 0;
    }

    /* ── Input nodes ─────────────────────────────────────────────────────── */
    .input-node {
      display: flex; flex-direction: column; align-items: center;
      gap: 6px; cursor: pointer;
      transition: transform 0.15s;
    }
    .input-node:hover { transform: translateY(-2px); }
    .in-icon {
      width: 64px; height: 64px; border-radius: 50%;
      background: #ede9fe; border: 2px solid #c4b5fd;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; transition: all 0.2s;
    }
    .gn-active .in-icon { border-color: var(--nc); box-shadow: 0 0 0 6px color-mix(in srgb, var(--nc) 20%, transparent); }
    .gn-done .in-icon { background: color-mix(in srgb, var(--nc) 15%, #fff); border-color: var(--nc); }
    .in-label { font-size: 13px; font-weight: 700; color: #1e293b; }
    .in-sub   { font-size: 11px; color: #64748b; }

    /* ── Agent nodes ─────────────────────────────────────────────────────── */
    .agent-node {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      padding: 14px 20px; min-width: 130px;
      background: #fff; border: 2px solid #e2e8f0; border-radius: 16px;
      cursor: pointer; transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .agent-node:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.1); }
    .agent-node-sm { min-width: 110px; padding: 12px 14px; }
    .gn-active.agent-node {
      border-color: var(--nc);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--nc) 20%, transparent), 0 6px 16px rgba(0,0,0,0.1);
    }
    .gn-done.agent-node { border-color: var(--nc); background: color-mix(in srgb, var(--nc) 5%, #fff); }
    .node-tag {
      position: absolute; top: -10px; left: 10px;
      font-size: 9px; font-weight: 800; color: #94a3b8;
      background: #f1f5f9; padding: 1px 6px; border-radius: 4px;
      border: 1px solid #e2e8f0; letter-spacing: 0.5px;
    }
    .an-icon {
      width: 52px; height: 52px; border-radius: 50%;
      background: color-mix(in srgb, var(--nc) 12%, #f8fafc);
      border: 2px solid color-mix(in srgb, var(--nc) 40%, #e2e8f0);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
    }
    .an-icon-sm { width: 42px; height: 42px; font-size: 18px; }
    .an-label { font-size: 13px; font-weight: 700; color: #1e293b; text-align: center; }
    .an-sub   { font-size: 10px; color: #64748b; text-align: center; line-height: 1.4; }
    .an-api   { font-size: 10px; font-weight: 700; color: var(--nc); font-family: monospace; }
    .an-pulse-ring {
      position: absolute; inset: -6px;
      border: 2px solid var(--nc); border-radius: 20px;
      animation: ringPulse 1s infinite;
    }
    @keyframes ringPulse { 0%,100% { opacity: .4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.03); } }

    /* ── Output node ─────────────────────────────────────────────────────── */
    .output-node {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      padding: 16px 28px;
      background: #f0fdf4; border: 2px solid #86efac; border-radius: 16px;
      cursor: pointer; transition: all 0.3s;
    }
    .gn-done.output-node { border-color: #22c55e; box-shadow: 0 0 0 6px rgba(34,197,94,.15), 0 8px 24px rgba(34,197,94,.2); }
    .output-glow {
      position: absolute; inset: -8px;
      border: 2px solid #22c55e; border-radius: 20px;
      animation: ringPulse 1.2s infinite;
    }

    /* ── Detail panel ────────────────────────────────────────────────────── */
    .detail-panel {
      position: fixed; right: 24px; top: 120px;
      width: 320px; background: #fff;
      border: 1px solid #e2e8f0; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 200; overflow: hidden;
    }
    .dp-header {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; color: #fff;
    }
    .dp-icon { font-size: 22px; }
    .dp-title { font-size: 15px; font-weight: 700; }
    .dp-tag   { font-size: 10px; opacity: 0.8; font-weight: 600; letter-spacing: 0.5px; }
    .dp-close {
      margin-left: auto; background: rgba(255,255,255,.2); border: none;
      color: #fff; width: 26px; height: 26px; border-radius: 50%;
      cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center;
    }
    .dp-body  { padding: 14px 16px; }
    .dp-sub   { font-size: 12px; color: #475569; margin-bottom: 8px; }
    .dp-api   { display: inline-block; font-size: 11px; font-weight: 700; font-family: monospace; background: #f1f5f9; color: #0ea5e9; padding: 3px 8px; border-radius: 6px; margin-bottom: 10px; }
    .dp-desc  { font-size: 12px; color: #334155; line-height: 1.6; margin-bottom: 12px; }
    .dp-resp-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .dp-resp  {
      background: #0f172a; color: #86efac; font-size: 10px;
      padding: 10px; border-radius: 8px; overflow: auto;
      max-height: 220px; white-space: pre-wrap;
      font-family: 'SF Mono', 'Fira Code', monospace; line-height: 1.5;
    }
  `],
})
export class AgentGraphComponent implements OnDestroy {
  readonly nodes = GRAPH_NODES;

  running    = signal(false);
  activeIds  = signal<Set<string>>(new Set());
  doneIds    = signal<Set<string>>(new Set());
  stepIdx    = signal(0);
  selectedNode = signal<GNode | null>(null);
  apiResponses = signal<Record<string, any>>({});

  private timers: any[] = [];

  statusLabel = computed(() => {
    if (!this.running() && this.doneIds().size === 0) return 'Ready';
    if (this.running()) return `Step ${this.stepIdx() + 1} / ${EXEC_SEQUENCE.length}`;
    return `✓ Complete`;
  });

  row(r: number): GNode[] {
    return this.nodes.filter(n => n.row === r);
  }

  isActive(id: string): boolean { return this.activeIds().has(id); }
  isDone(id: string): boolean   { return this.doneIds().has(id); }

  selectNode(n: GNode) { this.selectedNode.set(n); }

  runFlow() {
    if (this.running()) return;
    this.reset();
    this.running.set(true);
    this.executeSequence(0);
  }

  private executeSequence(idx: number) {
    if (idx >= EXEC_SEQUENCE.length) {
      this.running.set(false);
      this.stepIdx.set(EXEC_SEQUENCE.length);
      return;
    }

    this.stepIdx.set(idx);
    const group = EXEC_SEQUENCE[idx];

    // Activate this group
    this.activeIds.update(s => { const n = new Set(s); group.forEach(id => n.add(id)); return n; });

    // Trigger any API call for this step
    const apiCall = API_CALLS.find(a => a.step === idx);
    if (apiCall) this.fetchApi(apiCall, group);

    const t = setTimeout(() => {
      // Move group to done, clear active
      this.activeIds.update(s => { const n = new Set(s); group.forEach(id => n.delete(id)); return n; });
      this.doneIds.update(s => { const n = new Set(s); group.forEach(id => n.add(id)); return n; });
      this.executeSequence(idx + 1);
    }, 1400);
    this.timers.push(t);
  }

  private fetchApi(call: { method: string; path: string; body: any }, group: string[]) {
    const base = 'http://localhost:8080';
    const obs = call.method === 'GET'
      ? this.http.get(`${base}${call.path}`)
      : this.http.post(`${base}${call.path}`, call.body);

    obs.subscribe({
      next: (data: any) => {
        this.apiResponses.update(r => {
          const next = { ...r };
          group.forEach(id => { next[id] = data; });
          return next;
        });
      },
      error: () => {},
    });
  }

  reset() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.running.set(false);
    this.activeIds.set(new Set());
    this.doneIds.set(new Set());
    this.stepIdx.set(0);
    this.apiResponses.set({});
  }

  nodeDescription(id: string): string {
    const map: Record<string, string> = {
      'cv':       'Employee CV uploaded as PDF. Parsed locally using pdfminer — raw text never sent to external APIs.',
      'role-req': 'Target role requirement from company HR. Used for gap analysis against candidate skills.',
      'config':   'Plan configuration: number of days, active prompt version (v1 Warm / v2 Laser-Sharp), temperature.',
      'cv-agent': 'LangChain agent that calls DeepSeek to extract name, skills, experience, projects from the CV text (trimmed to 1200 chars). Returns structured JSON.',
      'java':     'Scores the candidate against Java-role requirements: Spring Boot, microservices, JVM tuning, Docker.',
      'react':    'Scores the candidate against React-role requirements: Hooks, Redux, TypeScript, performance.',
      'devops':   'Scores the candidate against DevOps requirements: Docker, Kubernetes, CI/CD pipelines, Terraform.',
      'data':     'Scores the candidate against Data Science requirements: Python, ML, Pandas, model deployment.',
      'fullstack':'Scores the candidate against Full Stack requirements: Angular, Node, REST, databases.',
      'role-map': 'FAISS similarity_search(target_role, k=3) retrieves role requirements. DeepSeek compares candidate skills — returns match%, missing_skills, recommendation.',
      'rag':      'Hybrid RAG: BM25 + FAISS retrieval with RRF fusion. HyDE generates a hypothetical document to improve embedding quality. CRAG scores chunk quality.',
      'judge':    'Second LLM call scores the plan on Relevance · Completeness · Accuracy · Actionability (1–5). Average ≥ 3.5 passes quality gate.',
      'plan-out': 'Two-phase async planner: 1 LLM call for N day themes, then N parallel asyncio.gather() calls for tasks. Injects internal:// resource URIs.',
      'cache':    'L1 cache: SHA-256 exact hash (1h TTL). L2 cache: cosine similarity ≥ 0.92 (30min TTL). Avoids redundant DeepSeek calls.',
      'tracker':  'Pure Python readiness calculator — no LLM. Maps completed task IDs to skills, computes coverage percentage and skill readiness map.',
      'output':   'Final N-day learning plan with day themes, tasks, internal resource links, and readiness percentage. Returned to Angular dashboard.',
    };
    return map[id] ?? '';
  }

  constructor(private http: HttpClient) {}

  ngOnDestroy() { this.reset(); }
}
