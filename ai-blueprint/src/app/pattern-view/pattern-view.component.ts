import { Component, inject, OnInit, signal, HostListener } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PatternsService, Pattern, FlowNode } from '../shared/services/patterns.service';

@Component({
  selector: 'app-pattern-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pattern-view.component.html',
  styleUrls: ['./pattern-view.component.scss'],
})
export class PatternViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ps = inject(PatternsService);

  pattern = signal<Pattern | null>(null);
  activeNode = signal<FlowNode | null>(null);
  panelOpen = signal(false);
  panelHeight = signal(340);

  dragging = false;
  dragStartY = 0;
  dragStartH = 0;

  ngOnInit() {
    this.route.paramMap.subscribe(p => {
      const id = p.get('id') ?? '';
      this.pattern.set(this.ps.getPattern(id) ?? null);
      this.panelOpen.set(false);
      this.activeNode.set(null);
    });
  }

  openPanel(node: FlowNode) {
    this.activeNode.set(node);
    this.panelOpen.set(true);
  }

  closePanel() {
    this.panelOpen.set(false);
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
    const newH = Math.min(Math.max(this.dragStartH + delta, 180), window.innerHeight * 0.8);
    this.panelHeight.set(Math.round(newH));
  }

  @HostListener('window:mouseup')
  onMouseUp() { this.dragging = false; }

  prev() { const p = this.pattern(); return p && p.number > 1 ? this.ps.getPatternByNumber(p.number - 1)?.id ?? null : null; }
  next() { const p = this.pattern(); return p && p.number < 23 ? this.ps.getPatternByNumber(p.number + 1)?.id ?? null : null; }

  statusColor(c: string) {
    return { green: '#16a34a', amber: '#d97706', rose: '#e11d48', blue: '#2563eb', slate: '#475569' }[c] ?? '#64748b';
  }

  statusBg(c: string) {
    return { green: '#f0fdf4', amber: '#fffbeb', rose: '#fff1f2', blue: '#eff6ff', slate: '#f8fafc' }[c] ?? '#f8fafc';
  }

  statusBorder(c: string) {
    return { green: '#bbf7d0', amber: '#fde68a', rose: '#fecdd3', blue: '#bfdbfe', slate: '#e2e8f0' }[c] ?? '#e2e8f0';
  }

  tierColor(tier: number) {
    return ['', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#0ea5e9', '#e11d48'][tier] ?? '#3b82f6';
  }
}
