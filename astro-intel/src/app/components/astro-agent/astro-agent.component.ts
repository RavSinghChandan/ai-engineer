import {
  Component, inject, signal, ViewChild, ElementRef,
  AfterViewChecked, HostListener, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AstroAgentService } from '../../services/astro-agent.service';
import { AuthService } from '../../services/auth.service';

/** Convert markdown text from the LLM into safe readable HTML */
// BUG FIX: LLM output was injected into HTML tags without escaping — a jailbroken or
// compromised response containing <script>, onerror=, href=javascript: would execute.
// Fix: escape HTML entities FIRST, then apply markdown patterns to the safe text.
function _escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  const safe = _escapeHtml(text);
  return safe
    .replace(/\|(.+)\|/g, (_: string, row: string) =>
      row.split('|').map((c: string) => c.trim()).filter(Boolean).join(' · ')
    )
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
    <!-- Only render for logged-in users -->
    @if (auth.isLoggedIn()) {

    <!-- FAB -->
    <button class="aarav-fab" (click)="togglePanel()" [class.open]="agent.isOpen()" aria-label="Ask Jyoti">
      <div class="fab-avatar-wrap">
        <img src="jyoti-happy.svg" class="fab-avatar" alt="Jyoti"/>
        <span class="fab-pulse"></span>
      </div>
      <div class="fab-text">
        <span class="fab-name">Jyoti</span>
        <span class="fab-sub">Cosmic Guide · Ask me!</span>
      </div>
      @if (unread() > 0 && !agent.isOpen()) {
        <span class="fab-badge">{{ unread() }}</span>
      }
    </button>

    <!-- Panel -->
    @if (agent.isOpen()) {
      <div class="aarav-panel"
           [style.width.px]="panelW()"
           [style.height.px]="panelH()"
           role="dialog"
           aria-label="Aarav AI Assistant">

        <!-- Resize handle (top-left) -->
        <div class="resize-handle" (mousedown)="resizeStart($event)" title="Drag to resize">⤡</div>

        <!-- Header -->
        <div class="panel-header">
          <img src="jyoti-happy.svg" class="header-avatar" alt="Jyoti"/>
          <div class="header-info">
            <strong>Jyoti</strong>
            <span>AstroIntel AI · Always on ✦</span>
          </div>
          <button class="hdr-btn" (click)="newSession()" title="New conversation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <button class="hdr-btn hdr-close" (click)="agent.close()" aria-label="Close">✕</button>
        </div>

        <!-- Messages -->
        <div class="panel-messages" #scrollRef>

          @if (!agent.hasMessages()) {
            <div class="welcome">
              <img src="jyoti-happy.svg" class="welcome-avatar" alt="Jyoti"/>
              <p class="welcome-title">Namaste! I'm Jyoti 🙏</p>
              <p class="welcome-sub">Your AI guide for AstroIntel 360°. Ask me about your reading, the platform, or any spiritual concept.</p>
              <div class="quick-grid">
                @for (p of quickPrompts; track p) {
                  <button class="quick-btn" (click)="send(p)">{{ p }}</button>
                }
              </div>
            </div>
          }

          @for (msg of agent.messages(); track $index) {
            <div class="msg" [class.msg-user]="msg.role==='user'" [class.msg-agent]="msg.role==='agent'">
              @if (msg.role === 'agent') {
                <img [src]="agentAvatar($index)" class="msg-avatar" alt="Jyoti"/>
              }
              <div class="msg-col">
                <div class="msg-bubble"
                     [class.bubble-user]="msg.role==='user'"
                     [class.bubble-agent]="msg.role==='agent'">
                  @if (msg.role === 'agent') {
                    <span class="bubble-html" [innerHTML]="safeHtml(msg.content)"></span>
                    @if (msg.streaming) { <span class="cursor-blink">▌</span> }
                  } @else {
                    {{ msg.content }}
                  }
                </div>
                <span class="msg-time">{{ msg.timestamp | date:'HH:mm' }}</span>
              </div>
            </div>
          }

          @if (agent.isThinking()) {
            <div class="msg msg-agent thinking-row">
              <img src="jyoti-thinking.svg" class="msg-avatar thinking-avatar" alt="Jyoti thinking"/>
              <div class="thinking-bubble">
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
                <span class="thinking-phrase">{{ thinkingPhrase() }}</span>
              </div>
            </div>
          }

          @if (agent.error()) {
            <div class="error-bar">⚠️ {{ agent.error() }}
              <button (click)="agent.error.set(null)">✕</button>
            </div>
          }

        </div>

        <!-- Rate limit bar -->
        @if (agent.qCount() > 0 && !agent.isLimited()) {
          <div class="limit-bar">
            <span class="limit-dot"></span>
            {{ agent.qRemaining() }} question{{ agent.qRemaining() === 1 ? '' : 's' }} remaining this session
          </div>
        }

        <!-- Voice error toast -->
        @if (agent.voiceError()) {
          <div class="voice-error-bar">
            🎙️ {{ agent.voiceError() }}
            <button (click)="agent.voiceError.set('')">✕</button>
          </div>
        }

        <!-- Input row -->
        <div class="panel-input">
          @if (agent.isLimited()) {
            <div class="limit-locked">
              🔒 Session limit reached &nbsp;·&nbsp;
              <button class="limit-new-btn" (click)="newSession()">Start new session</button>
            </div>
          } @else {
            @if (agent.isListening()) {
              <!-- LISTENING MODE: full-width voice bar with live transcript + Done button -->
              <div class="voice-bar">
                <span class="voice-bar-wave"><i></i><i></i><i></i><i></i><i></i></span>
                <span class="voice-bar-text">
                  {{ agent.interimTranscript() || 'Listening… speak your question' }}
                </span>
                <button class="voice-done-btn" (click)="doneListening()" title="Done — send">
                  Done
                </button>
              </div>
            } @else {
              <!-- NORMAL MODE: mic + input + send/stop -->
              <button class="mic-btn"
                      (click)="toggleMic()"
                      [disabled]="agent.isLoading() || agent.isStreaming()"
                      [title]="agent.voiceSupported() ? 'Speak your question' : 'Voice not supported in this browser'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                  <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
                </svg>
              </button>

              <input
                #inputRef
                class="chat-input"
                type="text"
                [placeholder]="'Ask about your reading… (' + agent.qRemaining() + ' left)'"
                [(ngModel)]="draft"
                (keydown.enter)="send(draft)"
                [disabled]="agent.isLoading() || agent.isStreaming()"
                maxlength="500"
              />

              @if (agent.isSpeaking()) {
                <button class="stop-speak-btn" (click)="agent.stopSpeaking()" title="Stop speaking">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                  </svg>
                </button>
              } @else {
                <button class="send-btn"
                        (click)="send(draft)"
                        [disabled]="!draft.trim() || agent.isLoading() || agent.isStreaming()"
                        aria-label="Send">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              }
            }
          }
        </div>
      </div>
    }

    } <!-- end @if (auth.isLoggedIn()) -->
  `,
  styles: [`
    /* ── FAB — light theme ────────────────────────────────── */
    .aarav-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px 8px 8px;
      border-radius: 50px;
      background: #ffffff;
      border: 1.5px solid rgba(99,102,241,0.3);
      color: #1a2540;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(99,102,241,0.2), 0 1px 4px rgba(0,0,0,0.08);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .aarav-fab:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.3); }
    .aarav-fab.open  { background: #eef2ff; border-color: #6366f1; }

    .fab-avatar-wrap { position: relative; width: 40px; height: 40px; flex-shrink: 0; }
    .fab-avatar      { width: 40px; height: 40px; border-radius: 50%; object-fit: contain; background: #f0f7ff; padding: 2px; }
    .fab-pulse {
      position: absolute; bottom: 0; right: 0;
      width: 11px; height: 11px; border-radius: 50%;
      background: #10b981;
      border: 2px solid #fff;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
      50%      { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
    }
    .fab-text   { display: flex; flex-direction: column; line-height: 1.2; }
    .fab-name   { font-size: 13px; font-weight: 800; color: #1a2540; }
    .fab-sub    { font-size: 10px; color: #6366f1; }
    .fab-badge  {
      position: absolute; top: -6px; right: -6px;
      background: #ef4444; color: #fff;
      font-size: 10px; font-weight: 800;
      width: 18px; height: 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Panel — LIGHT THEME matching AstroIntel (#f0f7ff) ── */
    .aarav-panel {
      position: fixed;
      bottom: 90px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      border-radius: 18px;
      background: #ffffff;
      border: 1px solid rgba(99,102,241,0.2);
      box-shadow: 0 12px 40px rgba(99,102,241,0.15), 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
      animation: slideUp 0.22s ease;
      min-width: 300px; min-height: 340px;
      max-width: 90vw;  max-height: 90vh;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Resize handle */
    .resize-handle {
      position: absolute;
      top: 6px; left: 8px;
      font-size: 14px;
      color: rgba(99,102,241,0.35);
      cursor: nw-resize;
      user-select: none;
      z-index: 10;
      line-height: 1;
      transition: color 0.15s;
    }
    .resize-handle:hover { color: rgba(99,102,241,0.8); }

    /* ── Header ───────────────────────────────────────────── */
    .panel-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px 12px 28px;
      background: linear-gradient(135deg, #f0f7ff, #ede9fe);
      border-bottom: 1px solid rgba(99,102,241,0.15);
      flex-shrink: 0;
    }
    .header-avatar { width: 36px; height: 36px; border-radius: 50%; background: #f5f3ff; flex-shrink: 0; border: 2px solid rgba(99,102,241,0.2); }
    .header-info   { flex: 1; }
    .header-info strong { display: block; color: #1a2540; font-size: 13px; font-weight: 800; }
    .header-info span   { color: #6366f1; font-size: 10px; }
    .hdr-btn {
      background: none; border: none; color: #6366f1;
      font-size: 14px; cursor: pointer; padding: 5px 7px;
      border-radius: 7px; transition: background 0.15s, color 0.15s;
      line-height: 1; display: flex; align-items: center;
    }
    .hdr-btn:hover   { background: rgba(99,102,241,0.1); color: #4f46e5; }
    .hdr-close { font-size: 16px; }

    /* ── Messages ─────────────────────────────────────────── */
    .panel-messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8faff;
      scrollbar-width: thin;
      scrollbar-color: rgba(99,102,241,0.25) transparent;
    }

    /* Welcome */
    .welcome        { text-align: center; padding: 16px 8px 8px; }
    .welcome-avatar {
      width: 80px; height: 80px;
      margin: 0 auto 12px;
      display: block;
      border-radius: 50%;
      background: #f0f7ff;
      border: 3px solid rgba(99,102,241,0.2);
      padding: 4px;
      object-fit: contain;
    }
    .welcome-title  { color: #1a2540; font-weight: 800; margin: 0 0 5px; font-size: 15px; }
    .welcome-sub    { color: #64748b; font-size: 11.5px; margin: 0 0 14px; line-height: 1.6; }
    .quick-grid     { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .quick-btn {
      padding: 8px 10px;
      border-radius: 10px;
      background: #ffffff;
      border: 1px solid rgba(99,102,241,0.25);
      color: #4338ca; font-size: 11px;
      cursor: pointer; text-align: left;
      transition: background 0.15s, border-color 0.15s;
      line-height: 1.35; font-weight: 500;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .quick-btn:hover { background: #eef2ff; border-color: #6366f1; }

    /* Message rows */
    .msg        { display: flex; align-items: flex-end; gap: 7px; }
    .msg-user   { flex-direction: row-reverse; }
    .msg-agent  { flex-direction: row; }
    .msg-avatar {
      width: 30px; height: 30px;
      border-radius: 50%; flex-shrink: 0;
      margin-bottom: 16px;
      background: #f0f7ff;
      border: 2px solid rgba(99,102,241,0.15);
      padding: 2px;
      object-fit: contain;
    }

    .msg-col    { display: flex; flex-direction: column; max-width: 80%; }
    .msg-user .msg-col { align-items: flex-end; }

    .msg-bubble {
      padding: 10px 13px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.6;
      word-break: break-word;
    }
    .bubble-user  {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .bubble-agent {
      background: #ffffff;
      color: #1a2540;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(99,102,241,0.12);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    /* Rendered markdown inside agent bubbles */
    .bubble-html { display: block; }
    .bubble-html h2 { color: #4338ca; font-size: 13px; font-weight: 800; margin: 8px 0 4px; }
    .bubble-html h3 { color: #4338ca; font-size: 12.5px; font-weight: 700; margin: 6px 0 3px; }
    .bubble-html h4 { color: #6366f1; font-size: 12px; font-weight: 700; margin: 4px 0 2px; }
    .bubble-html strong { color: #1a2540; font-weight: 700; }
    .bubble-html em { color: #6366f1; font-style: italic; }
    .bubble-html code {
      background: #eef2ff; color: #4338ca;
      padding: 1px 5px; border-radius: 4px; font-size: 11.5px;
    }
    .bubble-html ul { margin: 4px 0 4px 16px; padding: 0; }
    .bubble-html li { margin: 3px 0; color: #374151; }
    .bubble-html hr { border: none; border-top: 1px solid rgba(99,102,241,0.15); margin: 8px 0; }

    .msg-time { font-size: 10px; color: #94a3b8; margin-top: 3px; }

    /* Typing */
    .typing { display: flex !important; gap: 5px; align-items: center; padding: 12px 16px !important; }
    .typing span {
      width: 7px; height: 7px; border-radius: 50%;
      background: #6366f1; animation: bounce 1.2s infinite;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%,80%,100% { transform: translateY(0); }
      40%          { transform: translateY(-6px); }
    }

    /* ── Thinking bubble (rotating phrase) ───────────────── */
    .thinking-row { align-items: center; }
    .thinking-avatar { animation: avatar-pulse 2s ease-in-out infinite; }
    @keyframes avatar-pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.75; transform: scale(1.06); }
    }
    .thinking-bubble {
      display: flex; align-items: center; gap: 7px;
      padding: 10px 14px;
      background: linear-gradient(135deg, #f5f3ff, #ede9fe);
      border: 1px solid rgba(99,102,241,0.18);
      border-radius: 14px; border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(99,102,241,0.1);
    }
    .thinking-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #7c3aed; flex-shrink: 0;
      animation: bounce 1.1s infinite;
    }
    .thinking-dot:nth-child(2) { animation-delay: 0.18s; }
    .thinking-dot:nth-child(3) { animation-delay: 0.36s; }
    .thinking-phrase {
      font-size: 12px; color: #5b21b6; font-style: italic;
      animation: phrase-fade 0.5s ease-in-out;
      white-space: nowrap;
    }
    @keyframes phrase-fade {
      from { opacity: 0; transform: translateX(4px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    .cursor-blink { animation: blink 0.7s step-end infinite; color: #6366f1; margin-left: 1px; }
    @keyframes blink { 50% { opacity: 0; } }

    .error-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 7px 11px; border-radius: 8px;
      background: #fef2f2; border: 1px solid #fecaca;
      color: #dc2626; font-size: 11.5px;
    }
    .error-bar button { background: none; border: none; color: #dc2626; cursor: pointer; font-size: 13px; }

    /* ── Input ────────────────────────────────────────────── */
    .panel-input {
      display: flex; gap: 7px;
      padding: 10px 12px;
      border-top: 1px solid rgba(99,102,241,0.12);
      background: #ffffff;
      flex-shrink: 0;
    }
    .chat-input {
      flex: 1; padding: 9px 13px;
      border-radius: 10px;
      background: #f8faff;
      border: 1px solid rgba(99,102,241,0.25);
      color: #1a2540; font-size: 13px;
      outline: none; transition: border-color 0.2s;
      font-family: inherit;
    }
    .chat-input::placeholder { color: #94a3b8; }
    .chat-input:focus { border-color: #6366f1; background: #fff; }
    .chat-input:disabled { opacity: 0.45; }

    .send-btn {
      width: 38px; height: 38px; flex-shrink: 0;
      border-radius: 10px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      border: none; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.15s, transform 0.15s;
    }
    .send-btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.07); }
    .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

    /* ── Voice: mic button ───────────────────────────────── */
    .mic-btn {
      width: 38px; height: 38px; flex-shrink: 0;
      border-radius: 10px;
      background: #f1f5f9;
      border: 1.5px solid rgba(99,102,241,0.2);
      color: #6366f1; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, border-color 0.15s, transform 0.15s;
    }
    .mic-btn:hover:not(:disabled) { background: #e0e7ff; border-color: #6366f1; transform: scale(1.07); }
    .mic-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .mic-btn.mic-listening {
      background: linear-gradient(135deg, #dc2626, #ef4444);
      border-color: #dc2626; color: #fff;
      animation: mic-pulse 1.2s ease-in-out infinite;
    }
    @keyframes mic-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); }
      50%      { box-shadow: 0 0 0 7px rgba(220,38,38,0); }
    }

    /* Waveform bars inside mic button while recording */
    .mic-wave { display: flex; gap: 2px; align-items: center; height: 16px; }
    .mic-wave i {
      display: block; width: 3px; border-radius: 2px;
      background: #fff; animation: wave-bar 0.7s ease-in-out infinite;
    }
    .mic-wave i:nth-child(1) { height: 6px;  animation-delay: 0s; }
    .mic-wave i:nth-child(2) { height: 12px; animation-delay: 0.15s; }
    .mic-wave i:nth-child(3) { height: 7px;  animation-delay: 0.3s; }
    @keyframes wave-bar {
      0%,100% { transform: scaleY(0.6); }
      50%      { transform: scaleY(1.3); }
    }

    /* Stop-speaking button */
    .stop-speak-btn {
      width: 38px; height: 38px; flex-shrink: 0;
      border-radius: 10px;
      background: #fef2f2; border: 1.5px solid #fca5a5;
      color: #dc2626; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; animation: speak-pulse 1.4s ease-in-out infinite;
    }
    .stop-speak-btn:hover { background: #fee2e2; }
    @keyframes speak-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
      50%      { box-shadow: 0 0 0 5px rgba(220,38,38,0); }
    }

    /* ── Voice bar (listening mode — replaces input row) ────── */
    .voice-bar {
      display: flex; align-items: center; gap: 8px;
      flex: 1; padding: 6px 8px 6px 10px;
      background: linear-gradient(135deg, #fdf4ff, #ede9fe);
      border: 1.5px solid rgba(139,92,246,0.35);
      border-radius: 12px; overflow: hidden;
    }
    .voice-bar-wave {
      display: flex; gap: 2px; align-items: center;
      height: 20px; flex-shrink: 0;
    }
    .voice-bar-wave i {
      display: block; width: 3px; border-radius: 2px;
      background: #7c3aed; animation: wave-bar 0.6s ease-in-out infinite;
    }
    .voice-bar-wave i:nth-child(1) { height: 5px;  animation-delay: 0s; }
    .voice-bar-wave i:nth-child(2) { height: 12px; animation-delay: 0.1s; }
    .voice-bar-wave i:nth-child(3) { height: 18px; animation-delay: 0.2s; }
    .voice-bar-wave i:nth-child(4) { height: 10px; animation-delay: 0.3s; }
    .voice-bar-wave i:nth-child(5) { height: 6px;  animation-delay: 0.4s; }
    @keyframes wave-bar {
      0%,100% { transform: scaleY(0.5); opacity: 0.7; }
      50%      { transform: scaleY(1.3); opacity: 1; }
    }
    .voice-bar-text {
      flex: 1; font-size: 12.5px; color: #4c1d95;
      font-style: italic; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .voice-done-btn {
      flex-shrink: 0;
      padding: 5px 13px; border-radius: 8px;
      background: #7c3aed; color: #fff;
      border: none; font-size: 12px; font-weight: 700;
      cursor: pointer; transition: opacity 0.15s;
      white-space: nowrap;
    }
    .voice-done-btn:hover { opacity: 0.85; }

    /* Voice error toast */
    .voice-error-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 6px 12px; font-size: 11.5px; color: #7c2d12;
      background: #fff7ed; border-top: 1px solid rgba(249,115,22,0.2); flex-shrink: 0;
    }
    .voice-error-bar button { background: none; border: none; color: #c2410c; cursor: pointer; font-size: 13px; }

    /* Rate limit bar */
    .limit-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 14px;
      background: #fffbeb;
      border-top: 1px solid rgba(245,158,11,0.2);
      font-size: 11px; color: #92400e; font-weight: 500;
      flex-shrink: 0;
    }
    .limit-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #f59e0b; flex-shrink: 0;
    }

    /* Locked state */
    .limit-locked {
      flex: 1; display: flex; align-items: center; justify-content: center;
      gap: 6px; padding: 8px 12px;
      background: #fef2f2;
      border-radius: 10px; border: 1px solid #fecaca;
      font-size: 12px; color: #dc2626; font-weight: 600;
    }
    .limit-new-btn {
      background: #dc2626; color: #fff; border: none;
      padding: 4px 10px; border-radius: 6px;
      font-size: 11px; font-weight: 700; cursor: pointer;
      transition: opacity 0.15s;
    }
    .limit-new-btn:hover { opacity: 0.85; }

    /* Mobile */
    @media (max-width: 480px) {
      .aarav-panel { width: calc(100vw - 20px) !important; right: 10px; bottom: 80px; }
      .aarav-fab   { right: 10px; bottom: 10px; padding: 8px 12px 8px 8px; }
      .quick-grid  { grid-template-columns: 1fr; }
    }
  `]
})
export class AstroAgentComponent implements AfterViewChecked, OnDestroy {
  agent     = inject(AstroAgentService);
  auth      = inject(AuthService);
  sanitizer = inject(DomSanitizer);

  draft    = '';
  unread   = signal(0);
  panelW   = signal(390);
  panelH   = signal(560);

  // Rotating thinking phrases — so the wait never feels like dead silence
  private readonly _THINKING = [
    'Consulting the stars…',
    'Reading the cosmic patterns…',
    'Checking planetary positions…',
    'Feeling the energy…',
    'The universe is speaking…',
    'Tuning into your vibration…',
    'Scanning the celestial map…',
    'Listening to the cosmos…',
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
  private _resizing = false;
  private _startX = 0; private _startY = 0;
  private _startW = 390; private _startH = 560;
  private _onMove!: (e: MouseEvent) => void;
  private _onUp!: () => void;

  @ViewChild('scrollRef') private readonly scrollRef!: ElementRef<HTMLDivElement>;

  readonly quickPrompts = [
    '🪐 What does HIGH confidence mean?',
    '🔢 Explain my Life Path number',
    '✋ What does my Heart Line mean?',
    '🃏 How to read a 3-card spread?',
    '🏠 What is Vastu Shastra?',
    '💊 What remedies does the report give?',
  ];

  /** Alternate avatar based on message index */
  agentAvatar(index: number): string {
    const avatars = ['jyoti-happy.svg', 'jyoti.svg', 'jyoti-thinking.svg', 'jyoti-wow.svg'];
    return ['jyoti-happy.svg','jyoti.svg','jyoti-thinking.svg','jyoti-wow.svg'][index % 4];
  }

  // Safe: renderMarkdown output is generated from hardcoded patterns applied
  // to LLM text — no user-controlled HTML tags pass through
  safeHtml(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(text)); // NOSONAR
  }

  togglePanel() {
    if (!this.agent.isOpen()) this.unread.set(0);
    this.agent.toggle();
  }

  async newSession() {
    await this.agent.clearSession();
    // clearSession resets messages — welcome screen shows automatically
  }

  async send(text: string) {
    if (!text.trim()) return;
    this.draft = '';
    this._startThinking();
    try {
      await this.agent.chatStream(text);
    } finally {
      this._stopThinking();
      // isThinking is cleared by the service, but make sure phrase timer stops
    }
    // Auto-speak the last agent reply if TTS is available
    const last = this.agent.lastMessage();
    if (last?.role === 'agent' && last.content) this.agent.speak(last.content);
    if (!this.agent.isOpen()) this.unread.update(n => n + 1);
  }

  private _listenResolve: ((t: string) => void) | null = null;

  async toggleMic() {
    if (!this.agent.voiceSupported()) {
      this.agent.voiceError.set('Voice not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    // Start continuous listening — promise resolves when user taps Done
    try {
      const transcript = await this.agent.startListening();
      if (transcript) {
        this.draft = transcript;
        await this.send(transcript);
      }
    } catch {
      // voiceError signal already set inside the service
    }
  }

  /** User taps Done — stops mic, sends whatever was captured */
  async doneListening() {
    this.agent.stopListening();
    // stopListening triggers onend → resolves the promise in startListening
    // Give onend a tick to fire and set the draft via the promise chain above
  }

  // ── Resize ──────────────────────────────────────────────────────────────────

  resizeStart(e: MouseEvent) {
    this._resizing = true;
    this._startX = e.clientX; this._startY = e.clientY;
    this._startW = this.panelW(); this._startH = this.panelH();
    e.preventDefault();

    this._onMove = (ev: MouseEvent) => {
      if (!this._resizing) return;
      const dw = this._startX - ev.clientX;
      const dh = this._startY - ev.clientY;
      this.panelW.set(Math.max(300, Math.min(700, this._startW + dw)));
      this.panelH.set(Math.max(340, Math.min(860, this._startH + dh)));
    };
    this._onUp = () => {
      this._resizing = false;
      globalThis.removeEventListener('mousemove', this._onMove);
      globalThis.removeEventListener('mouseup', this._onUp);
    };
    globalThis.addEventListener('mousemove', this._onMove);
    globalThis.addEventListener('mouseup', this._onUp);
  }

  @HostListener('window:keydown.escape')
  onEsc() { if (this.agent.isOpen()) this.agent.close(); }

  ngAfterViewChecked() {
    const count = this.agent.messages().length;
    if (count !== this._lastMsgCount && this.scrollRef?.nativeElement) {
      this._lastMsgCount = count;
      const el = this.scrollRef.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  ngOnDestroy() {
    this._stopThinking();
    this.agent.stopListening();
    this.agent.stopSpeaking();
    if (this._onMove) globalThis.removeEventListener('mousemove', this._onMove);
    if (this._onUp)   globalThis.removeEventListener('mouseup',   this._onUp);
  }
}
