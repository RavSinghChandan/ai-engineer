import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface EndpointField {
  name: string;
  label: string;
  type: 'textarea' | 'toggle' | 'select' | 'file';
  placeholder?: string;
  default?: any;
  options?: string[];
}

interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  emoji: string;
  title: string;
  tagline: string;
  description: string;
  fields: EndpointField[];
  color: string;
  danger?: boolean;
}

const API_BASE = 'http://localhost:8000/api/v1';

const ENDPOINTS: Endpoint[] = [
  {
    id: 'health',
    method: 'GET',
    path: '/api/v1/health',
    emoji: '💚',
    title: 'Health Check',
    tagline: 'Is the AI service online?',
    description: 'One click to check if the AI backend is running and which AI model is currently active. No inputs needed.',
    fields: [],
    color: '#22c55e',
  },
  {
    id: 'chat',
    method: 'POST',
    path: '/api/v1/chat',
    emoji: '💬',
    title: 'Ask the AI a Question',
    tagline: 'Type any question and get a smart answer',
    description: 'The AI reads your question, thinks step-by-step using tools like a calculator, and gives a clear answer. Turn on "Search Documents" if you\'ve uploaded a file and want the AI to search it.',
    fields: [
      { name: 'question', label: 'Your question', type: 'textarea', placeholder: 'e.g. What is 25 × 4?  or  Explain machine learning simply', default: 'What is 144 divided by 12?' },
      { name: 'use_rag', label: 'Search uploaded documents', type: 'toggle', default: false },
      { name: 'prompt_version', label: 'AI style', type: 'select', options: ['v1', 'v2'], default: 'v1' },
    ],
    color: '#6366f1',
  },
  {
    id: 'chat_stream',
    method: 'POST',
    path: '/api/v1/chat/stream',
    emoji: '⚡',
    title: 'Ask the AI (Live Stream)',
    tagline: 'Watch the answer appear word by word in real time',
    description: 'Same as "Ask a Question" but the response arrives letter by letter — exactly like ChatGPT. Great for longer answers.',
    fields: [
      { name: 'question', label: 'Your question', type: 'textarea', placeholder: 'e.g. Tell me about LangChain agents', default: 'Tell me about LangChain in 3 sentences' },
      { name: 'use_rag', label: 'Search uploaded documents', type: 'toggle', default: false },
      { name: 'prompt_version', label: 'AI style', type: 'select', options: ['v1', 'v2'], default: 'v1' },
    ],
    color: '#8b5cf6',
  },
  {
    id: 'agent',
    method: 'POST',
    path: '/api/v1/agent',
    emoji: '🤖',
    title: 'Run the AI Agent Directly',
    tagline: 'The AI chooses its own tools to answer you',
    description: 'The Agent can use a calculator and check the current date/time. It decides on its own which tool(s) to use. You\'ll see exactly which tools it picked.',
    fields: [
      { name: 'question', label: 'Your question', type: 'textarea', placeholder: 'e.g. What is today\'s date and what is 99 × 99?', default: 'What is 123 × 456 and what time is it right now?' },
    ],
    color: '#f59e0b',
  },
  {
    id: 'prompts',
    method: 'GET',
    path: '/api/v1/prompts',
    emoji: '📝',
    title: 'View AI Personalities',
    tagline: 'See the hidden instructions that shape how the AI behaves',
    description: 'The AI has different "styles" (v1, v2). These are the behind-the-scenes instructions that tell the AI how to think and respond. Click to read them.',
    fields: [],
    color: '#10b981',
  },
  {
    id: 'memory',
    method: 'GET',
    path: '/api/v1/memory',
    emoji: '🧠',
    title: 'View Conversation History',
    tagline: 'See everything you and the AI have said this session',
    description: 'The AI remembers your questions and answers within a session. Click to view the full conversation log.',
    fields: [],
    color: '#3b82f6',
  },
  {
    id: 'ingest',
    method: 'POST',
    path: '/api/v1/ingest',
    emoji: '📂',
    title: 'Upload a Document',
    tagline: 'Give the AI your own file to read from',
    description: 'Upload a .txt or .pdf file. The AI will split it into pieces and remember the content. Then use "Ask a Question" with "Search Documents" turned ON to ask about your file.',
    fields: [
      { name: 'file', label: 'Choose a .txt or .pdf file', type: 'file', default: null },
    ],
    color: '#ec4899',
  },
  {
    id: 'memory_clear',
    method: 'DELETE',
    path: '/api/v1/memory',
    emoji: '🗑️',
    title: 'Clear Conversation Memory',
    tagline: 'Wipe the AI\'s memory and start completely fresh',
    description: 'Deletes all conversation history. The AI will forget everything from this session. Use this when switching topics or starting a new task.',
    fields: [],
    color: '#ef4444',
    danger: true,
  },
];

@Component({
  selector: 'app-api-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="explorer-root">

      <!-- Top header -->
      <div class="explorer-header">
        <div class="explorer-title-row">
          <div class="explorer-icon">🔌</div>
          <div>
            <h1 class="explorer-title">API Explorer</h1>
            <p class="explorer-sub">{{ endpoints.length }} endpoints — no code needed, just click Try It</p>
          </div>
        </div>
        <div class="endpoint-count-pills">
          <span class="method-pill get-pill">{{ getCount('GET') }} GET</span>
          <span class="method-pill post-pill">{{ getCount('POST') }} POST</span>
          <span class="method-pill delete-pill">{{ getCount('DELETE') }} DELETE</span>
        </div>
      </div>

      <!-- Backend status bar -->
      <div class="status-bar" [ngClass]="backendUp() ? 'status-ok' : 'status-down'">
        <span class="status-indicator"></span>
        <span>{{ backendUp() ? 'Backend is online — http://localhost:8000' : 'Backend offline — start: uvicorn app.main:app --port 8000' }}</span>
      </div>

      <!-- Endpoint cards grid -->
      <div class="cards-grid">
        @for (ep of endpoints; track ep.id) {
          <div class="ep-card" [ngClass]="{ 'card-danger': ep.danger }">

            <!-- Card top: method + path -->
            <div class="card-top">
              <span class="method-badge" [ngClass]="methodClass(ep.method)">{{ ep.method }}</span>
              <code class="path-code">{{ ep.path }}</code>
            </div>

            <!-- Card body -->
            <div class="card-body">
              <div class="card-emoji">{{ ep.emoji }}</div>
              <div class="card-info">
                <h2 class="card-title">{{ ep.title }}</h2>
                <p class="card-tagline">{{ ep.tagline }}</p>
              </div>
            </div>

            <!-- Description (toggleable) -->
            <p class="card-desc">{{ ep.description }}</p>

            <!-- Form fields -->
            @if (ep.fields.length > 0) {
              <div class="card-fields">
                @for (field of ep.fields; track field.name) {

                  @if (field.type === 'textarea') {
                    <div class="field-group">
                      <label class="field-label">{{ field.label }}</label>
                      <textarea
                        class="field-textarea"
                        [placeholder]="field.placeholder || ''"
                        [value]="getField(ep.id, field.name, field.default)"
                        (input)="setField(ep.id, field.name, $any($event.target).value)"
                        rows="3">
                      </textarea>
                    </div>
                  }

                  @if (field.type === 'toggle') {
                    <div class="field-toggle-row">
                      <span class="field-label">{{ field.label }}</span>
                      <button
                        class="toggle-btn"
                        [ngClass]="{ 'toggle-on': getField(ep.id, field.name, field.default) }"
                        (click)="setField(ep.id, field.name, !getField(ep.id, field.name, field.default))">
                        {{ getField(ep.id, field.name, field.default) ? 'ON' : 'OFF' }}
                      </button>
                    </div>
                  }

                  @if (field.type === 'select') {
                    <div class="field-group">
                      <label class="field-label">{{ field.label }}</label>
                      <select
                        class="field-select"
                        [value]="getField(ep.id, field.name, field.default)"
                        (change)="setField(ep.id, field.name, $any($event.target).value)">
                        @for (opt of field.options; track opt) {
                          <option [value]="opt">{{ opt === 'v1' ? 'v1 — Friendly & Clear' : 'v2 — Analytical & Detailed' }}</option>
                        }
                      </select>
                    </div>
                  }

                  @if (field.type === 'file') {
                    <div class="field-group">
                      <label class="field-label">{{ field.label }}</label>
                      <div class="file-drop" (click)="triggerFile(ep.id)">
                        <input
                          type="file"
                          [id]="'file-' + ep.id"
                          accept=".txt,.pdf"
                          style="display:none"
                          (change)="onFileChange(ep.id, $event)">
                        @if (getField(ep.id, 'file', null)) {
                          <span class="file-chosen">📄 {{ getField(ep.id, 'file', null)?.name }}</span>
                        } @else {
                          <span class="file-placeholder">Click to choose .txt or .pdf</span>
                        }
                      </div>
                    </div>
                  }

                }
              </div>
            }

            <!-- Try It button -->
            <button
              class="try-btn"
              [style.background]="ep.color"
              [disabled]="isLoading(ep.id)"
              (click)="ep.danger ? confirmAndCall(ep) : call(ep)">
              @if (isLoading(ep.id)) {
                <span class="btn-spinner"></span>
                Running…
              } @else {
                <span>{{ ep.method === 'DELETE' ? '⚠️ ' : '' }}Try It →</span>
              }
            </button>

            <!-- Response area -->
            @if (isLoading(ep.id) && ep.id === 'chat_stream') {
              <div class="response-box stream-box">
                <div class="resp-label">Live response:</div>
                <div class="stream-text">{{ getStreamText(ep.id) }}<span class="cursor">▌</span></div>
              </div>
            }

            @if (getError(ep.id)) {
              <div class="response-box error-box">
                <div class="resp-label">❌ Error</div>
                <div class="error-text">{{ getError(ep.id) }}</div>
              </div>
            }

            @if (getResponse(ep.id) !== null && !isLoading(ep.id)) {
              <div class="response-box success-box">
                <div class="resp-label">✅ Response</div>
                <div [ngSwitch]="ep.id">

                  <!-- Health -->
                  <ng-template ngSwitchCase="health">
                    <div class="friendly-resp">
                      <div class="resp-status-ok">Service is running ✓</div>
                      <div class="resp-detail">Active model: <strong>{{ getResponse(ep.id).model }}</strong></div>
                    </div>
                  </ng-template>

                  <!-- Chat -->
                  <ng-template ngSwitchCase="chat">
                    <div class="friendly-resp">
                      <div class="resp-answer">{{ getResponse(ep.id).answer }}</div>
                      @if (getResponse(ep.id).steps?.length) {
                        <div class="resp-steps-label">Execution steps:</div>
                        <div class="resp-steps">
                          @for (step of getResponse(ep.id).steps; track $index) {
                            <div class="resp-step">{{ $index + 1 }}. {{ step }}</div>
                          }
                        </div>
                      }
                      @if (getResponse(ep.id).sources?.length) {
                        <div class="resp-sources">
                          <span class="resp-steps-label">Sources used:</span>
                          @for (src of getResponse(ep.id).sources; track src) {
                            <span class="source-tag">📎 {{ src }}</span>
                          }
                        </div>
                      }
                    </div>
                  </ng-template>

                  <!-- Agent -->
                  <ng-template ngSwitchCase="agent">
                    <div class="friendly-resp">
                      <div class="resp-answer">{{ getResponse(ep.id).answer }}</div>
                      @if (getResponse(ep.id).tools_used?.length) {
                        <div class="resp-steps-label">Tools used by the AI:</div>
                        @for (tool of getResponse(ep.id).tools_used; track tool) {
                          <span class="tool-tag">🔧 {{ tool }}</span>
                        }
                      }
                      @if (getResponse(ep.id).steps?.length) {
                        <div class="resp-steps-label" style="margin-top:8px">Step trace:</div>
                        <div class="resp-steps">
                          @for (step of getResponse(ep.id).steps; track $index) {
                            <div class="resp-step">{{ step }}</div>
                          }
                        </div>
                      }
                    </div>
                  </ng-template>

                  <!-- Prompts -->
                  <ng-template ngSwitchCase="prompts">
                    <div class="friendly-resp">
                      @for (p of getResponse(ep.id).prompts; track p.version) {
                        <div class="prompt-card">
                          <div class="prompt-version">Style {{ p.version }}</div>
                          <div class="prompt-content">{{ p.content }}</div>
                        </div>
                      }
                    </div>
                  </ng-template>

                  <!-- Memory -->
                  <ng-template ngSwitchCase="memory">
                    <div class="friendly-resp">
                      <div class="resp-steps-label">{{ getResponse(ep.id).total }} messages in memory</div>
                      <div class="chat-history">
                        @for (msg of getResponse(ep.id).messages; track $index) {
                          <div class="chat-msg" [ngClass]="msg.role === 'human' ? 'msg-human' : 'msg-ai'">
                            <span class="msg-role">{{ msg.role === 'human' ? '👤 You' : '🤖 AI' }}</span>
                            <div class="msg-content">{{ msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content }}</div>
                          </div>
                        }
                      </div>
                    </div>
                  </ng-template>

                  <!-- Memory clear -->
                  <ng-template ngSwitchCase="memory_clear">
                    <div class="friendly-resp">
                      <div class="resp-status-ok">Memory cleared ✓</div>
                      <div class="resp-detail">All conversation history has been deleted.</div>
                    </div>
                  </ng-template>

                  <!-- Ingest -->
                  <ng-template ngSwitchCase="ingest">
                    <div class="friendly-resp">
                      <div class="resp-status-ok">Document uploaded ✓</div>
                      <pre class="json-raw">{{ getResponse(ep.id) | json }}</pre>
                    </div>
                  </ng-template>

                  <!-- Stream (completed) -->
                  <ng-template ngSwitchCase="chat_stream">
                    <div class="friendly-resp">
                      <div class="resp-answer">{{ getResponse(ep.id) }}</div>
                    </div>
                  </ng-template>

                  <!-- Default: pretty JSON -->
                  <ng-template ngSwitchDefault>
                    <pre class="json-raw">{{ getResponse(ep.id) | json }}</pre>
                  </ng-template>

                </div>
              </div>
            }

            <!-- Stream box (completed) shows inside success-box via ngSwitch above, but live stream shows here -->
            @if (ep.id === 'chat_stream' && getStreamText(ep.id) && !isLoading(ep.id) && getResponse(ep.id) === null) {
              <div class="response-box success-box">
                <div class="resp-label">✅ Streamed response</div>
                <div class="friendly-resp">
                  <div class="resp-answer">{{ getStreamText(ep.id) }}</div>
                </div>
              </div>
            }

          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .explorer-root {
      height: 100%;
      overflow-y: auto;
      background: #f5f5f7;
      scrollbar-width: thin;
      scrollbar-color: #d1d5db transparent;
    }

    /* Header */
    .explorer-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 24px 28px 16px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      flex-wrap: wrap;
      gap: 12px;
    }
    .explorer-title-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .explorer-icon {
      font-size: 32px;
      width: 52px; height: 52px;
      background: linear-gradient(135deg, #eef2ff, #e0e7ff);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    .explorer-title {
      font-size: 20px;
      font-weight: 800;
      color: #111827;
      margin: 0 0 2px;
    }
    .explorer-sub {
      font-size: 12px;
      color: #6b7280;
      margin: 0;
    }
    .endpoint-count-pills {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .method-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 99px;
    }
    .get-pill  { background: #dcfce7; color: #15803d; }
    .post-pill { background: #eef2ff; color: #4338ca; }
    .delete-pill { background: #fef2f2; color: #dc2626; }

    /* Status bar */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 28px;
      font-size: 11px;
      font-weight: 500;
    }
    .status-ok { background: #f0fdf4; color: #15803d; }
    .status-down { background: #fef2f2; color: #dc2626; }
    .status-indicator {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .status-ok .status-indicator { animation: blink 2s ease-in-out infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* Cards grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 16px;
      padding: 20px 28px;
    }

    /* Card */
    .ep-card {
      background: white;
      border-radius: 16px;
      border: 1.5px solid #e5e7eb;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: box-shadow 0.2s, border-color 0.2s;
    }
    .ep-card:hover {
      box-shadow: 0 4px 20px rgba(0,0,0,0.07);
      border-color: #c7d2fe;
    }
    .card-danger { border-color: #fca5a5; }
    .card-danger:hover { border-color: #f87171; }

    /* Card top */
    .card-top {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .method-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }
    .badge-GET    { background: #dcfce7; color: #15803d; }
    .badge-POST   { background: #eef2ff; color: #4338ca; }
    .badge-DELETE { background: #fef2f2; color: #dc2626; }
    .path-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #6b7280;
      background: #f9fafb;
      padding: 2px 8px;
      border-radius: 4px;
    }

    /* Card body */
    .card-body {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .card-emoji { font-size: 28px; flex-shrink: 0; }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 3px;
    }
    .card-tagline {
      font-size: 12px;
      color: #6b7280;
      margin: 0;
    }

    .card-desc {
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.6;
      margin: 0;
      padding: 10px 12px;
      background: #fafafa;
      border-radius: 8px;
      border-left: 3px solid #e5e7eb;
    }

    /* Fields */
    .card-fields {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .field-label {
      font-size: 11px;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .field-textarea {
      width: 100%;
      padding: 8px 10px;
      border: 1.5px solid #e5e7eb;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: #111827;
      background: #f9fafb;
      resize: vertical;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    .field-textarea:focus { border-color: #6366f1; background: white; }
    .field-select {
      padding: 7px 10px;
      border: 1.5px solid #e5e7eb;
      border-radius: 8px;
      font-size: 12px;
      font-family: inherit;
      color: #111827;
      background: #f9fafb;
      outline: none;
      cursor: pointer;
    }
    .field-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .toggle-btn {
      padding: 4px 14px;
      border-radius: 99px;
      border: 1.5px solid #e5e7eb;
      background: #f3f4f6;
      color: #6b7280;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .toggle-on {
      background: #6366f1;
      border-color: #6366f1;
      color: white;
    }
    .file-drop {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    .file-drop:hover { border-color: #6366f1; background: #eef2ff; }
    .file-chosen { font-size: 12px; color: #6366f1; font-weight: 600; }
    .file-placeholder { font-size: 12px; color: #9ca3af; }

    /* Try It button */
    .try-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 20px;
      border: none;
      border-radius: 10px;
      color: white;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      width: 100%;
    }
    .try-btn:not(:disabled):hover { opacity: 0.88; transform: translateY(-1px); }
    .try-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Response boxes */
    .response-box {
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 12px;
    }
    .success-box { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .error-box   { background: #fef2f2; border: 1px solid #fecaca; }
    .stream-box  { background: #f5f3ff; border: 1px solid #ddd6fe; }
    .resp-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .error-text { color: #dc2626; font-size: 12px; }

    /* Friendly response parts */
    .friendly-resp { display: flex; flex-direction: column; gap: 8px; }
    .resp-answer {
      font-size: 13px;
      color: #111827;
      line-height: 1.6;
      background: white;
      padding: 10px 12px;
      border-radius: 8px;
    }
    .resp-status-ok {
      font-size: 14px;
      font-weight: 700;
      color: #15803d;
    }
    .resp-detail { font-size: 12px; color: #374151; }
    .resp-steps-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #9ca3af;
      letter-spacing: 0.08em;
    }
    .resp-steps { display: flex; flex-direction: column; gap: 3px; }
    .resp-step {
      font-size: 11px;
      color: #6b7280;
      padding: 3px 8px;
      background: white;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
    }
    .resp-sources { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .source-tag {
      font-size: 10px;
      background: #eef2ff;
      color: #6366f1;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .tool-tag {
      font-size: 11px;
      background: #fffbeb;
      color: #d97706;
      padding: 3px 10px;
      border-radius: 4px;
      font-weight: 600;
      margin-right: 4px;
    }

    /* Prompts */
    .prompt-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .prompt-version {
      font-size: 11px;
      font-weight: 700;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .prompt-content {
      font-size: 11px;
      color: #374151;
      white-space: pre-wrap;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Memory / chat history */
    .chat-history {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 220px;
      overflow-y: auto;
    }
    .chat-msg {
      padding: 8px 10px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .msg-human { background: #eef2ff; }
    .msg-ai    { background: #f9fafb; border: 1px solid #e5e7eb; }
    .msg-role  { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
    .msg-content { font-size: 12px; color: #374151; line-height: 1.5; }

    /* Stream */
    .stream-text {
      font-size: 13px;
      color: #111827;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .cursor {
      animation: blink-cursor 1s step-end infinite;
      color: #6366f1;
    }
    @keyframes blink-cursor { 0%,100%{opacity:1} 50%{opacity:0} }

    .json-raw {
      font-size: 10.5px;
      font-family: 'JetBrains Mono', monospace;
      color: #374151;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }

    @media (max-width: 600px) {
      .cards-grid { grid-template-columns: 1fr; padding: 12px; }
      .explorer-header { padding: 16px; }
    }
  `]
})
export class ApiExplorerComponent {
  private http = inject(HttpClient);

  readonly endpoints = ENDPOINTS;

  backendUp = signal(false);

  private formData = signal<Record<string, Record<string, any>>>({
    chat: { question: 'What is 144 divided by 12?', use_rag: false, prompt_version: 'v1' },
    chat_stream: { question: 'Tell me about LangChain in 3 sentences', use_rag: false, prompt_version: 'v1' },
    agent: { question: 'What is 123 × 456 and what time is it right now?' },
    ingest: { file: null },
  });

  private loadingMap = signal<Record<string, boolean>>({});
  private responseMap = signal<Record<string, any>>({});
  private errorMap = signal<Record<string, string>>({});
  private streamMap = signal<Record<string, string>>({});

  constructor() {
    this.http.get(`${API_BASE}/health`).subscribe({
      next: () => this.backendUp.set(true),
      error: () => this.backendUp.set(false),
    });
  }

  getCount(method: string): number {
    return this.endpoints.filter(e => e.method === method).length;
  }

  methodClass(m: string): string {
    return `badge-${m}`;
  }

  getField(epId: string, field: string, def: any): any {
    return this.formData()[epId]?.[field] ?? def;
  }

  setField(epId: string, field: string, value: any): void {
    this.formData.update(d => ({
      ...d,
      [epId]: { ...(d[epId] ?? {}), [field]: value },
    }));
  }

  isLoading(epId: string): boolean {
    return this.loadingMap()[epId] ?? false;
  }

  getResponse(epId: string): any {
    return this.responseMap()[epId] ?? null;
  }

  getError(epId: string): string {
    return this.errorMap()[epId] ?? '';
  }

  getStreamText(epId: string): string {
    return this.streamMap()[epId] ?? '';
  }

  private setLoading(epId: string, v: boolean): void {
    this.loadingMap.update(m => ({ ...m, [epId]: v }));
  }

  private setResponse(epId: string, v: any): void {
    this.responseMap.update(m => ({ ...m, [epId]: v }));
  }

  private setError(epId: string, v: string): void {
    this.errorMap.update(m => ({ ...m, [epId]: v }));
  }

  confirmAndCall(ep: Endpoint): void {
    if (confirm('⚠️ This will delete ALL conversation history. Continue?')) {
      this.call(ep);
    }
  }

  call(ep: Endpoint): void {
    this.setLoading(ep.id, true);
    this.setResponse(ep.id, null);
    this.setError(ep.id, '');

    if (ep.id === 'chat_stream') {
      this.callStream(ep);
      return;
    }

    if (ep.id === 'ingest') {
      this.callIngest();
      return;
    }

    const form = this.formData()[ep.id] ?? {};
    let obs;

    if (ep.method === 'GET') {
      obs = this.http.get<any>(`http://localhost:8000${ep.path}`);
    } else if (ep.method === 'DELETE') {
      obs = this.http.delete<any>(`http://localhost:8000${ep.path}`);
    } else {
      const body: Record<string, any> = {};
      ep.fields.forEach(f => { body[f.name] = form[f.name] ?? f.default; });
      obs = this.http.post<any>(`http://localhost:8000${ep.path}`, body);
    }

    obs.subscribe({
      next: (res: any) => { this.setResponse(ep.id, res); this.setLoading(ep.id, false); },
      error: (err: any) => {
        this.setError(ep.id, err.error?.detail ?? err.message ?? 'Request failed');
        this.setLoading(ep.id, false);
        this.backendUp.set(false);
      },
    });
  }

  private callStream(ep: Endpoint): void {
    const form = this.formData()[ep.id] ?? {};
    this.streamMap.update(m => ({ ...m, [ep.id]: '' }));

    fetch('http://localhost:8000/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: form['question'] ?? '',
        use_rag: form['use_rag'] ?? false,
        prompt_version: form['prompt_version'] ?? 'v1',
      }),
    }).then(res => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      const pump = (): Promise<void> =>
        reader.read().then(({ done, value }) => {
          if (done) {
            this.setResponse(ep.id, this.streamMap()[ep.id]);
            this.setLoading(ep.id, false);
            return;
          }
          const chunk = decoder.decode(value);
          this.streamMap.update(m => ({ ...m, [ep.id]: (m[ep.id] ?? '') + chunk }));
          return pump();
        });

      return pump();
    }).catch(err => {
      this.setError(ep.id, err.message ?? 'Stream failed');
      this.setLoading(ep.id, false);
    });
  }

  private callIngest(): void {
    const form = this.formData()['ingest'] ?? {};
    const file = form['file'] as File | null;

    if (!file) {
      this.setError('ingest', 'Please select a file first');
      this.setLoading('ingest', false);
      return;
    }

    const fd = new FormData();
    fd.append('file', file);

    this.http.post<any>('http://localhost:8000/api/v1/ingest', fd).subscribe({
      next: (res) => { this.setResponse('ingest', res); this.setLoading('ingest', false); },
      error: (err) => {
        this.setError('ingest', err.error?.detail ?? err.message ?? 'Upload failed');
        this.setLoading('ingest', false);
      },
    });
  }

  triggerFile(epId: string): void {
    document.getElementById(`file-${epId}`)?.click();
  }

  onFileChange(epId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.setField(epId, 'file', input.files[0]);
    }
  }
}
