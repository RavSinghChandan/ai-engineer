import { Component, OnInit, computed, inject, input } from '@angular/core';
import { CheckState, GH_QUERY, LiveStatus } from './live-status.service';

/**
 * The hero's live proof as a diagram: the visitor's browser at the top, wired to
 * the three products and GitHub. Each wire carries a pulse while its check runs;
 * the box turns green with the real response time when the answer comes back.
 */
interface Box { key: string; name: string; href: string; icon: string; state: CheckState; value: string; }

@Component({
  selector: 'live-map',
  standalone: true,
  template: `
    <div class="lm" aria-live="polite">
      <div class="lm-head">
        <span class="lm-title"><span class="lm-rec" aria-hidden="true"></span>Live now</span>
        <button type="button" class="lm-refresh" (click)="live.refresh()" [disabled]="live.busy()" aria-label="Check again">
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
          <a class="lm-box" [class]="'lm-box ' + b.state" [href]="b.href" target="_blank" rel="noopener" [attr.aria-label]="b.name + ': ' + b.value">
            <span class="lm-wire" aria-hidden="true"><i></i></span>
            <span class="lm-ico" aria-hidden="true">
              @switch (b.icon) {
                @case ('globe') { <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg> }
                @case ('mirror') { <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="10" rx="6" ry="7"/><path d="M12 17v4M8 21h8"/></svg> }
                @case ('leaf') { <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/></svg> }
                @default { <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6h3a4 4 0 0 1 4 4v-.5"/></svg> }
              }
            </span>
            <span class="lm-name">{{ b.name }}</span>
            <span class="lm-val"><span class="lm-dot"></span>{{ b.value }}</span>
          </a>
        }
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
export class LiveMap implements OnInit {
  fallbackCount = input(0);
  readonly live = inject(LiveStatus);

  readonly boxes = computed<Box[]>(() => {
    const aura = this.live.stateOf('01'), aaina = this.live.stateOf('08'), poultry = this.live.stateOf('09');
    const count = this.live.liveCount() ?? this.fallbackCount();
    return [
      { key: 'aura', name: 'Aura', href: 'https://aurawithrav.com', icon: 'globe', state: aura.state, value: this.ms(aura) },
      { key: 'aaina', name: 'Aaina', href: 'https://aaina-ai.vercel.app', icon: 'mirror', state: aaina.state, value: this.ms(aaina) },
      { key: 'poultry', name: 'Poultry', href: 'https://poultry-360.onrender.com', icon: 'leaf', state: poultry.state, value: this.ms(poultry) },
      { key: 'gh', name: 'GitHub', href: 'https://github.com/search?type=pullrequests&q=' + encodeURIComponent(GH_QUERY),
        icon: 'git', state: this.live.ghState() === 'down' ? 'ok' : this.live.ghState(), value: `${count} PRs` },
    ];
  });

  ngOnInit() { this.live.start(); }

  private ms(s: { state: CheckState; ms: number }): string {
    if (s.state === 'checking') return '···';
    if (s.state === 'down') return 'asleep';
    return s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`;
  }
}
