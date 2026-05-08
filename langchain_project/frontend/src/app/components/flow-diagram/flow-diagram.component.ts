import { Component, computed, inject } from '@angular/core';
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

          <!-- Arrow between nodes -->
          @if (i < nodes().length - 1) {
            <div class="arrow" [ngClass]="arrowClass(i)">
              <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                <line x1="0" y1="8" x2="22" y2="8" [attr.stroke]="arrowColor(i)" stroke-width="1.5"/>
                <polyline points="16,3 22,8 16,13" [attr.stroke]="arrowColor(i)" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
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
    .flow-diagram-wrapper {
      padding: 20px 24px 16px;
      background: #ffffff;
      border-bottom: 1px solid #f0f0f0;
    }
    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #9ca3af;
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    .dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #6366f1;
    }
    .nodes-container {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      overflow-x: auto;
      gap: 0;
      padding-bottom: 4px;
      scrollbar-width: none;
    }
    .nodes-container::-webkit-scrollbar { display: none; }

    .node-wrap {
      display: flex;
      align-items: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .node-box {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1.5px solid #e5e7eb;
      background: #f9fafb;
      transition: all 0.3s ease;
      min-width: 64px;
    }
    .node-box:hover {
      border-color: #6366f1;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(99,102,241,0.12);
    }
    .node-icon {
      font-size: 11px;
      font-weight: 800;
      color: #9ca3af;
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px;
      background: #f3f4f6;
      transition: all 0.3s ease;
    }
    .node-label {
      font-size: 9.5px;
      font-weight: 600;
      color: #6b7280;
      text-align: center;
      white-space: nowrap;
    }

    /* Active */
    .node-active .node-box {
      border-color: #6366f1;
      background: #eef2ff;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.15), 0 4px 16px rgba(99,102,241,0.2);
    }
    .node-active .node-icon { background: #6366f1; color: white; }
    .node-active .node-label { color: #4f46e5; }

    /* Completed */
    .node-completed .node-box {
      border-color: #22c55e;
      background: #f0fdf4;
    }
    .node-completed .node-icon { background: #22c55e; color: white; }
    .node-completed .node-label { color: #16a34a; }

    /* Pulse ring */
    .pulse-ring {
      position: absolute;
      top: -3px; right: -3px; bottom: -3px; left: -3px;
      border-radius: 12px;
      border: 2px solid #6366f1;
      animation: pulse-border 1.5s ease-in-out infinite;
    }
    @keyframes pulse-border {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(1.04); }
    }

    /* Arrow */
    .arrow { display: flex; align-items: center; flex-shrink: 0; margin: 0 1px; }

    /* Progress */
    .progress-bar-bg {
      margin-top: 14px;
      height: 3px;
      background: #f3f4f6;
      border-radius: 99px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #22c55e);
      border-radius: 99px;
      transition: width 0.5s ease;
    }
    .progress-label {
      margin-top: 5px;
      font-size: 10px;
      color: #9ca3af;
      text-align: right;
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
