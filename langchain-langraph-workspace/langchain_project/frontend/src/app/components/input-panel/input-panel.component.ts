import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExecutionStateService } from '../../services/execution-state.service';
import { ENDPOINT_CONFIGS, EndpointConfig } from '../../data/endpoints.data';

@Component({
  selector: 'app-input-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="input-panel">

      <!-- Brand -->
      <div class="brand-row">
        <div class="brand-icon">&#9889;</div>
        <div>
          <div class="brand-name">LangChain Visualizer</div>
          <div class="brand-sub">Select an API, run it, watch the flow</div>
        </div>
        <div class="status-dot" [ngClass]="dotClass()"></div>
      </div>

      <!-- Endpoint selector — custom dropdown -->
      <div class="field-block">
        <label class="field-label">Select API Endpoint</label>

        <!-- Trigger button (closed state) -->
        <div class="ep-trigger"
             [ngClass]="{ 'ep-trigger-open': dropOpen, 'ep-trigger-disabled': state.isRunning() }"
             (click)="!state.isRunning() && toggleDrop()">
          <span class="verb-badge" [ngClass]="'verb-' + selected().method.toLowerCase()">
            {{ selected().method }}
          </span>
          <div class="ep-trigger-body">
            <span class="ep-trigger-name">{{ selected().emoji }} {{ selected().label }}</span>
            <span class="ep-trigger-path">{{ selected().path }}</span>
          </div>
          <span class="ep-caret" [ngClass]="{ 'ep-caret-open': dropOpen }">&#9660;</span>
        </div>

        <!-- Dropdown list -->
        @if (dropOpen) {
          <div class="ep-dropdown">
            @for (ep of endpoints; track ep.id) {
              <div class="ep-option"
                   [ngClass]="{ 'ep-option-active': ep.id === selectedId() }"
                   (click)="pickEndpoint(ep.id)">
                <span class="verb-badge" [ngClass]="'verb-' + ep.method.toLowerCase()">
                  {{ ep.method }}
                </span>
                <div class="ep-option-body">
                  <span class="ep-option-name">{{ ep.emoji }} {{ ep.label }}</span>
                  <span class="ep-option-path">{{ ep.path }}</span>
                </div>
                @if (ep.id === selectedId()) {
                  <span class="ep-active-dot">&#10003;</span>
                }
              </div>
            }
          </div>
        }

        <div class="endpoint-tagline">{{ selected().tagline }}</div>
      </div>

      <!-- Dynamic form fields -->
      @if (selected().fields.length > 0) {
        <div class="fields-area">
          @for (field of selected().fields; track field.name) {

            @if (field.type === 'textarea') {
              <div class="field-block">
                <label class="field-label">{{ field.label }}</label>
                <textarea
                  class="field-textarea"
                  [placeholder]="field.placeholder || ''"
                  [value]="getField(field.name, field.default)"
                  (input)="setField(field.name, $any($event.target).value)"
                  [disabled]="state.isRunning()"
                  rows="4">
                </textarea>
              </div>
            }

            @if (field.type === 'toggle') {
              <div class="toggle-row">
                <span class="field-label">{{ field.label }}</span>
                <button
                  class="toggle-btn"
                  [ngClass]="{ 'toggle-on': getField(field.name, field.default) }"
                  [disabled]="state.isRunning()"
                  (click)="setField(field.name, !getField(field.name, field.default))">
                  {{ getField(field.name, field.default) ? 'ON' : 'OFF' }}
                </button>
              </div>
            }

            @if (field.type === 'select') {
              <div class="field-block">
                <label class="field-label">{{ field.label }}</label>
                <select
                  class="field-select"
                  [value]="getField(field.name, field.default)"
                  (change)="setField(field.name, $any($event.target).value)"
                  [disabled]="state.isRunning()">
                  @for (opt of field.options; track opt) {
                    <option [value]="opt">
                      {{ opt === 'v1' ? 'v1 — Friendly & Clear' : 'v2 — Analytical & Detailed' }}
                    </option>
                  }
                </select>
              </div>
            }

            @if (field.type === 'file') {
              <div class="field-block">
                <label class="field-label">{{ field.label }}</label>
                <div class="file-zone" (click)="triggerFile()">
                  <input type="file" id="file-input" accept=".txt,.pdf" style="display:none"
                    (change)="onFileChange($event)">
                  @if (getField('file', null)) {
                    <span class="file-chosen">&#128196; {{ getField('file', null)?.name }}</span>
                  } @else {
                    <span class="file-hint">Click to choose .txt or .pdf</span>
                  }
                </div>
              </div>
            }

          }
        </div>
      }

      <!-- Action buttons -->
      <div class="actions">
        <button
          class="btn btn-run"
          (click)="runFlow()"
          [disabled]="!canRun()">
          <span>&#9654;</span>
          Run AI Flow
        </button>

        <div class="btn-row">
          <button
            class="btn btn-next"
            (click)="state.nextStep()"
            [disabled]="!state.isRunning() || state.isComplete()">
            Next Step →
          </button>

          <button
            class="btn"
            [ngClass]="state.autoPlaying() ? 'btn-stop' : 'btn-auto'"
            (click)="state.toggleAutoPlay()"
            [disabled]="!state.isRunning() || state.isComplete()">
            {{ state.autoPlaying() ? '⏸ Stop' : '⏩ Auto Play' }}
          </button>
        </div>

        @if (state.isRunning() || state.isComplete()) {
          <button class="btn btn-reset" (click)="reset()">&#8635; Reset</button>
        }
      </div>

      <div class="divider"></div>

      <!-- ── Response — ONLY shown after flow completes ── -->
      @if (state.isComplete() && state.apiResponse()) {
        <div class="resp-card">

          <!-- Card header -->
          <div class="resp-card-head">
            <div class="resp-success-pill">
              <span class="resp-check">&#10003;</span> Response Ready
            </div>
            <span class="resp-ep-pill">{{ selected().method }} {{ selected().path }}</span>
          </div>

          <!-- ── CHAT / STREAM ── -->
          @if (state.currentEndpointId() === 'chat' || state.currentEndpointId() === 'chat_stream') {
            <div class="resp-answer-block">
              <div class="resp-section-icon">&#129302;</div>
              <div class="resp-answer-text">{{ state.apiResponse()!['answer'] }}</div>
            </div>
            @if (state.apiResponse()!['sources']?.length) {
              <div class="resp-section">
                <div class="resp-section-label">&#128204; Sources</div>
                <div class="resp-chips-row">
                  @for (src of state.apiResponse()!['sources']; track src) {
                    <span class="chip chip-source">{{ src }}</span>
                  }
                </div>
              </div>
            }
            @if (state.apiResponse()!['steps']?.length) {
              <div class="resp-section">
                <div class="resp-section-label">&#9194; Execution Flow</div>
                <div class="resp-trace">
                  @for (s of state.apiResponse()!['steps']; track $index) {
                    <div class="trace-row" [ngClass]="traceClass(s)">
                      <div class="trace-icon">{{ traceIcon(s) }}</div>
                      <div class="trace-body">
                        <span class="trace-num">{{ $index + 1 }}</span>
                        <span class="trace-text">{{ s }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          }

          <!-- ── AGENT ── -->
          @else if (state.currentEndpointId() === 'agent') {
            <div class="resp-answer-block">
              <div class="resp-section-icon">&#129302;</div>
              <div class="resp-answer-text">{{ state.apiResponse()!['answer'] }}</div>
            </div>
            @if (state.apiResponse()!['tools_used']?.length) {
              <div class="resp-section">
                <div class="resp-section-label">&#128295; Tools Used</div>
                <div class="resp-chips-row">
                  @for (t of state.apiResponse()!['tools_used']; track t) {
                    <span class="chip chip-tool">{{ t }}</span>
                  }
                </div>
              </div>
            }
            @if (state.apiResponse()!['steps']?.length) {
              <div class="resp-section">
                <div class="resp-section-label">&#9194; Execution Flow</div>
                <div class="resp-trace">
                  @for (s of state.apiResponse()!['steps']; track $index) {
                    <div class="trace-row" [ngClass]="traceClass(s)">
                      <div class="trace-icon">{{ traceIcon(s) }}</div>
                      <div class="trace-body">
                        <span class="trace-num">{{ $index + 1 }}</span>
                        <span class="trace-text">{{ s }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          }

          <!-- ── HEALTH ── -->
          @else if (state.currentEndpointId() === 'health') {
            <div class="resp-status-card resp-status-ok">
              <div class="resp-status-icon">&#9989;</div>
              <div>
                <div class="resp-status-title">Service is Online</div>
                <div class="resp-status-sub">Model: {{ state.apiResponse()!['model'] }}</div>
              </div>
            </div>
          }

          <!-- ── PROMPTS ── -->
          @else if (state.currentEndpointId() === 'prompts') {
            @for (p of state.apiResponse()!['prompts']; track p.version) {
              <div class="resp-prompt-card">
                <div class="resp-prompt-badge">Style {{ p.version }}</div>
                <div class="resp-prompt-body">{{ p.content }}</div>
              </div>
            }
          }

          <!-- ── MEMORY GET ── -->
          @else if (state.currentEndpointId() === 'memory_get') {
            <div class="resp-section">
              <div class="resp-section-label">&#129504; {{ state.apiResponse()!['total'] }} Messages Stored</div>
              <div class="resp-mem-list">
                @for (m of state.apiResponse()!['messages']; track $index) {
                  <div class="resp-bubble" [ngClass]="m.role === 'human' ? 'bubble-human' : 'bubble-ai'">
                    <div class="bubble-role">{{ m.role === 'human' ? '&#128100; You' : '&#129302; AI' }}</div>
                    <div class="bubble-text">{{ m.content.length > 160 ? m.content.slice(0, 160) + '…' : m.content }}</div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- ── MEMORY DELETE ── -->
          @else if (state.currentEndpointId() === 'memory_delete') {
            <div class="resp-status-card resp-status-warn">
              <div class="resp-status-icon">&#128465;&#65039;</div>
              <div>
                <div class="resp-status-title">Memory Cleared</div>
                <div class="resp-status-sub">Conversation history wiped</div>
              </div>
            </div>
          }

          <!-- ── INGEST ── -->
          @else if (state.currentEndpointId() === 'ingest') {
            <div class="resp-status-card resp-status-ok">
              <div class="resp-status-icon">&#128194;</div>
              <div>
                <div class="resp-status-title">Document Ingested</div>
                <div class="resp-status-sub">{{ state.apiResponse()!['chunks'] }} chunks stored in FAISS vector store</div>
              </div>
            </div>
          }

          <!-- ── FALLBACK ── -->
          @else {
            <pre class="resp-raw">{{ state.apiResponse() | json }}</pre>
          }

        </div>

      } @else if (state.isRunning()) {
        <!-- Flow in progress — show waiting message -->
        <div class="waiting-msg">
          <div class="waiting-spinner"></div>
          <span>Flow executing… response will appear after the &#10003; node</span>
        </div>
      }

    </div>
  `,
  styles: [`
    .input-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px 16px;
      height: 100%;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #e5e7eb transparent;
    }

    /* Brand */
    .brand-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 36px; height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }
    .brand-name { font-size: 13px; font-weight: 700; color: #111827; }
    .brand-sub  { font-size: 10px; color: #9ca3af; }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #d1d5db; margin-left: auto; flex-shrink: 0;
      transition: background 0.3s;
    }
    .status-dot.running {
      background: #6366f1;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
      animation: pulse-dot 1.2s ease-in-out infinite;
    }
    .status-dot.complete { background: #22c55e; }
    @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* Field blocks */
    .field-block { display: flex; flex-direction: column; gap: 5px; }
    .field-label {
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280;
    }
    /* ── Custom endpoint dropdown ── */
    .ep-trigger {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1.5px solid #e5e7eb;
      border-radius: 12px;
      background: #f9fafb;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
      user-select: none;
    }
    .ep-trigger:hover { border-color: #6366f1; background: white; }
    .ep-trigger-open {
      border-color: #6366f1;
      background: white;
      border-radius: 12px 12px 0 0;
      box-shadow: 0 2px 8px rgba(99,102,241,0.1);
    }
    .ep-trigger-disabled { opacity: 0.55; cursor: not-allowed; pointer-events: none; }

    .ep-trigger-body {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .ep-trigger-name {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ep-trigger-path {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      color: #9ca3af;
    }
    .ep-caret {
      font-size: 9px;
      color: #9ca3af;
      flex-shrink: 0;
      transition: transform 0.2s;
    }
    .ep-caret-open { transform: rotate(180deg); color: #6366f1; }

    /* Dropdown panel */
    .ep-dropdown {
      border: 1.5px solid #6366f1;
      border-top: none;
      border-radius: 0 0 12px 12px;
      background: white;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(99,102,241,0.12);
      animation: drop-in 0.15s ease;
    }
    @keyframes drop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    .ep-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      cursor: pointer;
      border-bottom: 1px solid #f3f4f6;
      transition: background 0.15s;
    }
    .ep-option:last-child { border-bottom: none; }
    .ep-option:hover { background: #f5f3ff; }
    .ep-option-active { background: #eef2ff; }
    .ep-option-body {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .ep-option-name {
      font-size: 12px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ep-option-path {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      color: #9ca3af;
    }
    .ep-active-dot {
      font-size: 12px;
      color: #6366f1;
      font-weight: 700;
      flex-shrink: 0;
    }

    /* HTTP verb badges */
    .verb-badge {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 5px;
      flex-shrink: 0;
      font-family: 'JetBrains Mono', monospace;
    }
    .verb-get    { background: #dcfce7; color: #15803d; }
    .verb-post   { background: #eef2ff; color: #4f46e5; }
    .verb-delete { background: #fef2f2; color: #dc2626; }

    .endpoint-tagline {
      font-size: 11px; color: #9ca3af; font-style: italic; margin-top: 4px;
    }

    .fields-area { display: flex; flex-direction: column; gap: 10px; }

    .field-textarea {
      width: 100%; padding: 9px 10px;
      border: 1.5px solid #e5e7eb; border-radius: 8px;
      font-size: 13px; font-family: inherit; color: #111827;
      background: #f9fafb; resize: vertical; outline: none;
      transition: border-color 0.2s; box-sizing: border-box;
    }
    .field-textarea:focus { border-color: #6366f1; background: white; }
    .field-textarea:disabled { opacity: 0.6; }

    .toggle-row { display: flex; align-items: center; justify-content: space-between; }
    .toggle-btn {
      padding: 4px 14px; border-radius: 99px;
      border: 1.5px solid #e5e7eb; background: #f3f4f6;
      color: #6b7280; font-size: 11px; font-weight: 700;
      cursor: pointer; transition: all 0.2s; font-family: inherit;
    }
    .toggle-on { background: #6366f1; border-color: #6366f1; color: white; }

    .field-select {
      padding: 7px 10px; border: 1.5px solid #e5e7eb; border-radius: 8px;
      font-size: 12px; font-family: inherit; color: #111827;
      background: #f9fafb; outline: none; cursor: pointer;
    }

    .file-zone {
      border: 2px dashed #d1d5db; border-radius: 8px;
      padding: 14px; text-align: center; cursor: pointer;
      transition: border-color 0.2s;
    }
    .file-zone:hover { border-color: #6366f1; background: #eef2ff; }
    .file-chosen { font-size: 12px; color: #6366f1; font-weight: 600; }
    .file-hint { font-size: 12px; color: #9ca3af; }

    /* Actions */
    .actions { display: flex; flex-direction: column; gap: 8px; }
    .btn {
      display: flex; align-items: center; justify-content: center;
      gap: 7px; padding: 10px; border-radius: 10px;
      font-size: 13px; font-weight: 700; border: none;
      cursor: pointer; font-family: inherit; transition: all 0.2s; width: 100%;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-run {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; box-shadow: 0 4px 12px rgba(99,102,241,0.3);
    }
    .btn-run:not(:disabled):hover {
      transform: translateY(-1px); box-shadow: 0 6px 16px rgba(99,102,241,0.4);
    }
    .btn-row { display: flex; gap: 8px; }
    .btn-next {
      flex: 1; background: white; color: #6366f1;
      border: 1.5px solid #e5e7eb; font-size: 12px;
    }
    .btn-next:not(:disabled):hover { border-color: #6366f1; background: #eef2ff; }
    .btn-auto { flex: 1; background: #f0fdf4; color: #16a34a; border: 1.5px solid #bbf7d0; font-size: 12px; }
    .btn-stop { flex: 1; background: #fff7ed; color: #d97706; border: 1.5px solid #fed7aa; font-size: 12px; }
    .btn-reset { background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; font-size: 12px; padding: 8px; }

    .divider { height: 1px; background: #f3f4f6; }

    /* Waiting state */
    .waiting-msg {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 12px; background: #f5f3ff;
      border-radius: 10px; border: 1px solid #ddd6fe;
      font-size: 12px; color: #6b7280;
    }
    .waiting-spinner {
      width: 14px; height: 14px; flex-shrink: 0;
      border: 2px solid #ddd6fe; border-top-color: #6366f1;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ══ Response card (Apple-style) ══ */
    .resp-card {
      border-radius: 16px;
      border: 1px solid #e5e7eb;
      overflow: visible;
      box-shadow: 0 4px 20px rgba(0,0,0,0.07);
      animation: card-in 0.4s cubic-bezier(0.34,1.56,0.64,1);
      background: white;
      /* clip header corners without clipping content */
      clip-path: none;
    }
    .resp-card > .resp-card-head {
      border-radius: 16px 16px 0 0;
      overflow: hidden;
    }
    @keyframes card-in { from { opacity:0; transform:translateY(10px) scale(0.98); } to { opacity:1; transform:none; } }

    /* Header strip */
    .resp-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      gap: 8px;
    }
    .resp-success-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: white;
    }
    .resp-check {
      width: 18px; height: 18px;
      background: #22c55e;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 900;
      flex-shrink: 0;
    }
    .resp-ep-pill {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: #7dd3fc;
      background: rgba(255,255,255,0.1);
      padding: 2px 8px;
      border-radius: 99px;
      white-space: nowrap;
    }

    /* AI Answer block */
    .resp-answer-block {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 14px 14px 10px;
      background: #fafafa;
      border-bottom: 1px solid #f0f0f0;
    }
    .resp-section-icon { font-size: 22px; flex-shrink: 0; margin-top: 1px; }
    .resp-answer-text {
      font-size: 14px;
      color: #111827;
      line-height: 1.7;
      font-weight: 400;
      flex: 1;
      min-width: 0;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* Section container */
    .resp-section {
      padding: 12px 14px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .resp-section:last-child { border-bottom: none; }
    .resp-section-label {
      font-size: 11px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Chips */
    .resp-chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 99px;
    }
    .chip-source { background: #eef2ff; color: #4f46e5; }
    .chip-tool   { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }

    /* Execution trace */
    .resp-trace { display: flex; flex-direction: column; gap: 6px; }
    .trace-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      background: #f9fafb;
      border: 1px solid #f0f0f0;
    }
    .trace-icon { font-size: 16px; flex-shrink: 0; line-height: 1.4; }
    .trace-body { display: flex; align-items: flex-start; gap: 7px; flex: 1; min-width: 0; }
    .trace-num {
      font-size: 10px;
      font-weight: 800;
      color: white;
      background: #6b7280;
      border-radius: 99px;
      width: 18px; height: 18px;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .trace-text {
      font-size: 12.5px;
      color: #374151;
      line-height: 1.6;
      flex: 1;
      min-width: 0;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* Trace type colour overrides */
    .trace-rag    { background: #eff6ff; border-color: #bfdbfe; }
    .trace-rag    .trace-num { background: #3b82f6; }
    .trace-rag    .trace-text { color: #1e3a8a; }

    .trace-tool   { background: #fffbeb; border-color: #fde68a; }
    .trace-tool   .trace-num { background: #d97706; }
    .trace-tool   .trace-text { color: #78350f; }

    .trace-agent  { background: #f5f3ff; border-color: #ddd6fe; }
    .trace-agent  .trace-num { background: #7c3aed; }
    .trace-agent  .trace-text { color: #3b0764; }

    .trace-memory { background: #fdf2f8; border-color: #fbcfe8; }
    .trace-memory .trace-num { background: #db2777; }
    .trace-memory .trace-text { color: #831843; }

    .trace-llm    { background: #f0fdf4; border-color: #bbf7d0; }
    .trace-llm    .trace-num { background: #16a34a; }
    .trace-llm    .trace-text { color: #14532d; }

    /* Status cards (health / ingest / memory clear) */
    .resp-status-card {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 14px;
      padding: 14px 16px;
      border-radius: 14px;
    }
    .resp-status-ok   { background: linear-gradient(135deg,#f0fdf4,#dcfce7); border: 1.5px solid #bbf7d0; }
    .resp-status-warn { background: linear-gradient(135deg,#fefce8,#fef9c3); border: 1.5px solid #fde68a; }
    .resp-status-icon { font-size: 28px; flex-shrink: 0; }
    .resp-status-title { font-size: 15px; font-weight: 700; color: #111827; }
    .resp-status-sub   { font-size: 12px; color: #6b7280; margin-top: 2px; }

    /* Prompt cards */
    .resp-prompt-card {
      margin: 8px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
    }
    .resp-prompt-badge {
      background: linear-gradient(90deg,#6366f1,#8b5cf6);
      color: white;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 5px 12px;
    }
    .resp-prompt-body {
      font-size: 12px;
      color: #374151;
      white-space: pre-wrap;
      padding: 10px 12px;
      line-height: 1.6;
      background: #fafafa;
    }

    /* Memory chat bubbles */
    .resp-mem-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
    .resp-bubble { padding: 8px 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 3px; }
    .bubble-human { background: #eef2ff; border-bottom-left-radius: 4px; }
    .bubble-ai    { background: #f0fdf4; border-bottom-right-radius: 4px; }
    .bubble-role  { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
    .bubble-text  { font-size: 13px; color: #1f2937; line-height: 1.5; }

    /* Fallback raw */
    .resp-raw { font-size: 11px; font-family: 'JetBrains Mono',monospace; color: #374151; white-space: pre-wrap; word-break: break-all; background: #f9fafb; padding: 12px; margin: 12px; border-radius: 10px; }
  `]
})
export class InputPanelComponent {
  readonly state = inject(ExecutionStateService);

  readonly endpoints: EndpointConfig[] = ENDPOINT_CONFIGS;
  readonly selectedId = signal('chat');
  dropOpen = false;

  readonly selected = computed(() =>
    this.endpoints.find(e => e.id === this.selectedId()) ?? this.endpoints[0]
  );

  private _formValues = signal<Record<string, any>>({
    chat: { question: 'What is 144 divided by 12?', use_rag: false, prompt_version: 'v1' },
    chat_stream: { question: 'Explain LangChain agents in simple terms', use_rag: false, prompt_version: 'v1' },
    agent: { question: 'What is 123 × 456 and what time is it now?' },
  });

  dotClass(): string {
    if (this.state.isRunning()) return 'running';
    if (this.state.isComplete()) return 'complete';
    return '';
  }

  getField(name: string, def: any): any {
    return this._formValues()[this.selectedId()]?.[name] ?? def;
  }

  setField(name: string, value: any): void {
    const id = this.selectedId();
    this._formValues.update(v => ({
      ...v,
      [id]: { ...(v[id] ?? {}), [name]: value },
    }));
  }

  toggleDrop(): void {
    this.dropOpen = !this.dropOpen;
  }

  pickEndpoint(id: string): void {
    this.dropOpen = false;
    this.onEndpointChange(id);
  }

  onEndpointChange(id: string): void {
    this.selectedId.set(id);
    this.state.resetState();
  }

  canRun(): boolean {
    if (this.state.isRunning()) return false;
    const ep = this.selected();
    if (ep.fields.some(f => f.type === 'textarea')) {
      const q = this.getField('question', '');
      return typeof q === 'string' && q.trim().length > 0;
    }
    return true;
  }

  runFlow(): void {
    if (!this.canRun()) return;
    const form = this._formValues()[this.selectedId()] ?? {};
    this.state.startFlow(this.selectedId(), form);
  }

  reset(): void {
    this.state.resetState();
  }

  traceClass(step: string): string {
    const s = step.toLowerCase();
    if (s.includes('tool used') || s.includes('calculator') || s.includes('datetime')) return 'trace-tool';
    if (s.includes('rag') || s.includes('retriev') || s.includes('faiss') || s.includes('context')) return 'trace-rag';
    if (s.includes('memory') || s.includes('saved') || s.includes('conversation')) return 'trace-memory';
    if (s.includes('agent') || s.includes('think') || s.includes('tool')) return 'trace-agent';
    if (s.includes('llm') || s.includes('routing') || s.includes('openai') || s.includes('deepseek')) return 'trace-llm';
    return '';
  }

  traceIcon(step: string): string {
    const s = step.toLowerCase();
    if (s.includes('calculator')) return '🧮';
    if (s.includes('datetime') || s.includes('time')) return '🕐';
    if (s.includes('tool used')) return '🔧';
    if (s.includes('rag') || s.includes('retriev') || s.includes('context')) return '📚';
    if (s.includes('memory') || s.includes('saved')) return '🧠';
    if (s.includes('agent')) return '🤖';
    if (s.includes('llm') || s.includes('routing')) return '⚡';
    if (s.includes('skip')) return '⏭';
    return '▸';
  }

  triggerFile(): void {
    document.getElementById('file-input')?.click();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.setField('file', input.files[0]);
    }
  }
}
