import { Component, inject, signal, computed, ElementRef, viewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionEngineService } from '../../services/execution-engine.service';
import { FlowNode, ExecutionStep } from '../../models/visualizer.models';

interface GraphNodeVM {
  node: FlowNode;
  steps: ExecutionStep[];
  firstStepIdx: number;
}

@Component({
  selector: 'gv-graph-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="graph-wrapper">

      <!-- Header bar -->
      <div class="graph-header">
        <div class="gh-left">
          <span class="gh-dot" [style.background]="accentColor()"></span>
          <span class="gh-title">GRAPH</span>
          <div class="gh-tabs">
            <button class="gh-tab" [class.gh-tab-active]="activeTab() === 'graph'" (click)="activeTab.set('graph')">Graph</button>
            <button class="gh-tab" [class.gh-tab-active]="activeTab() === 'response'" (click)="activeTab.set('response')">Response</button>
          </div>
          @if (endpointInfo()) {
            <span class="ep-badge"
                  [style.color]="accentColor()"
                  [style.border-color]="accentColor() + '33'"
                  [style.background]="accentColor() + '0d'">
              <span class="ep-badge-method" [class]="'m-' + endpointInfo()!.method.toLowerCase()">
                {{ endpointInfo()!.method }}
              </span>
              {{ endpointInfo()!.label }}
            </span>
          }
        </div>
        <div class="gh-right">
          <div class="zoom-controls">
            <button class="zoom-btn" (click)="zoomOut()">−</button>
            <span class="zoom-pct">{{ zoom() }}%</span>
            <button class="zoom-btn" (click)="zoomIn()">+</button>
            <button class="zoom-btn zoom-fit" (click)="resetZoom()">Fit</button>
          </div>
        </div>
      </div>

      <!-- Graph tab -->
      @if (activeTab() === 'graph') {
        <div class="graph-canvas">
          @if (!eng.isRunning() && !eng.isComplete()) {
            <!-- Empty state — show adapter node preview -->
            <div class="graph-preview">
              <div class="preview-start">
                <div class="ps-circle" [style.background]="accentColor()">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7L6.5 10.5L11.5 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <span class="ps-label" [style.color]="accentColor()">Start</span>
              </div>
              <div class="preview-connector"></div>
              @for (node of previewNodes(); track node.id; let last = $last) {
                <div class="preview-card" [style.border-color]="node.color + '44'">
                  <div class="pc-icon" [style.background]="node.color + '15'" [style.color]="node.color">
                    {{ node.icon }}
                  </div>
                  <div class="pc-body">
                    <span class="pc-label">{{ node.label }}</span>
                    <span class="pc-tag" [style.color]="node.color + '99'">NODE</span>
                  </div>
                  <div class="pc-status-dot"></div>
                </div>
                @if (!last) { <div class="preview-connector"></div> }
              }
              <div class="empty-hint">
                <span class="hint-icon" [style.color]="accentColor()">▶</span>
                Run a flow to see live graph execution
              </div>
            </div>

          } @else {
            <!-- Live graph -->
            <div class="graph-scroll">
              <div class="graph-inner" [style.transform]="'scale(' + zoom()/100 + ')'" [style.transform-origin]="'top center'">

                <!-- Start node -->
                <div class="start-node">
                  <div class="sn-circle" [style.background]="accentColor()" [style.box-shadow]="'0 0 16px ' + accentColor() + '44'">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7L6 10.5L11.5 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <span class="sn-label">Start</span>
                  <div class="sn-connector" [style.background]="startConnectorColor()"></div>
                </div>

                <!-- Node cards -->
                @for (vm of graphNodes(); track vm.node.id; let i = $index; let last = $last) {
                  <div class="node-card"
                       [class.nc-active]="vm.node.status === 'active'"
                       [class.nc-done]="vm.node.status === 'completed'"
                       [class.nc-pending]="vm.node.status === 'pending'"
                       [style.--accent]="accentColor()"
                       (click)="onCardClick(vm)">

                    <div class="nc-icon-wrap"
                         [style.background]="iconBg(vm.node)"
                         [style.color]="iconColor(vm.node)"
                         [style.border-color]="iconBorderColor(vm.node)">
                      @if (vm.node.status === 'completed') {
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 6.5L5 9.5L11 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      } @else if (vm.node.status === 'active') {
                        <span class="nc-spinner"></span>
                      } @else {
                        <span class="nc-letter">{{ vm.node.icon }}</span>
                      }
                    </div>

                    <div class="nc-info">
                      <span class="nc-label">{{ vm.node.label }}</span>
                      @if (vm.steps[0]?.badge) {
                        <span class="nc-badge"
                              [style.color]="badgeColor(vm.node)"
                              [style.background]="badgeBg(vm.node)">
                          {{ vm.steps[0].badge | uppercase }}
                        </span>
                      }
                    </div>

                    @if (vm.node.status === 'active') {
                      <div class="nc-pulse" [style.border-color]="accentColor()"></div>
                      <div class="nc-active-dot" [style.background]="accentColor()"></div>
                    }
                    @if (vm.node.status === 'completed') {
                      <div class="nc-check-corner">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4.5L3 6.5L7 2" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>
                    }

                    <!-- Connector to next -->
                    @if (!last) {
                      <div class="nc-connector">
                        <div class="nc-line" [style.background]="connectorColor(vm.node)"></div>
                        <div class="nc-arrow" [style.border-top-color]="connectorColor(vm.node)"></div>
                        @if (isActiveConnector(i)) {
                          <div class="nc-line-pulse" [style.background]="accentColor()"></div>
                        }
                      </div>
                    }
                  </div>
                }

                <!-- End node -->
                @if (eng.isComplete()) {
                  <div class="end-node">
                    <div class="en-circle">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <span class="en-label">Done</span>
                  </div>
                }

              </div>
            </div>
          }
        </div>
      }

      <!-- Response tab -->
      @if (activeTab() === 'response') {
        <div class="response-pane">
          @if (eng.apiResponse()) {
            <div class="resp-header">
              <span class="resp-dot-green"></span>
              <span class="resp-ok">200 OK</span>
              <span class="resp-label">API Response</span>
            </div>
            <pre class="resp-pre">{{ eng.apiResponse() | json }}</pre>
          } @else {
            <div class="resp-empty">
              <div class="re-icon">⟳</div>
              <p class="re-text">Response will appear after flow completes</p>
            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

    .graph-wrapper {
      display: flex; flex-direction: column; flex: 1; min-height: 0;
      background: #ffffff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }

    /* ── Header ── */
    .graph-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 10px;
      background: #f8f9fb;
      border-bottom: 1px solid #e8eaf0;
      flex-shrink: 0; gap: 6px; min-height: 34px;
      overflow: hidden;
    }
    .gh-left  { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; overflow: hidden; }
    .gh-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

    .gh-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
    .gh-title {
      font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
      color: #b0b7c3; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
    }

    .gh-tabs {
      display: flex; gap: 1px; flex-shrink: 0;
      background: #f0f0f5; border: 1px solid #e8eaf0;
      border-radius: 6px; padding: 2px;
    }
    .gh-tab {
      font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
      border: none; cursor: pointer; transition: all 0.15s;
      background: transparent; color: #9ca3af; white-space: nowrap;
    }
    .gh-tab:hover { color: #374151; }
    .gh-tab-active { background: #ffffff !important; color: #111827 !important;
                     box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

    .ep-badge {
      display: flex; align-items: center; gap: 4px;
      font-size: 9px; font-weight: 700; letter-spacing: 0.03em;
      padding: 2px 7px; border-radius: 5px; border: 1px solid;
      font-family: 'JetBrains Mono', monospace; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1;
      max-width: 140px;
    }
    .ep-badge-method {
      font-size: 7.5px; font-weight: 800;
      padding: 1px 4px; border-radius: 3px; flex-shrink: 0;
    }
    .m-get    { background: rgba(34,197,94,0.15);  color: #16a34a; }
    .m-post   { background: rgba(99,102,241,0.15); color: #4f46e5; }
    .m-delete { background: rgba(239,68,68,0.15);  color: #dc2626; }

    .zoom-controls {
      display: flex; align-items: center; gap: 0;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 5px;
      padding: 1px 2px;
    }
    .zoom-btn {
      background: transparent; border: none; color: #9ca3af;
      font-size: 11px; font-weight: 700; padding: 2px 5px;
      cursor: pointer; border-radius: 3px;
      transition: color 0.15s, background 0.15s; line-height: 1;
    }
    .zoom-btn:hover { color: #374151; background: #f3f4f6; }
    .zoom-fit {
      border-left: 1px solid #e5e7eb; margin-left: 1px; padding-left: 6px;
      border-radius: 0 3px 3px 0; font-size: 9px;
    }
    .zoom-pct { font-size: 9px; color: #9ca3af; min-width: 26px; text-align: center; font-variant-numeric: tabular-nums; }

    /* ── Canvas ── */
    .graph-canvas {
      flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column;
      background: #fafbff;
    }

    /* ── Preview (empty state) ── */
    .graph-preview {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; padding: 20px 0 16px;
      overflow-y: auto; overflow-x: hidden;
      scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
    }
    .preview-start {
      display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .ps-circle {
      width: 34px; height: 34px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .ps-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }

    .preview-connector {
      width: 2px; height: 26px; background: #e5e7eb; border-radius: 99px; flex-shrink: 0;
    }
    .preview-card {
      display: flex; align-items: center; gap: 10px;
      width: 210px; background: #ffffff;
      border: 1.5px solid #e8eaf0; border-radius: 12px;
      padding: 10px 12px; flex-shrink: 0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      position: relative;
    }
    .pc-icon {
      width: 30px; height: 30px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; flex-shrink: 0;
    }
    .pc-body { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .pc-label { font-size: 11px; font-weight: 600; color: #374151; }
    .pc-tag   { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .pc-status-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #e5e7eb; flex-shrink: 0;
    }

    .empty-hint {
      display: flex; align-items: center; gap: 6px;
      margin-top: 20px; padding: 7px 16px;
      background: #fff; border: 1px solid #e8eaf0; border-radius: 99px;
      font-size: 10px; color: #9ca3af;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    /* ── Live graph ── */
    .graph-scroll {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
      padding: 0;
    }
    .graph-scroll::-webkit-scrollbar { width: 4px; }
    .graph-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }

    .graph-inner {
      display: flex; flex-direction: column; align-items: center;
      padding: 20px 20px 40px;
      transform-origin: top center; transition: transform 0.2s;
      min-height: 100%; box-sizing: border-box;
    }

    /* Start node */
    .start-node {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      flex-shrink: 0;
    }
    .sn-circle {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .sn-label {
      font-size: 9px; font-weight: 700; color: #9ca3af;
      letter-spacing: 0.1em; text-transform: uppercase;
    }
    .sn-connector {
      width: 2px; height: 24px; border-radius: 99px; opacity: 0.6;
    }

    /* Node card */
    .node-card {
      position: relative;
      display: flex; align-items: center; gap: 10px;
      width: 224px;
      background: #ffffff;
      border: 1.5px solid #e8eaf0;
      border-radius: 12px;
      padding: 11px 13px;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      flex-shrink: 0;
      box-sizing: border-box;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      margin-bottom: 28px;
    }
    .node-card:last-of-type { margin-bottom: 0; }
    .node-card:hover:not(.nc-pending) {
      border-color: #c7d2fe;
      box-shadow: 0 2px 12px rgba(99,102,241,0.08);
    }

    .nc-active {
      border-color: var(--accent, #6366f1) !important;
      background: #f5f3ff !important;
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--accent,#6366f1) 10%, transparent),
        0 4px 20px color-mix(in srgb, var(--accent,#6366f1) 12%, transparent) !important;
    }
    .nc-done {
      border-color: rgba(34,197,94,0.3) !important;
      background: #f0fdf4 !important;
    }
    .nc-pending { opacity: 0.5; cursor: default; }

    .nc-icon-wrap {
      width: 34px; height: 34px; border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      border: 1.5px solid; flex-shrink: 0;
      font-size: 13px; font-weight: 800; transition: all 0.2s;
    }
    .nc-letter { font-size: 12px; font-weight: 800; line-height: 1; }
    .nc-spinner {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: white;
      animation: nc-spin 0.7s linear infinite; display: inline-block;
    }
    @keyframes nc-spin { to { transform: rotate(360deg); } }

    .nc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .nc-label {
      font-size: 12px; font-weight: 600; color: #374151;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;
    }
    .nc-active .nc-label  { color: #4338ca; font-weight: 700; }
    .nc-done .nc-label    { color: #15803d; }
    .nc-pending .nc-label { color: #9ca3af; }

    .nc-badge {
      font-size: 8px; font-weight: 800; letter-spacing: 0.08em;
      padding: 1px 6px; border-radius: 4px;
      display: inline-block; width: fit-content; white-space: nowrap;
    }

    .nc-pulse {
      position: absolute; inset: -4px; border-radius: 15px;
      border: 1.5px solid;
      animation: nc-pulse-anim 2s ease-in-out infinite; pointer-events: none;
    }
    @keyframes nc-pulse-anim {
      0%, 100% { opacity: 0; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(1.02); }
    }
    .nc-active-dot {
      position: absolute; top: 8px; right: 8px;
      width: 6px; height: 6px; border-radius: 50%;
      animation: blink-dot 1.4s ease-in-out infinite;
    }
    @keyframes blink-dot { 0%,100%{opacity:1} 50%{opacity:0.2} }
    .nc-check-corner {
      position: absolute; top: 7px; right: 8px;
      width: 16px; height: 16px; border-radius: 50%;
      background: rgba(34,197,94,0.12);
      display: flex; align-items: center; justify-content: center;
    }

    /* Connectors */
    .nc-connector {
      position: absolute; bottom: -28px; left: 50%;
      transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center;
      height: 28px; width: 20px; z-index: 0;
    }
    .nc-line {
      width: 2px; flex: 1; border-radius: 99px; transition: background 0.3s;
    }
    .nc-arrow {
      width: 0; height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 6px solid; transition: border-top-color 0.3s; flex-shrink: 0;
    }
    .nc-line-pulse {
      position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      width: 2px; height: 0; border-radius: 99px;
      animation: line-flow 1.2s ease-in-out infinite;
    }
    @keyframes line-flow {
      0%   { height: 0; top: 0; opacity: 1; }
      100% { height: 100%; top: 0; opacity: 0; }
    }

    /* End node */
    .end-node {
      display: flex; flex-direction: column; align-items: center; gap: 5px; margin-top: 4px;
    }
    .en-circle {
      width: 32px; height: 32px; border-radius: 50%; background: #22c55e;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 14px rgba(34,197,94,0.35);
      animation: done-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
    }
    @keyframes done-pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .en-label { font-size: 9px; font-weight: 700; color: #22c55e; letter-spacing: 0.1em; text-transform: uppercase; }

    /* ── Response pane ── */
    .response-pane {
      flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fafbff;
    }
    .resp-header {
      display: flex; align-items: center; gap: 7px;
      padding: 8px 14px;
      background: #f8f9fb; border-bottom: 1px solid #e8eaf0; flex-shrink: 0;
    }
    .resp-dot-green {
      width: 7px; height: 7px; border-radius: 50%;
      background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.4);
    }
    .resp-ok { font-size: 9px; font-weight: 800; color: #15803d; padding: 1px 6px; background: rgba(34,197,94,0.1); border-radius: 4px; }
    .resp-label { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; }
    .resp-pre {
      flex: 1; margin: 0; padding: 14px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10.5px; color: #374151; line-height: 1.75;
      overflow: auto; scrollbar-width: thin; white-space: pre-wrap;
    }
    .resp-empty {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 8px;
    }
    .re-icon { font-size: 28px; color: #d1d5db; }
    .re-text  { font-size: 11px; color: #9ca3af; }
  `]
})
export class GraphPanelComponent {
  readonly eng = inject(ExecutionEngineService);
  readonly activeTab = signal<'graph' | 'response'>('graph');
  readonly zoom = signal(80);

  readonly previewNodes = computed(() => this.eng.nodes().slice(0, 7));

  readonly graphNodes = computed<GraphNodeVM[]>(() => {
    const nodes = this.eng.nodes();
    const steps = this.eng.steps();
    return nodes.map(node => ({
      node,
      steps: steps.filter(s => s.nodeId === node.id),
      firstStepIdx: steps.findIndex(s => s.nodeId === node.id),
    }));
  });

  readonly accentColor = computed(() => this.eng.adapter()?.accentColor ?? '#6366f1');

  readonly endpointInfo = computed<{ method: string; label: string } | null>(() => {
    const ep = this.eng.getEndpoint(this.eng.currentEndpointId());
    if (!ep) return null;
    return { method: ep.method, label: ep.label };
  });

  startConnectorColor(): string {
    const first = this.graphNodes()[0];
    if (!first) return '#e5e7eb';
    return first.node.status === 'completed' ? '#22c55e'
         : first.node.status === 'active'    ? this.accentColor()
         : '#e5e7eb';
  }

  connectorColor(node: FlowNode): string {
    return node.status === 'completed' ? '#22c55e'
         : node.status === 'active'    ? this.accentColor()
         : '#e5e7eb';
  }

  isActiveConnector(i: number): boolean {
    const vms = this.graphNodes();
    return vms[i]?.node.status === 'active' || vms[i + 1]?.node.status === 'active';
  }

  iconBg(node: FlowNode): string {
    if (node.status === 'completed') return 'rgba(34,197,94,0.1)';
    if (node.status === 'active')    return `${this.accentColor()}20`;
    return '#f8f9fb';
  }
  iconColor(node: FlowNode): string {
    if (node.status === 'completed') return '#22c55e';
    if (node.status === 'active')    return this.accentColor();
    return '#9ca3af';
  }
  iconBorderColor(node: FlowNode): string {
    if (node.status === 'completed') return 'rgba(34,197,94,0.25)';
    if (node.status === 'active')    return `${this.accentColor()}44`;
    return '#e8eaf0';
  }
  badgeColor(node: FlowNode): string {
    if (node.status === 'completed') return '#16a34a';
    if (node.status === 'active')    return this.accentColor();
    return '#9ca3af';
  }
  badgeBg(node: FlowNode): string {
    if (node.status === 'completed') return 'rgba(34,197,94,0.1)';
    if (node.status === 'active')    return `${this.accentColor()}15`;
    return '#f3f4f6';
  }

  onCardClick(vm: GraphNodeVM): void {
    if (vm.firstStepIdx >= 0 && (this.eng.isRunning() || this.eng.isComplete())) {
      this.eng.jumpToStep(vm.firstStepIdx);
    }
  }

  zoomIn():    void { this.zoom.update(z => Math.min(z + 10, 200)); }
  zoomOut():   void { this.zoom.update(z => Math.max(z - 10, 30)); }
  resetZoom(): void { this.zoom.set(80); }
}

export { GraphPanelComponent as StepTimelineComponent };
