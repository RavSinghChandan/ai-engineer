import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { QueryResult, SourcePanel } from '../../models/runbook.model';

@Component({
  selector: 'app-query',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './query.component.html',
  styleUrl: './query.component.scss',
})
export class QueryComponent {
  incident = '';
  loading = false;
  result: QueryResult | null = null;
  error = '';
  activeTab: 'response' | 'steps' | 'graph' | 'panels' = 'response';
  // Priority order: internal (P1) → official (P2) → combined (P3)
  activePanelTab: 'internal' | 'official' | 'combined' = 'internal';

  readonly examples = [
    'Kubernetes pods are crashlooping after a deployment — need to rollback',
    'PostgreSQL database is running out of connections — service degraded',
    'Network interface eth0 is flapping — packet loss detected',
    'CI/CD pipeline is stuck — deployments not running',
  ];

  constructor(private readonly api: ApiService, private readonly router: Router, private readonly cdr: ChangeDetectorRef) {}

  query() {
    if (!this.incident.trim()) return;
    this.loading = true;
    this.error = '';
    this.result = null;
    this.activeTab = 'response';
    this.activePanelTab = 'internal';
    this.api.queryIncident(this.incident.trim()).subscribe({
      next: r => { this.result = r; this.loading = false; this.cdr.markForCheck(); },
      error: e => { this.error = e?.error?.detail ?? 'Query failed. Make sure the backend is running.'; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  useExample(ex: string) { this.incident = ex; }

  get r() { return this.result?.response ?? null; }
  get panels() { return this.result?.panels ?? null; }
  get activePanel(): SourcePanel | null {
    if (!this.panels) return null;
    return this.panels[this.activePanelTab] ?? null;
  }

  viewRunbook() {
    if (this.result?.selected_runbook_id) this.router.navigate(['/runbooks', this.result.selected_runbook_id]);
  }

  confidenceBadge(c: string) {
    return { HIGH: 'badge--green', MEDIUM: 'badge--yellow', LOW: 'badge--gray' }[c] ?? 'badge--gray';
  }

  severityBadge(sev: string) { return `badge--${sev?.toLowerCase()}`; }

  conflictSeverityClass(sev: string) {
    return { HIGH: 'conflict--high', MEDIUM: 'conflict--medium', LOW: 'conflict--low' }[sev] ?? 'conflict--low';
  }
}
