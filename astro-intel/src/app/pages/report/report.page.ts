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
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
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
      <svg width="18" height="18" viewBox="0 0 14 14" fill="none" class="lang-icon">
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

    <!-- ══ PAGE 1: COVER ════════════════════════════════════════════════════════ -->
    <div class="pdf-page cover">
      <div class="cover-photo-wrap">
        <img src="rav-photo.png" alt="Rav" class="cover-photo"/>
        <div class="cover-fade"></div>
      </div>
      <div class="cover-body">
        <div class="cover-logo-wrap">
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

    <!-- ══ PAGE 2: MESSAGE TO USER ═══════════════════════════════════════════════ -->
    <div class="pdf-page page-letter">
      <div class="page-hdr">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
        <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
      </div>
      <div class="letter-page-body">
        <div class="letter-inner">
          <div class="letter-brand-row">
            <img src="rav-logo.png" alt="Aura with Rav" class="letter-brand-logo"/>
            <div class="letter-brand-text">
              <div class="letter-brand-name">Aura with Rav</div>
              <div class="letter-brand-tagline">Personal Spiritual Intelligence Report</div>
            </div>
          </div>
          <h2 class="letter-title">A Message for {{ displayReport()!.user_name }}</h2>
          <div class="gold-line"></div>
          <div class="letter-paras">
            <p>Dear {{ displayReport()!.user_name }},</p>
            <p>Thank you for trusting Aura with Rav with your questions. This report has been prepared with care, drawing on the ancient wisdom of Vedic Astrology, Numerology, and Tarot — three traditions that offer a remarkably coherent picture of your journey.</p>
            <p>The insights here are tendencies, patterns, and energies the cosmos reflects at this moment in your life. Your awareness and choices remain the most powerful forces at work.</p>
            <p>May these reflections bring you greater clarity, direction, and peace as you navigate this chapter of your life.</p>
            <p class="letter-sign">With light and clarity,<br><strong>Rav</strong> &nbsp;·&nbsp; <em>Aura with Rav</em></p>
          </div>
          <div class="letter-divider"></div>
          <div class="letter-disclaimer">{{ displayReport()!.disclaimer }}</div>
          <div class="letter-modules">
            @for (m of displayReport()!.modules_used; track m) {
              <div class="module-chip">
                <span class="module-icon">{{ moduleIcon(m) }}</span>
                <span class="module-label">{{ moduleLabel(m) }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- ══ PAGE 3: SPIRITUAL PROFILE + BIRTH CHART ════════════════════════════════ -->
    <div class="pdf-page page-profile">
      <div class="page-hdr">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
        <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
      </div>
      <div class="profile-body">
        <div class="profile-heading-row">
          <p class="cp-eyebrow">Cosmic Blueprint</p>
          <h2 class="profile-title">Your Spiritual Profile</h2>
        </div>

        @if (hasModule('astrology')) {
          <div class="profile-chart-wrap">
            <!-- chart left, planet table right -->
            <div class="profile-chart-row">
            <div class="profile-svg-shell">
              <svg viewBox="0 0 420 420" class="vedic-svg" xmlns="http://www.w3.org/2000/svg">
                <!-- Background -->
                <rect x="0" y="0" width="420" height="420" rx="14" fill="#fafaf9"/>
                <!-- Outer border -->
                <rect x="4" y="4" width="412" height="412" rx="10" fill="none" stroke="#d4af37" stroke-width="1.2"/>
                <!-- Inner square -->
                <rect x="106" y="106" width="208" height="208" fill="none" stroke="#d4af37" stroke-width="0.8"/>
                <!-- Diagonal lines -->
                <line x1="4" y1="4"   x2="416" y2="416" stroke="#d4af37" stroke-width="0.6" opacity="0.4"/>
                <line x1="416" y1="4" x2="4"   y2="416" stroke="#d4af37" stroke-width="0.6" opacity="0.4"/>
                <!-- Cross lines -->
                <line x1="210" y1="4"   x2="210" y2="416" stroke="#d4af37" stroke-width="0.5" opacity="0.3"/>
                <line x1="4"   y1="210" x2="416" y2="210" stroke="#d4af37" stroke-width="0.5" opacity="0.3"/>
                <!-- Inner diagonals -->
                <line x1="106" y1="106" x2="314" y2="314" stroke="#d4af37" stroke-width="0.5" opacity="0.3"/>
                <line x1="314" y1="106" x2="106" y2="314" stroke="#d4af37" stroke-width="0.5" opacity="0.3"/>

                <!-- House polygons -->
                @for (h of [1,2,3,4,5,6,7,8,9,10,11,12]; track h) {
                  <polygon [attr.points]="housePoints(h)" [attr.fill]="houseFill(h)" opacity="0.45"/>
                }

                <!-- House numbers — at outer corners, small -->
                @for (h of houseNums(); track h.n) {
                  <text [attr.x]="h.lx" [attr.y]="h.ly"
                        text-anchor="middle" dominant-baseline="middle"
                        font-size="8" fill="#c9a84c" font-weight="700"
                        font-family="Georgia, serif">{{ h.n }}</text>
                }

                <!-- Rashi abbreviations — inside the house, offset from numbers -->
                @for (h of houseNums(); track h.n) {
                  <text [attr.x]="h.rx" [attr.y]="h.ry"
                        text-anchor="middle" dominant-baseline="middle"
                        font-size="7.5" fill="#4b5563" font-weight="600"
                        font-family="Arial, sans-serif">{{ rashiAbbr(h.rashi) }}</text>
                }

                <!-- Planet symbols — inward from outer labels -->
                @for (p of planetsInHouses(); track p.planet) {
                  <text [attr.x]="p.x" [attr.y]="p.y"
                        text-anchor="middle" dominant-baseline="middle"
                        [attr.font-size]="p.planet === 'Lagna' ? '10' : '9.5'"
                        [attr.font-weight]="p.planet === 'Lagna' ? '900' : '700'"
                        [attr.fill]="planetColor(p.planet)"
                        font-family="Arial, sans-serif">{{ planetSymbol(p.planet) }}</text>
                }

                <!-- Center label -->
                <rect x="170" y="194" width="80" height="26" rx="4" fill="#fafaf9" opacity="0.85"/>
                <text x="210" y="203" text-anchor="middle" dominant-baseline="middle"
                      font-size="8.5" fill="#b8a060" font-weight="800" letter-spacing="1.5"
                      font-family="Georgia, serif">BIRTH CHART</text>
              </svg>
            </div>

            <div class="profile-planet-grid">
              <div class="combo-planet-label">Planetary Positions</div>
              <div class="combo-planet-rows">
                @for (p of planetsInHouses(); track p.planet) {
                  @if (p.planet !== 'Lagna') {
                    <div class="cpt-row">
                      <span class="cpt-sym" [style.color]="planetColor(p.planet)">{{ planetSymbol(p.planet) }}</span>
                      <span class="cpt-name">{{ p.planet }}</span>
                      <span class="cpt-badge">H{{ p.house }}</span>
                      <span class="cpt-rashi">{{ p.rashi }}</span>
                    </div>
                  }
                }
                <div class="cpt-row cpt-lagna">
                  <span class="cpt-sym" style="color:#c9a227">⊕</span>
                  <span class="cpt-name">Lagna</span>
                  <span class="cpt-badge">H1</span>
                  <span class="cpt-rashi">{{ lagnaRashi() }}</span>
                </div>
              </div>
              <div class="combo-planet-meta">
                <span class="cpt-meta-label">Dasha</span><span class="cpt-meta-val">{{ currentDasha() }}</span>
                <span class="cpt-meta-label">Nakshatra</span><span class="cpt-meta-val">{{ moonNakshatra() }}</span>
              </div>
            </div>
            </div><!-- /profile-chart-row -->
          </div><!-- /profile-chart-wrap -->
        }

        @if (hasModule('numerology')) {
          <div class="profile-num-block">
            <div class="combo-num-hdr">
              <span class="combo-num-icon">∞</span>
              <div>
                <div class="combo-num-title">Sacred Numbers</div>
                <div class="combo-num-sub">{{ displayReport()!.user_name }}'s numerological blueprint</div>
              </div>
            </div>
            <div class="combo-num-grid">
              @for (n of numerologyNumbers(); track n.label) {
                <div class="combo-num-cell">
                  <div class="combo-num-val" [style.color]="numColor(n.value)">{{ n.value }}</div>
                  <div class="combo-num-lbl">{{ n.label }}</div>
                  <div class="combo-num-meaning">{{ numMeaning(n.label, n.value) }}</div>
                </div>
              }
              <div class="combo-num-cell combo-num-lp">
                <div class="combo-num-val" style="color:#6366f1">{{ lifePathNumber() }}</div>
                <div class="combo-num-lbl">Life Path</div>
                <div class="combo-num-meaning">{{ numMeaning('Life Path', lifePathNumber()) }}</div>
                <div class="combo-lp-bar"><div class="combo-lp-fill" [style.width.%]="lifePathPct()"></div></div>
              </div>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- ══ QUESTION SECTIONS (one pdf-page each) ═════════════════════════════════ -->
    @for (section of displayReport()!.sections; track section.question; let si = $index) {
      <div class="pdf-page page-question">

        <div class="page-hdr">
          <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
          <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
        </div>

        <div class="q-banner">
          <div class="q-circle">Q{{ si + 1 }}</div>
          <div class="q-text">{{ section.question }}</div>
        </div>

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

      </div>
    }

    <!-- ══ CLOSING PAGE ════════════════════════════════════════════════════════ -->
    <div class="pdf-page closing-page">
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
/* ═══════════════════════════════════════════════════════════════════════════
   HOST & CHROME
═══════════════════════════════════════════════════════════════════════════ */
:host {
  display: flex; flex-direction: column;
  background: #f2ede6;
  font-family: 'Georgia', 'Times New Roman', serif;
}

.toolbar {
  position: sticky; top: 0; z-index: 200; flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 0 32px; height: 64px;
  background: rgba(20,16,12,0.97);
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tb-left  { display: flex; align-items: center; gap: 14px; min-width: 0; }
.tb-center { flex: 1; display: flex; justify-content: center; }
.tb-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.tb-icon-btn {
  width: 38px; height: 38px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.tb-icon-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
.tb-brand { display: flex; align-items: center; gap: 10px; }
.tb-brand-mark { color: #d4af37; font-size: 18px; }
.tb-brand-name { font-size: 16px; font-weight: 700; color: #fff; letter-spacing: 0.01em; font-family: Georgia, serif; }
.tb-divider { color: rgba(255,255,255,0.25); font-size: 16px; }
.tb-page-name { font-size: 13px; color: rgba(255,255,255,0.45); font-family: Georgia, serif; }

.lang-pill {
  display: flex; align-items: center; gap: 9px;
  padding: 6px 14px; border-radius: 99px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14);
  transition: all 0.15s;
}
.lang-pill:hover { background: rgba(255,255,255,0.12); }
.lang-loading { opacity: 0.6; }
.lang-icon { color: rgba(255,255,255,0.5); flex-shrink: 0; }
.lang-select {
  background: transparent; border: none; outline: none;
  color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 600;
  font-family: Georgia, serif; cursor: pointer; max-width: 200px;
}
.lang-select option { background: #1a1410; color: #fff; }
.lang-badge {
  font-size: 12px; font-weight: 700; color: #d4af37;
  background: rgba(212,175,55,0.12); padding: 2px 9px; border-radius: 99px;
  border: 1px solid rgba(212,175,55,0.3); white-space: nowrap;
}
.lang-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.2); border-top-color: #d4af37;
  animation: spin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.tb-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 9px;
  border: 1px solid rgba(255,255,255,0.17); background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.8); font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: Georgia, serif; transition: all 0.15s;
}
.tb-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
.tb-btn-active { border-color: #d4af37; color: #d4af37; background: rgba(212,175,55,0.1); }
.tb-btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 22px; border-radius: 9px; border: none;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: Georgia, serif;
  box-shadow: 0 3px 14px rgba(212,175,55,0.35); transition: all 0.15s;
}
.tb-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 5px 18px rgba(212,175,55,0.45); }

.translate-banner {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  padding: 8px 24px; background: #fffbf0; border-bottom: 1px solid #f5e6b0;
  font-size: 12px; color: #92400e; font-family: Georgia, serif;
}
.translate-spinner {
  width: 13px; height: 13px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid #f5e6b0; border-top-color: #d4af37;
  animation: spin 0.7s linear infinite;
}
.translate-error-banner {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  padding: 8px 24px; background: #fef2f2; border-bottom: 1px solid #fecaca;
  font-size: 12px; color: #991b1b; font-family: Georgia, serif;
}
.err-dismiss {
  margin-left: auto; background: transparent; border: none;
  color: #991b1b; font-size: 15px; cursor: pointer; line-height: 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN LAYOUT — scrollable preview
═══════════════════════════════════════════════════════════════════════════ */
.report-scroll {
  flex: 1; overflow-y: auto; padding: 28px 16px 56px; background: #f2ede6;
}
.report-wrap {
  max-width: 820px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 0;
  box-shadow: 0 12px 60px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
  border-radius: 2px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF-PAGE — the core primitive: one section = one A4 page on screen & PDF
   On screen: looks like a paper sheet. In print: exactly A4, no overflow.
═══════════════════════════════════════════════════════════════════════════ */
.pdf-page {
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED ELEMENTS
═══════════════════════════════════════════════════════════════════════════ */
.page-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 40px; border-bottom: 1px solid #f0ece4; background: #fff;
  flex-shrink: 0;
}
/* Page header logo — perfect circle, no background */
.page-hdr-logo {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover; object-position: center;
  background: transparent;
  flex-shrink: 0;
}
.page-hdr-right { font-size: 9px; color: #bbb; letter-spacing: 0.08em; text-transform: uppercase; }
.page-hdr-dark { background: transparent !important; border-bottom-color: rgba(255,255,255,0.07) !important; }
/* Dark header logo — same circle, no background or pill */
.page-hdr-logo-dark {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover; object-position: center;
  background: transparent;
  padding: 0;
}

.gold-line { width: 52px; height: 2px; background: linear-gradient(90deg, #d4af37, transparent); margin-bottom: 24px; flex-shrink: 0; }
.gold-line-center { margin: 0 auto 24px; }

.module-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px; border-radius: 99px;
  background: #fffbf0; border: 1px solid rgba(212,175,55,0.3);
  font-size: 11px; font-weight: 600; color: #8a6a00;
}
.module-icon { font-size: 12px; }
.module-label { letter-spacing: 0.03em; }

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 1: COVER
═══════════════════════════════════════════════════════════════════════════ */
.cover { background: #14100c; min-height: 600px; }
.cover-photo-wrap {
  position: absolute; inset: 0;
  display: flex; align-items: stretch; justify-content: flex-end;
}
.cover-photo { width: 52%; height: 100%; object-fit: cover; object-position: center top; opacity: 0.28; }
.cover-fade {
  position: absolute; inset: 0;
  background: linear-gradient(105deg, #14100c 46%, transparent 80%);
}
.cover-body {
  position: relative; z-index: 2;
  flex: 1; padding: 52px 52px 36px;
  display: flex; flex-direction: column; align-items: flex-start;
}
/* Cover logo — clean circle, no background wrap */
.cover-logo-wrap {
  background: transparent;
  border-radius: 0;
  padding: 0;
  margin-bottom: 32px; flex-shrink: 0;
  display: inline-flex; align-items: center;
  box-shadow: none;
}
.cover-logo-img {
  width: 64px; height: 64px;
  border-radius: 50%;
  object-fit: cover; object-position: center;
  display: block;
}
.cover-eyebrow { font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #d4af37; margin-bottom: 14px; }
.cover-name { font-size: 44px; font-weight: 900; color: #fff; margin: 0 0 16px; line-height: 1.1; letter-spacing: -0.01em; }
.cover-rule { width: 52px; height: 2px; background: linear-gradient(90deg, #d4af37, transparent); margin-bottom: 18px; flex-shrink: 0; }
.cover-sub { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.52); line-height: 1.85; margin: 0 0 16px; }
.cover-date { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.32); margin-bottom: 24px; }
.cover-lang-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
  color: #d4af37; background: rgba(212,175,55,0.1);
  border: 1px solid rgba(212,175,55,0.3); padding: 4px 12px;
  border-radius: 99px; margin-bottom: 18px;
}
.cover-questions { display: flex; flex-direction: column; gap: 10px; max-width: 440px; }
.cq-row { display: flex; gap: 12px; align-items: flex-start; }
.cq-num {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: rgba(212,175,55,0.18); border: 1px solid rgba(212,175,55,0.4);
  color: #d4af37; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.cq-text { font-size: 13px; color: rgba(255,255,255,0.72); line-height: 1.65; }
.cover-footer-bar {
  position: relative; z-index: 2; flex-shrink: 0;
  padding: 16px 52px; border-top: 1px solid rgba(255,255,255,0.07);
  font-size: 9.5px; color: rgba(255,255,255,0.28); letter-spacing: 0.08em; text-align: center;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 2: LETTER / MESSAGE — vertically centered, fills the page
═══════════════════════════════════════════════════════════════════════════ */
.page-letter { background: #fff; }
.letter-page-body {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 32px 56px; overflow: hidden;
}
.letter-inner { width: 100%; max-width: 600px; }

/* Brand row at top of letter */
.letter-brand-row {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 32px; padding-bottom: 24px;
  border-bottom: 1px solid #f0ece4;
}
.letter-brand-logo {
  width: 48px; height: 48px;
  border-radius: 50%;
  object-fit: cover; object-position: center;
  flex-shrink: 0;
}
.letter-brand-text { display: flex; flex-direction: column; gap: 2px; }
.letter-brand-name { font-size: 15px; font-weight: 700; color: #14100c; letter-spacing: 0.01em; }
.letter-brand-tagline { font-size: 10px; color: #9ca3af; letter-spacing: 0.08em; text-transform: uppercase; }

.letter-title { font-size: 26px; font-weight: 800; color: #14100c; margin: 0 0 12px; line-height: 1.25; }
.letter-paras p { font-size: 15px; font-weight: 400; color: #374151; line-height: 2; margin: 0 0 18px; }
.letter-sign { font-size: 14px !important; color: #6b7280; line-height: 1.7 !important; }
.letter-divider { height: 1px; background: #f0ece4; margin: 22px 0; }
.letter-disclaimer {
  padding: 14px 20px;
  background: #fffbf0; border: 1px solid #f5e6b0; border-radius: 10px;
  font-size: 11px; color: #78350f; line-height: 1.8; text-align: center;
}
.letter-modules { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 3: SPIRITUAL PROFILE — larger chart, side-by-side layout
═══════════════════════════════════════════════════════════════════════════ */
.page-profile { background: #f5f5f7; }
.profile-body { flex: 1; padding: 18px 28px 20px; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
.profile-heading-row { flex-shrink: 0; padding-bottom: 4px; }
.cp-eyebrow { font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #b8a060; margin: 0 0 3px; }
.profile-title { font-size: 21px; font-weight: 700; color: #1d1d1f; margin: 0; letter-spacing: -0.01em; }

.profile-chart-wrap {
  background: #fff; border-radius: 16px; padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  flex-shrink: 0;
}
/* Row: SVG on left, planet table on right */
.profile-chart-row {
  display: flex; gap: 20px; align-items: flex-start;
}
.profile-svg-shell {
  width: 310px; height: 310px; flex-shrink: 0;
  border-radius: 12px; overflow: hidden; background: #fafaf9;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.25);
}
.vedic-svg { width: 100%; height: 100%; display: block; }

.profile-planet-grid { flex: 1; min-width: 0; }
.combo-planet-label { font-size: 9px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px; }
.combo-planet-rows { display: grid; grid-template-columns: 1fr; gap: 1px; }
.cpt-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; }
.cpt-row:hover { background: #f5f5f7; }
.cpt-sym { font-size: 13px; width: 18px; text-align: center; flex-shrink: 0; }
.cpt-name { font-size: 10.5px; font-weight: 500; color: #1d1d1f; flex: 1; }
.cpt-badge { font-size: 8.5px; font-weight: 700; color: #6e6e73; background: #f5f5f7; border-radius: 4px; padding: 1px 5px; }
.cpt-rashi { font-size: 10px; color: #6e6e73; text-align: right; min-width: 52px; }
.cpt-lagna { background: #fffbeb !important; }
.cpt-lagna .cpt-name { color: #92400e; font-weight: 600; }
.combo-planet-meta {
  display: grid; grid-template-columns: auto 1fr; gap: 3px 10px;
  margin-top: 10px; padding: 8px 10px; background: #f9f7f2; border-radius: 8px; align-items: center;
}
.cpt-meta-label { font-size: 9px; color: #9ca3af; font-weight: 600; }
.cpt-meta-val { font-size: 10.5px; font-weight: 700; color: #1d1d1f; }

.profile-num-block {
  background: #fff; border-radius: 16px; padding: 14px 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06); flex-shrink: 0;
}
.combo-num-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.combo-num-icon {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(135deg,#ede9fe,#ddd6fe); color: #4c1d95;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.combo-num-title { font-size: 14px; font-weight: 700; color: #1d1d1f; }
.combo-num-sub { font-size: 10px; color: #6e6e73; }
.combo-num-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; }
.combo-num-cell {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 10px 4px; border-radius: 10px; background: #f5f5f7; text-align: center;
}
.combo-num-val { font-size: 22px; font-weight: 700; line-height: 1; font-family: -apple-system,Georgia,serif; }
.combo-num-lbl { font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; }
.combo-num-meaning { font-size: 9px; font-weight: 500; color: #6e6e73; }
.combo-lp-bar { width: 100%; height: 3px; background: #e5e5ea; border-radius: 99px; margin-top: 3px; overflow: hidden; }
.combo-lp-fill { height: 100%; background: linear-gradient(90deg,#6366f1,#a5b4fc); border-radius: 99px; }

/* ═══════════════════════════════════════════════════════════════════════════
   QUESTION PAGES
═══════════════════════════════════════════════════════════════════════════ */
.page-question { background: #fff; }

.q-banner { display: flex; align-items: flex-start; gap: 16px; padding: 32px 48px 0; flex-shrink: 0; }
.q-circle {
  flex-shrink: 0; width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; margin-top: 2px;
}
.q-text { font-size: 20px; font-weight: 800; color: #14100c; line-height: 1.4; }

.content-block { padding: 24px 48px 0; }
.block-heading {
  font-size: 10px; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: #8a6a00; margin: 0 0 8px;
}
.narrative-para { font-size: 15px; font-weight: 400; color: #1f2937; line-height: 2; margin: 0; }

.hw-list { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.hw-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 11px 16px; background: #faf8f3;
  border-left: 3px solid #d4af37; border-radius: 0 8px 8px 0;
}
.hw-label { font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #92600a; }
.hw-answer { font-size: 13.5px; font-weight: 500; color: #1f2937; line-height: 1.75; }

.remedy-card {
  margin-top: 20px; padding: 18px 22px;
  background: linear-gradient(135deg, #fdf8ee, #fffbf2);
  border: 1px solid rgba(212,175,55,0.25); border-radius: 12px;
}
.remedy-card-head { font-size: 10px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #b45309; margin-bottom: 14px; }
.remedy-group { margin-bottom: 12px; }
.remedy-group:last-child { margin-bottom: 0; }
.remedy-group-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6d28d9; margin-bottom: 5px; }
.remedy-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.remedy-list li { font-size: 13px; font-weight: 500; color: #374151; line-height: 1.75; padding-left: 15px; position: relative; }
.remedy-list li::before { content: '✦'; position: absolute; left: 0; color: #d4af37; font-size: 8px; top: 5px; }

.edit-area {
  width: 100%; box-sizing: border-box; padding: 12px 16px;
  border: 1.5px solid #d4af37; border-radius: 8px;
  font-family: Georgia, serif; font-size: 14px; color: #374151;
  line-height: 1.85; background: #fffbf0; resize: vertical; outline: none;
}
.edit-area:focus { box-shadow: 0 0 0 3px rgba(212,175,55,0.12); }

/* ═══════════════════════════════════════════════════════════════════════════
   CLOSING PAGE — vertically centered, logo on white pill
═══════════════════════════════════════════════════════════════════════════ */
.closing-page { background: #14100c; min-height: 480px; }
.closing-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 52px 44px 36px; text-align: center;
}
.closing-photo {
  width: 110px; height: 110px; border-radius: 50%; object-fit: cover; object-position: center top;
  border: 2px solid rgba(212,175,55,0.45); margin-bottom: 24px; flex-shrink: 0;
}
.closing-name { font-size: 26px; font-weight: 800; color: #fff; margin: 0 0 14px; }
.closing-text { font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.6); line-height: 1.9; margin: 0 0 14px; max-width: 460px; }
.closing-seal { font-size: 30px; color: #d4af37; margin-top: 18px; }
.closing-footer {
  display: flex; align-items: center; justify-content: center; gap: 14px; flex-shrink: 0;
  padding: 16px 40px; border-top: 1px solid rgba(255,255,255,0.07);
  font-size: 9.5px; color: rgba(255,255,255,0.28); letter-spacing: 0.08em;
}
/* Footer logo — circle, no background */
.closing-footer-logo {
  width: 34px; height: 34px;
  border-radius: 50%;
  object-fit: cover; object-position: center;
  background: transparent;
  padding: 0;
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  color: #9ca3af; font-family: Georgia, serif;
}
.empty-icon { font-size: 32px; color: #d4af37; opacity: 0.4; }
.empty-text { font-size: 15px; color: #9ca3af; }

/* ═══════════════════════════════════════════════════════════════════════════
   PRINT — strict A4, no blank pages
   Angular component styles are scoped with [_nghost-xxx] and do NOT match
   in print context, so real print rules are injected via printPdf() below.
   This block is kept for completeness but has no effect in print.
═══════════════════════════════════════════════════════════════════════════ */
@media print {
  .no-print, .translate-banner, .translate-error-banner { display: none !important; }
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

  constructor() {}

  async ngOnInit() {
    // Load language list from backend; fallback to built-in list if offline
    try {
      const res = await firstValueFrom(this.api.getLanguages());
      this.languages.set(res.languages);
    } catch {
      this.languages.set(FALLBACK_LANGUAGES);
    }

    // If report already has a language set (translated in review tab), reflect it
    const r = this.report() as any;
    if (r?.language_code && r.language_code !== 'en') {
      this.selectedLang.set(r.language_code);
      this.translatedReport.set(r);
    }
  }

  async onLangChange(event: Event) {
    const code = (event.target as HTMLSelectElement).value;
    this.selectedLang.set(code);
    if (code === 'en') {
      this.translatedReport.set(null);
      return;
    }
    this.translatedReport.set(null);
    await this._doTranslate(code);
  }

  private async _doTranslate(code: string) {
    // Always translate from English source — never from an already-translated report
    const baseReport = this.orch.englishReport() ?? this.report();
    if (!baseReport) return;

    const lang = this.languages().find(l => l.code === code);
    this.pendingLangName.set(lang?.name ?? code);
    this.translating.set(true);
    this.translateError.set('');

    try {
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

  // ── North Indian Vedic chart ─────────────────────────────────────────────────
  // 12 house polygon points in North Indian layout (420×420 viewBox)
  // Houses go: H1=top-diamond, H2=top-right, H3=right-top, H4=right-diamond,
  //            H5=right-bottom, H6=bottom-right, H7=bottom-diamond, H8=bottom-left,
  //            H9=left-bottom, H10=left-diamond, H11=left-top, H12=top-left
  private readonly HP: Record<number, string> = {
     1: '210,2 418,106 314,106 210,106',       // top center triangle → top diamond
     2: '418,2 418,106 314,106 210,2',          // top-right corner
     3: '418,2 418,210 314,106',                // right-top triangle
     4: '418,210 314,106 314,314 418,418',      // right diamond area → use triangle
     5: '418,418 418,314 314,314',              // right-bottom triangle
     6: '418,418 314,314 210,418',              // bottom-right corner
     7: '210,418 106,314 210,314 314,314',      // bottom center
     8: '2,418 106,418 106,314 210,418',        // bottom-left corner
     9: '2,418 2,314 106,314',                  // left-bottom triangle
    10: '2,210 106,314 106,106 2,2',            // left diamond
    11: '2,2 106,106 2,106',                    // left-top triangle
    12: '2,2 210,2 106,106',                    // top-left corner
  };

  // Corrected North Indian Vedic chart — clean 12 triangular/quadrilateral houses
  private readonly HOUSE_POLYS: Record<number, string> = {
     1: '210,2 418,106 314,106 210,106',
     2: '210,2 418,2 418,106',
     3: '418,2 418,210 314,106',
     4: '418,210 418,418 314,314 314,106',
     5: '418,418 314,314 418,314',
     6: '418,418 210,418 314,314',
     7: '210,418 106,314 210,314 314,314',
     8: '210,418 2,418 106,314',
     9: '2,418 2,314 106,314',
    10: '2,418 2,2 106,106 106,314',
    11: '2,2 106,106 2,106',
    12: '2,2 210,2 106,106',
  };

  // Fill colors per house — warm/cool palette
  private readonly HOUSE_FILLS: string[] = [
    '#fff3cd','#d1ecf1','#d4edda','#f8d7da','#e2d9f3','#fde8d8',
    '#cfe2ff','#fff3cd','#d4edda','#f8d7da','#d1ecf1','#e2d9f3',
  ];

  housePoints(h: number): string { return this.HOUSE_POLYS[h] ?? ''; }
  houseFill(h: number): string { return this.HOUSE_FILLS[(h - 1) % 12]; }

  // Label & rashi center coords for each house.
  // lx/ly = house number position, rx/ry = rashi abbreviation position.
  // Each pair is deliberately offset so they never overlap — number sits
  // toward the outer corner, rashi sits toward the inner center of the house.
  houseNums(): Array<{n:number; lx:number; ly:number; rx:number; ry:number; rashi:string}> {
    const raw = this.orch.rawOutputs() as any;
    const lagna = raw?.astrology?.vedic?.chart?.lagna ?? 'Aries';
    const RASHIS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
    const lagnaIdx = RASHIS.indexOf(lagna);

    // [house-number x, house-number y, rashi-abbr x, rashi-abbr y]
    // North Indian layout: H1=top, clockwise. Numbers go to outer edge,
    // rashi abbrs go to inner area of each triangle/quad.
    const coords: Array<[number,number,number,number]> = [
      [210, 30,  210, 72],   // H1  top-center triangle   — num near apex, rashi inside
      [378, 30,  352, 72],   // H2  top-right corner
      [404, 160, 370, 160],  // H3  right-top triangle
      [404, 210, 366, 210],  // H4  right-center
      [404, 360, 370, 358],  // H5  right-bottom triangle
      [378, 404, 352, 370],  // H6  bottom-right corner
      [210, 404, 210, 368],  // H7  bottom-center triangle
      [ 42, 404,  68, 370],  // H8  bottom-left corner
      [ 16, 360,  50, 358],  // H9  left-bottom triangle
      [ 16, 210,  54, 210],  // H10 left-center
      [ 16, 160,  50, 160],  // H11 left-top triangle
      [ 42,  30,  68,  72],  // H12 top-left corner
    ];

    return Array.from({length:12},(_,i)=>({
      n:     i + 1,
      lx:    coords[i][0],
      ly:    coords[i][1],
      rx:    coords[i][2],
      ry:    coords[i][3],
      rashi: RASHIS[(lagnaIdx + i) % 12],
    }));
  }

  rashiAbbr(rashi: string): string {
    const m: Record<string,string> = {
      Aries:'Ari', Taurus:'Tau', Gemini:'Gem', Cancer:'Can', Leo:'Leo',
      Virgo:'Vir', Libra:'Lib', Scorpio:'Sco', Sagittarius:'Sag',
      Capricorn:'Cap', Aquarius:'Aqu', Pisces:'Pis',
    };
    return m[rashi] ?? rashi.slice(0,3);
  }

  lagnaRashi(): string {
    const raw = this.orch.rawOutputs() as any;
    return raw?.astrology?.vedic?.chart?.lagna ?? '—';
  }
  currentDasha(): string {
    const raw = this.orch.rawOutputs() as any;
    return raw?.astrology?.vedic?.current_dasha ?? '—';
  }
  moonNakshatra(): string {
    const raw = this.orch.rawOutputs() as any;
    return raw?.astrology?.vedic?.chart?.nakshatra ?? '—';
  }

  // Planet positions and which house they fall in
  planetsInHouses(): Array<{planet:string; house:number; rashi:string; x:number; y:number}> {
    const raw = this.orch.rawOutputs() as any;
    const vedic = raw?.astrology?.vedic ?? {};
    const chart = vedic?.chart ?? {};
    const lagna = chart.lagna ?? 'Aries';

    const RASHIS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
    const lagnaIdx = RASHIS.indexOf(lagna);

    // Planet rashi mapping from raw outputs
    const planets: Record<string,string> = {
      Sun:     chart.sun_sign   ?? RASHIS[(lagnaIdx+2)%12],
      Moon:    chart.moon_sign  ?? RASHIS[(lagnaIdx+4)%12],
      Mars:    RASHIS[(lagnaIdx+6)%12],
      Mercury: RASHIS[(lagnaIdx+1)%12],
      Jupiter: RASHIS[(lagnaIdx+8)%12],
      Venus:   RASHIS[(lagnaIdx+3)%12],
      Saturn:  RASHIS[(lagnaIdx+9)%12],
      Rahu:    RASHIS[(lagnaIdx+5)%12],
      Ketu:    RASHIS[(lagnaIdx+11)%12],
    };

    // Planet text centers — pushed inward from edges to avoid colliding
    // with the house-number and rashi labels which live at the outer corners.
    const centers: Array<[number,number]> = [
      [210,88], [354,80], [384,160], [354,210], [384,350], [322,380],
      [210,352],[96, 380],[46, 340], [66, 210], [46, 88],  [96, 80],
    ];

    // Planet offset within a house when multiple planets share it
    const houseOccupancy: Record<number,number> = {};
    const result: Array<{planet:string;house:number;rashi:string;x:number;y:number}> = [];

    // Add Lagna marker first (house 1)
    result.push({ planet:'Lagna', house:1, rashi:lagna, x:centers[0][0], y:centers[0][1]+4 });

    for (const [planet, rashi] of Object.entries(planets)) {
      const rashiIdx = RASHIS.indexOf(rashi);
      const houseNum = ((rashiIdx - lagnaIdx + 12) % 12) + 1;
      houseOccupancy[houseNum] = (houseOccupancy[houseNum] ?? 0) + 1;
      const slotY = (houseOccupancy[houseNum] - 1) * 11;
      const [cx, cy] = centers[houseNum - 1];
      result.push({ planet, house:houseNum, rashi, x:cx, y:cy + slotY });
    }
    return result;
  }

  planetSymbol(planet: string): string {
    const s: Record<string,string> = {
      Sun:'☉', Moon:'☽', Mars:'♂', Mercury:'☿', Jupiter:'♃',
      Venus:'♀', Saturn:'♄', Rahu:'☊', Ketu:'☋', Lagna:'Asc',
    };
    return s[planet] ?? planet.slice(0,2);
  }

  planetColor(planet: string): string {
    const c: Record<string,string> = {
      Sun:'#d97706', Moon:'#7c3aed', Mars:'#dc2626', Mercury:'#16a34a',
      Jupiter:'#d4af37', Venus:'#db2777', Saturn:'#374151',
      Rahu:'#0891b2', Ketu:'#92400e', Lagna:'#d4af37',
    };
    return c[planet] ?? '#374151';
  }

  // ── Module helpers ──────────────────────────────────────────────────────────
  moduleIcon(m: string): string {
    const map: Record<string,string> = {
      astrology:'★', numerology:'◈', palmistry:'✋', tarot:'🂠', vastu:'⌂',
    };
    return map[m] ?? '✦';
  }
  moduleLabel(m: string): string {
    const map: Record<string,string> = {
      astrology:'Vedic Astrology', numerology:'Numerology',
      palmistry:'Palmistry', tarot:'Tarot', vastu:'Vastu',
    };
    return map[m] ?? m.charAt(0).toUpperCase()+m.slice(1);
  }
  hasModule(m: string): boolean {
    return (this.displayReport()?.modules_used ?? []).includes(m);
  }

  // ── Donut chart helpers ──────────────────────────────────────────────────────
  private readonly CIRC = 2 * Math.PI * 46; // circumference for r=46
  confidencePct(): { high: number; medium: number; low: number } {
    const sections = this.displayReport()?.sections ?? [];
    let h = 0, m = 0, l = 0;
    for (const s of sections) {
      for (const ins of s.insights ?? []) {
        if (ins.confidence === 'high') h++;
        else if (ins.confidence === 'medium') m++;
        else l++;
      }
    }
    const total = h + m + l || 1;
    return {
      high:   Math.round(h / total * 100),
      medium: Math.round(m / total * 100),
      low:    Math.round(l / total * 100),
    };
  }
  totalInsights(): number {
    return (this.displayReport()?.sections ?? [])
      .reduce((s: number, sec: any) => s + (sec.insights?.length ?? 0), 0);
  }
  donutArc(pct: number): string {
    const arc = (pct / 100) * this.CIRC;
    return `${arc} ${this.CIRC - arc}`;
  }
  donutOffset(pct: number): string {
    return String(-((pct / 100) * this.CIRC));
  }

  // ── Domain bar chart helpers ─────────────────────────────────────────────────
  private readonly DOMAIN_COLORS: Record<string,string> = {
    astrology:'#0e7490', numerology:'#7c3aed', palmistry:'#b45309',
    tarot:'#be185d', vastu:'#047857',
  };
  private readonly DOMAIN_LIGHT: Record<string,string> = {
    astrology:'#e0f2fe', numerology:'#ede9fe', palmistry:'#fef3c7',
    tarot:'#fce7f3', vastu:'#d1fae5',
  };
  domainColor(d: string): string { return this.DOMAIN_COLORS[d] ?? '#6b7280'; }
  domainColorLight(d: string): string { return this.DOMAIN_LIGHT[d] ?? '#f3f4f6'; }
  domainBreakdown(section: any): Array<{domain:string; count:number; pct:number}> {
    const counts: Record<string,number> = {};
    for (const ins of section.insights ?? []) {
      for (const d of ins.domains ?? []) {
        counts[d] = (counts[d] ?? 0) + 1;
      }
    }
    const total = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
    return Object.entries(counts).map(([domain, count]) => ({
      domain, count, pct: Math.round(count/total*100),
    }));
  }

  // ── Astrology chart cells ────────────────────────────────────────────────────
  astroChartCells(): Array<{label:string; value:string; highlight:boolean}> {
    const raw = this.orch.rawOutputs() as any;
    const vedic = raw?.astrology?.vedic ?? {};
    const chart = vedic?.chart ?? {};
    return [
      { label:'Lagna',    value: chart.lagna      ?? '—', highlight: true  },
      { label:'Moon',     value: chart.moon_sign  ?? '—', highlight: false },
      { label:'Sun',      value: chart.sun_sign   ?? '—', highlight: false },
      { label:'Nakshatra',value: chart.nakshatra  ?? '—', highlight: false },
      { label:'Dasha',    value: vedic.current_dasha ?? '—', highlight: true  },
      { label:'Yogas',    value: (vedic.active_yogas ?? []).slice(0,2).join(', ') || '—', highlight: false },
    ];
  }

  // ── Numerology numbers ───────────────────────────────────────────────────────
  numerologyNumbers(): Array<{label:string; value:string}> {
    const raw = this.orch.rawOutputs() as any;
    const indian = raw?.numerology?.indian?.core_numbers ?? {};
    return [
      { label:'Life Path',  value: String(indian.life_path  ?? '—') },
      { label:'Destiny',    value: String(indian.destiny    ?? '—') },
      { label:'Name No.',   value: String(indian.name_number ?? '—') },
      { label:'Soul Urge',  value: String(indian.soul_urge  ?? '—') },
    ];
  }
  lifePathNumber(): number {
    const raw = this.orch.rawOutputs() as any;
    return raw?.numerology?.indian?.core_numbers?.life_path ?? 0;
  }
  lifePathPct(): number {
    const lp = this.lifePathNumber();
    return lp ? Math.round((lp / 9) * 100) : 0;
  }

  numColor(value: string | number): string {
    const n = Number(value) % 9 || 9;
    const palette = ['#e11d48','#f97316','#eab308','#22c55e','#0ea5e9','#8b5cf6','#ec4899','#14b8a6','#f59e0b'];
    return palette[(n - 1) % palette.length];
  }

  numMeaning(label: string, value: string | number): string {
    const meanings: Record<string, Record<number, string>> = {
      'Life Path': {1:'Leader',2:'Diplomat',3:'Creative',4:'Builder',5:'Explorer',6:'Nurturer',7:'Seeker',8:'Achiever',9:'Humanitarian'},
      'Destiny':   {1:'Pioneer',2:'Peacemaker',3:'Communicator',4:'Organiser',5:'Adventurer',6:'Caregiver',7:'Mystic',8:'Executive',9:'Philanthropist'},
      'Soul Urge': {1:'Independence',2:'Harmony',3:'Expression',4:'Stability',5:'Freedom',6:'Love',7:'Wisdom',8:'Power',9:'Compassion'},
      'Birthday':  {1:'Original',2:'Sensitive',3:'Artistic',4:'Practical',5:'Versatile',6:'Responsible',7:'Analytical',8:'Ambitious',9:'Generous'},
    };
    const n = Number(value) % 9 || 9;
    const group = Object.entries(meanings).find(([k]) => label.toLowerCase().includes(k.toLowerCase()));
    return group ? (group[1][n] ?? '') : '';
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
    // 1. Convert images to base64 so they survive the print context
    const imgs = document.querySelectorAll<HTMLImageElement>('#report-doc img');
    const origSrcs: string[] = [];
    await Promise.all(Array.from(imgs).map(async (img, i) => {
      origSrcs[i] = img.src;
      if (!img.src.startsWith('data:')) img.src = await this.toBase64(img.src);
    }));

    // 2. Inject unscoped print CSS.
    //    Angular scopes component styles with [_nghost-xxx] which doesn't exist
    //    in print context — so ALL print rules MUST be injected here globally.
    const style = document.createElement('style');
    style.id = '__aura-print-css';
    style.textContent = `
      /* ── A4 page geometry ── */
      @page {
        size: A4 portrait;
        margin: 0;
      }

      @media print {
        /* ── Color accuracy ── */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          box-sizing: border-box !important;
        }

        /* ── Hide chrome ── */
        .no-print,
        .translate-banner,
        .translate-error-banner { display: none !important; }

        /* ── Reset host + scroll containers ── */
        app-report {
          display: block !important;
          width: 210mm !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          background: transparent !important;
        }
        .report-scroll {
          display: block !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
          width: 210mm !important;
          height: auto !important;
          min-height: 0 !important;
          background: transparent !important;
        }
        .report-wrap {
          display: block !important;
          width: 210mm !important;
          max-width: 210mm !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          background: transparent !important;
          overflow: visible !important;
        }

        /* ── Core A4 page primitive ──
           Each .pdf-page = exactly one A4 page.
           page-break-after:always pushes the NEXT sibling to a new sheet.
           overflow:hidden clips content so nothing spills into the next page.
        ── */
        .pdf-page {
          display: block !important;
          width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
          overflow: hidden !important;
          page-break-before: always !important;
          break-before: page !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          position: relative !important;
          box-sizing: border-box !important;
        }

        /* ── First page: no leading blank page ── */
        .pdf-page:first-of-type {
          page-break-before: auto !important;
          break-before: auto !important;
        }

        /* ── Cover ── */
        .cover {
          background: #14100c !important;
        }
        .cover-photo-wrap { position: absolute !important; inset: 0 !important; }
        .cover-photo { display: block !important; opacity: 0.3 !important; width: 52% !important; height: 100% !important; object-fit: cover !important; }
        .cover-fade { position: absolute !important; inset: 0 !important; }
        .cover-body { position: relative !important; z-index: 2 !important; padding: 36px 44px !important; }
        .cover-footer-bar { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; z-index: 2 !important; }

        /* ── All logos: perfect circle, no background, no distortion ── */
        .page-hdr-logo {
          width: 36px !important; height: 36px !important;
          border-radius: 50% !important;
          object-fit: cover !important; object-position: center !important;
          background: transparent !important;
          padding: 0 !important; flex-shrink: 0 !important;
        }
        .page-hdr-logo-dark {
          width: 36px !important; height: 36px !important;
          border-radius: 50% !important;
          object-fit: cover !important; object-position: center !important;
          background: transparent !important;
          padding: 0 !important;
        }

        /* ── Cover logo ── */
        .cover-logo-wrap {
          background: transparent !important;
          border-radius: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .cover-logo-img {
          width: 64px !important; height: 64px !important;
          border-radius: 50% !important;
          object-fit: cover !important; object-position: center !important;
          display: block !important;
        }

        /* ── Letter brand logo ── */
        .letter-brand-logo {
          width: 48px !important; height: 48px !important;
          border-radius: 50% !important;
          object-fit: cover !important; object-position: center !important;
        }

        /* ── Closing footer logo ── */
        .closing-footer-logo {
          width: 34px !important; height: 34px !important;
          border-radius: 50% !important;
          object-fit: cover !important; object-position: center !important;
          background: transparent !important;
          padding: 0 !important;
          filter: none !important;
        }

        /* ── Letter page: vertically centered, fills the page ── */
        .page-letter { background: #fff !important; }
        .letter-page-body {
          flex: 1 !important; display: flex !important;
          align-items: center !important; justify-content: center !important;
          padding: 28px 44px 20px !important; overflow: hidden !important;
        }
        .letter-inner { width: 100% !important; max-width: 600px !important; }
        .letter-brand-row {
          display: flex !important; align-items: center !important; gap: 16px !important;
          margin-bottom: 28px !important; padding-bottom: 20px !important;
          border-bottom: 1px solid #f0ece4 !important;
        }
        .letter-brand-logo { width: 48px !important; height: 48px !important; border-radius: 50% !important; object-fit: cover !important; object-position: center !important; }
        .letter-paras p { font-size: 14px !important; line-height: 1.9 !important; margin: 0 0 14px !important; }

        /* ── Profile page: larger chart, side-by-side layout ── */
        .page-profile { background: #f5f5f7 !important; }
        .profile-body { padding: 14px 24px 14px !important; gap: 10px !important; overflow: hidden !important; }
        .profile-chart-wrap { box-shadow: none !important; border: 1px solid #e5e5ea !important; padding: 12px 16px !important; }
        .profile-chart-row { display: flex !important; gap: 20px !important; align-items: flex-start !important; }
        .profile-svg-shell {
          width: 310px !important; height: 310px !important;
          flex-shrink: 0 !important;
          box-shadow: none !important;
          border: 1px solid rgba(212,175,55,0.3) !important;
        }
        .profile-planet-grid { flex: 1 !important; min-width: 0 !important; }
        .combo-planet-rows { display: grid !important; grid-template-columns: 1fr !important; gap: 1px !important; }
        .combo-planet-meta { display: grid !important; grid-template-columns: auto 1fr !important; gap: 3px 10px !important; }
        .profile-num-block { box-shadow: none !important; border: 1px solid #e5e5ea !important; padding: 10px 16px !important; }
        .combo-num-grid { gap: 5px !important; }
        .combo-num-cell { padding: 6px 3px !important; }
        .combo-num-val { font-size: 17px !important; }

        /* ── Question pages ── */
        .page-question { background: #fff !important; }
        .q-banner { padding: 24px 40px 0 !important; }
        .content-block { padding: 16px 40px 0 !important; }
        .hw-item { break-inside: avoid !important; page-break-inside: avoid !important; }
        .remedy-card {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          margin-top: 14px !important;
          padding: 13px 16px !important;
        }
        .remedy-group { break-inside: avoid !important; page-break-inside: avoid !important; }
        .q-banner { break-after: avoid !important; page-break-after: avoid !important; }
        .block-heading { break-after: avoid !important; page-break-after: avoid !important; }
        .edit-area { border: none !important; background: transparent !important; resize: none !important; padding: 0 !important; }

        /* ── Closing page ── */
        .closing-page { background: #14100c !important; }
        .closing-body { padding: 40px 36px 28px !important; }

        /* ── Shared ── */
        .page-hdr { padding: 10px 36px !important; }
        .gold-line { margin-bottom: 16px !important; }
      }
    `;
    document.head.appendChild(style);

    window.print();

    // 3. Restore
    document.head.removeChild(style);
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
