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
          <p class="text-xs text-gray-500 mt-0.5">Real-time metrics from the last workflow execution</p>
        </div>
        <button (click)="clearMemory()" class="btn-danger text-xs py-1.5 px-3">🗑 Clear Memory</button>
      </div>

      <!-- No results -->
      <div *ngIf="!result" class="glass-card text-center py-16">
        <div class="text-4xl mb-4">📊</div>
        <div class="text-gray-400 font-medium">No campaign data yet</div>
        <div class="text-gray-600 text-sm mt-1">Run a workflow to see results here</div>
      </div>

      <ng-container *ngIf="result">
        <!-- Learning banner -->
        <div *ngIf="result.learning_summary" class="rounded-xl p-4 border"
             [class]="result.learning_summary.type === 'improved'
               ? 'bg-emerald-500/10 border-emerald-500/30'
               : 'bg-indigo-500/10 border-indigo-500/30'">
          <div class="flex items-start gap-3">
            <span class="text-2xl">{{ result.learning_summary.type === 'improved' ? '🧠' : '🌱' }}</span>
            <div class="flex-1">
              <div class="font-semibold text-sm"
                   [class]="result.learning_summary.type === 'improved' ? 'text-emerald-400' : 'text-indigo-400'">
                {{ result.learning_summary.type === 'improved' ? 'Auto-Learning Applied!' : 'Baseline Established' }}
              </div>
              <div class="text-xs text-gray-300 mt-0.5">{{ result.learning_summary.message }}</div>
              <div *ngIf="result.learning_summary.changes_applied?.length" class="mt-2 space-y-0.5">
                <div *ngFor="let c of result.learning_summary.changes_applied"
                     class="text-xs text-emerald-300 flex items-center gap-1.5">
                  <span>→</span> {{ c }}
                </div>
              </div>
            </div>
            <div *ngIf="result.improvement_percentage"
                 class="text-2xl font-bold text-emerald-400">
              +{{ result.improvement_percentage }}%
            </div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="metric-card">
            <div class="label-text">CTR</div>
            <div class="text-2xl font-bold text-white">{{ result.metrics.ctr | number:'1.1-2' }}%</div>
            <div *ngIf="prev && prev.metrics" class="text-xs"
                 [class]="result.metrics.ctr > prev.metrics.ctr ? 'text-emerald-400' : 'text-red-400'">
              {{ result.metrics.ctr > prev.metrics.ctr ? '▲' : '▼' }}
              {{ (result.metrics.ctr - prev.metrics.ctr) | number:'1.2-2' }}% vs prev
            </div>
          </div>
          <div class="metric-card">
            <div class="label-text">Conversion Rate</div>
            <div class="text-2xl font-bold text-white">{{ result.metrics.conversion_rate | number:'1.1-2' }}%</div>
            <div *ngIf="prev && prev.metrics" class="text-xs"
                 [class]="result.metrics.conversion_rate > prev.metrics.conversion_rate ? 'text-emerald-400' : 'text-red-400'">
              {{ result.metrics.conversion_rate > prev.metrics.conversion_rate ? '▲' : '▼' }}
              {{ (result.metrics.conversion_rate - prev.metrics.conversion_rate) | number:'1.2-2' }}% vs prev
            </div>
          </div>
          <div class="metric-card">
            <div class="label-text">ROI Score</div>
            <div class="text-2xl font-bold" [class]="getRoiColor(result.metrics.roi_score)">
              {{ result.metrics.roi_score | number:'1.2-2' }}x
            </div>
            <div class="badge mt-1" [class]="getGradeBadge(result.performance_grade)">
              Grade: {{ result.performance_grade }}
            </div>
          </div>
          <div class="metric-card">
            <div class="label-text">Conversions</div>
            <div class="text-2xl font-bold text-white">{{ result.metrics.conversions | number }}</div>
            <div class="text-xs text-gray-500">{{ result.metrics.impressions | number }} impressions</div>
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
                  <div class="text-xs text-gray-500 mb-1">Before</div>
                  <div class="text-lg font-bold text-gray-400">{{ metric.before }}</div>
                </div>
                <div class="text-indigo-400 text-lg pb-1">→</div>
                <div class="text-center">
                  <div class="text-xs text-emerald-400 mb-1">After</div>
                  <div class="text-lg font-bold text-emerald-400">{{ metric.after }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chart + AI Insights -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Chart -->
          <div class="glass-card">
            <div class="label-text mb-3">Budget Allocation</div>
            <canvas #budgetChart style="max-height: 200px;"></canvas>
          </div>

          <!-- AI Insights -->
          <div class="glass-card overflow-y-auto" style="max-height: 280px;">
            <div class="label-text mb-3">🤖 AI Insights</div>
            <div class="space-y-2">
              <div *ngFor="let insight of result.ai_insights.slice(0,8)"
                   class="flex items-start gap-2 text-xs">
                <span class="text-indigo-400 mt-0.5 flex-shrink-0">›</span>
                <span class="text-gray-300">{{ insight }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 30-day forecast -->
        <div class="glass-card">
          <div class="label-text mb-3">30-Day Forecast</div>
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-white">{{ result.forecast_30_days.projected_conversions | number }}</div>
              <div class="text-xs text-gray-500 mt-0.5">Projected Conversions</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-indigo-400">₹{{ (result.forecast_30_days.projected_revenue / 100000) | number:'1.1-1' }}L</div>
              <div class="text-xs text-gray-500 mt-0.5">Projected Revenue</div>
            </div>
            <div>
              <div class="text-2xl font-bold" [class]="getRoiColor(result.forecast_30_days.projected_roi)">{{ result.forecast_30_days.projected_roi | number:'1.2-2' }}x</div>
              <div class="text-xs text-gray-500 mt-0.5">Projected ROI</div>
            </div>
          </div>
        </div>

        <!-- Run history -->
        <div *ngIf="allRuns.length > 1" class="glass-card">
          <div class="label-text mb-3">Run History ({{ allRuns.length }} runs)</div>
          <canvas #historyChart style="max-height: 160px;"></canvas>
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

  constructor(private campaignSvc: CampaignService) {}

  ngOnInit(): void {
    this.subs.add(this.campaignSvc.result$.subscribe(r => {
      this.result = r;
      this.buildComparison();
      if (this.viewReady) { this.drawBudgetChart(); this.drawHistoryChart(); }
    }));
    this.subs.add(this.campaignSvc.prev$.subscribe(p => { this.prev = p; this.buildComparison(); }));
    this.subs.add(this.campaignSvc.allRuns$.subscribe(runs => {
      this.allRuns = runs;
      if (this.viewReady) this.drawHistoryChart();
    }));
  }

  ngAfterViewInit(): void { this.viewReady = true; }
  ngOnDestroy(): void { this.subs.unsubscribe(); this.budgetChartInst?.destroy(); this.historyChartInst?.destroy(); }

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
        options: { plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 }, padding: 12 } } }, cutout: '65%' },
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
          plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' } },
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
    if (roi >= 2.5) return 'text-emerald-400';
    if (roi >= 1.5) return 'text-indigo-400';
    return 'text-amber-400';
  }

  getGradeBadge(grade: string): string {
    if (['A+', 'A'].includes(grade)) return 'badge-green';
    if (['B+', 'B'].includes(grade)) return 'badge-blue';
    return 'badge-amber';
  }
}
