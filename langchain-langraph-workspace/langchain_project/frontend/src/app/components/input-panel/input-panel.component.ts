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
        <div class="response-area">
          <div class="resp-header">
            <span class="resp-dot"></span>
            <span class="resp-title">RESPONSE</span>
            <span class="resp-badge">{{ selected().method }} {{ selected().path }}</span>
          </div>
          <div [ngSwitch]="state.currentEndpointId()">

            <!-- Chat / Chat Stream -->
            <ng-template [ngSwitchCase]="'chat'">
              <ng-container *ngTemplateOutlet="chatResp"></ng-container>
            </ng-template>
            <ng-template [ngSwitchCase]="'chat_stream'">
              <ng-container *ngTemplateOutlet="chatResp"></ng-container>
            </ng-template>

            <!-- Agent -->
            <ng-template ngSwitchCase="agent">
              <div class="resp-answer">{{ state.apiResponse()!['answer'] }}</div>
              @if (state.apiResponse()!['tools_used']?.length) {
                <div class="resp-meta-label">Tools used:</div>
                <div class="tools-row">
                  @for (t of state.apiResponse()!['tools_used']; track t) {
                    <span class="tool-chip">&#128295; {{ t }}</span>
                  }
                </div>
              }
              @if (state.apiResponse()!['steps']?.length) {
                <div class="resp-meta-label">Trace:</div>
                <div class="steps-trace">
                  @for (s of state.apiResponse()!['steps']; track $index) {
                    <div class="trace-line">{{ s }}</div>
                  }
                </div>
              }
            </ng-template>

            <!-- Health -->
            <ng-template ngSwitchCase="health">
              <div class="resp-health">
                <div class="health-ok">&#10003; Service online</div>
                <div class="health-model">Model: <strong>{{ state.apiResponse()!['model'] }}</strong></div>
              </div>
            </ng-template>

            <!-- Prompts -->
            <ng-template ngSwitchCase="prompts">
              @for (p of state.apiResponse()!['prompts']; track p.version) {
                <div class="prompt-card">
                  <div class="prompt-ver">Style {{ p.version }}</div>
                  <div class="prompt-body">{{ p.content }}</div>
                </div>
              }
            </ng-template>

            <!-- Memory GET -->
            <ng-template ngSwitchCase="memory_get">
              <div class="resp-meta-label">{{ state.apiResponse()!['total'] }} messages stored</div>
              <div class="mem-list">
                @for (m of state.apiResponse()!['messages']; track $index) {
                  <div class="mem-msg" [ngClass]="m.role === 'human' ? 'mem-human' : 'mem-ai'">
                    <span class="mem-role">{{ m.role === 'human' ? '&#128100; You' : '&#129302; AI' }}</span>
                    <div class="mem-text">{{ m.content.length > 180 ? m.content.slice(0, 180) + '…' : m.content }}</div>
                  </div>
                }
              </div>
            </ng-template>

            <!-- Memory DELETE -->
            <ng-template ngSwitchCase="memory_delete">
              <div class="resp-health">
                <div class="health-ok">&#10003; Memory cleared</div>
              </div>
            </ng-template>

            <!-- Ingest -->
            <ng-template ngSwitchCase="ingest">
              <div class="resp-health">
                <div class="health-ok">&#10003; Document ingested</div>
                @if (state.apiResponse()!['chunks']) {
                  <div class="health-model">{{ state.apiResponse()!['chunks'] }} chunks stored in FAISS</div>
                }
              </div>
            </ng-template>

            <!-- Default -->
            <ng-template ngSwitchDefault>
              <pre class="resp-raw">{{ state.apiResponse() | json }}</pre>
            </ng-template>

          </div>
        </div>

        <!-- Shared chat template -->
        <ng-template #chatResp>
          <div class="resp-answer">{{ state.apiResponse()!['answer'] }}</div>
          @if (state.apiResponse()!['sources']?.length) {
            <div class="resp-meta-label">Sources:</div>
            <div class="sources-list">
              @for (src of state.apiResponse()!['sources']; track src) {
                <span class="source-chip">&#128204; {{ src }}</span>
              }
            </div>
          }
          @if (state.apiResponse()!['steps']?.length) {
            <div class="resp-meta-label">Execution trace:</div>
            <div class="steps-trace">
              @for (s of state.apiResponse()!['steps']; track $index) {
                <div class="trace-line">{{ $index + 1 }}. {{ s }}</div>
              }
            </div>
          }
        </ng-template>

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

    /* Response area */
    .response-area {
      display: flex; flex-direction: column; gap: 10px;
      animation: fade-in 0.4s ease;
    }
    @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    .resp-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .resp-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
    .resp-title { font-size: 10px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: 0.1em; }
    .resp-badge {
      font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px;
      background: #f0fdf4; color: #15803d; font-family: 'JetBrains Mono', monospace;
    }

    .resp-answer {
      font-size: 13px; color: #111827; line-height: 1.65;
      background: #f9fafb; border-radius: 8px; padding: 10px 12px;
      border: 1px solid #e5e7eb;
    }

    .resp-meta-label {
      font-size: 10px; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px;
    }

    .steps-trace { display: flex; flex-direction: column; gap: 3px; }
    .trace-line {
      font-size: 11px; color: #6b7280;
      font-family: 'JetBrains Mono', monospace;
      background: white; border: 1px solid #f3f4f6;
      padding: 3px 8px; border-radius: 4px;
    }

    .tools-row { display: flex; flex-wrap: wrap; gap: 5px; }
    .tool-chip { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 4px; background: #fffbeb; color: #d97706; }

    .sources-list { display: flex; flex-wrap: wrap; gap: 5px; }
    .source-chip { font-size: 11px; padding: 3px 9px; border-radius: 4px; background: #eef2ff; color: #6366f1; }

    .resp-health { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; background: #f0fdf4; border-radius: 8px; }
    .health-ok { font-size: 14px; font-weight: 700; color: #15803d; }
    .health-model { font-size: 12px; color: #374151; }

    .prompt-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
    .prompt-ver { font-size: 10px; font-weight: 700; color: #6366f1; text-transform: uppercase; margin-bottom: 5px; }
    .prompt-body { font-size: 11px; color: #374151; white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; }

    .mem-list { display: flex; flex-direction: column; gap: 5px; max-height: 200px; overflow-y: auto; }
    .mem-msg { padding: 7px 10px; border-radius: 7px; display: flex; flex-direction: column; gap: 2px; }
    .mem-human { background: #eef2ff; }
    .mem-ai    { background: #f9fafb; border: 1px solid #e5e7eb; }
    .mem-role  { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #9ca3af; }
    .mem-text  { font-size: 11px; color: #374151; line-height: 1.4; }

    .resp-raw { font-size: 10.5px; font-family: 'JetBrains Mono', monospace; color: #374151; white-space: pre-wrap; word-break: break-all; background: #f9fafb; padding: 10px; border-radius: 8px; margin: 0; }
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
