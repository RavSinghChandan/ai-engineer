/**
 * FDE Outcomes dashboard — business evidence for the AI workflow.
 *
 * Renders whatever the backend registry returns (GET /fde/outcomes), so a new
 * metric added in fde/metrics.py appears here with no frontend change.
 * Also shows the agent permission matrix and the latest model-comparison report.
 *
 * The same component ships in every project; only FDE_API differs.
 */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

const FDE_API = '/api/fde';

interface MetricItem {
  key: string; label: string; value: number | null; unit: string; group: string;
  description: string; assumption: boolean; higher_is_better: boolean | null; error?: string;
}
interface Workflow { key: string; label: string; description: string; tasks: number; metrics: MetricItem[]; }
interface Outcomes {
  project: string; window_days: number; tasks: number; overall: MetricItem[]; workflows: Workflow[];
  daily: any[]; recent_tasks: any[]; status_definitions: Record<string, string>; assumption_note: string;
}

const HEADLINE = ['completion_rate', 'success_rate', 'failure_rate', 'cost_per_successful_task_usd',
                  'latency_p50_ms', 'retries_per_task', 'model_calls_per_task', 'intervention_rate'];

@Component({
  selector: 'app-fde-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="fde">
    <div class="fde-head">
      <div>
        <h1>FDE Outcomes</h1>
        <p class="sub">Is the AI workflow faster, cheaper and reliable enough to trust? Every number below is measured per task and stored, except values tagged <span class="tag-assume">assumption</span>.</p>
      </div>
      <div class="controls">
        @for (d of [7, 30, 90]; track d) {
          <button class="chip" [class.on]="days() === d" (click)="setDays(d)">{{ d }} days</button>
        }
        <button class="chip" (click)="load()" [disabled]="loading()">{{ loading() ? 'Loading…' : '↻ Refresh' }}</button>
      </div>
    </div>

    @if (error()) { <div class="err">{{ error() }}</div> }

    <nav class="tabs">
      @for (t of tabs; track t.key) {
        <button [class.on]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
      }
    </nav>

    @if (tab() === 'outcomes' && data(); as d) {
      <section>
        <div class="kpis">
          @for (m of headline(); track m.key) {
            <div class="kpi" [title]="m.description">
              <div class="kpi-l">{{ m.label }}</div>
              <div class="kpi-v">{{ fmt(m) }}</div>
              <div class="kpi-n">{{ m.description }}</div>
            </div>
          }
        </div>
        <p class="muted">{{ d.tasks }} task{{ d.tasks === 1 ? '' : 's' }} in the last {{ d.window_days }} days · {{ d.project }}</p>

        @if (d.daily.length) {
          <h2>Daily trend</h2>
          <div class="trend">
            @for (day of d.daily; track day.date) {
              <div class="tcol" [title]="day.date + ': ' + day.tasks + ' tasks, $' + day.cost_usd">
                <div class="tbar" [style.height.%]="barH(day.tasks)">
                  <div class="seg s-fail" [style.flex]="day.failed || 0"></div>
                  <div class="seg s-deg" [style.flex]="day.degraded || 0"></div>
                  <div class="seg s-rej" [style.flex]="day.rejected || 0"></div>
                  <div class="seg s-ok" [style.flex]="day.success || 0"></div>
                </div>
                <div class="tlbl">{{ day.date.slice(5) }}</div>
              </div>
            }
          </div>
          <div class="legend"><span class="lg s-ok"></span>success <span class="lg s-deg"></span>degraded <span class="lg s-rej"></span>rejected <span class="lg s-fail"></span>failed</div>
        }

        <h2>All metrics</h2>
        @for (g of groups(d.overall); track g.name) {
          <div class="group">
            <h3>{{ g.name }}</h3>
            <div class="mgrid">
              @for (m of g.items; track m.key) {
                <div class="mcell" [title]="m.description">
                  <span class="ml">{{ m.label }} @if (m.assumption) { <span class="tag-assume">assumption</span> }</span>
                  <span class="mv">{{ fmt(m) }}</span>
                </div>
              }
            </div>
          </div>
        }

        <h2>By workflow</h2>
        @for (w of d.workflows; track w.key) {
          <details class="wf" [open]="w.tasks > 0">
            <summary><strong>{{ w.label }}</strong> <span class="muted">· {{ w.tasks }} tasks · {{ w.description }}</span></summary>
            @for (g of groups(w.metrics); track g.name) {
              <div class="group">
                <h3>{{ g.name }}</h3>
                <div class="mgrid">
                  @for (m of g.items; track m.key) {
                    <div class="mcell" [title]="m.description">
                      <span class="ml">{{ m.label }} @if (m.assumption) { <span class="tag-assume">assumption</span> }</span>
                      <span class="mv">{{ fmt(m) }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </details>
        }

        <h2>Recent tasks</h2>
        @if (d.recent_tasks.length) {
          <div class="tablewrap">
            <table>
              <thead><tr><th>Task</th><th>Workflow</th><th>Status</th><th>Time</th><th>Model calls</th><th>Retries</th><th>Tokens</th><th>Cost</th><th>Reviewed</th></tr></thead>
              <tbody>
                @for (r of d.recent_tasks; track r.task_id + r.started_at) {
                  <tr>
                    <td class="mono">{{ r.task_id }}</td>
                    <td>{{ r.workflow }}</td>
                    <td><span class="st" [ngClass]="'st-' + r.status" [title]="r.error">{{ r.status }}{{ r.cache_hit ? ' · cache' : '' }}</span></td>
                    <td>{{ ms(r.duration_ms) }}</td>
                    <td>{{ r.model_calls }}</td>
                    <td>{{ r.retries }}</td>
                    <td>{{ r.tokens }}</td>
                    <td>{{ usd(r.cost_usd) }}</td>
                    <td>{{ r.reviewed ? '✓' : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <p class="muted">No tasks yet. Run the workflow once and refresh.</p> }

        <h2>Definitions</h2>
        <ul class="defs">
          @for (s of statusKeys(d); track s) { <li><strong>{{ s }}</strong>: {{ d.status_definitions[s] }}</li> }
          <li>{{ d.assumption_note }}</li>
        </ul>
      </section>
    }

    @if (tab() === 'permissions' && perms(); as p) {
      <section>
        <p class="sub">Which agent may <b>read</b> data, <b>write</b> (modify) records, or must hand an action to a <b>human</b> for approval. Policy: {{ p.policy }}. Enforced in code at each agent boundary.</p>
        <div class="tablewrap">
          <table class="matrix">
            <thead><tr><th>Agent</th>@for (r of p.resources; track r) { <th class="rot"><span>{{ r }}</span></th> }</tr></thead>
            <tbody>
              @for (a of p.agents; track a.name) {
                <tr>
                  <td [title]="a.description"><strong>{{ a.name }}</strong>@if (a.kind === 'human') { <span class="tag-human">human</span> }<div class="muted small">{{ a.description }}</div></td>
                  @for (r of p.resources; track r) {
                    <td class="cell">
                      @if (p.grid[a.name][r].read) { <span class="b b-r" title="read">R</span> }
                      @if (p.grid[a.name][r].write) { <span class="b b-w" title="write">W</span> }
                      @if (p.grid[a.name][r].approval) { <span class="b b-h" title="needs human approval">H</span> }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="legend"><span class="b b-r">R</span> read <span class="b b-w">W</span> write <span class="b b-h">H</span> human approval required · empty = denied</div>
        <h2>Recent decisions (this server process)</h2>
        @if (p.recent_decisions.length) {
          <div class="tablewrap"><table>
            <thead><tr><th>When</th><th>Agent</th><th>Action</th><th>Resource</th><th>Decision</th></tr></thead>
            <tbody>
              @for (x of p.recent_decisions; track $index) {
                <tr><td>{{ x.ts * 1000 | date:'MMM d, HH:mm:ss' }}</td><td>{{ x.agent }}</td><td>{{ x.action }}</td><td>{{ x.resource }}</td>
                    <td><span class="st" [ngClass]="x.decision === 'deny' ? 'st-failed' : x.decision === 'allow' ? 'st-success' : 'st-degraded'">{{ x.decision }}</span></td></tr>
              }
            </tbody>
          </table></div>
        } @else { <p class="muted">No decisions recorded since the server started.</p> }
      </section>
    }

    @if (tab() === 'evals') {
      <section>
        @if (evalRep(); as e) {
          @if (e.available === false) {
            <p class="muted">No model-comparison report yet. {{ e.hint }}</p>
          } @else {
            <p class="sub">{{ e.description }}</p>
            <p class="muted small">Run {{ e.run_at }} · commit <span class="mono">{{ e.reproducibility.git_commit }}</span> · prompt <span class="mono">{{ e.reproducibility.prompt_version }}</span> · temperature {{ e.reproducibility.params.temperature }} · suite sha256 <span class="mono">{{ e.reproducibility.suite_sha256.slice(0, 12) }}…</span><br>Reproduce: <span class="mono">{{ e.reproducibility.command }}</span></p>
            <div class="tablewrap"><table>
              <thead><tr><th>Model</th><th>Pass rate</th><th>Mean score</th><th>P50 latency</th><th>Tokens</th><th>Total cost</th><th>Cost per passed case</th><th>Errors</th></tr></thead>
              <tbody>
                @for (s of e.summary; track s.model) {
                  <tr><td class="mono">{{ s.model }}</td><td>{{ s.passed }}/{{ s.cases }} ({{ s.pass_rate_pct }}%)</td><td>{{ s.mean_score }}</td>
                      <td>{{ ms(s.latency_p50_ms) }}</td><td>{{ s.total_tokens }}</td><td>{{ usd(s.total_cost_usd) }}</td>
                      <td>{{ s.cost_per_passed_case_usd === null ? '—' : usd(s.cost_per_passed_case_usd) }}</td><td>{{ s.errors }}</td></tr>
                }
              </tbody>
            </table></div>
            <h2>Per case</h2>
            <div class="tablewrap"><table>
              <thead><tr><th>Case</th><th>Model</th><th>Score</th><th>Pass</th><th>Latency</th><th>Failed checks</th></tr></thead>
              <tbody>
                @for (r of e.results; track r.case_id + r.model) {
                  <tr><td>{{ r.case_id }}</td><td class="mono">{{ r.model }}</td><td>{{ r.score }}</td><td>{{ r.passed ? '✅' : '❌' }}</td><td>{{ ms(r.latency_ms) }}</td>
                      <td class="small">{{ r.error || failedChecks(r) }}</td></tr>
                }
              </tbody>
            </table></div>
            <p class="muted small">{{ e.reproducibility.pricing_note }}</p>
          }
        } @else { <p class="muted">Loading…</p> }
      </section>
    }
  </div>
  `,
  styles: [`
    .fde { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --card:#fff; --soft:#f8fafc; --acc:#2563eb;
           color: var(--ink); max-width: 1180px; margin: 0 auto; padding: 8px 0 40px; font-size: 14px; }
    .fde-head { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:flex-end; }
    h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 26px 0 10px; } h3 { font-size: 12px; text-transform: uppercase; letter-spacing:.06em; color: var(--muted); margin: 12px 0 6px; }
    .sub { color: var(--muted); margin: 0 0 8px; max-width: 760px; line-height: 1.5; }
    .muted { color: var(--muted); } .small { font-size: 12px; } .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
    .controls { display:flex; gap:6px; flex-wrap:wrap; }
    .chip, .tabs button { border:1px solid var(--line); background: var(--card); padding:6px 12px; border-radius: 999px; cursor:pointer; font: inherit; color: var(--ink); }
    .chip.on, .tabs button.on { background: var(--acc); border-color: var(--acc); color:#fff; }
    .tabs { display:flex; gap:6px; margin: 16px 0 6px; flex-wrap: wrap; }
    .err { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:10px 12px; border-radius:8px; margin-top:12px; }
    .kpis { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px; margin-top: 12px; }
    .kpi { background: var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
    .kpi-l { font-size: 12px; color: var(--muted); } .kpi-v { font-size: 24px; font-weight: 700; margin: 4px 0; }
    .kpi-n { font-size: 11px; color: var(--muted); line-height: 1.35; }
    .group { margin-bottom: 4px; }
    .mgrid { display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:6px; }
    .mcell { display:flex; justify-content:space-between; gap:8px; background: var(--soft); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
    .ml { color: var(--ink); } .mv { font-weight: 600; white-space: nowrap; }
    .tag-assume { font-size: 10px; background:#fef3c7; color:#92400e; border-radius: 6px; padding: 1px 6px; margin-left: 4px; }
    .tag-human { font-size: 10px; background:#ede9fe; color:#5b21b6; border-radius: 6px; padding: 1px 6px; margin-left: 6px; }
    .wf { border:1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; background: var(--card); }
    .wf summary { cursor: pointer; }
    .trend { display:flex; align-items:flex-end; gap:4px; height: 120px; padding: 6px; background: var(--soft); border:1px solid var(--line); border-radius: 10px; overflow-x: auto; }
    .tcol { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width: 26px; }
    .tbar { width: 18px; display:flex; flex-direction:column; border-radius: 4px; overflow:hidden; min-height: 3px; }
    .seg { min-height: 0; } .s-ok { background:#22c55e; } .s-deg { background:#f59e0b; } .s-rej { background:#94a3b8; } .s-fail { background:#ef4444; }
    .tlbl { font-size: 10px; color: var(--muted); margin-top: 3px; }
    .legend { display:flex; gap:8px; align-items:center; flex-wrap:wrap; color: var(--muted); font-size: 12px; margin-top: 6px; }
    .lg { display:inline-block; width:10px; height:10px; border-radius: 3px; }
    .tablewrap { overflow-x:auto; border:1px solid var(--line); border-radius: 10px; background: var(--card); }
    table { width:100%; border-collapse: collapse; } th, td { text-align:left; padding: 8px 10px; border-bottom:1px solid var(--line); vertical-align: top; }
    th { font-size: 12px; color: var(--muted); font-weight: 600; background: var(--soft); }
    .st { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--soft); white-space: nowrap; }
    .st-success { background:#dcfce7; color:#166534; } .st-degraded { background:#fef3c7; color:#92400e; }
    .st-failed { background:#fee2e2; color:#991b1b; } .st-rejected { background:#e2e8f0; color:#334155; }
    .matrix .cell { text-align:center; white-space: nowrap; } .matrix td:first-child { min-width: 220px; }
    .rot { white-space: nowrap; font-size: 11px; }
    .b { display:inline-block; min-width: 18px; text-align:center; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 4px; margin: 0 1px; }
    .b-r { background:#dbeafe; color:#1e40af; } .b-w { background:#dcfce7; color:#166534; } .b-h { background:#ede9fe; color:#5b21b6; }
    .defs { color: var(--muted); line-height: 1.6; padding-left: 18px; }
  `],
})
export class FdeDashboardComponent implements OnInit {
  private http = inject(HttpClient);

  readonly tabs = [
    { key: 'outcomes', label: '📈 Outcomes' },
    { key: 'permissions', label: '🛡️ Agent permissions' },
    { key: 'evals', label: '⚖️ Model comparison' },
  ];
  tab = signal<'outcomes' | 'permissions' | 'evals' | string>('outcomes');
  days = signal(30);
  loading = signal(false);
  error = signal('');
  data = signal<Outcomes | null>(null);
  perms = signal<any>(null);
  evalRep = signal<any>(null);

  headline = computed(() => {
    const d = this.data();
    if (!d) return [];
    return HEADLINE.map(k => d.overall.find(m => m.key === k)).filter((m): m is MetricItem => !!m);
  });

  ngOnInit() { this.load(); }

  setDays(d: number) { this.days.set(d); this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.http.get<Outcomes>(`${FDE_API}/outcomes?days=${this.days()}`).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: e => { this.error.set(`Could not load outcomes (${e.status || 'network'}).`); this.loading.set(false); },
    });
    this.http.get(`${FDE_API}/permissions`).subscribe({ next: p => this.perms.set(p), error: () => {} });
    this.http.get(`${FDE_API}/evals/latest`).subscribe({ next: r => this.evalRep.set(r), error: () => {} });
  }

  groups(items: MetricItem[]) {
    const order: string[] = [];
    const by: Record<string, MetricItem[]> = {};
    for (const m of items) {
      if (!by[m.group]) { by[m.group] = []; order.push(m.group); }
      by[m.group].push(m);
    }
    return order.map(name => ({ name, items: by[name] }));
  }

  statusKeys(d: Outcomes) { return Object.keys(d.status_definitions); }

  barH(n: number) {
    const max = Math.max(1, ...(this.data()?.daily ?? []).map((x: any) => x.tasks));
    return Math.max(3, (n / max) * 100);
  }

  failedChecks(r: any) {
    const bad = (r.checks || []).filter((c: any) => c.score < 1).map((c: any) => `${c.type}: ${c.note}`);
    return bad.length ? bad.join('; ') : 'all checks passed';
  }

  fmt(m: MetricItem): string {
    if (m.error) return 'error';
    const v = m.value;
    if (v === null || v === undefined) return '—';
    switch (m.unit) {
      case 'pct': return `${v.toFixed(1)}%`;
      case 'ms': return this.ms(v);
      case 'usd': return this.usd(v);
      case 'min': return `${v.toFixed(1)} min`;
      case 'h': return `${v.toFixed(1)} h`;
      case 'ratio': return v.toFixed(2);
      default: return Number.isInteger(v) ? `${v}` : v.toFixed(2);
    }
  }

  ms(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
  }

  usd(v: number): string {
    if (!v) return '$0';
    return v < 0.01 ? `$${v.toFixed(5)}` : `$${v.toFixed(3)}`;
  }
}
