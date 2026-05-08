import { Component, inject, computed, signal, effect, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionStateService } from '../../services/execution-state.service';

@Component({
  selector: 'app-code-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="code-wrapper">

      @if (step()) {

        <!-- ── Debug context bar ── -->
        <div class="dbg-bar">
          <span class="dbg-arrow">&#9654;</span>
          <span class="dbg-file">&#128196; {{ step()!.file }}</span>
          <span class="dbg-sep">›</span>
          <span class="dbg-fn">{{ step()!.functionName }}</span>
          <span class="dbg-sep">›</span>
          <span class="dbg-line">Line {{ svc.activeLine() }}
            <span class="dbg-of">/ {{ codeLines().length }}</span>
          </span>
        </div>

        <!-- ── Scrollable code area ── -->
        <div class="code-scroll" #codeScroll>
          <div class="code-block">

            <!-- Gutter: ▶ arrow on active line, number on others -->
            <div class="gutter">
              @for (line of codeLines(); track $index) {
                <div class="ln" [ngClass]="{ 'ln-active': isActive($index + 1) }"
                     [style.fontSize.px]="svc.codeFontSize()">
                  @if (isActive($index + 1)) {
                    <span class="ln-ptr">&#9654;</span>
                  }
                  {{ $index + 1 }}
                </div>
              }
            </div>

            <!-- Code lines -->
            <div class="lines">
              @for (line of codeLines(); track $index) {
                <div class="line"
                     [ngClass]="{ 'line-active': isActive($index + 1), 'line-has-output': hasOutput($index + 1) }"
                     [style.fontSize.px]="svc.codeFontSize()"
                     (mouseenter)="hoveredLine.set($index + 1)"
                     (mouseleave)="hoveredLine.set(null)">
                  <span [innerHTML]="colorize(line)"></span>
                  @if (hoveredLine() === $index + 1 && hasOutput($index + 1)) {
                    <span class="inline-output">&#160;&#160;// &#8594; {{ getOutput($index + 1) }}</span>
                  } @else if (hasOutput($index + 1)) {
                    <span class="output-hint">&#183;</span>
                  }
                </div>
              }
            </div>

          </div>
        </div>

        <!-- Description footer -->
        <div class="footer">
          <span class="foot-icon">&#128161;</span>
          <span class="foot-text">{{ step()!.description }}</span>
        </div>

      } @else {
        <div class="empty">
          <div class="empty-brace">&#123; &#125;</div>
          <p class="empty-label">Select or run a step to view code</p>
        </div>
      }

    </div>
  `,
  styles: [`
    /* Host fills entire parent flex cell */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .code-wrapper {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background: #ffffff;
      overflow: hidden;
    }

    /* ── Debug context bar ── */
    .dbg-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 14px;
      background: #f0f4ff;
      border-bottom: 1px solid #dde5ff;
      flex-shrink: 0;
      flex-wrap: wrap;
      min-height: 28px;
    }
    .dbg-arrow {
      font-size: 9px;
      color: #f59e0b;
      flex-shrink: 0;
    }
    .dbg-file {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: #4f46e5;
      font-weight: 600;
    }
    .dbg-sep { font-size: 10px; color: #c7d2fe; }
    .dbg-fn {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: #059669;
      font-weight: 600;
    }
    .dbg-line {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: #f59e0b;
      font-weight: 700;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 1px 6px;
    }
    .dbg-of { font-weight: 400; color: #9ca3af; }

    /* ── Scrollable code area ── */
    .code-scroll {
      flex: 1;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: #d1d5db transparent;
      background: #ffffff;
    }
    .code-scroll::-webkit-scrollbar { width: 7px; height: 7px; }
    .code-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

    .code-block {
      display: flex;
      min-width: max-content;
      padding: 16px 0;
    }

    /* ── Line number gutter ── */
    .gutter {
      display: flex;
      flex-direction: column;
      padding: 0 14px 0 12px;
      border-right: 1px solid #e5e7eb;
      background: #f9fafb;
      user-select: none;
      flex-shrink: 0;
      min-width: 42px;
    }
    .ln {
      font-size: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #c9d0d8;
      line-height: 1.75;
      text-align: right;
      transition: color 0.15s;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }
    .ln-active {
      color: #d97706;
      font-weight: 700;
    }
    .ln-ptr {
      font-size: 9px;
      color: #f59e0b;
      flex-shrink: 0;
      animation: ptr-pulse 1s ease-in-out infinite;
    }
    @keyframes ptr-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    /* ── Code lines ── */
    .lines {
      flex: 1;
      padding: 0 20px;
    }
    .line {
      font-size: 13px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      line-height: 1.75;
      white-space: pre;
      border-radius: 4px;
      padding: 0 6px;
      color: #1e293b;
      transition: background 0.15s;
    }
    .line-active {
      background: rgba(245, 158, 11, 0.10);
      border-left: 3px solid #f59e0b;
      padding-left: 10px;
    }

    /* ── Inline output on hover ── */
    .inline-output {
      display: inline;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #b45309;
      background: #fef9c3;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 0 6px;
      margin-left: 10px;
      white-space: pre;
      font-style: italic;
      animation: fadein-out 0.12s ease;
    }
    @keyframes fadein-out { from { opacity: 0; } to { opacity: 1; } }

    /* Subtle dot when line has output but not hovered */
    .output-hint {
      display: inline;
      color: #d97706;
      opacity: 0.35;
      font-size: 16px;
      margin-left: 3px;
      vertical-align: middle;
    }
    .line-has-output:hover { background: rgba(254,249,195,0.35); }

    /* ── Footer ── */
    .footer {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 16px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      flex-shrink: 0;
    }
    .foot-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .foot-text {
      font-size: 12px;
      color: #4b5563;
      line-height: 1.55;
    }

    /* ── Empty state ── */
    .empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: #fafafa;
    }
    .empty-brace {
      font-size: 36px;
      font-family: 'JetBrains Mono', monospace;
      color: #e5e7eb;
      letter-spacing: 4px;
    }
    .empty-label { font-size: 12px; color: #9ca3af; }

    /* ── Syntax highlight — light theme ── */
    :host ::ng-deep .kw  { color: #7c3aed; font-weight: 600; }   /* purple  — def, class, return … */
    :host ::ng-deep .str { color: #16a34a; }                      /* green   — strings             */
    :host ::ng-deep .cm  { color: #9ca3af; font-style: italic; }  /* grey    — comments            */
    :host ::ng-deep .dec { color: #db2777; }                      /* pink    — @decorators         */
    :host ::ng-deep .num { color: #ea580c; }                      /* orange  — numbers             */
    :host ::ng-deep .bi  { color: #2563eb; }                      /* blue    — builtins / fn calls */
  `]
})
export class CodePanelComponent {
  readonly svc = inject(ExecutionStateService);

  readonly step = this.svc.currentStep;
  readonly hoveredLine = signal<number | null>(null);

  readonly codeLines = computed(() => {
    const s = this.step();
    return s ? s.code.split('\n') : [];
  });


  private readonly scrollRef = viewChild<ElementRef<HTMLElement>>('codeScroll');

  constructor() {
    effect(() => {
      const line = this.svc.activeLine();
      if (!line) return;
      const el = this.scrollRef()?.nativeElement;
      if (!el) return;
      setTimeout(() => {
        const active = el.querySelector('.line-active') as HTMLElement | null;
        active?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 60);
    });
  }

  isActive(lineNum: number): boolean {
    return this.svc.activeLine() === lineNum;
  }

  hasOutput(lineNum: number): boolean {
    return !!this.step()?.lineOutputs?.[lineNum];
  }

  getOutput(lineNum: number): string {
    return this.step()?.lineOutputs?.[lineNum] ?? '';
  }

  colorize(raw: string): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const KW = new Set([
      'def','class','return','if','elif','else','for','in','import','from',
      'try','except','raise','with','as','not','and','or','True','False',
      'None','async','await','lambda','yield','pass','break','continue'
    ]);

    // Single-pass: match tokens in priority order so regexes never touch
    // already-emitted HTML. The final [\s\S] catches one leftover char.
    const TOKEN = /"""[\s\S]*?"""|'''[\s\S]*?'''|f?"[^"\n]*"|f?'[^'\n]*'|#[^\n]*|@[\w.]+|\b(?:def|class|return|if|elif|else|for|in|import|from|try|except|raise|with|as|not|and|or|True|False|None|async|await|lambda|yield|pass|break|continue)\b|\b\d+\.?\d*\b|[a-z_]\w*(?=\s*\()|[\s\S]/g;

    return raw.replace(TOKEN, tok => {
      const e = esc(tok);
      const c = tok[0];
      if (c === '#') return `<span class="cm">${e}</span>`;
      if (c === '@') return `<span class="dec">${e}</span>`;
      if (c === '"' || c === "'") return `<span class="str">${e}</span>`;
      if (c === 'f' && tok.length > 1 && (tok[1] === '"' || tok[1] === "'"))
        return `<span class="str">${e}</span>`;
      if (KW.has(tok)) return `<span class="kw">${e}</span>`;
      if (c >= '0' && c <= '9') return `<span class="num">${e}</span>`;
      if (/^[a-z_]\w*$/.test(tok)) return `<span class="bi">${e}</span>`;
      return e;
    });
  }
}
