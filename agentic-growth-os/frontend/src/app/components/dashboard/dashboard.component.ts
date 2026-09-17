import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CampaignService } from '../../services/campaign.service';
import { CampaignResult } from '../../models/campaign.model';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-5 animate-fade-in">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="section-title">Campaign Dashboard</h2>
          <p class="text-xs text-slate-500 mt-0.5">Real-time metrics from the last workflow execution</p>
        </div>
        <button (click)="clearMemory()" class="btn-danger text-xs py-1.5 px-3">🗑 Clear Memory</button>
      </div>

      <!-- No results -->
      <div *ngIf="!result" class="glass-card text-center py-16">
        <div class="text-4xl mb-4">📊</div>
        <div class="text-slate-500 font-medium">No campaign data yet</div>
        <div class="text-slate-500 text-sm mt-1">Run a workflow to see results here</div>
      </div>

      <ng-container *ngIf="result">
        <!-- Provenance: says plainly that these are projections, not measured data -->
        <div *ngIf="result.provenance" class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <span class="badge badge-amber">{{ result.provenance.label }}</span>
          <span class="text-xs text-amber-900/80">{{ result.provenance.basis }}</span>
          <span *ngIf="result.provenance.deterministic" class="badge badge-blue">Deterministic — same input, same output</span>
          <span class="badge" [class]="result.copy_source === 'deepseek' ? 'badge-green' : 'badge-purple'">
            Ad copy: {{ result.copy_source === 'deepseek' ? 'DeepSeek (live)' : 'template library' }}
          </span>
          <button (click)="showFormula = !showFormula"
                  class="ml-auto text-xs font-semibold text-amber-900 underline underline-offset-2">
            {{ showFormula ? 'Hide' : 'Show' }} formula
          </button>
          <div *ngIf="showFormula" class="w-full mt-1 rounded-lg bg-white/70 border border-amber-200 p-3">
            <div *ngFor="let line of result.provenance.formula"
                 class="font-mono text-[11px] leading-5 text-slate-700">{{ line }}</div>
          </div>
        </div>

        <!-- Learning banner -->
        <div *ngIf="result.learning_summary" class="rounded-xl p-4 border"
             [class]="learningTone.box">
          <div class="flex items-start gap-3">
            <span class="text-2xl">{{ learningTone.icon }}</span>
            <div class="flex-1">
              <div class="font-semibold text-sm" [class]="learningTone.text">
                {{ learningTone.title }}
              </div>
              <div class="text-xs text-slate-700 mt-0.5">{{ result.learning_summary.message }}</div>
              <div *ngIf="result.learning_summary.changes_applied?.length" class="mt-2 space-y-0.5">
                <div *ngFor="let c of result.learning_summary.changes_applied"
                     class="text-xs flex items-center gap-1.5" [class]="learningTone.text">
                  <span>→</span> {{ c }}
                </div>
              </div>
            </div>
            <div *ngIf="result.improvement_percentage"
                 class="text-2xl font-bold"
                 [class]="result.improvement_percentage > 0 ? 'text-emerald-600' : 'text-red-600'">
              {{ result.improvement_percentage > 0 ? '+' : '' }}{{ result.improvement_percentage }}%
            </div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="metric-card">
            <div class="label-text">CTR</div>
            <div class="text-2xl font-bold text-slate-900">{{ result.metrics.ctr | number:'1.1-2' }}%</div>
            <div *ngIf="prev && prev.metrics" class="text-xs"
                 [class]="result.metrics.ctr > prev.metrics.ctr ? 'text-emerald-600' : 'text-red-600'">
              {{ result.metrics.ctr > prev.metrics.ctr ? '▲' : '▼' }}
              {{ (result.metrics.ctr - prev.metrics.ctr) | number:'1.2-2' }}% vs prev
            </div>
          </div>
          <div class="metric-card">
            <div class="label-text">Conversion Rate</div>
            <div class="text-2xl font-bold text-slate-900">{{ result.metrics.conversion_rate | number:'1.1-2' }}%</div>
            <div *ngIf="prev && prev.metrics" class="text-xs"
                 [class]="result.metrics.conversion_rate > prev.metrics.conversion_rate ? 'text-emerald-600' : 'text-red-600'">
              {{ result.metrics.conversion_rate > prev.metrics.conversion_rate ? '▲' : '▼' }}
              {{ (result.metrics.conversion_rate - prev.metrics.conversion_rate) | number:'1.2-2' }}% vs prev
            </div>
          </div>
          <div class="metric-card">
            <div class="label-text">ROI (contribution)</div>
            <div class="text-2xl font-bold" [class]="getRoiColor(result.metrics.roi_score)">
              {{ result.metrics.roi_score | number:'1.2-2' }}x
            </div>
            <div class="text-xs text-slate-500">
              {{ result.metrics.roas | number:'1.2-2' }}x ROAS at {{ result.metrics.gross_margin_pct }}% margin
            </div>
            <div class="badge mt-1" [class]="getGradeBadge(result.performance_grade)">
              Grade: {{ result.performance_grade }}
            </div>
            <div *ngIf="result.low_volume" class="text-[11px] text-amber-700 mt-1 leading-4">
              Low volume — grade swings on a single sale
            </div>
          </div>
          <div class="metric-card">
            <div class="label-text">Cost per Sale</div>
            <div class="text-2xl font-bold text-slate-900">₹{{ result.metrics.cost_per_conversion | number:'1.0-0' }}</div>
            <div class="text-xs text-slate-500">₹{{ result.metrics.cost_per_lead | number:'1.0-0' }} per lead</div>
          </div>
        </div>

        <!-- Before / After comparison -->
        <div *ngIf="prev && prev.metrics" class="glass-card">
          <div class="section-title mb-4 text-base">Before vs After Learning</div>
          <div class="grid grid-cols-3 gap-4">
            <div *ngFor="let metric of comparisonMetrics" class="text-center">
              <div class="label-text mb-2">{{ metric.label }}</div>
              <div class="flex items-end justify-center gap-3">
                <div class="text-center">
                  <div class="text-xs text-slate-500 mb-1">Before</div>
                  <div class="text-lg font-bold text-slate-500">{{ metric.before }}</div>
                </div>
                <div class="text-indigo-600 text-lg pb-1">→</div>
                <div class="text-center">
                  <div class="text-xs text-emerald-600 mb-1">After</div>
                  <div class="text-lg font-bold text-emerald-600">{{ metric.after }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Funnel: where the budget actually goes -->
        <div class="glass-card">
          <div class="flex items-baseline justify-between mb-3">
            <div class="label-text">Projected Funnel</div>
            <div class="text-xs text-slate-500">
              {{ result.metrics.lead_to_sale_rate | number:'1.0-1' }}% of leads close · log scale
            </div>
          </div>
          <div class="space-y-2">
            <div *ngFor="let step of funnelSteps">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-700">{{ step.label }}</span>
                <span class="font-semibold text-slate-900">{{ step.value | number }}</span>
              </div>
              <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700"
                     [style.width.%]="step.pct" [style.background]="step.color"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chart + AI Insights -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Chart -->
          <div class="glass-card">
            <div class="label-text mb-3">Budget Allocation</div>
            <div class="relative" style="height: 200px;">
              <canvas #budgetChart></canvas>
            </div>
          </div>

          <!-- AI Insights -->
          <div class="glass-card overflow-y-auto" style="max-height: 280px;">
            <div class="label-text mb-3">🤖 AI Insights</div>
            <div class="space-y-2">
              <div *ngFor="let insight of result.ai_insights.slice(0,8)"
                   class="flex items-start gap-2 text-xs">
                <span class="text-indigo-600 mt-0.5 flex-shrink-0">›</span>
                <span class="text-slate-700">{{ insight }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 30-day forecast -->
        <div class="glass-card">
          <div class="label-text mb-3">30-Day Forecast</div>
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-slate-900">{{ result.forecast_30_days.projected_conversions | number }}</div>
              <div class="text-xs text-slate-500 mt-0.5">Projected Conversions</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-indigo-600">₹{{ (result.forecast_30_days.projected_revenue / 100000) | number:'1.1-1' }}L</div>
              <div class="text-xs text-slate-500 mt-0.5">
                Gross Revenue · ₹{{ (result.forecast_30_days.projected_gross_profit / 100000) | number:'1.1-1' }}L margin
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold" [class]="getRoiColor(result.forecast_30_days.projected_roi)">{{ result.forecast_30_days.projected_roi | number:'1.2-2' }}x</div>
              <div class="text-xs text-slate-500 mt-0.5">
                Contribution ROI on ₹{{ (result.forecast_30_days.projected_ad_spend / 100000) | number:'1.1-1' }}L spend
              </div>
            </div>
          </div>
        </div>

        <!-- Run history -->
        <div *ngIf="allRuns.length > 1" class="glass-card">
          <div class="label-text mb-3">Run History ({{ allRuns.length }} runs)</div>
          <div class="relative" style="height: 160px;">
            <canvas #historyChart></canvas>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('budgetChart') budgetChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('historyChart') historyChartRef!: ElementRef<HTMLCanvasElement>;

  result: CampaignResult | null = null;
  prev:   CampaignResult | null = null;
  allRuns: CampaignResult[] = [];
  comparisonMetrics: { label: string; before: string; after: string }[] = [];

  private subs = new Subscription();
  private budgetChartInst: Chart | null = null;
  private historyChartInst: Chart | null = null;
  private viewReady = false;
  showFormula = false;
  funnelSteps: { label: string; value: number; pct: number; color: string }[] = [];

  constructor(private campaignSvc: CampaignService) {}

  ngOnInit(): void {
    this.subs.add(this.campaignSvc.result$.subscribe(r => {
      this.result = r;
      this.buildComparison();
      this.buildFunnel();
      if (this.viewReady) { this.drawBudgetChart(); this.drawHistoryChart(); }
    }));
    this.subs.add(this.campaignSvc.prev$.subscribe(p => { this.prev = p; this.buildComparison(); }));
    this.subs.add(this.campaignSvc.allRuns$.subscribe(runs => {
      this.allRuns = runs;
      if (this.viewReady) this.drawHistoryChart();
    }));
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.drawBudgetChart();
    this.drawHistoryChart();
  }
  ngOnDestroy(): void { this.subs.unsubscribe(); this.budgetChartInst?.destroy(); this.historyChartInst?.destroy(); }

  get learningTone(): { box: string; text: string; icon: string; title: string } {
    switch (this.result?.learning_summary?.type) {
      case 'improved':
        return { box: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: '🧠', title: 'Auto-Learning Applied' };
      case 'regressed':
        return { box: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: '📉', title: 'Learning Run — Below Baseline' };
      case 'flat':
        return { box: 'bg-slate-50 border-slate-200', text: 'text-slate-700', icon: '➖', title: 'Learning Run — No Change' };
      default:
        return { box: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', icon: '🌱', title: 'Baseline Established' };
    }
  }

  buildFunnel(): void {
    if (!this.result) { this.funnelSteps = []; return; }
    const m = this.result.metrics;
    // Widths are relative to impressions, the widest stage, so the drop-off
    // between stages is visible at a glance.
    const top = Math.max(m.impressions, 1);
    // A marketing funnel spans orders of magnitude (58k impressions -> 2 sales),
    // so linear widths collapse every stage after the first into a sliver. Bars
    // are scaled logarithmically to stay readable; the exact counts are printed
    // beside each bar, which is what anyone actually reads the number from.
    const scale = (v: number) => (v <= 0 ? 0 : Math.log10(v + 1) / Math.log10(top + 1));
    this.funnelSteps = [
      { label: 'Impressions', value: m.impressions,  color: '#c7d2fe' },
      { label: 'Clicks',      value: m.clicks,       color: '#818cf8' },
      { label: 'Leads',       value: m.leads,        color: '#6366f1' },
      { label: 'Sales',       value: m.conversions,  color: '#10b981' },
    ].map(step => ({
      ...step,
      pct: Math.max(scale(step.value) * 100, step.value > 0 ? 2 : 0),
    }));
  }

  buildComparison(): void {
    if (!this.result || !this.prev) { this.comparisonMetrics = []; return; }
    this.comparisonMetrics = [
      { label: 'CTR',             before: `${this.prev.metrics.ctr.toFixed(2)}%`,             after: `${this.result.metrics.ctr.toFixed(2)}%` },
      { label: 'Conversion Rate', before: `${this.prev.metrics.conversion_rate.toFixed(2)}%`, after: `${this.result.metrics.conversion_rate.toFixed(2)}%` },
      { label: 'ROI Score',       before: `${this.prev.metrics.roi_score.toFixed(2)}x`,        after: `${this.result.metrics.roi_score.toFixed(2)}x` },
    ];
  }

  drawBudgetChart(): void {
    setTimeout(() => {
      if (!this.budgetChartRef || !this.result) return;
      this.budgetChartInst?.destroy();
      const decisions = this.result.agent_decisions as Record<string, Record<string, number>>;
      const split = decisions?.['budget_split'] as Record<string, number> ?? {};
      const labels = Object.keys(split).map(k => k.replace('_', ' ').toUpperCase());
      const values = Object.values(split).map(v => Math.round(v * 100));
      this.budgetChartInst = new Chart(this.budgetChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: ['#6366f1', '#06b6d4', '#10b981'], borderWidth: 0, hoverOffset: 6 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#475569', font: { size: 11 }, padding: 12 } } }, cutout: '65%' },
      });
    }, 100);
  }

  drawHistoryChart(): void {
    setTimeout(() => {
      if (!this.historyChartRef || this.allRuns.length < 2) return;
      this.historyChartInst?.destroy();
      const labels = this.allRuns.map((_, i) => `Run ${i + 1}`);
      this.historyChartInst = new Chart(this.historyChartRef.nativeElement, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'ROI', data: this.allRuns.map(r => r.metrics.roi_score), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#6366f1' },
            { label: 'CTR', data: this.allRuns.map(r => r.metrics.ctr), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#10b981' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#475569', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(15,23,42,0.07)' } },
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(15,23,42,0.07)' } },
          },
        },
      });
    }, 100);
  }

  clearMemory(): void {
    this.campaignSvc.clearMemory().subscribe(() => {
      this.campaignSvc.clearResults();
      this.budgetChartInst?.destroy();
      this.historyChartInst?.destroy();
    });
  }

  getRoiColor(roi: number): string {
    if (roi >= 2.0) return 'text-emerald-600';
    if (roi >= 0.5) return 'text-indigo-600';
    if (roi >= 0) return 'text-amber-600';
    return 'text-red-600';
  }

  getGradeBadge(grade: string): string {
    if (['A+', 'A'].includes(grade)) return 'badge-green';
    if (['B+', 'B'].includes(grade)) return 'badge-blue';
    return 'badge-amber';
  }
}
