import {
  Component, inject, signal, ViewChild, ElementRef,
  AfterViewChecked, HostListener, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AstroAgentService } from '../../services/astro-agent.service';
import { AuthService } from '../../services/auth.service';

function _escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  const safe = _escapeHtml(text);
  return safe
    .replace(/\|(.+)\|/g, (_: string, row: string) =>
      row.split('|').map((c: string) => c.trim()).filter(Boolean).join(' · '))
    .replace(/^---+$/gm, '<hr/>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/[*][*](.+?)[*][*]/g, '<strong>$1</strong>')
    .replace(/[*](.+?)[*]/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[- ] (.+)$/gm, '<li>$1</li>')
    .replaceAll(/(<li>[\s\S]*?<\/li>)(\s*(?!<li>))/g, '<ul>$1</ul>$2')
    .replace(/^\d+[.] (.+)$/gm, '<li>$1</li>')
    .replaceAll(/\n\n+/g, '<br/><br/>')
    .replaceAll('\n', '<br/>');
}

@Component({
  selector: 'app-astro-agent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
@if (auth.isLoggedIn()) {

<!-- ── FAB ─────────────────────────────────────── -->
<button class="j-fab" (click)="togglePanel()" [class.open]="agent.isOpen()" aria-label="Ask Jyoti">
  <div class="j-fab-avatar">
    <img src="jyoti-happy.svg" alt="Jyoti"/>
    <span class="j-online"></span>
  </div>
  <div class="j-fab-text">
    <span class="j-fab-name">Jyoti</span>
    <span class="j-fab-sub">Cosmic Guide</span>
  </div>
  @if (unread() > 0 && !agent.isOpen()) {
    <span class="j-badge">{{ unread() }}</span>
  }
</button>

<!-- ── Panel ────────────────────────────────────── -->
@if (agent.isOpen()) {
<div class="j-panel" role="dialog" aria-label="Jyoti AI">

  <!-- Header -->
  <div class="j-header">
    <img src="jyoti-happy.svg" class="j-hdr-avatar" alt="Jyoti"/>
    <div class="j-hdr-info">
      <strong>Jyoti</strong>
      <span>AstroIntel · Spiritual Guide</span>
    </div>
    <button class="j-hdr-btn" (click)="newSession()" title="New session" aria-label="New session">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
    </button>
    <button class="j-hdr-btn j-close" (click)="agent.close()" aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>

  <!-- Messages -->
  <div class="j-messages" #scrollRef>

    @if (!agent.hasMessages()) {
      <div class="j-welcome">
        <img src="jyoti-happy.svg" class="j-welcome-img" alt="Jyoti"/>
        <p class="j-welcome-title">Namaste, I'm Jyoti</p>
        <p class="j-welcome-sub">Your AstroIntel spiritual guide. Ask me anything.</p>
        <div class="j-chips">
          @for (p of quickPrompts; track p) {
            <button class="j-chip" (click)="send(p)">{{ p }}</button>
          }
        </div>
      </div>
    }

    @for (msg of agent.messages(); track $index) {
      <div class="j-msg" [class.j-user]="msg.role==='user'" [class.j-agent]="msg.role==='agent'">
        @if (msg.role === 'agent') {
          <img src="jyoti.svg" class="j-avatar" alt="Jyoti"/>
        }
        <div class="j-col">
          <div class="j-bubble" [class.j-bubble-user]="msg.role==='user'" [class.j-bubble-agent]="msg.role==='agent'">
            @if (msg.role === 'agent') {
              <span [innerHTML]="safeHtml(msg.content)"></span>
              @if (msg.streaming && msg.content) { <span class="j-cursor">▌</span> }
            } @else {
              {{ msg.content }}
            }
          </div>
          <span class="j-time">{{ msg.timestamp | date:'HH:mm' }}</span>
        </div>
      </div>
    }

    <!-- Thinking indicator — shows from send until first token -->
    @if (agent.isThinking()) {
      <div class="j-msg j-agent j-thinking-row">
        <img src="jyoti-thinking.svg" class="j-avatar j-thinking-avatar" alt=""/>
        <div class="j-thinking">
          <span class="j-dot"></span>
          <span class="j-dot"></span>
          <span class="j-dot"></span>
          <span class="j-thinking-text">{{ thinkingPhrase() }}</span>
        </div>
      </div>
    }

    @if (agent.error()) {
      <div class="j-error">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ agent.error() }}
        <button (click)="agent.error.set(null)">✕</button>
      </div>
    }
  </div>

  <!-- Input area -->
  <div class="j-input-wrap">

    <!-- Session limit -->
    @if (agent.isLimited()) {
      <div class="j-limit">
        Session limit reached &nbsp;·&nbsp;
        <button (click)="newSession()">Start new</button>
      </div>
    } @else if (agent.isListening()) {
      <!-- Listening mode -->
      <div class="j-listen-bar">
        <span class="j-listen-wave"><i></i><i></i><i></i><i></i><i></i></span>
        <span class="j-listen-text">{{ agent.interimTranscript() || 'Listening…' }}</span>
        <button class="j-done-btn" (click)="doneListening()">Done</button>
      </div>
    } @else {
      <!-- Normal input -->
      <div class="j-input-row">
        <button class="j-mic"
                (click)="toggleMic()"
                [class.j-mic-active]="agent.isListening()"
                [attr.aria-label]="'Voice input'"
                title="Speak your question">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
          </svg>
        </button>

        <input #inputRef
               class="j-input"
               type="text"
               placeholder="Ask Jyoti…"
               [(ngModel)]="draft"
               (keydown.enter)="send(draft)"
               [disabled]="agent.isStreaming()"
               maxlength="200"
               autocomplete="off"/>

        @if (agent.isSpeaking()) {
          <button class="j-stop" (click)="agent.stopSpeaking()" title="Stop speaking" aria-label="Stop speaking">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        } @else {
          <button class="j-send"
                  (click)="send(draft)"
                  [disabled]="!draft.trim() || agent.isStreaming()"
                  aria-label="Send">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        }
      </div>

      <!-- Voice error -->
      @if (agent.voiceError()) {
        <div class="j-voice-err">
          {{ agent.voiceError() }}
          <button (click)="agent.voiceError.set('')">✕</button>
        </div>
      }
    }
  </div>

</div>
}

} <!-- end auth guard -->
  `,
  styles: [`
    /* ── FAB ──────────────────────────────────────────────── */
    .j-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      display: flex; align-items: center; gap: 9px;
      padding: 7px 14px 7px 7px;
      border-radius: 50px;
      background: #fff;
      border: 1.5px solid rgba(99,102,241,0.25);
      box-shadow: 0 4px 20px rgba(99,102,241,0.18);
      cursor: pointer; transition: transform 0.18s, box-shadow 0.18s;
    }
    .j-fab:hover  { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(99,102,241,0.26); }
    .j-fab.open   { border-color: #6366f1; background: #f5f3ff; }

    .j-fab-avatar { position: relative; width: 38px; height: 38px; flex-shrink: 0; }
    .j-fab-avatar img { width: 38px; height: 38px; border-radius: 50%; object-fit: contain; background: #eef2ff; }
    .j-online {
      position: absolute; bottom: 1px; right: 1px;
      width: 9px; height: 9px; border-radius: 50%;
      background: #10b981; border: 2px solid #fff;
      animation: j-pulse 2s infinite;
    }
    @keyframes j-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
      50%      { box-shadow: 0 0 0 4px rgba(16,185,129,0); }
    }
    .j-fab-text { display: flex; flex-direction: column; line-height: 1.2; }
    .j-fab-name { font-size: 12px; font-weight: 700; color: #1e1b4b; }
    .j-fab-sub  { font-size: 10px; color: #6366f1; }
    .j-badge {
      position: absolute; top: -5px; right: -5px;
      background: #ef4444; color: #fff;
      font-size: 10px; font-weight: 700;
      width: 16px; height: 16px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Panel ─────────────────────────────────────────────── */
    .j-panel {
      position: fixed; bottom: 86px; right: 24px; z-index: 9999;
      width: 360px; height: 540px;
      display: flex; flex-direction: column;
      border-radius: 20px;
      background: #fff;
      border: 1px solid rgba(99,102,241,0.16);
      box-shadow: 0 16px 48px rgba(99,102,241,0.14), 0 2px 8px rgba(0,0,0,0.07);
      overflow: hidden;
      animation: j-up 0.2s cubic-bezier(.16,1,.3,1);
    }
    @keyframes j-up {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to   { opacity: 1; transform: none; }
    }

    /* ── Header ────────────────────────────────────────────── */
    .j-header {
      display: flex; align-items: center; gap: 9px;
      padding: 11px 12px;
      background: linear-gradient(135deg, #eef2ff 0%, #ede9fe 100%);
      border-bottom: 1px solid rgba(99,102,241,0.12);
      flex-shrink: 0;
    }
    .j-hdr-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; border: 2px solid rgba(99,102,241,0.2); }
    .j-hdr-info   { flex: 1; }
    .j-hdr-info strong { display: block; font-size: 13px; font-weight: 700; color: #1e1b4b; }
    .j-hdr-info span   { font-size: 10px; color: #6366f1; }
    .j-hdr-btn {
      width: 28px; height: 28px; border-radius: 8px;
      background: none; border: none; color: #6366f1; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.14s;
    }
    .j-hdr-btn:hover { background: rgba(99,102,241,0.1); }
    .j-close { color: #94a3b8; }
    .j-close:hover { color: #ef4444; background: #fef2f2; }

    /* ── Messages ───────────────────────────────────────────── */
    .j-messages {
      flex: 1; overflow-y: auto;
      padding: 12px 10px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f9fafb;
      scrollbar-width: thin;
      scrollbar-color: rgba(99,102,241,0.2) transparent;
    }

    /* Welcome */
    .j-welcome { text-align: center; padding: 20px 8px 8px; }
    .j-welcome-img {
      width: 72px; height: 72px; border-radius: 50%;
      margin: 0 auto 10px; display: block;
      background: #eef2ff; padding: 4px; object-fit: contain;
      border: 2px solid rgba(99,102,241,0.18);
    }
    .j-welcome-title { font-size: 15px; font-weight: 700; color: #1e1b4b; margin: 0 0 4px; }
    .j-welcome-sub   { font-size: 12px; color: #64748b; margin: 0 0 14px; line-height: 1.5; }
    .j-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
    .j-chip {
      padding: 6px 11px; border-radius: 20px;
      background: #fff; border: 1px solid rgba(99,102,241,0.22);
      color: #4338ca; font-size: 11px; font-weight: 500;
      cursor: pointer; transition: background 0.13s, border-color 0.13s;
      white-space: nowrap;
    }
    .j-chip:hover { background: #eef2ff; border-color: #6366f1; }

    /* Messages */
    .j-msg   { display: flex; align-items: flex-end; gap: 6px; }
    .j-user  { flex-direction: row-reverse; }
    .j-agent { flex-direction: row; }
    .j-avatar {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
      background: #eef2ff; padding: 2px; object-fit: contain;
      border: 1.5px solid rgba(99,102,241,0.14); margin-bottom: 14px;
    }
    .j-col { display: flex; flex-direction: column; max-width: 82%; }
    .j-user .j-col { align-items: flex-end; }

    .j-bubble {
      padding: 9px 12px; border-radius: 14px;
      font-size: 13px; line-height: 1.55; word-break: break-word;
    }
    .j-bubble-user  {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff; border-bottom-right-radius: 3px;
    }
    .j-bubble-agent {
      background: #fff; color: #1e1b4b;
      border: 1px solid rgba(99,102,241,0.11);
      border-bottom-left-radius: 3px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .j-bubble-agent strong { color: #1e1b4b; font-weight: 600; }
    .j-bubble-agent em     { color: #6366f1; font-style: italic; }
    .j-bubble-agent h2,
    .j-bubble-agent h3,
    .j-bubble-agent h4     { color: #4338ca; font-size: 12.5px; font-weight: 700; margin: 6px 0 2px; }
    .j-bubble-agent code   { background: #eef2ff; color: #4338ca; padding: 1px 4px; border-radius: 3px; font-size: 11.5px; }
    .j-bubble-agent ul     { margin: 3px 0 3px 14px; padding: 0; }
    .j-bubble-agent li     { margin: 2px 0; }

    .j-time   { font-size: 10px; color: #94a3b8; margin-top: 2px; }
    .j-cursor { animation: j-blink 0.7s step-end infinite; color: #6366f1; }
    @keyframes j-blink { 50% { opacity: 0; } }

    /* Thinking */
    .j-thinking-row { align-items: center; }
    .j-thinking-avatar { animation: j-avatar-pulse 1.8s ease-in-out infinite; }
    @keyframes j-avatar-pulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.65; }
    }
    .j-thinking {
      display: flex; align-items: center; gap: 6px;
      padding: 9px 13px;
      background: linear-gradient(135deg, #f5f3ff, #ede9fe);
      border: 1px solid rgba(99,102,241,0.15);
      border-radius: 14px; border-bottom-left-radius: 3px;
    }
    .j-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: #7c3aed; flex-shrink: 0;
      animation: j-bounce 1.1s infinite;
    }
    .j-dot:nth-child(2) { animation-delay: 0.16s; }
    .j-dot:nth-child(3) { animation-delay: 0.32s; }
    @keyframes j-bounce {
      0%,80%,100% { transform: translateY(0); }
      40%          { transform: translateY(-5px); }
    }
    .j-thinking-text {
      font-size: 11.5px; color: #6d28d9; font-style: italic;
      animation: j-fade 0.4s ease;
    }
    @keyframes j-fade { from { opacity: 0; } to { opacity: 1; } }

    /* Error */
    .j-error {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 10px; border-radius: 8px;
      background: #fef2f2; border: 1px solid #fecaca;
      color: #dc2626; font-size: 11.5px;
    }
    .j-error button { margin-left: auto; background: none; border: none; color: #dc2626; cursor: pointer; }

    /* ── Input ─────────────────────────────────────────────── */
    .j-input-wrap {
      padding: 8px 10px;
      border-top: 1px solid rgba(99,102,241,0.1);
      background: #fff; flex-shrink: 0;
    }
    .j-input-row { display: flex; gap: 6px; align-items: center; }

    .j-input {
      flex: 1; padding: 8px 12px;
      border-radius: 10px;
      background: #f8faff;
      border: 1px solid rgba(99,102,241,0.2);
      color: #1e1b4b; font-size: 13px;
      outline: none; font-family: inherit;
      transition: border-color 0.15s, background 0.15s;
    }
    .j-input::placeholder { color: #94a3b8; }
    .j-input:focus { border-color: #6366f1; background: #fff; }
    .j-input:disabled { opacity: 0.4; }

    .j-mic {
      width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px;
      background: #f1f5f9; border: 1.5px solid rgba(99,102,241,0.18);
      color: #6366f1; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.14s, transform 0.14s;
    }
    .j-mic:hover { background: #e0e7ff; transform: scale(1.06); }
    .j-mic-active {
      background: #ef4444; border-color: #ef4444; color: #fff;
      animation: j-mic-pulse 1.2s infinite;
    }
    @keyframes j-mic-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }

    .j-send {
      width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      border: none; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.14s, transform 0.14s;
    }
    .j-send:hover:not(:disabled) { opacity: 0.88; transform: scale(1.06); }
    .j-send:disabled { opacity: 0.28; cursor: not-allowed; }

    .j-stop {
      width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px;
      background: #fef2f2; border: 1.5px solid #fca5a5;
      color: #dc2626; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      animation: j-speak-pulse 1.4s infinite;
    }
    @keyframes j-speak-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
      50%      { box-shadow: 0 0 0 4px rgba(220,38,38,0); }
    }

    /* Listening bar */
    .j-listen-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px;
      background: linear-gradient(135deg, #fdf4ff, #ede9fe);
      border: 1.5px solid rgba(139,92,246,0.3);
      border-radius: 12px;
    }
    .j-listen-wave { display: flex; gap: 2px; align-items: center; height: 18px; flex-shrink: 0; }
    .j-listen-wave i {
      display: block; width: 3px; border-radius: 2px;
      background: #7c3aed; animation: j-wave 0.6s ease-in-out infinite;
    }
    .j-listen-wave i:nth-child(1) { height: 5px; }
    .j-listen-wave i:nth-child(2) { height: 12px; animation-delay: 0.1s; }
    .j-listen-wave i:nth-child(3) { height: 18px; animation-delay: 0.2s; }
    .j-listen-wave i:nth-child(4) { height: 10px; animation-delay: 0.3s; }
    .j-listen-wave i:nth-child(5) { height: 6px;  animation-delay: 0.4s; }
    @keyframes j-wave {
      0%,100% { transform: scaleY(0.5); opacity: 0.7; }
      50%      { transform: scaleY(1.3); opacity: 1; }
    }
    .j-listen-text {
      flex: 1; font-size: 12px; color: #4c1d95;
      font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .j-done-btn {
      padding: 4px 12px; border-radius: 7px;
      background: #7c3aed; color: #fff;
      border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; flex-shrink: 0;
    }
    .j-done-btn:hover { opacity: 0.88; }

    /* Voice error */
    .j-voice-err {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 5px; padding: 5px 8px; border-radius: 7px;
      background: #fff7ed; border: 1px solid rgba(249,115,22,0.2);
      font-size: 11px; color: #92400e;
    }
    .j-voice-err button { background: none; border: none; color: #c2410c; cursor: pointer; font-size: 12px; }

    /* Session limit */
    .j-limit {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 12px;
      background: #fef2f2; border-radius: 10px; border: 1px solid #fecaca;
      font-size: 12px; color: #dc2626; font-weight: 600;
    }
    .j-limit button {
      background: #dc2626; color: #fff; border: none;
      padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;
    }

    /* Mobile */
    @media (max-width: 480px) {
      .j-panel { width: calc(100vw - 16px); right: 8px; bottom: 76px; height: 70vh; }
      .j-fab   { right: 10px; bottom: 10px; }
      .j-chips { flex-direction: column; }
    }
  `]
})
export class AstroAgentComponent implements AfterViewChecked, OnDestroy {
  agent     = inject(AstroAgentService);
  auth      = inject(AuthService);
  sanitizer = inject(DomSanitizer);

  draft  = '';
  unread = signal(0);

  private readonly _THINKING = [
    'Consulting the stars…',
    'Reading cosmic patterns…',
    'Checking planetary positions…',
    'Tuning into your energy…',
    'The universe is speaking…',
    'Feeling the vibration…',
  ];
  thinkingPhrase = signal(this._THINKING[0]);
  private _thinkingTimer: ReturnType<typeof setInterval> | null = null;
  private _thinkingIdx = 0;

  private _startThinking() {
    this._thinkingIdx = 0;
    this.thinkingPhrase.set(this._THINKING[0]);
    this._thinkingTimer = setInterval(() => {
      this._thinkingIdx = (this._thinkingIdx + 1) % this._THINKING.length;
      this.thinkingPhrase.set(this._THINKING[this._thinkingIdx]);
    }, 2000);
  }
  private _stopThinking() {
    if (this._thinkingTimer) { clearInterval(this._thinkingTimer); this._thinkingTimer = null; }
  }

  private _lastMsgCount = 0;

  @ViewChild('scrollRef') private readonly scrollRef!: ElementRef<HTMLDivElement>;

  // No emoji in quick prompts — TTS reads them as words
  readonly quickPrompts = [
    'How is my day today?',
    'What is my Life Path number?',
    'What does Heart Line mean?',
    'Tell me about Vastu Shastra',
    'What is Aries compatibility?',
    'What do remedies include?',
  ];

  safeHtml(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(text)); // NOSONAR
  }

  togglePanel() {
    if (!this.agent.isOpen()) this.unread.set(0);
    this.agent.toggle();
  }

  async newSession() { await this.agent.clearSession(); }

  async send(text: string) {
    if (!text.trim() || this.agent.isStreaming()) return;
    this.draft = '';
    this._startThinking();
    try {
      await this.agent.chatStream(text);
    } finally {
      this._stopThinking();
    }
    const last = this.agent.lastMessage();
    if (last?.role === 'agent' && last.content) this.agent.speak(last.content);
    if (!this.agent.isOpen()) this.unread.update(n => n + 1);
  }

  async toggleMic() {
    if (!this.agent.voiceSupported()) {
      this.agent.voiceError.set('Voice needs Chrome or Edge.');
      return;
    }
    try {
      const transcript = await this.agent.startListening();
      if (transcript) await this.send(transcript);
    } catch { /* voiceError set in service */ }
  }

  async doneListening() { this.agent.stopListening(); }

  @HostListener('window:keydown.escape')
  onEsc() { if (this.agent.isOpen()) this.agent.close(); }

  ngAfterViewChecked() {
    const count = this.agent.messages().length;
    if (count !== this._lastMsgCount && this.scrollRef?.nativeElement) {
      this._lastMsgCount = count;
      this.scrollRef.nativeElement.scrollTop = this.scrollRef.nativeElement.scrollHeight;
    }
  }

  ngOnDestroy() {
    this._stopThinking();
    this.agent.stopListening();
    this.agent.stopSpeaking();
  }
}
