import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { DayPlan, Plan, Role, RoleMapping, StreamEvent } from '../../models/types';

@Component({
  selector: 'app-role-mapping',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 style="margin-bottom:8px;">Role Mapping</h1>
    <p style="color:var(--text-muted); margin-bottom:24px;">
      Select a target role — AI will compare your skills and identify gaps using Hybrid RAG (BM25 + FAISS + HyDE).
    </p>

    <div *ngIf="!state.userId" class="alert alert-error">
      Please upload your CV first.
      <a href="/upload" style="color:inherit;font-weight:600;">Go to Upload →</a>
    </div>

    <div *ngIf="state.userId" class="card">
      <label>Select Target Role</label>
      <select [(ngModel)]="selectedRole" [disabled]="loading">
        <option value="">-- Choose a role --</option>
        <option *ngFor="let r of roles" [value]="r.title">{{ r.title }}</option>
      </select>
      <p *ngIf="selectedRoleDesc"
         style="font-size:13px; color:var(--text-muted); margin-top:8px;">
        {{ selectedRoleDesc }}
      </p>

      <div *ngIf="error" class="alert alert-error" style="margin-top:16px;">{{ error }}</div>

      <button class="btn btn-primary" style="margin-top:20px;"
              [disabled]="!selectedRole || loading" (click)="mapRole()">
        <span *ngIf="loading" class="spinner"></span>
        {{ loading ? 'Analysing with Hybrid RAG + HyDE...' : 'Analyse Fit' }}
      </button>
    </div>

    <!-- ── Analysis result ──────────────────────────────────────────────── -->
    <div *ngIf="mapping" class="card">
      <div class="match-header">
        <div>
          <h2>{{ mapping.role }}</h2>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">
            {{ mapping.recommendation }}
          </p>
          <!-- Enterprise metadata badges -->
          <div class="meta-badges" style="margin-top:10px;">
            <span *ngIf="mapping.retrieval_method" class="meta-badge badge-blue">
              RAG: {{ mapping.retrieval_method }}
            </span>
            <span *ngIf="mapping.readiness_level" class="meta-badge"
                  [ngClass]="readinessBadgeClass">
              {{ mapping.readiness_level }}
            </span>
            <span *ngIf="mapping._cache_hit" class="meta-badge badge-purple">
              Cache Hit
            </span>
            <span *ngIf="mapping.prompt_version" class="meta-badge badge-gray">
              {{ mapping.prompt_version }}
            </span>
          </div>
        </div>
        <div class="score-ring" [class]="scoreClass">
          {{ mapping.match_percentage }}%
        </div>
      </div>

      <!-- Faithfulness bar -->
      <div *ngIf="mapping.faithfulness_score !== undefined" class="faithfulness-row">
        <span class="faith-label">RAG Faithfulness</span>
        <div class="faith-bar">
          <div class="faith-fill"
               [style.width.%]="(mapping.faithfulness_score || 0) * 100"
               [style.background]="faithColor"></div>
        </div>
        <span class="faith-score" [style.color]="faithColor">
          {{ ((mapping.faithfulness_score || 0) * 100).toFixed(0) }}%
        </span>
        <span *ngIf="mapping._faithfulness_warning" class="faith-warn" title="{{ mapping._faithfulness_warning }}">
          ⚠
        </span>
      </div>

      <div style="margin-top:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:13px;">Match Score</span>
          <span style="font-size:13px; font-weight:600;">{{ mapping.match_percentage }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill"
               [style.width.%]="mapping.match_percentage"
               [style.background]="scoreColor"></div>
        </div>
      </div>

      <div class="skills-grid" style="margin-top:24px;">
        <div>
          <h3 style="color:var(--success); margin-bottom:10px;">✅ Skills You Have</h3>
          <span *ngFor="let s of mapping.matched_skills"
                class="badge badge-green" style="margin:3px;">{{ s }}</span>
          <p *ngIf="!mapping.matched_skills.length"
             style="color:var(--text-muted); font-size:13px;">None matched</p>
        </div>
        <div>
          <h3 style="color:var(--danger); margin-bottom:10px;">❌ Missing Skills</h3>
          <span *ngFor="let s of mapping.missing_skills"
                class="badge badge-red" style="margin:3px;">{{ s }}</span>
          <p *ngIf="!mapping.missing_skills.length"
             style="color:var(--text-muted); font-size:13px;">No gaps! 🎉</p>
        </div>
      </div>

      <!-- ── Days chooser ──────────────────────────────────────────────── -->
      <div class="days-chooser" style="margin-top:28px;">
        <div class="days-header">
          <span class="days-icon">🗓</span>
          <div>
            <h3 style="margin-bottom:2px;">Preparation Timeline</h3>
            <p style="font-size:13px; color:var(--text-muted);">
              How many days do you want to be project-ready?
            </p>
          </div>
          <div class="days-badge">{{ numDays }} days</div>
        </div>

        <div class="slider-row">
          <span class="slider-label">3</span>
          <input type="range" min="3" max="30" step="1"
                 [(ngModel)]="numDays" class="days-slider"/>
          <span class="slider-label">30</span>
        </div>

        <div class="days-meta">
          <div class="days-meta-item">
            <span class="days-meta-value">~{{ estimatedTasks }}</span>
            <span class="days-meta-key">Total Tasks</span>
          </div>
          <div class="days-meta-item">
            <span class="days-meta-value">~{{ hoursPerDay }}h</span>
            <span class="days-meta-key">Per Day</span>
          </div>
          <div class="days-meta-item">
            <span class="days-meta-value">{{ totalHours }}h</span>
            <span class="days-meta-key">Total Study</span>
          </div>
          <div class="days-meta-item">
            <span class="days-meta-value" [style.color]="paceColor">{{ pace }}</span>
            <span class="days-meta-key">Pace</span>
          </div>
        </div>
      </div>

      <div style="margin-top:24px; display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn btn-primary"
                [disabled]="generatingPlan" (click)="generatePlan()">
          <span *ngIf="generatingPlan" class="spinner"></span>
          {{ generatingPlan
              ? 'Streaming day ' + streamDaysReceived + ' of ' + numDays + '...'
              : '🗓 Generate ' + numDays + '-Day Plan (Streaming)' }}
        </button>
        <button class="btn btn-secondary"
                (click)="mapping = null; selectedRole = ''">
          Try Another Role
        </button>
      </div>

      <!-- Streaming progress -->
      <div *ngIf="generatingPlan && streamDaysReceived > 0" class="stream-progress">
        <div class="stream-bar">
          <div class="stream-fill"
               [style.width.%]="(streamDaysReceived / numDays) * 100"></div>
        </div>
        <div class="stream-days">
          <span *ngFor="let d of streamedDayNumbers" class="stream-day-dot done"></span>
          <span *ngFor="let d of remainingDays" class="stream-day-dot pending"></span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-top:6px;">
          Generating day {{ streamDaysReceived }} of {{ numDays }}...
        </p>
      </div>
    </div>
  `,
  styles: [`
    .match-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .score-ring {
      min-width: 72px; height: 72px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700;
      border: 4px solid;
      flex-shrink: 0;
    }
    .score-high { border-color: var(--success); color: var(--success); }
    .score-mid  { border-color: var(--warning); color: var(--warning); }
    .score-low  { border-color: var(--danger);  color: var(--danger);  }
    .skills-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

    /* Meta badges */
    .meta-badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .meta-badge {
      font-size: 11px; font-weight: 600;
      padding: 2px 8px; border-radius: 999px;
      border: 1px solid transparent;
    }
    .badge-blue   { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
    .badge-green  { background: #dcfce7; color: #15803d; border-color: #bbf7d0; }
    .badge-yellow { background: #fef9c3; color: #854d0e; border-color: #fde68a; }
    .badge-red    { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; border-color: #d8b4fe; }
    .badge-gray   { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }

    /* Faithfulness row */
    .faithfulness-row {
      display: flex; align-items: center; gap: 10px;
      margin-top: 14px; padding: 10px 14px;
      background: #f8fafc; border-radius: var(--radius);
      border: 1px solid var(--border);
    }
    .faith-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; font-weight: 600; min-width: 110px; }
    .faith-bar   { flex: 1; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .faith-fill  { height: 100%; border-radius: 999px; transition: width 0.5s ease; }
    .faith-score { font-size: 13px; font-weight: 700; min-width: 38px; text-align: right; }
    .faith-warn  { font-size: 16px; cursor: help; }

    /* Days chooser */
    .days-chooser {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .days-header {
      display: flex; align-items: center; gap: 14px; margin-bottom: 20px;
    }
    .days-icon { font-size: 28px; }
    .days-badge {
      margin-left: auto;
      background: var(--primary); color: #fff;
      font-size: 22px; font-weight: 800;
      padding: 6px 18px; border-radius: var(--radius);
      min-width: 90px; text-align: center;
    }
    .slider-row {
      display: flex; align-items: center; gap: 12px;
    }
    .slider-label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
    .days-slider {
      flex: 1; height: 6px; cursor: pointer;
      accent-color: var(--primary);
    }
    .days-meta {
      display: grid; grid-template-columns: repeat(4,1fr);
      gap: 12px; margin-top: 20px;
    }
    .days-meta-item {
      display: flex; flex-direction: column;
      align-items: center; gap: 4px;
      padding: 12px; background: #fff;
      border: 1px solid var(--border); border-radius: var(--radius);
    }
    .days-meta-value { font-size: 18px; font-weight: 700; }
    .days-meta-key   { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }

    /* Streaming progress */
    .stream-progress { margin-top: 16px; }
    .stream-bar {
      height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-bottom: 10px;
    }
    .stream-fill {
      height: 100%; background: var(--primary);
      border-radius: 999px; transition: width 0.3s ease;
    }
    .stream-days { display: flex; gap: 4px; flex-wrap: wrap; }
    .stream-day-dot {
      width: 10px; height: 10px; border-radius: 50%;
    }
    .stream-day-dot.done    { background: var(--primary); }
    .stream-day-dot.pending { background: #e2e8f0; }
  `],
})
export class RoleMappingComponent implements OnInit, OnDestroy {
  roles: Role[] = [];
  selectedRole = '';
  mapping: RoleMapping | null = null;
  loading = false;
  generatingPlan = false;
  error = '';
  numDays = 7;

  // Streaming state
  streamDaysReceived = 0;
  private streamedDays: DayPlan[] = [];
  private streamSubscription: any = null;

  constructor(
    public state: StateService,
    private api: ApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.api.getRoles().subscribe({ next: r => (this.roles = r) });
  }

  ngOnDestroy() {
    this.streamSubscription?.unsubscribe();
  }

  get selectedRoleDesc() {
    return this.roles.find(r => r.title === this.selectedRole)?.description ?? '';
  }

  get scoreClass() {
    const p = this.mapping?.match_percentage ?? 0;
    if (p >= 70) return 'score-ring score-high';
    if (p >= 40) return 'score-ring score-mid';
    return 'score-ring score-low';
  }

  get scoreColor() {
    const p = this.mapping?.match_percentage ?? 0;
    if (p >= 70) return 'var(--success)';
    if (p >= 40) return 'var(--warning)';
    return 'var(--danger)';
  }

  get readinessBadgeClass(): string {
    switch (this.mapping?.readiness_level) {
      case 'HIGH':   return 'meta-badge badge-green';
      case 'MEDIUM': return 'meta-badge badge-yellow';
      case 'LOW':    return 'meta-badge badge-red';
      default:       return 'meta-badge badge-gray';
    }
  }

  get faithColor(): string {
    const s = (this.mapping?.faithfulness_score ?? 0);
    if (s >= 0.7) return 'var(--success)';
    if (s >= 0.4) return 'var(--warning)';
    return 'var(--danger)';
  }

  get streamedDayNumbers(): number[] {
    return Array.from({ length: this.streamDaysReceived });
  }

  get remainingDays(): number[] {
    return Array.from({ length: Math.max(0, this.numDays - this.streamDaysReceived) });
  }

  // ── Days calculator helpers ────────────────────────────────────────────
  get estimatedTasks()  { return this.numDays * 3; }
  get hoursPerDay()     { return 4; }
  get totalHours()      { return this.numDays * this.hoursPerDay; }

  get pace(): string {
    if (this.numDays <= 7)  return 'Intensive';
    if (this.numDays <= 14) return 'Moderate';
    if (this.numDays <= 21) return 'Relaxed';
    return 'Very Easy';
  }

  get paceColor(): string {
    if (this.numDays <= 7)  return 'var(--danger)';
    if (this.numDays <= 14) return 'var(--warning)';
    return 'var(--success)';
  }

  mapRole() {
    if (!this.selectedRole || !this.state.userId) return;
    this.loading = true;
    this.error = '';

    this.api.mapRole(this.state.userId, this.selectedRole).subscribe({
      next: res => {
        this.mapping = res;
        this.state.setMapping(res);
        this.loading = false;
      },
      error: err => {
        this.error = err.error?.detail ?? 'Failed to map role.';
        this.loading = false;
      },
    });
  }

  generatePlan() {
    if (!this.mapping || !this.state.userId) return;
    this.generatingPlan = true;
    this.streamDaysReceived = 0;
    this.streamedDays = [];

    const subject = this.api.generatePlanStream(
      this.state.userId,
      this.mapping.role,
      this.mapping.missing_skills,
      this.numDays,
    );

    this.streamSubscription = subject.subscribe({
      next: (event: StreamEvent) => {
        if (event.event === 'day' && event.day) {
          this.streamedDays.push(event.day);
          this.streamDaysReceived = this.streamedDays.length;
        }
        if (event.event === 'done') {
          const plan: Plan = {
            role: this.mapping!.role,
            total_days: this.numDays,
            focus_skills: event.focus_skills ?? this.mapping!.missing_skills,
            plan: this.streamedDays,
          };
          this.state.setPlan(plan);
          this.generatingPlan = false;
          this.router.navigate(['/dashboard']);
        }
        if (event.event === 'error') {
          // Fall back to non-streaming
          this.streamSubscription?.unsubscribe();
          this.generatePlanFallback();
        }
      },
      error: () => {
        this.generatePlanFallback();
      },
    });
  }

  private generatePlanFallback() {
    if (!this.mapping || !this.state.userId) return;
    this.api
      .generatePlan(
        this.state.userId,
        this.mapping.role,
        this.mapping.missing_skills,
        this.numDays,
      )
      .subscribe({
        next: plan => {
          this.state.setPlan(plan);
          this.generatingPlan = false;
          this.router.navigate(['/dashboard']);
        },
        error: () => { this.generatingPlan = false; },
      });
  }
}
