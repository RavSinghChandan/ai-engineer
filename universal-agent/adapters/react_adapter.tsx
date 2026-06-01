/**
 * Universal Agent — React Hook + Component
 * Drop into any React/Next.js app.
 *
 * Usage:
 *   import { useUniversalAgent } from './react_adapter'
 *
 *   function MyComponent() {
 *     const { chat, messages, isLoading } = useUniversalAgent()
 *     ...
 *   }
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:8000';

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

interface AgentState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  chat: (message: string) => Promise<string>;
  clearSession: () => Promise<void>;
}

function loadOrCreateSession(): string {
  if (typeof window === 'undefined') return 'ssr_session';
  const existing = sessionStorage.getItem('ua_session_id');
  if (existing) return existing;
  const id = 'sess_' + Math.random().toString(36).slice(2);
  sessionStorage.setItem('ua_session_id', id);
  return id;
}

export function useUniversalAgent(): AgentState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string>(loadOrCreateSession());

  const chat = useCallback(async (userMessage: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text: userMessage, timestamp: new Date() }]);

    try {
      const res = await fetch(`${AGENT_URL}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, session_id: sessionRef.current }),
      });

      if (!res.ok) throw new Error(`Agent returned ${res.status}`);
      const data = await res.json();

      sessionRef.current = data.session_id;
      sessionStorage.setItem('ua_session_id', data.session_id);

      setMessages(prev => [...prev, { role: 'agent', text: data.message, timestamp: new Date() }]);
      return data.message;
    } catch (err: any) {
      const msg = err.message || 'Agent unavailable.';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSession = useCallback(async () => {
    await fetch(`${AGENT_URL}/agent/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionRef.current }),
    });
    sessionStorage.removeItem('ua_session_id');
    sessionRef.current = loadOrCreateSession();
    setMessages([]);
  }, []);

  return { messages, isLoading, error, chat, clearSession };
}

// ─── Ready-to-use React Widget Component ───────────────────────────────────

export function AgentWidget({ primaryColor = '#2563eb', agentName = 'Assistant' }) {
  const { messages, isLoading, chat, clearSession } = useUniversalAgent();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await chat(text);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ background: primaryColor, color: '#fff', border: 'none', borderRadius: 50, padding: '12px 20px', cursor: 'pointer', fontWeight: 700, boxShadow: '0 4px 20px rgba(37,99,235,0.4)' }}
        >
          Ask me anything
        </button>
      )}
      {open && (
        <div style={{ width: 360, height: 520, background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb' }}>
          <div style={{ background: primaryColor, color: '#fff', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px 12px 0 0' }}>
            <span style={{ fontWeight: 700 }}>💬 {agentName}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Hi! How can I help you today?</div>}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? primaryColor : '#f3f4f6', color: m.role === 'user' ? '#fff' : '#1f2937', fontSize: 14, lineHeight: 1.5 }}>
                {m.text}
              </div>
            ))}
            {isLoading && <div style={{ color: '#9ca3af', fontSize: 14, fontStyle: 'italic' }}>Thinking...</div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Type your question..."
              style={{ flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }}
            />
            <button onClick={send} disabled={isLoading} style={{ background: primaryColor, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 18 }}>➤</button>
          </div>
          <button onClick={clearSession} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: '4px 12px 8px', textAlign: 'right' }}>Clear conversation</button>
        </div>
      )}
    </div>
  );
}
