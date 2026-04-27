import { Component, HostListener, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from './services/execution-state.service';
import { InputPanelComponent } from './components/input-panel/input-panel.component';
import { FlowDiagramComponent } from './components/flow-diagram/flow-diagram.component';
import { CodePanelComponent } from './components/code-panel/code-panel.component';
import { EndpointGraphComponent } from './components/endpoint-graph/endpoint-graph.component';

type DragTarget = 'left' | 'graph' | null;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    InputPanelComponent,
    FlowDiagramComponent,
    CodePanelComponent,
    EndpointGraphComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly execState = inject(ExecutionStateService);

  // ── Resize state (mid-row work columns + left input) ─────────────────────
  // Header and Flow strip are fixed-size by design.
  leftWidth   = signal(290);     // Input panel width (px)
  graphWidth  = signal(560);     // Graph col width   (px)

  // ── Layout toggles ────────────────────────────────────────────────────────
  codeExpanded   = signal(false);
  graphCollapsed = signal(false);

  // ── Drag internals ────────────────────────────────────────────────────────
  private _dragging: DragTarget = null;
  private _startX = 0;
  private _startVal = 0;

  isDragging = signal(false);

  readonly draggingClass = computed(() =>
    this.isDragging() ? 'dragging-h' : ''
  );

  startDrag(target: DragTarget, e: MouseEvent): void {
    if (!target) return;
    this._dragging = target;
    this._startX   = e.clientX;
    this._startVal = target === 'left'  ? this.leftWidth()
                   : target === 'graph' ? this.graphWidth()
                   :                       0;
    this.isDragging.set(true);
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this._dragging) return;
    const dx = e.clientX - this._startX;
    switch (this._dragging) {
      case 'left':
        this.leftWidth.set(this._clamp(this._startVal + dx, 220, 520));
        break;
      case 'graph':
        this.graphWidth.set(this._clamp(this._startVal + dx, 320, 1400));
        break;
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this._dragging = null;
    this.isDragging.set(false);
  }

  private _clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
