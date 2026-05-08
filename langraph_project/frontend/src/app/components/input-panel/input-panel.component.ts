import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExecutionStateService } from '../../services/execution-state.service';
import { ENDPOINT_CONFIGS, EndpointConfig } from '../../data/endpoints.data';
import { PROJECT_CONFIG } from '../../config/project.config';

@Component({
  selector: 'app-input-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="input-panel">

      <!-- Brand -->
      <div class="brand-row">
        <div class="brand-icon">&#127381;</div>
        <div>
          <div class="brand-name">{{ cfg.panelTitle }}</div>
          <div class="brand-sub">{{ cfg.panelSubtitle }}</div>
        </div>
        <div class="status-dot" [ngClass]="dotClass()"></div>
      </div>

      <!-- Endpoint selector — Apple-style colorful dropdown -->
      <div class="field-block">
        <label class="field-label">Select API Endpoint</label>

        <!-- Trigger button -->
        <div class="ep-trigger"
             [class.ep-trigger-open]="dropOpen"
             [class.ep-trigger-disabled]="state.isRunning()"
             [style.border-color]="dropOpen ? selected().color : ''"
             [style.box-shadow]="dropOpen ? '0 0 0 3px ' + selected().color + '22' : ''"
             (click)="!state.isRunning() && toggleDrop()">
          <div class="ep-icon-wrap" [style.background]="selected().color + '18'">
            <span class="ep-icon-emoji">{{ selected().emoji }}</span>
          </div>
          <div class="ep-trigger-body">
            <span class="ep-trigger-name" [style.color]="selected().color">{{ selected().label }}</span>
            <span class="ep-trigger-path">{{ selected().method }} {{ selected().path }}</span>
          </div>
          <span class="verb-badge" [ngClass]="'verb-' + selected().method.toLowerCase()">
            {{ selected().method }}
          </span>
          <span class="ep-caret" [class.ep-caret-open]="dropOpen" [style.color]="dropOpen ? selected().color : ''">▾</span>
        </div>

        <!-- Dropdown panel -->
        @if (dropOpen) {
          <div class="ep-dropdown">
            @for (ep of endpoints; track ep.id) {
              <div class="ep-option"
                   [class.ep-option-active]="ep.id === selectedId()"
                   [style.border-left-color]="ep.id === selectedId() ? ep.color : 'transparent'"
                   (click)="pickEndpoint(ep.id)">
                <div class="ep-opt-icon" [style.background]="ep.color + '18'">
                  <span>{{ ep.emoji }}</span>
                </div>
                <div class="ep-option-body">
                  <span class="ep-option-name"
                        [style.color]="ep.id === selectedId() ? ep.color : ''">{{ ep.label }}</span>
                  <span class="ep-option-path">{{ ep.path }}</span>
                </div>
                <span class="verb-badge" [ngClass]="'verb-' + ep.method.toLowerCase()">{{ ep.method }}</span>
                @if (ep.id === selectedId()) {
                  <span class="ep-active-check" [style.color]="ep.color">✓</span>
                }
              </div>
            }
          </div>
        }

        <div class="endpoint-tagline">
          <span class="tagline-dot" [style.background]="selected().color"></span>
          {{ selected().tagline }}
        </div>
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
                    <option [value]="opt">{{ opt }}</option>
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

          <!-- ── HEALTH ── -->
          @if (state.currentEndpointId() === 'health') {
            <div class="resp-status-card resp-status-ok">
              <div class="resp-status-icon">&#9989;</div>
              <div>
                <div class="resp-status-title">Platform is Online</div>
                <div class="resp-status-sub">{{ state.apiResponse()!['service'] }} v{{ state.apiResponse()!['version'] }}</div>
              </div>
            </div>
          }

          <!-- ── TRANSACTION ROUTE ── -->
          @else if (state.currentEndpointId() === 'transaction_route') {
            <div class="resp-status-card resp-status-ok">
              <div class="resp-status-icon">&#128203;</div>
              <div>
                <div class="resp-status-title">Routed: {{ state.apiResponse()!['routing_decision'] }}</div>
                <div class="resp-status-sub">Priority: {{ state.apiResponse()!['priority'] }} | Human review: {{ state.apiResponse()!['requires_human_review'] }}</div>
              </div>
            </div>
          }

          <!-- ── LOAN ELIGIBILITY ── -->
          @else if (state.currentEndpointId() === 'loan_eligibility') {
            <div class="resp-status-card" [ngClass]="state.apiResponse()!['decision'] === 'approved' ? 'resp-status-ok' : 'resp-status-warn'">
              <div class="resp-status-icon">{{ state.apiResponse()!['decision'] === 'approved' ? '&#9989;' : '&#10060;' }}</div>
              <div>
                <div class="resp-status-title">Decision: {{ (state.apiResponse()!['decision'] || '').toUpperCase() }}</div>
                <div class="resp-status-sub">
                  {{ state.apiResponse()!['eligible_amount'] ? 'Amount: $' + state.apiResponse()!['eligible_amount'] + ' @ ' + state.apiResponse()!['interest_rate'] + '%' : state.apiResponse()!['rejection_reason'] }}
                </div>
              </div>
            </div>
          }

          <!-- ── ACCOUNT QUERY ── -->
          @else if (state.currentEndpointId() === 'account_query') {
            <div class="resp-answer-block">
              <div class="ai-badge">
                <span class="ai-badge-spark">✦</span>
                <span class="ai-badge-text">AI</span>
              </div>
              <div class="resp-answer-text" [innerHTML]="formatResponse(state.apiResponse()!['answer'])"></div>
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
          }

          <!-- ── COMPLIANCE RAG ── -->
          @else if (state.currentEndpointId() === 'compliance_query') {
            <div class="resp-answer-block">
              <div class="ai-badge">
                <span class="ai-badge-spark">✦</span>
                <span class="ai-badge-text">AI</span>
              </div>
              <div class="resp-answer-text" [innerHTML]="formatResponse(state.apiResponse()!['answer'])"></div>
            </div>
            @if (state.apiResponse()!['sources']?.length) {
              <div class="resp-section">
                <div class="resp-section-label">&#128204; Policy Sources</div>
                <div class="resp-chips-row">
                  @for (src of state.apiResponse()!['sources']; track src) {
                    <span class="chip chip-source">{{ src }}</span>
                  }
                </div>
              </div>
            }
          }

          <!-- ── CONVERSATION ── -->
          @else if (state.currentEndpointId() === 'conversation_chat') {
            <div class="resp-answer-block">
              <div class="ai-badge">
                <span class="ai-badge-spark">✦</span>
                <span class="ai-badge-text">AI</span>
              </div>
              <div class="resp-answer-text" [innerHTML]="formatResponse(state.apiResponse()!['reply'])"></div>
            </div>
            <div class="resp-section">
              <div class="resp-section-label">
                &#129504; Session: {{ state.apiResponse()!['session_id'] }} · Turn {{ state.apiResponse()!['turn_count'] }}
                @if (state.apiResponse()!['intent']) { · Intent: {{ state.apiResponse()!['intent'] }} }
              </div>
            </div>
          }

          <!-- ── LOAN COMMITTEE ── -->
          @else if (state.currentEndpointId() === 'loan_committee') {
            <div class="resp-status-card" [ngClass]="state.apiResponse()!['verdict'] === 'approved' ? 'resp-status-ok' : 'resp-status-warn'">
              <div class="resp-status-icon">{{ state.apiResponse()!['verdict'] === 'approved' ? '&#9989;' : state.apiResponse()!['verdict'] === 'escalated' ? '&#9888;&#65039;' : '&#10060;' }}</div>
              <div>
                <div class="resp-status-title">Committee: {{ (state.apiResponse()!['verdict'] || '').toUpperCase() }}</div>
                <div class="resp-status-sub">Risk Score: {{ state.apiResponse()!['risk_score'] }} | Rate: {{ state.apiResponse()!['interest_rate'] }}%</div>
              </div>
            </div>
          }

          <!-- ── RESILIENCE ── -->
          @else if (state.currentEndpointId() === 'resilience_query') {
            <div class="resp-answer-block">
              <div class="ai-badge">
                <span class="ai-badge-spark">✦</span>
                <span class="ai-badge-text">AI</span>
              </div>
              <div class="resp-answer-text" [innerHTML]="formatResponse(state.apiResponse()!['response'])"></div>
            </div>
            <div class="resp-section">
              <div class="resp-section-label">
                &#128737;&#65039; Circuit: {{ state.apiResponse()!['circuit_state'] }}
                · Attempts: {{ state.apiResponse()!['attempt_count'] }}
                · Fallback: {{ state.apiResponse()!['used_fallback'] ? 'Yes' : 'No' }}
              </div>
            </div>
          }

          <!-- ── AUTH TOKEN ── -->
          @else if (state.currentEndpointId() === 'auth_token') {
            <div class="resp-status-card resp-status-ok">
              <div class="resp-status-icon">&#128274;</div>
              <div>
                <div class="resp-status-title">{{ state.apiResponse()!['username'] }} · {{ state.apiResponse()!['role'] }}</div>
                <div class="resp-status-sub">Bearer token issued — use in Authorization header</div>
              </div>
            </div>
          }

          <!-- ── AUTONOMOUS AGENT ── -->
          @else if (state.currentEndpointId() === 'autonomous_query') {
            <div class="resp-answer-block">
              <div class="ai-badge">
                <span class="ai-badge-spark">✦</span>
                <span class="ai-badge-text">AI</span>
              </div>
              <div class="resp-answer-text" [innerHTML]="formatResponse(state.apiResponse()!['answer'])"></div>
            </div>
            <div class="resp-section">
              <div class="resp-section-label">
                &#128301; Workflow: {{ state.apiResponse()!['workflow_used'] }}
                · Intent: {{ state.apiResponse()!['intent_detected'] }}
              </div>
            </div>
            @if (state.apiResponse()!['sources']?.length) {
              <div class="resp-section">
                <div class="resp-section-label">&#128204; RAG Sources</div>
                <div class="resp-chips-row">
                  @for (src of state.apiResponse()!['sources']; track src) {
                    <span class="chip chip-source">{{ src }}</span>
                  }
                </div>
              </div>
            }
          }

          <!-- ── FALLBACK — shows raw JSON for any unhandled endpoint ── -->
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
    /* ── Apple-style colorful endpoint dropdown ── */
    .ep-trigger {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border: 1.5px solid #e5e7eb;
      border-radius: 14px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.25s, background 0.2s;
      user-select: none;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .ep-trigger:hover {
      background: #fafafa;
      box-shadow: 0 3px 12px rgba(0,0,0,0.09);
    }
    .ep-trigger-open {
      border-radius: 14px 14px 0 0;
      background: white;
    }
    .ep-trigger-disabled { opacity: 0.55; cursor: not-allowed; pointer-events: none; }

    /* Colored emoji icon */
    .ep-icon-wrap {
      width: 34px; height: 34px;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background 0.3s;
    }
    .ep-icon-emoji { font-size: 17px; line-height: 1; }

    .ep-trigger-body {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .ep-trigger-name {
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.2s;
    }
    .ep-trigger-path {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      color: #9ca3af;
    }
    .ep-caret {
      font-size: 14px;
      color: #9ca3af;
      flex-shrink: 0;
      transition: transform 0.22s cubic-bezier(0.4,0,0.2,1), color 0.2s;
      line-height: 1;
    }
    .ep-caret-open { transform: rotate(180deg); }

    /* Dropdown panel */
    .ep-dropdown {
      border: 1.5px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 14px 14px;
      background: white;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
      animation: drop-in 0.18s cubic-bezier(0.34,1.3,0.64,1);
      max-height: 340px;
      overflow-y: auto;
    }
    @keyframes drop-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }

    /* Each option row */
    .ep-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #f3f4f6;
      border-left: 3px solid transparent;
      transition: background 0.15s, border-left-color 0.15s;
    }
    .ep-option:last-child { border-bottom: none; }
    .ep-option:hover { background: #f8f8fc; }
    .ep-option-active { background: #fafafe; }

    /* Colored emoji icon in option */
    .ep-opt-icon {
      width: 30px; height: 30px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    .ep-option:hover .ep-opt-icon { transform: scale(1.08); transition: transform 0.15s; }

    .ep-option-body {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .ep-option-name {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.15s;
    }
    .ep-option-path {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      color: #9ca3af;
    }
    .ep-active-check {
      font-size: 13px;
      font-weight: 800;
      flex-shrink: 0;
    }

    /* HTTP verb badges */
    .verb-badge {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 2px 7px;
      border-radius: 6px;
      flex-shrink: 0;
      font-family: 'JetBrains Mono', monospace;
    }
    .verb-get    { background: #dcfce7; color: #15803d; }
    .verb-post   { background: #eef2ff; color: #4f46e5; }
    .verb-delete { background: #fef2f2; color: #dc2626; }

    .endpoint-tagline {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #9ca3af;
      font-style: italic;
      margin-top: 5px;
    }
    .tagline-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      opacity: 0.7;
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
      gap: 12px;
      align-items: flex-start;
      padding: 16px 14px 12px;
      background: #fafafa;
      border-bottom: 1px solid #f0f0f0;
    }

    /* Custom AI gradient badge */
    .ai-badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(99,102,241,0.45);
      gap: 1px;
    }
    .ai-badge-spark { font-size: 8px; color: rgba(255,255,255,0.7); line-height: 1; }
    .ai-badge-text  { font-size: 14px; font-weight: 900; color: white; letter-spacing: -0.5px; line-height: 1; }

    .resp-answer-text {
      font-size: 14px;
      color: #111827;
      line-height: 1.75;
      font-weight: 400;
      flex: 1;
      min-width: 0;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* ── Rich text formatting inside answer ── */
    .resp-answer-text :host ::ng-deep .fmt-para { display: block; margin-bottom: 6px; }
    .resp-answer-text :host ::ng-deep .fmt-b { font-weight: 700; color: #111827; }

    :host ::ng-deep .fmt-para   { display: block; margin-bottom: 6px; }
    :host ::ng-deep .fmt-b      { font-weight: 700; color: #0f172a; }
    :host ::ng-deep .fmt-acr    {
      font-size: 11px; font-weight: 800; font-family: 'JetBrains Mono', monospace;
      background: #eef2ff; color: #4f46e5;
      padding: 1px 5px; border-radius: 4px; vertical-align: middle;
    }
    :host ::ng-deep .fmt-num-val {
      font-weight: 700; color: #ea580c;
      font-family: 'JetBrains Mono', monospace;
    }
    :host ::ng-deep .fmt-def {
      background: linear-gradient(135deg,#fef9c3,#fef08a);
      color: #78350f; font-weight: 600;
      padding: 0 3px; border-radius: 3px;
    }
    :host ::ng-deep .fmt-li {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 5px 0; padding: 6px 10px;
      background: white; border: 1px solid #e5e7eb; border-radius: 8px;
    }
    :host ::ng-deep .fmt-li-n {
      font-size: 11px; font-weight: 800; color: white;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 99px; min-width: 20px; height: 20px;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 1px;
    }
    :host ::ng-deep .fmt-li-text { font-size: 13.5px; color: #1f2937; line-height: 1.6; flex: 1; }
    :host ::ng-deep .fmt-bullet {
      display: flex; align-items: flex-start; gap: 8px; margin: 4px 0;
    }
    :host ::ng-deep .fmt-dot { color: #6366f1; font-size: 10px; margin-top: 5px; flex-shrink: 0; }
    :host ::ng-deep .fmt-hdr {
      font-size: 13px; font-weight: 700; color: #1e1b4b;
      margin: 8px 0 4px; padding-bottom: 3px;
      border-bottom: 2px solid #e0e7ff;
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
  readonly cfg = PROJECT_CONFIG;

  readonly endpoints: EndpointConfig[] = ENDPOINT_CONFIGS;
  readonly selectedId = signal('health');
  dropOpen = false;

  readonly selected = computed(() =>
    this.endpoints.find(e => e.id === this.selectedId()) ?? this.endpoints[0]
  );

  private _formValues = signal<Record<string, any>>({
    transaction_route:  { transaction_id: 'txn-001', transaction_type: 'payment', amount: 1200, account_id: 'ACC-1001' },
    loan_eligibility:   { applicant_id: 'app-001', loan_type: 'personal', requested_amount: 20000, annual_income: 80000, credit_score: 750, employment_years: 6, existing_debt: 500 },
    account_query:      { account_id: 'ACC-1001', query: 'What is my current balance and last 3 transactions?' },
    compliance_query:   { query: 'What are the AML reporting thresholds for Suspicious Activity Reports?', category: 'aml', top_k: '5' },
    conversation_chat:  { session_id: 'sess-001', message: 'What are the KYC requirements for opening a bank account?', account_id: 'ACC-1001' },
    loan_committee:     { application_id: 'APP-001', applicant_name: 'Alice Johnson', loan_type: 'personal', requested_amount: 20000, annual_income: 80000, credit_score: 750, employment_years: 6, existing_debt: 500 },
    resilience_query:   { query: 'What loan options are available for a credit score of 720?' },
    auth_token:         { username: 'admin', password: 'admin123' },
    autonomous_query:   { query: 'Am I eligible for a home loan with a credit score of 740?', session_id: 'sess-001' },
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
    this.state.selectEndpoint(id);
  }

  canRun(): boolean {
    if (this.state.isRunning()) return false;
    const ep = this.selected();
    // Any textarea field must be non-empty before running
    const textareaField = ep.fields.find(f => f.type === 'textarea');
    if (textareaField) {
      const val = this.getField(textareaField.name, textareaField.default ?? '');
      return typeof val === 'string' && val.trim().length > 0;
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

  formatResponse(text: string): string {
    if (!text) return '';
    const parts: string[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) { parts.push('<br>'); continue; }

      // Numbered list: "1. text"
      const numM = line.match(/^(\d+)[.)]\s+(.+)$/);
      if (numM) {
        parts.push(`<div class="fmt-li"><span class="fmt-li-n">${numM[1]}</span><span class="fmt-li-text">${this.inlineFmt(numM[2])}</span></div>`);
        continue;
      }
      // Bullet: "- text" or "• text"
      const bulM = line.match(/^[-•*]\s+(.+)$/);
      if (bulM) {
        parts.push(`<div class="fmt-bullet"><span class="fmt-dot">◆</span><span class="fmt-li-text">${this.inlineFmt(bulM[1])}</span></div>`);
        continue;
      }
      // Section header: short line ending with ":"
      if (/^[A-Z][^.!?\n]{2,50}:$/.test(line)) {
        parts.push(`<div class="fmt-hdr">${this.esc(line)}</div>`);
        continue;
      }
      parts.push(`<span class="fmt-para">${this.inlineFmt(line)}</span>`);
    }
    return parts.join('');
  }

  private inlineFmt(text: string): string {
    let h = this.esc(text);
    // **bold**
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b class="fmt-b">$1</b>');
    // Definition phrases: "stands for X", "refers to X" → highlight the definition
    h = h.replace(
      /\b(stands for|refers to|is defined as|means|is known as)\s+([^.,;:!?\n]+)/gi,
      (_m, verb, def) => `${verb} <mark class="fmt-def">${def}</mark>`
    );
    // Tech acronyms → indigo pill
    h = h.replace(
      /\b(AI|ML|NLP|RAG|LLM|API|FAISS|GPU|CPU|HTTP|REST|JSON|SQL|GPT|NLP|DevOps|CI\/CD|AGI|IoT|SaaS|OCR)\b/g,
      '<span class="fmt-acr">$1</span>'
    );
    // Numbers → orange bold
    h = h.replace(/\b(\d+(?:\.\d+)?(?:\s*(?:%|ms|px|billion|million|thousand|tokens?|chunks?|GB|MB|KB))?)\b/g,
      '<span class="fmt-num-val">$1</span>');
    return h;
  }

  private esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
