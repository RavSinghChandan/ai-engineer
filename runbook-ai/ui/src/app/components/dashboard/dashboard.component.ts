import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { HealthResponse, RunbookStats } from '../../models/runbook.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  health: HealthResponse | null = null;
  stats: RunbookStats | null = null;
  loading = true;
  error = '';

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.api.health().subscribe({
      next: h => { this.health = h; this.loadStats(); },
      error: () => { this.error = 'Cannot connect to RunbookAI backend. Start the server first.'; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private loadStats() {
    this.api.getRunbookStats().subscribe({
      next: s => { this.stats = s; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get categoryEntries() {
    return this.stats ? Object.entries(this.stats.by_category).sort((a, b) => b[1] - a[1]) : [];
  }

  get severityEntries() {
    return this.stats ? Object.entries(this.stats.by_severity).sort((a, b) => a[0].localeCompare(b[0])) : [];
  }

  severityBadge(sev: string) {
    return `badge--${sev.toLowerCase()}`;
  }
}
