import { Component, computed, input } from '@angular/core';
import { JobStatus } from '../../core/models';

const STYLES: Record<string, string> = {
  queued: 'bg-slate-800 text-slate-300',
  running: 'bg-sky-950 text-sky-400 animate-pulse',
  awaiting_approval: 'bg-amber-950 text-amber-400',
  approved: 'bg-emerald-950 text-emerald-400',
  failed: 'bg-red-950 text-red-400',
  cancelled: 'bg-slate-800 text-slate-500',
};

const LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_approval: 'Ready for review',
  approved: 'Approved',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

@Component({
  selector: 'acf-status-badge',
  template: `<span class="badge {{ style() }}">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<JobStatus>();
  readonly style = computed(() => STYLES[this.status()] ?? STYLES['queued']);
  readonly label = computed(() => LABELS[this.status()] ?? this.status());
}
