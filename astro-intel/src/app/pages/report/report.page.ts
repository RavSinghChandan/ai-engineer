import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { FinalReport, ReviewSection } from '../../models/astro.models';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="report-shell">

      <!-- Control bar -->
      <div class="ctrl-bar no-print">
        <button class="ctrl-btn" (click)="goBack()">← Back to Review</button>
        <div class="ctrl-center">
          <span class="ctrl-title">✦ Final Report Preview</span>
        </div>
        <div class="ctrl-actions">
          <button class="ctrl-btn ctrl-btn-ghost" (click)="copyJson()">{{ copied() ? '✓ Copied' : '&#123;&#125; Copy JSON' }}</button>
          <button class="ctrl-btn ctrl-btn-primary" (click)="print()">🖨 Print / Save PDF</button>
        </div>
      </div>

      <!-- Report document -->
      @if (report()) {
        <div class="report-doc" id="report-doc">

          <!-- Title page -->
          <div class="title-page">
            <div class="logo-block">
              <div class="logo-circle">✦</div>
            </div>
            <h1 class="report-brand">{{ report()!.brand_name }}</h1>
            <div class="title-divider"></div>
            <h2 class="report-main-title">360° Spiritual Intelligence Report</h2>
            <p class="report-subtitle">A comprehensive multi-discipline spiritual analysis</p>
            <div class="report-user-block">
              <span class="ru-label">Prepared for</span>
              <span class="ru-name">{{ report()!.user_name }}</span>
              <span class="ru-date">{{ formatDate(report()!.generated_at) }}</span>
            </div>
            <div class="modules-used">
              @for (m of modulesUsed(); track m) {
                <span class="mod-pill">{{ m }}</span>
              }
            </div>
          </div>

          <!-- Disclaimer -->
          <div class="disclaimer-block">
            <p>This report is prepared for spiritual guidance and personal reflection. All insights are expressed as tendencies and possibilities — not absolute predictions. This is not a substitute for professional advice.</p>
          </div>

          <!-- Sections -->
          @for (section of report()!.sections; track section.id) {
            <div class="report-section" [attr.data-confidence]="section.confidence">
              <div class="rs-header">
                <h3 class="rs-title">{{ section.title }}</h3>
                <div class="rs-meta">
                  <span class="rs-conf" [class.conf-h]="section.confidence === 'high'" [class.conf-m]="section.confidence === 'medium'" [class.conf-l]="section.confidence === 'low'">
                    {{ section.confidence | uppercase }}
                  </span>
                  @for (src of section.sources; track src) {
                    <span class="rs-src">{{ src | titlecase }}</span>
                  }
                </div>
              </div>
              <p class="rs-content">{{ section.content }}</p>
            </div>
          }

          <!-- Footer -->
          <div class="report-footer">
            <div class="footer-logo">✦ {{ report()!.brand_name }}</div>
            <p class="footer-note">Generated on {{ formatDate(report()!.generated_at) }} · For personal and spiritual guidance only · Confidential</p>
            <p class="footer-copy">All insights are expressed as tendencies, not certainties. No fear-based claims are made.</p>
          </div>

        </div>
      } @else {
        <div class="no-report">
          <div class="nr-icon">✦</div>
          <p>No report generated yet.</p>
          <button class="ctrl-btn" (click)="goBack()">← Go to Review</button>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #e8e3d8; }

    /* ── Control bar ── */
    .ctrl-bar {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 24px; background: #1a0533;
      flex-wrap: wrap; gap: 8px;
    }
    .ctrl-center { flex: 1; text-align: center; }
    .ctrl-title  { font-size: 14px; font-weight: 700; color: #f5c842; }
    .ctrl-actions { display: flex; gap: 8px; }
    .ctrl-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.1); color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
    .ctrl-btn:hover { background: rgba(255,255,255,0.2); }
    .ctrl-btn-ghost   { border-color: rgba(245,200,66,0.4); color: #f5c842; }
    .ctrl-btn-primary { background: #7c3aed; border-color: #7c3aed; }
    .ctrl-btn-primary:hover { background: #6d28d9; }

    /* ── Report doc ── */
    .report-doc {
      max-width: 800px; margin: 32px auto 60px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 4px 40px rgba(0,0,0,0.15);
      overflow: hidden;
    }

    /* ── Title page ── */
    .title-page {
      background: linear-gradient(160deg, #1a0533 0%, #2d1054 60%, #1a0533 100%);
      padding: 60px 48px 48px; text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 14px;
    }
    .logo-block { margin-bottom: 8px; }
    .logo-circle {
      width: 64px; height: 64px; border-radius: 50%;
      background: rgba(245,200,66,0.15); border: 2px solid rgba(245,200,66,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; color: #f5c842;
    }
    .report-brand { font-size: 13px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0; }
    .title-divider { width: 60px; height: 2px; background: linear-gradient(90deg, transparent, #f5c842, transparent); }
    .report-main-title { font-size: 30px; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: -0.02em; }
    .report-subtitle { font-size: 13px; color: rgba(255,255,255,0.55); margin: 0; }
    .report-user-block { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 8px; }
    .ru-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(255,255,255,0.4); }
    .ru-name  { font-size: 22px; font-weight: 700; color: #f5c842; }
    .ru-date  { font-size: 11px; color: rgba(255,255,255,0.4); }
    .modules-used { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 8px; }
    .mod-pill { padding: 4px 14px; border-radius: 99px; border: 1px solid rgba(245,200,66,0.3); color: rgba(255,255,255,0.6); font-size: 10.5px; font-weight: 600; text-transform: capitalize; }

    /* ── Disclaimer ── */
    .disclaimer-block { padding: 18px 48px; background: #fef9c3; border-bottom: 1px solid #fde68a; }
    .disclaimer-block p { font-size: 11.5px; color: #78350f; line-height: 1.7; margin: 0; text-align: center; }

    /* ── Report section ── */
    .report-section {
      padding: 28px 48px; border-bottom: 1px solid #f0ede6;
      transition: background 0.15s;
    }
    .report-section:last-of-type { border-bottom: none; }
    .report-section:hover { background: #fafaf8; }

    .rs-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
    .rs-title  { font-size: 17px; font-weight: 800; color: #1f1035; margin: 0; }
    .rs-meta   { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

    .rs-conf { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.1em; }
    .conf-h { background: #dcfce7; color: #15803d; }
    .conf-m { background: #fef9c3; color: #854d0e; }
    .conf-l { background: #f3f4f6; color: #6b7280; }

    .rs-src { font-size: 9.5px; background: #ede9fe; color: #7c3aed; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
    .rs-content { font-size: 14px; color: #374151; line-height: 1.85; margin: 0; }

    /* ── Footer ── */
    .report-footer {
      padding: 32px 48px; text-align: center;
      background: linear-gradient(160deg, #1a0533, #2d1054);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .footer-logo { font-size: 14px; font-weight: 700; color: #f5c842; letter-spacing: 0.1em; }
    .footer-note  { font-size: 10.5px; color: rgba(255,255,255,0.4); margin: 0; }
    .footer-copy  { font-size: 10px; color: rgba(255,255,255,0.25); margin: 0; }

    /* ── No report ── */
    .no-report { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 14px; color: #9ca3af; }
    .nr-icon { font-size: 48px; color: #d1d5db; }

    /* ── Print ── */
    @media print {
      .no-print { display: none !important; }
      :host { background: white; }
      .report-doc { margin: 0; border-radius: 0; box-shadow: none; max-width: 100%; }
      .report-section:hover { background: white; }
    }
  `]
})
export class ReportPage {
  private router = inject(Router);
  readonly orch  = inject(OrchestratorService);
  readonly copied = signal(false);

  readonly report = computed(() => this.orch.finalReport());

  readonly modulesUsed = computed(() => {
    const input = this.orch.currentInput();
    return input?.selected_modules ?? [];
  });

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
  }

  print(): void {
    window.print();
  }

  copyJson(): void {
    const report = this.report();
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  goBack(): void { this.router.navigate(['/review']); }
}
