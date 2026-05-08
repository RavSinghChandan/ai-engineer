import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionEngineService } from '../../services/execution-engine.service';

@Component({
  selector: 'gv-json-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="json-panel">

      <!-- Accordion header -->
      <div class="acc-header" (click)="toggle()">
        <div class="acc-left">
          <span class="acc-dot" [class.dot-green]="eng.isComplete()" [class.dot-amber]="eng.isRunning()"></span>
          <span class="acc-label">
            @if (eng.isComplete() && eng.apiResponse()) { Response Ready }
            @else if (eng.isRunning()) { Waiting for API response… }
            @else { API Payload }
          </span>
          @if (eng.currentEndpointId()) {
            <span class="ep-tag">{{ methodLabel() }} {{ pathLabel() }}</span>
          }
        </div>
        <div class="acc-right">
          @if (eng.isComplete() && eng.apiResponse()) {
            <span class="ok-chip">200 OK</span>
          }
          <svg class="chevron" [class.chevron-open]="open()" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      @if (open()) {
        <div class="panels-row">

          <!-- Request -->
          <div class="json-block">
            <div class="jb-header">
              <span class="jb-arrow jb-arrow-out">→</span>
              <span class="jb-label">Request</span>
              @if (eng.requestPayload()) {
                <span class="method-tag">{{ eng.requestPayload()!['method'] }} {{ eng.requestPayload()!['endpoint'] }}</span>
              }
            </div>
            <pre class="json-pre">{{ eng.requestPayload() | json }}</pre>
          </div>

          <!-- Response -->
          @if (eng.isComplete() && eng.apiResponse()) {
            <div class="json-block json-block-resp">
              <div class="jb-header">
                <span class="jb-arrow jb-arrow-in">←</span>
                <span class="jb-label">Response</span>
                <span class="status-tag">200 OK</span>
              </div>
              <pre class="json-pre">{{ eng.apiResponse() | json }}</pre>
            </div>
          }

        </div>
      }
    </div>
  `,
  styles: [`
    .json-panel {
      background: #ffffff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }

    /* Accordion header */
    .acc-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 14px; cursor: pointer;
      border-top: 1px solid #f0f0f5;
      transition: background 0.15s; gap: 8px; overflow: hidden;
    }
    .acc-header:hover { background: #fafafa; }
    .acc-left  { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; overflow: hidden; }
    .acc-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

    .acc-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #e5e7eb;
      flex-shrink: 0; transition: background 0.3s;
    }
    .dot-green { background: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.2); }
    .dot-amber { background: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.18); animation: blink 1.4s ease-in-out infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

    .acc-label { font-size: 11px; font-weight: 600; color: #374151; white-space: nowrap; flex-shrink: 0; }
    .ep-tag {
      font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
      background: #f3f4f6; color: #6b7280;
      padding: 2px 8px; border-radius: 99px;
      font-family: 'JetBrains Mono', monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1;
    }
    .ok-chip { font-size: 9px; font-weight: 700; background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
    .chevron { color: #9ca3af; flex-shrink: 0; transition: transform 0.2s; }
    .chevron-open { transform: rotate(180deg); }

    /* Panels row */
    .panels-row {
      display: flex; border-top: 1px solid #f0f0f5;
      max-height: 220px; overflow: hidden;
    }
    .json-block {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
      border-right: 1px solid #f0f0f5;
    }
    .json-block:last-child { border-right: none; }
    .json-block-resp { background: #fdfffd; }

    /* Block header */
    .jb-header {
      display: flex; align-items: center; gap: 7px;
      padding: 6px 14px;
      background: #f9fafb; border-bottom: 1px solid #f0f0f5;
      flex-shrink: 0;
    }
    .jb-arrow { font-size: 11px; font-weight: 700; }
    .jb-arrow-out { color: #6366f1; }
    .jb-arrow-in  { color: #22c55e; }
    .jb-label {
      font-size: 10px; font-weight: 700; color: #6b7280;
      text-transform: uppercase; letter-spacing: 0.08em;
    }
    .method-tag { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 4px; background: #ede9fe; color: #7c3aed; font-family: 'JetBrains Mono', monospace; }
    .status-tag { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 4px; background: #dcfce7; color: #15803d; font-family: 'JetBrains Mono', monospace; }

    /* JSON pre */
    .json-pre {
      flex: 1; margin: 0; padding: 10px 14px;
      font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
      color: #374151; line-height: 1.7; overflow: auto;
      scrollbar-width: thin; background: transparent;
    }
  `]
})
export class JsonPanelComponent {
  readonly eng = inject(ExecutionEngineService);
  readonly open = signal(true);

  toggle(): void { this.open.update(v => !v); }

  methodLabel(): string {
    return this.eng.getEndpoint(this.eng.currentEndpointId())?.method ?? '';
  }
  pathLabel(): string {
    return this.eng.getEndpoint(this.eng.currentEndpointId())?.path ?? '';
  }
}
