import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CheckState, GH_QUERY, LiveStatus } from './live-status.service';
import { MergedPr, REPO_COLOR } from './proof-viz';

/**
 * The hero's live proof as a diagram: the visitor's browser at the top, wired to
 * the three products and GitHub. Each wire carries a pulse while its check runs;
 * the box turns green with the real response time when the answer comes back.
 */
interface Dot { color: string; label: string; href?: string; }
interface Box { key: string; name: string; href: string; icon: string; state: CheckState; value: string; dots: Dot[]; cols: number; }

/** What each live product is made of: one square per part, coloured by layer. */
const C = { ui: '#00ABAB', api: '#F5A524', ai: '#86BC25', guard: '#E5484D', lang: '#7C9CFF', vision: '#C084FC' };
const times = (n: number, color: string, label: (i: number) => string): Dot[] => Array.from({ length: n }, (_, i) => ({ color, label: label(i) }));
const STACK: Record<string, Dot[]> = {
  aura: [{ color: C.ui, label: 'UI · Angular' }, { color: C.api, label: 'API · FastAPI' },
    ...times(16, C.ai, i => `AI agent ${i + 1} of 16`), ...times(5, C.guard, i => `Guardrail G${i + 1}`)],
  aaina: [{ color: C.ui, label: 'UI · Angular' }, { color: C.api, label: 'API · FastAPI' },
    ...times(7, C.ai, i => `AI agent ${i + 1} of 7`), ...times(11, C.lang, i => `Language ${i + 1} of 11`)],
  poultry: [{ color: C.ui, label: 'UI · Angular' }, { color: C.api, label: 'API · FastAPI' }, { color: C.vision, label: 'Vision · YOLO11 on CPU' },
    ...['Today', 'Count', 'Feed', 'Health', 'Diary'].map(f => ({ color: C.ai, label: `Feature · ${f}` })),
    ...times(13, C.lang, i => `Language ${i + 1} of 13`)],
};
export const LIVE_LEGEND = [
  { color: C.ui, label: 'UI' }, { color: C.api, label: 'API' }, { color: C.ai, label: 'AI' },
  { color: C.guard, label: 'guardrails' }, { color: C.vision, label: 'vision' }, { color: C.lang, label: 'languages' },
];

@Component({
  selector: 'live-map',
  standalone: true,
  template: `
    <div class="lm" aria-live="polite">
      <div class="lm-head">
        <span class="lm-title"><span class="lm-rec" aria-hidden="true"></span>Live now</span>
        <button type="button" class="lm-refresh" (click)="recheck()" [disabled]="live.busy()" aria-label="Check again">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" [class.spin]="live.busy()"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        </button>
      </div>

      <div class="lm-you" title="Checked from your browser, right now">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
        You
      </div>
      <div class="lm-bus" aria-hidden="true"></div>

      <div class="lm-grid">
        @for (b of boxes(); track b.key) {
          <a class="lm-box" [class]="'lm-box ' + b.state" [style.--p]="b.state === 'checking' ? progress() : 1" [href]="b.href" target="_blank" rel="noopener" [attr.aria-label]="b.name + ': ' + b.value">
            <span class="lm-wire" aria-hidden="true"><i></i></span>
            <span class="lm-dots" [style.--cols]="b.cols" aria-hidden="true">
              @for (d of b.dots; track $index; let i = $index) {
                <i [style.background]="d.color" [title]="d.label" [class.on]="lit(b, i)"></i>
              }
            </span>
            <span class="lm-name">{{ b.name }}</span>
            <span class="lm-val"><span class="lm-dot"></span>{{ b.value }}</span>
          </a>
        }
      </div>

      <div class="lm-legend" aria-hidden="true">
        @for (l of legend; track l.label) { <span><i [style.background]="l.color"></i>{{ l.label }}</span> }
        <span><i class="lm-rainbow"></i>PRs by library</span>
      </div>

      @if (live.latest(); as m) {
        <a class="lm-merge" [href]="m.url" target="_blank" rel="noopener">
          <span class="lm-tag">merged</span>{{ m.repo.split('/')[1] }} #{{ m.number }}<span class="lm-ago">{{ live.ago(m.at) }}</span>
        </a>
      }
    </div>
  `,
  styleUrl: './live-map.scss',
})
export class LiveMap implements OnInit, OnDestroy {
  fallbackCount = input(0);
  prs = input<MergedPr[]>([]);
  readonly legend = LIVE_LEGEND;
  readonly live = inject(LiveStatus);

  readonly boxes = computed<Box[]>(() => {
    const aura = this.live.stateOf('01'), aaina = this.live.stateOf('08'), poultry = this.live.stateOf('09');
    const count = this.live.liveCount() ?? this.fallbackCount();
    return [
      { key: 'aura', name: 'Aura', href: 'https://aurawithrav.com', icon: 'globe', state: aura.state, value: this.ms(aura), dots: STACK['aura'], cols: 6 },
      { key: 'aaina', name: 'Aaina', href: 'https://aaina-ai.vercel.app', icon: 'mirror', state: aaina.state, value: this.ms(aaina), dots: STACK['aaina'], cols: 6 },
      { key: 'poultry', name: 'Poultry', href: 'https://poultry-360.onrender.com', icon: 'leaf', state: poultry.state, value: this.ms(poultry), dots: STACK['poultry'], cols: 6 },
      { key: 'gh', name: 'GitHub', href: 'https://github.com/search?type=pullrequests&q=' + encodeURIComponent(GH_QUERY),
        icon: 'git', state: this.live.ghState() === 'down' ? 'ok' : this.live.ghState(), value: `${count} PRs`,
        dots: this.prs().map(p => ({ color: REPO_COLOR[p.repo] ?? '#86BC25', label: `${p.repo}: ${p.title}` })), cols: 12 },
    ];
  });

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private started = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Seconds since the checks began, ticking while any box is still waiting. */
  readonly elapsed = signal(0);
  /** How full a waiting box is: eases toward 95% with time, and only the real answer takes it to 100%. */
  readonly progress = computed(() => Math.min(0.95, 1 - Math.exp(-this.elapsed() / 10)));

  /** A waiting box lights its squares one by one with the progress; an answered box lights them all. */
  lit(b: Box, i: number): boolean {
    if (b.state === 'ok' || b.state === 'slow') return true;
    if (b.state === 'checking') return i < Math.floor(this.progress() * b.dots.length);
    return false;
  }

  ngOnInit() {
    this.live.start();
    this.tick();
  }

  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  recheck() {
    this.live.refresh();
    this.tick();
  }

  private tick() {
    if (!this.browser) return;
    this.started = Date.now();
    this.elapsed.set(0);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.elapsed.set((Date.now() - this.started) / 1000);
      if (!this.boxes().some(b => b.state === 'checking')) { clearInterval(this.timer!); this.timer = null; }
    }, 200);
  }

  private ms(s: { state: CheckState; ms: number }): string {
    if (s.state === 'checking') return this.elapsed() < 1 ? '···' : `${Math.floor(this.elapsed())} s…`;
    if (s.state === 'down') return 'asleep';
    return s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`;
  }
}
