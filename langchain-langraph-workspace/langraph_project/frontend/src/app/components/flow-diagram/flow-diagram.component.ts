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

      <!-- Header -->
      <div class="flow-header">
        <div class="flow-title">
          <span class="flow-dot"></span>
          EXECUTION FLOW
        </div>
        <div class="flow-right">
          <span class="step-count">{{ nodes().length }} steps</span>
          <div class="prog-pill">
            <div class="prog-fill" [style.width.%]="progress()"></div>
            <span class="prog-label">{{ progress() }}%</span>
          </div>
        </div>
      </div>

      <!-- Node strip -->
      <div class="nodes-track">
        @for (node of nodes(); track node.id; let i = $index) {

          <!-- Node -->
          <div class="node"
               [class.is-pending]="node.status === 'pending'"
               [class.is-active]="node.status === 'active'"
               [class.is-done]="node.status === 'completed'"
               (click)="onNodeClick(i)"
               [title]="node.label">

            <!-- icon -->
            <div class="node-icon">
              @if (node.status === 'completed') {
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.5L4.8 9L10 3" stroke="currentColor" stroke-width="1.8"
                        stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              } @else {
                <span class="node-letter">{{ node.icon }}</span>
              }
              @if (node.status === 'active') {
                <span class="pulse"></span>
              }
            </div>

            <!-- text -->
            <div class="node-text">
              <span class="node-label">{{ node.label }}</span>
              <span class="node-step">{{ i + 1 }}</span>
            </div>

          </div>

          <!-- Connector -->
          @if (i < nodes().length - 1) {
            <div class="arrow" [class.arrow-done]="node.status === 'completed'"
                               [class.arrow-active]="node.status === 'active'">
              <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                <path d="M0 4H12" [attr.stroke]="arrowColor(i)" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M9 1.5L12.5 4L9 6.5" [attr.stroke]="arrowColor(i)"
                      stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          }
        }
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .flow-wrapper {
      height: 100%;
      padding: 10px 20px 10px;
      background: #fff;
      border-bottom: 1px solid #ebebef;
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
      gap: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.13em;
      color: #8b8fa8;
      text-transform: uppercase;
    }
    .flow-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
      flex-shrink: 0;
    }
    .flow-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .step-count {
      font-size: 10px;
      font-weight: 500;
      color: #b0b4c4;
    }

    /* Progress pill */
    .prog-pill {
      position: relative;
      width: 80px;
      height: 16px;
      background: #f3f4f6;
      border-radius: 99px;
      overflow: hidden;
      display: flex;
      align-items: center;
    }
    .prog-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: linear-gradient(90deg, #6366f1, #818cf8);
      border-radius: 99px;
      transition: width 0.5s ease;
    }
    .prog-label {
      position: relative;
      z-index: 1;
      font-size: 9px;
      font-weight: 700;
      color: #6366f1;
      width: 100%;
      text-align: center;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }

    /* ── Node track ── */
    .nodes-track {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      flex: 1;
      min-height: 0;
      gap: 0;
      padding: 0 2px;
      scrollbar-width: none;
    }
    .nodes-track::-webkit-scrollbar { display: none; }

    /* ── Node ── */
    .node {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      padding: 5px 10px 5px 6px;
      border-radius: 8px;
      border: 1px solid #e8eaf0;
      background: #f8f9fb;
      cursor: pointer;
      transition: border-color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.15s;
    }
    .node:hover {
      border-color: #a5b4fc;
      background: #f0f1ff;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(99,102,241,0.1);
    }

    /* icon box */
    .node-icon {
      position: relative;
      width: 28px; height: 28px;
      border-radius: 7px;
      background: #fff;
      border: 1px solid #e8eaf0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
      color: #9ca3af;
    }
    .node-letter {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    /* text stack */
    .node-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .node-label {
      font-size: 11px;
      font-weight: 600;
      color: #374151;
      white-space: nowrap;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .node-step {
      font-size: 9px;
      font-weight: 500;
      color: #c4c9d6;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    /* ── Active pulse ── */
    .pulse {
      position: absolute;
      inset: -3px;
      border-radius: 10px;
      border: 1.5px solid #6366f1;
      animation: pulse-anim 1.8s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes pulse-anim {
      0%, 100% { opacity: 0.9; transform: scale(1); }
      50%       { opacity: 0;   transform: scale(1.18); }
    }

    /* ── PENDING ── */
    .is-pending .node-icon   { background: #f8f9fb; border-color: #e8eaf0; color: #c4c9d6; }
    .is-pending .node-label  { color: #9ca3af; }

    /* ── ACTIVE ── */
    .is-active {
      border-color: #6366f1;
      background: #eef2ff;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.1), 0 2px 10px rgba(99,102,241,0.15);
    }
    .is-active .node-icon {
      background: #6366f1;
      border-color: #6366f1;
      color: white;
      box-shadow: 0 2px 8px rgba(99,102,241,0.4);
    }
    .is-active .node-label { color: #4338ca; font-weight: 700; }
    .is-active .node-step  { color: #818cf8; }

    /* ── DONE ── */
    .is-done {
      border-color: rgba(34,197,94,0.25);
      background: #f0fdf4;
    }
    .is-done .node-icon {
      background: #22c55e;
      border-color: #22c55e;
      color: white;
    }
    .is-done .node-label { color: #15803d; font-weight: 700; }
    .is-done .node-step  { color: #86efac; }

    /* ── Connector ── */
    .arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 20px;
      opacity: 0.3;
      transition: opacity 0.25s;
      flex: 0 0 20px;
    }
    .arrow-done   { opacity: 0.7; }
    .arrow-active { opacity: 1; }
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
