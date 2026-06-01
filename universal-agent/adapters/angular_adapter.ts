/**
 * Universal Agent — Angular Adapter
 * Drop this service into any Angular app and inject it wherever needed.
 *
 * Setup:
 *   1. Copy this file to your Angular project: src/app/services/universal-agent.service.ts
 *   2. Set AGENT_URL to your running agent server
 *   3. Inject UniversalAgentService in any component
 */
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
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

@Injectable({ providedIn: 'root' })
export class UniversalAgentService {
  private readonly AGENT_URL = 'http://localhost:8000/agent';
  private sessionId = this._loadOrCreateSession();

  // Reactive state — use in templates with signals
  messages = signal<ChatMessage[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  async chat(userMessage: string): Promise<string> {
    this.isLoading.set(true);
    this.error.set(null);

    this.messages.update(msgs => [
      ...msgs,
      { role: 'user', text: userMessage, timestamp: new Date() }
    ]);

    try {
      const res = await firstValueFrom(
        this.http.post<{ session_id: string; message: string; agent_name: string }>(
          `${this.AGENT_URL}/chat`,
          { message: userMessage, session_id: this.sessionId }
        )
      );
      this.sessionId = res.session_id;
      this._saveSession(this.sessionId);

      this.messages.update(msgs => [
        ...msgs,
        { role: 'agent', text: res.message, timestamp: new Date() }
      ]);

      return res.message;
    } catch (err: any) {
      const msg = err?.error?.detail || 'Agent unavailable. Please try again.';
      this.error.set(msg);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearSession(): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.AGENT_URL}/clear`, { session_id: this.sessionId })
    );
    sessionStorage.removeItem('ua_session_id');
    this.sessionId = this._loadOrCreateSession();
    this.messages.set([]);
  }

  async health(): Promise<AgentHealth> {
    return firstValueFrom(this.http.get<AgentHealth>(`${this.AGENT_URL}/health`));
  }

  private _loadOrCreateSession(): string {
    return sessionStorage.getItem('ua_session_id') || this._newSession();
  }

  private _newSession(): string {
    const id = 'sess_' + Math.random().toString(36).slice(2);
    sessionStorage.setItem('ua_session_id', id);
    return id;
  }

  private _saveSession(id: string): void {
    sessionStorage.setItem('ua_session_id', id);
  }
}
