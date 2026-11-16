/**
 * AgentBusinessMetrics dashboard — are the staffing recommendations worth having?
 *
 * Five numbers from GET /business-metrics: acceptance rate, time to allocate
 * (AI-assisted vs manual), human intervention rate, cost per recommendation and
 * allocation success rate. From here a manager also decides pending
 * recommendations, records whether an allocation worked, and logs allocations
 * made by hand (the manual baseline).
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AllocationDecision } from '../../models/types';

interface BizMetric {
  key: string; label: string; value: number | null; unit: string; description: string;
  higher_is_better: boolean | null; assumption: boolean; detail: Record<string, any>;
}
interface BizSummary {
  window_days: number; recommendations: number; manual_allocations: number;
  metrics: BizMetric[]; daily: any[]; recent: any[];
}

@Component({
  selector: 'app-agent-business-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="abm">
    <div class="abm-head">
      <div>
        <h1>Agent Business Metrics</h1>
        <p class="sub">Do managers trust the allocation recommendations, do they save time and money, and do the allocations work out? Values tagged <span class="tag-assume">assumption</span> use a configured estimate until it is measured.</p>
      </div>
      <div class="controls">
        @for (d of [7, 30, 90]; track d) {
          <button class="chip" [class.on]="days() === d" (click)="setDays(d)">{{ d }} days</button>
        }
        <button class="chip" (click)="load()" [disabled]="loading()">{{ loading() ? 'Loading…' : '↻ Refresh' }}</button>
      </div>
    </div>

    @if (error()) { <div class="err">{{ error() }}</div> }

    @if (data(); as d) {
      <div class="kpis">
        @for (m of d.metrics; track m.key) {
          <div class="kpi" [attr.data-metric]="m.key">
            <div class="kpi-l">{{ m.label }} @if (m.assumption) { <span class="tag-assume">assumption</span> }</div>
            <div class="kpi-v">{{ fmt(m.value, m.unit) }}</div>
            <div class="kpi-n">{{ m.description }}</div>
            <div class="kpi-d">{{ detail(m) }}</div>
          </div>
        }
      </div>
      <p class="muted">{{ d.recommendations }} AI recommendation{{ d.recommendations === 1 ? '' : 's' }} and {{ d.manual_allocations }} manual allocation{{ d.manual_allocations === 1 ? '' : 's' }} in the last {{ d.window_days }} days</p>

      @if (timeMetric(d); as t) {
        <h2>Time to allocate</h2>
        <div class="cmp">
          <div class="cmp-row">
            <span class="cmp-l">AI-assisted</span>
            <div class="cmp-track"><div class="cmp-bar b-ai" [style.width.%]="share(t.detail['ai_minutes'], t)"></div></div>
            <span class="cmp-v">{{ fmt(t.detail['ai_minutes'], 'min') }}</span>
          </div>
          <div class="cmp-row">
            <span class="cmp-l">Manual @if (t.assumption) { <span class="tag-assume">assumption</span> }</span>
            <div class="cmp-track"><div class="cmp-bar b-manual" [style.width.%]="share(t.detail['manual_minutes'], t)"></div></div>
            <span class="cmp-v">{{ fmt(t.detail['manual_minutes'], 'min') }}</span>
          </div>
          @if (t.detail['time_saved_pct'] !== null) {
            <p class="muted small">{{ fmt(t.detail['time_saved_pct'], 'pct') }} faster with the agent · manual time is {{ t.detail['manual_source'] }}</p>
          }
        </div>
      }

      @if (d.daily.length) {
        <h2>Manager decisions per day</h2>
        <div class="trend">
          @for (day of d.daily; track day.date) {
            <div class="tcol" [title]="day.date + ': ' + day.recommendations + ' recommendations'">
              <div class="tbar" [style.height.%]="barH(day.recommendations)">
                <div class="seg s-pend" [style.flex]="day.pending"></div>
                <div class="seg s-rej" [style.flex]="day.rejected"></div>
                <div class="seg s-mod" [style.flex]="day.modified"></div>
                <div class="seg s-ok" [style.flex]="day.accepted"></div>
              </div>
              <div class="tlbl">{{ day.date.slice(5) }}</div>
            </div>
          }
        </div>
        <div class="legend"><span class="lg s-ok"></span>accepted <span class="lg s-mod"></span>with changes <span class="lg s-rej"></span>rejected <span class="lg s-pend"></span>pending</div>
      }

      <h2>Recommendations</h2>
      @if (d.recent.length) {
        <div class="tablewrap">
          <table>
            <thead><tr><th>When</th><th>Candidate</th><th>Role</th><th>Match</th><th>Agent</th><th>Decision</th><th>Time to allocate</th><th>Model cost</th><th>Outcome</th></tr></thead>
            <tbody>
              @for (r of d.recent; track r.rec_id) {
                <tr [attr.data-rec]="r.rec_id">
                  <td>{{ r.created_at * 1000 | date:'MMM d, HH:mm' }}</td>
                  <td>{{ r.candidate_id }} @if (r.source === 'manual') { <span class="tag-manual">manual</span> }</td>
                  <td>{{ r.target_role }}</td>
                  <td>{{ r.match_pct === null ? '—' : r.match_pct + '%' }}</td>
                  <td>@if (r.needs_help) { <span class="st st-warn" [title]="r.help_reasons.join('; ')">needs help</span> } @else { — }</td>
                  <td>
                    @if (r.decision) { <span class="st" [ngClass]="'st-' + r.decision">{{ decisionLabel(r.decision) }}</span> }
                    @else {
                      <div class="row-actions">
                        <button class="mini" [disabled]="busy()" (click)="decide(r.rec_id, 'accepted')">Accept</button>
                        <button class="mini" [disabled]="busy()" (click)="decide(r.rec_id, 'modified')">With changes</button>
                        <button class="mini mini-no" [disabled]="busy()" (click)="decide(r.rec_id, 'rejected')">Reject</button>
                      </div>
                    }
                  </td>
                  <td>{{ fmt(r.minutes_to_allocate, 'min') }}</td>
                  <td>{{ r.source === 'manual' ? '—' : fmt(r.model_cost_usd, 'usd') }}</td>
                  <td>
                    @if (r.outcome) { <span class="st" [ngClass]="r.outcome === 'success' ? 'st-accepted' : 'st-rejected'">{{ r.outcome === 'success' ? 'worked' : 'did not work' }}</span> }
                    @else if (r.allocated_at) {
                      <div class="row-actions">
                        <button class="mini" [disabled]="busy()" (click)="outcome(r.rec_id, 'success')">Worked</button>
                        <button class="mini mini-no" [disabled]="busy()" (click)="outcome(r.rec_id, 'failed')">Didn't work</button>
                      </div>
                    } @else { <span class="muted">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else { <p class="muted">No recommendations yet. Run a role mapping, then decide on it here or on the Role Mapping page.</p> }

      <h2>Log a manual allocation</h2>
      <p class="sub">An allocation made without the agent, with how long it took. These replace the assumed manual time above.</p>
      <form class="manual" (ngSubmit)="logManual()">
        <input name="candidate" [(ngModel)]="manualCandidate" placeholder="Candidate ID" required maxlength="100">
        <input name="role" [(ngModel)]="manualRole" placeholder="Role" required maxlength="200">
        <input name="minutes" type="number" min="1" [(ngModel)]="manualMinutes" placeholder="Minutes" required>
        <button class="chip on" type="submit" [disabled]="busy() || !manualReady">Log allocation</button>
      </form>
      @if (actionError()) { <div class="err">{{ actionError() }}</div> }

      <h2>Definitions</h2>
      <ul class="defs">
        <li><strong>Accepted</strong>: the manager allocated the recommended person as suggested. <strong>With changes</strong>: allocated, but the manager adjusted the suggestion — counted as an intervention, not as acceptance.</li>
        <li><strong>Needs help</strong>: the agent itself flagged the answer (no role document retrieved, claims not supported by the documents, blocked or unfaithful output).</li>
        <li><strong>Cost per recommendation</strong>: model spend from the task ledger plus the window's share of hosting cost (BENCH_INFRA_COST_PER_MONTH_USD).</li>
        <li><strong>Allocation success</strong>: recorded by the manager once the allocation has run long enough to judge.</li>
      </ul>
    } @else if (!error()) { <p class="muted">Loading…</p> }
  </div>
  `,
  styles: [`
    .abm { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --card:#fff; --soft:#f8fafc; --acc:#2563eb;
           color: var(--ink); max-width: 1180px; margin: 0 auto; padding: 8px 0 40px; font-size: 14px; }
    .abm-head { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:flex-end; }
    h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 26px 0 10px; }
    .sub { color: var(--muted); margin: 0 0 8px; max-width: 760px; line-height: 1.5; }
    .muted { color: var(--muted); } .small { font-size: 12px; }
    .controls { display:flex; gap:6px; flex-wrap:wrap; }
    .chip { border:1px solid var(--line); background: var(--card); padding:6px 12px; border-radius: 999px; cursor:pointer; font: inherit; color: var(--ink); }
    .chip.on { background: var(--acc); border-color: var(--acc); color:#fff; }
    .chip:disabled { opacity: .55; cursor: default; }
    .err { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:10px 12px; border-radius:8px; margin-top:12px; }
    .kpis { display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap:10px; margin-top: 16px; }
    .kpi { background: var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; }
    .kpi-l { font-size: 12px; color: var(--muted); } .kpi-v { font-size: 26px; font-weight: 700; margin: 4px 0; }
    .kpi-n { font-size: 11px; color: var(--muted); line-height: 1.35; }
    .kpi-d { font-size: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); line-height: 1.4; }
    .tag-assume { font-size: 10px; background:#fef3c7; color:#92400e; border-radius: 6px; padding: 1px 6px; margin-left: 4px; }
    .tag-manual { font-size: 10px; background:#e2e8f0; color:#334155; border-radius: 6px; padding: 1px 6px; margin-left: 4px; }
    .cmp { background: var(--card); border:1px solid var(--line); border-radius: 12px; padding: 12px 14px; max-width: 760px; }
    .cmp-row { display:grid; grid-template-columns: 130px 1fr 80px; gap: 10px; align-items:center; margin: 6px 0; }
    .cmp-track { background: var(--soft); border-radius: 6px; height: 14px; overflow: hidden; }
    .cmp-bar { height: 100%; border-radius: 6px; min-width: 2px; }
    .b-ai { background: var(--acc); } .b-manual { background:#94a3b8; }
    .cmp-v { text-align: right; font-weight: 600; white-space: nowrap; }
    .trend { display:flex; align-items:flex-end; gap:4px; height: 120px; padding: 6px; background: var(--soft); border:1px solid var(--line); border-radius: 10px; overflow-x: auto; }
    .tcol { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width: 26px; }
    .tbar { width: 18px; display:flex; flex-direction:column; border-radius: 4px; overflow:hidden; min-height: 3px; }
    .seg { min-height: 0; } .s-ok { background:#22c55e; } .s-mod { background:#f59e0b; } .s-rej { background:#ef4444; } .s-pend { background:#cbd5e1; }
    .tlbl { font-size: 10px; color: var(--muted); margin-top: 3px; }
    .legend { display:flex; gap:8px; align-items:center; flex-wrap:wrap; color: var(--muted); font-size: 12px; margin-top: 6px; }
    .lg { display:inline-block; width:10px; height:10px; border-radius: 3px; }
    .tablewrap { overflow-x:auto; border:1px solid var(--line); border-radius: 10px; background: var(--card); }
    table { width:100%; border-collapse: collapse; } th, td { text-align:left; padding: 8px 10px; border-bottom:1px solid var(--line); vertical-align: middle; }
    th { font-size: 12px; color: var(--muted); font-weight: 600; background: var(--soft); white-space: nowrap; }
    .st { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--soft); white-space: nowrap; }
    .st-accepted { background:#dcfce7; color:#166534; } .st-modified, .st-warn { background:#fef3c7; color:#92400e; }
    .st-rejected { background:#fee2e2; color:#991b1b; }
    .row-actions { display:flex; gap:4px; flex-wrap: wrap; }
    .mini { font: inherit; font-size: 12px; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; white-space: nowrap; }
    .mini:hover:not(:disabled) { border-color: var(--acc); color: var(--acc); }
    .mini-no:hover:not(:disabled) { border-color:#ef4444; color:#991b1b; }
    .mini:disabled { opacity: .5; cursor: default; }
    .manual { display:flex; gap: 8px; flex-wrap: wrap; }
    .manual input { font: inherit; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; flex: 1 1 160px; }
    .manual input[type=number] { flex: 0 1 110px; }
    .defs { color: var(--muted); line-height: 1.6; padding-left: 18px; }
    @media (max-width: 600px) { .cmp-row { grid-template-columns: 90px 1fr 64px; } .kpi-v { font-size: 22px; } }
  `],
})
export class AgentBusinessMetricsComponent implements OnInit {
  private api = inject(ApiService);

  days = signal(30);
  loading = signal(false);
  busy = signal(false);
  error = signal('');
  actionError = signal('');
  data = signal<BizSummary | null>(null);

  manualCandidate = '';
  manualRole = '';
  manualMinutes: number | null = null;

  ngOnInit() { this.load(); }

  setDays(d: number) { this.days.set(d); this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.getBusinessMetrics(this.days()).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: e => { this.error.set(`Could not load business metrics (${e.status || 'network'}).`); this.loading.set(false); },
    });
  }

  decide(recId: string, decision: AllocationDecision) {
    this.act(this.api.decideAllocation(recId, decision));
  }

  outcome(recId: string, outcome: 'success' | 'failed') {
    this.act(this.api.recordAllocationOutcome(recId, outcome));
  }

  get manualReady() {
    return !!this.manualCandidate && !!this.manualRole && (this.manualMinutes ?? 0) > 0;
  }

  logManual() {
    if (!this.manualReady) return;
    this.act(this.api.logManualAllocation(this.manualCandidate, this.manualRole, this.manualMinutes!), () => {
      this.manualCandidate = this.manualRole = '';
      this.manualMinutes = null;
    });
  }

  private act(request: ReturnType<ApiService['decideAllocation']>, done?: () => void) {
    this.busy.set(true);
    this.actionError.set('');
    request.subscribe({
      next: () => { this.busy.set(false); done?.(); this.load(); },
      error: e => { this.actionError.set(e.error?.detail ?? 'Could not save.'); this.busy.set(false); },
    });
  }

  timeMetric(d: BizSummary) { return d.metrics.find(m => m.key === 'time_to_allocate'); }

  share(v: number | null, t: BizMetric) {
    const max = Math.max(t.detail['ai_minutes'] ?? 0, t.detail['manual_minutes'] ?? 0, 1);
    return v === null || v === undefined ? 0 : Math.max(1, (v / max) * 100);
  }

  barH(n: number) {
    const max = Math.max(1, ...(this.data()?.daily ?? []).map((x: any) => x.recommendations));
    return Math.max(3, (n / max) * 100);
  }

  decisionLabel(d: string) {
    return ({ accepted: 'accepted', modified: 'with changes', rejected: 'rejected' } as Record<string, string>)[d] ?? d;
  }

  detail(m: BizMetric): string {
    const x = m.detail;
    switch (m.key) {
      case 'acceptance_rate':
        return `${x['accepted']} accepted · ${x['modified']} with changes · ${x['rejected']} rejected · ${x['pending']} pending`;
      case 'time_to_allocate':
        return `Manual: ${this.fmt(x['manual_minutes'], 'min')}` +
               (x['time_saved_pct'] !== null ? ` · ${this.fmt(x['time_saved_pct'], 'pct')} faster` : '');
      case 'intervention_rate':
        return `${x['flagged_by_agent']} flagged by the agent · ${x['changed_by_manager']} changed · ${x['rejected_by_manager']} rejected`;
      case 'cost_per_recommendation_usd':
        return `Model ${this.fmt(x['model_per_recommendation_usd'], 'usd')} + infra ${this.fmt(x['infra_per_recommendation_usd'], 'usd')}`;
      case 'allocation_success_rate':
        return `${x['outcomes_recorded']} outcomes recorded · ${x['awaiting_outcome']} awaiting` +
               (x['manual_success_rate'] !== null ? ` · manual ${this.fmt(x['manual_success_rate'], 'pct')}` : '');
      default:
        return '';
    }
  }

  fmt(v: number | null | undefined, unit: string): string {
    if (v === null || v === undefined) return '—';
    switch (unit) {
      case 'pct': return `${v.toFixed(1)}%`;
      case 'min': return v >= 120 ? `${(v / 60).toFixed(1)} h` : `${v.toFixed(1)} min`;
      case 'usd': return !v ? '$0' : v < 0.01 ? `$${v.toFixed(5)}` : `$${v.toFixed(3)}`;
      default: return `${v}`;
    }
  }
}
