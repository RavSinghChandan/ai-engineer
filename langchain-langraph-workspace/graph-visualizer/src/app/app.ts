import { Component, inject, OnInit, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionEngineService } from './services/execution-engine.service';
import { FlowStripComponent }    from './components/flow-strip/flow-strip.component';
import { GraphPanelComponent }   from './components/step-timeline/step-timeline.component';
import { CodePanelComponent }    from './components/code-panel/code-panel.component';
import { JsonPanelComponent }    from './components/json-panel/json-panel.component';
import { InputPanelComponent }   from './components/input-panel/input-panel.component';
import { TopBarComponent }       from './components/top-bar/top-bar.component';
import { LangraphBankingAdapter } from './adapters/langraph-banking.adapter';
import { LangChainAdapter }       from './adapters/langchain.adapter';
import { AgenticGrowthOSAdapter } from './adapters/agentic-growth-os.adapter';
import { BenchOptimizerAdapter }  from './adapters/bench-optimizer.adapter';
import { VisualizerAdapter }      from './models/visualizer.models';

const ADAPTERS: { key: string; label: string; sub: string; adapter: VisualizerAdapter }[] = [
  { key: 'langraph',  label: 'LangGraph Banking',  sub: 'StateGraph • Agents • RAG', adapter: LangraphBankingAdapter },
  { key: 'langchain', label: 'LangChain Service',   sub: 'Chains • Tools • Memory',  adapter: LangChainAdapter },
  { key: 'growth-os', label: 'Agentic Growth OS',   sub: 'LangGraph • 5 Nodes • Memory', adapter: AgenticGrowthOSAdapter },
  { key: 'bench',     label: 'Bench Optimizer',     sub: 'DeepSeek • FAISS • Async Plan', adapter: BenchOptimizerAdapter },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent,
    InputPanelComponent,
    FlowStripComponent,
    GraphPanelComponent,
    CodePanelComponent,
    JsonPanelComponent,
  ],
  template: `
    <div class="app-shell">

      <!-- Top area: top-bar + project switcher tabs -->
      <div class="top-area">
        <gv-top-bar />
        <div class="switcher-bar">
          <span class="sw-label">Project</span>
          @for (a of adapters; track a.key) {
            <button class="sw-btn" [class.sw-active]="activeKey() === a.key"
                    (click)="switchAdapter(a.key)">
              <span class="sw-name">{{ a.label }}</span>
              <span class="sw-sub">{{ a.sub }}</span>
            </button>
          }
        </div>
      </div>

      <main class="main-layout">
        <!-- Left sidebar (resizable) -->
        <aside class="left-col" [style.width.px]="leftWidth()">
          <gv-input-panel />
        </aside>

        <!-- Horizontal resize handle: left col ↔ right col -->
        <div class="resize-h" (mousedown)="startResizeH($event)"></div>

        <!-- Right content area -->
        <section class="right-col">

          <!-- Flow strip (vertically resizable via flow handle) -->
          <div class="panel flow-panel" [style.height.px]="flowHeight()">
            <gv-flow-strip />
          </div>
          <div class="resize-v resize-v-flow" (mousedown)="startResizeFlow($event)"></div>

          <!-- Mid row: graph panel + code panel -->
          <div class="mid-row" [style.flex]="midFlex()">
            <div class="panel graph-panel-host" [style.width.px]="graphWidth()">
              <gv-graph-panel />
            </div>
            <!-- Horizontal resize handle: graph ↔ code -->
            <div class="resize-h resize-h-mid" (mousedown)="startResizeMid($event)"></div>
            <div class="panel code-panel-host">
              <gv-code-panel />
            </div>
          </div>

          <!-- Vertical resize handle: mid row ↔ json panel -->
          <div class="resize-v resize-v-json" (mousedown)="startResizeJson($event)"></div>

          <!-- JSON panel (resizable height) -->
          <div class="panel json-panel-host" [style.height.px]="jsonHeight()">
            <gv-json-panel />
          </div>

        </section>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .app-shell {
      display: flex; flex-direction: column; height: 100vh;
      background: #f0f2f8;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }

    /* ── Top area ── */
    .top-area {
      display: flex; flex-direction: column; flex-shrink: 0;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
    }

    .switcher-bar {
      display: flex; align-items: center; gap: 3px;
      padding: 4px 16px 5px;
      border-top: 1px solid #f0f2f8;
      overflow-x: auto; scrollbar-width: none;
    }
    .switcher-bar::-webkit-scrollbar { display: none; }

    .sw-label {
      font-size: 8.5px; color: #c4c9d6; text-transform: uppercase;
      letter-spacing: 0.1em; font-weight: 700; margin-right: 6px; flex-shrink: 0;
      white-space: nowrap;
    }
    .sw-btn {
      display: flex; flex-direction: column; align-items: flex-start;
      background: transparent; border: 1px solid transparent;
      border-radius: 7px; padding: 4px 11px; cursor: pointer;
      transition: all 0.15s; gap: 1px; flex-shrink: 0;
    }
    .sw-btn:hover { border-color: #e5e7eb; background: #f9fafb; }
    .sw-active {
      border-color: #6366f1 !important;
      background: rgba(99,102,241,0.06) !important;
    }
    .sw-name { font-size: 10.5px; font-weight: 700; color: #374151; white-space: nowrap; line-height: 1.3; }
    .sw-sub  { font-size: 8px; color: #9ca3af; white-space: nowrap; line-height: 1.3; }
    .sw-active .sw-name { color: #4f46e5; }
    .sw-active .sw-sub  { color: #818cf8; }

    /* ── Main layout ── */
    .main-layout {
      display: flex; flex: 1; overflow: hidden;
      padding: 10px; gap: 0; box-sizing: border-box;
    }

    /* Resize handles */
    .resize-h {
      width: 6px; flex-shrink: 0; cursor: col-resize;
      background: transparent; transition: background 0.15s;
      border-radius: 3px; margin: 0 2px;
      position: relative; z-index: 10;
    }
    .resize-h:hover, .resize-h:active { background: rgba(99,102,241,0.25); }

    .resize-v {
      height: 6px; flex-shrink: 0; cursor: row-resize;
      background: transparent; transition: background 0.15s;
      border-radius: 3px; margin: 2px 0;
      position: relative; z-index: 10;
    }
    .resize-v:hover, .resize-v:active { background: rgba(99,102,241,0.25); }

    /* Left col */
    .left-col {
      flex-shrink: 0;
      background: #ffffff;
      border-radius: 14px; border: 1px solid #e8eaf0;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      min-width: 220px; max-width: 480px;
    }

    /* Right col */
    .right-col {
      flex: 1; display: flex; flex-direction: column;
      gap: 0; overflow: hidden; min-width: 0;
    }

    /* Generic panel */
    .panel {
      border-radius: 12px; border: 1px solid #e8eaf0; overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }

    /* Flow panel */
    .flow-panel { flex-shrink: 0; background: #ffffff; min-height: 60px; max-height: 140px; }

    /* Mid row */
    .mid-row { display: flex; gap: 0; overflow: hidden; min-height: 120px; }

    .graph-panel-host {
      flex-shrink: 0; overflow: hidden;
      display: flex; flex-direction: column;
      background: #ffffff;
      min-width: 200px; max-width: 600px;
    }
    .code-panel-host {
      flex: 1; overflow: hidden; min-width: 0;
      display: flex; flex-direction: column;
      background: #ffffff;
    }

    /* JSON panel */
    .json-panel-host { flex-shrink: 0; background: #ffffff; min-height: 42px; max-height: 300px; }
  `]
})
export class App implements OnInit {
  private eng = inject(ExecutionEngineService);

  readonly adapters = ADAPTERS;
  readonly activeKey = signal<string>('langraph');

  // Panel sizes (signals for reactivity)
  readonly leftWidth  = signal(300);
  readonly flowHeight = signal(88);
  readonly graphWidth = signal(380);
  readonly jsonHeight = signal(120);
  readonly midFlex    = signal('1');

  // Resize state
  private _resizing: 'left-h' | 'mid-h' | 'flow-v' | 'json-v' | null = null;
  private _startX = 0;
  private _startY = 0;
  private _startVal = 0;

  ngOnInit(): void { this.eng.setAdapter(LangraphBankingAdapter); }

  switchAdapter(key: string): void {
    const found = ADAPTERS.find(a => a.key === key);
    if (!found || key === this.activeKey()) return;
    this.activeKey.set(key);
    this.eng.setAdapter(found.adapter);
  }

  // ── Resize: left sidebar width ──
  startResizeH(e: MouseEvent): void {
    this._resizing = 'left-h';
    this._startX   = e.clientX;
    this._startVal = this.leftWidth();
    e.preventDefault();
  }

  // ── Resize: graph vs code (mid) ──
  startResizeMid(e: MouseEvent): void {
    this._resizing = 'mid-h';
    this._startX   = e.clientX;
    this._startVal = this.graphWidth();
    e.preventDefault();
  }

  // ── Resize: flow strip height ──
  startResizeFlow(e: MouseEvent): void {
    this._resizing = 'flow-v';
    this._startY   = e.clientY;
    this._startVal = this.flowHeight();
    e.preventDefault();
  }

  // ── Resize: json panel height ──
  startResizeJson(e: MouseEvent): void {
    this._resizing = 'json-v';
    this._startY   = e.clientY;
    this._startVal = this.jsonHeight();
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this._resizing) return;
    if (this._resizing === 'left-h') {
      const w = Math.min(480, Math.max(220, this._startVal + (e.clientX - this._startX)));
      this.leftWidth.set(w);
    } else if (this._resizing === 'mid-h') {
      const w = Math.min(600, Math.max(200, this._startVal + (e.clientX - this._startX)));
      this.graphWidth.set(w);
    } else if (this._resizing === 'flow-v') {
      const h = Math.min(140, Math.max(60, this._startVal + (e.clientY - this._startY)));
      this.flowHeight.set(h);
    } else if (this._resizing === 'json-v') {
      const h = Math.min(300, Math.max(42, this._startVal - (e.clientY - this._startY)));
      this.jsonHeight.set(h);
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void { this._resizing = null; }
}
