import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Runbook, GraphAnalysis } from '../../models/runbook.model';

@Component({
  selector: 'app-runbook-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './runbook-detail.component.html',
  styleUrl: './runbook-detail.component.scss',
})
export class RunbookDetailComponent implements OnInit {
  runbook: Runbook | null = null;
  graph: GraphAnalysis | null = null;
  loading = true;
  error = '';
  activeTab: 'steps' | 'graph' | 'rollback' = 'steps';

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getRunbook(id).subscribe({
      next: rb => {
        this.runbook = rb;
        this.api.getGraph(id).subscribe({
          next: g => { this.graph = g; this.loading = false; },
          error: () => { this.loading = false; },
        });
      },
      error: () => { this.error = 'Runbook not found.'; this.loading = false; },
    });
  }

  back() { this.router.navigate(['/runbooks']); }

  severityBadge(sev: string) { return `badge--${sev.toLowerCase()}`; }

  isCritical(stepNum: number) {
    return this.graph?.critical_path?.includes(stepNum);
  }

  isBottleneck(stepNum: number) {
    return this.graph?.bottleneck_steps?.includes(stepNum);
  }

  getParallelGroup(stepNum: number): number {
    if (!this.graph?.parallel_groups) return -1;
    return this.graph.parallel_groups.findIndex(g => g.includes(stepNum));
  }
}
