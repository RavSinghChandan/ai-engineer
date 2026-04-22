import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignService } from '../../services/campaign.service';
import { CampaignResult, LearningInsight } from '../../models/campaign.model';

@Component({
  selector: 'app-learning-insights',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-5 animate-fade-in">
      <div>
        <h2 class="section-title">Learning Insights</h2>
        <p class="text-xs text-gray-500 mt-0.5">How the AI is improving campaigns over time</p>
      </div>

      <!-- How it works -->
      <div class="glass-card">
        <div class="label-text mb-3">How Auto-Learning Works</div>
        <div class="grid grid-cols-4 gap-3">
          <div *ngFor="let step of howItWorks" class="text-center p-3 rounded-xl bg-white/5">
            <div class="text-2xl mb-2">{{ step.icon }}</div>
            <div class="text-xs font-semibold text-white">{{ step.title }}</div>
            <div class="text-xs text-gray-500 mt-1">{{ step.desc }}</div>
          </div>
        </div>
      </div>

      <!-- No data -->
      <div *ngIf="!insights.length && totalLearned < 2" class="glass-card text-center py-12">
        <div class="text-4xl mb-3">🧠</div>
        <div class="text-gray-400 font-medium">Not enough data yet</div>
        <div class="text-sm text-gray-600 mt-1">Run the same campaign type at least twice to see learning in action</div>
        <div *ngIf="totalLearned > 0" class="mt-3 badge-blue text-xs mx-auto w-fit">
          {{ totalLearned }} run{{ totalLearned > 1 ? 's' : '' }} stored — run once more to activate learning
        </div>
      </div>

      <!-- Insights per campaign type -->
      <div *ngFor="let ins of insights" class="glass-card animate-slide-up">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">{{ getCampaignEmoji(ins.campaign_type) }}</span>
            <div>
              <div class="font-bold text-white capitalize">{{ ins.campaign_type.replace('_', ' ') }}</div>
              <div class="text-xs text-gray-500">{{ ins.runs }} campaigns analyzed</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold"
                 [class]="ins.roi_improvement > 0 ? 'text-emerald-400' : 'text-red-400'">
              {{ ins.roi_improvement > 0 ? '+' : '' }}{{ ins.roi_improvement | number:'1.2-2' }}x ROI
            </div>
            <div class="text-xs text-gray-500">improvement</div>
          </div>
        </div>

        <!-- Metric bars -->
        <div class="space-y-3 mb-4">
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-400">CTR Improvement</span>
              <span [class]="ins.ctr_improvement >= 0 ? 'text-emerald-400' : 'text-red-400'">
                {{ ins.ctr_improvement >= 0 ? '+' : '' }}{{ ins.ctr_improvement | number:'1.2-2' }}%
              </span>
            </div>
            <div class="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full rounded-full bg-indigo-500 transition-all duration-700"
                   [style.width.%]="Math.min(Math.abs(ins.ctr_improvement) * 20, 100)"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-400">Latest ROI Score</span>
              <span class="text-white font-semibold">{{ ins.latest_roi | number:'1.2-2' }}x</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full rounded-full bg-emerald-500 transition-all duration-700"
                   [style.width.%]="Math.min(ins.latest_roi * 25, 100)"></div>
            </div>
          </div>
        </div>

        <!-- Best config -->
        <div class="grid grid-cols-2 gap-2">
          <div class="p-3 rounded-xl bg-white/5">
            <div class="label-text mb-1">Best Ad Tone</div>
            <div class="text-sm font-semibold text-indigo-300 capitalize">{{ ins.best_tone.replace('_', ' ') }}</div>
          </div>
          <div class="p-3 rounded-xl bg-white/5">
            <div class="label-text mb-1">Best Bid Strategy</div>
            <div class="text-sm font-semibold text-purple-300 capitalize">{{ ins.best_strategy.replace('_', ' ') }}</div>
          </div>
        </div>
      </div>

      <!-- Run-by-run log -->
      <div *ngIf="allRuns.length > 0" class="glass-card">
        <div class="label-text mb-3">Run-by-Run Log</div>
        <div class="space-y-2">
          <div *ngFor="let run of allRuns; let i = index"
               class="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                 [class]="run.learning_applied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'">
              {{ i + 1 }}
            </div>
            <div class="flex-1">
              <div class="text-sm font-medium text-white">{{ run.campaign_name }}</div>
              <div class="text-xs text-gray-500">
                {{ run.learning_applied ? '🧠 Learning applied' : '🌱 Baseline run' }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm font-bold" [class]="getRoiColor(run.metrics.roi_score)">
                {{ run.metrics.roi_score | number:'1.2-2' }}x ROI
              </div>
              <div class="text-xs text-gray-500">CTR: {{ run.metrics.ctr | number:'1.1-2' }}%</div>
            </div>
            <div *ngIf="run.improvement_percentage" class="badge-green text-xs">
              +{{ run.improvement_percentage }}%
            </div>
          </div>
        </div>
      </div>

      <!-- System message -->
      <div class="glass-card border-indigo-500/20 bg-indigo-500/5">
        <div class="flex items-center gap-3">
          <span class="text-2xl">⚡</span>
          <div>
            <div class="text-sm font-semibold text-indigo-300">This system improves automatically over time</div>
            <div class="text-xs text-gray-500 mt-0.5">
              Powered by LangGraph — each campaign run updates the memory store, enabling smarter decisions on future runs.
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LearningInsightsComponent implements OnInit {
  insights: LearningInsight[] = [];
  totalLearned = 0;
  allRuns: CampaignResult[] = [];
  Math = Math;

  howItWorks = [
    { icon: '📥', title: 'Collect', desc: 'Every run stores campaign inputs, agent decisions, and results' },
    { icon: '🔍', title: 'Compare', desc: 'Similarity matching finds related past campaigns' },
    { icon: '🧮', title: 'Analyze', desc: 'Rule-based engine identifies what worked and what did not' },
    { icon: '🚀', title: 'Improve', desc: 'Next run applies learned optimizations automatically' },
  ];

  constructor(private campaignSvc: CampaignService) {}

  ngOnInit(): void {
    this.loadInsights();
    this.campaignSvc.allRuns$.subscribe(runs => (this.allRuns = runs));
    this.campaignSvc.result$.subscribe(() => this.loadInsights());
  }

  loadInsights(): void {
    this.campaignSvc.getLearningInsights().subscribe(data => {
      this.insights = data.insights;
      this.totalLearned = data.total_learned;
    });
  }

  getCampaignEmoji(type: string): string {
    const m: Record<string, string> = { real_estate: '🏠', coaching: '📚', ecommerce: '🛍️', custom: '⚙️' };
    return m[type] ?? '📢';
  }

  getRoiColor(roi: number): string {
    if (roi >= 2.5) return 'text-emerald-400';
    if (roi >= 1.5) return 'text-indigo-400';
    return 'text-amber-400';
  }
}
