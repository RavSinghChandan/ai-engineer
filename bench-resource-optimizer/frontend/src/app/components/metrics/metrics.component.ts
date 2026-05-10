import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { HealthReady, MetricsData } from '../../models/types';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div>
        <h1 style="margin-bottom:4px;">System Metrics</h1>
        <p style="color:var(--text-muted); font-size:14px;">
          Real-time observability · Enterprise AI backend
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span *ngIf="health" class="health-dot"
              [class.healthy]="health.status === 'ready'"
              title="{{ health.status }}">
          {{ health.status === 'ready' ? '● Live' : '● Degraded' }}
        </span>
        <button class="btn btn-secondary" style="font-size:13px; padding:6px 14px;"
                (click)="refresh()" [disabled]="loading">
          {{ loading ? 'Refreshing…' : '↻ Refresh' }}
        </button>
      </div>
    </div>

    <div *ngIf="error" class="alert alert-error">{{ error }}</div>

    <ng-container *ngIf="metrics">

      <!-- ── Top KPI row ──────────────────────────────────────────────────── -->
      <div class="kpi-row">
        <div class="kpi-card">
          <span class="kpi-value">{{ metrics.total_requests | number }}</span>
          <span class="kpi-key">Total Requests</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">{{ metrics.total_llm_calls | number }}</span>
          <span class="kpi-key">LLM Calls</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">{{ metrics.total_tokens | number }}</span>
          <span class="kpi-key">Total Tokens</span>
        </div>
        <div class="kpi-card kpi-cost">
          <span class="kpi-value">\${{ metrics.total_cost_usd.toFixed(4) }}</span>
          <span class="kpi-key">Total Cost</span>
        </div>
        <div class="kpi-card" [class.kpi-warn]="metrics.error_rate > 0.05">
          <span class="kpi-value">{{ (metrics.error_rate * 100).toFixed(1) }}%</span>
          <span class="kpi-key">Error Rate</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">{{ metrics.avg_latency_ms.toFixed(0) }}ms</span>
          <span class="kpi-key">Avg Latency</span>
        </div>
      </div>

      <!-- ── Cache + Latency row ─────────────────────────────────────────── -->
      <div class="two-col">

        <!-- Cache stats -->
        <div class="card">
          <h3 style="margin-bottom:16px;">Semantic Cache</h3>
          <div class="cache-row">
            <span class="cache-label">L1 Hit Rate</span>
            <div class="cache-bar">
              <div class="cache-fill cache-l1"
                   [style.width.%]="(cacheStats.l1_hit_rate) * 100"></div>
            </div>
            <span class="cache-pct">{{ (cacheStats.l1_hit_rate * 100).toFixed(0) }}%</span>
          </div>
          <div class="cache-row">
            <span class="cache-label">L2 Hit Rate</span>
            <div class="cache-bar">
              <div class="cache-fill cache-l2"
                   [style.width.%]="(cacheStats.l2_hit_rate) * 100"></div>
            </div>
            <span class="cache-pct">{{ (cacheStats.l2_hit_rate * 100).toFixed(0) }}%</span>
          </div>
          <div class="cache-detail-grid" style="margin-top:16px;">
            <div class="cache-detail">
              <span class="cache-detail-val">{{ cacheStats.l1_hits }}</span>
              <span class="cache-detail-key">L1 Hits</span>
            </div>
            <div class="cache-detail">
              <span class="cache-detail-val">{{ cacheStats.l1_misses }}</span>
              <span class="cache-detail-key">L1 Misses</span>
            </div>
            <div class="cache-detail">
              <span class="cache-detail-val">{{ cacheStats.l2_hits }}</span>
              <span class="cache-detail-key">L2 Hits</span>
            </div>
            <div class="cache-detail">
              <span class="cache-detail-val">{{ cacheStats.l2_misses }}</span>
              <span class="cache-detail-key">L2 Misses</span>
            </div>
          </div>
        </div>

        <!-- Latency percentiles -->
        <div class="card">
          <h3 style="margin-bottom:16px;">Latency Percentiles</h3>
          <div *ngFor="let entry of latencyEntries" class="latency-op">
            <p class="latency-op-name">{{ entry.op }}</p>
            <div class="latency-chips">
              <span class="latency-chip chip-p50">
                P50: {{ entry.p50_ms.toFixed(0) }}ms
              </span>
              <span class="latency-chip chip-p95">
                P95: {{ entry.p95_ms.toFixed(0) }}ms
              </span>
              <span class="latency-chip chip-p99"
                    [class.chip-warn]="entry.p99_ms > 5000">
                P99: {{ entry.p99_ms.toFixed(0) }}ms
              </span>
              <span class="latency-chip chip-count">
                n={{ entry.count }}
              </span>
            </div>
          </div>
          <p *ngIf="!latencyEntries.length"
             style="color:var(--text-muted); font-size:13px;">
            No data yet — make some requests first.
          </p>
        </div>
      </div>

      <!-- ── System health + Memory ──────────────────────────────────────── -->
      <div class="two-col">

        <!-- Health / circuit breakers -->
        <div class="card" *ngIf="health">
          <h3 style="margin-bottom:16px;">System Health</h3>
          <div class="health-grid">
            <div class="health-item">
              <span class="health-label">Vector Store</span>
              <span [class]="health.vector_store ? 'status-ok' : 'status-fail'">
                {{ health.vector_store ? '● OK' : '● DOWN' }}
              </span>
            </div>
            <div class="health-item">
              <span class="health-label">Hybrid Retrieval</span>
              <span [class]="health.hybrid_retrieval ? 'status-ok' : 'status-fail'">
                {{ health.hybrid_retrieval ? '● OK' : '● DOWN' }}
              </span>
            </div>
            <div class="health-item">
              <span class="health-label">Database</span>
              <span [class]="health.db === 'ok' ? 'status-ok' : 'status-fail'">
                {{ health.db === 'ok' ? '● OK' : '● ' + health.db }}
              </span>
            </div>
          </div>
          <div *ngIf="circuitBreakerEntries.length" style="margin-top:16px;">
            <p style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Circuit Breakers</p>
            <div *ngFor="let cb of circuitBreakerEntries" class="cb-row">
              <span class="cb-name">{{ cb.name }}</span>
              <span class="cb-state"
                    [class.cb-closed]="cb.state === 'CLOSED'"
                    [class.cb-open]="cb.state === 'OPEN'"
                    [class.cb-half]="cb.state === 'HALF_OPEN'">
                {{ cb.state }}
              </span>
            </div>
          </div>
        </div>

        <!-- Memory stats + active prompts -->
        <div class="card">
          <h3 style="margin-bottom:16px;">Agent Memory & Prompts</h3>
          <div *ngIf="metrics.memory_stats" class="mem-grid">
            <div class="mem-item">
              <span class="mem-val">{{ metrics.memory_stats.users_with_episodic_memory }}</span>
              <span class="mem-key">Users (episodic)</span>
            </div>
            <div class="mem-item">
              <span class="mem-val">{{ metrics.memory_stats.users_with_long_term_facts }}</span>
              <span class="mem-key">Users (long-term)</span>
            </div>
            <div class="mem-item">
              <span class="mem-val">{{ metrics.memory_stats.total_session_records }}</span>
              <span class="mem-key">Session Records</span>
            </div>
          </div>
          <div *ngIf="promptEntries.length" style="margin-top:16px;">
            <p style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Active Prompt Versions</p>
            <div *ngFor="let p of promptEntries" class="prompt-row">
              <span class="prompt-name">{{ p.name }}</span>
              <span class="prompt-ver">{{ p.version }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Recent Requests ─────────────────────────────────────────────── -->
      <div class="card" *ngIf="metrics.recent_requests.length">
        <h3 style="margin-bottom:16px;">Recent Requests</h3>
        <div class="req-table">
          <div class="req-row req-header">
            <span>Request ID</span>
            <span>Path</span>
            <span>Status</span>
            <span>Latency</span>
            <span>Time</span>
          </div>
          <div *ngFor="let r of metrics.recent_requests" class="req-row"
               [class.req-ok]="r.status_code < 400"
               [class.req-err]="r.status_code >= 400">
            <span class="req-id">{{ r.request_id.slice(0, 8) }}</span>
            <span class="req-path">{{ r.path }}</span>
            <span class="req-status" [class.status-2xx]="r.status_code < 400">
              {{ r.status_code }}
            </span>
            <span class="req-latency"
                  [class.latency-slow]="r.latency_ms > 3000">
              {{ r.latency_ms.toFixed(0) }}ms
            </span>
            <span class="req-time">{{ r.timestamp | date:'HH:mm:ss' }}</span>
          </div>
        </div>
      </div>

    </ng-container>

    <div *ngIf="!metrics && !loading && !error" class="card" style="text-align:center; padding:48px;">
      <p style="color:var(--text-muted);">Loading metrics…</p>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .health-dot {
      font-size: 13px; font-weight: 700;
      padding: 4px 12px; border-radius: 999px;
    }
    .health-dot.healthy { background: #dcfce7; color: #15803d; }
    .health-dot:not(.healthy) { background: #fee2e2; color: #b91c1c; }

    /* KPI row */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .kpi-value { font-size: 22px; font-weight: 800; }
    .kpi-key   { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-cost  { background: #f0fdf4; }
    .kpi-cost .kpi-value { color: var(--success); }
    .kpi-warn  { background: #fff7ed; }
    .kpi-warn .kpi-value { color: var(--warning); }

    /* Two-col layout */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }

    /* Cache */
    .cache-row  { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .cache-label { font-size: 12px; font-weight: 600; min-width: 90px; }
    .cache-bar  { flex: 1; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .cache-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
    .cache-l1   { background: #3b82f6; }
    .cache-l2   { background: #8b5cf6; }
    .cache-pct  { font-size: 13px; font-weight: 700; min-width: 34px; text-align: right; }
    .cache-detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .cache-detail { display: flex; flex-direction: column; align-items: center; gap: 2px;
                    padding: 8px; background: #f8fafc; border-radius: var(--radius); }
    .cache-detail-val { font-size: 16px; font-weight: 700; }
    .cache-detail-key { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }

    /* Latency */
    .latency-op      { margin-bottom: 14px; }
    .latency-op-name { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-muted); }
    .latency-chips   { display: flex; gap: 6px; flex-wrap: wrap; }
    .latency-chip    { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
    .chip-p50   { background: #f0fdf4; color: #15803d; }
    .chip-p95   { background: #fef9c3; color: #854d0e; }
    .chip-p99   { background: #fee2e2; color: #b91c1c; }
    .chip-count { background: #f1f5f9; color: #475569; }
    .chip-warn  { background: #fef2f2; color: #991b1b; }

    /* Health */
    .health-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
    .health-item { display: flex; flex-direction: column; gap: 4px;
                   padding: 12px; background: #f8fafc; border-radius: var(--radius); }
    .health-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .status-ok   { font-size: 13px; font-weight: 700; color: #15803d; }
    .status-fail { font-size: 13px; font-weight: 700; color: #b91c1c; }

    /* Circuit breakers */
    .cb-row   { display: flex; justify-content: space-between; align-items: center;
                padding: 6px 10px; margin-bottom: 4px;
                background: #f8fafc; border-radius: var(--radius); }
    .cb-name  { font-size: 12px; }
    .cb-state { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .cb-closed { background: #dcfce7; color: #15803d; }
    .cb-open   { background: #fee2e2; color: #b91c1c; }
    .cb-half   { background: #fef9c3; color: #854d0e; }

    /* Memory / prompts */
    .mem-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
    .mem-item { display: flex; flex-direction: column; align-items: center; gap: 2px;
                padding: 12px; background: #f8fafc; border-radius: var(--radius); }
    .mem-val { font-size: 20px; font-weight: 800; }
    .mem-key { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .prompt-row { display: flex; justify-content: space-between; align-items: center;
                  padding: 5px 10px; margin-bottom: 4px;
                  background: #f8fafc; border-radius: var(--radius); }
    .prompt-name { font-size: 12px; }
    .prompt-ver  { font-size: 11px; font-weight: 700; background: #dbeafe; color: #1d4ed8;
                   padding: 2px 8px; border-radius: 999px; }

    /* Recent requests table */
    .req-table { font-size: 13px; }
    .req-row {
      display: grid;
      grid-template-columns: 90px 1fr 60px 80px 80px;
      gap: 12px;
      padding: 8px 12px;
      border-radius: var(--radius);
      margin-bottom: 2px;
      align-items: center;
    }
    .req-header { font-size: 11px; font-weight: 700; color: var(--text-muted);
                  text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; }
    .req-id    { font-family: monospace; color: #475569; }
    .req-path  { font-family: monospace; font-size: 12px; }
    .req-status { font-weight: 700; }
    .status-2xx { color: #15803d; }
    .req-err { background: #fff5f5; }
    .req-latency { font-weight: 600; }
    .latency-slow { color: #b91c1c; }
    .req-time  { color: var(--text-muted); font-size: 12px; }
  `],
})
export class MetricsComponent implements OnInit, OnDestroy {
  metrics: MetricsData | null = null;
  health: HealthReady | null = null;
  loading = false;
  error = '';
  private refreshTimer: any;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.refresh();
    // Auto-refresh every 30 seconds
    this.refreshTimer = setInterval(() => this.refresh(), 30_000);
  }

  ngOnDestroy() {
    clearInterval(this.refreshTimer);
  }

  refresh() {
    this.loading = true;
    this.error = '';

    this.api.getMetrics().subscribe({
      next: m => {
        this.metrics = m;
        this.loading = false;
      },
      error: err => {
        this.error = err.error?.detail ?? 'Failed to load metrics.';
        this.loading = false;
      },
    });

    this.api.getHealthReady().subscribe({
      next: h => { this.health = h; },
      error: () => {},
    });
  }

  get cacheStats() {
    return this.metrics?.cache_stats ?? {
      l1_hits: 0, l1_misses: 0, l2_hits: 0, l2_misses: 0,
      l1_hit_rate: 0, l2_hit_rate: 0,
    };
  }

  get latencyEntries() {
    if (!this.metrics?.latency_percentiles) return [];
    return Object.entries(this.metrics.latency_percentiles).map(([op, v]) => ({
      op,
      p50_ms: v.p50_ms,
      p95_ms: v.p95_ms,
      p99_ms: v.p99_ms,
      count: v.count,
    }));
  }

  get circuitBreakerEntries() {
    if (!this.health?.circuit_breakers) return [];
    return Object.entries(this.health.circuit_breakers).map(([name, state]) => ({ name, state }));
  }

  get promptEntries() {
    const source = this.health?.active_prompts ?? this.metrics?.prompts ?? {};
    return Object.entries(source).map(([name, version]) => ({ name, version }));
  }
}
