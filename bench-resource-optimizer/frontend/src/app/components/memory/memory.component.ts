import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-memory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="page-header">
      <div>
        <h1>Memory & Resume</h1>
        <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">
          Module 4 — Agent State Management · Episodic + Long-term Memory
        </p>
      </div>
      <div class="header-badges">
        <span class="badge badge-blue">Episodic</span>
        <span class="badge badge-green">Long-term</span>
        <span class="badge badge-purple">Context Injection</span>
      </div>
    </div>

    <!-- ── What is this? ──────────────────────────────────────────────────── -->
    <div class="explainer-bar">
      <span class="explainer-icon">🧠</span>
      <div>
        <strong>Why memory matters:</strong> Without it, employees re-explain their context every session.
        With Module 4 memory, the agent knows which roles they explored, which skills they covered,
        and their readiness score — injected automatically as LLM system context.
      </div>
    </div>

    <!-- ── Lookup ──────────────────────────────────────────────────────────── -->
    <div class="card lookup-card">
      <h3 style="margin-bottom:12px;">Load Memory Profile</h3>
      <div class="lookup-row">
        <input
          class="lookup-input"
          [(ngModel)]="inputUserId"
          placeholder="Enter user_id (e.g. usr_abc123…)"
          (keyup.enter)="load()"
        />
        <button class="btn btn-primary" (click)="load()" [disabled]="loading || !inputUserId.trim()">
          <span *ngIf="loading" class="spinner"></span>
          {{ loading ? 'Loading…' : 'Load Memory' }}
        </button>
        <button class="btn btn-secondary" *ngIf="state.userId" (click)="loadCurrent()">
          Load Current Session
        </button>
      </div>
      <div *ngIf="state.userId" class="current-hint">
        Current session user_id: <code>{{ state.userId }}</code>
      </div>
      <div *ngIf="error" class="alert-error">{{ error }}</div>
    </div>

    <!-- ── Memory profile ─────────────────────────────────────────────────── -->
    <ng-container *ngIf="mem">

      <!-- ── Summary bar ────────────────────────────────────────────────────── -->
      <div class="mem-summary-row">
        <div class="mem-sum-card">
          <span class="mem-sum-val">{{ mem.session_count }}</span>
          <span class="mem-sum-key">Sessions</span>
          <span class="mem-sum-note">Episodic memory entries</span>
        </div>
        <div class="mem-sum-card" [class.mem-sum-active]="mem.has_facts">
          <span class="mem-sum-val">{{ factCount }}</span>
          <span class="mem-sum-key">Long-term Facts</span>
          <span class="mem-sum-note">Persisted across sessions</span>
        </div>
        <div class="mem-sum-card" [class.mem-sum-active]="mem.memory_context">
          <span class="mem-sum-val">{{ mem.memory_context ? 'Active' : 'Empty' }}</span>
          <span class="mem-sum-key">Context</span>
          <span class="mem-sum-note">Injected into LLM prompts</span>
        </div>
        <div class="mem-sum-card mem-sum-uid">
          <span class="mem-sum-val uid-val">{{ mem.user_id | slice:0:12 }}…</span>
          <span class="mem-sum-key">User ID</span>
          <span class="mem-sum-note">{{ mem.user_id }}</span>
        </div>
      </div>

      <!-- ── Two-col: episodic + long-term ────────────────────────────────── -->
      <div class="two-col">

        <!-- Episodic sessions -->
        <div class="card">
          <div class="card-header">
            <h3>Episodic Memory</h3>
            <span class="card-sub">Short-term session history (max 10, rolling)</span>
          </div>

          <div *ngIf="!mem.episodic_sessions?.length" class="no-data">
            No sessions recorded yet — episodic memory populates after role mapping + plan generation.
          </div>

          <div *ngFor="let s of mem.episodic_sessions; let i = index" class="session-row">
            <div class="session-head">
              <span class="session-badge">Session {{ mem.session_count - i }}</span>
              <span class="session-age">{{ ageLabel(s.ts) }}</span>
              <span class="session-role">{{ s.role_explored || '—' }}</span>
            </div>
            <div class="session-body">
              <div class="session-stat">
                <span class="stat-label">Readiness</span>
                <span class="stat-val" [class.stat-good]="s.readiness_score >= 70"
                      [class.stat-warn]="s.readiness_score >= 40 && s.readiness_score < 70"
                      [class.stat-bad]="s.readiness_score < 40">
                  {{ s.readiness_score ?? '—' }}%
                </span>
              </div>
              <div class="session-stat" *ngIf="s.skills_covered?.length">
                <span class="stat-label">Skills covered</span>
                <div class="skill-chips">
                  <span *ngFor="let sk of s.skills_covered?.slice(0,6)" class="skill-chip">{{ sk }}</span>
                  <span *ngIf="(s.skills_covered?.length ?? 0) > 6" class="skill-chip skill-more">
                    +{{ s.skills_covered.length - 6 }} more
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Long-term facts -->
        <div class="card">
          <div class="card-header">
            <h3>Long-term Facts</h3>
            <span class="card-sub">Persisted user knowledge (roles, skills, readiness)</span>
          </div>

          <div *ngIf="!mem.has_facts" class="no-data">
            No long-term facts yet — facts accumulate as the user completes sessions and saves progress.
          </div>

          <div *ngIf="mem.has_facts">
            <div *ngFor="let kv of factList" class="fact-row">
              <span class="fact-key">{{ kv.key }}</span>
              <div class="fact-val">
                <ng-container *ngIf="isArray(kv.val)">
                  <span *ngFor="let v of kv.val" class="fact-chip">{{ v }}</span>
                </ng-container>
                <ng-container *ngIf="!isArray(kv.val)">
                  <span class="fact-scalar">{{ kv.val }}</span>
                </ng-container>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ── LLM Context String ─────────────────────────────────────────────── -->
      <div class="card" *ngIf="mem.memory_context">
        <div class="card-header">
          <h3>LLM Context String</h3>
          <span class="card-sub">Injected as system context on every role-mapping + plan-generation call</span>
        </div>
        <div class="ctx-terminal">
          <div class="ctx-label">SYSTEM CONTEXT → LLM</div>
          <pre class="ctx-pre">{{ mem.memory_context }}</pre>
        </div>
        <div class="ctx-note">
          This exact string is prepended to every LLM prompt for user <code>{{ mem.user_id | slice:0:16 }}…</code>
          so the agent never asks what they already know.
        </div>
      </div>

      <!-- ── Resume section ─────────────────────────────────────────────────── -->
      <div class="card resume-card" *ngIf="progress">
        <div class="resume-header">
          <div>
            <h3>Saved Plan Found</h3>
            <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">
              Role: <strong>{{ progress.role }}</strong>
              &nbsp;·&nbsp; {{ progress.plan?.total_days }}-day roadmap
              &nbsp;·&nbsp; {{ completedCount }} / {{ totalTasks }} tasks completed
            </p>
          </div>
          <button class="btn btn-primary btn-lg" (click)="resumePlan()">
            Resume Plan →
          </button>
        </div>
        <div class="resume-progress-track">
          <div class="resume-progress-fill"
               [style.width.%]="completedPct"
               [class.fill-good]="completedPct >= 70"
               [class.fill-warn]="completedPct >= 30 && completedPct < 70"
               [class.fill-bad]="completedPct < 30">
          </div>
        </div>
        <div class="resume-progress-label">{{ completedPct.toFixed(0) }}% complete</div>
      </div>

      <div class="card resume-card-empty" *ngIf="!progress && !progressLoading">
        <p style="color:var(--text-muted); font-size:13px;">
          No saved plan found for this user. Go to Role Mapping to generate one.
        </p>
        <a routerLink="/mapping" class="btn btn-secondary" style="margin-top:12px; display:inline-block;">
          Go to Role Mapping →
        </a>
      </div>

      <!-- ── Interview Explainer ────────────────────────────────────────────── -->
      <div class="card explainer-card">
        <h3 style="margin-bottom:16px; font-size:16px;">Interview Explainer — Module 4: Agent Memory</h3>
        <div class="explainer-grid">
          <div class="explainer-item">
            <span class="ex-badge ex-blue">Episodic</span>
            <div>
              <strong>Short-term episodic memory</strong> — Last 10 sessions stored in a rolling deque per user.
              At session start, recent history is loaded and injected as system context. Redis-ready for scale.
            </div>
          </div>
          <div class="explainer-item">
            <span class="ex-badge ex-green">Long-term</span>
            <div>
              <strong>Long-term semantic memory</strong> — Persistent user facts: covered skills, explored roles,
              readiness level. Stored in SQLite (pgvector-ready). Merges lists across sessions (union, no duplicates).
            </div>
          </div>
          <div class="explainer-item">
            <span class="ex-badge ex-purple">Context</span>
            <div>
              <strong>Context injection</strong> — <code>build_memory_context(user_id)</code> renders a
              human-readable string injected into every LLM prompt automatically. Agent knows the user's history
              without being told again.
            </div>
          </div>
          <div class="explainer-item">
            <span class="ex-badge ex-orange">Pattern</span>
            <div>
              <strong>Why this pattern:</strong> At 10,000-employee enterprise scale, re-entering context
              manually is impractical. Memory-augmented agents reduce session ramp-up time from ~5 minutes to zero.
            </div>
          </div>
        </div>
      </div>

    </ng-container>
  `,
  styles: [`
    .page-header {
      display:flex; justify-content:space-between; align-items:flex-start;
      margin-bottom:20px; flex-wrap:wrap; gap:12px;
    }
    .header-badges { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .badge {
      font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px;
      letter-spacing:0.3px;
    }
    .badge-blue   { background:#dbeafe; color:#1d4ed8; }
    .badge-green  { background:#dcfce7; color:#15803d; }
    .badge-purple { background:#ede9fe; color:#7c3aed; }

    .explainer-bar {
      display:flex; gap:14px; align-items:flex-start;
      background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px;
      padding:14px 18px; margin-bottom:20px; font-size:13px; color:#1e3a5f; line-height:1.6;
    }
    .explainer-icon { font-size:22px; flex-shrink:0; }

    /* Lookup */
    .lookup-card { margin-bottom:20px; }
    .lookup-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .lookup-input {
      flex:1; min-width:260px;
      border:1px solid #e2e8f0; border-radius:8px; padding:9px 14px;
      font-size:13px; color:#1e293b; outline:none;
      transition:border-color 0.2s;
    }
    .lookup-input:focus { border-color:#3b82f6; }
    .current-hint { font-size:12px; color:#94a3b8; margin-top:8px; }
    .current-hint code { background:#f1f5f9; padding:1px 6px; border-radius:4px; font-size:11px; }
    .alert-error { color:#dc2626; font-size:13px; margin-top:8px; }

    /* Summary row */
    .mem-summary-row {
      display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px;
    }
    .mem-sum-card {
      background:#fff; border:1px solid #e2e8f0; border-radius:10px;
      padding:16px 14px; display:flex; flex-direction:column; gap:3px;
    }
    .mem-sum-active { border-color:#86efac; background:#f0fdf4; }
    .mem-sum-uid { background:#faf5ff; border-color:#ddd6fe; }
    .mem-sum-val { font-size:24px; font-weight:800; color:#0f172a; }
    .uid-val     { font-size:13px; font-family:monospace; color:#7c3aed; }
    .mem-sum-key { font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.4px; }
    .mem-sum-note{ font-size:11px; color:#94a3b8; }

    /* Two col */
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; }
    .card-header { margin-bottom:14px; }
    .card-header h3 { margin-bottom:3px; }
    .card-sub { font-size:11px; color:#94a3b8; font-style:italic; }
    .no-data { font-size:13px; color:#94a3b8; padding:16px 0; text-align:center; }

    /* Episodic session rows */
    .session-row {
      border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:10px;
    }
    .session-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    .session-badge {
      font-size:10px; font-weight:700; background:#eff6ff; color:#1d4ed8;
      padding:2px 8px; border-radius:999px; flex-shrink:0;
    }
    .session-age { font-size:11px; color:#94a3b8; }
    .session-role { font-size:13px; font-weight:600; color:#1e293b; margin-left:auto; }
    .session-body { display:flex; flex-direction:column; gap:6px; }
    .session-stat { display:flex; align-items:flex-start; gap:8px; }
    .stat-label { font-size:11px; font-weight:600; color:#64748b; min-width:90px; padding-top:2px; }
    .stat-val   { font-size:15px; font-weight:800; }
    .stat-good { color:#15803d; }
    .stat-warn { color:#d97706; }
    .stat-bad  { color:#dc2626; }
    .skill-chips { display:flex; flex-wrap:wrap; gap:4px; }
    .skill-chip {
      font-size:11px; background:#f1f5f9; color:#475569;
      padding:2px 8px; border-radius:999px; border:1px solid #e2e8f0;
    }
    .skill-more { background:#ede9fe; color:#7c3aed; border-color:#ddd6fe; }

    /* Long-term facts */
    .fact-row {
      display:flex; align-items:flex-start; gap:10px;
      padding:10px 0; border-bottom:1px solid #f1f5f9;
    }
    .fact-row:last-child { border-bottom:none; }
    .fact-key {
      font-size:12px; font-weight:700; color:#64748b;
      text-transform:uppercase; letter-spacing:0.3px; min-width:130px; padding-top:2px;
    }
    .fact-val { display:flex; flex-wrap:wrap; gap:4px; flex:1; }
    .fact-chip {
      font-size:11px; background:#dcfce7; color:#15803d;
      padding:2px 8px; border-radius:999px; border:1px solid #bbf7d0;
    }
    .fact-scalar { font-size:13px; font-weight:600; color:#1e293b; }

    /* LLM context terminal */
    .ctx-terminal {
      background:#0f172a; border-radius:8px; padding:16px 18px; margin-bottom:12px;
    }
    .ctx-label {
      font-size:10px; font-weight:700; color:#64748b; letter-spacing:1px;
      text-transform:uppercase; margin-bottom:8px;
    }
    .ctx-pre {
      font-family:monospace; font-size:12px; color:#86efac;
      white-space:pre-wrap; word-break:break-word; margin:0; line-height:1.6;
    }
    .ctx-note { font-size:12px; color:#94a3b8; }
    .ctx-note code { background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:11px; }

    /* Resume card */
    .resume-card {
      border:2px solid #bbf7d0; background:#f0fdf4; margin-bottom:20px;
    }
    .resume-card-empty { margin-bottom:20px; }
    .resume-header {
      display:flex; justify-content:space-between; align-items:flex-start;
      margin-bottom:14px; flex-wrap:wrap; gap:10px;
    }
    .btn-lg { padding:10px 22px; font-size:14px; }
    .resume-progress-track {
      height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-bottom:6px;
    }
    .resume-progress-fill { height:100%; border-radius:999px; transition:width 0.5s ease; }
    .fill-good { background:#22c55e; }
    .fill-warn { background:#f59e0b; }
    .fill-bad  { background:#ef4444; }
    .resume-progress-label { font-size:12px; color:#64748b; text-align:right; }

    /* Interview explainer */
    .explainer-card { margin-bottom:20px; }
    .explainer-grid { display:flex; flex-direction:column; gap:12px; }
    .explainer-item { display:flex; gap:12px; align-items:flex-start; font-size:13px; color:#1e293b; line-height:1.6; }
    .ex-badge {
      font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px;
      flex-shrink:0; margin-top:2px;
    }
    .ex-blue   { background:#dbeafe; color:#1d4ed8; }
    .ex-green  { background:#dcfce7; color:#15803d; }
    .ex-purple { background:#ede9fe; color:#7c3aed; }
    .ex-orange { background:#fef3c7; color:#92400e; }

    .spinner {
      display:inline-block; width:12px; height:12px;
      border:2px solid rgba(255,255,255,0.3); border-top-color:#fff;
      border-radius:50%; animation:spin 0.6s linear infinite; margin-right:6px;
    }
    @keyframes spin { to { transform:rotate(360deg); } }
  `]
})
export class MemoryComponent implements OnInit {
  inputUserId = '';
  loading     = false;
  progressLoading = false;
  error       = '';
  mem: any    = null;
  progress: any = null;

  constructor(
    private api: ApiService,
    public state: StateService,
    private router: Router,
  ) {}

  ngOnInit() {
    if (this.state.userId) {
      this.inputUserId = this.state.userId;
    }
  }

  loadCurrent() {
    if (this.state.userId) {
      this.inputUserId = this.state.userId;
      this.load();
    }
  }

  load() {
    const uid = this.inputUserId.trim();
    if (!uid) return;
    this.loading  = true;
    this.error    = '';
    this.mem      = null;
    this.progress = null;

    this.api.getMemory(uid).subscribe({
      next: (data: any) => {
        this.mem     = data;
        this.loading = false;
        this._loadProgress(uid);
      },
      error: (err: any) => {
        this.error   = err?.error?.detail ?? 'Failed to load memory for this user_id.';
        this.loading = false;
      },
    });
  }

  private _loadProgress(uid: string) {
    this.progressLoading = true;
    this.api.getProgress(uid).subscribe({
      next: (p: any) => { this.progress = p; this.progressLoading = false; },
      error: ()       => { this.progress = null; this.progressLoading = false; },
    });
  }

  resumePlan() {
    if (!this.progress?.plan) return;
    this.state.setUserId(this.mem.user_id);
    this.state.setPlan(this.progress.plan);
    this.router.navigate(['/dashboard']);
  }

  ageLabel(ts: number): string {
    if (!ts) return '';
    const diff = (Date.now() / 1000) - ts;
    if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  }

  isArray(v: any): boolean { return Array.isArray(v); }

  get factList(): { key: string; val: any }[] {
    if (!this.mem?.long_term_facts) return [];
    return Object.entries(this.mem.long_term_facts).map(([key, val]) => ({ key, val }));
  }

  get factCount(): number { return this.factList.length; }

  get totalTasks(): number {
    return this.progress?.plan?.days?.reduce((s: number, d: any) => s + (d.tasks?.length ?? 0), 0) ?? 0;
  }

  get completedCount(): number {
    return this.progress?.completed_task_ids?.length ?? 0;
  }

  get completedPct(): number {
    return this.totalTasks ? (this.completedCount / this.totalTasks) * 100 : 0;
  }
}
