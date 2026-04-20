import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  IRowNode,
  RowClickedEvent,
} from 'ag-grid-community';

import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { PieChartComponent } from '../pie-chart/pie-chart.component';
import { Plan, Task, TaskRow, TrackingResult } from '../../models/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AgGridAngular, PieChartComponent],
  template: `
    <div *ngIf="!plan" class="alert alert-error">
      No plan found.
      <a routerLink="/mapping" style="color:inherit;font-weight:600;">
        Generate a plan first →
      </a>
    </div>

    <ng-container *ngIf="plan">

      <!-- ── Page header ──────────────────────────────────────────────────── -->
      <div class="page-header">
        <div>
          <h1 style="margin-bottom:4px;">Preparation Dashboard</h1>
          <p style="color:var(--text-muted); font-size:14px;">
            Role: <strong>{{ plan.role }}</strong>
            &nbsp;·&nbsp; {{ plan.total_days }}-Day Roadmap
            &nbsp;·&nbsp; {{ rowData.length }} total tasks
          </p>
        </div>
        <button class="btn btn-primary" (click)="saveProgress()" [disabled]="saving">
          <span *ngIf="saving" class="spinner"></span>
          {{ saving ? 'Saving...' : '💾 Save Progress' }}
        </button>
      </div>

      <!-- ── Progress section ─────────────────────────────────────────────── -->
      <div class="progress-section card">

        <!-- Pie chart -->
        <div class="pie-col">
          <app-pie-chart
            [score]="readinessScore"
            [completedCount]="completedIds.size"
            [totalCount]="rowData.length"
            [size]="180"
          />
        </div>

        <!-- Stats -->
        <div class="stats-col">
          <div class="stat-card stat-total">
            <span class="stat-value">{{ rowData.length }}</span>
            <span class="stat-key">Total Tasks</span>
          </div>
          <div class="stat-card stat-done">
            <span class="stat-value">{{ completedIds.size }}</span>
            <span class="stat-key">Completed</span>
          </div>
          <div class="stat-card stat-left">
            <span class="stat-value">{{ rowData.length - completedIds.size }}</span>
            <span class="stat-key">Remaining</span>
          </div>
          <div class="stat-card stat-days">
            <span class="stat-value">{{ plan.total_days }}</span>
            <span class="stat-key">Days</span>
          </div>
        </div>

        <!-- Status + message -->
        <div class="status-col">
          <div class="status-badge" [ngClass]="statusClass">
            {{ statusLabel }}
          </div>
          <p class="status-msg">{{ statusMessage }}</p>
          <div *ngIf="nextTask" class="next-task">
            <p class="next-task-label">NEXT UP</p>
            <p class="next-task-title">{{ nextTask }}</p>
          </div>

          <!-- Skills breakdown mini-pie-row -->
          <div *ngIf="skillStats.length" class="skill-stats">
            <p style="font-size:11px; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Skills Coverage</p>
            <div *ngFor="let s of skillStats" class="skill-row">
              <span class="skill-name">{{ s.skill }}</span>
              <div class="skill-bar">
                <div class="skill-fill"
                     [style.width.%]="s.pct"
                     [style.background]="s.pct === 100 ? 'var(--success)' : 'var(--primary)'">
                </div>
              </div>
              <span class="skill-pct">{{ s.pct }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Focus skills ─────────────────────────────────────────────────── -->
      <div class="card" *ngIf="plan.focus_skills.length" style="padding:16px 24px;">
        <span style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-right:12px;">Focus Skills</span>
        <span *ngFor="let s of plan.focus_skills" class="tag">{{ s }}</span>
      </div>

      <!-- ── AG Grid toolbar ──────────────────────────────────────────────── -->
      <div class="grid-toolbar card" style="padding:14px 20px;">
        <div class="toolbar-left">
          <input
            type="text"
            placeholder="🔍  Search tasks, skills, themes…"
            [(ngModel)]="quickFilter"
            (ngModelChange)="onQuickFilter($event)"
            style="width:260px;"
          />
          <select [(ngModel)]="dayFilter" (ngModelChange)="onDayFilter($event)"
                  style="width:140px;">
            <option value="">All Days</option>
            <option *ngFor="let d of dayOptions" [value]="d">Day {{ d }}</option>
          </select>
          <select [(ngModel)]="statusFilter" (ngModelChange)="onStatusFilter($event)"
                  style="width:130px;">
            <option value="">All Status</option>
            <option value="done">✓ Completed</option>
            <option value="todo">○ Pending</option>
          </select>
        </div>
        <div class="toolbar-right">
          <span style="font-size:13px; color:var(--text-muted);">
            {{ completedIds.size }} of {{ rowData.length }} done
          </span>
          <button class="btn btn-secondary" style="font-size:12px; padding:5px 12px;"
                  (click)="markAllVisible(true)">✓ Mark visible done</button>
          <button class="btn btn-secondary" style="font-size:12px; padding:5px 12px;"
                  (click)="markAllVisible(false)">○ Unmark visible</button>
        </div>
      </div>

      <!-- ── AG Grid ──────────────────────────────────────────────────────── -->
      <div class="card" style="padding:0; overflow:hidden;">
        <ag-grid-angular
          class="ag-theme-quartz"
          style="width:100%; height:520px;"
          [rowData]="rowData"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [pagination]="true"
          [paginationPageSize]="10"
          [paginationPageSizeSelector]="[5, 10, 15, 20]"
          [animateRows]="true"
          [rowSelection]="'multiple'"
          [suppressRowClickSelection]="true"
          [getRowStyle]="getRowStyle"
          [tooltipShowDelay]="300"
          (gridReady)="onGridReady($event)"
          (rowClicked)="onRowClicked($event)"
        />
      </div>

    </ng-container>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }

    /* ── Progress section ── */
    .progress-section {
      display: grid;
      grid-template-columns: 200px 1fr 1fr;
      gap: 24px;
      align-items: start;
    }
    .pie-col { display: flex; justify-content: center; }

    .stats-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .stat-card {
      display: flex; flex-direction: column;
      align-items: center; gap: 4px;
      padding: 16px 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
    }
    .stat-value { font-size: 28px; font-weight: 800; }
    .stat-key   { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-total { background: #f8fafc; }
    .stat-done  { background: #f0fdf4; }
    .stat-done .stat-value { color: var(--success); }
    .stat-left  { background: #fff7ed; }
    .stat-left .stat-value { color: var(--warning); }
    .stat-days  { background: #eff6ff; }
    .stat-days .stat-value { color: var(--primary); }

    .status-col { display: flex; flex-direction: column; gap: 12px; }
    .status-badge {
      display: inline-flex; align-items: center;
      padding: 6px 16px; border-radius: 999px;
      font-size: 14px; font-weight: 700;
      width: fit-content;
    }
    .status-not-started { background: #f1f5f9; color: #475569; }
    .status-in-progress { background: #dbeafe; color: #1d4ed8; }
    .status-almost      { background: #fef3c7; color: #92400e; }
    .status-ready       { background: #dcfce7; color: #15803d; }

    .status-msg { font-size: 13px; color: var(--text-muted); }

    .next-task {
      padding: 10px 14px;
      background: var(--bg);
      border-left: 3px solid var(--primary);
      border-radius: 0 var(--radius) var(--radius) 0;
    }
    .next-task-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .next-task-title { font-size: 13px; font-weight: 600; }

    /* Skills bar rows */
    .skill-stats { display: flex; flex-direction: column; gap: 6px; }
    .skill-row { display: flex; align-items: center; gap: 8px; }
    .skill-name { font-size: 11px; width: 90px; flex-shrink: 0; color: var(--text); }
    .skill-bar  { flex: 1; height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .skill-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
    .skill-pct  { font-size: 11px; font-weight: 600; width: 30px; text-align: right; color: var(--text-muted); }

    /* Toolbar */
    .grid-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 0;
      border-radius: var(--radius) var(--radius) 0 0;
      border-bottom: none;
    }
    .toolbar-left  { display: flex; gap: 10px; flex-wrap: wrap; }
    .toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  `],
})
export class DashboardComponent implements OnInit {
  plan: Plan | null = null;
  rowData: TaskRow[] = [];
  completedIds = new Set<string>();
  saving = false;

  private gridApi!: GridApi;

  // ── AG Grid config ──────────────────────────────────────────────────────
  columnDefs: ColDef[] = [
    {
      headerName: 'Day',
      field: 'day',
      width: 72,
      pinned: 'left',
      sort: 'asc',
      cellStyle: { fontWeight: 700, color: '#3b82f6', textAlign: 'center' },
    },
    {
      headerName: 'Theme',
      field: 'theme',
      width: 180,
      tooltipField: 'theme',
      cellStyle: { fontSize: '13px' },
    },
    {
      headerName: 'Task',
      field: 'title',
      flex: 1,
      minWidth: 200,
      tooltipField: 'description',
    },
    {
      headerName: 'Skill',
      field: 'skill',
      width: 155,
      cellRenderer: (p: any) =>
        `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">${p.value}</span>`,
    },
    {
      headerName: 'Hrs',
      field: 'hours',
      width: 65,
      type: 'numericColumn',
      cellStyle: { color: 'var(--text-muted)', textAlign: 'center' },
    },
    {
      headerName: 'Status',
      field: 'done',
      width: 105,
      cellRenderer: (p: any) =>
        p.value
          ? `<span style="color:#15803d;font-weight:700;font-size:13px;">✓ Done</span>`
          : `<span style="color:#94a3b8;font-size:13px;">○ Todo</span>`,
    },
    {
      headerName: 'Resource',
      field: 'resource',
      width: 95,
      cellRenderer: (p: any) =>
        p.value
          ? `<a href="${p.value}" target="_blank"
               onclick="event.stopPropagation()"
               style="color:#3b82f6;font-size:12px;">📚 Open</a>`
          : '<span style="color:#cbd5e1;">—</span>',
    },
  ];

  defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  getRowStyle = (p: any): any =>
    p.data?.done
      ? { background: '#f0fdf4', textDecoration: 'none', opacity: 0.85 }
      : {};

  // ── Toolbar state ───────────────────────────────────────────────────────
  quickFilter = '';
  dayFilter: number | '' = '';
  statusFilter: '' | 'done' | 'todo' = '';

  get dayOptions(): number[] {
    return this.plan ? Array.from({ length: this.plan.total_days }, (_, i) => i + 1) : [];
  }

  // ── Readiness helpers ───────────────────────────────────────────────────
  get readinessScore(): number {
    if (!this.rowData.length) return 0;
    return Math.round((this.completedIds.size / this.rowData.length) * 100);
  }

  get statusLabel(): string {
    const s = this.readinessScore;
    if (s === 0)   return 'Not Started';
    if (s < 50)    return 'In Progress';
    if (s < 85)    return 'Almost Ready';
    return 'Ready 🎉';
  }

  get statusClass(): string {
    const s = this.readinessScore;
    if (s === 0) return 'status-badge status-not-started';
    if (s < 50)  return 'status-badge status-in-progress';
    if (s < 85)  return 'status-badge status-almost';
    return 'status-badge status-ready';
  }

  get statusMessage(): string {
    const s = this.readinessScore;
    if (s === 100) return '🎉 Fully prepared! You are ready for the project.';
    if (s >= 85)   return `Almost there — just ${100 - s}% left!`;
    if (s >= 50)   return `Good progress — keep going! ${100 - s}% remaining.`;
    if (s > 0)     return `You've started — ${this.completedIds.size} task${this.completedIds.size !== 1 ? 's' : ''} done.`;
    return 'Click any row to mark a task as complete.';
  }

  get nextTask(): string {
    const t = this.rowData.find(r => !r.done);
    return t ? t.title : '';
  }

  get skillStats(): { skill: string; pct: number }[] {
    const map = new Map<string, { total: number; done: number }>();
    for (const r of this.rowData) {
      const s = r.skill.split(',')[0].trim();
      if (!map.has(s)) map.set(s, { total: 0, done: 0 });
      const e = map.get(s)!;
      e.total++;
      if (r.done) e.done++;
    }
    return Array.from(map.entries())
      .map(([skill, v]) => ({ skill, pct: Math.round((v.done / v.total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
  }

  constructor(
    public state: StateService,
    private api: ApiService,
  ) {}

  ngOnInit() {
    if (this.state.plan) {
      this.plan = this.state.plan;
      this.buildRowData();
      this.loadSavedProgress();
    } else if (this.state.userId) {
      this.api.getProgress(this.state.userId).subscribe({
        next: p => {
          this.plan = p.plan;
          this.completedIds = new Set(p.completed_task_ids ?? []);
          this.buildRowData();
        },
      });
    }
  }

  // ── Grid events ─────────────────────────────────────────────────────────
  onGridReady(event: GridReadyEvent) {
    this.gridApi = event.api;
  }

  onRowClicked(event: RowClickedEvent) {
    const row = event.data as TaskRow;
    const wasDone = row.done;
    row.done = !wasDone;

    if (row.done) this.completedIds.add(row.id);
    else          this.completedIds.delete(row.id);

    event.node.setData({ ...row });
  }

  onQuickFilter(value: string) {
    this.gridApi?.setGridOption('quickFilterText', value);
  }

  onDayFilter(day: number | '') {
    this.applyExternalFilter();
  }

  onStatusFilter(status: string) {
    this.applyExternalFilter();
  }

  private applyExternalFilter() {
    this.gridApi?.setIsExternalFilterPresent(() => {
      return this.dayFilter !== '' || this.statusFilter !== '';
    });
    this.gridApi?.setDoesExternalFilterPass((node: IRowNode) => {
      const row = node.data as TaskRow;
      if (this.dayFilter !== '' && row.day !== +this.dayFilter) return false;
      if (this.statusFilter === 'done' && !row.done)  return false;
      if (this.statusFilter === 'todo' &&  row.done)  return false;
      return true;
    });
    this.gridApi?.onFilterChanged();
  }

  markAllVisible(done: boolean) {
    this.gridApi?.forEachNodeAfterFilter((node: IRowNode) => {
      const row = node.data as TaskRow;
      row.done = done;
      if (done) this.completedIds.add(row.id);
      else      this.completedIds.delete(row.id);
      node.setData({ ...row });
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  private buildRowData() {
    if (!this.plan) return;
    this.rowData = this.plan.plan.flatMap(day =>
      day.tasks.map(t => ({
        ...t,
        day: day.day,
        theme: day.theme,
        done: this.completedIds.has(t.id),
      }))
    );
  }

  private loadSavedProgress() {
    if (!this.state.userId) return;
    this.api.getProgress(this.state.userId).subscribe({
      next: p => {
        this.completedIds = new Set(p.completed_task_ids ?? []);
        this.buildRowData();
      },
      error: () => {},
    });
  }

  saveProgress() {
    if (!this.state.userId) return;
    this.saving = true;

    this.api.updateProgress(this.state.userId, [...this.completedIds]).subscribe({
      next: () => { this.saving = false; },
      error: () => { this.saving = false; },
    });
  }
}
