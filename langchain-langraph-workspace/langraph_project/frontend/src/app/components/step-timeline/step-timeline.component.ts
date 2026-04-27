import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from '../../services/execution-state.service';
import { ExecutionStep } from '../../models/execution-step.model';

@Component({
  selector: 'app-step-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-wrapper">
      <div class="section-label">
        <span class="dot"></span>
        EXECUTION STEPS
      </div>

      @if (!state.isRunning() && !state.isComplete()) {
        <div class="empty-state">
          <div class="empty-icon">▶</div>
          <p>Run a query to see execution steps</p>
        </div>
      } @else {
        <div class="steps-list">
          @for (step of state.steps(); track step.id; let i = $index) {
            <div
              class="step-item"
              [ngClass]="stepClass(step, i)"
              (click)="onStepClick(i)">

              <div class="step-number-col">
                <div class="step-circle">
                  @if (step.status === 'completed') {
                    <span class="check">✓</span>
                  } @else if (step.status === 'active') {
                    <span class="spinner"></span>
                  } @else {
                    <span class="num">{{ step.id }}</span>
                  }
                </div>
                @if (i < state.steps().length - 1) {
                  <div class="step-connector" [ngClass]="connectorClass(step)"></div>
                }
              </div>

              <div class="step-content">
                <div class="step-header">
                  <span class="step-name">{{ step.name }}</span>
                  @if (step.badge) {
                    <span class="badge">{{ step.badge }}</span>
                  }
                </div>
                @if (step.status === 'active' || step.status === 'completed') {
                  <p class="step-desc">{{ step.description }}</p>
                  <div class="step-meta">
                    <span class="meta-file">{{ step.file }}</span>
                    <span class="meta-sep">·</span>
                    <span class="meta-fn">{{ step.functionName }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .timeline-wrapper {
      padding: 16px 20px;
      height: 100%;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #e5e7eb transparent;
    }
    .timeline-wrapper::-webkit-scrollbar { width: 4px; }
    .timeline-wrapper::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }

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

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 16px;
      color: #d1d5db;
      text-align: center;
    }
    .empty-icon {
      font-size: 28px;
      margin-bottom: 10px;
      opacity: 0.4;
    }
    .empty-state p {
      font-size: 12px;
      color: #9ca3af;
    }

    .steps-list {
      display: flex;
      flex-direction: column;
    }

    .step-item {
      display: flex;
      gap: 12px;
      cursor: pointer;
      border-radius: 8px;
      padding: 4px 6px;
      transition: background 0.2s;
    }
    .step-item:hover { background: #f9fafb; }

    /* Active step */
    .step-active {
      background: #eef2ff !important;
    }
    .step-active .step-name { color: #4f46e5; }

    /* Completed step */
    .step-completed .step-name { color: #374151; }
    .step-completed .step-circle { background: #22c55e; border-color: #22c55e; }

    /* Pending step */
    .step-pending .step-name { color: #9ca3af; }
    .step-pending .step-circle { background: #f9fafb; }

    .step-number-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      width: 28px;
    }

    .step-circle {
      width: 28px; height: 28px;
      border-radius: 50%;
      border: 2px solid #e5e7eb;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #9ca3af;
      flex-shrink: 0;
      transition: all 0.3s ease;
    }
    .step-active .step-circle {
      border-color: #6366f1;
      background: #6366f1;
      color: white;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
    }

    .check { color: white; font-size: 13px; }
    .num { font-size: 11px; }

    .spinner {
      display: inline-block;
      width: 10px; height: 10px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .step-connector {
      width: 2px;
      flex: 1;
      min-height: 12px;
      background: #e5e7eb;
      margin: 3px 0;
      border-radius: 99px;
      transition: background 0.3s;
    }
    .connector-done { background: #22c55e; }

    .step-content {
      padding: 4px 0 12px;
      flex: 1;
      min-width: 0;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .step-name {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      transition: color 0.2s;
    }

    .badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 99px;
      background: #eef2ff;
      color: #6366f1;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .step-desc {
      font-size: 11px;
      color: #6b7280;
      margin: 4px 0 5px;
      line-height: 1.5;
    }

    .step-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
    }
    .meta-file {
      color: #6366f1;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px;
    }
    .meta-sep { color: #d1d5db; }
    .meta-fn {
      color: #9ca3af;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px;
    }
  `]
})
export class StepTimelineComponent {
  readonly state = inject(ExecutionStateService);

  stepClass(step: ExecutionStep, i: number): string {
    return `step-${step.status}`;
  }

  connectorClass(step: ExecutionStep): string {
    return step.status === 'completed' ? 'connector-done' : '';
  }

  onStepClick(i: number): void {
    this.state.jumpToStep(i);
  }
}
