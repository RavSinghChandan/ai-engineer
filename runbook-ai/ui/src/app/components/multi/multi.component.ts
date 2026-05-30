import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Runbook, MergeResult, ConflictResult, CompoundResult } from '../../models/runbook.model';

type MultiTab = 'merge' | 'conflicts' | 'compound';

@Component({
  selector: 'app-multi',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi.component.html',
  styleUrl: './multi.component.scss',
})
export class MultiComponent implements OnInit {
  activeTab: MultiTab = 'merge';
  runbooks: Runbook[] = [];
  runbooksLoading = true;

  // Merge / Conflicts
  selectedIds: Set<number> = new Set();
  merging = false;
  mergeResult: MergeResult | null = null;
  conflictResult: ConflictResult | null = null;
  mergeError = '';

  // Compound
  compoundIncident = '';
  compoundLoading = false;
  compoundResult: CompoundResult | null = null;
  compoundError = '';

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.api.getRunbooks({ limit: 50 }).subscribe({
      next: r => { this.runbooks = r.runbooks; this.runbooksLoading = false; this.cdr.markForCheck(); },
      error: () => { this.runbooksLoading = false; this.cdr.markForCheck(); },
    });
  }

  toggleId(id: number) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.mergeResult = null;
    this.conflictResult = null;
    this.mergeError = '';
  }

  get selectedArray() { return Array.from(this.selectedIds); }
  get canMerge() { return this.selectedIds.size >= 2; }

  merge() {
    if (!this.canMerge) return;
    this.merging = true;
    this.mergeResult = null;
    this.mergeError = '';
    this.api.mergeRunbooks(this.selectedArray).subscribe({
      next: r => { this.mergeResult = r; this.merging = false; this.cdr.markForCheck(); },
      error: e => { this.mergeError = e?.error?.detail ?? 'Merge failed.'; this.merging = false; this.cdr.markForCheck(); },
    });
  }

  checkConflicts() {
    if (!this.canMerge) return;
    this.merging = true;
    this.conflictResult = null;
    this.mergeError = '';
    this.api.checkConflicts(this.selectedArray).subscribe({
      next: r => { this.conflictResult = r; this.merging = false; this.cdr.markForCheck(); },
      error: e => { this.mergeError = e?.error?.detail ?? 'Conflict check failed.'; this.merging = false; this.cdr.markForCheck(); },
    });
  }

  analyzeCompound() {
    if (!this.compoundIncident.trim()) return;
    this.compoundLoading = true;
    this.compoundResult = null;
    this.compoundError = '';
    this.api.analyzeCompound(this.compoundIncident.trim()).subscribe({
      next: r => { this.compoundResult = r; this.compoundLoading = false; this.cdr.markForCheck(); },
      error: e => { this.compoundError = e?.error?.detail ?? 'Analysis failed.'; this.compoundLoading = false; this.cdr.markForCheck(); },
    });
  }

  conflictSeverityClass(sev: string) {
    return { CRITICAL: 'badge--red', HIGH: 'badge--yellow', MEDIUM: 'badge--blue' }[sev] ?? 'badge--gray';
  }

  severityBadge(sev: string) { return `badge--${sev?.toLowerCase()}`; }

  isSelected(id: number) { return this.selectedIds.has(id); }

  readonly compoundExamples = [
    'Database is down and all K8s pods are crashlooping',
    'Network interface flapping causing CI/CD pipeline failures',
    'PostgreSQL out of connections and monitoring alerts flooding',
  ];
}
