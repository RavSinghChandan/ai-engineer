import { Component, HostListener, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from './services/execution-state.service';
import { InputPanelComponent } from './components/input-panel/input-panel.component';
import { FlowDiagramComponent } from './components/flow-diagram/flow-diagram.component';
import { StepTimelineComponent } from './components/step-timeline/step-timeline.component';
import { CodePanelComponent } from './components/code-panel/code-panel.component';
import { JsonPanelComponent } from './components/json-panel/json-panel.component';

type DragTarget = 'left' | 'timeline' | 'flow' | null;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    InputPanelComponent,
    FlowDiagramComponent,
    StepTimelineComponent,
    CodePanelComponent,
    JsonPanelComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly execState = inject(ExecutionStateService);

  // ── Resize state ─────────────────────────────────────────────────────────
  leftWidth     = signal(310);
  timelineWidth = signal(265);
  flowHeight    = signal(140);   // height of the flow-diagram panel (px)

  // ── Layout toggles ────────────────────────────────────────────────────────
  codeExpanded  = signal(false); // expand code panel to fill the full right column
  jsonCollapsed = signal(false); // collapse the JSON accordion panel

  // ── Drag internals ────────────────────────────────────────────────────────
  private _dragging: DragTarget = null;
  private _startX = 0;
  private _startY = 0;
  private _startVal = 0;

  isDragging   = signal(false);
  dragDir      = signal<'h' | 'v'>('h'); // 'h' = horizontal, 'v' = vertical

  readonly draggingClass = computed(() => {
    if (!this.isDragging()) return '';
    return this.dragDir() === 'v' ? 'dragging-v' : 'dragging-h';
  });

  startDrag(target: DragTarget, e: MouseEvent): void {
    this._dragging = target;
    this._startX   = e.clientX;
    this._startY   = e.clientY;
    this._startVal = target === 'left'     ? this.leftWidth()
                   : target === 'timeline' ? this.timelineWidth()
                   :                        this.flowHeight();
    this.isDragging.set(true);
    this.dragDir.set(target === 'flow' ? 'v' : 'h');
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this._dragging) return;
    if (this._dragging === 'flow') {
      const delta = e.clientY - this._startY;
      this.flowHeight.set(Math.max(80, Math.min(240, this._startVal + delta)));
    } else if (this._dragging === 'left') {
      const delta = e.clientX - this._startX;
      this.leftWidth.set(Math.max(220, Math.min(520, this._startVal + delta)));
    } else {
      const delta = e.clientX - this._startX;
      this.timelineWidth.set(Math.max(180, Math.min(440, this._startVal + delta)));
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this._dragging = null;
    this.isDragging.set(false);
  }
}
