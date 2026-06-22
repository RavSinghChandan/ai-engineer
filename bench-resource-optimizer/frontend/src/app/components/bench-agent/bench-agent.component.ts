import { Component, inject, signal, ViewChild, ElementRef, AfterViewChecked, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BenchAgentService } from '../../services/bench-agent.service';
import { AuthService } from '../../services/auth.service';

function md(text: string): string {
  if (!text) return '';
  return text
    .replace(/\|(.+)\|/g, (_: string, r: string) => r.split('|').map((c: string) => c.trim()).filter(Boolean).join(' · '))
    .replace(/^---+$/gm, '<hr/>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/[*][*](.+?)[*][*]/g, '<strong>$1</strong>').replace(/[*](.+?)[*]/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[- ] (.+)$/gm, '<li>$1</li>').replaceAll(/(<li>[\s\S]*?<\/li>)(\s*(?!<li>))/g, '<ul>$1</ul>$2')
    .replace(/^\d+[.] (.+)$/gm, '<li>$1</li>')
    .replaceAll(/\n\n+/g, '<br/><br/>').replaceAll('\n', '<br/>');
}

@Component({
  selector: 'app-bench-agent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (auth.isLoggedIn()) {
      <!-- Stars backdrop when panel open -->
      @if (agent.isOpen()) {
        <div class="n-stars" aria-hidden="true">
          @for (s of stars; track $index) {
            <span [style]="s"></span>
          }
        </div>
      }

      <!-- FAB -->
      <button class="n-fab" (click)="agent.toggle()" [class.open]="agent.isOpen()" aria-label="Ask Nova">
        <div class="fab-wrap">
          <div class="fab-ring"></div>
          <img [src]="fabAvatar()" class="fab-av" alt="Nova"/>
          <span class="fab-dot"></span>
        </div>
        <div class="fab-txt">
          <span class="fab-name">Nova</span>
          <span class="fab-sub">HR Intelligence · Ask me</span>
        </div>
        @if (unread() > 0 && !agent.isOpen()) { <span class="fab-badge">{{ unread() }}</span> }
      </button>

      @if (agent.isOpen()) {
        <div class="n-panel" [style.width.px]="pw()" [style.height.px]="ph()" role="dialog" aria-label="Nova HR Assistant">
          <div class="resize-h" (mousedown)="rsStart($event)" title="Drag to resize">⤡</div>

          <!-- Header -->
          <div class="n-header">
            <div class="h-avatar-wrap">
              <img [src]="headerAvatar()" class="h-av" alt="Nova"/>
              <div class="h-aura"></div>
            </div>
            <div class="h-info">
              <strong>Nova</strong>
              <span class="h-status"><span class="h-dot"></span>Bench Resource Optimizer · HR Guide</span>
            </div>
            <div class="h-actions">
              <!-- Voice toggle -->
              <button class="h-btn" (click)="toggleVoice()" [title]="voiceEnabled ? 'Voice on' : 'Voice off'" [class.voice-on]="voiceEnabled">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  @if (voiceEnabled) {
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  } @else {
                    <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  }
                </svg>
              </button>
              <!-- Mic button -->
              <button class="h-btn" [class.listening]="listening" (click)="toggleListen()" title="Voice input" [disabled]="agent.isStreaming()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="h-btn" (click)="newSession()" title="New conversation">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
              <button class="h-btn h-close" (click)="agent.close()">✕</button>
            </div>
          </div>

          <!-- Messages -->
          <div class="n-msgs" #scrollRef>
            @if (!agent.hasMessages()) {
              <div class="welcome">
                <div class="w-av-wrap">
                  <img src="assets/nova-happy.svg" class="w-av" alt="Nova"/>
                  <div class="w-aura"></div>
                </div>
                <p class="w-title">Hi, I'm Nova</p>
                <p class="w-sub">Your HR Intelligence guide for Bench Resource Optimizer. Ask me about skill gaps, match scores, the Hybrid RAG pipeline, or how the platform works.</p>
                <div class="q-grid">
                  @for (p of agent.quickPrompts; track p.label) {
                    <button class="q-btn" (click)="send(p.text)">{{ p.label }}</button>
                  }
                </div>
              </div>
            }

            @for (msg of agent.messages(); track $index) {
              <div class="msg" [class.mu]="msg.role==='user'" [class.ma]="msg.role==='agent'">
                @if (msg.role==='agent') {
                  <img [src]="msgAvatar($index)" class="m-av" alt="Nova"/>
                }
                <div class="m-col" [class.mc-u]="msg.role==='user'">
                  <div class="bubble" [class.bu]="msg.role==='user'" [class.ba]="msg.role==='agent'">
                    @if (msg.role==='agent') {
                      <span [innerHTML]="safe(msg.content)"></span>
                      @if (msg.streaming) { <span class="cur">▌</span> }
                    } @else {
                      {{ msg.content }}
                    }
                  </div>
                  <span class="mt">{{ msg.timestamp | date:'HH:mm' }}</span>
                </div>
              </div>
            }

            @if (agent.isLoading()) {
              <div class="msg ma">
                <img src="assets/nova-thinking.svg" class="m-av" alt="Nova"/>
                <div class="bubble ba think-bubble">
                  <span class="think-dots"><span></span><span></span><span></span></span>
                  <em class="think-phrase">{{ thinkPhrase }}</em>
                </div>
              </div>
            }

            @if (agent.error()) {
              <div class="err-bar">
                <span>Connection issue — try again</span>
                <button (click)="agent.error.set(null)">✕</button>
              </div>
            }
          </div>

          <!-- Limit bar -->
          @if (agent.qCount() > 0 && !agent.isLimited()) {
            <div class="lbar">
              <span class="ldot"></span>
              {{ agent.qRemaining() }} question{{ agent.qRemaining()===1?'':'s' }} remaining
            </div>
          }

          <!-- Input -->
          <div class="n-input">
            @if (agent.isLimited()) {
              <div class="locked">
                Session limit reached
                <button class="new-btn" (click)="newSession()">New session</button>
              </div>
            } @else {
              @if (listening) {
                <div class="listen-bar">
                  <span class="listen-dot"></span>
                  Listening… {{ draft || 'speak now' }}
                </div>
              }
              <div class="input-row">
                <input class="inp" type="text"
                  [placeholder]="'Ask about match scores, skill gaps, RAG pipeline… (' + agent.qRemaining() + ' left)'"
                  [(ngModel)]="draft"
                  (keydown.enter)="send(draft)"
                  [disabled]="agent.isLoading() || agent.isStreaming()"
                  maxlength="500"/>
                <button class="send-btn" (click)="send(draft)"
                  [disabled]="!draft.trim() || agent.isLoading() || agent.isStreaming()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    /* ── Stars ─────────────────────────────────────────────── */
    .n-stars {
      position: fixed; inset: 0; pointer-events: none; z-index: 9990; overflow: hidden;
    }
    .n-stars span {
      position: absolute; border-radius: 50%;
      background: #3b82f6; opacity: 0;
      animation: star-twinkle var(--d,3s) var(--del,0s) infinite ease-in-out;
      width: var(--sz,2px); height: var(--sz,2px);
    }
    @keyframes star-twinkle {
      0%,100% { opacity:0; transform:scale(1); }
      50% { opacity:var(--op,.4); transform:scale(1.4); }
    }

    /* ── FAB ────────────────────────────────────────────────── */
    .n-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      display: flex; align-items: center; gap: 10px;
      padding: 8px 16px 8px 8px; border-radius: 50px;
      background: #ffffff;
      border: 1.5px solid rgba(59,130,246,0.3);
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(59,130,246,0.2), 0 1px 4px rgba(0,0,0,.08);
      transition: transform .2s, box-shadow .2s;
    }
    .n-fab:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(59,130,246,0.32); }
    .n-fab.open  { background: #eff6ff; border-color: #3b82f6; }

    .fab-wrap { position: relative; width: 42px; height: 42px; flex-shrink: 0; }
    .fab-ring {
      position: absolute; inset: -3px; border-radius: 50%;
      border: 2px solid rgba(59,130,246,.4);
      animation: fab-breathe 3s ease-in-out infinite;
    }
    @keyframes fab-breathe {
      0%,100% { transform:scale(1); opacity:.4; }
      50% { transform:scale(1.12); opacity:.8; }
    }
    .fab-av {
      width: 42px; height: 42px; border-radius: 50%;
      object-fit: contain; background: #eff6ff; padding: 3px; display: block;
      border: 2px solid rgba(59,130,246,.2);
    }
    .fab-dot {
      position: absolute; bottom: 0; right: 0;
      width: 11px; height: 11px; border-radius: 50%;
      background: #22c55e; border: 2px solid #fff;
      animation: pulse-dot 2s infinite;
    }
    @keyframes pulse-dot {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); }
      50% { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
    }
    .fab-txt  { display: flex; flex-direction: column; line-height: 1.2; }
    .fab-name { font-size: 13px; font-weight: 800; color: #1e293b; }
    .fab-sub  { font-size: 10px; color: #3b82f6; font-weight: 500; }
    .fab-badge {
      position: absolute; top: -5px; right: -5px;
      background: #ef4444; color: #fff;
      font-size: 10px; font-weight: 800;
      width: 18px; height: 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Panel ──────────────────────────────────────────────── */
    .n-panel {
      position: fixed; bottom: 90px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column;
      border-radius: 18px;
      background: #ffffff;
      border: 1px solid rgba(59,130,246,.18);
      box-shadow: 0 16px 48px rgba(59,130,246,.18), 0 2px 10px rgba(0,0,0,.08);
      overflow: hidden;
      animation: panel-in .22s ease;
      min-width: 320px; min-height: 360px;
      max-width: 92vw; max-height: 92vh;
    }
    @keyframes panel-in {
      from { opacity:0; transform:translateY(16px) scale(.97); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }

    .resize-h {
      position: absolute; top: 6px; left: 9px;
      font-size: 14px; color: rgba(59,130,246,.3);
      cursor: nw-resize; user-select: none; z-index: 10; transition: color .15s;
    }
    .resize-h:hover { color: rgba(59,130,246,.7); }

    /* ── Header ─────────────────────────────────────────────── */
    .n-header {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 12px 12px 28px;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-bottom: 1px solid rgba(59,130,246,.15);
      flex-shrink: 0;
    }
    .h-avatar-wrap { position: relative; width: 38px; height: 38px; flex-shrink: 0; }
    .h-av {
      width: 38px; height: 38px; border-radius: 50%;
      object-fit: contain; background: #eff6ff; padding: 3px; display: block;
      border: 2px solid rgba(59,130,246,.25); position: relative; z-index: 1;
    }
    .h-aura {
      position: absolute; inset: -4px; border-radius: 50%;
      border: 2px solid rgba(59,130,246,.3);
      animation: aura-spin 6s linear infinite;
    }
    @keyframes aura-spin { to { transform: rotate(360deg); } }

    .h-info { flex: 1; min-width: 0; }
    .h-info strong { display: block; color: #1e293b; font-size: 13px; font-weight: 800; }
    .h-status { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #3b82f6; }
    .h-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }

    .h-actions { display: flex; align-items: center; gap: 2px; }
    .h-btn {
      background: none; border: none; color: #64748b;
      font-size: 14px; cursor: pointer; padding: 6px;
      border-radius: 8px; transition: background .15s, color .15s;
      line-height: 1; display: flex; align-items: center;
    }
    .h-btn:hover { background: rgba(59,130,246,.1); color: #3b82f6; }
    .h-btn.voice-on { color: #3b82f6; }
    .h-btn.listening { color: #ef4444; animation: mic-pulse 1s infinite; }
    @keyframes mic-pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
    .h-close { font-size: 15px; color: #94a3b8; }
    .h-close:hover { color: #ef4444; background: rgba(239,68,68,.08); }

    /* ── Messages area ──────────────────────────────────────── */
    .n-msgs {
      flex: 1; overflow-y: auto;
      padding: 16px 12px;
      display: flex; flex-direction: column; gap: 12px;
      background: #f8fafc;
      scrollbar-width: thin; scrollbar-color: rgba(59,130,246,.2) transparent;
    }

    /* ── Welcome ────────────────────────────────────────────── */
    .welcome { text-align: center; padding: 12px 8px 4px; }
    .w-av-wrap { position: relative; width: 80px; height: 80px; margin: 0 auto 14px; }
    .w-av {
      width: 80px; height: 80px; border-radius: 50%; display: block;
      background: #eff6ff; border: 3px solid rgba(59,130,246,.2);
      padding: 5px; object-fit: contain; position: relative; z-index: 1;
    }
    .w-aura {
      position: absolute; inset: -6px; border-radius: 50%;
      border: 2px solid rgba(59,130,246,.25);
      animation: aura-spin 8s linear infinite;
    }
    .w-title { color: #1e293b; font-weight: 800; margin: 0 0 6px; font-size: 15px; }
    .w-sub   { color: #64748b; font-size: 11.5px; margin: 0 0 16px; line-height: 1.6; }
    .q-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .q-btn {
      padding: 9px 10px; border-radius: 10px;
      background: #ffffff; border: 1px solid rgba(59,130,246,.22);
      color: #1d4ed8; font-size: 11px; cursor: pointer;
      text-align: left; transition: background .15s, border-color .15s;
      line-height: 1.4; font-weight: 500;
      box-shadow: 0 1px 3px rgba(0,0,0,.05);
    }
    .q-btn:hover { background: #eff6ff; border-color: #3b82f6; }

    /* ── Message bubbles ─────────────────────────────────────── */
    .msg { display: flex; align-items: flex-end; gap: 7px; }
    .mu { flex-direction: row-reverse; }
    .m-av {
      width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
      margin-bottom: 16px; background: #eff6ff;
      border: 2px solid rgba(59,130,246,.15); padding: 2px; object-fit: contain;
    }
    .m-col { display: flex; flex-direction: column; max-width: 82%; }
    .mc-u  { align-items: flex-end; }

    .bubble {
      padding: 10px 13px; border-radius: 15px;
      font-size: 13px; line-height: 1.65; word-break: break-word;
    }
    .bu {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: #fff; border-bottom-right-radius: 4px;
      box-shadow: 0 2px 8px rgba(59,130,246,.3);
    }
    .ba {
      background: #ffffff; color: #1e293b;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(59,130,246,.1);
      box-shadow: 0 1px 5px rgba(0,0,0,.06);
    }
    .ba h2,.ba h3,.ba h4 { color: #1d4ed8; font-weight: 700; margin: 6px 0 3px; }
    .ba strong { color: #1e293b; font-weight: 700; }
    .ba em     { color: #3b82f6; font-style: italic; }
    .ba code   { background: #eff6ff; color: #1d4ed8; padding: 2px 5px; border-radius: 4px; font-size: 11.5px; }
    .ba ul     { margin: 4px 0 4px 16px; }
    .ba li     { margin: 3px 0; color: #374151; }
    .ba hr     { border: none; border-top: 1px solid rgba(59,130,246,.12); margin: 8px 0; }

    .mt  { font-size: 10px; color: #94a3b8; margin-top: 3px; }
    .cur { animation: blink .7s step-end infinite; color: #3b82f6; }
    @keyframes blink { 50% { opacity:0; } }

    /* Thinking bubble */
    .think-bubble { display: flex !important; align-items: center; gap: 10px; padding: 10px 14px !important; }
    .think-dots { display: flex; gap: 4px; align-items: center; }
    .think-dots span {
      width: 7px; height: 7px; border-radius: 50%;
      background: #3b82f6; animation: bounce 1.2s infinite;
    }
    .think-dots span:nth-child(2) { animation-delay: .2s; }
    .think-dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes bounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }
    .think-phrase { font-size: 11px; color: #64748b; font-style: italic; }

    .err-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 7px 11px; border-radius: 9px;
      background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 11.5px;
    }
    .err-bar button { background: none; border: none; color: #dc2626; cursor: pointer; font-size: 14px; }

    /* ── Limit bar ───────────────────────────────────────────── */
    .lbar {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 14px; background: #fffbeb;
      border-top: 1px solid rgba(245,158,11,.18);
      font-size: 11px; color: #92400e; font-weight: 500; flex-shrink: 0;
    }
    .ldot { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }

    /* ── Input ───────────────────────────────────────────────── */
    .n-input {
      padding: 10px 12px;
      border-top: 1px solid rgba(59,130,246,.1);
      background: #ffffff; flex-shrink: 0;
    }
    .listen-bar {
      display: flex; align-items: center; gap: 7px;
      padding: 6px 10px; margin-bottom: 8px; border-radius: 8px;
      background: #fef2f2; border: 1px solid #fecaca;
      font-size: 11px; color: #dc2626; font-weight: 500;
    }
    .listen-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #ef4444;
      animation: mic-pulse 1s infinite; flex-shrink: 0;
    }
    .input-row { display: flex; gap: 7px; }
    .inp {
      flex: 1; padding: 9px 13px; border-radius: 10px;
      background: #f8fafc; border: 1px solid rgba(59,130,246,.22);
      color: #1e293b; font-size: 13px; outline: none;
      transition: border-color .2s, background .2s; font-family: inherit;
    }
    .inp::placeholder { color: #94a3b8; font-size: 12px; }
    .inp:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
    .inp:disabled { opacity: .45; }

    .send-btn {
      width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      border: none; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(59,130,246,.3);
      transition: opacity .15s, transform .15s;
    }
    .send-btn:hover:not(:disabled) { opacity: .88; transform: scale(1.06); }
    .send-btn:disabled { opacity: .3; cursor: not-allowed; }

    .locked {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 9px 12px; background: #f8fafc; border-radius: 10px;
      border: 1px solid rgba(59,130,246,.15); font-size: 12px; color: #64748b; font-weight: 500;
    }
    .new-btn {
      background: #3b82f6; color: #fff; border: none;
      padding: 5px 12px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer;
      transition: background .15s;
    }
    .new-btn:hover { background: #2563eb; }

    @media (max-width: 480px) {
      .n-panel { width: calc(100vw - 16px) !important; right: 8px; bottom: 80px; }
      .n-fab   { right: 10px; bottom: 10px; }
      .q-grid  { grid-template-columns: 1fr; }
    }
  `]
})
export class BenchAgentComponent implements OnInit, AfterViewChecked, OnDestroy {
  agent     = inject(BenchAgentService);
  auth      = inject(AuthService);
  sanitizer = inject(DomSanitizer);

  draft = '';
  unread = signal(0);
  pw = signal(400);
  ph = signal(580);
  voiceEnabled = true;
  listening = false;
  thinkPhrase = 'Analysing your request…';

  private readonly thinkPhrases = [
    'Checking the RAG pipeline…',
    'Analysing your request…',
    'Looking at the data…',
    'Consulting the knowledge base…',
    'Computing match scores…',
  ];

  stars: string[] = [];

  private _lmc = 0;
  private _rs = false;
  private _sx = 0; private _sy = 0; private _sw = 400; private _sh = 580;
  private _om!: (e: MouseEvent) => void;
  private _ou!: () => void;
  private _recognition: any = null;
  private readonly _synth = globalThis.speechSynthesis ?? null;
  private readonly _thinkTimer: any = null;

  @ViewChild('scrollRef') private readonly scrollRef!: ElementRef<HTMLDivElement>;

  ngOnInit() {
    this._buildStars();
    this._initSpeech();
    this.agent.unlock();
  }

  private _buildStars() {
    this.stars = Array.from({ length: 14 }, (_, i) => {
      const x = Math.random() * 100, y = Math.random() * 100;
      const sz = Math.random() * 2.5 + 1;
      const d  = (Math.random() * 3 + 2).toFixed(1);
      const del = (Math.random() * 4).toFixed(1);
      const op  = (Math.random() * 0.25 + 0.1).toFixed(2);
      return `left:${x}%;top:${y}%;--sz:${sz}px;--d:${d}s;--del:${del}s;--op:${op}`;
    });
  }

  private _initSpeech() {
    const SpeechRecognition = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    this._recognition = new SpeechRecognition();
    this._recognition.continuous = false;
    this._recognition.interimResults = true;
    this._recognition.lang = 'en-IN';
    this._recognition.onresult = (e: any) => {
      this.draft = Array.from(e.results).map((r: any) => r[0].transcript).join('');
    };
    this._recognition.onend = () => { this.listening = false; };
    this._recognition.onerror = () => { this.listening = false; };
  }

  toggleListen() {
    if (!this._recognition) return;
    if (this.listening) { this._recognition.stop(); this.listening = false; return; }
    this.draft = '';
    this._recognition.start();
    this.listening = true;
  }

  toggleVoice() { this.voiceEnabled = !this.voiceEnabled; }

  fabAvatar()    { return this.agent.isStreaming() ? 'assets/nova-thinking.svg' : 'assets/nova-happy.svg'; }
  headerAvatar() { return this.agent.isStreaming() ? 'assets/nova-thinking.svg' : 'assets/nova.svg'; }
  msgAvatar(i: number) {
    return ['assets/nova-happy.svg', 'assets/nova.svg', 'assets/nova-thinking.svg', 'assets/nova-wow.svg'][i % 4];
  }

  safe(t: string): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(md(t)); } // NOSONAR

  async send(t: string) {
    if (!t.trim()) return;
    if (this.listening) { this._recognition?.stop(); this.listening = false; }
    this.draft = '';
    this._rotateThinkPhrase();
    await this.agent.chatStream(t);
    if (!this.agent.isOpen()) this.unread.update(n => n + 1);
    // Speak the last agent response
    if (this.voiceEnabled && this._synth) {
      const msgs = this.agent.messages();
      const last = msgs.at(-1);
      if (last?.role === 'agent' && last.content) this._speak(last.content);
    }
  }

  private _speak(text: string) {
    if (!this._synth) return;
    this._synth.cancel();
    const clean = text.replace(/<[^>]+>/g, '').replace(/[*_`#]/g, '').trim();
    if (!clean) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = 'en-IN'; utt.rate = 0.9; utt.pitch = 1.1; utt.volume = 0.9;
    const voices = this._synth.getVoices();
    const female = voices.find(v => v.lang.startsWith('en') && /female|woman|zira|samantha/i.test(v.name));
    if (female) utt.voice = female;
    this._synth.speak(utt);
  }

  private _rotateThinkPhrase() {
    this.thinkPhrase = this.thinkPhrases[Math.floor(Math.random() * this.thinkPhrases.length)];
  }

  async newSession() {
    this._synth?.cancel();
    await this.agent.clearSession();
  }

  rsStart(e: MouseEvent) {
    this._rs = true; this._sx = e.clientX; this._sy = e.clientY;
    this._sw = this.pw(); this._sh = this.ph(); e.preventDefault();
    this._om = (ev) => {
      if (!this._rs) return;
      this.pw.set(Math.max(320, Math.min(720, this._sw + (this._sx - ev.clientX))));
      this.ph.set(Math.max(360, Math.min(880, this._sh + (this._sy - ev.clientY))));
    };
    this._ou = () => {
      this._rs = false;
      globalThis.removeEventListener('mousemove', this._om);
      globalThis.removeEventListener('mouseup', this._ou);
    };
    globalThis.addEventListener('mousemove', this._om);
    globalThis.addEventListener('mouseup', this._ou);
  }

  @HostListener('window:keydown.escape') onEsc() { if (this.agent.isOpen()) this.agent.close(); }

  ngAfterViewChecked() {
    const c = this.agent.messages().length;
    if (c !== this._lmc && this.scrollRef?.nativeElement) {
      this._lmc = c;
      this.scrollRef.nativeElement.scrollTop = this.scrollRef.nativeElement.scrollHeight;
    }
  }

  ngOnDestroy() {
    if (this._om) globalThis.removeEventListener('mousemove', this._om);
    if (this._ou) globalThis.removeEventListener('mouseup', this._ou);
    if (this._thinkTimer) clearInterval(this._thinkTimer);
    this._synth?.cancel();
    this._recognition?.stop();
  }
}
