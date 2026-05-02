import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ApiService, LanguageOption } from '../../services/api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<!-- ══ Toolbar ═══════════════════════════════════════════════════════════════ -->
<div class="toolbar no-print">

  <div class="tb-left">
    <button class="tb-icon-btn" (click)="goBack()" title="Back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="tb-brand">
      <span class="tb-brand-mark">✦</span>
      <span class="tb-brand-name">Aura with Rav</span>
      <span class="tb-divider">·</span>
      <span class="tb-page-name">Report Preview</span>
    </div>
  </div>

  <div class="tb-center">
    <!-- Language selector -->
    <div class="lang-pill" [class.lang-loading]="translating()">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="lang-icon">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" stroke-width="1.3"/>
      </svg>
      <select class="lang-select" [value]="selectedLang()" (change)="onLangChange($event)" [disabled]="translating()">
        <option value="en">English</option>
        @for (lang of languages(); track lang.code) {
          @if (lang.code !== 'en') {
            <option [value]="lang.code">{{ lang.native }} · {{ lang.name }}</option>
          }
        }
      </select>
      @if (translating()) {
        <span class="lang-spinner"></span>
      } @else if (selectedLang() !== 'en') {
        <span class="lang-badge">{{ currentLangNative() }}</span>
      }
    </div>
  </div>

  <div class="tb-right">
    <button class="tb-btn" [class.tb-btn-active]="editMode()" (click)="editMode.set(!editMode())">
      @if (editMode()) {
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5L11 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Done
      } @else {
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 2l2 2-6.5 6.5L2 11l.5-2.5L9 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Edit
      }
    </button>
    <button class="tb-btn-primary" (click)="printPdf()">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3 6l3.5 3.5L10 6M1.5 11h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Save PDF
    </button>
  </div>

</div>

<!-- ══ Translation banner ═════════════════════════════════════════════════════ -->
@if (translating()) {
  <div class="translate-banner">
    <span class="translate-spinner"></span>
    <span>Translating to {{ pendingLangName() }} — preserving tone, structure, and spiritual register…</span>
  </div>
}
@if (translateError()) {
  <div class="translate-error-banner">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    {{ translateError() }}
    <button class="err-dismiss" (click)="translateError.set('')">×</button>
  </div>
}

@if (displayReport()) {
  <div class="report-scroll">
  <div class="report-wrap" id="report-doc">

    <!-- ══ COVER ══════════════════════════════════════════════════════════════ -->
    <div class="cover page-break-after">

      <div class="cover-photo-wrap">
        <img src="rav-photo.png" alt="Rav" class="cover-photo"/>
        <div class="cover-fade"></div>
      </div>

      <div class="cover-body">
        <div class="cover-logo-ring">
          <img src="rav-logo.png" alt="Aura with Rav" class="cover-logo-img"/>
        </div>

        <div class="cover-eyebrow">Personal Spiritual Intelligence Report</div>
        <h1 class="cover-name">{{ displayReport()!.user_name }}</h1>
        <div class="cover-rule"></div>
        <p class="cover-sub">
          A personalised reading through the combined wisdom of<br>
          Vedic Astrology · Numerology · Tarot
        </p>
        <div class="cover-date">{{ formatDate(displayReport()!.generated_at) }}</div>

        @if (selectedLang() !== 'en') {
          <div class="cover-lang-badge">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" stroke-width="1.3"/></svg>
            {{ currentLangNative() }} · {{ currentLangName() }}
          </div>
        }

        <div class="cover-questions">
          @for (q of displayReport()!.questions; track q; let qi = $index) {
            <div class="cq-row">
              <span class="cq-num">{{ qi + 1 }}</span>
              <span class="cq-text">{{ q }}</span>
            </div>
          }
        </div>
      </div>

      <div class="cover-footer-bar">
        Prepared by Aura with Rav · Confidential · For personal guidance only
      </div>
    </div>

    <!-- ══ LETTER ══════════════════════════════════════════════════════════════ -->
    <div class="inner-page page-break-after">
      <div class="page-hdr">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
        <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
      </div>

      <div class="letter-wrap">
        <h2 class="section-title">A Message for {{ displayReport()!.user_name }}</h2>
        <div class="gold-line"></div>
        <div class="letter-body">
          <p>Dear {{ displayReport()!.user_name }},</p>
          <p>Thank you for trusting Aura with Rav with your questions. This report has been prepared with care, drawing on the ancient wisdom of Vedic Astrology, Numerology, and Tarot — three traditions that, when read together, offer a remarkably coherent picture of your journey.</p>
          <p>The insights you will find here are not predictions set in stone. They are tendencies, patterns, and energies that the cosmos reflects back at this moment in your life. Your awareness, your choices, and your intentions remain the most powerful forces at work.</p>
          <p>Read each section slowly. Sit with what resonates. Let the rest pass.</p>
          <p class="letter-sign">With light and clarity,<br><strong>Rav</strong><br><em>Aura with Rav</em></p>
        </div>
      </div>

      <div class="disclaimer-box">
        {{ displayReport()!.disclaimer }}
      </div>
    </div>

    <!-- ══ QUESTION SECTIONS ══════════════════════════════════════════════════ -->
    @for (section of displayReport()!.sections; track section.question; let si = $index) {
      <div class="inner-page page-break-after">

        <div class="page-hdr">
          <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
          <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
        </div>

        <div class="q-banner">
          <div class="q-circle">Q{{ si + 1 }}</div>
          <div class="q-text">{{ section.question }}</div>
        </div>

        <!-- Summary -->
        <div class="content-block">
          <h3 class="block-heading">Summary</h3>
          <div class="gold-line"></div>

          @if (section.structured_summary && !editMode()) {
            <ul class="hw-list">
              @for (b of section.structured_summary.hw_bullets; track b.label) {
                <li class="hw-item">
                  <span class="hw-label" [innerHTML]="colorize(b.label)"></span>
                  <span class="hw-answer" [innerHTML]="colorize(b.answer)"></span>
                </li>
              }
            </ul>

            @if (section.structured_summary.remedy_bullets) {
              <div class="remedy-card">
                <div class="remedy-card-head">Remedies to support your journey</div>

                @if (section.structured_summary.remedy_bullets.daily_habits?.length) {
                  <div class="remedy-group">
                    <div class="remedy-group-label">Daily Habits</div>
                    <ul class="remedy-list">
                      @for (h of section.structured_summary.remedy_bullets.daily_habits; track h) {
                        <li [innerHTML]="colorize(h)"></li>
                      }
                    </ul>
                  </div>
                }
                @if (section.structured_summary.remedy_bullets.mantras?.length) {
                  <div class="remedy-group">
                    <div class="remedy-group-label">Mantra</div>
                    <ul class="remedy-list">
                      @for (m of section.structured_summary.remedy_bullets.mantras; track m) {
                        <li [innerHTML]="colorize(m)"></li>
                      }
                    </ul>
                  </div>
                }
                @if (section.structured_summary.remedy_bullets.lucky_colors?.length) {
                  <div class="remedy-group">
                    <div class="remedy-group-label">Lucky Colors</div>
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
            <p class="narrative-para" [innerHTML]="colorize(getNarrative(si))"></p>
          }
        </div>

        <!-- Traditions -->
        @if (section.insights?.length) {
          <div class="content-block">
            <h3 class="block-heading">What the traditions say</h3>
            <div class="gold-line"></div>

            @for (ins of section.insights; track ins.id; let ii = $index) {
              <div class="tradition-block">
                <div class="tradition-label">{{ traditionLabel(ins.domains) }}</div>
                @if (editMode()) {
                  <textarea class="edit-area"
                    [value]="getInsight(si, ii)"
                    (input)="setInsight(si, ii, $any($event.target).value)"
                    rows="4"></textarea>
                } @else {
                  <p class="tradition-text" [innerHTML]="colorize(getInsight(si, ii))"></p>
                }
              </div>
            }
          </div>
        }

      </div>
    }

    <!-- ══ CLOSING ══════════════════════════════════════════════════════════════ -->
    <div class="closing-page">
      <div class="page-hdr page-hdr-dark">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo page-hdr-logo-dark"/>
      </div>
      <div class="closing-body">
        <img src="rav-photo.png" alt="Rav" class="closing-photo"/>
        <h2 class="closing-name">Thank you, {{ displayReport()!.user_name }}</h2>
        <div class="gold-line gold-line-center"></div>
        <p class="closing-text">{{ displayReport()!.closing_note }}</p>
        <p class="closing-text">For follow-up consultations, personalised sessions, or deeper readings, reach out through <strong>Aura with Rav</strong>.</p>
        <div class="closing-seal">✦</div>
      </div>
      <div class="closing-footer">
        <img src="rav-logo.png" alt="Aura with Rav" class="closing-footer-logo"/>
        <span>{{ formatDate(displayReport()!.generated_at) }} · Confidential · For personal guidance only</span>
      </div>
    </div>

  </div><!-- /report-wrap -->
  </div><!-- /report-scroll -->

} @else {
  <div class="empty-state">
    <div class="empty-icon">✦</div>
    <p class="empty-text">No report yet</p>
    <button class="tb-btn" (click)="goBack()">← Back to Review</button>
  </div>
}
  `,
  styles: [`
/* ── Host ─────────────────────────────────────────────────────────────────── */
:host {
  display: flex; flex-direction: column; min-height: 100vh;
  background: #f2ede6;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ── Toolbar ──────────────────────────────────────────────────────────────── */
.toolbar {
  position: sticky; top: 0; z-index: 200;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 0 20px; height: 52px;
  background: rgba(20,16,12,0.96);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.tb-left  { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tb-center { flex: 1; display: flex; justify-content: center; }
.tb-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.tb-icon-btn {
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.tb-icon-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }

.tb-brand { display: flex; align-items: center; gap: 7px; }
.tb-brand-mark { color: #d4af37; font-size: 14px; }
.tb-brand-name { font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 0.01em; font-family: Georgia, serif; }
.tb-divider { color: rgba(255,255,255,0.25); }
.tb-page-name { font-size: 12px; color: rgba(255,255,255,0.45); font-family: Georgia, serif; }

/* Language pill */
.lang-pill {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 12px; border-radius: 99px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
  transition: all 0.15s;
}
.lang-pill:hover { background: rgba(255,255,255,0.11); }
.lang-loading { opacity: 0.6; }
.lang-icon { color: rgba(255,255,255,0.5); flex-shrink: 0; }
.lang-select {
  background: transparent; border: none; outline: none;
  color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 600;
  font-family: Georgia, serif; cursor: pointer; max-width: 200px;
}
.lang-select option { background: #1a1410; color: #fff; }
.lang-badge {
  font-size: 10.5px; font-weight: 700; color: #d4af37;
  background: rgba(212,175,55,0.12); padding: 2px 8px; border-radius: 99px;
  border: 1px solid rgba(212,175,55,0.3); white-space: nowrap;
}
.lang-spinner {
  width: 13px; height: 13px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.2);
  border-top-color: #d4af37;
  animation: spin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Toolbar buttons */
.tb-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.75); font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: Georgia, serif; transition: all 0.15s;
}
.tb-btn:hover { background: rgba(255,255,255,0.13); color: #fff; }
.tb-btn-active { border-color: #d4af37; color: #d4af37; background: rgba(212,175,55,0.08); }

.tb-btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 18px; border-radius: 8px; border: none;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: Georgia, serif;
  box-shadow: 0 2px 10px rgba(212,175,55,0.3);
  transition: all 0.15s;
}
.tb-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(212,175,55,0.4); }

/* ── Translation banners ──────────────────────────────────────────────────── */
.translate-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 24px; background: #fffbf0; border-bottom: 1px solid #f5e6b0;
  font-size: 12.5px; color: #92400e; font-family: Georgia, serif;
}
.translate-spinner {
  width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid #f5e6b0; border-top-color: #d4af37;
  animation: spin 0.7s linear infinite;
}
.translate-error-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 24px; background: #fef2f2; border-bottom: 1px solid #fecaca;
  font-size: 12px; color: #991b1b; font-family: Georgia, serif;
}
.err-dismiss {
  margin-left: auto; background: transparent; border: none;
  color: #991b1b; font-size: 16px; cursor: pointer; line-height: 1;
}

/* ── Report scroll ─────────────────────────────────────────────────────────── */
.report-scroll { flex: 1; overflow-y: auto; padding: 32px 16px 64px; }
.report-wrap {
  max-width: 800px; margin: 0 auto;
  display: flex; flex-direction: column;
  box-shadow: 0 12px 60px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
  border-radius: 2px;
}

/* ══ COVER ════════════════════════════════════════════════════════════════════ */
.cover {
  position: relative; min-height: 100vh;
  background: #14100c; overflow: hidden;
  display: flex; flex-direction: column;
}
.cover-photo-wrap {
  position: absolute; inset: 0; display: flex;
  align-items: stretch; justify-content: flex-end;
}
.cover-photo {
  width: 52%; height: 100%; object-fit: cover; object-position: center top; opacity: 0.3;
}
.cover-fade {
  position: absolute; inset: 0;
  background: linear-gradient(100deg, #14100c 48%, transparent 82%);
}
.cover-body {
  position: relative; z-index: 2;
  flex: 1; padding: 48px 52px;
  display: flex; flex-direction: column; align-items: flex-start;
}
.cover-logo-ring {
  width: 96px; height: 96px; border-radius: 50%; overflow: hidden;
  border: 2px solid rgba(212,175,55,0.45);
  box-shadow: 0 0 24px rgba(212,175,55,0.25); margin-bottom: 36px;
}
.cover-logo-img { width: 100%; height: 100%; object-fit: cover; }
.cover-eyebrow {
  font-size: 10px; font-weight: 800; letter-spacing: 0.24em;
  text-transform: uppercase; color: #d4af37; margin-bottom: 16px;
}
.cover-name {
  font-size: 48px; font-weight: 900; color: #fff;
  margin: 0 0 18px; line-height: 1.1; letter-spacing: -0.01em;
}
.cover-rule {
  width: 56px; height: 2px;
  background: linear-gradient(90deg, #d4af37, transparent);
  margin-bottom: 20px;
}
.cover-sub {
  font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.5);
  line-height: 1.85; margin: 0 0 16px;
}
.cover-date {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 28px;
}
.cover-lang-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: #d4af37; background: rgba(212,175,55,0.1);
  border: 1px solid rgba(212,175,55,0.3); padding: 4px 12px;
  border-radius: 99px; margin-bottom: 20px;
}
.cover-questions { display: flex; flex-direction: column; gap: 10px; max-width: 440px; }
.cq-row { display: flex; gap: 12px; align-items: flex-start; }
.cq-num {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: rgba(212,175,55,0.18); border: 1px solid rgba(212,175,55,0.4);
  color: #d4af37; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; margin-top: 1px;
}
.cq-text { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.65; }
.cover-footer-bar {
  position: relative; z-index: 2;
  padding: 18px 52px; border-top: 1px solid rgba(255,255,255,0.07);
  font-size: 10px; color: rgba(255,255,255,0.28);
  letter-spacing: 0.08em; text-align: center;
}

/* ══ INNER PAGES ════════════════════════════════════════════════════════════ */
.inner-page { background: #fff; display: flex; flex-direction: column; min-height: 100vh; }

.page-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 44px; border-bottom: 1px solid #f0ece4; background: #fffdf9;
  flex-shrink: 0;
}
.page-hdr-logo {
  width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
  border: 1.5px solid rgba(212,175,55,0.35);
}
.page-hdr-right { font-size: 10px; color: #bbb; letter-spacing: 0.08em; text-transform: uppercase; }

/* Letter */
.letter-wrap { padding: 52px 52px 32px; flex: 1; }
.section-title { font-size: 24px; font-weight: 800; color: #14100c; margin: 0 0 12px; }
.gold-line { width: 48px; height: 2px; background: linear-gradient(90deg, #d4af37, transparent); margin-bottom: 28px; }
.gold-line-center { margin: 0 auto 24px; }
.letter-body p { font-size: 14.5px; font-weight: 500; color: #374151; line-height: 2; margin: 0 0 18px; }
.letter-sign { margin-top: 28px !important; font-size: 14px !important; }
.disclaimer-box {
  margin: 0 44px 44px; padding: 14px 20px;
  background: #fffbf0; border: 1px solid #f5e6b0; border-radius: 10px;
  font-size: 11px; color: #78350f; line-height: 1.8; text-align: center;
}

/* Question banner */
.q-banner {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 36px 52px 0;
}
.q-circle {
  flex-shrink: 0; width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; margin-top: 2px;
}
.q-text { font-size: 21px; font-weight: 800; color: #14100c; line-height: 1.4; }

/* Content blocks */
.content-block { padding: 28px 52px 0; }
.block-heading {
  font-size: 11px; font-weight: 800; letter-spacing: 0.16em;
  text-transform: uppercase; color: #8a6a00; margin: 0 0 8px;
}
.narrative-para { font-size: 15px; font-weight: 500; color: #1f2937; line-height: 2; margin: 0; }

/* HW bullets */
.hw-list { list-style: none; margin: 0 0 24px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.hw-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px; background: #faf8f3;
  border-left: 3px solid #d4af37; border-radius: 0 8px 8px 0;
}
.hw-label { font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #92600a; }
.hw-answer { font-size: 14px; font-weight: 500; color: #1f2937; line-height: 1.75; }

/* Remedy card */
.remedy-card {
  margin-top: 24px; padding: 20px 22px;
  background: linear-gradient(135deg, #fdf8ee, #fffbf2);
  border: 1px solid rgba(212,175,55,0.22); border-radius: 12px;
}
.remedy-card-head {
  font-size: 10px; font-weight: 800; letter-spacing: 0.16em;
  text-transform: uppercase; color: #b45309; margin-bottom: 14px;
}
.remedy-group { margin-bottom: 12px; }
.remedy-group:last-child { margin-bottom: 0; }
.remedy-group-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: #6d28d9; margin-bottom: 5px;
}
.remedy-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.remedy-list li {
  font-size: 13px; font-weight: 500; color: #374151; line-height: 1.75;
  padding-left: 14px; position: relative;
}
.remedy-list li::before { content: '✦'; position: absolute; left: 0; color: #d4af37; font-size: 8px; top: 5px; }

/* Traditions */
.tradition-block { margin-bottom: 22px; padding-bottom: 22px; border-bottom: 1px solid #f0ece4; }
.tradition-block:last-child { border-bottom: none; padding-bottom: 32px; }
.tradition-label {
  font-size: 10px; font-weight: 800; letter-spacing: 0.14em;
  text-transform: uppercase; color: #d4af37; margin-bottom: 8px;
}
.tradition-text { font-size: 13.5px; font-weight: 500; color: #374151; line-height: 1.9; margin: 0; }

/* Edit area */
.edit-area {
  width: 100%; box-sizing: border-box; padding: 10px 14px;
  border: 1.5px solid #d4af37; border-radius: 8px;
  font-family: Georgia, serif; font-size: 13.5px; color: #374151;
  line-height: 1.85; background: #fffbf0; resize: vertical; outline: none;
}
.edit-area:focus { box-shadow: 0 0 0 3px rgba(212,175,55,0.12); }

/* ══ CLOSING ════════════════════════════════════════════════════════════════ */
.closing-page { background: #14100c; min-height: 100vh; display: flex; flex-direction: column; }
.page-hdr-dark {
  background: transparent !important; border-bottom-color: rgba(255,255,255,0.07) !important;
}
.page-hdr-logo-dark { filter: brightness(10); opacity: 0.5; }
.closing-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 64px 48px 40px; text-align: center;
}
.closing-photo {
  width: 120px; height: 120px; border-radius: 50%; object-fit: cover; object-position: center top;
  border: 2px solid rgba(212,175,55,0.4); margin-bottom: 28px;
}
.closing-name { font-size: 28px; font-weight: 800; color: #fff; margin: 0 0 14px; }
.closing-text { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.55); line-height: 1.9; margin: 0 0 16px; max-width: 480px; }
.closing-seal { font-size: 32px; color: #d4af37; margin-top: 20px; }
.closing-footer {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  padding: 18px 40px; border-top: 1px solid rgba(255,255,255,0.07);
  font-size: 10px; color: rgba(255,255,255,0.25); letter-spacing: 0.08em;
}
.closing-footer-logo {
  width: 20px; height: 20px; border-radius: 50%;
  object-fit: cover; filter: brightness(10); opacity: 0.3;
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  color: #9ca3af; font-family: Georgia, serif;
}
.empty-icon { font-size: 32px; color: #d4af37; opacity: 0.4; }
.empty-text { font-size: 15px; color: #9ca3af; }

/* ── Print ───────────────────────────────────────────────────────────────── */
@page { margin: 0; size: A4; }
@media print {
  :host { background: white; }
  .no-print, .translate-banner, .translate-error-banner { display: none !important; }
  .report-scroll { padding: 0; overflow: visible; }
  .report-wrap { max-width: 100%; box-shadow: none; border-radius: 0; }
  .cover, .inner-page, .closing-page { min-height: 100vh; }
  .page-break-after { page-break-after: always; }
  .edit-area { border: none; background: transparent; resize: none; padding: 0; }
  img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-photo-wrap { position: absolute !important; }
  .cover-photo { display: block !important; opacity: 0.3 !important; }
}
  `]
})
export class ReportPage implements OnInit {
  private router = inject(Router);
  private api    = inject(ApiService);
  readonly orch  = inject(OrchestratorService);

  readonly editMode    = signal(false);
  readonly report      = computed(() => this.orch.finalReport());
  readonly languages   = signal<LanguageOption[]>([]);
  readonly selectedLang = signal('en');
  readonly translating  = signal(false);
  readonly translateError = signal('');
  readonly pendingLangName = signal('');

  // translated report overrides base report when language !== en
  private translatedReport = signal<any>(null);

  readonly displayReport = computed(() =>
    this.translatedReport() ?? this.report()
  );

  readonly currentLangNative = computed(() => {
    const lang = this.languages().find(l => l.code === this.selectedLang());
    return lang?.native ?? '';
  });
  readonly currentLangName = computed(() => {
    const lang = this.languages().find(l => l.code === this.selectedLang());
    return lang?.name ?? '';
  });

  private narrativeEdits = signal<Record<number, string>>({});
  private insightEdits   = signal<Record<string, string>>({});

  async ngOnInit() {
    // Load language list from backend; fallback to built-in list if offline
    try {
      const res = await firstValueFrom(this.api.getLanguages());
      this.languages.set(res.languages);
    } catch {
      this.languages.set(FALLBACK_LANGUAGES);
    }
  }

  async onLangChange(event: Event) {
    const code = (event.target as HTMLSelectElement).value;
    this.selectedLang.set(code);

    if (code === 'en') {
      this.translatedReport.set(null);
      return;
    }

    const lang = this.languages().find(l => l.code === code);
    this.pendingLangName.set(lang?.name ?? code);
    this.translating.set(true);
    this.translateError.set('');

    try {
      const baseReport = this.report();
      const res = await firstValueFrom(this.api.translateReport({
        session_id:    this.orch.sessionId() ?? '',
        language_code: code,
        report:        baseReport as any,
      }));
      this.translatedReport.set(res.final_report);
    } catch (err: any) {
      this.translateError.set(
        err?.message ?? `Translation to ${this.pendingLangName()} failed. Showing English.`
      );
      this.selectedLang.set('en');
      this.translatedReport.set(null);
    } finally {
      this.translating.set(false);
    }
  }

  // ── Sentiment colourizer ────────────────────────────────────────────────────
  private readonly LEXICON: Record<string, string> = {
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
    marriage:'love', partner:'love', partnership:'love', relationship:'love',
    love:'love', romantic:'love', bond:'love', commitment:'love',
    spouse:'love', companion:'love', soulmate:'love', union:'love',
    nurturing:'love', affection:'love', devoted:'love', emotional:'love',
    heart:'love', warmth:'love', caring:'love', loyal:'love', connection:'love',
    lagna:'planetary', ascendant:'planetary', nakshatra:'planetary',
    dasha:'planetary', mahadasha:'planetary', antardasha:'planetary',
    venus:'planetary', jupiter:'planetary', saturn:'planetary',
    mars:'planetary', mercury:'planetary', moon:'planetary',
    rahu:'planetary', ketu:'planetary', sun:'planetary',
    vedic:'planetary', transit:'planetary', yoga:'planetary',
    strength:'strength', strong:'strength', courage:'strength',
    confident:'strength', resilience:'strength', determined:'strength',
    powerful:'strength', leadership:'strength', ambitious:'strength',
    spiritual:'spiritual', spiritually:'spiritual', inner:'spiritual',
    soul:'spiritual', karma:'spiritual', divine:'spiritual', sacred:'spiritual',
    intuition:'spiritual', meditation:'spiritual', mantra:'spiritual',
    dharma:'spiritual', consciousness:'spiritual', awakening:'spiritual',
    timing:'timing', period:'timing', cycle:'timing', phase:'timing',
    window:'timing', year:'timing', years:'timing', shortly:'timing',
    delay:'caution', patience:'caution', caution:'caution', challenge:'caution',
    obstacle:'caution', reflection:'caution', karmic:'caution', careful:'caution',
  };
  private readonly COLORS: Record<string, string> = {
    auspicious: '#b45309', love: '#be185d', planetary: '#0e7490',
    strength: '#1d4ed8', spiritual: '#6d28d9', timing: '#047857', caution: '#7c3aed',
  };

  colorize(text: string): string {
    if (!text) return '';
    return text.split(/(\s+)/).map(token => {
      const trimmed = token.trim();
      if (!trimmed) return token;
      const stripped = trimmed.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
      const cat = this.LEXICON[stripped];
      if (cat) {
        return token.replace(trimmed, `<span style="color:${this.COLORS[cat]};font-weight:600;">${trimmed}</span>`);
      }
      return token;
    }).join('');
  }

  getNarrative(si: number): string {
    const e = this.narrativeEdits();
    if (e[si] !== undefined) return e[si];
    const section = this.displayReport()?.sections[si];
    return section?.simple_narrative || section?.narrative || '';
  }
  setNarrative(si: number, v: string) { this.narrativeEdits.update(e => ({ ...e, [si]: v })); }

  getInsight(si: number, ii: number): string {
    const key = `${si}_${ii}`;
    const e = this.insightEdits();
    return e[key] !== undefined ? e[key] : (this.displayReport()?.sections[si]?.insights[ii]?.content ?? '');
  }
  setInsight(si: number, ii: number, v: string) {
    this.insightEdits.update(e => ({ ...e, [`${si}_${ii}`]: v }));
  }

  traditionLabel(domains: string[]): string {
    const map: Record<string, string> = {
      astrology: 'Vedic & Western Astrology', numerology: 'Sacred Numerology',
      tarot: 'Tarot Reading', palmistry: 'Palm Reading', vastu: 'Vastu Shastra',
    };
    if (!domains?.length) return 'Spiritual Insight';
    return map[domains[0]] ?? domains[0].charAt(0).toUpperCase() + domains[0].slice(1);
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
  }

  private async toBase64(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return url; }
  }

  async printPdf(): Promise<void> {
    const imgs = document.querySelectorAll<HTMLImageElement>('#report-doc img');
    const origSrcs: string[] = [];
    await Promise.all(Array.from(imgs).map(async (img, i) => {
      origSrcs[i] = img.src;
      if (!img.src.startsWith('data:')) img.src = await this.toBase64(img.src);
    }));
    window.print();
    Array.from(imgs).forEach((img, i) => { img.src = origSrcs[i]; });
  }

  goBack() { this.router.navigate(['/review']); }
}

// Fallback language list used when backend is offline
const FALLBACK_LANGUAGES: LanguageOption[] = [
  { code: 'en',  name: 'English',    native: 'English',       script: 'Latin' },
  { code: 'hi',  name: 'Hindi',      native: 'हिन्दी',          script: 'Devanagari' },
  { code: 'bn',  name: 'Bengali',    native: 'বাংলা',           script: 'Bengali' },
  { code: 'pa',  name: 'Punjabi',    native: 'ਪੰਜਾਬੀ',          script: 'Gurmukhi' },
  { code: 'gu',  name: 'Gujarati',   native: 'ગુજરાતી',          script: 'Gujarati' },
  { code: 'mr',  name: 'Marathi',    native: 'मराठी',            script: 'Devanagari' },
  { code: 'te',  name: 'Telugu',     native: 'తెలుగు',           script: 'Telugu' },
  { code: 'ta',  name: 'Tamil',      native: 'தமிழ்',            script: 'Tamil' },
  { code: 'kn',  name: 'Kannada',    native: 'ಕನ್ನಡ',           script: 'Kannada' },
  { code: 'ml',  name: 'Malayalam',  native: 'മലയാളം',          script: 'Malayalam' },
  { code: 'or',  name: 'Odia',       native: 'ଓଡ଼ିଆ',           script: 'Odia' },
  { code: 'as',  name: 'Assamese',   native: 'অসমীয়া',          script: 'Bengali' },
  { code: 'ur',  name: 'Urdu',       native: 'اردو',             script: 'Nastaliq' },
  { code: 'ks',  name: 'Kashmiri',   native: 'کٲشُر',            script: 'Perso-Arabic' },
  { code: 'ne',  name: 'Nepali',     native: 'नेपाली',           script: 'Devanagari' },
  { code: 'sd',  name: 'Sindhi',     native: 'سنڌي',             script: 'Perso-Arabic' },
  { code: 'sa',  name: 'Sanskrit',   native: 'संस्कृतम्',         script: 'Devanagari' },
  { code: 'kok', name: 'Konkani',    native: 'कोंकणी',           script: 'Devanagari' },
  { code: 'mai', name: 'Maithili',   native: 'मैथिली',           script: 'Devanagari' },
  { code: 'doi', name: 'Dogri',      native: 'डोगरी',            script: 'Devanagari' },
  { code: 'mni', name: 'Manipuri',   native: 'মৈতৈলোন্',         script: 'Meitei' },
  { code: 'sat', name: 'Santali',    native: 'ᱥᱟᱱᱛᱟᱲᱤ',        script: 'Ol Chiki' },
];
