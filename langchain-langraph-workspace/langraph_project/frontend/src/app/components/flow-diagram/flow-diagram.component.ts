import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from '../../services/execution-state.service';
import { FlowNode } from '../../models/execution-step.model';

@Component({
  selector: 'app-flow-diagram',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flow-wrapper">

      <!-- Header row -->
      <div class="flow-header">
        <div class="flow-title">
          <span class="flow-dot"></span>
          EXECUTION FLOW
        </div>
        <div class="flow-meta">
          <span class="step-count">{{ nodes().length }} steps</span>
          <span class="pct-badge">{{ progress() }}%</span>
        </div>
      </div>

      <!-- Node strip -->
      <div class="nodes-track">
        @for (node of nodes(); track node.id; let i = $index) {

          <!-- Node card -->
          <div class="node-cell"
               [class.node-pending]="node.status === 'pending'"
               [class.node-active]="node.status === 'active'"
               [class.node-done]="node.status === 'completed'"
               (click)="onNodeClick(i)"
               [title]="node.label">

            <!-- Step number badge -->
            <div class="step-num">{{ i + 1 }}</div>

            <!-- Icon circle -->
            <div class="icon-ring">
              <span class="icon-letter">{{ node.icon }}</span>
              @if (node.status === 'active') {
                <span class="active-pulse"></span>
              }
              @if (node.status === 'completed') {
                <span class="done-check">✓</span>
              }
            </div>

            <!-- Label -->
            <span class="node-name">{{ node.label }}</span>
          </div>

          <!-- Connector -->
          @if (i < nodes().length - 1) {
            <div class="connector" [class.connector-done]="node.status === 'completed'">
              <svg width="28" height="14" viewBox="0 0 28 14" fill="none">
                <path d="M2 7 H22" [attr.stroke]="arrowColor(i)" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M17 3 L23 7 L17 11" [attr.stroke]="arrowColor(i)"
                      stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
              </svg>
            </div>
          }
        }
      </div>

      <!-- Progress bar -->
      <div class="prog-track">
        <div class="prog-fill" [style.width.%]="progress()"></div>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .flow-wrapper {
      height: 100%;
      padding: 12px 20px 10px;
      background: #ffffff;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
      font-family: 'SF Pro Text', 'Inter', -apple-system, system-ui, sans-serif;
    }

    /* ── Header ── */
    .flow-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .flow-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #6b7280;
      text-transform: uppercase;
    }
    .flow-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 0 6px rgba(99,102,241,0.5);
      flex-shrink: 0;
    }
    .flow-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-count {
      font-size: 10.5px;
      font-weight: 600;
      color: #9ca3af;
    }
    .pct-badge {
      font-size: 10.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #6366f1;
      background: #eef2ff;
      padding: 1px 8px;
      border-radius: 99px;
    }

    /* ── Node track ── */
    .nodes-track {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: visible;
      gap: 0;
      flex: 1;
      min-height: 0;
      padding: 6px 2px 8px;
      scrollbar-width: none;
    }
    .nodes-track::-webkit-scrollbar { display: none; }

    /* ── Node card ── */
    .node-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      flex-shrink: 0;
      padding: 6px 8px;
      border-radius: 12px;
      border: 1.5px solid transparent;
      background: #f9fafb;
      transition: all 0.2s ease;
      min-width: 64px;
      position: relative;
    }
    .node-cell:hover {
      background: #f3f4ff;
      border-color: #c7d2fe;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(99,102,241,0.1);
    }

    /* Step number badge */
    .step-num {
      position: absolute;
      top: -7px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 9px;
      font-weight: 800;
      color: #9ca3af;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 99px;
      padding: 0 5px;
      line-height: 16px;
      white-space: nowrap;
      letter-spacing: 0;
    }

    /* Icon ring */
    .icon-ring {
      position: relative;
      width: 36px; height: 36px;
      border-radius: 10px;
      background: white;
      border: 1.5px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.25s ease;
    }
    .icon-letter {
      font-size: 13px;
      font-weight: 800;
      color: #6b7280;
      letter-spacing: -0.02em;
      line-height: 1;
      transition: color 0.2s;
    }

    /* Check badge */
    .done-check {
      position: absolute;
      top: -5px; right: -5px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #22c55e;
      color: white;
      font-size: 8px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 2px white;
    }

    /* Active pulse */
    .active-pulse {
      position: absolute;
      inset: -4px;
      border-radius: 14px;
      border: 2px solid #6366f1;
      animation: pulse-ring 1.6s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes pulse-ring {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.2; transform: scale(1.08); }
    }

    /* Node label */
    .node-name {
      font-size: 10.5px;
      font-weight: 600;
      color: #6b7280;
      text-align: center;
      white-space: nowrap;
      letter-spacing: -0.005em;
      transition: color 0.2s;
    }

    /* ── Pending (default) ── */
    .node-pending .icon-ring {
      background: #f9fafb;
      border-color: #e5e7eb;
    }
    .node-pending .icon-letter { color: #9ca3af; }
    .node-pending .node-name   { color: #9ca3af; }
    .node-pending .step-num    { color: #d1d5db; border-color: #f3f4f6; }

    /* ── Active ── */
    .node-active {
      background: #eef2ff;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.12), 0 4px 14px rgba(99,102,241,0.18);
    }
    .node-active .icon-ring {
      background: #6366f1;
      border-color: #6366f1;
      box-shadow: 0 4px 12px rgba(99,102,241,0.35);
    }
    .node-active .icon-letter { color: white; font-size: 14px; }
    .node-active .node-name   { color: #4f46e5; font-weight: 700; }
    .node-active .step-num    { color: #6366f1; border-color: #c7d2fe; background: #eef2ff; }

    /* ── Completed ── */
    .node-done {
      background: #f0fdf4;
      border-color: rgba(34,197,94,0.3);
    }
    .node-done .icon-ring {
      background: #22c55e;
      border-color: #22c55e;
    }
    .node-done .icon-letter  { color: white; }
    .node-done .node-name    { color: #15803d; font-weight: 700; }
    .node-done .step-num     { color: #22c55e; border-color: #bbf7d0; background: #f0fdf4; }

    /* ── Connector arrow ── */
    .connector {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 28px;
      margin: 0 2px;
      opacity: 0.4;
      transition: opacity 0.3s;
      margin-top: 14px; /* align with center of node (offset step-num badge) */
    }
    .connector-done { opacity: 0.9; }

    /* ── Progress bar ── */
    .prog-track {
      flex-shrink: 0;
      height: 3px;
      background: #f3f4f6;
      border-radius: 99px;
      overflow: hidden;
    }
    .prog-fill {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #22c55e);
      border-radius: 99px;
      transition: width 0.5s ease;
      box-shadow: 0 0 6px rgba(99,102,241,0.3);
    }
  `]
})
export class FlowDiagramComponent {
  private state = inject(ExecutionStateService);

  readonly nodes = this.state.nodes;
  readonly progress = this.state.progress;

  arrowColor(i: number): string {
    const s = this.nodes()[i]?.status;
    if (s === 'completed') return '#22c55e';
    if (s === 'active')    return '#6366f1';
    return '#d1d5db';
  }

  onNodeClick(i: number): void {
    this.state.jumpToStep(i);
  }
}
