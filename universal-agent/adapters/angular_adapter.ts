/**
 * Universal Agent — Angular Adapter
 * Works with Angular 15+ (standalone components, signals).
 *
 * SETUP (3 steps):
 *   1. Copy this file into your Angular project:
 *        cp adapters/angular_adapter.ts src/app/services/universal-agent.service.ts
 *
 *   2. Set the agent URL in your environment file:
 *        // src/environments/environment.ts
 *        export const environment = { agentUrl: 'http://localhost:8000' };
 *
 *   3. Inject in any component:
 *        constructor(public agent: UniversalAgentService) {}
 */

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  streaming?: boolean;   // true while tokens are arriving
  timestamp: Date;
}

export interface AgentHealth {
  status: string;
  agent: string;
  model: string;
  tools: string[];
  rag: boolean;
  active_sessions: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class UniversalAgentService {

  /** Change this to match your backend URL */
  private readonly agentUrl = 'http://localhost:8000/agent';

  // ── Reactive state (signals) ───────────────────────────────────────────────
  readonly messages    = signal<ChatMessage[]>([]);
  readonly isLoading   = signal(false);
  readonly isStreaming = signal(false);
  readonly error       = signal<string | null>(null);

  readonly hasMessages = computed(() => this.messages().length > 0);

  private sessionId: string | null = null;

  constructor(private http: HttpClient) {
    this.sessionId = sessionStorage.getItem('agent_session_id');
  }

  // ── Send message — full response (simple) ─────────────────────────────────

  async chat(userMessage: string): Promise<string> {
    if (!userMessage.trim()) return '';

    this._addMessage({ role: 'user', content: userMessage });
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const res = await firstValueFrom(
        this.http.post<{ session_id: string; message: string; agent_name: string }>(
          `${this.agentUrl}/chat`,
          { message: userMessage, session_id: this.sessionId }
        )
      );
      this._saveSession(res.session_id);
      this._addMessage({ role: 'agent', content: res.message });
      return res.message;
    } catch (err: any) {
      const msg = err?.error?.detail || err?.message || 'Agent unavailable';
      this.error.set(msg);
      return '';
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Send message — streaming (tokens appear as they arrive) ───────────────

  async chatStream(userMessage: string): Promise<void> {
    if (!userMessage.trim()) return;

    this._addMessage({ role: 'user', content: userMessage });
    this.isStreaming.set(true);
    this.error.set(null);

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
      throw new Error(`HTTP ${response.status}`);
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

  private _handleSseLine(line: string, agentMsgIndex: number): void {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') return;

    try {
      const event = JSON.parse(raw);
      if (event.type === 'session') {
        this._saveSession(event.session_id);
      } else if (event.type === 'token') {
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[agentMsgIndex] = {
            ...updated[agentMsgIndex],
            content: updated[agentMsgIndex].content + event.token,
          };
          return updated;
        });
      } else if (event.type === 'done') {
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[agentMsgIndex] = { ...updated[agentMsgIndex], streaming: false };
          return updated;
        });
      } else if (event.type === 'error') {
        this.error.set(event.message || 'Stream error');
      }
    } catch {
      // ignore malformed SSE lines
    }
  }

  // ── Clear session ──────────────────────────────────────────────────────────

  async clearSession(): Promise<void> {
    if (this.sessionId) {
      try {
        await firstValueFrom(
          this.http.post(`${this.agentUrl}/clear`, { session_id: this.sessionId })
        );
      } catch { /* ignore */ }
    }
    this.sessionId = null;
    sessionStorage.removeItem('agent_session_id');
    this.messages.set([]);
    this.error.set(null);
  }

  // ── Health check ───────────────────────────────────────────────────────────

  async health(): Promise<AgentHealth | null> {
    try {
      return await firstValueFrom(
        this.http.get<AgentHealth>(`${this.agentUrl}/health`)
      );
    } catch {
      return null;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _addMessage(msg: Omit<ChatMessage, 'timestamp'>): void {
    this.messages.update(msgs => [...msgs, { ...msg, timestamp: new Date() }]);
  }

  private _saveSession(id: string): void {
    this.sessionId = id;
    sessionStorage.setItem('agent_session_id', id);
  }
}
