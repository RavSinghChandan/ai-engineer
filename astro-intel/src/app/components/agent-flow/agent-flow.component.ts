import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrchestratorService } from '../../services/orchestrator.service';

const NODES = [
  {
    id: 'q', step: 'Step 1', icon: '📝', label: 'Question Agent',
    detail: 'Normalizes questions · Classifies intent per question',
    tags: ['normalized_questions[]', 'intent', 'confidence'],
    stepIds: ['question'], color: '#8a6a00',
  },
  {
    id: 'astro', step: 'Step 2', icon: '🪐', label: 'Astrology Agent',
    detail: 'Vedic · KP · Western — per question',
    tags: ['Vedic', 'KP', 'Western'],
    stepIds: ['astro-vedic','astro-kp','astro-western'], color: '#1d4ed8',
  },
  {
    id: 'num', step: 'Step 2', icon: '🔢', label: 'Numerology Agent',
    detail: 'Indian · Chaldean · Pythagorean — per question',
    tags: ['Indian', 'Chaldean', 'Pythagorean'],
    stepIds: ['num-indian','num-chaldean','num-pythagorean'], color: '#7c3aed',
  },
  {
    id: 'palm', step: 'Step 2', icon: '✋', label: 'Palmistry Agent',
    detail: 'Indian · Chinese · Western — per question',
    tags: ['Indian', 'Chinese', 'Western'],
    stepIds: ['palm-indian','palm-chinese','palm-western'], color: '#059669',
  },
  {
    id: 'tarot', step: 'Step 2', icon: '🃏', label: 'Tarot Agent',
    detail: 'Rider-Waite · Intuitive — per question',
    tags: ['Rider-Waite', 'Intuitive'],
    stepIds: ['tarot-rw','tarot-int'], color: '#dc2626',
  },
  {
    id: 'vastu', step: 'Step 2', icon: '🏠', label: 'Vastu Agent',
    detail: 'Traditional · Modern — per question',
    tags: ['Traditional', 'Modern'],
    stepIds: ['vastu-trad','vastu-modern'], color: '#b45309',
  },
  {
    id: 'meta', step: 'Step 3', icon: '🧠', label: 'Meta Consensus',
    detail: '3+ domains = HIGH · 2 = MEDIUM · 1 = LOW · is_common flag',
    tags: ['Cross-domain merge', 'Conflict resolve', 'is_common'],
    stepIds: ['meta'], color: '#6d28d9',
  },
  {
    id: 'remedy', step: 'Step 4', icon: '🌿', label: 'Remedy Agent',
    detail: 'Per-question habits · Mantras · Colors · No fear language',
    tags: ['habits[]', 'mantras[]', 'colors[]'],
    stepIds: ['remedy'], color: '#065f46',
  },
  {
    id: 'admin', step: 'Step 5', icon: '📋', label: 'Admin Review',
    detail: 'Question-wise editable insights · Stable IDs like q1_i1',
    tags: ['q1_i1', 'confidence', 'is_common', 'editable'],
    stepIds: ['admin'], color: '#92400e',
  },
];

@Component({
  selector: 'app-agent-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Trigger pill -->
    <button class="pipeline-pill" (click)="open.set(!open())">
      <span class="pill-dot" [class.pill-dot-active]="anyActive()"></span>
      <span class="pill-icon">⚙</span>
      <span class="pill-label">Pipeline</span>
      <span class="pill-sub">{{ anyActive() ? 'Running…' : 'Multi-agent orchestration' }}</span>
      <span class="pill-chevron" [class.chevron-open]="open()">›</span>
    </button>

    <!-- Drawer -->
    @if (open()) {
      <div class="drawer">

        <!-- Header -->
        <div class="drawer-hdr">
          <div class="dh-left">
            <span class="dh-title">Agent Pipeline</span>
            <span class="dh-sub">LangGraph · Sequential with sub-agent fan-out per question</span>
          </div>
          <button class="dh-close" (click)="open.set(false)">✕</button>
        </div>

        <!-- Graph scroll area -->
        <div class="graph-scroll">

          <!-- Input row -->
          <div class="g-row g-row-input">
            <div class="g-input-node">
              <span class="gi-icon">👤</span>
              <div class="gi-body">
                <div class="gi-label">User Profile</div>
                <div class="gi-sub">Name · DOB · Place · Pincode</div>
              </div>
            </div>
            <div class="g-input-node">
              <span class="gi-icon">❓</span>
              <div class="gi-body">
                <div class="gi-label">Question(s)</div>
                <div class="gi-sub">Single or multiple questions</div>
              </div>
            </div>
          </div>

          <!-- Connector -->
          <div class="g-connector">
            <div class="g-line"></div>
            <div class="g-arrow">↓</div>
          </div>

          <!-- Step 1 -->
          <div class="g-row">
            <div class="g-node" [class.gn-running]="nodeStatus('question') === 'running'" [class.gn-done]="nodeStatus('question') === 'done'">
              <div class="gn-step">Step 1</div>
              <div class="gn-top">
                <span class="gn-icon">📝</span>
                <div class="gn-body">
                  <div class="gn-label">Question Normalization Agent</div>
                  <div class="gn-detail">Classifies intent · career / finance / marriage / health / spirituality…</div>
                </div>
                <div class="gn-badge" [class.badge-run]="nodeStatus('question') === 'running'" [class.badge-done]="nodeStatus('question') === 'done'" [class.badge-idle]="nodeStatus('question') === 'idle'">
                  {{ badgeLabel('question') }}
                </div>
              </div>
              <div class="gn-tags">
                <span class="g-tag">normalized_questions[]</span>
                <span class="g-tag">intent + confidence</span>
                <span class="g-tag">detected_keywords</span>
              </div>
            </div>
          </div>

          <!-- Connector with label -->
          <div class="g-connector">
            <div class="g-line"></div>
            <div class="g-arrow-label">normalized_questions[] → all domain agents</div>
            <div class="g-arrow">↓</div>
          </div>

          <!-- Step 2: Parallel domain agents -->
          <div class="g-parallel-section">
            <div class="g-parallel-label">Step 2 · Parallel fan-out</div>
            <div class="g-parallel-grid">
              @for (node of domainNodes; track node.id) {
                <div class="g-node g-node-domain"
                     [class.gn-running]="anyRunning(node.stepIds)"
                     [class.gn-done]="allDone(node.stepIds)"
                     [style.--accent]="node.color">
                  <div class="gnd-hdr">
                    <span class="gnd-icon">{{ node.icon }}</span>
                    <span class="gnd-label">{{ node.label }}</span>
                    <span class="gn-badge gn-badge-sm"
                          [class.badge-run]="anyRunning(node.stepIds)"
                          [class.badge-done]="allDone(node.stepIds)"
                          [class.badge-idle]="!anyRunning(node.stepIds) && !allDone(node.stepIds)">
                      {{ anyRunning(node.stepIds) ? '●' : allDone(node.stepIds) ? '✓' : '○' }}
                    </span>
                  </div>
                  <div class="gnd-detail">{{ node.detail }}</div>
                  <div class="gnd-tags">
                    @for (t of node.tags; track t) {
                      <span class="g-tag g-tag-sm">{{ t }}</span>
                    }
                  </div>
                  <div class="gnd-emit">→ SubAgentResult × Q</div>
                </div>
              }
            </div>
            <div class="g-parallel-note">Each agent loops all normalized_questions · calls sub-agents per question · stores question_wise_analysis[] in shared memory</div>
          </div>

          <!-- Connector -->
          <div class="g-connector">
            <div class="g-line"></div>
            <div class="g-arrow-label">memory · domain → DomainOutput · question_wise_analysis[]</div>
            <div class="g-arrow">↓</div>
          </div>

          <!-- Steps 3–5 -->
          @for (node of sequentialNodes; track node.id) {
            <div class="g-row">
              <div class="g-node" [class.gn-running]="anyRunning(node.stepIds)" [class.gn-done]="allDone(node.stepIds)">
                <div class="gn-step">{{ node.step }}</div>
                <div class="gn-top">
                  <span class="gn-icon">{{ node.icon }}</span>
                  <div class="gn-body">
                    <div class="gn-label">{{ node.label }}</div>
                    <div class="gn-detail">{{ node.detail }}</div>
                  </div>
                  <div class="gn-badge" [class.badge-run]="anyRunning(node.stepIds)" [class.badge-done]="allDone(node.stepIds)" [class.badge-idle]="!anyRunning(node.stepIds) && !allDone(node.stepIds)">
                    {{ anyRunning(node.stepIds) ? 'Running…' : allDone(node.stepIds) ? 'Done' : 'Queued' }}
                  </div>
                </div>
                <div class="gn-tags">
                  @for (t of node.tags; track t) {
                    <span class="g-tag">{{ t }}</span>
                  }
                </div>
              </div>
            </div>
            @if (node.id !== 'admin') {
              <div class="g-connector"><div class="g-line"></div><div class="g-arrow">↓</div></div>
            }
          }

          <!-- Human in the loop -->
          <div class="g-connector">
            <div class="g-line"></div>
            <div class="g-arrow-label">Human-in-the-loop · approve / reject / edit per insight ID</div>
            <div class="g-arrow">↓</div>
          </div>

          <!-- Output -->
          <div class="g-row g-row-output">
            <div class="g-output-node">
              <span class="go-icon">✅</span>
              <div class="go-body">
                <div class="go-label">Final Report</div>
                <div class="go-sub">PDF-ready · Brand placeholders · Question-wise sections</div>
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="g-legend">
            <div class="gl-item"><span class="gl-dot idle"></span>Queued</div>
            <div class="gl-item"><span class="gl-dot run"></span>Running</div>
            <div class="gl-item"><span class="gl-dot done"></span>Done</div>
            <div class="gl-sep"></div>
            <div class="gl-item"><span class="gl-box parallel"></span>Sub-agents per question</div>
            <div class="gl-item"><span class="gl-box merge"></span>Merge + consensus</div>
            <div class="gl-item"><span class="gl-box human"></span>Human approval</div>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; }

    /* ── Pill ───────────────────────────────────────────────────────────── */
    .pipeline-pill {
      display: inline-flex; align-items: center; gap: 7px;
      background: #fff; border: 1px solid #e8e4dc;
      border-radius: 99px; padding: 7px 14px 7px 10px;
      cursor: pointer; font-family: inherit;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      transition: box-shadow 0.18s, border-color 0.18s;
      white-space: nowrap;
    }
    .pipeline-pill:hover { border-color: #d4af37; box-shadow: 0 2px 8px rgba(212,175,55,0.15); }
    .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: #d1d5db; transition: background 0.3s; }
    .pill-dot-active { background: #d4af37; box-shadow: 0 0 6px rgba(212,175,55,0.6); animation: blink 1.4s infinite; }
    @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
    .pill-icon  { font-size: 13px; }
    .pill-label { font-size: 12px; font-weight: 600; color: #1a1a1a; }
    .pill-sub   { font-size: 11px; color: #999; }
    .pill-chevron { font-size: 16px; color: #bbb; transition: transform 0.2s; line-height: 1; margin-left: 2px; }
    .chevron-open { transform: rotate(90deg); }

    /* ── Drawer ─────────────────────────────────────────────────────────── */
    .drawer {
      margin-top: 8px;
      background: #fff;
      border: 1px solid #e8e4dc;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      animation: slideDown 0.22s cubic-bezier(0.34,1.3,0.64,1);
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px) scaleY(0.97); }
      to   { opacity: 1; transform: translateY(0) scaleY(1); }
    }

    /* Drawer header */
    .drawer-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 18px;
      background: linear-gradient(90deg, #1a1410 0%, #2d2010 100%);
      border-bottom: 1px solid rgba(212,175,55,0.3);
    }
    .dh-left  { display: flex; flex-direction: column; gap: 2px; }
    .dh-title { font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 0.02em; }
    .dh-sub   { font-size: 10px; color: rgba(255,255,255,0.4); font-family: monospace; }
    .dh-close { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.6); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; cursor: pointer; transition: background 0.15s; }
    .dh-close:hover { background: rgba(255,255,255,0.18); color: #fff; }

    /* Graph scroll */
    .graph-scroll {
      max-height: 72vh; overflow-y: auto; overflow-x: hidden;
      padding: 18px 20px; display: flex; flex-direction: column; gap: 0;
      background: #fafaf8;
    }
    .graph-scroll::-webkit-scrollbar { width: 4px; }
    .graph-scroll::-webkit-scrollbar-thumb { background: #e0d8cc; border-radius: 2px; }

    /* ── Input row ─────────────────────────────────────────────────────── */
    .g-row-input { display: flex; gap: 10px; margin-bottom: 0; }
    .g-input-node {
      flex: 1; display: flex; align-items: center; gap: 10px;
      background: #fff; border: 1.5px solid #e8e4dc; border-radius: 12px;
      padding: 10px 14px;
    }
    .gi-icon  { font-size: 20px; flex-shrink: 0; }
    .gi-label { font-size: 12px; font-weight: 700; color: #1a1a1a; }
    .gi-sub   { font-size: 10px; color: #999; margin-top: 1px; }

    /* ── Connector ────────────────────────────────────────────────────── */
    .g-connector {
      display: flex; flex-direction: column; align-items: center; gap: 1px;
      padding: 4px 0;
    }
    .g-line { width: 1.5px; height: 12px; background: linear-gradient(#d4af37, #e8e4dc); }
    .g-arrow { color: #d4af37; font-size: 16px; line-height: 1; font-weight: 700; }
    .g-arrow-label {
      font-size: 9px; color: #aaa; font-family: monospace;
      background: #f0ece4; padding: 2px 10px; border-radius: 99px;
      margin: 2px 0;
    }

    /* ── Generic node row ─────────────────────────────────────────────── */
    .g-row { margin: 0; }
    .g-node {
      background: #fff; border: 1.5px solid #e8e4dc; border-radius: 14px;
      padding: 12px 14px; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
    }
    .gn-running { border-color: #d4af37; box-shadow: 0 0 0 3px rgba(212,175,55,0.12); background: #fffdf5; }
    .gn-done    { border-color: #22c55e; background: #f0fdf4; }

    .gn-step { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #bbb; margin-bottom: 8px; }
    .gn-top  { display: flex; align-items: flex-start; gap: 10px; }
    .gn-icon { font-size: 20px; flex-shrink: 0; }
    .gn-body { flex: 1; min-width: 0; }
    .gn-label  { font-size: 13px; font-weight: 700; color: #1a1a1a; }
    .gn-detail { font-size: 10.5px; color: #888; margin-top: 2px; line-height: 1.5; }

    .gn-badge {
      flex-shrink: 0; font-size: 9px; font-weight: 700; padding: 2px 9px;
      border-radius: 99px; letter-spacing: 0.05em; text-transform: uppercase;
      align-self: flex-start;
    }
    .badge-idle { background: #f3f4f6; color: #9ca3af; }
    .badge-run  { background: rgba(212,175,55,0.18); color: #8a6a00; animation: blink 1.4s infinite; }
    .badge-done { background: #dcfce7; color: #15803d; }
    .gn-badge-sm { padding: 1px 6px; font-size: 10px; }

    .gn-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }

    /* ── Tags ──────────────────────────────────────────────────────────── */
    .g-tag {
      font-size: 9.5px; font-family: monospace; background: #f3f4f6; color: #555;
      padding: 2px 7px; border-radius: 5px; font-weight: 600;
    }
    .g-tag-sm { font-size: 8.5px; padding: 1px 6px; }

    /* ── Parallel section ─────────────────────────────────────────────── */
    .g-parallel-section {
      background: #fff; border: 1.5px solid #e8e4dc; border-radius: 16px;
      padding: 12px 14px; position: relative;
    }
    .g-parallel-label {
      font-size: 8.5px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.12em; color: #bbb; margin-bottom: 10px;
    }
    .g-parallel-grid {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
    }
    .g-parallel-note {
      font-size: 9px; color: #aaa; text-align: center; margin-top: 10px;
      font-style: italic; line-height: 1.5;
    }

    /* Domain node */
    .g-node-domain {
      padding: 0; overflow: hidden; border-color: rgba(0,0,0,0.07);
      border-left: 3px solid var(--accent);
    }
    .gnd-hdr {
      display: flex; align-items: center; gap: 5px;
      padding: 8px 10px; border-bottom: 1px solid #f0ece4;
      background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent);
    }
    .gnd-icon  { font-size: 14px; }
    .gnd-label { flex: 1; font-size: 10.5px; font-weight: 700; color: #1a1a1a; }
    .gnd-detail { font-size: 9.5px; color: #888; padding: 6px 10px 4px; line-height: 1.5; }
    .gnd-tags   { display: flex; flex-wrap: wrap; gap: 3px; padding: 0 10px 6px; }
    .gnd-emit   { font-size: 8.5px; color: #aaa; font-family: monospace; padding: 4px 10px; border-top: 1px solid #f0ece4; background: #fafaf8; }

    /* ── Output ────────────────────────────────────────────────────────── */
    .g-row-output { display: flex; }
    .g-output-node {
      flex: 1; display: flex; align-items: center; gap: 10px;
      background: linear-gradient(135deg, #fffbf0, #fff9e6);
      border: 1.5px solid rgba(212,175,55,0.35); border-radius: 14px;
      padding: 12px 16px; box-shadow: 0 1px 8px rgba(212,175,55,0.1);
    }
    .go-icon  { font-size: 22px; }
    .go-label { font-size: 13px; font-weight: 700; color: #1a1a1a; }
    .go-sub   { font-size: 10px; color: #888; margin-top: 2px; }

    /* ── Legend ────────────────────────────────────────────────────────── */
    .g-legend {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 12px 2px 2px; border-top: 1px solid #f0ece4; margin-top: 14px;
    }
    .gl-item  { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #888; }
    .gl-sep   { width: 1px; height: 12px; background: #e8e4dc; }
    .gl-dot   { width: 7px; height: 7px; border-radius: 50%; }
    .gl-dot.idle { background: #d1d5db; }
    .gl-dot.run  { background: #d4af37; }
    .gl-dot.done { background: #22c55e; }
    .gl-box   { width: 12px; height: 10px; border-radius: 3px; border: 1.5px solid; }
    .gl-box.parallel { border-color: #7c3aed; background: rgba(124,58,237,0.08); }
    .gl-box.merge    { border-color: #d4af37; background: rgba(212,175,55,0.08); }
    .gl-box.human    { border-color: #22c55e; background: rgba(34,197,94,0.08); }
  `]
})
export class AgentFlowComponent {
  private orch = inject(OrchestratorService);
  readonly open = signal(false);

  readonly domainNodes    = NODES.filter(n => n.step === 'Step 2');
  readonly sequentialNodes = NODES.filter(n => !['Step 1','Step 2'].includes(n.step));

  private stepMap = computed(() => {
    const m: Record<string, string> = {};
    for (const s of this.orch.steps()) m[s.id] = s.status;
    return m;
  });

  readonly anyActive = computed(() =>
    this.orch.steps().some(s => s.status === 'running')
  );

  nodeStatus(id: string): string { return this.stepMap()[id] ?? 'idle'; }

  badgeLabel(id: string): string {
    const s = this.nodeStatus(id);
    return s === 'running' ? 'Running…' : s === 'done' ? 'Done' : 'Queued';
  }

  anyRunning(ids: string[]): boolean {
    return ids.some(id => this.stepMap()[id] === 'running');
  }

  allDone(ids: string[]): boolean {
    return ids.length > 0 && ids.every(id => this.stepMap()[id] === 'done');
  }
}
