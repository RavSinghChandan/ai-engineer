import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { DayPlan, Plan, Task, TrackingResult } from '../../models/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="!plan" class="alert alert-error">
      No plan found. <a routerLink="/mapping" style="color:inherit;font-weight:600;">Generate a plan first →</a>
    </div>

    <div *ngIf="plan">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px;">
        <div>
          <h1 style="margin-bottom:4px;">Preparation Dashboard</h1>
          <p style="color:var(--text-muted); font-size:14px;">
            Role: <strong>{{ plan.role }}</strong> &nbsp;·&nbsp;
            7-Day Roadmap
          </p>
        </div>
        <button class="btn btn-secondary" (click)="saveProgress()" [disabled]="saving">
          <span *ngIf="saving" class="spinner"></span>
          {{ saving ? 'Saving...' : '💾 Save Progress' }}
        </button>
      </div>

      <!-- Readiness Card -->
      <div class="card" *ngIf="tracking">
        <div class="readiness-header">
          <div>
            <h2>Readiness Score</h2>
            <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">{{ tracking.message }}</p>
          </div>
          <div class="big-score" [style.color]="scoreColor">
            {{ tracking.readiness_score }}%
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="progress-bar" style="height:14px;">
            <div class="progress-fill" [style.width.%]="tracking.readiness_score"
                 [style.background]="scoreColor"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-top:4px;">
            <span>{{ tracking.completed_count }} / {{ tracking.total_count }} tasks done</span>
            <span class="badge" [class]="statusBadgeClass">{{ tracking.status }}</span>
          </div>
        </div>

        <div *ngIf="tracking.next_suggested_task !== 'All tasks completed!'"
             style="margin-top:16px; padding:12px; background:var(--bg); border-radius:var(--radius); border-left:3px solid var(--primary);">
          <p style="font-size:12px; color:var(--text-muted); margin-bottom:2px;">NEXT TASK</p>
          <p style="font-size:14px; font-weight:500;">{{ tracking.next_suggested_task }}</p>
        </div>
      </div>

      <!-- Focus Skills -->
      <div class="card" *ngIf="plan.focus_skills.length">
        <h3 style="margin-bottom:10px;">Focus Skills</h3>
        <span *ngFor="let s of plan.focus_skills" class="tag">{{ s }}</span>
      </div>

      <!-- Day Plans -->
      <div *ngFor="let day of plan.plan" class="card day-card">
        <div class="day-header">
          <div class="day-badge">Day {{ day.day }}</div>
          <div>
            <h3>{{ day.theme }}</h3>
            <p style="font-size:12px; color:var(--text-muted);">
              {{ completedInDay(day) }} / {{ day.tasks.length }} tasks &nbsp;·&nbsp;
              {{ totalHoursInDay(day) }}h estimated
            </p>
          </div>
          <div class="day-progress">
            <div class="progress-bar" style="width:80px;">
              <div class="progress-fill"
                   [style.width.%]="(completedInDay(day)/day.tasks.length)*100"></div>
            </div>
          </div>
        </div>

        <div class="task-list">
          <div *ngFor="let task of day.tasks" class="task-item"
               [class.completed]="isCompleted(task.id)" (click)="toggleTask(task.id)">
            <div class="checkbox" [class.checked]="isCompleted(task.id)">
              <span *ngIf="isCompleted(task.id)">✓</span>
            </div>
            <div class="task-body">
              <div class="task-title">{{ task.title }}</div>
              <div class="task-meta">
                <span class="badge badge-blue">{{ task.skill }}</span>
                <span style="font-size:12px; color:var(--text-muted);">⏱ {{ task.hours }}h</span>
              </div>
              <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">{{ task.description }}</p>
              <a *ngIf="task.resource" [href]="task.resource" target="_blank"
                 style="font-size:12px; color:var(--primary);" (click)="$event.stopPropagation()">
                📚 Resource →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .readiness-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .big-score {
      font-size: 48px;
      font-weight: 800;
      line-height: 1;
    }
    .day-card { padding: 20px; }
    .day-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .day-badge {
      background: var(--primary);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 6px 14px;
      border-radius: 999px;
      flex-shrink: 0;
    }
    .day-progress { margin-left: auto; }
    .task-list { display: flex; flex-direction: column; gap: 10px; }
    .task-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.15s;
    }
    .task-item:hover { border-color: var(--primary); background: #eff6ff; }
    .task-item.completed { background: #f0fdf4; border-color: #86efac; }
    .checkbox {
      width: 22px;
      height: 22px;
      border: 2px solid var(--border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
      font-size: 13px;
      font-weight: 700;
    }
    .checkbox.checked { background: var(--success); border-color: var(--success); color: #fff; }
    .task-body { flex: 1; }
    .task-title { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    .task-meta { display: flex; align-items: center; gap: 8px; }
  `],
})
export class DashboardComponent implements OnInit {
  plan: Plan | null = null;
  tracking: TrackingResult | null = null;
  completedIds = new Set<string>();
  saving = false;

  constructor(
    public state: StateService,
    private api: ApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    if (this.state.plan) {
      this.plan = this.state.plan;
      this.loadSavedProgress();
    } else if (this.state.userId) {
      this.api.getProgress(this.state.userId).subscribe({
        next: (p) => {
          this.plan = p.plan;
          this.completedIds = new Set(p.completed_task_ids || []);
          this.refreshTracking();
        },
      });
    }
  }

  loadSavedProgress() {
    if (!this.state.userId) return;
    this.api.getProgress(this.state.userId).subscribe({
      next: (p) => {
        this.completedIds = new Set(p.completed_task_ids || []);
        this.refreshTracking();
      },
      error: () => this.refreshTracking(),
    });
  }

  isCompleted(id: string) { return this.completedIds.has(id); }

  toggleTask(id: string) {
    if (this.completedIds.has(id)) this.completedIds.delete(id);
    else this.completedIds.add(id);
    this.refreshTracking();
  }

  completedInDay(day: DayPlan) {
    return day.tasks.filter(t => this.completedIds.has(t.id)).length;
  }

  totalHoursInDay(day: DayPlan) {
    return day.tasks.reduce((sum, t) => sum + t.hours, 0);
  }

  get scoreColor() {
    const s = this.tracking?.readiness_score ?? 0;
    if (s >= 70) return 'var(--success)';
    if (s >= 40) return 'var(--warning)';
    return 'var(--danger)';
  }

  get statusBadgeClass() {
    const s = this.tracking?.status ?? '';
    if (s === 'Ready') return 'badge badge-green';
    if (s === 'Almost Ready') return 'badge badge-blue';
    if (s === 'In Progress') return 'badge badge-yellow';
    return 'badge';
  }

  refreshTracking() {
    if (!this.plan) return;
    const allTasks: Task[] = this.plan.plan.flatMap(d => d.tasks);
    const total = allTasks.length;
    const completed = allTasks.filter(t => this.completedIds.has(t.id)).length;
    const score = total ? Math.round((completed / total) * 100) : 0;

    const covered = [...new Set(allTasks.filter(t => this.completedIds.has(t.id)).map(t => t.skill))];
    const pending = [...new Set(allTasks.filter(t => !this.completedIds.has(t.id)).map(t => t.skill))];
    const nextTask = allTasks.find(t => !this.completedIds.has(t.id));

    let status: string;
    if (score === 0) status = 'Not Started';
    else if (score < 50) status = 'In Progress';
    else if (score < 85) status = 'Almost Ready';
    else status = 'Ready';

    this.tracking = {
      readiness_score: score,
      status,
      message: score === 100 ? '🎉 You are fully prepared!' : `Keep going — ${100 - score}% left to complete`,
      completed_count: completed,
      total_count: total,
      covered_skills: covered,
      pending_skills: pending,
      next_suggested_task: nextTask?.title ?? 'All tasks completed!',
    };
  }

  saveProgress() {
    if (!this.state.userId) return;
    this.saving = true;

    this.api.updateProgress(this.state.userId, [...this.completedIds]).subscribe({
      next: (res) => {
        this.tracking = res;
        this.saving = false;
      },
      error: () => { this.saving = false; },
    });
  }
}
