import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Runbook } from '../../models/runbook.model';

const CATEGORIES = ['kubernetes', 'database', 'networking', 'security', 'storage', 'cicd', 'monitoring', 'other'];
const SEVERITIES = ['P1', 'P2', 'P3', 'P4'];

@Component({
  selector: 'app-runbooks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './runbooks.component.html',
  styleUrl: './runbooks.component.scss',
})
export class RunbooksComponent implements OnInit {
  runbooks: Runbook[] = [];
  total = 0;
  loading = true;
  error = '';

  category = '';
  severity = '';
  limit = 20;
  offset = 0;

  readonly categories = CATEGORIES;
  readonly severities = SEVERITIES;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.error = '';
    const params: Record<string, string | number> = { limit: this.limit, offset: this.offset };
    if (this.category) params['category'] = this.category;
    if (this.severity) params['severity'] = this.severity;
    this.api.getRunbooks(params as any).subscribe({
      next: r => { this.runbooks = r.runbooks; this.total = r.total; this.loading = false; },
      error: () => { this.error = 'Failed to load runbooks.'; this.loading = false; },
    });
  }

  applyFilters() { this.offset = 0; this.load(); }
  clearFilters() { this.category = ''; this.severity = ''; this.offset = 0; this.load(); }

  prevPage() { if (this.offset > 0) { this.offset -= this.limit; this.load(); } }
  nextPage() { if (this.offset + this.limit < this.total) { this.offset += this.limit; this.load(); } }

  openRunbook(id: number) { this.router.navigate(['/runbooks', id]); }

  get currentPage() { return Math.floor(this.offset / this.limit) + 1; }
  get totalPages() { return Math.ceil(this.total / this.limit); }

  severityBadge(sev: string) { return `badge--${sev.toLowerCase()}`; }
}
