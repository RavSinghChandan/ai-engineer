/**
 * Universal Agent — JavaScript SDK
 * Works in any web app: plain HTML, React, Angular, Vue, Next.js
 *
 * Usage (plain HTML — one script tag):
 *   <script src="universal-agent.js" data-agent-url="http://localhost:8000"></script>
 *
 * Usage (JS import):
 *   import { UniversalAgentWidget, UniversalAgentClient } from './universal-agent.js'
 *   const client = new UniversalAgentClient({ agentUrl: 'http://localhost:8000' })
 *   const reply = await client.chat('Hello!')
 */

(function (global) {
  'use strict';

  // ─── Low-level API client ────────────────────────────────────────────────────

  class UniversalAgentClient {
    constructor({ agentUrl = 'http://localhost:8000', prefix = '/agent' } = {}) {
      this.baseUrl = agentUrl.replace(/\/$/, '') + prefix;
      this.sessionId = this._loadOrCreateSession();
    }

    async chat(message) {
      const res = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: this.sessionId }),
      });
      if (!res.ok) throw new Error(`Agent error: ${res.status}`);
      const data = await res.json();
      this.sessionId = data.session_id; // persist server-assigned session
      this._saveSession(this.sessionId);
      return { message: data.message, agentName: data.agent_name };
    }

    async clearSession() {
      await fetch(`${this.baseUrl}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.sessionId }),
      });
      sessionStorage.removeItem('ua_session_id');
      this.sessionId = this._loadOrCreateSession();
    }

    async health() {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.json();
    }

    _loadOrCreateSession() {
      return sessionStorage.getItem('ua_session_id') || this._newSession();
    }

    _newSession() {
      const id = 'sess_' + Math.random().toString(36).slice(2);
      sessionStorage.setItem('ua_session_id', id);
      return id;
    }

    _saveSession(id) {
      sessionStorage.setItem('ua_session_id', id);
    }
  }

  // ─── Chat Widget UI ──────────────────────────────────────────────────────────

  class UniversalAgentWidget {
    constructor({
      agentUrl = 'http://localhost:8000',
      prefix = '/agent',
      position = 'bottom-right',
      primaryColor = '#2563eb',
      backgroundColor = '#ffffff',
      textColor = '#1f2937',
      borderRadius = '12px',
      triggerText = 'Ask me anything',
      placeholder = 'Type your question...',
      agentName = 'Assistant',
    } = {}) {
      this.client = new UniversalAgentClient({ agentUrl, prefix });
      this.opts = { position, primaryColor, backgroundColor, textColor, borderRadius, triggerText, placeholder, agentName };
      this._inject();
    }

    _inject() {
      this._injectStyles();
      this._buildDOM();
      this._bindEvents();
    }

    _injectStyles() {
      if (document.getElementById('ua-styles')) return;
      const style = document.createElement('style');
      style.id = 'ua-styles';
      const { primaryColor, backgroundColor, textColor, borderRadius } = this.opts;
      style.textContent = `
        :root {
          --ua-primary: ${primaryColor};
          --ua-bg: ${backgroundColor};
          --ua-text: ${textColor};
          --ua-radius: ${borderRadius};
        }
        #ua-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        #ua-trigger {
          position: fixed; ${this._positionCSS()} z-index: 9998;
          background: var(--ua-primary); color: white;
          border: none; border-radius: 50px; padding: 12px 20px;
          cursor: pointer; font-size: 14px; font-weight: 600;
          box-shadow: 0 4px 20px rgba(37,99,235,0.4);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #ua-trigger:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(37,99,235,0.5); }
        #ua-panel {
          display: none; position: fixed; ${this._positionCSS(true)} z-index: 9999;
          width: 380px; height: 560px; background: var(--ua-bg);
          border-radius: var(--ua-radius); box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          flex-direction: column; overflow: hidden; border: 1px solid #e5e7eb;
        }
        #ua-panel.open { display: flex; animation: ua-slide-up 0.25s ease; }
        @keyframes ua-slide-up { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: none; } }
        #ua-header {
          background: var(--ua-primary); color: white;
          padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;
        }
        #ua-header span { font-weight: 700; font-size: 15px; }
        #ua-close { background: none; border: none; color: white; font-size: 20px; cursor: pointer; opacity: 0.8; }
        #ua-close:hover { opacity: 1; }
        #ua-messages {
          flex: 1; overflow-y: auto; padding: 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .ua-msg { max-width: 80%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5; word-wrap: break-word; }
        .ua-msg.user { background: var(--ua-primary); color: white; align-self: flex-end; border-radius: 14px 14px 4px 14px; }
        .ua-msg.agent { background: #f3f4f6; color: var(--ua-text); align-self: flex-start; border-radius: 14px 14px 14px 4px; }
        .ua-msg.typing { color: #9ca3af; font-style: italic; }
        #ua-footer { padding: 12px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; }
        #ua-input {
          flex: 1; border: 1.5px solid #e5e7eb; border-radius: 8px;
          padding: 10px 14px; font-size: 14px; outline: none; color: var(--ua-text);
          transition: border-color 0.2s;
        }
        #ua-input:focus { border-color: var(--ua-primary); }
        #ua-send {
          background: var(--ua-primary); color: white;
          border: none; border-radius: 8px; padding: 10px 16px;
          cursor: pointer; font-size: 20px; transition: opacity 0.2s;
        }
        #ua-send:hover { opacity: 0.85; }
        #ua-send:disabled { opacity: 0.4; cursor: not-allowed; }
        #ua-clear { background: none; border: none; color: #9ca3af; font-size: 11px; cursor: pointer; padding: 4px 8px; align-self: flex-end; }
        #ua-clear:hover { color: #ef4444; }
      `;
      document.head.appendChild(style);
    }

    _positionCSS(isPanel = false) {
      const offset = isPanel ? 'bottom: 80px;' : 'bottom: 24px;';
      const side = this.opts.position.includes('right') ? 'right: 24px;' : 'left: 24px;';
      return `${offset} ${side}`;
    }

    _buildDOM() {
      const container = document.createElement('div');
      container.id = 'ua-widget';
      container.innerHTML = `
        <button id="ua-trigger">${this.opts.triggerText}</button>
        <div id="ua-panel">
          <div id="ua-header">
            <span>💬 ${this.opts.agentName}</span>
            <button id="ua-close">✕</button>
          </div>
          <div id="ua-messages">
            <div class="ua-msg agent">Hi! I'm ${this.opts.agentName}. How can I help you today?</div>
          </div>
          <div id="ua-footer">
            <input id="ua-input" type="text" placeholder="${this.opts.placeholder}" autocomplete="off" />
            <button id="ua-send">➤</button>
          </div>
          <button id="ua-clear">Clear conversation</button>
        </div>
      `;
      document.body.appendChild(container);
    }

    _bindEvents() {
      document.getElementById('ua-trigger').onclick = () => this._open();
      document.getElementById('ua-close').onclick = () => this._close();
      document.getElementById('ua-send').onclick = () => this._send();
      document.getElementById('ua-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      document.getElementById('ua-clear').onclick = async () => {
        await this.client.clearSession();
        const msgs = document.getElementById('ua-messages');
        msgs.innerHTML = `<div class="ua-msg agent">Conversation cleared. How can I help you?</div>`;
      };
    }

    _open() {
      document.getElementById('ua-panel').classList.add('open');
      document.getElementById('ua-trigger').style.display = 'none';
      document.getElementById('ua-input').focus();
    }

    _close() {
      document.getElementById('ua-panel').classList.remove('open');
      document.getElementById('ua-trigger').style.display = '';
    }

    async _send() {
      const input = document.getElementById('ua-input');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      const sendBtn = document.getElementById('ua-send');
      sendBtn.disabled = true;

      this._appendMessage(text, 'user');
      const typingEl = this._appendMessage('...', 'agent typing');

      try {
        const { message } = await this.client.chat(text);
        typingEl.remove();
        this._appendMessage(message, 'agent');
      } catch (err) {
        typingEl.remove();
        this._appendMessage('Sorry, something went wrong. Please try again.', 'agent');
        console.error('[UniversalAgent]', err);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }

    _appendMessage(text, type) {
      const msgs = document.getElementById('ua-messages');
      const el = document.createElement('div');
      el.className = `ua-msg ${type}`;
      el.textContent = text;
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
      return el;
    }
  }

  // ─── Auto-init from script tag data attributes ────────────────────────────

  function autoInit() {
    const script = document.currentScript || document.querySelector('script[data-agent-url]');
    if (!script) return;

    const agentUrl = script.getAttribute('data-agent-url') || 'http://localhost:8000';
    const position = script.getAttribute('data-position') || 'bottom-right';
    const color = script.getAttribute('data-color') || '#2563eb';
    const agentName = script.getAttribute('data-agent-name') || 'Assistant';

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        new UniversalAgentWidget({ agentUrl, position, primaryColor: color, agentName });
      });
    } else {
      new UniversalAgentWidget({ agentUrl, position, primaryColor: color, agentName });
    }
  }

  // Exports
  global.UniversalAgentWidget = UniversalAgentWidget;
  global.UniversalAgentClient = UniversalAgentClient;

  // Auto-init if loaded as a script tag
  autoInit();

})(typeof window !== 'undefined' ? window : this);
