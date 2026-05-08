import { Component, inject, computed, signal, effect, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionEngineService } from '../../services/execution-engine.service';

@Component({
  selector: 'gv-code-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="code-wrapper">
      @if (step()) {

        <!-- ── Debugger toolbar ── -->
        <div class="dbg-toolbar">

          <!-- Left: file breadcrumb -->
          <div class="dbg-breadcrumb">
            <span class="dbg-run-dot" [class.dot-running]="eng.isRunning() && !eng.isComplete()"
                                      [class.dot-paused]="eng.pausedAtBreakpoint()"
                                      [class.dot-done]="eng.isComplete()"></span>
            <span class="dbg-file">{{ step()!.file }}</span>
            <span class="dbg-sep">›</span>
            <span class="dbg-fn">{{ step()!.functionName }}()</span>
            <span class="dbg-sep">›</span>
            <span class="dbg-line-pill">
              Ln {{ eng.activeLine() }}
              <span class="dbg-line-total"> / {{ totalLines() }}</span>
            </span>
            @if (eng.pausedAtBreakpoint()) {
              <span class="bp-paused-badge">⏸ Breakpoint</span>
            }
          </div>

          <!-- Right: debugger action buttons -->
          <div class="dbg-actions">

            <!-- Continue (▶) -->
            <button class="dbg-btn dbg-continue"
                    [disabled]="!eng.isRunning() || eng.isComplete()"
                    [class.dbg-btn-active]="eng.pausedAtBreakpoint()"
                    (click)="eng.continueExecution()"
                    title="Continue (F5)">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 2L10 6L2.5 10V2Z" fill="currentColor"/>
                <rect x="10.5" y="2" width="1.5" height="8" rx="0.5" fill="currentColor"/>
              </svg>
              <span>Continue</span>
            </button>

            <!-- Step Over (⤻) -->
            <button class="dbg-btn"
                    [disabled]="!eng.isRunning() || eng.isComplete()"
                    (click)="eng.stepOver()"
                    title="Step Over — next step (F10)">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M2 7C2 4.2 4.2 2 7 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <path d="M7 2L10 4.5L7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 10H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>Step Over</span>
            </button>

            <!-- Step Into (↓) -->
            <button class="dbg-btn dbg-step-into"
                    [disabled]="!eng.isRunning() || eng.isComplete() || eng.atLastLine()"
                    (click)="eng.stepInto()"
                    title="Step Into — next line (F11)">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 2V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <path d="M4 7.5L7 11L10 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 2H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>Step Into</span>
            </button>

            <!-- Step Out (↑) -->
            <button class="dbg-btn"
                    [disabled]="!eng.isRunning() || eng.isComplete()"
                    (click)="eng.stepOut()"
                    title="Step Out — exit function (Shift+F11)">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 12V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <path d="M4 6.5L7 3L10 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 12H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>Step Out</span>
            </button>

            <!-- Step Back (←) -->
            <button class="dbg-btn"
                    [disabled]="!eng.isRunning() || eng.isComplete() || eng.atFirstLine()"
                    (click)="eng.stepBack()"
                    title="Step Back — previous line">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 2V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <path d="M10 6.5L7 3L4 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>Back</span>
            </button>

            <div class="dbg-sep-v"></div>

            <!-- Auto play toggle -->
            <button class="dbg-btn dbg-auto"
                    [disabled]="!eng.isRunning() || eng.isComplete()"
                    [class.dbg-auto-active]="eng.autoPlaying()"
                    (click)="eng.toggleAutoPlay()"
                    title="Auto-run all lines">
              @if (eng.autoPlaying()) {
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/>
                  <rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/>
                </svg>
                <span>Pause</span>
              } @else {
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 1L9.5 5L1.5 9V1Z" fill="currentColor"/>
                </svg>
                <span>Auto</span>
              }
            </button>

            <div class="dbg-sep-v"></div>

            <!-- Font zoom -->
            <div class="zoom-row">
              <button class="z-btn" (click)="eng.zoomOut()" title="Smaller font">A<sup style="font-size:7px">−</sup></button>
              <span class="z-pct">{{ eng.codeFontSize() }}px</span>
              <button class="z-btn" (click)="eng.zoomIn()" title="Larger font">A<sup style="font-size:7px">+</sup></button>
            </div>
          </div>
        </div>

        <!-- ── Call Stack panel (collapsible) ── -->
        @if (showCallStack()) {
          <div class="call-stack-bar">
            <div class="cs-title">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="1" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.6"/>
                <rect x="1" y="4.5" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.4"/>
                <rect x="1" y="8" width="4" height="2" rx="0.5" fill="currentColor" opacity="0.25"/>
              </svg>
              CALL STACK
            </div>
            @for (frame of eng.callStack(); track $index) {
              <div class="cs-frame" [class.cs-frame-active]="$index === 0">
                <span class="cs-frame-idx">{{ $index }}</span>
                <span class="cs-frame-fn">{{ frame.fn }}</span>
                <span class="cs-frame-loc">{{ frame.file }}:{{ frame.line }}</span>
              </div>
            }
            <button class="cs-close" (click)="showCallStack.set(false)">✕</button>
          </div>
        }

        <!-- ── Code area ── -->
        <div class="code-scroll" #codeScroll>
          <div class="code-block">

            <!-- Gutter with breakpoints + line numbers -->
            <div class="gutter">
              @for (line of codeLines(); track $index) {
                <div class="ln-row"
                     [class.ln-active]="isActive($index + 1)"
                     [class.ln-breakpoint]="isBreakpoint($index + 1)"
                     (click)="toggleBreakpoint($index + 1)">

                  <!-- Breakpoint dot -->
                  <span class="bp-dot" [class.bp-dot-on]="isBreakpoint($index + 1)"></span>

                  <!-- Active pointer -->
                  @if (isActive($index + 1)) {
                    <span class="ln-ptr">▶</span>
                  }

                  <!-- Line number -->
                  <span class="ln-num" [style.font-size.px]="eng.codeFontSize()">{{ $index + 1 }}</span>
                </div>
              }
            </div>

            <!-- Code lines -->
            <div class="lines">
              @for (line of codeLines(); track $index) {
                <div class="code-line"
                     [class.line-active]="isActive($index + 1)"
                     [class.line-executed]="isExecuted($index + 1)"
                     [class.line-has-out]="hasOutput($index + 1)"
                     [class.line-breakpoint]="isBreakpoint($index + 1)"
                     [style.font-size.px]="eng.codeFontSize()"
                     (mouseenter)="hoveredLine.set($index + 1)"
                     (mouseleave)="hoveredLine.set(null)">

                  <!-- Syntax coloured code -->
                  <span [innerHTML]="colorize(line)"></span>

                  <!-- Inline output on hover -->
                  @if (hoveredLine() === $index + 1 && hasOutput($index + 1)) {
                    <span class="inline-out">  // → {{ getOutput($index + 1) }}</span>
                  } @else if (hasOutput($index + 1) && isExecuted($index + 1)) {
                    <span class="out-dot" title="{{ getOutput($index + 1) }}">●</span>
                  }
                </div>
              }
            </div>

          </div>
        </div>

        <!-- ── Status footer ── -->
        <div class="code-footer">
          <div class="foot-left">
            <span class="foot-bulb">💡</span>
            <span class="foot-desc">{{ step()!.description }}</span>
          </div>
          <div class="foot-right">
            <button class="cs-toggle-btn" (click)="showCallStack.update(v => !v)"
                    [class.cs-active]="showCallStack()" title="Toggle call stack">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="10" height="2.5" rx="1" fill="currentColor" opacity="0.7"/>
                <rect x="1" y="4.75" width="7" height="2.5" rx="1" fill="currentColor" opacity="0.45"/>
                <rect x="1" y="8.5" width="5" height="2.5" rx="1" fill="currentColor" opacity="0.25"/>
              </svg>
              Call Stack
            </button>
            <span class="foot-step-badge">
              Step {{ (eng.currentIndex() + 1) }} / {{ eng.steps().length }}
            </span>
          </div>
        </div>

      } @else {
        <!-- Empty state -->
        <div class="code-empty">
          <div class="empty-icon">{ }</div>
          <p class="empty-text">Select or run a step to view code</p>
          <div class="empty-hints">
            <span class="hint-key">F10</span> Step Over
            <span class="hint-key">F11</span> Step Into
            <span class="hint-key">F5</span> Continue
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

    .code-wrapper {
      display: flex; flex-direction: column; flex: 1; min-height: 0;
      background: #ffffff; overflow: hidden;
      font-family: 'Inter', -apple-system, sans-serif;
    }

    /* ══ Debugger Toolbar ══════════════════════════════════════════════════ */
    .dbg-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 10px; min-height: 34px;
      background: #f8f9fb; border-bottom: 1px solid #e8eaf0;
      flex-shrink: 0; gap: 8px; overflow: hidden;
    }

    /* Breadcrumb */
    .dbg-breadcrumb {
      display: flex; align-items: center; gap: 5px;
      flex: 1; min-width: 0; overflow: hidden;
    }
    .dbg-run-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #d1d5db; flex-shrink: 0; transition: background 0.3s;
    }
    .dot-running { background: #f59e0b; animation: dot-pulse 1.2s ease-in-out infinite; }
    .dot-paused  { background: #ef4444; }
    .dot-done    { background: #22c55e; }
    @keyframes dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    .dbg-file {
      font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
      color: #6366f1; font-weight: 600; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 120px;
    }
    .dbg-sep { font-size: 10px; color: #d1d5db; flex-shrink: 0; }
    .dbg-fn {
      font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
      color: #059669; font-weight: 600; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 110px;
    }
    .dbg-line-pill {
      font-size: 9.5px; font-family: 'JetBrains Mono', monospace;
      color: #d97706; font-weight: 700;
      background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.22);
      border-radius: 4px; padding: 1px 7px; white-space: nowrap; flex-shrink: 0;
    }
    .dbg-line-total { color: #9ca3af; font-weight: 400; }

    .bp-paused-badge {
      font-size: 9px; font-weight: 700; color: #dc2626;
      background: #fee2e2; border: 1px solid #fca5a5;
      border-radius: 4px; padding: 1px 6px; white-space: nowrap; flex-shrink: 0;
      animation: bp-flash 1s ease-in-out infinite;
    }
    @keyframes bp-flash { 0%,100%{opacity:1} 50%{opacity:0.5} }

    /* Debugger action buttons */
    .dbg-actions {
      display: flex; align-items: center; gap: 2px; flex-shrink: 0;
    }
    .dbg-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 8px; border-radius: 6px;
      border: 1px solid #e5e7eb; background: #fff;
      font-size: 10px; font-weight: 600; color: #374151;
      cursor: pointer; transition: all 0.15s; white-space: nowrap;
    }
    .dbg-btn:hover:not(:disabled) {
      border-color: #6366f1; color: #6366f1; background: #f5f3ff;
    }
    .dbg-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .dbg-btn:active:not(:disabled) { transform: scale(0.96); }

    .dbg-continue { color: #059669; border-color: #d1fae5; background: #f0fdf4; }
    .dbg-continue:hover:not(:disabled) { border-color: #22c55e; color: #16a34a; background: #dcfce7; }
    .dbg-btn-active { background: #fee2e2 !important; border-color: #fca5a5 !important; color: #dc2626 !important; }

    .dbg-step-into { color: #6366f1; border-color: #e0e7ff; background: #eef2ff; }
    .dbg-step-into:hover:not(:disabled) { border-color: #6366f1; background: #e0e7ff; }

    .dbg-auto { color: #6b7280; }
    .dbg-auto-active { color: #f59e0b !important; border-color: #fde68a !important; background: #fffbeb !important; }

    .dbg-sep-v {
      width: 1px; height: 18px; background: #e5e7eb; margin: 0 3px; flex-shrink: 0;
    }

    .zoom-row {
      display: flex; align-items: center; gap: 1px;
      background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 5px;
      padding: 2px 2px;
    }
    .z-btn {
      background: transparent; border: none; color: #6b7280;
      font-size: 10px; font-weight: 700; padding: 2px 6px;
      cursor: pointer; border-radius: 3px; transition: all 0.15s; line-height: 1;
    }
    .z-btn:hover { color: #374151; background: #e5e7eb; }
    .z-pct { font-size: 9px; color: #9ca3af; min-width: 28px; text-align: center; font-variant-numeric: tabular-nums; }

    /* ══ Call Stack ════════════════════════════════════════════════════════ */
    .call-stack-bar {
      display: flex; align-items: center; gap: 0;
      padding: 0 0 0 10px; flex-shrink: 0;
      background: #fffbeb; border-bottom: 1px solid #fde68a;
      position: relative; flex-wrap: wrap; min-height: 28px;
    }
    .cs-title {
      font-size: 8.5px; font-weight: 800; color: #92400e;
      letter-spacing: 0.1em; text-transform: uppercase;
      display: flex; align-items: center; gap: 4px;
      padding: 5px 10px 5px 0; flex-shrink: 0;
    }
    .cs-frame {
      display: flex; align-items: center; gap: 5px;
      padding: 4px 10px; font-size: 10px; border-left: 1px solid #fde68a;
    }
    .cs-frame-active { background: rgba(245,158,11,0.08); }
    .cs-frame-idx {
      font-size: 8px; font-weight: 800; color: #92400e;
      background: rgba(245,158,11,0.2); border-radius: 3px;
      width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
    }
    .cs-frame-fn {
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      font-weight: 600; color: #059669;
    }
    .cs-frame-loc {
      font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #9ca3af;
    }
    .cs-close {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      width: 18px; height: 18px; border-radius: 50%; border: none;
      background: #fde68a; color: #92400e; font-size: 9px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }

    /* ══ Code scroll ═══════════════════════════════════════════════════════ */
    .code-scroll {
      flex: 1; overflow: auto;
      scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
      background: #fafbff;
    }
    .code-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .code-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }

    .code-block { display: flex; min-width: max-content; padding: 8px 0; }

    /* ══ Gutter with breakpoints ═══════════════════════════════════════════ */
    .gutter {
      display: flex; flex-direction: column;
      background: #f8f9fb; user-select: none; flex-shrink: 0;
      border-right: 1px solid #f0f0f5; min-width: 56px;
    }
    .ln-row {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 3px; padding: 0 6px 0 4px; position: relative; cursor: pointer;
      transition: background 0.1s;
    }
    .ln-row:hover { background: #f0f0f5; }
    .ln-row:hover .bp-dot:not(.bp-dot-on) { opacity: 0.4; }

    .bp-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444; opacity: 0; flex-shrink: 0;
      transition: opacity 0.15s;
    }
    .bp-dot-on { opacity: 1 !important; box-shadow: 0 0 0 2px rgba(239,68,68,0.2); }
    .ln-breakpoint { background: rgba(239,68,68,0.06); }

    .ln-ptr {
      font-size: 7px; color: #f59e0b; flex-shrink: 0;
      animation: ptr-pulse 0.9s ease-in-out infinite;
    }
    @keyframes ptr-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    .ln-num {
      font-family: 'JetBrains Mono', monospace;
      color: #c4c9d6; line-height: 1.75; text-align: right;
      transition: color 0.15s; min-width: 20px; text-align: right;
    }
    .ln-active .ln-num { color: #d97706; font-weight: 700; }

    /* ══ Code lines ════════════════════════════════════════════════════════ */
    .lines { flex: 1; padding: 0 16px; }

    .code-line {
      font-family: 'JetBrains Mono', monospace;
      line-height: 1.75; white-space: pre; color: #374151;
      border-radius: 3px; padding: 0 6px;
      transition: background 0.12s;
      position: relative;
    }

    /* Currently executing line */
    .line-active {
      background: rgba(245,158,11,0.07) !important;
      border-left: 3px solid #f59e0b;
      padding-left: 11px;
    }

    /* Lines already stepped through */
    .line-executed {
      background: rgba(34,197,94,0.04);
    }
    .line-executed:hover { background: rgba(34,197,94,0.07); }

    /* Breakpoint line highlight */
    .line-breakpoint {
      background: rgba(239,68,68,0.06) !important;
      border-left: 3px solid #ef4444;
      padding-left: 11px;
    }
    .line-active.line-breakpoint {
      background: rgba(239,68,68,0.1) !important;
      border-left: 3px solid #ef4444;
    }

    /* Inline output */
    .inline-out {
      font-family: 'JetBrains Mono', monospace;
      color: #92400e; background: rgba(254,243,199,0.7);
      border: 1px solid rgba(253,230,138,0.5); border-radius: 3px;
      padding: 0 5px; margin-left: 10px;
      white-space: pre; font-style: italic; font-size: 0.9em;
      animation: fadein 0.1s ease;
    }
    @keyframes fadein { from{opacity:0} to{opacity:1} }

    .out-dot {
      color: #22c55e; font-size: 8px; margin-left: 6px;
      vertical-align: middle; cursor: default; opacity: 0.7;
    }

    /* ══ Footer ════════════════════════════════════════════════════════════ */
    .code-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 12px;
      background: #f8f9fb; border-top: 1px solid #e8eaf0; flex-shrink: 0;
      gap: 8px;
    }
    .foot-left { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
    .foot-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .foot-bulb { font-size: 11px; flex-shrink: 0; }
    .foot-desc { font-size: 10.5px; color: #6b7280; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .cs-toggle-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 5px;
      border: 1px solid #e5e7eb; background: #fff;
      font-size: 9.5px; font-weight: 600; color: #6b7280;
      cursor: pointer; transition: all 0.15s;
    }
    .cs-toggle-btn:hover { border-color: #f59e0b; color: #92400e; background: #fffbeb; }
    .cs-active { border-color: #f59e0b !important; color: #92400e !important; background: #fffbeb !important; }

    .foot-step-badge {
      font-size: 9px; font-weight: 700;
      background: #f3f4f6; color: #6b7280;
      padding: 2px 7px; border-radius: 4px;
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }

    /* ══ Empty state ═══════════════════════════════════════════════════════ */
    .code-empty {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 10px;
    }
    .empty-icon {
      font-size: 32px; font-family: 'JetBrains Mono', monospace;
      color: #e5e7eb; letter-spacing: 4px;
    }
    .empty-text { font-size: 12px; color: #9ca3af; }
    .empty-hints {
      display: flex; align-items: center; gap: 8px;
      font-size: 10px; color: #9ca3af;
    }
    .hint-key {
      background: #f3f4f6; border: 1px solid #e5e7eb;
      border-radius: 4px; padding: 2px 6px;
      font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: #374151;
    }

    /* ══ Syntax highlighting (light theme) ════════════════════════════════ */
    :host ::ng-deep .kw  { color: #7c3aed; font-weight: 600; }
    :host ::ng-deep .str { color: #059669; }
    :host ::ng-deep .cm  { color: #9ca3af; font-style: italic; }
    :host ::ng-deep .dec { color: #db2777; }
    :host ::ng-deep .num { color: #ea580c; }
    :host ::ng-deep .bi  { color: #2563eb; }
    :host ::ng-deep .fn  { color: #0891b2; font-weight: 600; }
  `]
})
export class CodePanelComponent {
  readonly eng = inject(ExecutionEngineService);
  readonly step = this.eng.currentStep;
  readonly hoveredLine = signal<number | null>(null);
  readonly showCallStack = signal(false);
  readonly codeLines = computed(() => this.step()?.code.split('\n') ?? []);
  readonly totalLines = computed(() => this.codeLines().length);
  private readonly scrollRef = viewChild<ElementRef<HTMLElement>>('codeScroll');

  constructor() {
    // Auto-scroll active line into view
    effect(() => {
      const line = this.eng.activeLine();
      if (!line) return;
      const el = this.scrollRef()?.nativeElement;
      if (!el) return;
      setTimeout(() => {
        (el.querySelector('.line-active') as HTMLElement | null)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 60);
    });

    // Auto-show call stack when paused at breakpoint
    effect(() => {
      if (this.eng.pausedAtBreakpoint()) this.showCallStack.set(true);
    });
  }

  isActive(n: number): boolean {
    return this.eng.activeLine() === n;
  }

  // A line is "executed" if it's before the active line in current step
  isExecuted(n: number): boolean {
    const active = this.eng.activeLine();
    const stepHighlight = this.step()?.highlightLine ?? 1;
    if (active === null) return false;
    return n < active && n >= stepHighlight;
  }

  isBreakpoint(n: number): boolean {
    const stepId = this.step()?.id;
    return stepId !== undefined ? this.eng.hasBreakpoint(stepId, n) : false;
  }

  toggleBreakpoint(n: number): void {
    const stepId = this.step()?.id;
    if (stepId !== undefined) this.eng.toggleBreakpoint(stepId, n);
  }

  hasOutput(n: number): boolean { return !!this.step()?.lineOutputs?.[n]; }
  getOutput(n: number): string  { return this.step()?.lineOutputs?.[n] ?? ''; }

  colorize(raw: string): string {
    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const KW = new Set(['def','class','return','if','elif','else','for','in','import','from',
      'try','except','raise','with','as','not','and','or','True','False','None',
      'async','await','lambda','yield','pass','break','continue','self','super']);
    const BUILTINS = new Set(['print','len','range','str','int','float','list','dict',
      'set','tuple','type','isinstance','hasattr','getattr','setattr','max','min',
      'sum','map','filter','zip','enumerate','open','json','os','sys','logging']);

    const TOKEN = /"""[\s\S]*?"""|'''[\s\S]*?'''|f?"[^"\n]*"|f?'[^'\n]*'|#[^\n]*|@[\w.]+|\b(?:def|class|return|if|elif|else|for|in|import|from|try|except|raise|with|as|not|and|or|True|False|None|async|await|lambda|yield|pass|break|continue|self|super)\b|\b\d+\.?\d*\b|[A-Za-z_]\w*(?=\s*\()|[a-z_]\w*|[\s\S]/g;

    return raw.replace(TOKEN, tok => {
      const e = esc(tok); const c = tok[0];
      if (c === '#') return `<span class="cm">${e}</span>`;
      if (c === '@') return `<span class="dec">${e}</span>`;
      if ((c === '"' || c === "'") || (c === 'f' && tok.length > 1 && (tok[1] === '"' || tok[1] === "'")))
        return `<span class="str">${e}</span>`;
      if (KW.has(tok)) return `<span class="kw">${e}</span>`;
      if (c >= '0' && c <= '9') return `<span class="num">${e}</span>`;
      if (/^[A-Za-z_]\w*$/.test(tok) && tok[tok.length-1] !== '(') {
        if (BUILTINS.has(tok)) return `<span class="bi">${e}</span>`;
        if (/^[A-Z]/.test(tok)) return `<span class="bi">${e}</span>`;
      }
      if (/^[A-Za-z_]\w*$/.test(tok)) return `<span class="fn">${e}</span>`;
      return e;
    });
  }
}
