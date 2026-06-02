/**
 * AstroIntel AI Assistant Service
 * Powered by Universal Agent (DeepSeek + LangGraph)
 * Agent URL: http://localhost:8001/agent
 */
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AstroMessage {
  role: 'user' | 'agent';
  content: string;
  streaming?: boolean;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class AstroAgentService {

  private readonly agentUrl = 'http://localhost:8001/agent';

  // Rate limit — 10 questions per session
  private readonly QUESTION_LIMIT = 10;
  readonly qCount   = signal(0);
  readonly isLimited = computed(() => this.qCount() >= this.QUESTION_LIMIT);
  readonly qRemaining = computed(() => Math.max(0, this.QUESTION_LIMIT - this.qCount()));

  readonly messages    = signal<AstroMessage[]>([]);
  readonly isLoading   = signal(false);
  readonly isStreaming = signal(false);
  readonly error       = signal<string | null>(null);
  readonly isOpen      = signal(false);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly lastMessage = computed(() => {
    const msgs = this.messages();
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  });

  readonly quickPrompts = [
    '🪐 What does HIGH confidence mean in my report?',
    '🔢 Explain my Life Path number',
    '✋ What is the Heart Line on my palm?',
    '🃏 How do I read a 3-card tarot spread?',
    '🏠 What is Vastu Shastra?',
    '💊 What remedies does the platform recommend?',
  ];

  private sessionId: string | null = null;

  constructor(private http: HttpClient) {
    this.sessionId = sessionStorage.getItem('astrointel_agent_session');
    const saved = sessionStorage.getItem('astrointel_agent_qcount');
    if (saved) this.qCount.set(parseInt(saved, 10) || 0);
  }

  toggle() { this.isOpen.update(v => !v); }
  open()   { this.isOpen.set(true); }
  close()  { this.isOpen.set(false); }

  // ── Full response (simple) ─────────────────────────────────────────────────

  async chat(userMessage: string): Promise<string> {
    if (!userMessage.trim()) return '';
    this._addMessage({ role: 'user', content: userMessage });
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const res = await firstValueFrom(
        this.http.post<{ session_id: string; message: string }>(
          `${this.agentUrl}/chat`,
          { message: userMessage, session_id: this.sessionId }
        )
      );
      this._saveSession(res.session_id);
      this._addMessage({ role: 'agent', content: res.message });
      return res.message;
    } catch (err: any) {
      const msg = err?.error?.detail || err?.message || 'AstroAI is unavailable';
      this.error.set(msg);
      return '';
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Streaming response (tokens appear live) ────────────────────────────────

  async chatStream(userMessage: string): Promise<void> {
    if (!userMessage.trim()) return;

    // Rate limit check
    if (this.isLimited()) {
      const limitMsg = `🔒 You've used all ${this.QUESTION_LIMIT} questions for this session.\n\nTo continue, start a new session or log out and log back in.`;
      this._addMessage({ role: 'user', content: userMessage });
      this._addMessage({ role: 'agent', content: limitMsg });
      return;
    }

    this._addMessage({ role: 'user', content: userMessage });
    this.isStreaming.set(true);
    this.error.set(null);

    // Increment and persist count
    const newCount = this.qCount() + 1;
    this.qCount.set(newCount);
    sessionStorage.setItem('astrointel_agent_qcount', String(newCount));

    const agentMsgIndex = this.messages().length;
    this._addMessage({ role: 'agent', content: '', streaming: true });

    try {
      await this._readStream(userMessage, agentMsgIndex);
    } catch (err: any) {
      this.error.set(err?.message || 'Streaming failed');
      this.messages.update(msgs => msgs.filter((_, i) => i !== agentMsgIndex));
    } finally {
      this.isStreaming.set(false);
    }
  }

  private async _readStream(userMessage: string, agentMsgIndex: number): Promise<void> {
    const params = new URLSearchParams({
      message: userMessage,
      ...(this.sessionId ? { session_id: this.sessionId } : {}),
    });

    const response = await fetch(`${this.agentUrl}/stream?${params}`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        this._handleSseLine(line, agentMsgIndex);
      }
    }
  }

  private _handleSseLine(line: string, idx: number): void {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') return;
    try {
      const ev = JSON.parse(raw);
      if (ev.type === 'session') {
        this._saveSession(ev.session_id);
      } else if (ev.type === 'token') {
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[idx] = { ...updated[idx], content: updated[idx].content + ev.token };
          return updated;
        });
      } else if (ev.type === 'done') {
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[idx] = { ...updated[idx], streaming: false };
          return updated;
        });
      } else if (ev.type === 'error') {
        this.error.set(ev.message || 'Stream error');
      }
    } catch { /* ignore malformed lines */ }
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  async clearSession(): Promise<void> {
    if (this.sessionId) {
      try {
        await firstValueFrom(
          this.http.post(`${this.agentUrl}/clear`, { session_id: this.sessionId })
        );
      } catch { /* ignore */ }
    }
    this.sessionId = null;
    sessionStorage.removeItem('astrointel_agent_session');
    sessionStorage.removeItem('astrointel_agent_qcount');
    this.qCount.set(0);
    this.messages.set([]);
    this.error.set(null);
  }

  private _addMessage(msg: Omit<AstroMessage, 'timestamp'>): void {
    this.messages.update(msgs => [...msgs, { ...msg, timestamp: new Date() }]);
  }

  private _saveSession(id: string): void {
    this.sessionId = id;
    sessionStorage.setItem('astrointel_agent_session', id);
  }
}
