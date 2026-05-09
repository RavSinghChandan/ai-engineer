import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule],
  template: `
<!-- ══ Header — matches intake .hdr exactly ══════════════════════════════════ -->
<div class="shell">
<header class="hdr">
  <div class="hdr-brand">
    <img src="rav-logo.png" alt="Aura with Rav" class="hdr-logo"/>
    <div class="hdr-brand-text">
      <span class="hdr-name">AURA <em>with Rav</em></span>
      <span class="hdr-tag">See life — as it is.</span>
    </div>
  </div>

  <nav class="hdr-nav">
    <span class="hdr-nav-item">📊 Production Metrics</span>
    <span class="hdr-sep">·</span>
    <span class="hdr-nav-item hdr-nav-muted">Live Pipeline KPIs</span>
  </nav>

  <div class="hdr-right">
    <span class="refresh-pill">Auto-refresh 10s</span>
    <button class="hdr-btn" (click)="loadMetrics()" title="Refresh now">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" [class.spin]="loading()">
        <path d="M12 7A5 5 0 1 1 7 2M12 2v4H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Refresh
    </button>
    <button class="hdr-btn" (click)="router.navigate(['/'])">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Back
    </button>
  </div>
</header>

<!-- ══ Workspace ══════════════════════════════════════════════════════════════ -->
<div class="workspace">

  @if (loading() && !metrics()) {
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading metrics…</p>
    </div>
  }

  @if (error()) {
    <div class="error-banner">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      {{ error() }}
    </div>
  }

  @if (metrics()) {
  <div class="metrics-scroll">
  <div class="metrics-wrap">

    <!-- Page title row -->
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Pipeline Metrics Dashboard</h1>
        <p class="page-sub">Live production KPIs — updated after every analysis run · {{ metrics().total_runs }} total run{{ metrics().total_runs !== 1 ? 's' : '' }}</p>
      </div>
      @if (metrics().total_runs > 0) {
        <div class="total-badge">
          <span class="total-num">{{ metrics().total_runs }}</span>
          <span class="total-lbl">Sessions</span>
        </div>
      }
    </div>

    @if (metrics().total_runs === 0) {
      <!-- Empty state -->
      <div class="panel empty-panel">
        <div class="empty-icon">📊</div>
        <h3 class="empty-title">No data yet</h3>
        <p class="empty-sub">Submit an analysis on the home page to see live metrics populate here.</p>
        <button class="btn-primary" (click)="router.navigate(['/'])">Run Analysis →</button>
      </div>
    } @else {

    <!-- ══ Row 1: Latency ══ -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">⚡</span>
        <span class="section-title">Pipeline Latency</span>
        <span class="section-badge">Senior KPI — P95 target &lt; 30s</span>
      </div>
      <div class="kpi-row">
        <div class="kpi-card kpi-accent">
          <div class="kpi-label">P50 Median</div>
          <div class="kpi-value">{{ fmt(metrics().latency.p50_ms) }}</div>
          <div class="kpi-note">Half of users see this or better</div>
        </div>
        <div class="kpi-card" [class.kpi-warn]="metrics().latency.p95_ms > 30000">
          <div class="kpi-label">P95 Latency</div>
          <div class="kpi-value">{{ fmt(metrics().latency.p95_ms) }}</div>
          <div class="kpi-note">95th percentile — SLA threshold</div>
        </div>
        <div class="kpi-card" [class.kpi-warn]="metrics().latency.p99_ms > 60000">
          <div class="kpi-label">P99 Latency</div>
          <div class="kpi-value">{{ fmt(metrics().latency.p99_ms) }}</div>
          <div class="kpi-note">Worst 1% of users</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Average</div>
          <div class="kpi-value">{{ fmt(metrics().latency.avg_ms) }}</div>
          <div class="kpi-note">Min {{ fmt(metrics().latency.min_ms) }} / Max {{ fmt(metrics().latency.max_ms) }}</div>
        </div>
      </div>

      @if (metrics().latency.history_ms?.length > 1) {
        <div class="panel sparkline-panel">
          <div class="sparkline-label">Last {{ metrics().latency.history_ms.length }} runs — latency trend</div>
          <div class="sparkline">
            @for (ms of metrics().latency.history_ms; track $index) {
              <div class="spark-bar"
                [style.height.%]="sparkH(ms, metrics().latency.history_ms)"
                [class.spark-warn]="ms > 30000"
                [title]="fmt(ms)">
              </div>
            }
          </div>
          <div class="sparkline-axis">
            <span>oldest</span><span>latest</span>
          </div>
        </div>
      }
    </div>

    <!-- ══ Row 2: Quality ══ -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🎯</span>
        <span class="section-title">Quality Signals</span>
        <span class="section-badge">Replaces RAGAS for rule-based architecture</span>
      </div>
      <div class="quality-row">

        <!-- Confidence distribution -->
        <div class="panel conf-panel">
          <div class="panel-inner-title">Consensus Confidence Distribution</div>
          <div class="conf-bars">
            <div class="conf-row">
              <span class="conf-dot dot-high"></span>
              <span class="conf-lbl">HIGH</span>
              <div class="conf-track">
                <div class="conf-fill fill-high" [style.width.%]="metrics().confidence.high_pct"></div>
              </div>
              <span class="conf-pct">{{ metrics().confidence.high_pct }}%</span>
              <span class="conf-n">({{ metrics().confidence.high }})</span>
            </div>
            <div class="conf-row">
              <span class="conf-dot dot-med"></span>
              <span class="conf-lbl">MED</span>
              <div class="conf-track">
                <div class="conf-fill fill-med" [style.width.%]="metrics().confidence.medium_pct"></div>
              </div>
              <span class="conf-pct">{{ metrics().confidence.medium_pct }}%</span>
              <span class="conf-n">({{ metrics().confidence.medium }})</span>
            </div>
            <div class="conf-row">
              <span class="conf-dot dot-low"></span>
              <span class="conf-lbl">LOW</span>
              <div class="conf-track">
                <div class="conf-fill fill-low" [style.width.%]="metrics().confidence.low_pct"></div>
              </div>
              <span class="conf-pct">{{ metrics().confidence.low_pct }}%</span>
              <span class="conf-n">({{ metrics().confidence.low }})</span>
            </div>
          </div>
          <div class="panel-note">HIGH = 3+ domains agree · MEDIUM = 2 · LOW = single domain</div>
        </div>

        <!-- Hallucination proxy -->
        <div class="panel quality-kpi-card"
          [class.panel-good]="metrics().hallucination_proxy.rate_pct < 20"
          [class.panel-warn]="metrics().hallucination_proxy.rate_pct >= 40">
          <div class="panel-inner-title">Hallucination Proxy</div>
          <div class="big-rate">{{ metrics().hallucination_proxy.rate_pct }}%</div>
          <div class="status-pill"
            [class.pill-green]="metrics().hallucination_proxy.rate_pct < 20"
            [class.pill-orange]="metrics().hallucination_proxy.rate_pct >= 40">
            {{ metrics().hallucination_proxy.label }}
          </div>
          <div class="panel-note">{{ metrics().hallucination_proxy.explanation }}</div>
        </div>

        <!-- Answer relevance -->
        <div class="panel quality-kpi-card"
          [class.panel-good]="metrics().answer_relevance_proxy.rate_pct >= 70">
          <div class="panel-inner-title">Answer Relevance Proxy</div>
          <div class="big-rate">{{ metrics().answer_relevance_proxy.rate_pct }}%</div>
          <div class="status-pill" [class.pill-green]="metrics().answer_relevance_proxy.rate_pct >= 70">
            {{ metrics().answer_relevance_proxy.label }}
          </div>
          <div class="panel-note">{{ metrics().answer_relevance_proxy.explanation }}</div>
        </div>

      </div>
    </div>

    <!-- ══ Row 3: Hallucination Audit (3-Layer) ══ -->
    @if (metrics().hallucination_audit) {
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🔍</span>
        <span class="section-title">Hallucination Detection & Mitigation</span>
        <span class="section-badge">3-Layer Architecture · Senior Interview Feature</span>
      </div>

      <!-- Layer cards -->
      <div class="layer-row">
        <!-- Layer 1 -->
        <div class="panel layer-card layer-1">
          <div class="layer-tag">Layer 1</div>
          <div class="layer-name">Prevention</div>
          <div class="layer-status always-on">Always Active</div>
          <ul class="layer-list">
            <li>Multi-agent consensus (5 independent domains)</li>
            <li>Structured typed output — no free-form LLM generation</li>
            <li>Domain isolation — agents don't see each other's output</li>
          </ul>
        </div>

        <!-- Layer 2 -->
        <div class="panel layer-card layer-2">
          <div class="layer-tag">Layer 2</div>
          <div class="layer-name">Detection</div>
          <div class="layer-status runs-live">Runs After meta_agent</div>
          <ul class="layer-list">
            <li>Single-source detector: 1 domain = unverified</li>
            <li>Hedge-phrase scanner: "might", "possibly", "unclear"</li>
            <li>Cross-domain contradiction: opposing predictions flagged</li>
            <li>Coverage gap: &lt; 3 of 5 domains = warning</li>
          </ul>
          <div class="layer-counts">
            <span class="lc-item">
              <span class="lc-num">{{ metrics().hallucination_audit.total_single_source_flags }}</span>
              <span class="lc-lbl">Single-source</span>
            </span>
            <span class="lc-item">
              <span class="lc-num">{{ metrics().hallucination_audit.total_hedge_phrase_flags }}</span>
              <span class="lc-lbl">Hedge phrases</span>
            </span>
            <span class="lc-item">
              <span class="lc-num warn-num">{{ metrics().hallucination_audit.total_contradiction_flags }}</span>
              <span class="lc-lbl">Contradictions</span>
            </span>
          </div>
        </div>

        <!-- Layer 3 -->
        <div class="panel layer-card layer-3">
          <div class="layer-tag">Layer 3</div>
          <div class="layer-name">Recovery</div>
          <div class="layer-status runs-live">Runs After Detection</div>
          <ul class="layer-list">
            <li>Suppress: LOW-confidence flagged insights quarantined</li>
            <li>Retry: logged as retry signal for guardrails</li>
            <li>Fallback: calibrated message replaces empty responses</li>
          </ul>
          <div class="layer-counts">
            <span class="lc-item">
              <span class="lc-num">{{ metrics().hallucination_audit.total_suppressed }}</span>
              <span class="lc-lbl">Suppressed</span>
            </span>
            <span class="lc-item">
              <span class="lc-num">{{ metrics().hallucination_audit.total_fallbacks_injected }}</span>
              <span class="lc-lbl">Fallbacks</span>
            </span>
            <span class="lc-item">
              <span class="lc-num">{{ metrics().hallucination_audit.coverage_gap_runs }}</span>
              <span class="lc-lbl">Gap runs</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Risk distribution -->
      <div class="panel risk-panel">
        <div class="risk-header">
          <span class="panel-inner-title" style="margin:0">Risk Distribution Across All Runs</span>
          <span class="avg-rate-badge">Avg hallucination rate: {{ metrics().hallucination_audit.avg_rate_pct }}%</span>
        </div>
        <div class="risk-bars">
          <div class="risk-row">
            <span class="risk-dot dot-green"></span>
            <span class="risk-lbl">Low Risk</span>
            <div class="conf-track">
              <div class="conf-fill fill-high"
                [style.width.%]="riskPct('low')"></div>
            </div>
            <span class="risk-n">{{ metrics().hallucination_audit.risk_distribution.low }} run(s)</span>
          </div>
          <div class="risk-row">
            <span class="risk-dot dot-amber"></span>
            <span class="risk-lbl">Medium Risk</span>
            <div class="conf-track">
              <div class="conf-fill fill-med"
                [style.width.%]="riskPct('medium')"></div>
            </div>
            <span class="risk-n">{{ metrics().hallucination_audit.risk_distribution.medium }} run(s)</span>
          </div>
          <div class="risk-row">
            <span class="risk-dot dot-red"></span>
            <span class="risk-lbl">High Risk</span>
            <div class="conf-track">
              <div class="conf-fill fill-low"
                [style.width.%]="riskPct('high')"></div>
            </div>
            <span class="risk-n">{{ metrics().hallucination_audit.risk_distribution.high }} run(s)</span>
          </div>
        </div>
      </div>
    </div>
    }

    <!-- ══ Row 5: Token Economics ══ -->
    @if (metrics().token_economics) {
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🪙</span>
        <span class="section-title">Token Economics</span>
        <span class="section-badge">
          {{ metrics().token_economics.has_real_data ? 'Live — DeepSeek API usage' : 'No LLM calls in /run pipeline' }}
        </span>
      </div>

      @if (!metrics().token_economics.has_real_data) {
        <div class="panel info-panel">
          <div class="info-icon">ℹ️</div>
          <div>
            <div class="info-title">Domain agents are rule-based — 0 LLM tokens on /run</div>
            <div class="info-sub">{{ metrics().token_economics.rule_based_note }}</div>
            <div class="info-sub" style="margin-top:4px">Token data populates when you call <strong>/approve</strong> (report generation) or questions that trigger the WHO/WHAT/WHERE simplify agent.</div>
          </div>
        </div>
      }

      <div class="kpi-row">
        <div class="kpi-card kpi-accent">
          <div class="kpi-label">Avg Input Tokens</div>
          <div class="kpi-value">{{ metrics().token_economics.avg_prompt_tokens || '—' }}</div>
          <div class="kpi-note">Prompt tokens per run · total {{ metrics().token_economics.total_prompt_tokens }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Output Tokens</div>
          <div class="kpi-value">{{ metrics().token_economics.avg_completion_tokens || '—' }}</div>
          <div class="kpi-note">Completion tokens per run · total {{ metrics().token_economics.total_completion_tokens }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Total Tokens</div>
          <div class="kpi-value">{{ metrics().token_economics.avg_total_tokens || '—' }}</div>
          <div class="kpi-note">{{ metrics().token_economics.avg_llm_calls }} LLM call(s) per run avg</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Cost / Run</div>
          <div class="kpi-value">\${{ metrics().token_economics.avg_cost_per_run_usd }}</div>
          <div class="kpi-note">Total: \${{ metrics().token_economics.total_cost_usd }} · {{ metrics().token_economics.cost_model }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Tokens / Insight</div>
          <div class="kpi-value">{{ metrics().token_economics.tokens_per_insight || '—' }}</div>
          <div class="kpi-note">LLM tokens spent per trusted insight generated</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total LLM Calls</div>
          <div class="kpi-value">{{ metrics().token_economics.total_llm_calls }}</div>
          <div class="kpi-note">Across {{ metrics().total_runs }} pipeline run(s)</div>
        </div>
      </div>

      @if (hasTokenHistory()) {
        <div class="panel sparkline-panel">
          <div class="sparkline-label">Token usage per run (last {{ metrics().token_economics.token_history.length }})</div>
          <div class="sparkline">
            @for (t of metrics().token_economics.token_history; track $index) {
              <div class="spark-bar"
                [style.height.%]="sparkH(t, metrics().token_economics.token_history)"
                [title]="t + ' tokens'">
              </div>
            }
          </div>
          <div class="sparkline-axis"><span>oldest</span><span>latest</span></div>
        </div>
      }
    </div>
    }

    <!-- ══ Row 6: Operational ══ -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">📈</span>
        <span class="section-title">Operational KPIs</span>
        <span class="section-badge">Reliability · Coverage · Throughput</span>
      </div>
      <div class="kpi-row">
        <div class="kpi-card" [class.kpi-warn]="metrics().error_rate.rate_pct > 10">
          <div class="kpi-label">Error Rate</div>
          <div class="kpi-value">{{ metrics().error_rate.rate_pct }}%</div>
          <div class="kpi-note">{{ metrics().error_rate.total_error_runs }} error run(s) of {{ metrics().total_runs }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Domain Coverage</div>
          <div class="kpi-value">{{ metrics().domain_coverage.avg_domains_per_run }} / 5</div>
          <div class="kpi-note">{{ metrics().domain_coverage.coverage_pct }}% avg across all 5 systems</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Throughput</div>
          <div class="kpi-value">{{ metrics().throughput.requests_last_60s }}</div>
          <div class="kpi-note">req/min (last 60s) · {{ metrics().throughput.total_sessions }} total</div>
        </div>
      </div>
    </div>

    <!-- ══ Row 4: Agent breakdown ══ -->
    @if (agentKeys().length > 0) {
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🤖</span>
        <span class="section-title">Agent Latency Breakdown</span>
        <span class="section-badge">Per-agent avg execution time</span>
      </div>
      <div class="panel table-panel">
        <div class="tbl-row tbl-head">
          <span>Agent</span><span>Avg Latency</span><span>Errors</span>
        </div>
        @for (agent of agentKeys(); track agent) {
          <div class="tbl-row">
            <span class="tbl-name">{{ fmtAgent(agent) }}</span>
            <span class="tbl-lat">{{ fmt(metrics().agent_latency_avg_ms[agent]) }}</span>
            <span class="tbl-err" [class.tbl-err-red]="getAgentErr(agent) > 0">{{ getAgentErr(agent) }}</span>
          </div>
        }
      </div>
    </div>
    }

    <!-- ══ Row 5: Recent runs ══ -->
    @if (metrics().recent_runs?.length > 0) {
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🕐</span>
        <span class="section-title">Recent Runs</span>
        <span class="section-badge">Last {{ metrics().recent_runs.length }}</span>
      </div>
      <div class="panel table-panel">
        <div class="tbl-row tbl-head runs-head">
          <span>Session</span><span>Latency</span><span>HIGH</span><span>Domains</span><span>H.Risk</span><span>H.Flags</span><span>Suppressed</span>
        </div>
        @for (run of metrics().recent_runs; track run.session_id) {
          <div class="tbl-row runs-row" [class.tbl-row-err]="run.errors > 0">
            <span class="run-id">{{ run.session_id }}</span>
            <span [class.tbl-lat-warn]="run.latency_ms > 30000">{{ fmt(run.latency_ms) }}</span>
            <span class="run-high">{{ run.confidence_high }}</span>
            <span>{{ run.domains_active }}/5</span>
            <span class="risk-chip"
              [class.chip-green]="run.h_risk === 'low'"
              [class.chip-amber]="run.h_risk === 'medium'"
              [class.chip-red]="run.h_risk === 'high'">
              {{ run.h_risk ?? '—' }}
            </span>
            <span [class.tbl-err-red]="run.h_flags > 0">{{ run.h_flags }}</span>
            <span [class.tbl-err-red]="run.h_suppressed > 0">{{ run.h_suppressed }}</span>
          </div>
        }
      </div>
    </div>
    }

    <!-- ══ Row 6: Interview explainer ══ -->
    @if (metrics().interview_explainer?.why_these_metrics) {
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🎓</span>
        <span class="section-title">Interview Explainer</span>
        <span class="section-badge">Why these metrics for AstroIntel?</span>
      </div>
      <div class="panel explainer-panel">
        <p class="explainer-text">{{ metrics().interview_explainer.why_these_metrics }}</p>
      </div>
    </div>
    }

    } <!-- end total_runs > 0 -->

  </div>
  </div>
  } <!-- end metrics() -->

</div><!-- workspace -->
</div><!-- shell -->
`,
  styles: [`
    /* ── Base — match intake exactly ── */
    :host { display: block; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; color: #111827; -webkit-font-smoothing: antialiased; }

    /* ── Header — copy of intake .hdr ── */
    .hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 40px; height: 104px; flex-shrink: 0;
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(24px) saturate(200%);
      border-bottom: 1px solid rgba(0,0,0,0.07);
      box-shadow: 0 1px 0 rgba(0,0,0,0.05);
      position: relative; z-index: 100;
    }
    .hdr-brand { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
    .hdr-logo  { width: 60px; height: 60px; object-fit: cover; object-position: center top; border-radius: 50%; border: 2.5px solid rgba(99,102,241,0.35); }
    .hdr-brand-text { display: flex; flex-direction: column; gap: 2px; }
    .hdr-name  { font-size: 22px; font-weight: 700; color: #1e1b4b; letter-spacing: 0.06em; line-height: 1.2; }
    .hdr-name em { font-style: normal; font-weight: 400; color: #6366f1; }
    .hdr-tag   { font-size: 13px; color: #94a3b8; letter-spacing: 0.04em; }
    .hdr-nav   { display: flex; align-items: center; gap: 6px; }
    .hdr-nav-item { font-size: 15px; color: #4b5563; padding: 7px 14px; border-radius: 10px; font-weight: 500; white-space: nowrap; }
    .hdr-nav-muted { color: #9ca3af; font-size: 13px; }
    .hdr-sep { color: rgba(0,0,0,0.15); font-size: 18px; }
    .hdr-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .refresh-pill { font-size: 11px; color: #9ca3af; background: #f3f4f6; border: 1px solid rgba(0,0,0,0.08); border-radius: 20px; padding: 3px 10px; }
    .hdr-btn { display: flex; align-items: center; gap: 5px; background: #f9fafb; border: 1px solid rgba(0,0,0,0.12); color: #374151; border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; }
    .hdr-btn:hover { background: #f3f4f6; border-color: rgba(0,0,0,0.2); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 0.7s linear infinite; }

    /* ── Workspace ── */
    .workspace { flex: 1; overflow: hidden; background: #f1f5f9; padding: 0; }
    .metrics-scroll { height: 100%; overflow-y: auto; padding: 24px 32px 48px; }
    .metrics-scroll::-webkit-scrollbar { width: 4px; }
    .metrics-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 2px; }
    .metrics-wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

    /* ── Loading / Error ── */
    .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; color: #6b7280; }
    .loading-spinner { width: 28px; height: 28px; border: 2px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
    .error-banner { margin: 24px 32px; padding: 14px 18px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; color: #dc2626; font-size: 13px; display: flex; align-items: center; gap: 8px; }

    /* ── Page title ── */
    .page-title-row { display: flex; align-items: flex-start; justify-content: space-between; }
    .page-title { font-size: 20px; font-weight: 700; color: #1e1b4b; margin-bottom: 4px; }
    .page-sub { font-size: 13px; color: #6b7280; }
    .total-badge { text-align: center; background: #ffffff; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; padding: 12px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); flex-shrink: 0; }
    .total-num { display: block; font-size: 26px; font-weight: 700; color: #6366f1; }
    .total-lbl { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .06em; }

    /* ── Panel (base) ── */
    .panel { background: #ffffff; border: 1px solid rgba(0,0,0,0.07); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); padding: 18px 20px; }
    .panel-inner-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin-bottom: 14px; }
    .panel-note { font-size: 11px; color: #9ca3af; margin-top: 10px; line-height: 1.5; }
    .panel-good { border-color: rgba(16,185,129,.25); background: #f0fdf4; }
    .panel-warn { border-color: rgba(245,158,11,.25); background: #fffbeb; }

    /* ── Section ── */
    .section { display: flex; flex-direction: column; gap: 12px; }
    .section-header { display: flex; align-items: center; gap: 8px; }
    .section-icon { font-size: 16px; }
    .section-title { font-size: 14px; font-weight: 700; color: #1e1b4b; letter-spacing: .01em; }
    .section-badge { margin-left: auto; font-size: 10px; font-weight: 600; color: #6366f1; background: rgba(99,102,241,.07); border: 1px solid rgba(99,102,241,.18); border-radius: 20px; padding: 2px 10px; white-space: nowrap; }

    /* ── KPI row ── */
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi-card { background: #ffffff; border: 1px solid rgba(0,0,0,0.07); border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .kpi-card.kpi-accent { border-color: rgba(99,102,241,.3); background: rgba(99,102,241,.03); }
    .kpi-card.kpi-warn   { border-color: rgba(245,158,11,.3); background: #fffbeb; }
    .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 700; color: #1e1b4b; margin-bottom: 4px; }
    .kpi-note  { font-size: 11px; color: #9ca3af; line-height: 1.5; }

    /* ── Sparkline ── */
    .sparkline-panel { padding: 14px 18px; }
    .sparkline-label { font-size: 11px; color: #6b7280; margin-bottom: 8px; font-weight: 600; }
    .sparkline { display: flex; align-items: flex-end; gap: 4px; height: 52px; }
    .spark-bar { flex: 1; min-height: 4px; background: rgba(99,102,241,.45); border-radius: 3px 3px 0 0; transition: height .3s; }
    .spark-bar.spark-warn { background: rgba(245,158,11,.6); }
    .sparkline-axis { display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: #d1d5db; }

    /* ── Quality row ── */
    .quality-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
    .conf-panel { }
    .conf-bars { display: flex; flex-direction: column; gap: 10px; }
    .conf-row { display: flex; align-items: center; gap: 8px; }
    .conf-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-high { background: #10b981; }
    .dot-med  { background: #f59e0b; }
    .dot-low  { background: #ef4444; }
    .conf-lbl { font-size: 10px; font-weight: 700; color: #6b7280; width: 30px; letter-spacing: .04em; }
    .conf-track { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
    .conf-fill { height: 100%; border-radius: 4px; transition: width .5s ease; }
    .fill-high { background: #10b981; }
    .fill-med  { background: #f59e0b; }
    .fill-low  { background: #ef4444; }
    .conf-pct { font-size: 12px; font-weight: 700; color: #374151; width: 38px; text-align: right; }
    .conf-n   { font-size: 11px; color: #9ca3af; width: 34px; }

    .quality-kpi-card { display: flex; flex-direction: column; }
    .big-rate { font-size: 32px; font-weight: 800; color: #1e1b4b; margin-bottom: 8px; }
    .status-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: #f3f4f6; color: #6b7280; margin-bottom: 8px; }
    .pill-green  { background: #d1fae5; color: #065f46; }
    .pill-orange { background: #fef3c7; color: #92400e; }

    /* ── Tables ── */
    .table-panel { padding: 0; overflow: hidden; }
    .tbl-row { display: grid; grid-template-columns: 1fr 120px 80px; padding: 10px 18px; font-size: 13px; border-bottom: 1px solid rgba(0,0,0,0.05); }
    .tbl-row:last-child { border-bottom: none; }
    .tbl-head { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; font-weight: 700; background: #f9fafb; }
    .tbl-name { color: #374151; font-weight: 500; }
    .tbl-lat  { color: #4b5563; }
    .tbl-lat-warn { color: #d97706; font-weight: 600; }
    .tbl-err  { color: #9ca3af; }
    .tbl-err-red { color: #ef4444; font-weight: 700; }
    .tbl-row-err { background: #fef2f2; }

    .runs-head { grid-template-columns: 100px 90px 60px 60px 70px 70px 60px; }
    .runs-row  { grid-template-columns: 100px 90px 60px 60px 70px 70px 60px; font-size: 12px; }
    .run-id   { font-family: monospace; color: #6b7280; font-size: 11px; }
    .run-high { color: #10b981; font-weight: 700; }
    .run-low-warn { color: #ef4444; font-weight: 700; }

    /* ── Info panel ── */
    .info-panel { display: flex; align-items: flex-start; gap: 12px; background: #eff6ff; border-color: rgba(59,130,246,.25); padding: 14px 18px; }
    .info-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .info-title { font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 4px; }
    .info-sub { font-size: 12px; color: #3b82f6; line-height: 1.5; }
    /* kpi-row 6-col for token economics */
    .kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }

    /* ── Hallucination 3-layer ── */
    .layer-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .layer-card { padding: 16px 18px; }
    .layer-tag  { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #9ca3af; margin-bottom: 4px; }
    .layer-name { font-size: 15px; font-weight: 700; color: #1e1b4b; margin-bottom: 6px; }
    .layer-status { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; display: inline-block; margin-bottom: 12px; }
    .always-on   { background: #d1fae5; color: #065f46; }
    .runs-live   { background: #dbeafe; color: #1e40af; }
    .layer-list  { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .layer-list li { font-size: 12px; color: #4b5563; padding-left: 14px; position: relative; line-height: 1.5; }
    .layer-list li::before { content: "·"; position: absolute; left: 0; color: #6366f1; font-weight: 700; }
    .layer-1 { border-top: 3px solid #10b981; }
    .layer-2 { border-top: 3px solid #6366f1; }
    .layer-3 { border-top: 3px solid #f59e0b; }
    .layer-counts { display: flex; gap: 16px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.06); }
    .lc-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .lc-num  { font-size: 20px; font-weight: 800; color: #374151; }
    .lc-num.warn-num { color: #ef4444; }
    .lc-lbl  { font-size: 10px; color: #9ca3af; text-align: center; }
    .risk-panel { padding: 16px 20px; }
    .risk-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .avg-rate-badge { font-size: 11px; font-weight: 700; background: #f3f4f6; border: 1px solid rgba(0,0,0,0.08); border-radius: 20px; padding: 3px 10px; color: #374151; }
    .risk-bars { display: flex; flex-direction: column; gap: 10px; }
    .risk-row  { display: flex; align-items: center; gap: 10px; }
    .risk-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-green { background: #10b981; }
    .dot-amber { background: #f59e0b; }
    .dot-red   { background: #ef4444; }
    .risk-lbl  { font-size: 12px; color: #4b5563; width: 82px; font-weight: 500; }
    .risk-n    { font-size: 11px; color: #9ca3af; width: 64px; text-align: right; }
    .risk-chip { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; text-transform: uppercase; letter-spacing: .04em; background: #f3f4f6; color: #6b7280; }
    .chip-green { background: #d1fae5; color: #065f46; }
    .chip-amber { background: #fef3c7; color: #92400e; }
    .chip-red   { background: #fee2e2; color: #991b1b; }

    /* ── Explainer ── */
    .explainer-panel { background: rgba(99,102,241,.03); border-color: rgba(99,102,241,.2); }
    .explainer-text { font-size: 13px; color: #374151; line-height: 1.8; }

    /* ── Empty ── */
    .empty-panel { text-align: center; padding: 60px 40px; }
    .empty-icon  { font-size: 40px; margin-bottom: 16px; }
    .empty-title { font-size: 18px; font-weight: 700; color: #1e1b4b; margin-bottom: 8px; }
    .empty-sub   { font-size: 14px; color: #6b7280; margin-bottom: 24px; }
    .btn-primary { background: #6366f1; border: none; color: #fff; border-radius: 8px; padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .btn-primary:hover { background: #4f46e5; }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .kpi-row { grid-template-columns: repeat(2, 1fr); }
      .quality-row { grid-template-columns: 1fr; }
      .metrics-scroll { padding: 16px 16px 40px; }
      .hdr { padding: 0 20px; }
    }
  `]
})
export class MetricsPage implements OnInit, OnDestroy {
  readonly router = inject(Router);
  private api = inject(ApiService);

  metrics = signal<any>(null);
  loading = signal(false);
  error = signal('');
  private _timer: any;

  ngOnInit() {
    this.loadMetrics();
    this._timer = setInterval(() => this.loadMetrics(), 10_000);
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
