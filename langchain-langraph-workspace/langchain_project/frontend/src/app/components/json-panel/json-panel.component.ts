import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from '../../services/execution-state.service';

@Component({
  selector: 'app-json-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="json-panel">
      <div class="section-label">
        <span class="dot"></span>
        API PAYLOAD
      </div>

      <div class="accordion-list">
        <!-- Request -->
        <div class="accordion-item" [ngClass]="{ open: reqOpen() }">
          <button class="accordion-header" (click)="reqOpen.set(!reqOpen())">
            <span class="acc-icon">→</span>
            <span class="acc-title">Request</span>
            <span class="acc-badge req-badge">{{ reqMethod() }} {{ reqPath() }}</span>
            <span class="chevron">{{ reqOpen() ? '▲' : '▼' }}</span>
          </button>
          @if (reqOpen() && state.requestPayload()) {
            <div class="accordion-body">
              <pre class="json-code">{{ state.requestPayload() | json }}</pre>
            </div>
          } @else if (reqOpen()) {
            <div class="accordion-body">
              <p class="empty-json">Run a flow to see the request payload.</p>
            </div>
          }
        </div>

        <!-- Response -->
        <div class="accordion-item" [ngClass]="{ open: resOpen() }">
          <button class="accordion-header" (click)="resOpen.set(!resOpen())">
            <span class="acc-icon">←</span>
            <span class="acc-title">Response</span>
            @if (state.apiResponse()) {
              <span class="acc-badge res-badge">200 OK</span>
            } @else {
              <span class="acc-badge wait-badge">Waiting…</span>
            }
            <span class="chevron">{{ resOpen() ? '▲' : '▼' }}</span>
          </button>
          @if (resOpen() && state.apiResponse()) {
            <div class="accordion-body">
              <pre class="json-code">{{ state.apiResponse() | json }}</pre>
            </div>
          } @else if (resOpen()) {
            <div class="accordion-body">
              <p class="empty-json">Response will appear here after the flow completes.</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .json-panel {
      padding: 14px 16px;
      background: #ffffff;
      border-top: 1px solid #f0f0f0;
    }

    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #9ca3af;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #6366f1;
    }

    .accordion-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .accordion-item {
      border: 1.5px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .accordion-item.open { border-color: #c7d2fe; }

    .accordion-header {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: #f9fafb;
      border: none;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }
    .accordion-header:hover { background: #eef2ff; }

    .acc-icon {
      font-size: 12px;
      font-weight: 700;
      color: #6366f1;
    }
    .acc-title {
      font-size: 11px;
      font-weight: 600;
      color: #374151;
      flex: 1;
    }
    .acc-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 99px;
    }
    .req-badge { background: #eef2ff; color: #6366f1; }
    .res-badge { background: #f0fdf4; color: #16a34a; }
    .wait-badge { background: #fafafa; color: #9ca3af; }

    .chevron {
      font-size: 9px;
      color: #9ca3af;
      flex-shrink: 0;
    }

    .accordion-body {
      padding: 10px 12px;
      background: #0f1117;
      border-top: 1px solid #1e2535;
      max-height: 200px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #1e2535 transparent;
    }

    .json-code {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: #86efac;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.6;
    }

    .empty-json {
      font-size: 11px;
      color: #4b5563;
      font-style: italic;
      margin: 0;
    }
  `]
})
export class JsonPanelComponent {
  readonly state = inject(ExecutionStateService);

  reqOpen = signal(true);
  resOpen = signal(true);

  reqMethod(): string {
    return this.state.requestPayload()?.['method'] ?? 'POST';
  }

  reqPath(): string {
    return this.state.requestPayload()?.['endpoint'] ?? '/api/v1/chat';
  }
}
