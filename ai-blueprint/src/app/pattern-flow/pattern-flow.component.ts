import { Component, inject, OnInit, signal, HostListener } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatternsService, Pattern, FlowNode } from '../shared/services/patterns.service';

@Component({
  selector: 'app-pattern-flow',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './pattern-flow.component.html',
  styleUrls: ['./pattern-flow.component.scss'],
})
export class PatternFlowComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private ps = inject(PatternsService);

  pattern = signal<Pattern | null>(null);
  activeNode = signal<FlowNode | null>(null);
  panelOpen = signal(false);
  panelHeight = signal(320);
  dragging = false;
  dragStartY = 0;
  dragStartH = 0;

  agentOpen = signal(false);
  agentMessages = signal<{ role: 'user' | 'ai'; text: string }[]>([]);
  agentInput = '';
  agentLoading = false;
  private sessionId = 'blueprint-' + Math.random().toString(36).slice(2);

  ngOnInit() {
    this.route.paramMap.subscribe(p => {
      const id = p.get('id') ?? '';
      const pat = this.ps.getPattern(id);
      this.pattern.set(pat ?? null);
    });
  }

  openPanel(node: FlowNode) {
    this.activeNode.set(node);
    this.panelOpen.set(true);
  }

  closePanel() {
    this.panelOpen.set(false);
    this.activeNode.set(null);
  }

  allNodes(nodes: FlowNode[]): FlowNode[] {
    const flat: FlowNode[] = [];
    for (const n of nodes) {
      if (n.isGroup && n.children) {
        flat.push(...n.children);
      } else if (!n.isGroup) {
        flat.push(n);
      }
    }
    return flat;
  }

  onDragStart(e: MouseEvent) {
    this.dragging = true;
    this.dragStartY = e.clientY;
    this.dragStartH = this.panelHeight();
    e.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    if (!this.dragging) return;
    const delta = this.dragStartY - e.clientY;
    const newH = Math.min(Math.max(this.dragStartH + delta, 160), window.innerHeight * 0.75);
    this.panelHeight.set(newH);
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    this.dragging = false;
  }

  navPatterns() {
    return this.ps.patterns;
  }

  prev(): string | null {
    const p = this.pattern();
    if (!p || p.number <= 1) return null;
    return this.ps.getPatternByNumber(p.number - 1)?.id ?? null;
  }

  next(): string | null {
    const p = this.pattern();
    if (!p || p.number >= 15) return null;
    return this.ps.getPatternByNumber(p.number + 1)?.id ?? null;
  }

  async sendAgent() {
    const msg = this.agentInput.trim();
    if (!msg) return;
    this.agentInput = '';
    this.agentMessages.update(m => [...m, { role: 'user', text: msg }]);
    this.agentLoading = true;
    try {
      const resp = await fetch('http://localhost:8000/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, session_id: this.sessionId }),
      });
      const data = await resp.json();
      const reply = data.response ?? data.message ?? data.reply ?? JSON.stringify(data);
      this.agentMessages.update(m => [...m, { role: 'ai', text: reply }]);
    } catch {
      this.agentMessages.update(m => [...m, { role: 'ai', text: '⚠️ Agent offline. Run ./start-agent.sh to start Aarav.' }]);
    }
    this.agentLoading = false;
  }

  onAgentKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendAgent(); }
  }
}
