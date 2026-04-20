import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Role, RoleMapping } from '../../models/types';

@Component({
  selector: 'app-role-mapping',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 style="margin-bottom:8px;">Role Mapping</h1>
    <p style="color:var(--text-muted); margin-bottom:24px;">
      Select a target role — AI will compare your skills and identify gaps using RAG.
    </p>

    <div *ngIf="!state.userId" class="alert alert-error">
      Please upload your CV first. <a href="/upload" style="color:inherit;font-weight:600;">Go to Upload →</a>
    </div>

    <div *ngIf="state.userId" class="card">
      <label>Select Target Role</label>
      <select [(ngModel)]="selectedRole" [disabled]="loading">
        <option value="">-- Choose a role --</option>
        <option *ngFor="let r of roles" [value]="r.title">{{ r.title }}</option>
      </select>
      <p *ngIf="selectedRoleDesc" style="font-size:13px; color:var(--text-muted); margin-top:8px;">
        {{ selectedRoleDesc }}
      </p>

      <div *ngIf="error" class="alert alert-error" style="margin-top:16px;">{{ error }}</div>

      <button class="btn btn-primary" style="margin-top:20px;"
              [disabled]="!selectedRole || loading" (click)="mapRole()">
        <span *ngIf="loading" class="spinner"></span>
        {{ loading ? 'Analyzing with AI + RAG...' : 'Analyze Fit' }}
      </button>
    </div>

    <div *ngIf="mapping" class="card">
      <div class="match-header">
        <div>
          <h2>{{ mapping.role }}</h2>
          <p style="color:var(--text-muted); font-size:14px;">{{ mapping.recommendation }}</p>
        </div>
        <div class="score-ring" [class]="scoreClass">
          {{ mapping.match_percentage }}%
        </div>
      </div>

      <div style="margin-top:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:13px;">Match Score</span>
          <span style="font-size:13px; font-weight:600;">{{ mapping.match_percentage }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="mapping.match_percentage"
               [style.background]="scoreColor"></div>
        </div>
      </div>

      <div class="skills-grid" style="margin-top:24px;">
        <div>
          <h3 style="color:var(--success); margin-bottom:10px;">✅ Skills You Have</h3>
          <span *ngFor="let s of mapping.matched_skills" class="badge badge-green" style="margin:3px;">{{ s }}</span>
          <p *ngIf="!mapping.matched_skills.length" style="color:var(--text-muted); font-size:13px;">None matched</p>
        </div>
        <div>
          <h3 style="color:var(--danger); margin-bottom:10px;">❌ Missing Skills</h3>
          <span *ngFor="let s of mapping.missing_skills" class="badge badge-red" style="margin:3px;">{{ s }}</span>
          <p *ngIf="!mapping.missing_skills.length" style="color:var(--text-muted); font-size:13px;">No gaps! 🎉</p>
        </div>
      </div>

      <div style="margin-top:24px; display:flex; gap:12px;">
        <button class="btn btn-primary" [disabled]="generatingPlan" (click)="generatePlan()">
          <span *ngIf="generatingPlan" class="spinner"></span>
          {{ generatingPlan ? 'Generating 7-Day Plan...' : '🗓 Generate 7-Day Plan' }}
        </button>
        <button class="btn btn-secondary" (click)="mapping=null; selectedRole=''">
          Try Another Role
        </button>
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
      min-width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      border: 4px solid;
      flex-shrink: 0;
    }
    .score-high { border-color: var(--success); color: var(--success); }
    .score-mid { border-color: var(--warning); color: var(--warning); }
    .score-low { border-color: var(--danger); color: var(--danger); }
    .skills-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  `],
})
export class RoleMappingComponent implements OnInit {
  roles: Role[] = [];
  selectedRole = '';
  mapping: RoleMapping | null = null;
  loading = false;
  generatingPlan = false;
  error = '';

  constructor(
    public state: StateService,
    private api: ApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.api.getRoles().subscribe({ next: (r) => (this.roles = r) });
  }

  get selectedRoleDesc() {
    return this.roles.find(r => r.title === this.selectedRole)?.description || '';
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

  mapRole() {
    if (!this.selectedRole || !this.state.userId) return;
    this.loading = true;
    this.error = '';

    this.api.mapRole(this.state.userId, this.selectedRole).subscribe({
      next: (res) => {
        this.mapping = res;
        this.state.setMapping(res);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.detail || 'Failed to map role.';
        this.loading = false;
      },
    });
  }

  generatePlan() {
    if (!this.mapping || !this.state.userId) return;
    this.generatingPlan = true;

    this.api.generatePlan(
      this.state.userId,
      this.mapping.role,
      this.mapping.missing_skills,
    ).subscribe({
      next: (plan) => {
        this.state.setPlan(plan);
        this.generatingPlan = false;
        this.router.navigate(['/dashboard']);
      },
      error: () => { this.generatingPlan = false; },
    });
  }
}
