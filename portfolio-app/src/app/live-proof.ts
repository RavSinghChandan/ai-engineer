import { Component, OnInit, computed, inject, input } from '@angular/core';
import { GH_QUERY, LiveStatus, RequestLog } from './live-status.service';

/**
 * "Don't take my word for it": each row is checked live from the visitor's browser,
 * and shows the real request behind it (status code and timing). Rows appear as
 * their answers arrive. Unreachable sources say so and fall back to the last known value.
 */
@Component({
  selector: 'live-proof',
  standalone: true,
  template: `
    <div class="lp" aria-live="polite">
      <div class="lp-head">
        <span class="lp-title"><span class="lp-rec" aria-hidden="true"></span>Live proof</span>
        <span class="lp-when">{{ live.checkedLabel() }}</span>
        <button type="button" class="lp-refresh" (click)="live.refresh()" [disabled]="live.busy()" aria-label="Check again">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" [class.spin]="live.busy()"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        </button>
      </div>
      <p class="lp-sub">Your browser is checking these right now. Not screenshots, not claims.</p>

      <a class="lp-row" href="https://aurawithrav.com" target="_blank" rel="noopener">
        <span [class]="'lp-dot ' + live.apiState()"></span>
        <span class="lp-k">Production API<small>aurawithrav.com</small></span>
        <span class="lp-v">
          @switch (live.apiState()) {
            @case ('checking') { checking… }
            @case ('ok') { healthy · {{ live.apiMs() }} ms }
            @case ('slow') { waking up · {{ live.apiMs() }} ms }
            @default { unreachable now }
          }
        </span>
        @if (live.apiLog(); as l) { <code class="lp-req">{{ req(l) }}</code> }
      </a>

      <a class="lp-row" [href]="ghSearchUrl" target="_blank" rel="noopener">
        <span [class]="'lp-dot ' + live.ghState()"></span>
        <span class="lp-k">Merged open-source PRs<small>pypdf · joblib · Sentence Transformers · NLTK · Authlib</small></span>
        <span class="lp-v"><b>{{ count() }}</b> {{ live.ghState() === 'down' ? '(last known)' : 'on GitHub' }}</span>
        @if (live.searchLog(); as l) { <code class="lp-req">{{ req(l) }}</code> }
      </a>

      @if (live.latest(); as m) {
        <a class="lp-row lp-in" [href]="m.url" target="_blank" rel="noopener">
          <span class="lp-dot ok"></span>
          <span class="lp-k">Latest merge<small>{{ m.repo }} #{{ m.number }}</small></span>
          <span class="lp-v lp-merge"><span class="lp-pr">{{ m.title }}</span><small>merged {{ live.ago(m.at) }}</small></span>
        </a>
      }

      @if (live.lastPush(); as p) {
        <a class="lp-row lp-in" href="https://github.com/RavSinghChandan" target="_blank" rel="noopener">
          <span class="lp-dot ok"></span>
          <span class="lp-k">Last code push<small>{{ p.repo }}</small></span>
          <span class="lp-v">{{ live.ago(p.at) }}</span>
          @if (live.eventsLog(); as l) { <code class="lp-req">{{ req(l) }}</code> }
        </a>
      }
    </div>
  `,
  styleUrl: './live-proof.scss',
})
export class LiveProof implements OnInit {
  /** Count compiled into the page, shown until (or if) GitHub answers. */
  fallbackCount = input(0);
  readonly live = inject(LiveStatus);
  readonly ghSearchUrl = 'https://github.com/search?type=pullrequests&q=' + encodeURIComponent(GH_QUERY);
  readonly count = computed(() => this.live.liveCount() ?? this.fallbackCount());

  ngOnInit() { this.live.start(); }

  req(l: RequestLog): string {
    if (l.status === 'cache') return `${l.label} → cached this visit`;
    if (l.status === 'error') return `${l.label} → no answer · ${l.ms} ms`;
    return `${l.label} → ${l.status} · ${l.ms} ms`;
  }
}
