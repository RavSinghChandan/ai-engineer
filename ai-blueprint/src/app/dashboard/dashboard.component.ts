import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PatternsService } from '../shared/services/patterns.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  ps = inject(PatternsService);
  patterns = this.ps.patterns;

  tiers = [
    { num: 1, label: 'Foundation Patterns', color: '#3b82f6' },
    { num: 2, label: 'Advanced Retrieval', color: '#8b5cf6' },
    { num: 3, label: 'Production Quality', color: '#10b981' },
    { num: 4, label: 'Safety & Compliance', color: '#f59e0b' },
  ];

  fabOpen = false;
  agentMessages: { role: 'user' | 'ai'; text: string }[] = [];
  agentInput = '';
  agentLoading = false;
  private readonly sessionId = 'dashboard-' + Math.random().toString(36).slice(2);

  byTier(t: number) {
    return this.patterns.filter(p => p.tier === t);
  }

  async sendAgent() {
    const msg = this.agentInput.trim();
    if (!msg) return;
    this.agentInput = '';
    this.agentMessages.push({ role: 'user', text: msg });
    this.agentLoading = true;
    try {
      const resp = await fetch('http://localhost:8000/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, session_id: this.sessionId }),
      });
      const data = await resp.json();
      const reply = data.response ?? data.message ?? data.reply ?? JSON.stringify(data);
      this.agentMessages.push({ role: 'ai', text: reply });
    } catch {
      this.agentMessages.push({ role: 'ai', text: '⚠️ Agent offline. Run ./start-agent.sh to start Aarav.' });
    }
    this.agentLoading = false;
  }

  onAgentKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendAgent(); }
  }
}
