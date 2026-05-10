import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="page-header">
      <div>
        <h1>System Metrics</h1>
        <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">
          Live observability dashboard · Auto-refreshes every 15s
        </p>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="health-pill" [class.healthy]="health?.status === 'ready'">
          {{ health?.status === 'ready' ? '● Live' : '● Checking…' }}
        </span>
        <button class="btn btn-secondary" (click)="load()" [disabled]="loading">
          <span *ngIf="loading" class="spinner"></span>
          {{ loading ? 'Loading…' : '↻ Refresh' }}
        </button>
      </div>
    </div>

    <div *ngIf="error" class="alert alert-error">{{ error }}</div>

    <ng-container *ngIf="m">

      <!-- ── KPI Row ──────────────────────────────────────────────────────── -->
      <div class="kpi-row">

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-icon">🌐</span>
            <span class="kpi-why" title="Every API call (upload-cv, map-role, generate-plan, progress) counted here. This tells you throughput and whether the system is getting real usage.">?</span>
          </div>
          <div class="kpi-value">{{ m.throughput?.total_requests ?? 0 }}</div>
          <div class="kpi-label">Total Requests</div>
          <div class="kpi-sub">{{ m.throughput?.requests_last_60s ?? 0 }} in last 60s</div>
        </div>

        <div class="kpi-card" [class.kpi-warn]="(m.error_rate?.rate_pct ?? 0) > 5">
          <div class="kpi-top">
            <span class="kpi-icon">⚠️</span>
            <span class="kpi-why" title="Error rate above 5% means the LLM or RAG pipeline is failing. Senior AI engineers set alerts at 2% for prod. 0% = healthy.">?</span>
          </div>
          <div class="kpi-value" [style.color]="(m.error_rate?.rate_pct ?? 0) > 5 ? 'var(--danger)' : 'var(--success)'">
            {{ (m.error_rate?.rate_pct ?? 0).toFixed(1) }}%
          </div>
          <div class="kpi-label">Error Rate</div>
          <div class="kpi-sub">{{ m.error_rate?.total_errors ?? 0 }} total errors</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-icon">⚡</span>
            <span class="kpi-why" title="P50 = median user experience. P95 = worst 5% of users. Senior AI engineers budget: P50 < 2s, P95 < 8s for LLM-backed APIs.">?</span>
          </div>
          <div class="kpi-value">{{ (m.latency?.p50_ms ?? 0).toFixed(0) }}<span style="font-size:14px;font-weight:500;">ms</span></div>
          <div class="kpi-label">P50 Latency</div>
          <div class="kpi-sub">P95: {{ (m.latency?.p95_ms ?? 0).toFixed(0) }}ms · P99: {{ (m.latency?.p99_ms ?? 0).toFixed(0) }}ms</div>
        </div>

        <div class="kpi-card" [class.kpi-good]="(m.cache?.hit_rate_pct ?? 0) >= 30">
          <div class="kpi-top">
            <span class="kpi-icon">🎯</span>
            <span class="kpi-why" title="Cache hit = no LLM call needed = instant response + zero cost. Target >30% for repeat role mappings. Every cache hit saves ~6s and ~$0.0001.">?</span>
          </div>
          <div class="kpi-value" [style.color]="(m.cache?.hit_rate_pct ?? 0) >= 30 ? 'var(--success)' : 'var(--text)'">
            {{ (m.cache?.hit_rate_pct ?? 0).toFixed(1) }}%
          </div>
          <div class="kpi-label">Cache Hit Rate</div>
          <div class="kpi-sub">{{ m.cache?.total_hits ?? 0 }} hits · {{ m.cache?.total_misses ?? 0 }} misses</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-icon">💰</span>
            <span class="kpi-why" title="DeepSeek pricing: $0.14/1M input tokens + $0.28/1M output tokens. At 1M req/day this matters. Cost per request benchmarks your prompt efficiency.">?</span>
          </div>
          <div class="kpi-value kpi-cost">\${{ (m.token_economics?.total_cost_usd ?? 0).toFixed(4) }}</div>
          <div class="kpi-label">Total LLM Cost</div>
          <div class="kpi-sub">avg \${{ (m.token_economics?.avg_cost_per_request ?? 0).toFixed(5) }}/req</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-icon">🧠</span>
            <span class="kpi-why" title="RAG match quality = how well the retrieved role context matches the candidate. Higher = fewer hallucinated skill gaps = better training plans.">?</span>
          </div>
          <div class="kpi-value" [style.color]="ragMatchColor">
            {{ (m.rag_quality?.avg_match_percentage ?? 0).toFixed(0) }}%
          </div>
          <div class="kpi-label">Avg RAG Match</div>
          <div class="kpi-sub">{{ m.rag_quality?.total_role_mappings ?? 0 }} mappings · {{ m.rag_quality?.high_match_count ?? 0 }} high</div>
        </div>

      </div>

      <!-- ── Row 2: Latency breakdown + Token economics ──────────────────── -->
      <div class="two-col">

        <!-- Latency breakdown per endpoint -->
        <div class="card">
          <div class="card-header">
            <h3>Latency by Endpoint</h3>
            <span class="card-why">P50/P95 per operation tells you exactly where slowness lives</span>
          </div>
          <div *ngFor="let ep of endpointList" class="ep-row">
            <div class="ep-left">
              <span class="ep-name">{{ ep.name }}</span>
              <span class="ep-count">{{ ep.count }} calls</span>
            </div>
            <div class="ep-bars">
              <div class="bar-row">
                <span class="bar-label">P50</span>
                <div class="bar-track">
                  <div class="bar-fill bar-p50" [style.width.%]="barPct(ep.p50_ms)"></div>
                </div>
                <span class="bar-val">{{ ep.p50_ms.toFixed(0) }}ms</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">P95</span>
                <div class="bar-track">
                  <div class="bar-fill bar-p95" [style.width.%]="barPct(ep.p95_ms)"></div>
                </div>
                <span class="bar-val" [class.val-slow]="ep.p95_ms > 5000">{{ ep.p95_ms.toFixed(0) }}ms</span>
              </div>
            </div>
            <div class="ep-err" *ngIf="ep.error_rate > 0">
              <span class="err-chip">{{ (ep.error_rate * 100).toFixed(0) }}% err</span>
            </div>
          </div>
          <div *ngIf="!endpointList.length" class="no-data">Make some requests to see latency breakdown</div>
        </div>

        <!-- Token economics -->
        <div class="card">
          <div class="card-header">
            <h3>Token Economics</h3>
            <span class="card-why">Prompt efficiency = cost control at scale (Module 1)</span>
          </div>
          <div class="token-grid">
            <div class="token-stat">
              <span class="token-val">{{ m.token_economics?.avg_prompt_tokens ?? 0 }}</span>
              <span class="token-key">Avg Prompt Tokens</span>
              <span class="token-note">Input to LLM</span>
            </div>
            <div class="token-stat">
              <span class="token-val">{{ m.token_economics?.avg_completion_tokens ?? 0 }}</span>
              <span class="token-key">Avg Output Tokens</span>
              <span class="token-note">LLM response</span>
            </div>
            <div class="token-stat">
              <span class="token-val">{{ m.token_economics?.avg_total_tokens ?? 0 }}</span>
              <span class="token-key">Avg Total Tokens</span>
              <span class="token-note">Per request</span>
            </div>
            <div class="token-stat token-stat-cost">
              <span class="token-val">\${{ (m.token_economics?.avg_cost_per_request ?? 0).toFixed(5) }}</span>
              <span class="token-key">Cost / Request</span>
              <span class="token-note">DeepSeek pricing</span>
            </div>
          </div>
          <div class="cost-model-note">
            <span class="cost-model-chip">{{ m.token_economics?.cost_model }}</span>
          </div>
          <div *ngIf="!(m.token_economics?.has_real_data)" class="no-data" style="margin-top:12px;">
            Token data populates after LLM calls complete (CV upload or role mapping)
          </div>
        </div>

      </div>

      <!-- ── Row 3: RAG Quality + Cache detail ───────────────────────────── -->
      <div class="two-col">

        <!-- RAG quality -->
        <div class="card">
          <div class="card-header">
            <h3>RAG Quality</h3>
            <span class="card-why">Match % = faithfulness of skill gap detection (Module 3)</span>
          </div>
          <div class="rag-score-row">
            <div class="rag-ring" [style.borderColor]="ragMatchColor">
              <span class="rag-ring-val" [style.color]="ragMatchColor">
                {{ (m.rag_quality?.avg_match_percentage ?? 0).toFixed(0) }}%
              </span>
              <span class="rag-ring-label">Avg Match</span>
            </div>
            <div class="rag-stats">
              <div class="rag-stat">
                <span class="rag-stat-val green">{{ m.rag_quality?.high_match_count ?? 0 }}</span>
                <span class="rag-stat-key">High match (≥70%)</span>
                <span class="rag-stat-note">Ready for role</span>
              </div>
              <div class="rag-stat">
                <span class="rag-stat-val orange">{{ (m.rag_quality?.total_role_mappings ?? 0) - (m.rag_quality?.high_match_count ?? 0) - (m.rag_quality?.low_match_count ?? 0) }}</span>
                <span class="rag-stat-key">Medium (40–70%)</span>
                <span class="rag-stat-note">Gap training needed</span>
              </div>
              <div class="rag-stat">
                <span class="rag-stat-val red">{{ m.rag_quality?.low_match_count ?? 0 }}</span>
                <span class="rag-stat-key">Low match (&lt;40%)</span>
                <span class="rag-stat-note">Extensive training</span>
              </div>
            </div>
          </div>
          <div class="rag-why-box">
            <strong>Why this matters:</strong> A hallucinated skill gap (e.g. "missing Kubernetes" when employee has it) wastes 1 week of training. At 10,000 employees, each false gap costs ~$50K bench time. RAG faithfulness pays for itself immediately.
          </div>
        </div>

        <!-- Cache detail -->
        <div class="card">
          <div class="card-header">
            <h3>Semantic Cache (L1)</h3>
            <span class="card-why">Every hit = 0ms latency + $0 LLM cost (Module 5)</span>
          </div>
          <div class="cache-hit-row">
            <div class="cache-donut">
              <div class="cache-donut-inner" [style.background]="cacheDonutGradient">
                <div class="cache-donut-center">
                  <span class="cache-donut-pct">{{ (m.cache?.hit_rate_pct ?? 0).toFixed(0) }}%</span>
                  <span class="cache-donut-label">hit rate</span>
                </div>
              </div>
            </div>
            <div class="cache-breakdown">
              <div class="cache-item cache-hit-item">
                <span class="cache-dot dot-green"></span>
                <span class="cache-item-label">Cache Hits</span>
                <span class="cache-item-val">{{ m.cache?.total_hits ?? 0 }}</span>
              </div>
              <div class="cache-item">
                <span class="cache-dot dot-gray"></span>
                <span class="cache-item-label">Cache Misses</span>
                <span class="cache-item-val">{{ m.cache?.total_misses ?? 0 }}</span>
              </div>
              <div class="cache-item" style="margin-top:10px; border-top:1px solid #e2e8f0; padding-top:10px;">
                <span class="cache-item-label" style="color:var(--text-muted);">L1 Entries</span>
                <span class="cache-item-val">{{ m.cache_stats?.l1_entries ?? 0 }}</span>
              </div>
              <div class="cache-item">
                <span class="cache-item-label" style="color:var(--text-muted);">L1 TTL</span>
                <span class="cache-item-val">{{ m.cache_stats?.l1_ttl_seconds ?? 3600 }}s</span>
              </div>
              <div class="cache-item">
                <span class="cache-item-label" style="color:var(--text-muted);">L2 Threshold</span>
                <span class="cache-item-val">cos ≥ {{ m.cache_stats?.l2_similarity_threshold ?? 0.92 }}</span>
              </div>
            </div>
          </div>
          <div *ngIf="(m.cache?.total_hits ?? 0) === 0" class="no-data" style="margin-top:10px;">
            Map the same role twice to see cache hits
          </div>
        </div>

      </div>

      <!-- ── Row 4: Agent Memory + Active Prompts ────────────────────────── -->
      <div class="two-col">

        <!-- Memory -->
        <div class="card">
          <div class="card-header">
            <h3>Agent Memory</h3>
            <span class="card-why">Short-term episodic + long-term facts per user (Module 4)</span>
          </div>
          <div class="mem-grid">
            <div class="mem-card">
              <span class="mem-val">{{ m.memory_stats?.users_with_episodic_memory ?? 0 }}</span>
              <span class="mem-key">Active Users</span>
              <span class="mem-note">Episodic memory loaded</span>
            </div>
            <div class="mem-card">
              <span class="mem-val">{{ m.memory_stats?.total_session_records ?? 0 }}</span>
              <span class="mem-key">Session Records</span>
              <span class="mem-note">Short-term history stored</span>
            </div>
            <div class="mem-card">
              <span class="mem-val">{{ m.memory_stats?.users_with_long_term_facts ?? 0 }}</span>
              <span class="mem-key">Long-term Profiles</span>
              <span class="mem-note">Skills + role facts persisted</span>
            </div>
          </div>
          <div class="mem-why-box">
            Without memory: employee re-explains context every session.<br>
            With memory: agent knows covered skills, explored roles, readiness score from prior sessions — injected as system context automatically.
          </div>
        </div>

        <!-- Circuit breakers + Prompts -->
        <div class="card">
          <div class="card-header">
            <h3>System Status</h3>
            <span class="card-why">Circuit breakers prevent cascade failures (Module 4)</span>
          </div>

          <!-- Circuit breakers -->
          <p class="section-sublabel">Circuit Breakers</p>
          <div *ngFor="let cb of circuitBreakers" class="cb-row">
            <span class="cb-name">{{ cb.name }}</span>
            <span class="cb-badge" [ngClass]="cbClass(cb.state)">{{ cb.state.toUpperCase() }}</span>
          </div>
          <div *ngIf="!circuitBreakers.length" class="no-data">No circuit breaker data</div>

          <!-- Active prompt versions -->
          <p class="section-sublabel" style="margin-top:18px;">Active Prompt Versions</p>
          <div class="prompt-grid">
            <div *ngFor="let p of activePrompts" class="prompt-chip">
              <span class="prompt-name">{{ p.name }}</span>
              <span class="prompt-ver" [class.ver-v2]="p.version === 'v2'">{{ p.version }}</span>
            </div>
          </div>

          <!-- Vector store info -->
          <p class="section-sublabel" style="margin-top:18px;">Vector Store</p>
          <div class="vs-row">
            <span class="vs-chip">{{ health?.vector_store ?? 'FAISS' }}</span>
            <span class="vs-chip">{{ health?.hybrid_retrieval ?? 'BM25+RRF' }}</span>
            <span class="vs-chip vs-chip-green">{{ health?.llm ?? 'deepseek-chat' }}</span>
          </div>
        </div>

      </div>

      <!-- ── Recent Requests ─────────────────────────────────────────────── -->
      <div class="card" *ngIf="m.recent_requests?.length">
        <div class="card-header">
          <h3>Recent Requests</h3>
          <span class="card-why">Live audit trail — every request logged with latency and cost</span>
        </div>
        <div class="req-table">
          <div class="req-row req-head">
            <span>Request ID</span>
            <span>Endpoint</span>
            <span>Status</span>
            <span>Latency</span>
            <span>Tokens</span>
            <span>Cost</span>
            <span>Cache</span>
          </div>
          <div *ngFor="let r of m.recent_requests" class="req-row"
               [class.req-err-row]="r.status !== 200">
            <span class="req-id">{{ r.request_id?.slice(0,8) }}</span>
            <span class="req-ep">{{ r.endpoint }}</span>
            <span class="req-status" [class.status-ok]="r.status === 200" [class.status-err]="r.status !== 200">
              {{ r.status }}
            </span>
            <span class="req-lat" [class.lat-slow]="r.latency_ms > 5000">
              {{ r.latency_ms?.toFixed(0) }}ms
            </span>
            <span class="req-tok">{{ r.tokens || '—' }}</span>
            <span class="req-cost">\${{ (r.cost_usd ?? 0).toFixed(5) }}</span>
            <span class="req-cache">
              <span *ngIf="r.cache_hit" class="cache-hit-badge">HIT</span>
              <span *ngIf="!r.cache_hit" class="cache-miss-badge">MISS</span>
            </span>
          </div>
        </div>
      </div>

    </ng-container>

    <div *ngIf="!m && !loading && !error" class="card" style="text-align:center;padding:48px;">
      <p style="color:var(--text-muted);">Loading metrics…</p>
    </div>
  `,
  styles: [`
    .page-header {
      display:flex; justify-content:space-between; align-items:flex-start;
      margin-bottom:24px; flex-wrap:wrap; gap:12px;
    }
    .health-pill {
      font-size:13px; font-weight:700; padding:5px 14px;
      border-radius:999px; background:#fee2e2; color:#b91c1c;
    }
    .health-pill.healthy { background:#dcfce7; color:#15803d; }

    /* KPI row */
    .kpi-row {
      display:grid; grid-template-columns:repeat(6,1fr); gap:14px; margin-bottom:20px;
    }
    .kpi-card {
      background:#fff; border:1px solid #e2e8f0; border-radius:10px;
      padding:16px 14px; position:relative;
    }
    .kpi-card.kpi-warn { border-color:#fca5a5; background:#fff5f5; }
    .kpi-card.kpi-good { border-color:#86efac; background:#f0fdf4; }
    .kpi-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .kpi-icon { font-size:18px; }
    .kpi-why {
      font-size:10px; font-weight:700; color:#94a3b8;
      width:16px; height:16px; border-radius:50%; border:1px solid #cbd5e1;
      display:flex; align-items:center; justify-content:center; cursor:help;
    }
    .kpi-value { font-size:26px; font-weight:800; color:#0f172a; line-height:1; }
    .kpi-label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.4px; margin-top:4px; }
    .kpi-sub   { font-size:11px; color:#94a3b8; margin-top:3px; }
    .kpi-cost  { color:#15803d; }

    /* Two col */
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; }

    /* Card header */
    .card-header { margin-bottom:16px; }
    .card-header h3 { margin-bottom:3px; }
    .card-why { font-size:11px; color:#94a3b8; font-style:italic; }

    /* Endpoint latency */
    .ep-row {
      display:flex; align-items:center; gap:12px;
      padding:10px 0; border-bottom:1px solid #f1f5f9;
    }
    .ep-row:last-child { border-bottom:none; }
    .ep-left { min-width:110px; }
    .ep-name { font-size:12px; font-weight:600; color:#1e293b; display:block; }
    .ep-count { font-size:11px; color:#94a3b8; }
    .ep-bars { flex:1; display:flex; flex-direction:column; gap:4px; }
    .bar-row { display:flex; align-items:center; gap:8px; }
    .bar-label { font-size:10px; font-weight:700; color:#94a3b8; width:22px; }
    .bar-track { flex:1; height:6px; background:#f1f5f9; border-radius:999px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:999px; transition:width 0.4s ease; }
    .bar-p50 { background:#3b82f6; }
    .bar-p95 { background:#f59e0b; }
    .bar-val { font-size:11px; font-weight:600; width:52px; text-align:right; color:#475569; }
    .val-slow { color:#dc2626 !important; }
    .err-chip { font-size:10px; font-weight:700; background:#fee2e2; color:#b91c1c; padding:2px 7px; border-radius:999px; }
    .no-data { font-size:13px; color:#94a3b8; padding:16px 0; text-align:center; }

    /* Token economics */
    .token-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .token-stat {
      background:#f8fafc; border-radius:8px; padding:14px;
      display:flex; flex-direction:column; gap:2px;
    }
    .token-stat-cost { background:#f0fdf4; }
    .token-val  { font-size:22px; font-weight:800; color:#0f172a; }
    .token-key  { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.4px; }
    .token-note { font-size:11px; color:#94a3b8; }
    .cost-model-note { margin-top:4px; }
    .cost-model-chip {
      font-size:11px; background:#eff6ff; color:#1d4ed8;
      padding:3px 10px; border-radius:999px; font-weight:600;
    }

    /* RAG quality */
    .rag-score-row { display:flex; gap:24px; align-items:center; margin-bottom:14px; }
    .rag-ring {
      width:90px; height:90px; border-radius:50%;
      border:5px solid #e2e8f0; flex-shrink:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
    }
    .rag-ring-val   { font-size:22px; font-weight:800; }
    .rag-ring-label { font-size:10px; color:#94a3b8; font-weight:600; text-transform:uppercase; }
    .rag-stats { flex:1; display:flex; flex-direction:column; gap:8px; }
    .rag-stat { display:flex; align-items:center; gap:8px; }
    .rag-stat-val { font-size:18px; font-weight:800; min-width:28px; }
    .rag-stat-key { font-size:12px; font-weight:600; color:#1e293b; }
    .rag-stat-note { font-size:11px; color:#94a3b8; margin-left:auto; }
    .green { color:#15803d; } .orange { color:#d97706; } .red { color:#dc2626; }
    .rag-why-box {
      background:#fffbeb; border:1px solid #fde68a;
      border-radius:8px; padding:12px; font-size:12px; color:#92400e; line-height:1.5;
    }

    /* Cache donut */
    .cache-hit-row { display:flex; gap:24px; align-items:center; margin-bottom:12px; }
    .cache-donut { width:80px; height:80px; flex-shrink:0; }
    .cache-donut-inner {
      width:80px; height:80px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
    }
    .cache-donut-center {
      width:56px; height:56px; background:#fff; border-radius:50%;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
    }
    .cache-donut-pct   { font-size:14px; font-weight:800; color:#1e293b; }
    .cache-donut-label { font-size:9px; color:#94a3b8; font-weight:600; text-transform:uppercase; }
    .cache-breakdown { flex:1; display:flex; flex-direction:column; gap:6px; }
    .cache-item { display:flex; align-items:center; gap:8px; }
    .cache-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .dot-green { background:#22c55e; }
    .dot-gray  { background:#cbd5e1; }
    .cache-item-label { font-size:12px; color:#475569; flex:1; }
    .cache-item-val   { font-size:13px; font-weight:700; color:#1e293b; }

    /* Memory */
    .mem-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:14px; }
    .mem-card {
      background:#f8fafc; border-radius:8px; padding:14px;
      display:flex; flex-direction:column; align-items:center; gap:3px; text-align:center;
    }
    .mem-val  { font-size:28px; font-weight:800; color:#3b82f6; }
    .mem-key  { font-size:11px; font-weight:700; color:#1e293b; text-transform:uppercase; letter-spacing:0.4px; }
    .mem-note { font-size:11px; color:#94a3b8; }
    .mem-why-box {
      background:#eff6ff; border:1px solid #bfdbfe;
      border-radius:8px; padding:12px; font-size:12px; color:#1d4ed8; line-height:1.6;
    }

    /* Circuit breakers */
    .section-sublabel {
      font-size:11px; font-weight:700; color:#94a3b8;
      text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;
    }
    .cb-row { display:flex; justify-content:space-between; align-items:center;
              padding:7px 12px; background:#f8fafc; border-radius:6px; margin-bottom:4px; }
    .cb-name { font-size:13px; font-weight:500; color:#1e293b; }
    .cb-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; }
    .cb-closed { background:#dcfce7; color:#15803d; }
    .cb-open   { background:#fee2e2; color:#b91c1c; }
    .cb-half   { background:#fef3c7; color:#92400e; }

    /* Prompts */
    .prompt-grid { display:flex; flex-wrap:wrap; gap:8px; }
    .prompt-chip {
      display:flex; align-items:center; gap:6px;
      background:#f8fafc; border:1px solid #e2e8f0;
      border-radius:6px; padding:5px 10px;
    }
    .prompt-name { font-size:12px; font-weight:500; color:#475569; }
    .prompt-ver  { font-size:11px; font-weight:700; background:#f1f5f9; color:#64748b; padding:1px 6px; border-radius:4px; }
    .ver-v2 { background:#dbeafe !important; color:#1d4ed8 !important; }

    /* Vector store */
    .vs-row { display:flex; gap:8px; flex-wrap:wrap; }
    .vs-chip {
      font-size:11px; font-weight:600; padding:3px 10px;
      border-radius:999px; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;
    }
    .vs-chip-green { background:#dcfce7; color:#15803d; border-color:#bbf7d0; }

    /* Recent requests */
    .req-table { font-size:13px; }
    .req-row {
      display:grid; grid-template-columns:80px 1fr 60px 80px 60px 80px 60px;
      gap:10px; padding:8px 12px; border-radius:6px; align-items:center; margin-bottom:2px;
    }
    .req-head {
      font-size:11px; font-weight:700; color:#94a3b8;
      text-transform:uppercase; letter-spacing:0.4px;
      background:#f8fafc; margin-bottom:4px;
    }
    .req-err-row { background:#fff5f5; }
    .req-id    { font-family:monospace; font-size:12px; color:#64748b; }
    .req-ep    { font-family:monospace; font-size:12px; color:#1e293b; }
    .req-status { font-weight:700; }
    .status-ok  { color:#15803d; }
    .status-err { color:#dc2626; }
    .req-lat { font-weight:600; color:#1e293b; }
    .lat-slow { color:#dc2626; }
    .req-tok { color:#64748b; }
    .req-cost { color:#64748b; font-family:monospace; }
    .cache-hit-badge  { background:#dcfce7; color:#15803d; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px; }
    .cache-miss-badge { background:#f1f5f9; color:#94a3b8; font-size:10px; font-weight:600; padding:2px 7px; border-radius:999px; }
  `],
})
export class MetricsComponent implements OnInit, OnDestroy {
  m: any = null;
  health: any = null;
  loading = false;
  error = '';
  private timer: any;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => this.load(), 15_000);
  }

  ngOnDestroy() { clearInterval(this.timer); }

  load() {
    this.loading = true;
    this.error = '';
    this.api.getMetrics().subscribe({
      next: data => { this.m = data; this.loading = false; },
      error: err  => { this.error = err.error?.detail ?? 'Failed to load metrics'; this.loading = false; },
    });
    this.api.getHealthReady().subscribe({
      next: h => { this.health = h; },
      error: () => {},
    });
  }

  get endpointList(): any[] {
    if (!this.m?.endpoint_breakdown) return [];
    return Object.entries(this.m.endpoint_breakdown).map(([name, v]: any) => ({ name, ...v }));
  }

  get circuitBreakers(): any[] {
    if (!this.health?.circuit_breakers) return [];
    return Object.entries(this.health.circuit_breakers).map(([name, state]) => ({ name, state }));
  }

  get activePrompts(): any[] {
    if (!this.health?.active_prompts) return [];
    return Object.entries(this.health.active_prompts).map(([name, version]) => ({ name, version }));
  }

  get ragMatchColor(): string {
    const v = this.m?.rag_quality?.avg_match_percentage ?? 0;
    if (v >= 70) return '#16a34a';
    if (v >= 40) return '#d97706';
    return '#dc2626';
  }

  get cacheDonutGradient(): string {
    const pct = this.m?.cache?.hit_rate_pct ?? 0;
    const deg = Math.round(pct * 3.6);
    return `conic-gradient(#22c55e 0deg ${deg}deg, #e2e8f0 ${deg}deg 360deg)`;
  }

  barPct(ms: number): number {
    const max = this.m?.latency?.max_ms ?? 1;
    return Math.min(100, Math.round((ms / max) * 100));
  }

  cbClass(state: string): string {
    if (state === 'closed') return 'cb-badge cb-closed';
    if (state === 'open')   return 'cb-badge cb-open';
    return 'cb-badge cb-half';
  }
}
