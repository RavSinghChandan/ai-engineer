import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportService } from '../../services/report.service';

type Mode = 'report' | 'carousel';

@Component({
  selector: 'app-report-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-form.component.html',
  styleUrl: './report-form.component.css',
})
export class ReportFormComponent implements OnDestroy {
  mode: Mode = 'report';

  textInput    = '';
  dataFile:      File | null = null;
  logo:          File | null = null;
  profilePic:    File | null = null;
  authorName   = '';
  carouselTopic = '';

  logoPreview:    string | null = null;
  profilePreview: string | null = null;

  loading     = false;
  elapsed     = 0;          // seconds shown in spinner
  error       = '';
  downloadUrl = '';
  reportReady = false;
  filename    = 'download.pdf';

  private _timer: any = null;

  constructor(private reportSvc: ReportService) {}

  ngOnDestroy(): void { this._stopTimer(); }

  // ── File handlers ──────────────────────────────────────────────────────────

  onDataFile(e: Event): void {
    this.dataFile = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.resetResult();
  }

  onLogo(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.logo        = f;
    this.logoPreview = f ? URL.createObjectURL(f) : null;
  }

  onProfilePic(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.profilePic     = f;
    this.profilePreview = f ? URL.createObjectURL(f) : null;
  }

  clearDataFile(): void { this.dataFile = null; this.resetResult(); }
  clearLogo():     void { this.logo = null; this.logoPreview = null; }
  clearProfile():  void { this.profilePic = null; this.profilePreview = null; }

  // ── Validation ─────────────────────────────────────────────────────────────

  get canSubmit(): boolean {
    if (this.loading) return false;
    if (this.mode === 'carousel') return this.carouselTopic.trim().length > 0;
    return this.textInput.trim().length > 0 || this.dataFile !== null;
  }

  get elapsedLabel(): string {
    return this.elapsed < 60
      ? `${this.elapsed}s`
      : `${Math.floor(this.elapsed / 60)}m ${this.elapsed % 60}s`;
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  generate(): void {
    if (!this.canSubmit) return;
    this.loading = true;
    this.error   = '';
    this.elapsed = 0;
    this.resetResult();
    this._startTimer();

    const source$ = this.mode === 'carousel'
      ? this.reportSvc.generateCarousel(this.carouselTopic)
      : this.reportSvc.generateReport({
          textInput:  this.textInput,
          file:       this.dataFile  ?? undefined,
          logo:       this.logo      ?? undefined,
          profilePic: this.profilePic ?? undefined,
          authorName: this.authorName,
        });

    this.filename = this.mode === 'carousel' ? 'carousel.pdf' : 'ai_report_full.pdf';

    source$.subscribe({
      next: (blob) => {
        this._stopTimer();
        this.downloadUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        this.reportReady = true;
        this.loading     = false;
      },
      error: async (err) => {
        this._stopTimer();
        let msg = 'Request failed. Check that the backend is running on port 8002.';

        if (err.name === 'TimeoutError') {
          msg = 'Request timed out after 2 minutes. The backend may be overloaded — please try again.';
        } else if (err.error instanceof Blob) {
          try {
            const parsed = JSON.parse(await err.error.text());
            msg = parsed?.detail ?? msg;
          } catch { /* not JSON */ }
        } else if (err?.error?.detail) {
          msg = err.error.detail;
        } else if (err?.message) {
          msg = err.message;
        }

        this.error   = msg;
        this.loading = false;
      },
    });
  }

  download(): void {
    if (!this.downloadUrl) return;
    const a = document.createElement('a');
    a.href     = this.downloadUrl;
    a.download = this.filename;
    a.click();
  }

  switchMode(m: Mode): void {
    this.mode = m;
    this.error = '';
    this.resetResult();
  }

  private resetResult(): void {
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = '';
    this.reportReady = false;
  }

  private _startTimer(): void {
    this._stopTimer();
    this._timer = setInterval(() => { this.elapsed++; }, 1000);
  }

  private _stopTimer(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}
