import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatternsService } from '../shared/services/patterns.service';

const SYSTEM_PROMPT = `You are Aarav, an AI Engineer Architect assistant embedded inside the AI System Design Blueprint — an interactive reference covering patterns P1 through P23.

Your ONLY domain is:
FOUNDATION TIER
- P1: Plain LLM Application
- P2: RAG Application
- P3: Agent + Tool Calling
- P4: Memory-Based AI
- P5: Streaming + Async Jobs
RETRIEVAL TIER
- P6: Multi-Agent Systems
- P7: Guardrails & Safety
- P8: Vector Database Design
- P9: Hybrid Search
- P10: Fine-Tuning & PEFT
PRODUCTION TIER
- P11: Caching Strategy
- P12: Observability & Evals
- P13: Cost & Latency Optimisation
- P14: Prompt Injection Defence
- P15: PII & Data Privacy
ENGINEERING TIER
- P16: Model Selection Framework
- P17: Evaluation Framework
- P18: Structured Output Generation
- P19: Latency Optimisation
- P20: Compound AI Systems
OPERATIONS TIER
- P21: Production Monitoring & Drift
- P22: Deployment Strategies (Blue-Green, Canary, Shadow, Feature Flags)
- P23: Data Engineering for AI

Rules:
1. ONLY answer questions about these 23 patterns, production AI engineering, FastAPI, LangChain, LangGraph, vector databases, guardrails, and related implementation topics.
2. If asked anything outside this domain (personal questions, general coding, unrelated topics), reply: "I'm scoped to the AI System Design Blueprint (P1–P23). Ask me about RAG, agents, guardrails, fine-tuning, model selection, evals, deployments, or any of the 23 patterns."
3. Always reference which pattern number is relevant. Be concrete and code-oriented.
4. Keep answers concise — 3–5 sentences unless the user asks for elaboration.`;

@Component({
  selector: 'app-book-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule],
  templateUrl: './book-shell.component.html',
  styleUrls: ['./book-shell.component.scss'],
})
export class BookShellComponent {
  ps = inject(PatternsService);
  patterns = this.ps.patterns;
  sidebarCollapsed = signal(false);
  chatOpen = signal(false);
  messages: { role: 'user' | 'ai'; text: string }[] = [];
  input = '';
  loading = false;
  private readonly sessionId = 'book-' + Math.random().toString(36).slice(2);

  tiers = [
    { num: 1, label: 'Foundation', color: '#3b82f6', open: signal(true) },
    { num: 2, label: 'Retrieval', color: '#8b5cf6', open: signal(true) },
    { num: 3, label: 'Production', color: '#10b981', open: signal(true) },
    { num: 4, label: 'Safety', color: '#f59e0b', open: signal(true) },
    { num: 5, label: 'Engineering', color: '#0ea5e9', open: signal(true) },
    { num: 6, label: 'Operations', color: '#e11d48', open: signal(true) },
  ];

  byTier(t: number) {
    return this.patterns.filter(p => p.tier === t);
  }

  toggleTier(tier: { open: ReturnType<typeof signal<boolean>> }) {
    tier.open.set(!tier.open());
  }

  async send() {
    const msg = this.input.trim();
    if (!msg || this.loading) return;
    this.input = '';
    this.messages.push({ role: 'user', text: msg });
    this.loading = true;
    try {
      const res = await fetch('http://localhost:8000/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          session_id: this.sessionId,
          system_prompt: SYSTEM_PROMPT,
        }),
      });
      const data = await res.json();
      const reply = data.response ?? data.message ?? data.reply ?? JSON.stringify(data);
      this.messages.push({ role: 'ai', text: reply });
    } catch {
      this.messages.push({ role: 'ai', text: '⚠️ Aarav is offline. Start the Universal Agent: cd universal-agent && ./start-agent.sh' });
    }
    this.loading = false;
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }
}
