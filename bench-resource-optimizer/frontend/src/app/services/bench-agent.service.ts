import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
  streaming?: boolean;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class BenchAgentService {

  private readonly agentUrl = 'http://localhost:8011/agent';
  private readonly LIMIT = 15;

  readonly messages    = signal<AgentMessage[]>([]);
  readonly isLoading   = signal(false);
  readonly isStreaming = signal(false);
  readonly error       = signal<string | null>(null);
  readonly isOpen      = signal(false);
  readonly qCount      = signal(0);
  readonly isLimited   = computed(() => this.qCount() >= this.LIMIT);
  readonly qRemaining  = computed(() => Math.max(0, this.LIMIT - this.qCount()));
  readonly hasMessages = computed(() => this.messages().length > 0);

  readonly quickPrompts = [
    { label: 'Match score',        text: 'What does my match score mean?' },
    { label: 'Hybrid RAG pipeline', text: 'How does Hybrid RAG work in Bench Optimizer?' },
    { label: 'Agent memory',       text: 'Why does the agent remember my past sessions?' },
    { label: 'Semantic cache',     text: 'How fast is the semantic cache?' },
    { label: 'CV security',        text: 'How is my CV protected from injection attacks?' },
    { label: '7-day training plan', text: 'How is the 7-day preparation plan generated?' },
  ];

  private sessionId: string | null = null;

  constructor(private readonly http: HttpClient) {
    this.sessionId = sessionStorage.getItem('bench_agent_session');
    const saved = sessionStorage.getItem('bench_agent_qcount');
    if (saved) this.qCount.set(Number.parseInt(saved, 10) || 0);
  }

  unlock(): void {
    fetch(`${this.agentUrl}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  }

  toggle() { this.isOpen.update(v => !v); }
  open()   { this.isOpen.set(true); }
  close()  { this.isOpen.set(false); }

  async chatStream(userMessage: string): Promise<void> {
    if (!userMessage.trim()) return;

    if (this.isLimited()) {
      this._addMsg({ role: 'user', content: userMessage });
      this._addMsg({ role: 'agent', content: `🔒 Session limit reached (${this.LIMIT} questions). Start a new session to continue.` });
      return;
    }

    this._addMsg({ role: 'user', content: userMessage });
    this.isStreaming.set(true);
    this.error.set(null);
    const newCount = this.qCount() + 1;
    this.qCount.set(newCount);
    sessionStorage.setItem('bench_agent_qcount', String(newCount));

    const idx = this.messages().length;
    this._addMsg({ role: 'agent', content: '', streaming: true });

    try {
      await this._readStream(userMessage, idx);
    } catch (err: any) {
      this.error.set(err?.message || 'Streaming failed');
      this.messages.update(msgs => msgs.filter((_, i) => i !== idx));
    } finally {
      this.isStreaming.set(false);
    }
  }

  private async _readStream(msg: string, idx: number): Promise<void> {
    const params = new URLSearchParams({ message: msg, ...(this.sessionId ? { session_id: this.sessionId } : {}) });
    const res = await fetch(`${this.agentUrl}/stream?${params}`, { method: 'GET', headers: { Accept: 'text/event-stream' } });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() ?? '';
      for (const line of lines) this._handleLine(line, idx);
    }
  }

  private _handleLine(line: string, idx: number): void {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') return;
    try {
      const ev = JSON.parse(raw);
      if (ev.type === 'session') { this.sessionId = ev.session_id; sessionStorage.setItem('bench_agent_session', ev.session_id); }
      else if (ev.type === 'token') this.messages.update(m => { const u = [...m]; u[idx] = { ...u[idx], content: u[idx].content + ev.token }; return u; });
      else if (ev.type === 'done')  this.messages.update(m => { const u = [...m]; u[idx] = { ...u[idx], streaming: false }; return u; });
      else if (ev.type === 'error') this.error.set(ev.message || 'Error');
    } catch { /* ignore */ }
  }

  async clearSession(): Promise<void> {
    if (this.sessionId) {
      try { await firstValueFrom(this.http.post(`${this.agentUrl}/clear`, { session_id: this.sessionId })); } catch { /* ignore */ }
    }
    this.sessionId = null;
    sessionStorage.removeItem('bench_agent_session');
    sessionStorage.removeItem('bench_agent_qcount');
    this.qCount.set(0);
    this.messages.set([]);
    this.error.set(null);
  }

  private _addMsg(msg: Omit<AgentMessage, 'timestamp'>): void {
    this.messages.update(m => [...m, { ...msg, timestamp: new Date() }]);
  }
}
