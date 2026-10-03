import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * "Don't take my word for it": every row is fetched live from the visitor's own
 * browser - the production API's health, the merged-PR count straight from GitHub,
 * the latest merge and the last code push. If a source is unreachable the row says
 * so (and falls back to the last known value) instead of pretending.
 */
type State = 'checking' | 'ok' | 'slow' | 'down';

interface Merge { title: string; repo: string; number: number; url: string; at: string; }

const API_HEALTH = 'https://astro-intel-api.onrender.com/health';
const LIBS = ['py-pdf/pypdf', 'joblib/joblib', 'huggingface/sentence-transformers', 'nltk/nltk', 'authlib/authlib'];
const GH_QUERY = 'is:pr author:RavSinghChandan is:merged ' + LIBS.map(r => `repo:${r}`).join(' ');
const CACHE_KEY = 'live-proof-v1';

@Component({
  selector: 'live-proof',
  standalone: true,
  template: `
    <div class="lp" aria-live="polite">
      <div class="lp-head">
        <span class="lp-title"><span class="lp-rec" aria-hidden="true"></span>Live proof</span>
        <span class="lp-when">{{ checkedLabel() }}</span>
        <button type="button" class="lp-refresh" (click)="refresh()" [disabled]="busy()" aria-label="Check again">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" [class.spin]="busy()"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        </button>
      </div>
      <p class="lp-sub">Fetched by your browser just now. Not screenshots, not claims.</p>

      <a class="lp-row" href="https://aurawithrav.com" target="_blank" rel="noopener">
        <span class="lp-dot" [class]="'lp-dot ' + apiState()"></span>
        <span class="lp-k">Production API<small>aurawithrav.com</small></span>
        <span class="lp-v">
          @switch (apiState()) {
            @case ('checking') { checking… }
            @case ('ok') { healthy · {{ apiMs() }} ms }
            @case ('slow') { waking up (free tier) · {{ apiMs() }} ms }
            @default { unreachable right now }
          }
        </span>
      </a>

      <a class="lp-row" [href]="ghSearchUrl" target="_blank" rel="noopener">
        <span class="lp-dot" [class]="'lp-dot ' + ghState()"></span>
        <span class="lp-k">Merged open-source PRs<small>pypdf · joblib · Sentence Transformers · NLTK · Authlib</small></span>
        <span class="lp-v"><b>{{ mergedCount() }}</b> {{ ghState() === 'down' ? '(last known)' : 'on GitHub' }}</span>
      </a>

      @if (latest(); as m) {
        <a class="lp-row" [href]="m.url" target="_blank" rel="noopener">
          <span class="lp-dot ok"></span>
          <span class="lp-k">Latest merge<small>{{ m.repo }} #{{ m.number }}</small></span>
          <span class="lp-v lp-merge"><span class="lp-pr">{{ m.title }}</span><small>merged {{ ago(m.at) }}</small></span>
        </a>
      }

      @if (lastPush(); as p) {
        <a class="lp-row" href="https://github.com/RavSinghChandan" target="_blank" rel="noopener">
          <span class="lp-dot ok"></span>
          <span class="lp-k">Last code push<small>{{ p.repo }}</small></span>
          <span class="lp-v">{{ ago(p.at) }}</span>
        </a>
      }
    </div>
  `,
  styleUrl: './live-proof.scss',
})
export class LiveProof implements OnInit, OnDestroy {
  /** Count compiled into the page, shown until (or if) GitHub answers. */
  fallbackCount = input(0);

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly ghSearchUrl = 'https://github.com/search?type=pullrequests&q=' + encodeURIComponent(GH_QUERY);

  apiState = signal<State>('checking');
  apiMs = signal(0);
  ghState = signal<State>('checking');
  liveCount = signal<number | null>(null);
  latest = signal<Merge | null>(null);
  lastPush = signal<{ repo: string; at: string } | null>(null);
  checkedAt = signal<number | null>(null);
  busy = signal(false);
  private now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  mergedCount = computed(() => this.liveCount() ?? this.fallbackCount());
  checkedLabel = computed(() => {
    const t = this.checkedAt();
    if (t === null) return 'checking…';
    const s = Math.max(0, Math.round((this.now() - t) / 1000));
    return s < 5 ? 'checked just now' : s < 60 ? `checked ${s}s ago` : `checked ${Math.round(s / 60)} min ago`;
  });

  ngOnInit() {
    if (!this.browser) return;
    this.timer = setInterval(() => this.now.set(Date.now()), 5000);
    this.refresh(true);
  }

  ngOnDestroy() { clearInterval(this.timer); }

  async refresh(useCache = false) {
    if (this.busy()) return;
    this.busy.set(true);
    await Promise.all([this.checkApi(), this.checkGitHub(useCache)]);
    this.checkedAt.set(Date.now());
    this.now.set(Date.now());
    this.busy.set(false);
  }

  ago(iso: string): string {
    const s = (this.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }

  private async checkApi() {
    this.apiState.set('checking');
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 45000);       // a free-tier API can take ~30 s to wake
      const r = await fetch(API_HEALTH, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(kill);
      const body = await r.json().catch(() => ({}));
      this.apiMs.set(Math.round(performance.now() - t0));
      this.apiState.set(r.ok && body?.status === 'ok' ? (this.apiMs() > 8000 ? 'slow' : 'ok') : 'down');
    } catch {
      this.apiState.set('down');
    }
  }

  private async checkGitHub(useCache: boolean) {
    this.ghState.set('checking');
    // GitHub allows 10 anonymous searches a minute per visitor, so reuse this tab's
    // result for a few minutes unless the visitor asks to check again.
    if (useCache) {
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (c && Date.now() - c.t < 5 * 60_000) { this.apply(c); this.ghState.set('ok'); return; }
      } catch { /* storage unavailable */ }
    }
    try {
      const h = { Accept: 'application/vnd.github+json' };
      const [search, events] = await Promise.all([
        fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(GH_QUERY)}&sort=updated&per_page=20`, { headers: h }),
        fetch('https://api.github.com/users/RavSinghChandan/events/public?per_page=30', { headers: h }),
      ]);
      if (!search.ok) throw new Error(`search ${search.status}`);
      const s = await search.json();
      const items: any[] = s.items ?? [];
      const top = items.filter(i => i.closed_at).sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0];
      const ev: any[] = events.ok ? await events.json() : [];
      const push = ev.find(e => e.type === 'PushEvent');
      const data = {
        t: Date.now(),
        count: s.total_count as number,
        latest: top ? { title: top.title.replace(/^[A-Z]{2,5}:\s*/, ''), repo: top.repository_url.split('/').slice(-2).join('/'), number: top.number, url: top.html_url, at: top.closed_at } : null,
        push: push ? { repo: push.repo.name, at: push.created_at } : null,
      };
      this.apply(data);
      this.ghState.set('ok');
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
    } catch {
      this.ghState.set('down');
    }
  }

  private apply(d: { count: number; latest: Merge | null; push: { repo: string; at: string } | null }) {
    this.liveCount.set(d.count);
    this.latest.set(d.latest);
    this.lastPush.set(d.push);
  }
}
