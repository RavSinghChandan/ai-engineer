import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { QueryResult } from '../../models/runbook.model';

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
  activeTab: 'response' | 'steps' | 'graph' = 'response';

  readonly examples = [
    'Kubernetes pods are crashlooping after a deployment — need to rollback',
    'PostgreSQL database is running out of connections — service degraded',
    'Network interface eth0 is flapping — packet loss detected',
    'CI/CD pipeline is stuck — deployments not running',
  ];

  constructor(private api: ApiService, private router: Router) {}

  query() {
    if (!this.incident.trim()) return;
    this.loading = true;
    this.error = '';
    this.result = null;
    this.activeTab = 'response';
    this.api.queryIncident(this.incident.trim()).subscribe({
      next: r => { this.result = r; this.loading = false; },
      error: e => { this.error = e?.error?.detail ?? 'Query failed. Make sure the backend is running.'; this.loading = false; },
    });
  }

  useExample(ex: string) { this.incident = ex; }

  viewRunbook() {
    if (this.result?.runbook_id) this.router.navigate(['/runbooks', this.result.runbook_id]);
  }

  confidenceBadge(c: string) {
    return { HIGH: 'badge--green', MEDIUM: 'badge--yellow', LOW: 'badge--gray' }[c] ?? 'badge--gray';
  }

  severityBadge(sev: string) { return `badge--${sev?.toLowerCase()}`; }
}
