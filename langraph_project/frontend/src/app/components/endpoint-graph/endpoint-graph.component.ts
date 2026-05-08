import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from '../../services/execution-state.service';
import { ENDPOINT_CONFIGS } from '../../data/endpoints.data';
import { FLOW_NODES } from '../../data/mock-steps.data';
import { JsonPanelComponent } from '../json-panel/json-panel.component';
import { ExecutionStep } from '../../models/execution-step.model';

// ── Layout constants ────────────────────────────────────────────────────────
const SPINE_X       = 260;
const BRANCH_X      = 92;
const MAIN_W        = 196;
const MAIN_H        = 60;
const BRANCH_W      = 148;
const BRANCH_H      = 52;
const COND_W        = 168;
const COND_H        = 38;
const ROW_GAP       = 30;
const TOP_PAD       = 56;
const BOTTOM_PAD    = 56;
const TERMINAL_R    = 22;

type NodeKind = 'terminal' | 'main' | 'branch' | 'condition';

interface PositionedNode {
  step?: ExecutionStep;
  kind: NodeKind;
  variant: 'start' | 'end' | 'main' | 'branch' | 'condition';
  x: number;     // center x
  y: number;     // center y
  w: number;
  h: number;
  color: string;
}

interface GraphEdge {
  d: string;             // SVG path
  color: string;
  dashed: boolean;
  label?: string;
  midX?: number;
  midY?: number;
  status: 'pending' | 'active' | 'completed';
}

@Component({
  selector: 'app-endpoint-graph',
  standalone: true,
  imports: [CommonModule, JsonPanelComponent],
  template: `
    <div class="lg-shell">

      <!-- ══ Tab bar ══ -->
      <div class="lg-tabbar">
        <div class="lg-tabs">
          <button class="lg-tab" [class.lg-tab-on]="tab() === 'graph'" (click)="tab.set('graph')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="6"  cy="6"  r="3" stroke="currentColor" stroke-width="2"/>
              <circle cx="18" cy="6"  r="3" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="18" r="3" stroke="currentColor" stroke-width="2"/>
              <path d="M7.5 8L11 15.5M16.5 8L13 15.5" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Graph
          </button>
          <button class="lg-tab" [class.lg-tab-on]="tab() === 'api'"
                  [class.lg-tab-dim]="!state.isComplete()"
                  [disabled]="!state.isComplete()"
                  (click)="tab.set('api')">
            <span class="lg-dot"
                  [style.background]="state.isComplete() ? '#34c759' : '#d2d2d7'"></span>
            Response
          </button>
        </div>

        <!-- Endpoint identity pill -->
        <div class="lg-ep-pill" [style.--ep]="currentEp().color">
          <span class="lg-ep-emoji">{{ currentEp().emoji }}</span>
          <span class="lg-ep-label">{{ epShortLabel(currentEp().label) }}</span>
          <span class="lg-verb" [ngClass]="'lg-verb-' + currentEp().method.toLowerCase()">
            {{ currentEp().method }}
          </span>
        </div>
      </div>

      <!-- ══ GRAPH TAB ══ -->
      @if (tab() === 'graph') {
        <div class="lg-stage">

          <!-- live progress capsule (top-right floating) -->
          @if (state.isRunning()) {
            <div class="lg-prog-cap"
                 [style.background]="currentEp().color + '12'"
                 [style.border-color]="currentEp().color + '30'"
                 [style.color]="currentEp().color">
              <span class="lg-prog-pulse" [style.background]="currentEp().color"></span>
              {{ state.progress() }}%
            </div>
          }

          <!-- Floating actions (top-right above canvas) -->
          <div class="lg-stage-actions">
            <!-- Zoom group (mirrors the code panel A-/A+) -->
            <div class="lg-zoom-group" title="Zoom graph">
              <button class="lg-zoom-btn"
                      (click)="zoomOut()"
                      [disabled]="zoom() <= MIN_ZOOM">A−</button>
              <span class="lg-zoom-val" (dblclick)="resetZoom()">{{ zoomPct() }}%</span>
              <button class="lg-zoom-btn"
                      (click)="zoomIn()"
                      [disabled]="zoom() >= MAX_ZOOM">A+</button>
            </div>

            @if (hasOverrides()) {
              <button class="lg-action-btn" (click)="resetLayout()" title="Reset to auto layout">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"
                        stroke="currentColor" stroke-width="2.2"
                        stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Reset
              </button>
            }
            <button class="lg-action-btn lg-action-ghost"
                    (click)="fitToView()"
                    title="Fit graph to view">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"
                      stroke="currentColor" stroke-width="2.2"
                      stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Fit
            </button>
          </div>

          <!-- Re-keys to retrigger entrance animation when endpoint changes -->
          @for (_ of [endpointKey()]; track _) {
            <div class="lg-canvas-wrap"
                 [style.zoom]="zoom()">
              <svg class="lg-canvas"
                   [attr.viewBox]="'0 0 ' + canvasWidth() + ' ' + canvasHeight()"
                   [attr.width]="canvasWidth()"
                   [attr.height]="canvasHeight()"
                   preserveAspectRatio="xMidYMin meet">

                <!-- subtle dot grid -->
                <defs>
                  <pattern id="lg-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.7" fill="#e8e8ed"/>
                  </pattern>
                  <filter id="lg-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2.4"/>
                    <feOffset dx="0" dy="2"/>
                    <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <marker id="lg-arrow"  markerWidth="9" markerHeight="9" refX="8" refY="4.5"
                          orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L8,4.5 L0,9 L2,4.5 Z" fill="#c7c7cc"/>
                  </marker>
                  <marker id="lg-arrow-active" markerWidth="9" markerHeight="9" refX="8" refY="4.5"
                          orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L8,4.5 L0,9 L2,4.5 Z" fill="currentColor"/>
                  </marker>
                </defs>

                <rect width="100%" height="100%" fill="url(#lg-grid)" opacity="0.6"/>

                <!-- ── Edges ── -->
                @for (e of edges(); track $index) {
                  <g class="lg-edge"
                     [class.lg-edge-active]="e.status === 'active'"
                     [class.lg-edge-done]="e.status === 'completed'">
                    <path [attr.d]="e.d"
                          fill="none"
                          [attr.stroke]="e.status === 'pending' ? '#d2d2d7' : e.color"
                          stroke-width="1.6"
                          [attr.stroke-dasharray]="e.dashed ? '5 4' : ''"
                          stroke-linecap="round"
                          marker-end="url(#lg-arrow)"/>
                    @if (e.label && e.midX != null && e.midY != null) {
                      <g [attr.transform]="'translate(' + e.midX + ',' + e.midY + ')'">
                        <rect x="-32" y="-9" width="64" height="18" rx="9"
                              fill="white"
                              [attr.stroke]="e.status === 'pending' ? '#d2d2d7' : e.color + '88'"
                              stroke-width="1"/>
                        <text x="0" y="3" text-anchor="middle"
                              font-size="9.5" font-weight="700"
                              [attr.fill]="e.status === 'pending' ? '#86868b' : e.color"
                              font-family="SF Pro Text, Inter, system-ui">{{ e.label }}</text>
                      </g>
                    }
                  </g>
                }
              </svg>

              <!-- ── Nodes (HTML overlay) ── -->
              @for (n of nodes(); track $index) {
                <!-- terminal -->
                @if (n.kind === 'terminal') {
                  <div class="lg-term"
                       [class.lg-dragging]="isNodeDragging(n)"
                       [style.left.px]="n.x - TERMINAL_R"
                       [style.top.px]="n.y - TERMINAL_R"
                       [style.width.px]="TERMINAL_R * 2"
                       [style.height.px]="TERMINAL_R * 2"
                       (mousedown)="onNodeMouseDown(n, $event)">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      @if (n.variant === 'start') {
                        <path d="M5 4v16M5 4h11l-1.5 4 1.5 4H5"
                              stroke="white" stroke-width="2.2"
                              stroke-linecap="round" stroke-linejoin="round"/>
                      } @else {
                        <circle cx="12" cy="12" r="5" fill="white"/>
                      }
                    </svg>
                    <div class="lg-term-label">{{ n.variant === 'start' ? 'Start' : 'End' }}</div>
                  </div>
                }

                <!-- conditional pill (edge node) -->
                @if (n.kind === 'condition') {
                  <div class="lg-cond"
                       [class.lg-cond-active]="stepStatus(n.step!.id) === 'active'"
                       [class.lg-cond-done]="stepStatus(n.step!.id) === 'completed'"
                       [class.lg-dragging]="isNodeDragging(n)"
                       [style.left.px]="n.x - n.w / 2"
                       [style.top.px]="n.y - n.h / 2"
                       [style.width.px]="n.w"
                       [style.height.px]="n.h"
                       [style.--c]="n.color"
                       (mousedown)="onNodeMouseDown(n, $event)"
                       (click)="onNodeClick(n, $event)">
                    <span class="lg-cond-fork">⑂</span>
                    <span class="lg-cond-label">{{ extractCondKey(n.step!) }}</span>
                  </div>
                }

                <!-- branch tool/memory node -->
                @if (n.kind === 'branch') {
                  <div class="lg-node lg-node-branch"
                       [class.lg-node-active]="stepStatus(n.step!.id) === 'active'"
                       [class.lg-node-done]="stepStatus(n.step!.id) === 'completed'"
                       [class.lg-dragging]="isNodeDragging(n)"
                       [style.left.px]="n.x - n.w / 2"
                       [style.top.px]="n.y - n.h / 2"
                       [style.width.px]="n.w"
                       [style.height.px]="n.h"
                       [style.--c]="n.color"
                       (mousedown)="onNodeMouseDown(n, $event)"
                       (click)="onNodeClick(n, $event)">
                    <span class="lg-node-icon">{{ nodeIcon(n.step!.nodeId) }}</span>
                    <span class="lg-node-text">
                      <span class="lg-node-name">{{ shortName(n.step!) }}</span>
                      <span class="lg-node-sub">{{ branchSubLabel(n.step!) }}</span>
                    </span>
                  </div>
                }

                <!-- main node -->
                @if (n.kind === 'main') {
                  <div class="lg-node lg-node-main"
                       [class.lg-node-active]="stepStatus(n.step!.id) === 'active'"
                       [class.lg-node-done]="stepStatus(n.step!.id) === 'completed'"
                       [class.lg-dragging]="isNodeDragging(n)"
                       [style.left.px]="n.x - n.w / 2"
                       [style.top.px]="n.y - n.h / 2"
                       [style.width.px]="n.w"
                       [style.height.px]="n.h"
                       [style.--c]="n.color"
                       (mousedown)="onNodeMouseDown(n, $event)"
                       (click)="onNodeClick(n, $event)">
                    <span class="lg-node-icon">{{ nodeIcon(n.step!.nodeId) }}</span>
                    <span class="lg-node-text">
                      <span class="lg-node-name">{{ shortName(n.step!) }}</span>
                      <span class="lg-node-sub">{{ n.step!.badge }}</span>
                    </span>
                  </div>
                }
              }
            </div>
          }

          <!-- legend strip (Apple Sidebar style) -->
          <div class="lg-legend">
            <div class="lg-legend-row">
              <span class="lg-legend-swatch" style="background:#1d1d1f"></span>
              <span>Terminal</span>
            </div>
            <div class="lg-legend-row">
              <span class="lg-legend-swatch lg-legend-main"></span>
              <span>Node</span>
            </div>
            <div class="lg-legend-row">
              <span class="lg-legend-swatch lg-legend-cond"></span>
              <span>Conditional</span>
            </div>
            <div class="lg-legend-row">
              <span class="lg-legend-line lg-legend-solid"></span>
              <span>Edge</span>
            </div>
            <div class="lg-legend-row">
              <span class="lg-legend-line lg-legend-dashed"></span>
              <span>Conditional edge</span>
            </div>
          </div>
        </div>
      }

      <!-- ══ API RESPONSE TAB ══ -->
      @if (tab() === 'api') {
        <div class="lg-api-view">
          <app-json-panel />
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }

    .lg-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fbfbfd;
      font-family: 'SF Pro Text', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      overflow: hidden;
      color: #1d1d1f;
    }

    /* ─────────── Tab bar ─────────── */
    .lg-tabbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      min-height: 48px;
      background: rgba(255,255,255,0.85);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid rgba(0,0,0,0.07);
      flex-shrink: 0;
      gap: 10px;
    }
    .lg-tabs { display: flex; gap: 2px; }
    .lg-tab {
      display: flex; align-items: center;
      gap: 6px;
      padding: 6px 13px;
      border: none; background: none;
      border-radius: 8px;
      font-size: 12.5px; font-weight: 600;
      color: #6e6e73;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.18s, color 0.18s, transform 0.12s;
      white-space: nowrap;
    }
    .lg-tab svg { color: currentColor; }
    .lg-tab:hover:not(:disabled) { background: #f0f0f3; color: #1d1d1f; }
    .lg-tab:active:not(:disabled) { transform: scale(0.97); }
    .lg-tab-on { background: #f0f0f3 !important; color: #1d1d1f !important; }
    .lg-tab-dim { opacity: 0.5; }
    .lg-tab:disabled { cursor: not-allowed; }
    .lg-dot { width: 7px; height: 7px; border-radius: 50%; transition: background 0.3s; }

    /* Endpoint pill */
    .lg-ep-pill {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 10px 4px 8px;
      background: white;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 99px;
      max-width: 250px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .lg-ep-emoji { font-size: 14px; line-height: 1; }
    .lg-ep-label {
      font-size: 11.5px; font-weight: 600; color: #1d1d1f;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 130px;
    }
    .lg-verb {
      font-size: 9px; font-weight: 800;
      padding: 2px 6px; border-radius: 5px;
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
      flex-shrink: 0;
      letter-spacing: 0.04em;
    }
    .lg-verb-get    { background: #e8f8ed; color: #248a3d; }
    .lg-verb-post   { background: #eef0ff; color: #3d3dad; }
    .lg-verb-delete { background: #fdecec; color: #c5292a; }

    /* ─────────── Stage ─────────── */
    .lg-stage {
      flex: 1;
      overflow: auto;
      position: relative;
      padding: 22px;
      scrollbar-width: thin;
      scrollbar-color: #d2d2d7 transparent;
    }
    .lg-stage::-webkit-scrollbar { width: 8px; height: 8px; }
    .lg-stage::-webkit-scrollbar-thumb { background: #d2d2d7; border-radius: 99px; }

    /* ─── Floating actions ─── */
    .lg-stage-actions {
      position: sticky;
      top: 0;
      z-index: 6;
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      margin: -4px 0 8px;
    }
    .lg-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      letter-spacing: -0.005em;
      color: #1d1d1f;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 99px;
      cursor: pointer;
      transition: background 0.18s, transform 0.12s, border-color 0.18s;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .lg-action-btn:hover { background: white; border-color: rgba(0,0,0,0.16); transform: translateY(-1px); }
    .lg-action-btn:active { transform: translateY(0) scale(0.98); }
    .lg-action-btn svg { color: #6e6e73; }
    .lg-action-ghost {
      background: rgba(255,255,255,0.6);
      border-style: dashed;
    }

    /* ─── Zoom group (mirrors code-panel A− / A+) ─── */
    .lg-zoom-group {
      display: inline-flex;
      align-items: stretch;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 99px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .lg-zoom-btn {
      background: transparent;
      border: none;
      color: #1d1d1f;
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 0 10px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      line-height: 1;
      letter-spacing: -0.005em;
    }
    .lg-zoom-btn:hover:not(:disabled) { background: rgba(0,113,227,0.10); color: #0071e3; }
    .lg-zoom-btn:active:not(:disabled) { background: rgba(0,113,227,0.18); }
    .lg-zoom-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .lg-zoom-val {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 42px;
      padding: 0 6px;
      border-left: 1px solid rgba(0,0,0,0.08);
      border-right: 1px solid rgba(0,0,0,0.08);
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
      font-size: 10.5px;
      font-weight: 600;
      color: #6e6e73;
      cursor: pointer;
      user-select: none;
      font-variant-numeric: tabular-nums;
    }
    .lg-zoom-val:hover { color: #1d1d1f; }

    .lg-prog-cap {
      position: sticky;
      top: 0;
      margin-left: auto;
      width: max-content;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 99px;
      border: 1px solid;
      font-size: 11px;
      font-weight: 700;
      font-family: 'SF Mono', monospace;
      letter-spacing: 0.02em;
      backdrop-filter: blur(8px);
      z-index: 5;
    }
    .lg-prog-pulse {
      width: 7px; height: 7px; border-radius: 50%;
      animation: lg-pulse-dot 1.4s ease-in-out infinite;
    }
    @keyframes lg-pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.45; transform: scale(0.7); }
    }

    .lg-canvas-wrap {
      position: relative;
      margin: 0 auto;
      width: max-content;
      animation: lg-stage-in 0.45s cubic-bezier(0.34,1.06,0.64,1) both;
    }
    @keyframes lg-stage-in {
      from { opacity: 0; transform: translateY(10px) scale(0.985); }
      to   { opacity: 1; transform: none; }
    }

    .lg-canvas {
      display: block;
      max-width: 100%;
    }

    /* edges */
    .lg-edge path { transition: stroke 0.4s; }
    .lg-edge-active path  { color: var(--c, #007aff); animation: lg-edge-glow 1.4s ease-in-out infinite; }
    .lg-edge-done   path  { opacity: 0.85; }
    @keyframes lg-edge-glow {
      0%, 100% { filter: drop-shadow(0 0 0 transparent); }
      50%       { filter: drop-shadow(0 0 4px currentColor); }
    }

    /* ─────────── Terminal ─────────── */
    .lg-term {
      position: absolute;
      border-radius: 50%;
      background: #1d1d1f;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18), 0 0 0 4px rgba(255,255,255,0.9), 0 0 0 5px rgba(0,0,0,0.07);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      cursor: grab;
      user-select: none;
    }
    .lg-term:active { cursor: grabbing; }
    .lg-term.lg-dragging { cursor: grabbing; box-shadow: 0 6px 22px rgba(0,0,0,0.28), 0 0 0 4px rgba(255,255,255,0.9), 0 0 0 5px rgba(0,0,0,0.12); }
    .lg-term-label {
      position: absolute;
      top: 100%;
      margin-top: 6px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      font-weight: 600;
      color: #1d1d1f;
      letter-spacing: 0.01em;
    }

    /* ─────────── Node base ─────────── */
    .lg-node {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 0 12px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.06);
      background: white;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04);
      cursor: grab;
      font-family: inherit;
      text-align: left;
      user-select: none;
      transition: transform 0.18s cubic-bezier(0.34,1.2,0.64,1),
                  box-shadow 0.25s,
                  border-color 0.3s,
                  background 0.3s;
      overflow: hidden;
    }
    .lg-node:hover {
      transform: translateY(-1.5px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.06), 0 10px 24px rgba(0,0,0,0.07);
      border-color: var(--c, #007aff);
    }
    .lg-node:active { cursor: grabbing; transform: translateY(0) scale(0.99); }
    .lg-node.lg-dragging {
      cursor: grabbing;
      transform: scale(1.03);
      box-shadow: 0 6px 28px rgba(0,0,0,0.18), 0 0 0 1.5px var(--c, #007aff);
      transition: none;                /* follow the cursor 1:1 */
      z-index: 5;
    }

    .lg-node-icon {
      width: 30px; height: 30px;
      flex-shrink: 0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      background: color-mix(in srgb, var(--c) 12%, white);
      color: var(--c, #007aff);
      transition: background 0.3s, color 0.3s;
    }
    .lg-node-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      flex: 1;
    }
    .lg-node-name {
      font-size: 12.5px;
      font-weight: 600;
      color: #1d1d1f;
      letter-spacing: -0.005em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.3s;
    }
    .lg-node-sub {
      font-size: 9.5px;
      font-weight: 600;
      color: #86868b;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── branch nodes (tool / memory) — slightly smaller, off-spine ── */
    .lg-node-branch {
      gap: 7px;
      padding: 0 10px;
      background: color-mix(in srgb, var(--c) 5%, white);
      border-color: color-mix(in srgb, var(--c) 18%, transparent);
    }
    .lg-node-branch .lg-node-icon { width: 26px; height: 26px; font-size: 11px; border-radius: 7px; }
    .lg-node-branch .lg-node-name { font-size: 11.5px; }
    .lg-node-branch .lg-node-sub  { font-size: 9px; }

    /* ── status: active ── */
    .lg-node-active {
      border-color: var(--c, #007aff);
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent),
        0 8px 22px color-mix(in srgb, var(--c) 22%, transparent);
      animation: lg-node-breathe 2.2s ease-in-out infinite;
    }
    @keyframes lg-node-breathe {
      0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent), 0 8px 22px color-mix(in srgb, var(--c) 22%, transparent); }
      50%       { box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 12%, transparent), 0 10px 26px color-mix(in srgb, var(--c) 32%, transparent); }
    }
    .lg-node-active .lg-node-icon {
      background: var(--c);
      color: white;
    }
    .lg-node-active .lg-node-name { color: var(--c); }

    /* ── status: completed ── */
    .lg-node-done {
      border-color: color-mix(in srgb, var(--c) 35%, transparent);
      background: color-mix(in srgb, var(--c) 4%, white);
    }
    .lg-node-done .lg-node-icon::after {
      content: '✓';
      position: absolute;
      width: 14px; height: 14px;
      right: -3px; top: -3px;
      border-radius: 50%;
      background: #34c759;
      color: white;
      font-size: 9px;
      font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.18), 0 0 0 2px white;
    }
    .lg-node-done .lg-node-icon { position: relative; }

    /* ─────────── Conditional pill ─────────── */
    .lg-cond {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 14px;
      border-radius: 99px;
      border: 1.4px dashed color-mix(in srgb, var(--c) 55%, transparent);
      background: color-mix(in srgb, var(--c) 6%, white);
      color: var(--c);
      cursor: grab;
      user-select: none;
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: all 0.25s;
    }
    .lg-cond:hover {
      background: color-mix(in srgb, var(--c) 12%, white);
      transform: translateY(-1px);
    }
    .lg-cond:active { cursor: grabbing; }
    .lg-cond.lg-dragging {
      cursor: grabbing;
      transform: scale(1.04);
      box-shadow: 0 6px 22px rgba(0,0,0,0.18);
      transition: none;
      z-index: 5;
    }
    .lg-cond-fork { font-size: 14px; }
    .lg-cond-label {
      font-family: 'SF Mono', monospace;
      font-size: 10.5px;
    }
    .lg-cond-active {
      border-style: solid;
      background: var(--c);
      color: white;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent);
      animation: lg-node-breathe 2.2s ease-in-out infinite;
    }
    .lg-cond-done {
      border-color: color-mix(in srgb, var(--c) 30%, transparent);
      background: color-mix(in srgb, var(--c) 8%, white);
    }

    /* ─────────── Legend ─────────── */
    .lg-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      justify-content: center;
      padding: 14px 16px 4px;
      margin-top: 6px;
    }
    .lg-legend-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      font-weight: 600;
      color: #86868b;
      letter-spacing: 0.01em;
    }
    .lg-legend-swatch {
      width: 14px; height: 14px;
      border-radius: 4px;
    }
    .lg-legend-main {
      background: white;
      border: 1px solid rgba(0,0,0,0.1);
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .lg-legend-cond {
      background: rgba(0,122,255,0.08);
      border: 1.4px dashed rgba(0,122,255,0.55);
      border-radius: 99px;
    }
    .lg-legend-line {
      width: 22px; height: 0;
      border-top: 1.6px solid #c7c7cc;
    }
    .lg-legend-dashed { border-top-style: dashed; }

    /* ─────────── API view ─────────── */
    .lg-api-view {
      flex: 1;
      overflow: hidden;
    }
  `]
})
export class EndpointGraphComponent {
  readonly state = inject(ExecutionStateService);
  readonly tab = signal<'graph' | 'api'>('graph');

  // expose constants to template
  readonly TERMINAL_R = TERMINAL_R;

  // ── Zoom ────────────────────────────────────────────────────────────────
  readonly MIN_ZOOM = 0.5;
  readonly MAX_ZOOM = 2.0;
  readonly ZOOM_STEP = 0.1;
  readonly zoom = signal(1.0);
  readonly zoomPct = computed(() => Math.round(this.zoom() * 100));
  zoomIn(): void { this.zoom.set(Math.min(this.MAX_ZOOM, +(this.zoom() + this.ZOOM_STEP).toFixed(2))); }
  zoomOut(): void { this.zoom.set(Math.max(this.MIN_ZOOM, +(this.zoom() - this.ZOOM_STEP).toFixed(2))); }
  resetZoom(): void { this.zoom.set(1.0); }

  // ── Per-endpoint position overrides (drag-to-reposition) ────────────────
  private readonly _overrides = signal<Map<string, Map<string, { x: number; y: number }>>>(new Map());
  readonly hasOverrides = computed(() => {
    const m = this._overrides().get(this.endpointKey());
    return !!m && m.size > 0;
  });

  // ── Drag internals ──────────────────────────────────────────────────────
  private _drag: {
    nodeKey: string;
    startX: number; startY: number;
    nodeStartX: number; nodeStartY: number;
    moved: boolean;
    step?: ExecutionStep;
  } | null = null;
  readonly draggingKey = signal<string | null>(null);

  constructor() {
    effect(() => { if (this.state.isRunning()) this.tab.set('graph'); });
    effect(() => { if (this.state.isComplete() && this.state.apiResponse()) this.tab.set('api'); });
  }

  // ── Endpoint context ──────────────────────────────────────────────────────
  readonly currentEp = computed(() => {
    const id = this.state.currentEndpointId();
    return ENDPOINT_CONFIGS.find(e => e.id === id) ?? ENDPOINT_CONFIGS[0];
  });
  readonly endpointKey = computed(() => this.state.currentEndpointId());

  readonly steps = computed((): ExecutionStep[] => {
    try { return this.currentEp().buildSteps({}); } catch { return []; }
  });

  // ── Live status ───────────────────────────────────────────────────────────
  private readonly _liveStepMap = computed(() => {
    const m = new Map<number, string>();
    for (const s of this.state.steps()) m.set(s.id, s.status);
    return m;
  });
  stepStatus(id: number): string { return this._liveStepMap().get(id) ?? 'pending'; }

  // ── Layout: build positioned nodes + edges ────────────────────────────────
  readonly layout = computed(() => {
    const steps = this.steps();
    const epColor = this.currentEp().color;

    const placed: PositionedNode[] = [];
    let cursorY = TOP_PAD + TERMINAL_R;       // y after start terminal

    // Start terminal
    placed.push({
      kind: 'terminal', variant: 'start',
      x: SPINE_X, y: TOP_PAD,
      w: TERMINAL_R * 2, h: TERMINAL_R * 2,
      color: '#1d1d1f',
    });

    // First main node row begins below terminal
    cursorY = TOP_PAD + TERMINAL_R + ROW_GAP;

    // We skip the first 'user' step — represented by the Start terminal
    const skipFirstUser = steps[0]?.nodeId === 'user';
    const items = skipFirstUser ? steps.slice(1) : steps;

    for (const step of items) {
      const isBranch = step.nodeId === 'tool' || step.nodeId === 'memory';
      const isCond   = step.nodeId === 'edge';

      if (isBranch) {
        // place to the left, at its own y
        const y = cursorY + BRANCH_H / 2;
        placed.push({
          step, kind: 'branch', variant: 'branch',
          x: BRANCH_X, y,
          w: BRANCH_W, h: BRANCH_H,
          color: this.nodeColor(step.nodeId),
        });
        cursorY = y + BRANCH_H / 2 + ROW_GAP;
      } else if (isCond) {
        const y = cursorY + COND_H / 2;
        placed.push({
          step, kind: 'condition', variant: 'condition',
          x: SPINE_X, y,
          w: COND_W, h: COND_H,
          color: this.nodeColor(step.nodeId),
        });
        cursorY = y + COND_H / 2 + ROW_GAP;
      } else {
        const y = cursorY + MAIN_H / 2;
        placed.push({
          step, kind: 'main', variant: 'main',
          x: SPINE_X, y,
          w: MAIN_W, h: MAIN_H,
          color: this.nodeColor(step.nodeId),
        });
        cursorY = y + MAIN_H / 2 + ROW_GAP;
      }
    }

    // End terminal
    const endY = cursorY + TERMINAL_R;
    placed.push({
      kind: 'terminal', variant: 'end',
      x: SPINE_X, y: endY,
      w: TERMINAL_R * 2, h: TERMINAL_R * 2,
      color: '#1d1d1f',
    });

    // ─── Build edges ─────────────────────────────────────────────────────────
    const edges: GraphEdge[] = [];

    // helper: status of edge between two placed nodes
    const edgeStatus = (from: PositionedNode, to: PositionedNode): GraphEdge['status'] => {
      const fs = from.step ? this.stepStatus(from.step.id) : 'completed'; // start always 'completed'
      const ts = to.step   ? this.stepStatus(to.step.id)   : null;
      if (ts === 'active' || ts === 'completed')        return ts === 'active' ? 'active' : 'completed';
      if (fs === 'completed' && (ts === 'pending' || ts === null)) return 'completed';
      if (fs === 'active')                               return 'active';
      return 'pending';
    };

    // Build spine sequence (terminal → main/cond → terminal)
    const spineSeq = placed.filter(p =>
      p.kind === 'terminal' || p.kind === 'main' || p.kind === 'condition'
    );

    for (let i = 0; i < spineSeq.length - 1; i++) {
      const from = spineSeq[i];
      const to = spineSeq[i + 1];
      const fromY = from.y + (from.kind === 'terminal' ? TERMINAL_R : from.h / 2);
      const toY   = to.y   - (to.kind   === 'terminal' ? TERMINAL_R : to.h / 2);
      // straight vertical line
      const d = `M${SPINE_X} ${fromY} L${SPINE_X} ${toY}`;
      // label if either side is a conditional
      let label: string | undefined;
      let midX: number | undefined;
      let midY: number | undefined;
      if (from.kind === 'condition') {
        label = 'route →';
        midX = SPINE_X + 50;
        midY = (fromY + toY) / 2;
      }
      edges.push({
        d,
        color: epColor,
        dashed: from.kind === 'condition' || to.kind === 'condition',
        label,
        midX,
        midY,
        status: edgeStatus(from, to),
      });
    }

    // Branch edges: dashed call from spine → branch (and return back)
    const branches = placed.filter(p => p.kind === 'branch');
    for (const b of branches) {
      // find nearest preceding spine node ABOVE this branch's y (the caller)
      const callerCandidates = spineSeq.filter(s => s.y < b.y);
      const caller = callerCandidates[callerCandidates.length - 1];
      if (!caller) continue;

      const callerCx = caller.x;
      const callerCy = caller.y;
      const callerLeftX = callerCx - (caller.kind === 'terminal' ? TERMINAL_R : caller.w / 2);

      const branchRightX = b.x + b.w / 2;
      const branchTopY = b.y - b.h / 2;
      const branchBottomY = b.y + b.h / 2;

      // Outgoing call: from caller's left edge → branch's top-right (curved)
      const cx1 = callerLeftX - 60;
      const cy1 = callerCy;
      const cx2 = b.x;
      const cy2 = branchTopY - 26;
      const dCall = `M${callerLeftX} ${callerCy} C${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${branchTopY}`;

      // Return: from branch right → spine, slightly below caller's right side
      const callerRightX = callerCx + (caller.kind === 'terminal' ? TERMINAL_R : caller.w / 2);
      const dReturn = `M${branchRightX} ${branchBottomY} C${branchRightX + 28} ${branchBottomY + 4}, ${callerRightX + 14} ${callerCy + 14}, ${callerRightX + 1} ${callerCy + 6}`;

      const status = b.step
        ? (this.stepStatus(b.step.id) === 'active' ? 'active'
          : this.stepStatus(b.step.id) === 'completed' ? 'completed'
          : 'pending')
        : 'pending';

      edges.push({
        d: dCall, color: b.color, dashed: true, status,
        label: 'call', midX: (callerLeftX + b.x) / 2 - 4, midY: (callerCy + branchTopY) / 2 + 4,
      });
      edges.push({
        d: dReturn, color: b.color, dashed: true, status,
      });
    }

    // ─── Apply user overrides (drag-to-reposition) ───────────────────────────
    const epOverrides = this._overrides().get(this.endpointKey());
    if (epOverrides && epOverrides.size > 0) {
      for (const node of placed) {
        const ov = epOverrides.get(this.nodeKey(node));
        if (ov) { node.x = ov.x; node.y = ov.y; }
      }

      // Rebuild ALL edges from current node positions (handles overrides)
      edges.length = 0;

      // Spine sequence in original placement order, recomputed
      const newSpine = placed.filter(p =>
        p.kind === 'terminal' || p.kind === 'main' || p.kind === 'condition'
      );
      for (let i = 0; i < newSpine.length - 1; i++) {
        const from = newSpine[i];
        const to = newSpine[i + 1];
        const fromHalfH = from.kind === 'terminal' ? TERMINAL_R : from.h / 2;
        const toHalfH   = to.kind   === 'terminal' ? TERMINAL_R : to.h / 2;
        const fy = from.y + (to.y > from.y ? fromHalfH : -fromHalfH);
        const ty = to.y   + (from.y > to.y ? toHalfH   : -toHalfH);
        // smooth bezier between centers, vertical-leaning
        const mid = (fy + ty) / 2;
        const d = `M${from.x} ${fy} C${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${ty}`;
        let label: string | undefined;
        let midX: number | undefined;
        let midY: number | undefined;
        if (from.kind === 'condition') {
          label = 'route →';
          midX = (from.x + to.x) / 2 + 50;
          midY = mid;
        }
        edges.push({
          d,
          color: epColor,
          dashed: from.kind === 'condition' || to.kind === 'condition',
          label, midX, midY,
          status: edgeStatus(from, to),
        });
      }

      // Branch edges from spine center to branch center, dashed bezier
      const newBranches = placed.filter(p => p.kind === 'branch');
      for (const b of newBranches) {
        const callerCandidates = newSpine.filter(s => s.y < b.y);
        const caller = callerCandidates[callerCandidates.length - 1] ?? newSpine[0];
        if (!caller) continue;
        const dCall = `M${caller.x} ${caller.y} C${(caller.x + b.x)/2} ${caller.y}, ${(caller.x + b.x)/2} ${b.y}, ${b.x} ${b.y}`;
        const status = b.step
          ? (this.stepStatus(b.step.id) === 'active' ? 'active'
            : this.stepStatus(b.step.id) === 'completed' ? 'completed'
            : 'pending')
          : 'pending';
        edges.push({
          d: dCall, color: b.color, dashed: true, status,
          label: 'call', midX: (caller.x + b.x) / 2, midY: (caller.y + b.y) / 2,
        });
      }
    }

    // Canvas dims — grow to fit any dragged-out nodes
    let maxRight = SPINE_X + MAIN_W / 2 + 60;
    let maxBottom = endY + TERMINAL_R + BOTTOM_PAD;
    for (const node of placed) {
      const right = node.x + node.w / 2 + 30;
      const bottom = node.y + node.h / 2 + 30;
      if (right > maxRight)   maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    }

    return { nodes: placed, edges, width: maxRight, height: maxBottom };
  });

  readonly nodes        = computed(() => this.layout().nodes);
  readonly edges        = computed(() => this.layout().edges);
  readonly canvasWidth  = computed(() => this.layout().width);
  readonly canvasHeight = computed(() => this.layout().height);

  // ── Click → jump to step (suppressed if a drag actually moved) ────────────
  onStepClick(stepId: number): void {
    const idx = this.state.steps().findIndex(s => s.id === stepId);
    if (idx < 0) return;
    this.state.jumpToStep(idx);
  }

  onNodeClick(n: PositionedNode, e: MouseEvent): void {
    // Suppress click that came from a drag gesture
    if (this._lastDragMoved) {
      this._lastDragMoved = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (n.step) this.onStepClick(n.step.id);
  }

  // ── Drag-to-reposition (terminals + main + branch + condition) ────────────
  private _lastDragMoved = false;

  nodeKey(n: PositionedNode): string {
    if (n.kind === 'terminal') return `term:${n.variant}`;
    return `step:${n.step!.id}`;
  }
  isNodeDragging(n: PositionedNode): boolean {
    return this.draggingKey() === this.nodeKey(n);
  }

  onNodeMouseDown(n: PositionedNode, e: MouseEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this._drag = {
      nodeKey: this.nodeKey(n),
      startX: e.clientX, startY: e.clientY,
      nodeStartX: n.x, nodeStartY: n.y,
      moved: false,
      step: n.step,
    };
    this._lastDragMoved = false;
  }

  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(e: MouseEvent): void {
    const d = this._drag;
    if (!d) return;
    const z = this.zoom();
    const dx = (e.clientX - d.startX) / z;
    const dy = (e.clientY - d.startY) / z;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;       // click threshold
    d.moved = true;
    this.draggingKey.set(d.nodeKey);
    const newX = Math.max(20, d.nodeStartX + dx);
    const newY = Math.max(20, d.nodeStartY + dy);
    this._setOverride(d.nodeKey, newX, newY);
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    if (d.moved) {
      this._lastDragMoved = true;
      this.draggingKey.set(null);
    } else {
      this.draggingKey.set(null);
    }
  }

  private _setOverride(key: string, x: number, y: number): void {
    const epKey = this.endpointKey();
    this._overrides.update(m => {
      const next = new Map(m);
      const inner = new Map(next.get(epKey) ?? []);
      inner.set(key, { x, y });
      next.set(epKey, inner);
      return next;
    });
  }

  resetLayout(): void {
    const epKey = this.endpointKey();
    this._overrides.update(m => {
      const next = new Map(m);
      next.delete(epKey);
      return next;
    });
  }

  /** Reset zoom to 1 and scroll to top so the full graph is visible. */
  fitToView(): void {
    this.zoom.set(1.0);
    requestAnimationFrame(() => {
      const stage = this._stageEl();
      if (!stage) return;
      stage.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    });
  }
  private _stageEl(): HTMLElement | null {
    return document.querySelector('.lg-stage') as HTMLElement | null;
  }

  // ── Style helpers ─────────────────────────────────────────────────────────
  nodeColor(nodeId: string): string {
    return FLOW_NODES.find(n => n.id === nodeId)?.color ?? '#007aff';
  }
  nodeIcon(nodeId: string): string {
    return FLOW_NODES.find(n => n.id === nodeId)?.icon ?? '?';
  }

  // ── Text helpers ──────────────────────────────────────────────────────────
  epShortLabel(label: string): string {
    return label.split('—')[0].split('–')[0].trim();
  }

  shortName(step: ExecutionStep): string {
    // crisp two-word name suited for graph node
    const map: Record<string, string> = {
      'routes':     'API Route',
      'graph':      'Graph State',
      'classifier': 'Classifier',
      'llm':        'LLM Call',
      'specialist': 'Specialist',
      'tool':       'Tool / RAG',
      'memory':     'Checkpoint',
      'response':   'Response',
    };
    return map[step.nodeId] ?? step.name;
  }

  branchSubLabel(step: ExecutionStep): string {
    if (step.nodeId === 'memory') return 'MemorySaver';
    if (step.nodeId === 'tool')   return 'ToolNode';
    return step.badge ?? '';
  }

  extractCondKey(step: ExecutionStep): string {
    // Pull the routing-key from the description if present, else fall back
    const m = step.description.match(/workflow\s*=\s*"([^"]+)"/i)
          ?? step.description.match(/intent="([^"]+)"/i)
          ?? step.description.match(/path:\s*(\w+)/i)
          ?? step.description.match(/route\w*\s+(?:to\s+)?["']?(\w+)["']?/i);
    if (m) return m[1].toLowerCase();
    if (/circuit/i.test(step.description)) return 'breaker';
    return 'route';
  }
}
