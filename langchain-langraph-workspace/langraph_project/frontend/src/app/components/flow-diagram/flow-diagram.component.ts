import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from '../../services/execution-state.service';
import { FlowNode } from '../../models/execution-step.model';

@Component({
  selector: 'app-flow-diagram',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flow-diagram-wrapper">
      <div class="section-label">
        <span class="dot"></span>
        EXECUTION FLOW
      </div>

      <div class="nodes-container">
        @for (node of nodes(); track node.id; let i = $index) {
          <!-- Node -->
          <div
            class="node-wrap"
            (click)="onNodeClick(i)"
            [title]="node.label">
            <div class="node-box" [ngClass]="nodeClass(node)">
              <span class="node-icon">{{ node.icon }}</span>
              <span class="node-label">{{ node.label }}</span>
              @if (node.status === 'active') {
                <span class="pulse-ring"></span>
              }
            </div>
          </div>

          <!-- Connector between nodes -->
          @if (i < nodes().length - 1) {
            <div class="arrow" [ngClass]="arrowClass(i)">
              <svg viewBox="0 0 24 12" fill="none" preserveAspectRatio="none">
                <path d="M0 6 H18" [attr.stroke]="arrowColor(i)" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M14 2.5 L19 6 L14 9.5" [attr.stroke]="arrowColor(i)"
                      stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
              </svg>
            </div>
          }
        }
      </div>

      <!-- Progress bar -->
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" [style.width.%]="progress()"></div>
      </div>
      <div class="progress-label">{{ progress() }}% complete</div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .flow-diagram-wrapper {
      height: 100%;
      padding: 14px 22px 12px;
      background: rgba(255,255,255,0.65);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
      overflow: hidden;
      font-family: 'SF Pro Text', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }
    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: #86868b;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #0071e3;
      box-shadow: 0 0 6px rgba(0,113,227,0.4);
    }

    .nodes-container {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      overflow: hidden;          /* every node fits — no clipping */
      gap: 0;
      padding: 4px 2px 6px;
      flex: 1;
      min-height: 0;
      width: 100%;
    }

    .node-wrap {
      display: flex;
      align-items: center;
      cursor: pointer;
      flex: 1 1 0;               /* every node takes equal share */
      min-width: 0;
    }
    .node-wrap > .node-box { flex: 1 1 auto; }
    .node-box {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 7px 8px 8px;
      border-radius: 11px;
      border: 1px solid rgba(0,0,0,0.05);
      background: white;
      box-shadow: 0 1px 1px rgba(0,0,0,0.03), 0 3px 10px rgba(0,0,0,0.04);
      transition: transform 0.18s cubic-bezier(0.34,1.2,0.64,1),
                  box-shadow 0.25s,
                  border-color 0.3s,
                  background 0.3s;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .node-box:hover {
      border-color: rgba(0,0,0,0.12);
      transform: translateY(-2px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 10px 22px rgba(0,0,0,0.07);
    }
    .node-icon {
      font-size: 11px;
      font-weight: 700;
      color: #86868b;
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px;
      background: #f5f5f7;
      transition: background 0.3s, color 0.3s, transform 0.2s;
      letter-spacing: -0.01em;
      flex-shrink: 0;
    }
    .node-label {
      font-size: 9.5px;
      font-weight: 600;
      color: #86868b;
      text-align: center;
      white-space: nowrap;
      letter-spacing: -0.005em;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Active */
    .node-active .node-box {
      border-color: rgba(0,113,227,0.5);
      background: white;
      box-shadow: 0 0 0 3px rgba(0,113,227,0.18), 0 6px 18px rgba(0,113,227,0.18);
      animation: node-breathe 2.2s ease-in-out infinite;
    }
    @keyframes node-breathe {
      0%, 100% { box-shadow: 0 0 0 3px rgba(0,113,227,0.18), 0 6px 18px rgba(0,113,227,0.18); }
      50%       { box-shadow: 0 0 0 5px rgba(0,113,227,0.10), 0 8px 22px rgba(0,113,227,0.28); }
    }
    .node-active .node-icon { background: #0071e3; color: white; }
    .node-active .node-label { color: #0071e3; }

    /* Completed */
    .node-completed .node-box {
      border-color: rgba(48,209,88,0.4);
      background: rgba(48,209,88,0.04);
    }
    .node-completed .node-icon { background: #34c759; color: white; }
    .node-completed .node-label { color: #248a3d; }

    /* Pulse ring */
    .pulse-ring {
      position: absolute;
      top: -2px; right: -2px; bottom: -2px; left: -2px;
      border-radius: 13px;
      border: 1.5px solid rgba(0,113,227,0.65);
      animation: pulse-border 1.6s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes pulse-border {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.25; transform: scale(1.07); }
    }

    /* Arrow / connector */
    .arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 22px;
      height: 100%;
      opacity: 0.55;
      transition: opacity 0.3s;
    }
    .arrow svg { width: 22px; height: 12px; }
    .arrow-done { opacity: 1; }
    .arrow-pending { opacity: 0.35; }

    /* Progress */
    .progress-bar-bg {
      flex-shrink: 0;
      height: 3px;
      background: rgba(0,0,0,0.06);
      border-radius: 99px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #0071e3, #34c759);
      border-radius: 99px;
      transition: width 0.5s ease;
      box-shadow: 0 0 8px rgba(0,113,227,0.3);
    }
    .progress-label {
      flex-shrink: 0;
      font-size: 10px;
      color: #86868b;
      text-align: right;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
  `]
})
export class FlowDiagramComponent {
  private state = inject(ExecutionStateService);

  readonly nodes = this.state.nodes;
  readonly progress = this.state.progress;

  nodeClass(node: FlowNode): string {
    return `node-${node.status}`;
  }

  arrowClass(i: number): string {
    const nodes = this.nodes();
    if (nodes[i]?.status === 'completed') return 'arrow-done';
    return 'arrow-pending';
  }

  arrowColor(i: number): string {
    const nodes = this.nodes();
    const s = nodes[i]?.status;
    if (s === 'completed') return '#22c55e';
    if (s === 'active') return '#6366f1';
    return '#d1d5db';
  }

  onNodeClick(i: number): void {
    this.state.jumpToStep(i);
  }
}
