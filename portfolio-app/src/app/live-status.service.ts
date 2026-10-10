import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Live checks made from the visitor's own browser, shared by the hero's deploy
 * line and the live proof panel: the production API's health, and the merged
 * PR count, latest merge and last push straight from GitHub. Every request is
 * logged with its real status code and timing so the page can show its working.
 */
export type CheckState = 'checking' | 'ok' | 'slow' | 'down';
export interface Merge { title: string; repo: string; number: number; url: string; at: string; }
export interface RequestLog { label: string; status: number | 'cache' | 'error'; ms: number; }

const API_HEALTH = 'https://astro-intel-api.onrender.com/health';
/** Every live product's health endpoint, keyed by project number. Aura's is API_HEALTH above. */
const PRODUCT_HEALTH: Record<string, { url: string; label: string; cors: boolean }> = {
  '08': { url: 'https://aaina-api.onrender.com/api/health', label: 'Aaina', cors: false },
  '09': { url: 'https://poultry-360.onrender.com/api/health', label: 'Poultry 360', cors: true },
};
const LIBS = ['py-pdf/pypdf', 'joblib/joblib', 'huggingface/sentence-transformers', 'nltk/nltk', 'authlib/authlib', 'fonttools/fonttools', 'py-pdf/fpdf2'];
export const GH_QUERY = 'is:pr author:RavSinghChandan is:merged ' + LIBS.map(r => `repo:${r}`).join(' ');
const CACHE_KEY = 'live-proof-v5';
const CACHE_MS = 15 * 60_000;

@Injectable({ providedIn: 'root' })
export class LiveStatus {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly apiState = signal<CheckState>('checking');
  readonly apiMs = signal(0);
  readonly ghState = signal<CheckState>('checking');
  readonly liveCount = signal<number | null>(null);
  readonly latest = signal<Merge | null>(null);
  readonly lastPush = signal<{ repo: string; at: string } | null>(null);
  readonly checkedAt = signal<number | null>(null);
  readonly busy = signal(false);
  readonly apiLog = signal<RequestLog | null>(null);
  readonly searchLog = signal<RequestLog | null>(null);
  readonly eventsLog = signal<RequestLog | null>(null);
  readonly now = signal(Date.now());
  private readonly products = signal<Record<string, { state: CheckState; ms: number }>>({});
  private started = false;

  readonly checkedLabel = computed(() => {
    const t = this.checkedAt();
    if (t === null) return 'checking…';
    const s = Math.max(0, Math.round((this.now() - t) / 1000));
    return s < 5 ? 'checked just now' : s < 60 ? `checked ${s}s ago` : `checked ${Math.round(s / 60)} min ago`;
  });

  /** Runs once per page, however many components ask. */
  start() {
    if (!this.browser || this.started) return;
    this.started = true;
    setInterval(() => this.now.set(Date.now()), 5000);
    this.refresh(true);
  }

  async refresh(useCache = false) {
    if (!this.browser || this.busy()) return;
    this.busy.set(true);
    await Promise.all([this.checkApi(), this.checkGitHub(useCache), ...Object.keys(PRODUCT_HEALTH).map(n => this.checkProduct(n))]);
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

  private async timed(url: string, init?: RequestInit): Promise<{ r: Response | null; ms: number }> {
    const t0 = performance.now();
    try {
      const r = await fetch(url, init);
      return { r, ms: Math.round(performance.now() - t0) };
    } catch {
      return { r: null, ms: Math.round(performance.now() - t0) };
    }
  }

  private async checkApi() {
    this.apiState.set('checking');
    this.apiLog.set(null);
    let r: Response | null = null, ms = 0;
    for (let attempt = 0; attempt < 2; attempt++) {              // one retry: hosting edges blip now and then
      if (attempt) await new Promise(res => setTimeout(res, 2000));
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 45000);        // a free-tier API can take ~30 s to wake
      ({ r, ms } = await this.timed(API_HEALTH, { signal: ctrl.signal, cache: 'no-store' }));
      clearTimeout(kill);
      if (r?.ok) break;
    }
    const body = r ? await r.json().catch(() => ({})) : {};
    this.apiMs.set(ms);
    this.apiLog.set({ label: 'GET aurawithrav API /health', status: r ? r.status : 'error', ms });
    this.apiState.set(r?.ok && body?.status === 'ok' ? (ms > 8000 ? 'slow' : 'ok') : 'down');
  }

  /** One product's live state; Aura uses the main API check so the hero and its card agree. */
  stateOf(num: string): { state: CheckState; ms: number } {
    if (num === '01') return { state: this.apiState(), ms: this.apiMs() };
    return this.products()[num] ?? { state: 'checking', ms: 0 };
  }

  private async checkProduct(num: string) {
    const { url, cors } = PRODUCT_HEALTH[num];
    const set = (state: CheckState, ms: number) => this.products.update(m => ({ ...m, [num]: { state, ms } }));
    set('checking', 0);
    let r: Response | null = null, ms = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise(res => setTimeout(res, 2000));
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 45000);
      // An API that only allows its own site still answers; no-cors proves it is up without reading the body.
      ({ r, ms } = await this.timed(url, { signal: ctrl.signal, cache: 'no-store', mode: cors ? 'cors' : 'no-cors' }));
      clearTimeout(kill);
      if (r && (r.ok || r.type === 'opaque')) break;
    }
    const up = !!r && (r.type === 'opaque' || (r.ok && (await r.json().catch(() => ({})))?.status === 'ok'));
    set(up ? (ms > 8000 ? 'slow' : 'ok') : 'down', ms);
  }

  private async checkGitHub(useCache: boolean) {
    this.ghState.set('checking');
    this.searchLog.set(null);
    this.eventsLog.set(null);
    // GitHub allows anonymous visitors 60 calls an hour, so keep the result for 15
    // minutes across tabs and visits unless the visitor asks to check again.
    const cached = this.readCache();
    if (useCache) {
      try {
        const c = cached;
        if (c && Date.now() - c.t < CACHE_MS) {
          this.apply(c);
          this.searchLog.set({ label: 'GET api.github.com/search/issues', status: 'cache', ms: 0 });
          this.eventsLog.set({ label: 'GET api.github.com/users/…/events', status: 'cache', ms: 0 });
          this.ghState.set('ok');
          return;
        }
      } catch { /* storage unavailable */ }
    }
    const h = { headers: { Accept: 'application/vnd.github+json' } };
    const [search, events] = await Promise.all([
      this.timed(`https://api.github.com/search/issues?q=${encodeURIComponent(GH_QUERY)}&sort=updated&per_page=20`, h),
      this.timed('https://api.github.com/users/RavSinghChandan/events/public?per_page=30', h),
    ]);
    this.searchLog.set({ label: 'GET api.github.com/search/issues', status: search.r ? search.r.status : 'error', ms: search.ms });
    this.eventsLog.set({ label: 'GET api.github.com/users/…/events', status: events.r ? events.r.status : 'error', ms: events.ms });
    if (!search.r?.ok) {
      if (cached) this.apply(cached);                              // last known values, labelled as such
      this.ghState.set('down');
      return;
    }
    try {
      const s = await search.r.json();
      const items: any[] = s.items ?? [];
      const top = items.filter(i => i.closed_at).sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0];
      const ev: any[] = events.r?.ok ? await events.r.json() : [];
      const push = ev.find(e => e.type === 'PushEvent');
      const data = {
        t: Date.now(),
        count: s.total_count as number,
        latest: top ? {
          title: top.title.replace(/^[A-Z]{2,5}:\s*/, ''), repo: top.repository_url.split('/').slice(-2).join('/'),
          number: top.number, url: top.html_url, at: top.closed_at,
        } : null,
        push: push ? { repo: push.repo.name, at: push.created_at } : (cached?.push ?? null),
      };
      this.apply(data);
      this.ghState.set('ok');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
    } catch {
      this.ghState.set('down');
    }
  }

  private readCache(): { t: number; count: number; latest: Merge | null; push: { repo: string; at: string } | null } | null {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
  }

  private apply(d: { count: number; latest: Merge | null; push: { repo: string; at: string } | null }) {
    this.liveCount.set(d.count);
    this.latest.set(d.latest);
    this.lastPush.set(d.push);
  }
}
