import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { IngestJob } from '../../models/runbook.model';

@Component({
  selector: 'app-ingest',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ingest.component.html',
  styleUrl: './ingest.component.scss',
})
export class IngestComponent {
  dragOver = false;
  selectedFile: File | null = null;
  uploading = false;
  job: IngestJob | null = null;
  error = '';
  pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ApiService, private router: Router) {}

  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }
  onDragLeave() { this.dragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.selectFile(file);
  }

  onFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.selectFile(file);
  }

  selectFile(file: File) {
    if (!file.name.endsWith('.pdf')) { this.error = 'Only PDF files are accepted.'; return; }
    this.error = '';
    this.selectedFile = file;
    this.job = null;
  }

  upload() {
    if (!this.selectedFile) return;
    this.uploading = true;
    this.error = '';
    this.api.uploadPdf(this.selectedFile).subscribe({
      next: r => {
        this.uploading = false;
        this.pollJob(r.job_id);
      },
      error: e => {
        this.uploading = false;
        this.error = e?.error?.detail ?? 'Upload failed.';
      },
    });
  }

  private pollJob(jobId: number) {
    const fetch = () => {
      this.api.getJobStatus(jobId).subscribe({
        next: j => {
          this.job = j;
          if (j.status === 'completed' || j.status === 'failed') {
            if (this.pollInterval) clearInterval(this.pollInterval);
          }
        },
        error: () => { if (this.pollInterval) clearInterval(this.pollInterval); },
      });
    };
    fetch();
    this.pollInterval = setInterval(fetch, 2000);
  }

  viewRunbook() {
    if (this.job?.runbook_id) this.router.navigate(['/runbooks', this.job.runbook_id]);
  }

  reset() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.selectedFile = null;
    this.job = null;
    this.error = '';
  }

  readonly pipelineSteps = [
    { n: 1, title: 'PDF Text Extraction', desc: 'pdfplumber extracts text and tables from every page — no OCR needed for digital PDFs.' },
    { n: 2, title: 'LLM Classification', desc: 'DeepSeek classifies the runbook: title, category, severity, tags, estimated duration.' },
    { n: 3, title: 'Step Extraction', desc: 'LLM extracts each step as structured JSON: commands, dependencies, expected output, timeout.' },
    { n: 4, title: 'Validation', desc: 'Commands are validated for completeness. Dependency graph is checked for cycles.' },
    { n: 5, title: 'Graph Build', desc: 'NetworkX DiGraph is built from step dependencies. Critical path and parallel groups are computed.' },
    { n: 6, title: 'Storage', desc: 'Runbook, steps, and graph analysis stored in SQLite. Ready for instant SQL + graph queries.' },
  ];

  get statusClass() {
    if (!this.job) return '';
    return { pending: 'alert--info', processing: 'alert--info', completed: 'alert--success', failed: 'alert--error' }[this.job.status] ?? '';
  }
}
