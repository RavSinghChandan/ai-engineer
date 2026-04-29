import { Component, inject, computed, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="report-shell">

      <!-- ── Control bar ──────────────────────────────────────────────── -->
      <div class="ctrl-bar no-print">
        <button class="ctrl-btn" (click)="goBack()">← Back</button>
        <div class="ctrl-center">
          <span class="ctrl-title">✦ Final Report</span>
          @if (editMode()) {
            <span class="edit-badge">Editing</span>
          }
        </div>
        <div class="ctrl-actions">
          <button class="ctrl-btn ctrl-btn-ghost"
                  (click)="toggleEdit()"
                  [class.active-edit]="editMode()">
            {{ editMode() ? '✓ Done Editing' : '✎ Edit Report' }}
          </button>
          <button class="ctrl-btn ctrl-btn-ghost" (click)="copyJson()">
            {{ copied() ? '✓ Copied' : '{} JSON' }}
          </button>
          <button class="ctrl-btn ctrl-btn-primary" (click)="printPdf()">
            ⬇ Save PDF
          </button>
        </div>
      </div>

      @if (report()) {
        <div class="report-doc" id="report-doc" #reportDoc>

          <!-- ── Title page ──────────────────────────────────────────── -->
          <div class="title-page">
            <div class="logo-circle">✦</div>
            <p class="report-brand">{{ report()!.brand_name }}</p>
            <div class="title-divider"></div>
            <h1 class="report-main-title">{{ report()!.report_title }}</h1>
            <p class="report-subtitle">A comprehensive multi-discipline spiritual analysis</p>

            <div class="report-user-block">
              <span class="ru-label">Prepared for</span>
              <span class="ru-name">{{ report()!.user_name }}</span>
              <span class="ru-date">{{ formatDate(report()!.generated_at) }}</span>
            </div>

            @if (report()!.questions.length) {
              <div class="questions-summary">
                <div class="qs-label">Questions Analysed</div>
                @for (q of report()!.questions; track q; let qi = $index) {
                  <div class="qs-item">
                    <span class="qs-num">{{ qi + 1 }}.</span>
                    <span>{{ q }}</span>
                  </div>
                }
              </div>
            }

            <div class="modules-row">
              @for (m of report()!.modules_used; track m) {
                <span class="mod-pill">{{ m }}</span>
              }
            </div>

            <!-- Stats -->
            <div class="stats-row">
              <div class="stat-box">
                <div class="stat-val">{{ report()!.total_insights_approved }}</div>
                <div class="stat-lbl">Approved</div>
              </div>
              <div class="stat-box">
                <div class="stat-val">{{ report()!.modules_used.length }}</div>
                <div class="stat-lbl">Traditions</div>
              </div>
              <div class="stat-box">
                <div class="stat-val">{{ report()!.sections.length }}</div>
                <div class="stat-lbl">Questions</div>
              </div>
            </div>
          </div>

          <!-- ── Disclaimer ──────────────────────────────────────────── -->
          <div class="disclaimer-block">
            <p>{{ report()!.disclaimer }}</p>
          </div>

          <!-- ── Question sections ───────────────────────────────────── -->
          @for (section of report()!.sections; track section.question; let si = $index) {
            <div class="question-section">

              <!-- Section header -->
              <div class="sec-header">
                <div class="sec-qnum">Q{{ si + 1 }}</div>
                <div class="sec-qtext">{{ section.question }}</div>
                <div class="sec-intent">{{ section.intent | titlecase }}</div>
              </div>

              <!-- 360° Consolidated narrative -->
              <div class="narrative-block">
                <div class="narrative-label">360° Analysis</div>
                @if (editMode()) {
                  <textarea
                    class="narrative-edit"
                    [value]="getNarrative(si)"
                    (input)="setNarrative(si, $any($event.target).value)"
                    rows="6"
                    placeholder="Edit the consolidated narrative…">
                  </textarea>
                } @else {
                  <p class="narrative-text">{{ getNarrative(si) }}</p>
                }
              </div>

              <!-- Domain breakdown accordion (no-print) -->
              @if (section.domain_breakdown && objectKeys(section.domain_breakdown).length > 1) {
                <div class="domain-breakdown no-print">
                  <button class="breakdown-toggle" (click)="toggleBreakdown(si)">
                    {{ breakdownOpen()[si] ? '▾' : '▸' }} By Tradition
                  </button>
                  @if (breakdownOpen()[si]) {
                    <div class="breakdown-grid">
                      @for (domain of objectKeys(section.domain_breakdown); track domain) {
                        <div class="breakdown-card">
                          <div class="bc-domain">{{ domain | titlecase }}</div>
                          @for (text of section.domain_breakdown[domain]; track text) {
                            <p class="bc-text">{{ text }}</p>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Individual insights (editable) -->
              <div class="insights-list">
                <div class="insights-label no-print">Approved Insights</div>
                @for (insight of section.insights; track insight.id; let ii = $index) {
                  <div class="insight-row" [class.editing]="editMode()">
                    <div class="insight-meta">
                      <span class="conf-badge"
                            [class.conf-h]="insight.confidence === 'high'"
                            [class.conf-m]="insight.confidence === 'medium'"
                            [class.conf-l]="insight.confidence === 'low'">
                        {{ insight.confidence | uppercase }}
                      </span>
                      @if (insight.is_common) {
                        <span class="common-badge">MULTI-DOMAIN</span>
                      }
                      @for (d of insight.domains; track d) {
                        <span class="domain-badge">{{ d }}</span>
                      }
                      <span class="insight-id no-print">{{ insight.id }}</span>
                    </div>

                    @if (editMode()) {
                      <textarea
                        class="insight-edit"
                        [value]="getInsightText(si, ii)"
                        (input)="setInsightText(si, ii, $any($event.target).value)"
                        rows="3">
                      </textarea>
                    } @else {
                      <p class="insight-text">{{ getInsightText(si, ii) }}</p>
                    }
                  </div>
                }
              </div>

            </div>
          }

          <!-- ── Footer ──────────────────────────────────────────────── -->
          <div class="report-footer">
            <div class="footer-star">✦</div>
            <div class="footer-brand">{{ report()!.brand_name }}</div>
            <p class="footer-date">Generated on {{ formatDate(report()!.generated_at) }}</p>
            <p class="footer-copy">{{ report()!.closing_note }}</p>
          </div>

        </div>

        <!-- ── Prompt variants panel (no-print) ───────────────────────── -->
        @if (showPrompts()) {
          <div class="prompts-panel no-print">
            <div class="pp-header">
              <span>LLM Prompt Variants</span>
              <button class="pp-close" (click)="showPrompts.set(false)">✕</button>
            </div>
            @for (section of report()!.sections; track section.question; let si = $index) {
              @if (section.prompts) {
                <div class="pp-section">
                  <div class="pp-q">Q{{ si + 1 }}: {{ section.question }}</div>
                  @for (variantKey of promptVariantKeys; track variantKey) {
                    <div class="pp-variant">
                      <div class="pp-variant-label">
                        {{ variantLabel(variantKey) }}
                        <span class="pp-temp">temp={{ variantKey.includes('t01') ? '0.1' : '0' }}</span>
                      </div>
                      <pre class="pp-code">{{ section.prompts[variantKey]?.user }}</pre>
                    </div>
                  }
                </div>
              }
            }
          </div>
        }

        <div class="bottom-actions no-print">
          <button class="ctrl-btn ctrl-btn-ghost" (click)="showPrompts.set(!showPrompts())">
            {{ showPrompts() ? 'Hide' : 'View' }} Prompt Variants
          </button>
          <button class="ctrl-btn ctrl-btn-primary" (click)="printPdf()">
            ⬇ Save PDF
          </button>
        </div>

      } @else {
        <div class="no-report">
          <div class="nr-icon">✦</div>
          <p>No report generated yet.</p>
          <button class="ctrl-btn-plain" (click)="goBack()">← Go to Review</button>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f7f4ee; font-family: Georgia, serif; }

    /* ── Control bar ──────────────────────────────────────────────────────── */
    .ctrl-bar {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 24px; background: #fff; border-bottom: 1px solid #e8e4dc;
      flex-wrap: wrap; gap: 8px;
    }
    .ctrl-center  { flex: 1; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .ctrl-title   { font-size: 14px; font-weight: 700; color: #8a6a00; }
    .ctrl-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .edit-badge   { font-size: 10px; font-weight: 800; padding: 2px 10px; border-radius: 99px; background: #fef9c3; color: #854d0e; border: 1px solid #fde68a; letter-spacing: 0.06em; font-family: system-ui, sans-serif; }

    .ctrl-btn         { padding: 7px 16px; border-radius: 8px; border: 1px solid #e8e4dc; background: #f7f4ee; color: #555; font-size: 12px; font-weight: 600; cursor: pointer; font-family: Georgia, serif; transition: all 0.15s; }
    .ctrl-btn:hover   { background: #eee; }
    .ctrl-btn-ghost   { border-color: rgba(212,175,55,0.4); color: #8a6a00; background: transparent; }
    .ctrl-btn-ghost:hover { background: rgba(212,175,55,0.06); }
    .ctrl-btn-primary { background: linear-gradient(135deg,#8a6a00,#d4af37); color: #fff; border: none; }
    .ctrl-btn-primary:hover { opacity: 0.92; }
    .active-edit      { background: rgba(212,175,55,0.12) !important; border-color: #d4af37 !important; color: #8a6a00 !important; }
    .ctrl-btn-plain   { padding: 8px 20px; border-radius: 8px; border: 1px solid #e8e4dc; background: #fff; color: #555; font-size: 13px; cursor: pointer; }

    /* ── Report document ──────────────────────────────────────────────────── */
    .report-doc { max-width: 820px; margin: 32px auto 60px; background: #fff; border-radius: 16px; box-shadow: 0 4px 40px rgba(0,0,0,0.10); overflow: hidden; }

    /* ── Title page ───────────────────────────────────────────────────────── */
    .title-page {
      background: linear-gradient(160deg, #1a1410 0%, #2d2010 60%, #1a1410 100%);
      padding: 56px 48px 44px; text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 14px;
    }
    .logo-circle    { width: 60px; height: 60px; border-radius: 50%; background: rgba(212,175,55,0.12); border: 2px solid rgba(212,175,55,0.35); display: flex; align-items: center; justify-content: center; font-size: 26px; color: #d4af37; }
    .report-brand   { font-size: 11px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin: 0; }
    .title-divider  { width: 56px; height: 2px; background: linear-gradient(90deg,transparent,#d4af37,transparent); }
    .report-main-title { font-size: 26px; font-weight: 700; color: #fff; margin: 0; line-height: 1.3; }
    .report-subtitle   { font-size: 12px; color: rgba(255,255,255,0.45); margin: 0; }
    .report-user-block { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 4px; }
    .ru-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(255,255,255,0.3); }
    .ru-name  { font-size: 22px; font-weight: 700; color: #d4af37; }
    .ru-date  { font-size: 11px; color: rgba(255,255,255,0.3); }

    .questions-summary { background: rgba(255,255,255,0.05); border: 1px solid rgba(212,175,55,0.18); border-radius: 10px; padding: 14px 20px; text-align: left; max-width: 480px; width: 100%; }
    .qs-label { font-size: 9px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(212,175,55,0.55); margin-bottom: 8px; }
    .qs-item  { font-size: 12px; color: rgba(255,255,255,0.65); line-height: 1.65; display: flex; gap: 6px; }
    .qs-num   { color: #d4af37; font-weight: 700; flex-shrink: 0; }

    .modules-row { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
    .mod-pill    { padding: 3px 13px; border-radius: 99px; border: 1px solid rgba(212,175,55,0.25); color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 600; text-transform: capitalize; }

    .stats-row { display: flex; gap: 20px; justify-content: center; margin-top: 4px; }
    .stat-box  { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .stat-val  { font-size: 22px; font-weight: 700; color: #d4af37; }
    .stat-lbl  { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.3); }

    /* ── Disclaimer ───────────────────────────────────────────────────────── */
    .disclaimer-block { padding: 14px 48px; background: #fffbf0; border-bottom: 1px solid #f5e6b0; }
    .disclaimer-block p { font-size: 11px; color: #78350f; line-height: 1.7; margin: 0; text-align: center; }

    /* ── Question section ─────────────────────────────────────────────────── */
    .question-section { border-bottom: 2px solid #f0ece4; }
    .question-section:last-of-type { border-bottom: none; }

    .sec-header {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 18px 40px 14px;
      background: linear-gradient(90deg,#fffbf0,#fff);
      border-bottom: 1px solid #f0ece4;
    }
    .sec-qnum  { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,#8a6a00,#d4af37); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; margin-top: 2px; }
    .sec-qtext { flex: 1; font-size: 15px; font-weight: 600; color: #1a1a1a; line-height: 1.45; }
    .sec-intent{ flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: rgba(212,175,55,0.1); color: #8a6a00; border: 1px solid rgba(212,175,55,0.22); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }

    /* ── Narrative block ─────────────────────────────────────────────────── */
    .narrative-block { padding: 22px 40px; background: #fffdf6; border-bottom: 1px solid #f0ece4; }
    .narrative-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: #8a6a00; margin-bottom: 10px; }
    .narrative-text  { font-size: 15px; color: #1f2937; line-height: 1.9; margin: 0; }
    .narrative-edit  {
      width: 100%; box-sizing: border-box; padding: 12px; border-radius: 8px;
      border: 1.5px solid rgba(212,175,55,0.4); font-family: Georgia, serif;
      font-size: 14px; color: #1f2937; line-height: 1.85; background: #fff;
      resize: vertical; outline: none;
    }
    .narrative-edit:focus { border-color: #d4af37; box-shadow: 0 0 0 3px rgba(212,175,55,0.12); }

    /* ── Domain breakdown ────────────────────────────────────────────────── */
    .domain-breakdown { padding: 0 40px 4px; border-bottom: 1px solid #f0ece4; }
    .breakdown-toggle { background: none; border: none; color: #8a6a00; font-size: 12px; font-weight: 700; cursor: pointer; padding: 10px 0; font-family: Georgia, serif; }
    .breakdown-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding-bottom: 14px; }
    .breakdown-card   { background: #f9f6ee; border-radius: 8px; padding: 12px; }
    .bc-domain { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #8a6a00; margin-bottom: 6px; }
    .bc-text   { font-size: 11.5px; color: #555; line-height: 1.6; margin: 0 0 4px; }

    /* ── Insight rows ─────────────────────────────────────────────────────── */
    .insights-list  { padding: 4px 40px 20px; }
    .insights-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #aaa; margin: 14px 0 8px; }

    .insight-row { padding: 14px 0; border-bottom: 1px solid #f7f4ee; }
    .insight-row:last-child { border-bottom: none; }
    .insight-row.editing .insight-meta { margin-bottom: 8px; }

    .insight-meta   { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; align-items: center; }
    .conf-badge     { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.08em; }
    .conf-h { background: #dcfce7; color: #15803d; }
    .conf-m { background: #fef9c3; color: #854d0e; }
    .conf-l { background: #f3f4f6; color: #6b7280; }
    .common-badge   { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; background: rgba(212,175,55,0.1); color: #8a6a00; border: 1px solid rgba(212,175,55,0.22); letter-spacing: 0.06em; }
    .domain-badge   { font-size: 9.5px; background: #f3f4f6; color: #555; padding: 2px 8px; border-radius: 99px; font-weight: 600; text-transform: capitalize; }
    .insight-id     { font-size: 9px; color: #ccc; font-family: monospace; margin-left: auto; }

    .insight-text { font-size: 13.5px; color: #374151; line-height: 1.85; margin: 0; }
    .insight-edit {
      width: 100%; box-sizing: border-box; padding: 10px; border-radius: 7px;
      border: 1.5px solid rgba(212,175,55,0.3); font-family: Georgia, serif;
      font-size: 13px; color: #374151; line-height: 1.8; background: #fff;
      resize: vertical; outline: none;
    }
    .insight-edit:focus { border-color: #d4af37; box-shadow: 0 0 0 3px rgba(212,175,55,0.1); }

    /* ── Footer ───────────────────────────────────────────────────────────── */
    .report-footer { padding: 30px 48px; text-align: center; background: linear-gradient(160deg,#1a1410,#2d2010); display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .footer-star   { font-size: 22px; color: #d4af37; }
    .footer-brand  { font-size: 13px; font-weight: 700; color: #d4af37; letter-spacing: 0.1em; }
    .footer-date   { font-size: 10.5px; color: rgba(255,255,255,0.35); margin: 0; }
    .footer-copy   { font-size: 10px; color: rgba(255,255,255,0.22); margin: 0; max-width: 500px; line-height: 1.6; }

    /* ── Bottom actions ───────────────────────────────────────────────────── */
    .bottom-actions { max-width: 820px; margin: 0 auto 40px; display: flex; justify-content: flex-end; gap: 10px; padding: 0 4px; }

    /* ── Prompt variants panel ────────────────────────────────────────────── */
    .prompts-panel { max-width: 820px; margin: 0 auto 20px; background: #1a1410; border-radius: 12px; overflow: hidden; }
    .pp-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #d4af37; font-size: 13px; font-weight: 700; }
    .pp-close  { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 16px; cursor: pointer; }
    .pp-section{ padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .pp-q      { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 12px; font-style: italic; }
    .pp-variant{ margin-bottom: 14px; }
    .pp-variant-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #d4af37; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .pp-temp   { font-weight: 400; font-size: 9px; background: rgba(212,175,55,0.12); padding: 1px 7px; border-radius: 99px; color: rgba(212,175,55,0.7); }
    .pp-code   { background: rgba(255,255,255,0.04); border-radius: 6px; padding: 10px 14px; font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.65; white-space: pre-wrap; word-break: break-word; margin: 0; font-family: 'SF Mono', 'Fira Code', monospace; }

    /* ── Empty state ──────────────────────────────────────────────────────── */
    .no-report { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 14px; color: #9ca3af; }
    .nr-icon   { font-size: 48px; color: #d4af37; }

    /* ── Print ────────────────────────────────────────────────────────────── */
    @media print {
      .no-print { display: none !important; }
      :host { background: white; }
      .report-doc { margin: 0; border-radius: 0; box-shadow: none; max-width: 100%; }
      .insight-edit, .narrative-edit { border: none; resize: none; background: transparent; padding: 0; }
    }
  `]
})
export class ReportPage {
  private router = inject(Router);
  readonly orch   = inject(OrchestratorService);
  readonly copied    = signal(false);
  readonly editMode  = signal(false);
  readonly showPrompts = signal(false);
  readonly breakdownOpen = signal<Record<number, boolean>>({});

  // Local editable copies of narrative + insight texts
  private narrativeEdits = signal<Record<number, string>>({});
  private insightEdits   = signal<Record<string, string>>({});

  readonly report = computed(() => this.orch.finalReport());

  readonly promptVariantKeys = ['simple_t0', 'simple_t01', 'detailed_t0', 'detailed_t01'];

  // ── Edit helpers ──────────────────────────────────────────────────────────

  getNarrative(si: number): string {
    const edits = this.narrativeEdits();
    if (edits[si] !== undefined) return edits[si];
    return this.report()?.sections[si]?.narrative ?? '';
  }

  setNarrative(si: number, value: string): void {
    this.narrativeEdits.update(e => ({ ...e, [si]: value }));
  }

  getInsightText(si: number, ii: number): string {
    const key = `${si}_${ii}`;
    const edits = this.insightEdits();
    if (edits[key] !== undefined) return edits[key];
    return this.report()?.sections[si]?.insights[ii]?.content ?? '';
  }

  setInsightText(si: number, ii: number, value: string): void {
    const key = `${si}_${ii}`;
    this.insightEdits.update(e => ({ ...e, [key]: value }));
  }

  toggleEdit(): void {
    this.editMode.update(v => !v);
  }

  toggleBreakdown(si: number): void {
    this.breakdownOpen.update(m => ({ ...m, [si]: !m[si] }));
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  objectKeys(obj: Record<string, any>): string[] {
    return obj ? Object.keys(obj) : [];
  }

  variantLabel(key: string): string {
    const map: Record<string, string> = {
      simple_t0:    'Simple — Deterministic (temp=0)',
      simple_t01:   'Simple — Near-deterministic (temp=0.1)',
      detailed_t0:  'Detailed — Deterministic (temp=0)',
      detailed_t01: 'Detailed — Near-deterministic (temp=0.1)',
    };
    return map[key] ?? key;
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
  }

  printPdf(): void { window.print(); }

  copyJson(): void {
    const r = this.report();
    if (!r) return;
    navigator.clipboard.writeText(JSON.stringify(r, null, 2)).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  goBack(): void { this.router.navigate(['/review']); }
}
