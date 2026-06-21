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

<!-- ════════════════════════════════════════
     FAB — cosmic orb with Jyoti avatar
     ════════════════════════════════════════ -->
<button class="j-fab" (click)="togglePanel()" [class.j-fab-open]="agent.isOpen()" aria-label="Ask Jyoti">
  <div class="j-fab-orb">
    <div class="j-fab-glow"></div>
    <img src="jyoti-happy.svg" class="j-fab-img" alt="Jyoti"/>
    <span class="j-fab-online"></span>
  </div>
  <div class="j-fab-label">
    <span class="j-fab-name">Jyoti</span>
    <span class="j-fab-tagline">Spiritual Guide ✦</span>
  </div>
  @if (unread() > 0 && !agent.isOpen()) {
    <span class="j-unread">{{ unread() }}</span>
  }
</button>

<!-- ════════════════════════════════════════
     Panel — cosmic night-sky chat widget
     ════════════════════════════════════════ -->
@if (agent.isOpen()) {
<div class="j-panel" role="dialog" aria-label="Jyoti — Cosmic Guide">

  <!-- Stars background layer -->
  <div class="j-stars" aria-hidden="true">
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span><span></span>
  </div>

  <!-- ── Header ── -->
  <div class="j-header">
    <div class="j-hdr-avatar-wrap">
      <img src="jyoti-happy.svg" class="j-hdr-img" alt="Jyoti"/>
      <span class="j-hdr-aura"></span>
    </div>
    <div class="j-hdr-info">
      <strong>Jyoti</strong>
      <span>AstroIntel · Spiritual Guide</span>
    </div>
    <div class="j-hdr-actions">
      <button class="j-icon-btn" (click)="newSession()" title="New session" aria-label="New session">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      </button>
      <button class="j-icon-btn j-icon-close" (click)="agent.close()" aria-label="Close">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- ── Messages ── -->
  <div class="j-messages" #scrollRef>

    @if (!agent.hasMessages()) {
      <!-- Welcome screen -->
      <div class="j-welcome">
        <div class="j-welcome-avatar">
          <img src="jyoti-happy.svg" alt="Jyoti"/>
          <div class="j-welcome-ring j-ring-1"></div>
          <div class="j-welcome-ring j-ring-2"></div>
        </div>
        <p class="j-welcome-name">Namaste, I'm Jyoti</p>
        <p class="j-welcome-desc">Your cosmic guide across the five ancient sciences.<br/>Ask me anything about your stars, numbers, or path.</p>
        <div class="j-divider"><span>✦ begin here ✦</span></div>
        <div class="j-chips">
          @for (p of quickPrompts; track p) {
            <button class="j-chip" (click)="send(p)">{{ p }}</button>
          }
        </div>
      </div>
    }

    @for (msg of agent.messages(); track $index) {
      <div class="j-msg" [class.j-msg-user]="msg.role==='user'" [class.j-msg-agent]="msg.role==='agent'">

        @if (msg.role === 'agent') {
          <div class="j-msg-avatar">
            <img src="jyoti.svg" alt="Jyoti"/>
          </div>
        }

        <div class="j-msg-col" [class.j-msg-col-user]="msg.role==='user'">
          <div class="j-bubble" [class.j-bubble-user]="msg.role==='user'" [class.j-bubble-agent]="msg.role==='agent'">
            @if (msg.role === 'agent') {
              <span [innerHTML]="safeHtml(msg.content)"></span>
              @if (msg.streaming && msg.content) {
                <span class="j-cursor">▌</span>
              }
            } @else {
              {{ msg.content }}
            }
          </div>
          <span class="j-ts">{{ msg.timestamp | date:'HH:mm' }}</span>
        </div>

      </div>
    }

    <!-- Thinking indicator -->
    @if (agent.isThinking()) {
      <div class="j-msg j-msg-agent j-thinking-row">
        <div class="j-msg-avatar j-thinking-avatar">
          <img src="jyoti-thinking.svg" alt=""/>
        </div>
        <div class="j-thinking-bubble">
          <span class="j-dot"></span>
          <span class="j-dot"></span>
          <span class="j-dot"></span>
          <span class="j-thinking-phrase">{{ thinkingPhrase() }}</span>
        </div>
      </div>
    }

    <!-- Error -->
    @if (agent.error()) {
      <div class="j-error-bar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ agent.error() }}
        <button (click)="agent.error.set(null)">✕</button>
      </div>
    }
  </div>

  <!-- ── Input zone ── -->
  <div class="j-input-zone">

    @if (agent.isLimited()) {
      <div class="j-limit-banner">
        Session complete &nbsp;·&nbsp;
        <button (click)="newSession()">Begin anew</button>
      </div>

    } @else if (agent.isListening()) {
      <div class="j-listen-bar">
        <div class="j-listen-orb">
          <span></span><span></span><span></span>
        </div>
        <span class="j-listen-text">{{ agent.interimTranscript() || 'Listening to you…' }}</span>
        <button class="j-done-btn" (click)="doneListening()">Done</button>
      </div>

    } @else {
      <div class="j-input-row">
        <button class="j-mic-btn" (click)="toggleMic()"
                [class.j-mic-active]="agent.isListening()"
                title="Speak your question" aria-label="Voice input">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
          </svg>
        </button>

        <input #inputRef
               class="j-input"
               type="text"
               placeholder="Ask Jyoti anything…"
               [(ngModel)]="draft"
               (keydown.enter)="send(draft)"
               [disabled]="agent.isStreaming()"
               maxlength="200"
               autocomplete="off"/>

        @if (agent.isSpeaking()) {
          <button class="j-action-btn j-stop-btn" (click)="agent.stopSpeaking()" title="Stop speaking" aria-label="Stop speaking">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        } @else {
          <button class="j-action-btn j-send-btn"
                  (click)="send(draft)"
                  [disabled]="!draft.trim() || agent.isStreaming()"
                  aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        }
      </div>

      @if (agent.voiceError()) {
        <div class="j-voice-err">
          {{ agent.voiceError() }}
          <button (click)="agent.voiceError.set('')">✕</button>
        </div>
      }

      <p class="j-footer-tag">✦ Powered by AstroIntel 360°</p>
    }

  </div>

</div>
}

} <!-- /auth guard -->
  `,
  styles: [`
    /* ═══════════════════════════════════════════════
       DESIGN TOKENS — cosmic palette
       ═══════════════════════════════════════════════ */
    :host {
      --j-night:    #0d0b1e;
      --j-deep:     #13103a;
      --j-cosmos:   #1a1642;
      --j-panel-bg: #0f0d2b;
      --j-gold:     #f5c842;
      --j-gold-dim: #c9a227;
      --j-violet:   #9b59f5;
      --j-lavender: #c4b5fd;
      --j-rose:     #f472b6;
      --j-white:    #f0eeff;
      --j-muted:    #7c6ea8;
      --j-border:   rgba(155,89,245,0.22);
      --j-glow:     rgba(155,89,245,0.35);
    }

    /* ═══════════════════════════════════════════════
       FAB — floating orb
       ═══════════════════════════════════════════════ */
    .j-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      display: flex; align-items: center; gap: 10px;
      padding: 6px 16px 6px 6px;
      border-radius: 50px;
      background: linear-gradient(135deg, #1a1642 0%, #0d0b1e 100%);
      border: 1.5px solid var(--j-border);
      box-shadow: 0 4px 24px rgba(155,89,245,0.28), 0 0 0 0 rgba(155,89,245,0);
      cursor: pointer;
      transition: transform 0.2s cubic-bezier(.16,1,.3,1), box-shadow 0.2s;
    }
    .j-fab:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 32px rgba(155,89,245,0.42), 0 0 0 0 rgba(155,89,245,0);
    }
    .j-fab-open {
      border-color: var(--j-violet);
      box-shadow: 0 0 0 3px rgba(155,89,245,0.18), 0 8px 32px rgba(155,89,245,0.3);
    }

    .j-fab-orb {
      position: relative; width: 40px; height: 40px; flex-shrink: 0;
    }
    .j-fab-glow {
      position: absolute; inset: -4px; border-radius: 50%;
      background: radial-gradient(circle, rgba(155,89,245,0.4) 0%, transparent 70%);
      animation: j-orb-glow 2.5s ease-in-out infinite;
    }
    @keyframes j-orb-glow {
      0%,100% { opacity: 0.6; transform: scale(1); }
      50%      { opacity: 1;   transform: scale(1.12); }
    }
    .j-fab-img {
      width: 40px; height: 40px; border-radius: 50%;
      object-fit: contain; position: relative; z-index: 1;
      background: radial-gradient(circle at 40% 35%, #2e1f6e, #0d0b1e);
      border: 1.5px solid rgba(155,89,245,0.5);
    }
    .j-fab-online {
      position: absolute; bottom: 2px; right: 2px; z-index: 2;
      width: 9px; height: 9px; border-radius: 50%;
      background: #34d399; border: 2px solid #0d0b1e;
      animation: j-online-pulse 2s infinite;
    }
    @keyframes j-online-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.5); }
      50%      { box-shadow: 0 0 0 4px rgba(52,211,153,0); }
    }
    .j-fab-label { display: flex; flex-direction: column; line-height: 1.25; }
    .j-fab-name    { font-size: 12px; font-weight: 700; color: var(--j-white); letter-spacing: 0.02em; }
    .j-fab-tagline { font-size: 10px; color: var(--j-gold); opacity: 0.9; }

    .j-unread {
      position: absolute; top: -4px; right: -4px;
      background: var(--j-rose); color: #fff;
      font-size: 10px; font-weight: 800;
      width: 16px; height: 16px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #0d0b1e;
    }

    /* ═══════════════════════════════════════════════
       PANEL — cosmic window
       ═══════════════════════════════════════════════ */
    .j-panel {
      position: fixed; bottom: 84px; right: 24px; z-index: 9999;
      width: 370px; height: 580px;
      display: flex; flex-direction: column;
      border-radius: 22px; overflow: hidden;
      background: var(--j-panel-bg);
      border: 1.5px solid var(--j-border);
      box-shadow:
        0 24px 64px rgba(0,0,0,0.55),
        0 0 0 1px rgba(155,89,245,0.1),
        inset 0 1px 0 rgba(255,255,255,0.06);
      animation: j-open 0.28s cubic-bezier(.16,1,.3,1);
    }
    @keyframes j-open {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to   { opacity: 1; transform: none; }
    }

    /* Twinkling stars background */
    .j-stars {
      position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
    }
    .j-stars span {
      position: absolute; border-radius: 50%;
      background: #fff; opacity: 0;
      animation: j-twinkle var(--d, 3s) var(--del, 0s) infinite;
    }
    .j-stars span:nth-child(1)  { width:2px; height:2px; top:8%;  left:15%; --d:2.8s; --del:0.2s;  }
    .j-stars span:nth-child(2)  { width:1px; height:1px; top:14%; left:72%; --d:3.5s; --del:0.8s;  }
    .j-stars span:nth-child(3)  { width:2px; height:2px; top:22%; left:42%; --d:2.2s; --del:1.4s;  }
    .j-stars span:nth-child(4)  { width:1px; height:1px; top:6%;  left:88%; --d:4.0s; --del:0.5s;  }
    .j-stars span:nth-child(5)  { width:2px; height:2px; top:32%; left:8%;  --d:3.1s; --del:1.8s;  }
    .j-stars span:nth-child(6)  { width:1px; height:1px; top:5%;  left:55%; --d:2.6s; --del:0.3s;  }
    .j-stars span:nth-child(7)  { width:2px; height:2px; top:18%; left:28%; --d:3.8s; --del:2.1s;  }
    .j-stars span:nth-child(8)  { width:1px; height:1px; top:28%; left:63%; --d:2.4s; --del:0.9s;  }
    .j-stars span:nth-child(9)  { width:2px; height:2px; top:12%; left:5%;  --d:3.3s; --del:1.1s;  }
    .j-stars span:nth-child(10) { width:1px; height:1px; top:38%; left:80%; --d:4.2s; --del:0.6s;  }
    .j-stars span:nth-child(11) { width:2px; height:2px; top:3%;  left:38%; --d:2.9s; --del:1.6s;  }
    .j-stars span:nth-child(12) { width:1px; height:1px; top:25%; left:92%; --d:3.6s; --del:2.4s;  }
    .j-stars span:nth-child(13) { width:2px; height:2px; top:42%; left:22%; --d:2.7s; --del:0.7s;  }
    .j-stars span:nth-child(14) { width:1px; height:1px; top:9%;  left:48%; --d:3.9s; --del:1.3s;  }
    .j-stars span:nth-child(15) { width:2px; height:2px; top:35%; left:58%; --d:2.5s; --del:2.0s;  }
    @keyframes j-twinkle {
      0%,100% { opacity: 0; transform: scale(0.5); }
      50%      { opacity: 0.8; transform: scale(1.2); }
    }

    /* ═══════════════════════════════════════════════
       HEADER
       ═══════════════════════════════════════════════ */
    .j-header {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px;
      background: linear-gradient(180deg, rgba(26,22,66,0.98) 0%, rgba(15,13,43,0.95) 100%);
      border-bottom: 1px solid var(--j-border);
      flex-shrink: 0; position: relative; z-index: 2;
    }
    .j-hdr-avatar-wrap { position: relative; width: 36px; height: 36px; flex-shrink: 0; }
    .j-hdr-img {
      width: 36px; height: 36px; border-radius: 50%;
      object-fit: contain;
      background: radial-gradient(circle at 40% 35%, #2e1f6e, #0d0b1e);
      border: 1.5px solid rgba(155,89,245,0.5);
    }
    .j-hdr-aura {
      position: absolute; inset: -3px; border-radius: 50%;
      border: 1.5px solid rgba(245,200,66,0.4);
      animation: j-aura-spin 6s linear infinite;
    }
    @keyframes j-aura-spin {
      from { transform: rotate(0deg) scale(1); opacity: 0.6; }
      50%  { opacity: 1; transform: rotate(180deg) scale(1.05); }
      to   { transform: rotate(360deg) scale(1); opacity: 0.6; }
    }

    .j-hdr-info { flex: 1; }
    .j-hdr-info strong {
      display: block; font-size: 13px; font-weight: 700;
      color: var(--j-white); letter-spacing: 0.02em;
    }
    .j-hdr-info span { font-size: 10px; color: var(--j-gold); opacity: 0.85; }

    .j-hdr-actions { display: flex; gap: 4px; }
    .j-icon-btn {
      width: 28px; height: 28px; border-radius: 8px;
      background: rgba(155,89,245,0.1); border: 1px solid rgba(155,89,245,0.2);
      color: var(--j-lavender); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
    }
    .j-icon-btn:hover { background: rgba(155,89,245,0.22); color: #fff; }
    .j-icon-close:hover { background: rgba(244,114,182,0.18); color: var(--j-rose); border-color: rgba(244,114,182,0.3); }

    /* ═══════════════════════════════════════════════
       MESSAGES AREA
       ═══════════════════════════════════════════════ */
    .j-messages {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 16px 12px 10px;
      display: flex; flex-direction: column; gap: 12px;
      position: relative; z-index: 1;
      scrollbar-width: thin;
      scrollbar-color: rgba(155,89,245,0.25) transparent;
    }

    /* ── Welcome screen ── */
    .j-welcome { text-align: center; padding: 12px 8px 4px; }

    .j-welcome-avatar {
      position: relative; width: 80px; height: 80px;
      margin: 0 auto 14px; display: flex; align-items: center; justify-content: center;
    }
    .j-welcome-avatar img {
      width: 72px; height: 72px; border-radius: 50%;
      object-fit: contain; position: relative; z-index: 2;
      background: radial-gradient(circle at 40% 35%, #2e1f6e, #0d0b1e);
      border: 2px solid rgba(155,89,245,0.5);
      box-shadow: 0 0 20px rgba(155,89,245,0.4);
    }
    .j-welcome-ring {
      position: absolute; border-radius: 50%;
      border: 1.5px solid rgba(245,200,66,0.35);
      animation: j-ring-pulse 2.5s ease-in-out infinite;
    }
    .j-ring-1 { width: 84px; height: 84px; animation-delay: 0s; }
    .j-ring-2 { width: 100px; height: 100px; animation-delay: 0.6s; opacity: 0.5; }
    @keyframes j-ring-pulse {
      0%,100% { transform: scale(0.95); opacity: 0.4; }
      50%      { transform: scale(1.05); opacity: 0.9; }
    }

    .j-welcome-name {
      font-size: 17px; font-weight: 700; color: var(--j-white);
      margin: 0 0 6px; letter-spacing: 0.02em;
    }
    .j-welcome-desc {
      font-size: 12px; color: var(--j-muted); margin: 0 0 16px;
      line-height: 1.6;
    }
    .j-divider {
      display: flex; align-items: center; gap: 8px;
      margin: 0 0 14px;
    }
    .j-divider::before, .j-divider::after {
      content: ''; flex: 1; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(155,89,245,0.3), transparent);
    }
    .j-divider span { font-size: 10px; color: var(--j-gold); opacity: 0.7; white-space: nowrap; }

    .j-chips { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
    .j-chip {
      padding: 7px 13px; border-radius: 20px;
      background: rgba(155,89,245,0.1);
      border: 1px solid rgba(155,89,245,0.28);
      color: var(--j-lavender); font-size: 11.5px; font-weight: 500;
      cursor: pointer; transition: all 0.16s; white-space: nowrap;
    }
    .j-chip:hover {
      background: rgba(155,89,245,0.22);
      border-color: var(--j-violet);
      color: #fff;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(155,89,245,0.25);
    }

    /* ── Message bubbles ── */
    .j-msg {
      display: flex; align-items: flex-end; gap: 8px;
      animation: j-msg-in 0.22s cubic-bezier(.16,1,.3,1);
    }
    @keyframes j-msg-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: none; }
    }
    .j-msg-user  { flex-direction: row-reverse; }
    .j-msg-agent { flex-direction: row; }

    .j-msg-avatar {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: radial-gradient(circle at 40% 35%, #2e1f6e, #0d0b1e);
      border: 1.5px solid rgba(155,89,245,0.4);
      margin-bottom: 16px; overflow: hidden;
      box-shadow: 0 0 8px rgba(155,89,245,0.3);
    }
    .j-msg-avatar img { width: 100%; height: 100%; object-fit: contain; }

    .j-msg-col { display: flex; flex-direction: column; max-width: 80%; gap: 3px; }
    .j-msg-col-user { align-items: flex-end; }

    .j-bubble {
      padding: 10px 14px; border-radius: 16px;
      font-size: 13px; line-height: 1.6; word-break: break-word;
    }
    .j-bubble-user {
      background: linear-gradient(135deg, #7c3aed, #5b21b6);
      color: #f0eeff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 2px 12px rgba(124,58,237,0.35);
    }
    .j-bubble-agent {
      background: rgba(26,22,66,0.85);
      color: var(--j-white);
      border: 1px solid rgba(155,89,245,0.2);
      border-bottom-left-radius: 4px;
      backdrop-filter: blur(8px);
      box-shadow: 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .j-bubble-agent strong { color: var(--j-gold); font-weight: 600; }
    .j-bubble-agent em     { color: var(--j-lavender); font-style: italic; }
    .j-bubble-agent h2,
    .j-bubble-agent h3,
    .j-bubble-agent h4 { color: var(--j-gold); font-size: 12.5px; font-weight: 700; margin: 6px 0 2px; }
    .j-bubble-agent code {
      background: rgba(155,89,245,0.15); color: var(--j-lavender);
      padding: 1px 5px; border-radius: 4px; font-size: 11.5px;
    }
    .j-bubble-agent ul { margin: 4px 0 4px 14px; padding: 0; }
    .j-bubble-agent li { margin: 3px 0; color: var(--j-white); }
    .j-bubble-agent hr { border: none; border-top: 1px solid var(--j-border); margin: 6px 0; }

    .j-ts { font-size: 10px; color: var(--j-muted); opacity: 0.7; }

    .j-cursor {
      display: inline-block;
      color: var(--j-violet);
      animation: j-blink 0.65s step-end infinite;
    }
    @keyframes j-blink { 50% { opacity: 0; } }

    /* ── Thinking bubble ── */
    .j-thinking-row { align-items: center; }
    .j-thinking-avatar {
      animation: j-think-avatar 1.6s ease-in-out infinite;
    }
    @keyframes j-think-avatar {
      0%,100% { opacity: 1; box-shadow: 0 0 8px rgba(155,89,245,0.3); }
      50%      { opacity: 0.7; box-shadow: 0 0 16px rgba(155,89,245,0.6); }
    }
    .j-thinking-bubble {
      display: flex; align-items: center; gap: 7px;
      padding: 10px 14px;
      background: rgba(26,22,66,0.85);
      border: 1px solid rgba(155,89,245,0.2);
      border-radius: 16px; border-bottom-left-radius: 4px;
      backdrop-filter: blur(8px);
    }
    .j-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--j-violet); flex-shrink: 0;
      animation: j-dots 1.2s ease-in-out infinite;
    }
    .j-dot:nth-child(2) { animation-delay: 0.18s; }
    .j-dot:nth-child(3) { animation-delay: 0.36s; }
    @keyframes j-dots {
      0%,80%,100% { transform: translateY(0); opacity: 0.4; }
      40%          { transform: translateY(-6px); opacity: 1; }
    }
    .j-thinking-phrase {
      font-size: 11.5px; color: var(--j-lavender); font-style: italic;
      animation: j-phrase-in 0.4s ease;
    }
    @keyframes j-phrase-in { from { opacity: 0; } to { opacity: 1; } }

    /* ── Error ── */
    .j-error-bar {
      display: flex; align-items: center; gap: 7px;
      padding: 8px 12px; border-radius: 10px;
      background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
      color: #fca5a5; font-size: 11.5px;
    }
    .j-error-bar button { margin-left: auto; background: none; border: none; color: #fca5a5; cursor: pointer; }

    /* ═══════════════════════════════════════════════
       INPUT ZONE
       ═══════════════════════════════════════════════ */
    .j-input-zone {
      padding: 10px 12px 12px;
      background: linear-gradient(180deg, rgba(15,13,43,0.95) 0%, rgba(13,11,30,0.98) 100%);
      border-top: 1px solid var(--j-border);
      flex-shrink: 0; position: relative; z-index: 2;
    }

    .j-input-row { display: flex; gap: 7px; align-items: center; }

    .j-input {
      flex: 1; padding: 9px 14px;
      border-radius: 12px;
      background: rgba(155,89,245,0.08);
      border: 1px solid rgba(155,89,245,0.22);
      color: var(--j-white); font-size: 13px;
      outline: none; font-family: inherit;
      transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    }
    .j-input::placeholder { color: var(--j-muted); }
    .j-input:focus {
      border-color: var(--j-violet);
      background: rgba(155,89,245,0.13);
      box-shadow: 0 0 0 3px rgba(155,89,245,0.12);
    }
    .j-input:disabled { opacity: 0.3; }

    /* Mic button */
    .j-mic-btn {
      width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
      background: rgba(155,89,245,0.12);
      border: 1.5px solid rgba(155,89,245,0.3);
      color: var(--j-lavender); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.16s;
    }
    .j-mic-btn:hover { background: rgba(155,89,245,0.22); color: #fff; transform: scale(1.05); }
    .j-mic-active {
      background: rgba(239,68,68,0.2) !important;
      border-color: rgba(239,68,68,0.6) !important;
      color: #fca5a5 !important;
      animation: j-mic-live 1.1s infinite;
    }
    @keyframes j-mic-live {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }

    /* Send / Stop buttons */
    .j-action-btn {
      width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.16s;
    }
    .j-send-btn {
      background: linear-gradient(135deg, #7c3aed, #5b21b6);
      color: #fff;
      box-shadow: 0 4px 14px rgba(124,58,237,0.4);
    }
    .j-send-btn:hover:not(:disabled) { transform: scale(1.06); box-shadow: 0 6px 18px rgba(124,58,237,0.55); }
    .j-send-btn:disabled { opacity: 0.25; cursor: not-allowed; box-shadow: none; }
    .j-stop-btn {
      background: rgba(239,68,68,0.15);
      border: 1.5px solid rgba(239,68,68,0.4);
      color: #fca5a5;
      animation: j-stop-pulse 1.4s infinite;
    }
    @keyframes j-stop-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
      50%      { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
    }

    /* Listening bar */
    .j-listen-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px;
      background: rgba(155,89,245,0.1);
      border: 1.5px solid rgba(155,89,245,0.35);
      border-radius: 12px;
    }
    .j-listen-orb {
      display: flex; gap: 3px; align-items: center; height: 20px; flex-shrink: 0;
    }
    .j-listen-orb span {
      display: block; width: 3px; border-radius: 2px;
      background: var(--j-violet);
      animation: j-bar 0.65s ease-in-out infinite;
    }
    .j-listen-orb span:nth-child(1) { height: 8px; }
    .j-listen-orb span:nth-child(2) { height: 18px; animation-delay: 0.1s; }
    .j-listen-orb span:nth-child(3) { height: 10px; animation-delay: 0.2s; }
    @keyframes j-bar {
      0%,100% { transform: scaleY(0.5); opacity: 0.6; }
      50%      { transform: scaleY(1.4); opacity: 1; }
    }
    .j-listen-text {
      flex: 1; font-size: 12px; color: var(--j-lavender); font-style: italic;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .j-done-btn {
      padding: 5px 14px; border-radius: 8px;
      background: linear-gradient(135deg, #7c3aed, #5b21b6);
      color: #fff; border: none; font-size: 12px; font-weight: 700;
      cursor: pointer; flex-shrink: 0; transition: opacity 0.14s;
    }
    .j-done-btn:hover { opacity: 0.88; }

    /* Voice error */
    .j-voice-err {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 6px; padding: 5px 10px; border-radius: 8px;
      background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25);
      font-size: 11px; color: #fdba74;
    }
    .j-voice-err button { background: none; border: none; color: #fb923c; cursor: pointer; }

    /* Session limit */
    .j-limit-banner {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 14px;
      background: rgba(245,200,66,0.08); border-radius: 11px;
      border: 1px solid rgba(245,200,66,0.25);
      font-size: 12px; color: var(--j-gold); font-weight: 600;
    }
    .j-limit-banner button {
      background: rgba(245,200,66,0.18); color: var(--j-gold);
      border: 1px solid rgba(245,200,66,0.3);
      padding: 3px 11px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;
    }
    .j-limit-banner button:hover { background: rgba(245,200,66,0.28); }

    /* Footer tag */
    .j-footer-tag {
      text-align: center; font-size: 9.5px; color: var(--j-muted);
      opacity: 0.55; margin: 6px 0 0; letter-spacing: 0.04em;
    }

    /* ═══════════════════════════════════════════════
       MOBILE
       ═══════════════════════════════════════════════ */
    @media (max-width: 480px) {
      .j-panel { width: calc(100vw - 16px); right: 8px; bottom: 74px; height: 72vh; border-radius: 18px; }
      .j-fab   { right: 10px; bottom: 10px; }
      .j-chips { flex-direction: column; align-items: stretch; }
      .j-chip  { text-align: center; }
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
    'Aligning the planets…',
    'Tuning into your energy…',
    'The universe is speaking…',
    'Feeling your vibration…',
    'The cosmos is answering…',
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

  readonly quickPrompts = [
    'How is my day today?',
    'What is my Life Path number?',
    'What does Heart Line mean?',
    'Tell me about Vastu Shastra',
    'Is Aries compatible with Scorpio?',
    'What remedies does my reading include?',
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
