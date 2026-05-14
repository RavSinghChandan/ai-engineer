import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metrics.page.html',
  styleUrls: ['./metrics.page.css'],
})
export class MetricsPage implements OnInit, OnDestroy {
  readonly router = inject(Router);
  private api = inject(ApiService);

  metrics      = signal<any>(null);
  loading      = signal(false);
  error        = signal('');
  cacheData    = signal<any>(null);
  cacheLoading = signal(false);
  cacheError   = signal('');
  grData       = signal<any>(null);
  grLoading    = signal(false);
  grEvents     = signal<any[]>([]);
  private _timer: any;

  ngOnInit() {
    this.loadMetrics();
    this.loadCache();
    this.loadGuardrails();
    this._timer = setInterval(() => {
      this.loadMetrics();
      this.loadCache();
      this.loadGuardrails();
    }, 10_000);
  }

  ngOnDestroy() {
    clearInterval(this._timer);
  }

  loadMetrics() {
    this.loading.set(true);
    this.api.getMetrics().subscribe({
      next: (d) => { this.metrics.set(d); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(e.message ?? 'Failed to load metrics'); this.loading.set(false); },
    });
  }

  loadCache() {
    this.cacheLoading.set(true);
    this.api.getCacheEntries().subscribe({
      next: (d) => { this.cacheData.set(d); this.cacheLoading.set(false); this.cacheError.set(''); },
      error: (e) => {
        this.cacheLoading.set(false);
        const msg: string = e.message ?? '';
        if (msg.includes('parsing') || msg.includes('Cannot reach')) {
          this.cacheError.set('');
          if (!this.cacheData()) this.cacheData.set({ entries: [], stats: null });
        } else {
          this.cacheError.set(msg || 'Failed to load cache');
        }
      },
    });
  }

  loadGuardrails() {
    this.grLoading.set(true);
    this.api.getGuardrailStats().subscribe({
      next: (d) => {
        const prev = this.grData();
        this.grData.set(d);
        this.grLoading.set(false);
        this._diffEvents(prev, d);
      },
      error: () => { this.grLoading.set(false); },
    });
  }

  private _diffEvents(prev: any, curr: any) {
    if (!prev || !curr) return;
    const now = new Date().toLocaleTimeString();
    const events = [...this.grEvents()];

    // G1 — new users tracked
    const prevUsers = prev.rate_limiter?.tracked_users ?? 0;
    const currUsers = curr.rate_limiter?.tracked_users ?? 0;
    if (currUsers > prevUsers) {
      events.unshift({ ts: now, g: 'G1', type: 'ok', msg: `New user tracked — ${currUsers} user(s) in sliding window` });
    }
    // G1 — detect any user near/at limit
    const counts = curr.rate_limiter?.current_counts ?? {};
    const max = curr.rate_limiter?.max_requests ?? 10;
    for (const [uid, cnt] of Object.entries(counts) as [string, number][]) {
      if (cnt >= max) {
        events.unshift({ ts: now, g: 'G1', type: 'block', msg: `Rate limit hit — user "${uid}" at ${cnt}/${max} req` });
      } else if (cnt >= Math.floor(max * 0.8)) {
        events.unshift({ ts: now, g: 'G1', type: 'warn', msg: `Rate limit warning — user "${uid}" at ${cnt}/${max} req` });
      }
    }

    // G2 — circuit state change
    const prevState = prev.circuit_breaker?.state;
    const currState = curr.circuit_breaker?.state;
    if (prevState && currState && prevState !== currState) {
      const type = currState === 'open' ? 'block' : currState === 'half_open' ? 'warn' : 'ok';
      events.unshift({ ts: now, g: 'G2', type, msg: `Circuit breaker → ${currState.toUpperCase()} (was ${prevState})` });
    }

    // G2 — new failure
    const prevFail = prev.circuit_breaker?.failures ?? 0;
    const currFail = curr.circuit_breaker?.failures ?? 0;
    if (currFail > prevFail) {
      events.unshift({ ts: now, g: 'G2', type: 'warn', msg: `LLM call failure recorded — ${currFail}/${curr.circuit_breaker?.failure_threshold} failures` });
    }

    // keep last 30 events
    this.grEvents.set(events.slice(0, 30));
  }

  resetCB() {
    this.api.resetCircuitBreaker().subscribe({
      next: (d) => {
        const now = new Date().toLocaleTimeString();
        this.grEvents.update(evts => [
          { ts: now, g: 'G2', type: 'ok', msg: `Circuit breaker manually RESET → CLOSED by admin` },
          ...evts,
        ].slice(0, 30));
        this.loadGuardrails();
      },
    });
  }

  invalidateEntry(key: string, name: string) {
    if (!confirm(`Remove cache entry for "${name || key}"?`)) return;
    this.api.invalidateCacheEntry(key).subscribe({
      next: () => this.loadCache(),
      error: (e) => this.cacheError.set(e.message ?? 'Failed to invalidate'),
    });
  }

  clearCache() {
    if (!confirm('Clear ALL cached users? They will need a full LLM run on next visit.')) return;
    this.api.clearAllCache().subscribe({
      next: () => this.loadCache(),
      error: (e) => this.cacheError.set(e.message ?? 'Failed to clear cache'),
    });
  }

  // ── Guardrail computed helpers ─────────────────────────────────────────────

  totalBlocked(): number {
    const counts = this.grData()?.rate_limiter?.current_counts ?? {};
    const max = this.grData()?.rate_limiter?.max_requests ?? 10;
    return Object.values(counts).filter((c: any) => c >= max).length;
  }

  topRateLimitUsers(): { uid: string; count: number }[] {
    const counts = this.grData()?.rate_limiter?.current_counts ?? {};
    return Object.entries(counts)
      .map(([uid, count]) => ({ uid, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  cbFailurePct(): number {
    const cb = this.grData()?.circuit_breaker;
    if (!cb) return 0;
    return Math.min(100, Math.round((cb.failures / cb.failure_threshold) * 100));
  }

  cbStateLabel(): string {
    const s = this.grData()?.circuit_breaker?.state ?? 'closed';
    return s.replace('_', '-').toUpperCase();
  }

  gdDomains(): string[] {
    return ['numerology', 'astrology', 'palmistry', 'tarot', 'vastu'];
  }

  gdAvail(domain: string): number {
    return this.grData()?.graceful_degradation?.domain_availability?.[domain] ?? 100;
  }

  gdHealth(domain: string, status: 'full' | 'partial' | 'fallback'): number {
    return this.grData()?.graceful_degradation?.domain_health?.[domain]?.[status] ?? 0;
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  fmtAge(seconds: number): string {
    if (!seconds && seconds !== 0) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  }

  fmt(ms: number): string {
    if (!ms) return '—';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  sparkH(ms: number, all: number[]): number {
    const max = Math.max(...all);
    return max ? Math.max(5, (ms / max) * 100) : 5;
  }

  agentKeys(): string[] {
    return Object.keys(this.metrics()?.agent_latency_avg_ms ?? {});
  }

  fmtAgent(k: string): string {
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  getAgentErr(a: string): number {
    return this.metrics()?.error_rate?.agent_breakdown?.[a] ?? 0;
  }

  hasTokenHistory(): boolean {
    const h = this.metrics()?.token_economics?.token_history;
    return Array.isArray(h) && h.some((t: number) => t > 0);
  }

  riskPct(level: 'low' | 'medium' | 'high'): number {
    const dist = this.metrics()?.hallucination_audit?.risk_distribution;
    if (!dist) return 0;
    const total = (dist.low ?? 0) + (dist.medium ?? 0) + (dist.high ?? 0);
    if (!total) return 0;
    return Math.round((dist[level] ?? 0) / total * 100);
  }
}
