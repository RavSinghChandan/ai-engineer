import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionEngineService } from '../../services/execution-engine.service';
import { FlowNode } from '../../models/visualizer.models';

@Component({
  selector: 'gv-flow-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flow-wrapper">

      <!-- Header -->
      <div class="flow-header">
        <div class="flow-title">
          <span class="flow-dot" [style.background]="accentColor()"></span>
          EXECUTION FLOW
        </div>
        <div class="flow-right">
          <span class="step-count">{{ eng.nodes().length }} nodes</span>
          <div class="prog-pill">
            <div class="prog-fill"
                 [style.width.%]="eng.progress()"
                 [style.background]="'linear-gradient(90deg,' + accentColor() + ',' + accentColor() + 'bb)'">
            </div>
            <span class="prog-label" [style.color]="eng.progress() > 30 ? '#fff' : accentColor()">
              {{ eng.progress() }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Node strip -->
      <div class="nodes-track">
        @for (node of eng.nodes(); track node.id; let i = $index) {

          <div class="node"
               [class.is-pending]="node.status === 'pending'"
               [class.is-active]="node.status === 'active'"
               [class.is-done]="node.status === 'completed'"
               [style.--accent]="accentColor()"
               (click)="onNodeClick(i)"
               [title]="node.label">

            <div class="node-icon">
              @if (node.status === 'completed') {
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.5L4.8 9L10 3" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              } @else if (node.status === 'active') {
                <span class="node-spin"></span>
                <span class="pulse-ring"></span>
              } @else {
                <span class="node-letter">{{ node.icon }}</span>
              }
            </div>

            <div class="node-text">
              <span class="node-label">{{ node.label }}</span>
              <span class="node-step">Step {{ i + 1 }}</span>
            </div>
          </div>

          @if (i < eng.nodes().length - 1) {
            <div class="arrow" [class.arrow-done]="node.status === 'completed'" [class.arrow-active]="node.status === 'active'">
              <svg width="18" height="8" viewBox="0 0 18 8" fill="none">
                <path d="M0 4H13" [attr.stroke]="arrowColor(node)" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M10 1.5L13.5 4L10 6.5" [attr.stroke]="arrowColor(node)"
                      stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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
      padding: 8px 18px 10px;
      background: #ffffff;
      border-bottom: 1px solid #ebebef;
      display: flex; flex-direction: column; gap: 6px;
      box-sizing: border-box;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }

    .flow-header {
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    .flow-title {
      display: flex; align-items: center; gap: 6px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
      color: #9ca3af; text-transform: uppercase;
    }
    .flow-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 0 0 2.5px rgba(99,102,241,0.12);
    }
    .flow-right { display: flex; align-items: center; gap: 10px; }
    .step-count { font-size: 10px; font-weight: 500; color: #c4c9d6; }

    .prog-pill {
      position: relative; width: 76px; height: 16px;
      background: #f3f4f6; border-radius: 99px; overflow: hidden;
      display: flex; align-items: center;
    }
    .prog-fill {
      position: absolute; left: 0; top: 0; bottom: 0;
      border-radius: 99px; transition: width 0.5s ease;
    }
    .prog-label {
      position: relative; z-index: 1; font-size: 9px; font-weight: 700;
      width: 100%; text-align: center; font-variant-numeric: tabular-nums;
      transition: color 0.3s;
    }

    .nodes-track {
      display: flex; align-items: center; flex-wrap: nowrap;
      overflow-x: auto; overflow-y: hidden;
      flex: 1; min-height: 0; gap: 0; padding: 2px 0;
      scrollbar-width: none;
    }
    .nodes-track::-webkit-scrollbar { display: none; }

    .node {
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
      padding: 5px 10px 5px 6px;
      border-radius: 9px; border: 1.5px solid #e8eaf0;
      background: #f8f9fb; cursor: pointer;
      transition: border-color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.15s;
    }
    .node:hover {
      border-color: var(--accent, #6366f1); background: #f0f1ff;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(99,102,241,0.1);
    }

    .node-icon {
      position: relative; width: 28px; height: 28px; border-radius: 7px;
      background: #fff; border: 1px solid #e8eaf0;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.2s, border-color 0.2s, color 0.2s;
      color: #9ca3af;
    }
    .node-letter { font-size: 11px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
    .node-spin {
      display: inline-block; width: 10px; height: 10px;
      border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .pulse-ring {
      position: absolute; inset: -3px; border-radius: 10px;
      border: 1.5px solid var(--accent, #6366f1);
      animation: pulse-anim 1.8s ease-in-out infinite; pointer-events: none;
    }
    @keyframes pulse-anim {
      0%, 100% { opacity: 0.9; transform: scale(1); }
      50%       { opacity: 0;   transform: scale(1.18); }
    }

    .node-text { display: flex; flex-direction: column; gap: 1px; }
    .node-label {
      font-size: 11px; font-weight: 600; color: #374151;
      white-space: nowrap; letter-spacing: -0.01em; line-height: 1.2;
    }
    .node-step { font-size: 9px; font-weight: 500; color: #c4c9d6; line-height: 1; font-variant-numeric: tabular-nums; }

    .is-pending .node-icon  { background: #f8f9fb; border-color: #e8eaf0; color: #d1d5db; }
    .is-pending .node-label { color: #b0b7c3; }

    .is-active {
      border-color: var(--accent, #6366f1);
      background: #eef2ff;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #6366f1) 10%, transparent),
                  0 2px 10px color-mix(in srgb, var(--accent, #6366f1) 15%, transparent);
    }
    .is-active .node-icon {
      background: var(--accent, #6366f1); border-color: var(--accent, #6366f1); color: white;
    }
    .is-active .node-label { color: #4338ca; font-weight: 700; }
    .is-active .node-step  { color: #818cf8; }

    .is-done { border-color: rgba(34,197,94,0.3); background: #f0fdf4; }
    .is-done .node-icon { background: #22c55e; border-color: #22c55e; color: white; }
    .is-done .node-label { color: #15803d; font-weight: 700; }
    .is-done .node-step  { color: #86efac; }

    .arrow {
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; width: 22px; opacity: 0.25;
      transition: opacity 0.25s; flex: 0 0 22px;
    }
    .arrow-done   { opacity: 0.65; }
    .arrow-active { opacity: 1; }
  `]
})
export class FlowStripComponent {
  readonly eng = inject(ExecutionEngineService);

  accentColor(): string { return this.eng.getAdapter()?.accentColor ?? '#6366f1'; }

  arrowColor(node: FlowNode): string {
    if (node.status === 'completed') return '#22c55e';
    if (node.status === 'active')    return this.accentColor();
    return '#d1d5db';
  }

  onNodeClick(i: number): void { this.eng.jumpToStep(i); }
}
