import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- ── Toolbar (hidden in print) ──────────────────────────────────────── -->
    <div class="toolbar no-print">
      <button class="tb-btn" (click)="goBack()">← Back</button>
      <span class="tb-title">Report Preview</span>
      <div class="tb-right">
        <button class="tb-btn" [class.tb-active]="editMode()" (click)="editMode.set(!editMode())">
          {{ editMode() ? '✓ Done' : '✎ Edit' }}
        </button>
        <button class="tb-btn-gold" (click)="printPdf()">⬇ Save PDF</button>
      </div>
    </div>

    @if (report()) {
      <div class="report-wrap" id="report-doc">

        <!-- ══════════════════════════════════════════════════════════════════ -->
        <!-- COVER PAGE                                                         -->
        <!-- ══════════════════════════════════════════════════════════════════ -->
        <div class="cover page-break-after no-print">

          <!-- Astrologer photo (full bleed background) -->
          <div class="cover-photo-wrap">
            <img src="rav-photo.png" alt="Rav" class="cover-photo" />
            <div class="cover-photo-overlay"></div>
          </div>

          <!-- Cover content — centred column -->
          <div class="cover-content">

            <!-- Centred logo — 50% of page width -->
            <div class="cover-logo-wrap">
              <div class="cover-logo-circle">
                <img src="rav-logo.png" alt="Aura with Rav" class="cover-logo-center" />
              </div>
            </div>

            <div class="cover-tag">Personal Spiritual Intelligence Report</div>
            <h1 class="cover-name">{{ report()!.user_name }}</h1>
            <div class="cover-divider"></div>
            <p class="cover-subtitle">
              A personalised reading prepared through the combined wisdom of<br>
              Vedic Astrology · Numerology · Tarot
            </p>
            <div class="cover-date">{{ formatDate(report()!.generated_at) }}</div>

            <!-- Questions listed on cover -->
            <div class="cover-questions">
              @for (q of report()!.questions; track q; let qi = $index) {
                <div class="cq-item">
                  <span class="cq-num">{{ qi + 1 }}</span>
                  <span class="cq-text">{{ q }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Bottom bar -->
          <div class="cover-footer">
            <span>Prepared by Aura with Rav · Confidential · For personal guidance only</span>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════════════ -->
        <!-- LETTER FROM ASTROLOGER                                             -->
        <!-- ══════════════════════════════════════════════════════════════════ -->
        <div class="inner-page page-break-after letter-page">
          <div class="page-header">
            <img src="rav-logo.png" alt="Aura with Rav" class="page-logo" />
          </div>

          <div class="letter-section">
            <h2 class="section-heading">A Message for {{ report()!.user_name }}</h2>
            <div class="gold-rule"></div>
            <div class="letter-body">
              <p>Dear {{ report()!.user_name }},</p>
              <p>
                Thank you for trusting Aura with Rav with your questions. This report has been prepared
                with care, drawing on the ancient wisdom of Vedic Astrology, Numerology, and Tarot — three
                traditions that, when read together, offer a remarkably coherent picture of your journey.
              </p>
              <p>
                The insights you will find here are not predictions set in stone. They are tendencies,
                patterns, and energies that the cosmos reflects back at this moment in your life. Your
                awareness, your choices, and your intentions remain the most powerful forces at work.
              </p>
              <p>
                Read each section slowly. Sit with what resonates. Let the rest pass.
              </p>
              <p class="letter-sign">With light and clarity,<br><strong>Rav</strong><br><em>Aura with Rav</em></p>
            </div>
          </div>

          <div class="disclaimer-box">
            {{ report()!.disclaimer }}
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════════════ -->
        <!-- QUESTION SECTIONS (one page per question)                          -->
        <!-- ══════════════════════════════════════════════════════════════════ -->
        @for (section of report()!.sections; track section.question; let si = $index) {
          <div class="inner-page question-page page-break-after">

            <div class="page-header">
              <img src="rav-logo.png" alt="Aura with Rav" class="page-logo" />
              <span class="page-header-right">{{ report()!.user_name }} · {{ formatDate(report()!.generated_at) }}</span>
            </div>

            <!-- Question label -->
            <div class="q-label-row">
              <div class="q-circle">Q{{ si + 1 }}</div>
              <div class="q-label-text">{{ section.question }}</div>
            </div>

            <!-- Summary — structured bullets (WHO/WHAT/WHEN/WHERE/HOW) -->
            <div class="section-block summary-block">
              <h3 class="block-heading">Summary</h3>
              <div class="gold-rule"></div>

              @if (section.structured_summary && !editMode()) {
                <!-- HW bullets -->
                <ul class="hw-list">
                  @for (b of section.structured_summary.hw_bullets; track b.label) {
                    <li class="hw-item">
                      <span class="hw-label" [innerHTML]="colorize(b.label)"></span>
                      <span class="hw-answer" [innerHTML]="colorize(b.answer)"></span>
                    </li>
                  }
                </ul>

                <!-- Remedies -->
                @if (section.structured_summary.remedy_bullets) {
                  <div class="remedy-block">
                    <div class="remedy-heading">Remedies to support your journey</div>
                    @if (section.structured_summary.remedy_bullets.daily_habits?.length) {
                      <div class="remedy-group">
                        <div class="remedy-subhead">Daily Habits</div>
                        <ul class="remedy-list">
                          @for (h of section.structured_summary.remedy_bullets.daily_habits; track h) {
                            <li [innerHTML]="colorize(h)"></li>
                          }
                        </ul>
                      </div>
                    }
                    @if (section.structured_summary.remedy_bullets.mantras?.length) {
                      <div class="remedy-group">
                        <div class="remedy-subhead">Mantra</div>
                        <ul class="remedy-list">
                          @for (m of section.structured_summary.remedy_bullets.mantras; track m) {
                            <li [innerHTML]="colorize(m)"></li>
                          }
                        </ul>
                      </div>
                    }
                    @if (section.structured_summary.remedy_bullets.lucky_colors?.length) {
                      <div class="remedy-group">
                        <div class="remedy-subhead">Lucky Colors</div>
                        <ul class="remedy-list">
                          @for (c of section.structured_summary.remedy_bullets.lucky_colors; track c) {
                            <li [innerHTML]="colorize(c)"></li>
                          }
                        </ul>
                      </div>
                    }
                  </div>
                }
              } @else if (editMode()) {
                <textarea class="edit-area"
                  [value]="getNarrative(si)"
                  (input)="setNarrative(si, $any($event.target).value)"
                  rows="6"></textarea>
              } @else {
                <!-- Fallback prose when no structured summary -->
                <p class="narrative-para" [innerHTML]="colorize(getNarrative(si))"></p>
              }
            </div>

            <!-- Per-insight explanations (What the traditions say) -->
            @if (section.insights && section.insights.length) {
              <div class="section-block">
                <h3 class="block-heading">What the traditions say</h3>
                <div class="gold-rule"></div>

                @for (ins of section.insights; track ins.id; let ii = $index) {
                  <div class="insight-prose">
                    <div class="insight-tradition">{{ traditionLabel(ins.domains) }}</div>
                    @if (editMode()) {
                      <textarea class="edit-area"
                        [value]="getInsight(si, ii)"
                        (input)="setInsight(si, ii, $any($event.target).value)"
                        rows="4"></textarea>
                    } @else {
                      <p class="insight-text" [innerHTML]="colorize(getInsight(si, ii))"></p>
                    }
                  </div>
                }
              </div>
            }

          </div>
        }

        <!-- ══════════════════════════════════════════════════════════════════ -->
        <!-- CLOSING PAGE                                                        -->
        <!-- ══════════════════════════════════════════════════════════════════ -->
        <div class="inner-page closing-page">
          <div class="page-header">
            <img src="rav-logo.png" alt="Aura with Rav" class="page-logo" />
          </div>

          <div class="closing-content">
            <img src="rav-photo.png" alt="Rav" class="closing-photo" />
            <h2 class="closing-heading">Thank you, {{ report()!.user_name }}</h2>
            <div class="gold-rule" style="margin: 0 auto 20px;"></div>
            <p class="closing-text">{{ report()!.closing_note }}</p>
            <p class="closing-text">
              For follow-up consultations, personalised sessions, or deeper readings,
              reach out through <strong>Aura with Rav</strong>.
            </p>
            <div class="closing-seal">✦</div>
          </div>

          <div class="final-footer">
            <img src="rav-logo.png" alt="Aura with Rav" class="footer-logo" />
            <span>{{ formatDate(report()!.generated_at) }} · Confidential · For personal guidance only</span>
          </div>
        </div>

      </div><!-- /report-wrap -->
    } @else {
      <div class="no-report">
        <p>No report yet.</p>
        <button class="tb-btn" (click)="goBack()">← Back to Review</button>
      </div>
    }
  `,
  styles: [`
    /* ── Base ───────────────────────────────────────────────────────────────── */
    :host {
      display: block; min-height: 100vh;
      background: #eae6df;
      font-family: 'Georgia', 'Times New Roman', serif;
    }

    /* ── Toolbar ─────────────────────────────────────────────────────────────── */
    .toolbar {
      position: sticky; top: 0; z-index: 200;
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 28px; background: #1a1410; gap: 12px;
    }
    .tb-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6); letter-spacing: 0.08em; }
    .tb-right  { display: flex; gap: 8px; align-items: center; }
    .tb-btn    { padding: 6px 16px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.18); background: transparent; color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 600; cursor: pointer; font-family: Georgia, serif; transition: all 0.15s; }
    .tb-btn:hover   { background: rgba(255,255,255,0.08); }
    .tb-active      { border-color: #d4af37; color: #d4af37; }
    .tb-btn-gold    { padding: 7px 20px; border-radius: 7px; border: none; background: linear-gradient(135deg,#8a6a00,#d4af37); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; font-family: Georgia, serif; }

    /* ── Report wrapper ──────────────────────────────────────────────────────── */
    .report-wrap {
      max-width: 780px; margin: 28px auto 60px;
      display: flex; flex-direction: column; gap: 0;
      box-shadow: 0 8px 60px rgba(0,0,0,0.22);
    }

    /* ══════════════════════════════════════════════════════════════════════════ */
    /* COVER PAGE                                                                 */
    /* ══════════════════════════════════════════════════════════════════════════ */
    .cover {
      position: relative; min-height: 100vh;
      background: #1a1410;
      display: flex; flex-direction: column;
      overflow: hidden;
    }

    /* ── Cover top-left logo ──────────────────────────────────────────────────── */
    .cover-logo-wrap {
      display: flex; justify-content: flex-start; align-items: flex-start;
      width: 100%; margin-bottom: 28px;
    }
    .cover-logo-circle {
      width: 180px; height: 180px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid rgba(212,175,55,0.5);
      box-shadow: 0 0 28px rgba(212,175,55,0.3);
      flex-shrink: 0;
    }
    .cover-logo-center {
      width: 100%; height: 100%;
      object-fit: cover;
    }

    .cover-photo-wrap {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: flex-end;
    }
    .cover-photo {
      height: 100%; width: 52%;
      object-fit: cover; object-position: center top;
      opacity: 0.35;
    }
    .cover-photo-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(100deg, #1a1410 45%, transparent 80%);
    }

    .cover-content {
      position: relative; z-index: 10;
      padding: 40px 48px 40px;
      flex: 1; display: flex; flex-direction: column;
      align-items: flex-start; justify-content: center;
      text-align: left;
    }
    .cover-tag {
      font-size: 10px; font-weight: 800; letter-spacing: 0.22em;
      text-transform: uppercase; color: #d4af37; margin-bottom: 18px;
    }
    .cover-name {
      font-size: 42px; font-weight: 900; color: #fff;
      margin: 0 0 16px; line-height: 1.15;
    }
    .cover-divider {
      width: 56px; height: 2px;
      background: linear-gradient(90deg, #d4af37, transparent);
      margin: 0 0 20px;
    }
    .cover-subtitle {
      font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.55);
      line-height: 1.8; margin: 0 0 24px;
    }
    .cover-date {
      font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.35);
      letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 32px;
    }

    .cover-questions { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 480px; }
    .cq-item { display: flex; gap: 12px; align-items: flex-start; text-align: left; }
    .cq-num  {
      flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
      background: rgba(212,175,55,0.2); border: 1px solid rgba(212,175,55,0.4);
      color: #d4af37; font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; margin-top: 1px;
    }
    .cq-text { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6; }

    .cover-footer {
      position: relative; z-index: 10;
      padding: 18px 48px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 10px; color: rgba(255,255,255,0.3);
      letter-spacing: 0.08em; text-align: center;
    }

    /* ══════════════════════════════════════════════════════════════════════════ */
    /* INNER PAGES                                                                */
    /* ══════════════════════════════════════════════════════════════════════════ */
    .inner-page {
      background: #fff;
      padding: 0;
      display: flex; flex-direction: column;
      min-height: 100vh;
    }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 40px 16px;
      border-bottom: 1.5px solid #f0ece4;
      background: #fffdf8;
    }
    .page-logo {
      height: 32px; width: 32px;
      object-fit: cover; border-radius: 50%;
      border: 1.5px solid rgba(212,175,55,0.4);
    }
    @media print {
      .page-logo { height: 96px !important; width: 96px !important; }
    }
    .page-header-right { font-size: 10px; color: #aaa; letter-spacing: 0.08em; text-transform: uppercase; }

    /* ── Letter section ───────────────────────────────────────────────────────── */
    .letter-section { padding: 48px 52px 32px; flex: 1; }
    .section-heading {
      font-size: 22px; font-weight: 800; color: #1a1410;
      margin: 0 0 10px; letter-spacing: 0.01em;
    }
    .gold-rule {
      width: 48px; height: 2px;
      background: linear-gradient(90deg, #d4af37, rgba(212,175,55,0.2));
      margin-bottom: 28px;
    }
    .letter-body p {
      font-size: 14.5px; font-weight: 600; color: #374151; line-height: 1.95;
      margin: 0 0 18px;
    }
    .letter-sign { margin-top: 28px; font-size: 14px; font-weight: 600; color: #374151; line-height: 1.8; }

    .disclaimer-box {
      margin: 0 52px 48px;
      padding: 14px 20px;
      background: #fffbf0; border: 1px solid #f5e6b0; border-radius: 8px;
      font-size: 11px; color: #78350f; line-height: 1.75; text-align: center;
    }

    /* ── Question label ───────────────────────────────────────────────────────── */
    .q-label-row {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 32px 52px 0;
    }
    .q-circle {
      flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #8a6a00, #d4af37);
      color: #fff; font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-top: 3px;
    }
    .q-label-text {
      font-size: 20px; font-weight: 800; color: #1a1410; line-height: 1.4;
    }

    /* ── Content blocks ───────────────────────────────────────────────────────── */
    .section-block { padding: 28px 52px 0; }
    .block-heading {
      font-size: 13px; font-weight: 800; letter-spacing: 0.14em;
      text-transform: uppercase; color: #8a6a00; margin: 0 0 8px;
    }

    .narrative-para {
      font-size: 15px; font-weight: 600; color: #1f2937; line-height: 2.0;
      margin: 0; padding-bottom: 8px;
    }

    /* ── Per-tradition prose ─────────────────────────────────────────────────── */
    .insight-prose {
      margin-bottom: 22px; padding-bottom: 22px;
      border-bottom: 1px solid #f0ece4;
    }
    .insight-prose:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 32px; }
    .insight-tradition {
      font-size: 10px; font-weight: 800; letter-spacing: 0.14em;
      text-transform: uppercase; color: #d4af37; margin-bottom: 8px;
    }
    .insight-text {
      font-size: 13.5px; font-weight: 600; color: #374151; line-height: 1.9;
      margin: 0;
    }

    /* ── Structured HW bullet list ──────────────────────────────────────────── */
    .hw-list {
      list-style: none; margin: 0 0 24px; padding: 0;
      display: flex; flex-direction: column; gap: 12px;
    }
    .hw-item {
      display: flex; flex-direction: column; gap: 3px;
      padding: 12px 16px;
      background: #faf8f3; border-left: 3px solid #d4af37;
      border-radius: 0 8px 8px 0;
    }
    .hw-label {
      font-size: 10px; font-weight: 800; letter-spacing: 0.14em;
      text-transform: uppercase; color: #92600a;
    }
    .hw-answer {
      font-size: 14px; font-weight: 600; color: #1f2937; line-height: 1.75;
    }

    /* ── Remedy block ────────────────────────────────────────────────────────── */
    .remedy-block {
      margin-top: 28px; padding: 20px 22px;
      background: linear-gradient(135deg, #fdf8ee, #fffbf2);
      border: 1px solid rgba(212,175,55,0.25); border-radius: 12px;
    }
    .remedy-heading {
      font-size: 11px; font-weight: 800; letter-spacing: 0.16em;
      text-transform: uppercase; color: #b45309; margin-bottom: 16px;
    }
    .remedy-group { margin-bottom: 14px; }
    .remedy-group:last-child { margin-bottom: 0; }
    .remedy-subhead {
      font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: #6d28d9; margin-bottom: 6px;
    }
    .remedy-list {
      list-style: none; margin: 0; padding: 0;
      display: flex; flex-direction: column; gap: 5px;
    }
    .remedy-list li {
      font-size: 13px; font-weight: 600; color: #374151; line-height: 1.75;
      padding-left: 14px; position: relative;
    }
    .remedy-list li::before {
      content: '✦'; position: absolute; left: 0;
      color: #d4af37; font-size: 8px; top: 5px;
    }

    /* ── Summary block ───────────────────────────────────────────────────────── */
    .summary-block { position: relative; }

    /* ── Edit areas ──────────────────────────────────────────────────────────── */
    .edit-area {
      width: 100%; box-sizing: border-box; padding: 10px 14px;
      border: 1.5px solid #d4af37; border-radius: 8px;
      font-family: Georgia, serif; font-size: 13.5px; color: #374151;
      line-height: 1.85; background: #fffbf0; resize: vertical; outline: none;
    }
    .edit-area:focus { box-shadow: 0 0 0 3px rgba(212,175,55,0.15); }

    /* ══════════════════════════════════════════════════════════════════════════ */
    /* CLOSING PAGE                                                               */
    /* ══════════════════════════════════════════════════════════════════════════ */
    .closing-page { background: #1a1410; }
    .closing-page .page-header {
      background: transparent; border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .closing-page .page-logo { filter: brightness(10); opacity: 0.7; }
    .closing-page .page-header-right { color: rgba(255,255,255,0.3); }

    .closing-content {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 60px 48px 40px; text-align: center;
    }
    .closing-photo {
      width: 140px; height: 140px; border-radius: 50%;
      object-fit: cover; object-position: center top;
      border: 3px solid rgba(212,175,55,0.4);
      margin-bottom: 28px;
    }
    .closing-heading {
      font-size: 26px; font-weight: 800; color: #fff;
      margin: 0 0 14px;
    }
    .closing-text {
      font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.6);
      line-height: 1.9; margin: 0 0 16px; max-width: 480px;
    }
    .closing-seal { font-size: 36px; color: #d4af37; margin-top: 20px; }

    .final-footer {
      display: flex; align-items: center; justify-content: center; gap: 16px;
      padding: 20px 40px; border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 10px; color: rgba(255,255,255,0.25);
      letter-spacing: 0.08em; text-align: center;
    }
    .footer-logo {
      height: 22px; width: 22px;
      object-fit: cover; border-radius: 50%;
      filter: brightness(10); opacity: 0.3;
    }

    /* ── Empty state ─────────────────────────────────────────────────────────── */
    .no-report {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 60vh; gap: 16px;
      color: #9ca3af; font-size: 14px;
    }

    /* ══════════════════════════════════════════════════════════════════════════ */
    /* PRINT STYLES                                                               */
    /* ══════════════════════════════════════════════════════════════════════════ */
    @page { margin: 0; size: A4; }
    @media print {
      :host { background: white; }
      .no-print { display: none !important; }
      .report-wrap { margin: 0; max-width: 100%; box-shadow: none; }
      .cover, .inner-page { min-height: 100vh; }
      .page-break-after { page-break-after: always; }
      .edit-area { border: none; background: transparent; resize: none; padding: 0; }

      /* Ensure images print — base64 src set by printPdf() */
      img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      /* Logo circles in print */
      .page-logo, .footer-logo { border-radius: 50% !important; }
      /* Cover logo circle — preserved in print */
      .cover-logo-circle {
        width: 180px !important; height: 180px !important;
        border-radius: 50% !important; overflow: hidden !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .cover-logo-center { width: 100% !important; height: 100% !important; object-fit: cover !important; }

      /* Force cover background photo to print */
      .cover { position: relative !important; overflow: hidden !important; }
      .cover-photo-wrap { position: absolute !important; inset: 0 !important; display: flex !important; }
      .cover-photo {
        display: block !important; visibility: visible !important;
        opacity: 0.35 !important; height: 100% !important; width: 52% !important;
        object-fit: cover !important; object-position: center top !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .cover-photo-overlay {
        display: block !important; position: absolute !important; inset: 0 !important;
        background: linear-gradient(100deg, #1a1410 45%, transparent 80%) !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
    }
  `]
})
export class ReportPage {
  private router = inject(Router);
  readonly orch     = inject(OrchestratorService);
  readonly editMode = signal(false);
  readonly report   = computed(() => this.orch.finalReport());

  private narrativeEdits = signal<Record<number, string>>({});
  private insightEdits   = signal<Record<string, string>>({});

  // ── Sentiment lexicon ────────────────────────────────────────────────────────
  // Each entry: [word, category]
  // Categories: auspicious | love | planetary | caution | strength | spiritual | timing
  private readonly LEXICON: Record<string, string> = {
    // Auspicious / positive outcomes
    favored:'auspicious', favorable:'auspicious', auspicious:'auspicious',
    prosperity:'auspicious', abundant:'auspicious', abundance:'auspicious',
    growth:'auspicious', flourish:'auspicious', success:'auspicious',
    blessed:'auspicious', fortune:'auspicious', fortunate:'auspicious',
    rewarded:'auspicious', gains:'auspicious', positive:'auspicious',
    indicated:'auspicious', supported:'auspicious', benefits:'auspicious',
    opportunities:'auspicious', opportunity:'auspicious', expand:'auspicious',
    wisdom:'auspicious', clarity:'auspicious', fulfillment:'auspicious',
    achievement:'auspicious', accomplish:'auspicious', joy:'auspicious',
    healing:'auspicious', renewal:'auspicious', optimism:'auspicious',
    harmonious:'auspicious', harmony:'auspicious', blessings:'auspicious',
    noble:'auspicious', elevated:'auspicious', bright:'auspicious',

    // Love / relationship / marriage
    marriage:'love', partner:'love', partnership:'love', relationship:'love',
    love:'love', romantic:'love', bond:'love', commitment:'love',
    spouse:'love', companion:'love', soulmate:'love', union:'love',
    wedding:'love', married:'love', compatibility:'love', compatible:'love',
    nurturing:'love', nurture:'love', affection:'love', devoted:'love',
    emotional:'love', heart:'love', deep:'love',
    intimate:'love', warmth:'love', caring:'love', loyal:'love',
    expressive:'love', connection:'love', connect:'love',

    // Planetary / astrological terms
    lagna:'planetary', ascendant:'planetary', nakshatra:'planetary',
    dasha:'planetary', mahadasha:'planetary', antardasha:'planetary',
    venus:'planetary', jupiter:'planetary', saturn:'planetary',
    mars:'planetary', mercury:'planetary', moon:'planetary',
    rahu:'planetary', ketu:'planetary', sun:'planetary',
    vedic:'planetary', kp:'planetary', western:'planetary',
    cusp:'planetary', transit:'planetary', yoga:'planetary',
    house:'planetary', lord:'planetary', placement:'planetary',
    chart:'planetary', planetary:'planetary', signification:'planetary',
    nakshtra:'planetary', vishakha:'planetary', rohini:'planetary',

    // Strength / courage / confidence
    strength:'strength', strong:'strength', courage:'strength',
    confident:'strength', resilience:'strength', determined:'strength',
    powerful:'strength', assertive:'strength', leadership:'strength',
    ambitious:'strength', disciplined:'strength', decisive:'strength',
    independent:'strength', stable:'strength', steadfast:'strength',
    energised:'strength', energized:'strength', momentum:'strength',
    focused:'strength', deliberate:'strength', purposeful:'strength',

    // Spiritual / inner wisdom
    spiritual:'spiritual', spiritually:'spiritual', inner:'spiritual',
    soul:'spiritual', karma:'spiritual',
    divine:'spiritual', sacred:'spiritual', intuition:'spiritual',
    intuitive:'spiritual', meditation:'spiritual', mantra:'spiritual',
    dharma:'spiritual', consciousness:'spiritual', awakening:'spiritual',
    insight:'spiritual', enlightenment:'spiritual', transcendent:'spiritual',
    deeper:'spiritual', profound:'spiritual',
    universe:'spiritual', cosmic:'spiritual', ancient:'spiritual',

    // Timing / cycles
    timing:'timing', period:'timing', cycle:'timing', phase:'timing',
    window:'timing', ages:'timing', year:'timing', years:'timing',
    shortly:'timing', soon:'timing', approaching:'timing', ahead:'timing',
    current:'timing', active:'timing', opening:'timing', emerging:'timing',

    // Caution / reflection / patience
    delay:'caution', patience:'caution', wait:'caution', caution:'caution',
    challenge:'caution', difficult:'caution', obstacle:'caution',
    reversed:'caution', reflection:'caution', pause:'caution',
    unconventional:'caution', unexpected:'caution', unique:'caution',
    karmic:'caution', careful:'caution', mindful:'caution',
    fluctuation:'caution', fluctuations:'caution', manage:'caution',
  };

  // Color per category (readable on white background, prints well)
  private readonly COLORS: Record<string, string> = {
    auspicious: '#b45309',   // warm amber-brown
    love:       '#be185d',   // deep rose
    planetary:  '#0e7490',   // teal
    strength:   '#1d4ed8',   // royal blue
    spiritual:  '#6d28d9',   // violet
    timing:     '#047857',   // emerald green
    caution:    '#7c3aed',   // soft purple
  };

  /** Tokenize text, wrap sentiment words in colored spans, return safe HTML string */
  colorize(text: string): string {
    if (!text) return '';
    // Split keeping punctuation attached to words
    return text.split(/(\s+)/).map(token => {
      const trimmed = token.trim();
      if (!trimmed) return token; // whitespace — return as-is

      // Strip leading/trailing punctuation to look up the word
      const stripped = trimmed.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
      const category = this.LEXICON[stripped];

      if (category) {
        const color = this.COLORS[category];
        return token.replace(
          trimmed,
          `<span style="color:${color};font-weight:600;">${trimmed}</span>`
        );
      }
      return token;
    }).join('');
  }

  // ── Getters / setters ────────────────────────────────────────────────────────
  getNarrative(si: number): string {
    const e = this.narrativeEdits();
    if (e[si] !== undefined) return e[si];
    const section = this.report()?.sections[si];
    return section?.simple_narrative || section?.narrative || '';
  }
  setNarrative(si: number, v: string): void {
    this.narrativeEdits.update(e => ({ ...e, [si]: v }));
  }

  getInsight(si: number, ii: number): string {
    const key = `${si}_${ii}`;
    const e = this.insightEdits();
    return e[key] !== undefined ? e[key] : (this.report()?.sections[si]?.insights[ii]?.content ?? '');
  }
  setInsight(si: number, ii: number, v: string): void {
    this.insightEdits.update(e => ({ ...e, [`${si}_${ii}`]: v }));
  }

  traditionLabel(domains: string[]): string {
    const map: Record<string, string> = {
      astrology:  'Vedic & Western Astrology',
      numerology: 'Sacred Numerology',
      tarot:      'Tarot Reading',
      palmistry:  'Palm Reading',
      vastu:      'Vastu Shastra',
    };
    if (!domains || !domains.length) return 'Spiritual Insight';
    return map[domains[0]] ?? domains[0].charAt(0).toUpperCase() + domains[0].slice(1);
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
  }

  private async toBase64(url: string): Promise<string> {
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror  = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return url; }
  }

  async printPdf(): Promise<void> {
    // Embed all images as base64 so they render in the PDF
    const imgs = document.querySelectorAll<HTMLImageElement>('#report-doc img');
    const origSrcs: string[] = [];
    await Promise.all(Array.from(imgs).map(async (img, i) => {
      origSrcs[i] = img.src;
      // Only convert relative / same-origin URLs
      if (!img.src.startsWith('data:')) {
        img.src = await this.toBase64(img.src);
      }
    }));

    window.print();

    // Restore original src after print dialog
    Array.from(imgs).forEach((img, i) => { img.src = origSrcs[i]; });
  }

  goBack(): void { this.router.navigate(['/review']); }
}
