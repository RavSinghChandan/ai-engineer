import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ApiService, LanguageOption } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { AppFooterComponent } from '../../components/shared/app-footer.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule, KeyValuePipe, AppFooterComponent],
  template: `
@if (chakraSpinning()) {
  <div class="chakra-spin-portal" aria-hidden="true">
    <div class="chakra-spin-circle">
      <img src="rav-logo.png" class="chakra-spin-img" alt=""/>
    </div>
  </div>
}

<!-- ══ Toolbar ═══════════════════════════════════════════════════════════════ -->
<div class="toolbar no-print">

  <div class="tb-left">
    <button class="tb-icon-btn" (click)="goBack()" [title]="auth.isAdmin() ? 'Back to Review' : 'Back to Home'">
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
    @if (auth.isAdmin()) {
      <button class="tb-btn" (click)="router.navigate(['/admin/users'])" title="Leads & Users">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 6a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0zM2 11.5c0-2 2-3.5 4.5-3.5s4.5 1.5 4.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        Leads
      </button>
      <button class="tb-btn" (click)="router.navigate(['/metrics'])" title="Metrics">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 10.5l3-4 3 2.5 3.5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Metrics
      </button>
      <button class="tb-btn" [class.tb-btn-active]="editMode()" (click)="editMode.set(!editMode())">
        @if (editMode()) {
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5L11 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Done
        } @else {
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 2l2 2-6.5 6.5L2 11l.5-2.5L9 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Edit
        }
      </button>
    }
    <button class="tb-btn-primary" (click)="printPdf()">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3 6l3.5 3.5L10 6M1.5 11h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Download PDF
    </button>
    <button class="tb-btn" (click)="goHome()">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L6.5 2l5 4.5M2.5 6v5h2.5V8h3v3h2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Home
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
        <div class="cover-eyebrow">{{ displayReport()!.cover_eyebrow || 'Personal Spiritual Intelligence Report' }}</div>
        <h1 class="cover-name">{{ displayReport()!.user_name }}</h1>
        <div class="cover-rule"></div>
        <p class="cover-sub">{{ displayReport()!.cover_sub || 'A personalised reading through the combined wisdom of Vedic Astrology · Numerology · Tarot' }}</p>
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
        {{ displayReport()!.cover_footer || 'Prepared by Aura with Rav · Confidential · For personal guidance only' }}
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
              <div class="letter-brand-tagline">{{ displayReport()!.letter_tagline || 'Personal Spiritual Intelligence Report' }}</div>
            </div>
          </div>
          <h2 class="letter-title">{{ displayReport()!.letter_title || ('A Message for ' + displayReport()!.user_name) }}</h2>
          <div class="gold-line"></div>
          <div class="letter-paras">
            <p>{{ displayReport()!.letter_para1 || ('Dear ' + displayReport()!.user_name + ',') }}</p>
            <p>{{ displayReport()!.letter_para2 || 'Thank you for trusting Aura with Rav with your questions. This report has been prepared with care, drawing on the ancient wisdom of Vedic Astrology, Numerology, and Tarot — three traditions that offer a remarkably coherent picture of your journey.' }}</p>
            <p>{{ displayReport()!.letter_para3 || 'The insights here are tendencies, patterns, and energies the cosmos reflects at this moment in your life. Your awareness and choices remain the most powerful forces at work.' }}</p>
            <p>{{ displayReport()!.letter_para4 || 'May these reflections bring you greater clarity, direction, and peace as you navigate this chapter of your life.' }}</p>
            <p class="letter-sign">{{ displayReport()!.letter_sign || 'With light and clarity,' }}<br><strong>Rav</strong> &nbsp;·&nbsp; <em>Aura with Rav</em></p>
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

          <!-- ── Module Methodology Panel ── -->
          @if (moduleMethods() | keyvalue; as methods) {
            @if (methods.length) {
              <div class="report-method-panel">
                <div class="rmp-title">{{ displayReport()!.label_analysis_methodology || 'Analysis Methodology' }}</div>
                <div class="rmp-grid">
                  @for (entry of methods; track entry.key) {
                    <div class="rmp-item">
                      <div class="rmp-item-hdr">
                        <span class="rmp-icon">{{ entry.value.icon }}</span>
                        <span class="rmp-label">{{ entry.value.label }}</span>
                      </div>
                      <div class="rmp-branches">
                        @for (b of entry.value.branches; track b) {
                          <span class="rmp-branch">{{ b }}</span>
                        }
                      </div>
                      @if (entry.value.ayanamsa) {
                        <div class="rmp-meta">Ayanamsa: {{ entry.value.ayanamsa }}</div>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          }
        </div>
      </div>
      <!-- ── Letter watermark zone: fills remaining space below content ── -->
      <div class="letter-watermark-zone">
        <img src="rav-logo.png" alt="" class="letter-watermark" aria-hidden="true"/>
      </div>
    </div>

    <!-- ══ PAGE 3: SPIRITUAL PROFILE — astrology + numerology ══ -->
    <div class="pdf-page page-profile">
      <div class="page-hdr">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
        <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
      </div>
      <div class="profile-body">
        <div class="profile-heading-row">
          <p class="cp-eyebrow">{{ displayReport()!.label_cosmic_blueprint || 'Cosmic Blueprint' }}</p>
          <h2 class="profile-title">{{ displayReport()!.label_spiritual_profile || 'Your Spiritual Profile' }}</h2>
        </div>

        <!-- ══ ASTROLOGY — North Indian Birth Chart ══ -->
        @if (hasModule('astrology')) {
          <div class="mod-block mod-astro">
            <div class="mod-block-hdr">
              <div class="mod-block-hdr-left">
                <div class="mod-icon-wrap mod-icon-astro">
                  <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
                    <circle cx="16" cy="16" r="7" fill="#f59e0b" opacity="0.9"/>
                    <circle cx="16" cy="16" r="13" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.5"/>
                    <circle cx="28" cy="8"  r="3" fill="#818cf8"/>
                    <circle cx="4"  cy="24" r="2" fill="#c084fc"/>
                    <circle cx="26" cy="23" r="1.5" fill="#34d399"/>
                  </svg>
                </div>
                <div>
                  <div class="mod-title">Vedic Birth Chart</div>
                  <div class="mod-sub">North Indian · Lahiri Ayanamsa · {{ ayanamsaLabel() }}</div>
                </div>
              </div>
              <div class="mod-badge mod-badge-astro">Jyotish</div>
            </div>
            <div class="mod-body-row">
              <!-- North Indian Chart SVG — full color -->
              <div class="chart-svg-wrap">
                <svg viewBox="0 0 440 440" xmlns="http://www.w3.org/2000/svg" class="vedic-svg-v2">
                  <defs>
                    <filter id="inkP" x="-5%" y="-5%" width="110%" height="110%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise"/>
                      <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.6" xChannelSelector="R" yChannelSelector="G"/>
                    </filter>
                  </defs>
                  <!-- Parchment ground -->
                  <rect width="440" height="440" fill="#f5f0e8"/>
                  <!-- Subtle paper grain overlay -->
                  <rect width="440" height="440" fill="none" stroke="#c8b99a" stroke-width="0.3" opacity="0.4"/>
                  <!-- Outer manuscript border — double rule -->
                  <rect x="8" y="8" width="424" height="424" fill="none" stroke="#8b6914" stroke-width="1.2" opacity="0.7"/>
                  <rect x="13" y="13" width="414" height="414" fill="none" stroke="#8b6914" stroke-width="0.5" opacity="0.4"/>
                  <!-- Corner ornaments — hand-drawn cross marks -->
                  <line x1="8" y1="24" x2="24" y2="8"   stroke="#8b6914" stroke-width="0.8" opacity="0.5"/>
                  <line x1="416" y1="8" x2="432" y2="24" stroke="#8b6914" stroke-width="0.8" opacity="0.5"/>
                  <line x1="8" y1="416" x2="24" y2="432" stroke="#8b6914" stroke-width="0.8" opacity="0.5"/>
                  <line x1="416" y1="432" x2="432" y2="416" stroke="#8b6914" stroke-width="0.8" opacity="0.5"/>
                  <!-- Inner North-Indian chart square -->
                  <rect x="110" y="110" width="220" height="220" fill="#ede6d6" stroke="#8b6914" stroke-width="1" opacity="0.85"/>
                  <!-- Chart diagonals -->
                  <line x1="110" y1="110" x2="330" y2="330" stroke="#8b6914" stroke-width="0.7" opacity="0.45"/>
                  <line x1="330" y1="110" x2="110" y2="330" stroke="#8b6914" stroke-width="0.7" opacity="0.45"/>
                  <!-- Cross through center -->
                  <line x1="220" y1="110" x2="220" y2="330" stroke="#8b6914" stroke-width="0.5" opacity="0.3"/>
                  <line x1="110" y1="220" x2="330" y2="220" stroke="#8b6914" stroke-width="0.5" opacity="0.3"/>
                  <!-- Sacred circle inscribed in chart square -->
                  <circle cx="220" cy="220" r="78" fill="none" stroke="#8b6914" stroke-width="0.5" stroke-dasharray="4 3" opacity="0.35"/>
                  <!-- House polygons — aged parchment tones -->
                  @for (h of [1,2,3,4,5,6,7,8,9,10,11,12]; track h) {
                    <polygon [attr.points]="housePoints(h)" [attr.fill]="houseFill(h)" opacity="0.6"/>
                    <polygon [attr.points]="housePoints(h)" fill="none" stroke="#8b6914" stroke-width="0.8" opacity="0.5"/>
                  }
                  <!-- House numbers — sepia ink -->
                  @for (h of houseNums(); track h.n) {
                    <text [attr.x]="h.lx" [attr.y]="h.ly" text-anchor="middle" dominant-baseline="middle"
                          font-size="11" fill="#5c3d0e" font-weight="700" font-family="Georgia,serif" opacity="0.85">{{ h.n }}</text>
                  }
                  <!-- Rashi abbreviations — muted indigo -->
                  @for (h of houseNums(); track h.n) {
                    <text [attr.x]="h.rx" [attr.y]="h.ry" text-anchor="middle" dominant-baseline="middle"
                          font-size="8" fill="#3d3460" font-weight="600" font-family="Georgia,serif" opacity="0.7">{{ rashiAbbr(h.rashi) }}</text>
                  }
                  <!-- Planet symbols — manuscript ink -->
                  @for (p of planetsInHouses(); track p.planet) {
                    <text [attr.x]="p.x" [attr.y]="p.y" text-anchor="middle" dominant-baseline="middle"
                          [attr.font-size]="p.planet === 'Lagna' ? '12' : '10'"
                          [attr.font-weight]="p.planet === 'Lagna' ? '900' : '700'"
                          [attr.fill]="planetColor(p.planet)"
                          font-family="Georgia,serif">{{ planetSymbol(p.planet) }}</text>
                  }
                  <!-- Center label — engraved style -->
                  <rect x="174" y="206" width="92" height="26" rx="3" fill="#ede6d6" stroke="#8b6914" stroke-width="0.8" opacity="0.9"/>
                  <text x="220" y="222" text-anchor="middle" dominant-baseline="middle"
                        font-size="7.5" fill="#5c3d0e" font-weight="700" letter-spacing="2.5"
                        font-family="Georgia,serif">BIRTH CHART</text>
                  <!-- Celestial dot markers — subtle star field on parchment -->
                  <circle cx="38"  cy="34"  r="1.2" fill="#8b6914" opacity="0.3"/>
                  <circle cx="402" cy="28"  r="0.9" fill="#8b6914" opacity="0.25"/>
                  <circle cx="48"  cy="408" r="1"   fill="#8b6914" opacity="0.28"/>
                  <circle cx="396" cy="404" r="1.1" fill="#8b6914" opacity="0.3"/>
                  <circle cx="72"  cy="60"  r="0.7" fill="#8b6914" opacity="0.2"/>
                  <circle cx="370" cy="378" r="0.8" fill="#8b6914" opacity="0.2"/>
                </svg>
              </div>
              <!-- Planet data table -->
              <div class="astro-data-panel">
                <div class="astro-data-title">Planetary Positions</div>
                <div class="planet-table">
                  @for (p of planetsInHouses(); track p.planet) {
                    @if (p.planet !== 'Lagna') {
                      <div class="pt-row">
                        <span class="pt-sym" [style.color]="planetColor(p.planet)" style="filter:drop-shadow(0 0 3px currentColor)">{{ planetSymbol(p.planet) }}</span>
                        <span class="pt-name">{{ p.planet }}</span>
                        <span class="pt-house">H{{ p.house }}</span>
                        <span class="pt-rashi">{{ p.rashi }}</span>
                      </div>
                    }
                  }
                  <div class="pt-row pt-lagna">
                    <span class="pt-sym" style="color:#f5d06e;filter:drop-shadow(0 0 3px #f5d06e)">⊕</span>
                    <span class="pt-name">Lagna</span>
                    <span class="pt-house">H1</span>
                    <span class="pt-rashi">{{ lagnaRashi() }}</span>
                  </div>
                </div>
                <div class="astro-meta-grid">
                  <div class="astro-meta-cell">
                    <div class="astro-meta-lbl">Dasha</div>
                    <div class="astro-meta-val">{{ currentDasha() }}</div>
                  </div>
                  <div class="astro-meta-cell">
                    <div class="astro-meta-lbl">Nakshatra</div>
                    <div class="astro-meta-val">{{ moonNakshatra() }}</div>
                  </div>
                  <div class="astro-meta-cell">
                    <div class="astro-meta-lbl">Ayanamsa</div>
                    <div class="astro-meta-val">{{ ayanamsaLabel() }}</div>
                  </div>
                  <div class="astro-meta-cell">
                    <div class="astro-meta-lbl">Birth Time</div>
                    <div class="astro-meta-val" [style.color]="isApproxChart() ? '#fbbf24' : '#34d399'">
                      {{ isApproxChart() ? 'Approximate' : 'Exact' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- ══ NUMEROLOGY — Lo Shu Grid ══ -->
        @if (hasModule('numerology')) {
          <div class="mod-block mod-num">
            <div class="mod-block-hdr">
              <div class="mod-block-hdr-left">
                <div class="mod-icon-wrap mod-icon-num">
                  <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
                    <rect x="2" y="2" width="8" height="8" rx="2" fill="#a78bfa"/>
                    <rect x="12" y="2" width="8" height="8" rx="2" fill="#818cf8"/>
                    <rect x="22" y="2" width="8" height="8" rx="2" fill="#c084fc"/>
                    <rect x="2" y="12" width="8" height="8" rx="2" fill="#818cf8"/>
                    <rect x="12" y="12" width="8" height="8" rx="2" fill="#6366f1"/>
                    <rect x="22" y="12" width="8" height="8" rx="2" fill="#818cf8"/>
                    <rect x="2" y="22" width="8" height="8" rx="2" fill="#c084fc"/>
                    <rect x="12" y="22" width="8" height="8" rx="2" fill="#818cf8"/>
                    <rect x="22" y="22" width="8" height="8" rx="2" fill="#a78bfa"/>
                  </svg>
                </div>
                <div>
                  <div class="mod-title">Sacred Numbers</div>
                  <div class="mod-sub">{{ displayReport()!.user_name }}'s numerological blueprint · Lo Shu Grid</div>
                </div>
              </div>
              <div class="mod-badge mod-badge-num">Numerology</div>
            </div>
            <div class="mod-body-row">
              <!-- Lo Shu Grid SVG -->
              <div class="loshu-wrap">
                <svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg" class="loshu-svg">
                  <!-- Parchment ground -->
                  <rect width="260" height="260" fill="#f5f0e8"/>
                  <!-- Outer double border — manuscript style -->
                  <rect x="6" y="6" width="248" height="248" fill="none" stroke="#8b6914" stroke-width="1.2" opacity="0.6"/>
                  <rect x="10" y="10" width="240" height="240" fill="none" stroke="#8b6914" stroke-width="0.4" opacity="0.35"/>
                  <!-- Corner marks -->
                  <line x1="6" y1="20"  x2="20" y2="6"   stroke="#8b6914" stroke-width="0.8" opacity="0.45"/>
                  <line x1="240" y1="6" x2="254" y2="20"  stroke="#8b6914" stroke-width="0.8" opacity="0.45"/>
                  <line x1="6" y1="240" x2="20" y2="254"  stroke="#8b6914" stroke-width="0.8" opacity="0.45"/>
                  <line x1="240" y1="254" x2="254" y2="240" stroke="#8b6914" stroke-width="0.8" opacity="0.45"/>
                  <!-- Grid lines — sepia ruled lines -->
                  <line x1="92"  y1="14" x2="92"  y2="246" stroke="#8b6914" stroke-width="0.9" opacity="0.4"/>
                  <line x1="168" y1="14" x2="168" y2="246" stroke="#8b6914" stroke-width="0.9" opacity="0.4"/>
                  <line x1="14"  y1="92" x2="246" y2="92"  stroke="#8b6914" stroke-width="0.9" opacity="0.4"/>
                  <line x1="14"  y1="168" x2="246" y2="168" stroke="#8b6914" stroke-width="0.9" opacity="0.4"/>
                  <!-- Lo Shu cells -->
                  @for (cell of loShuGrid(); track cell.pos) {
                    <rect [attr.x]="cell.x+4" [attr.y]="cell.y+4" width="74" height="74"
                          [attr.fill]="cell.fill" rx="2" opacity="0.88"/>
                    <!-- Large numeral — engraved -->
                    <text [attr.x]="cell.x+41" [attr.y]="cell.y+48" text-anchor="middle" dominant-baseline="middle"
                          font-size="28" font-weight="400" [attr.fill]="cell.numColor"
                          font-family="Georgia,serif" opacity="0.92">{{ cell.num }}</text>
                    <!-- Domain label -->
                    <text [attr.x]="cell.x+41" [attr.y]="cell.y+67" text-anchor="middle"
                          font-size="6.5" font-weight="600" [attr.fill]="cell.labelColor"
                          font-family="Georgia,serif" letter-spacing="0.5">{{ cell.label }}</text>
                  }
                  <!-- Center diamond ornament -->
                  <polygon points="130,121 137,130 130,139 123,130" fill="none" stroke="#8b6914" stroke-width="0.8" opacity="0.5"/>
                  <circle cx="130" cy="130" r="2.5" fill="#8b6914" opacity="0.35"/>
                </svg>
              </div>
              <!-- Number cells -->
              <div class="num-cells-panel">
                <div class="num-branch-row">
                  @for (b of numerologyBranches(); track b) {
                    <span class="num-branch-pill">{{ b }}</span>
                  }
                </div>
                <div class="num-cards-grid">
                  @for (n of numerologyNumbers(); track n.label) {
                    <div class="num-card" [style.border-color]="numColor(n.value)">
                      <div class="num-card-val" [style.color]="numColor(n.value)">{{ n.value }}</div>
                      <div class="num-card-lbl">{{ n.label }}</div>
                      <div class="num-card-meaning">{{ numMeaning(n.label, n.value) }}</div>
                    </div>
                  }
                  <div class="num-card num-card-lp">
                    <div class="num-card-val" style="color:#a78bfa">{{ lifePathNumber() }}</div>
                    <div class="num-card-lbl">Life Path</div>
                    <div class="num-card-meaning">{{ numMeaning('Life Path', lifePathNumber()) }}</div>
                    <div class="num-lp-bar"><div class="num-lp-fill" [style.width.%]="lifePathPct()"></div></div>
                  </div>
                </div>
                @if (numerologyTraditions().length > 1) {
                  <div class="num-tradition-table">
                    <div class="ntt-hdr-row">
                      <span class="ntt-col-label">Tradition</span>
                      <span class="ntt-col">Life Path</span>
                      <span class="ntt-col">Name No.</span>
                      <span class="ntt-col">Destiny</span>
                      <span class="ntt-col">Soul Urge</span>
                    </div>
                    @for (t of numerologyTraditions(); track t.name) {
                      <div class="ntt-row">
                        <span class="ntt-col-label ntt-tradition">{{ t.name }}</span>
                        <span class="ntt-col" [style.color]="numColor(t.life_path)">{{ t.life_path }}</span>
                        <span class="ntt-col" [style.color]="numColor(t.name_number)">{{ t.name_number }}</span>
                        <span class="ntt-col" [style.color]="numColor(t.destiny)">{{ t.destiny }}</span>
                        <span class="ntt-col" [style.color]="numColor(t.soul_urge)">{{ t.soul_urge }}</span>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- ── Watermark fills remaining space on profile page ── -->
        <div class="profile-watermark-zone">
          <img src="rav-logo.png" alt="" class="profile-watermark" aria-hidden="true"/>
        </div>

      </div>
    </div>

    <!-- ══ PAGE 4: DIVINATION ARTS — palmistry + tarot + vastu ══ -->
    @if (hasModule('palmistry') || hasModule('tarot') || hasModule('vastu')) {
    <div class="pdf-page page-profile">
      <div class="page-hdr">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
        <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
      </div>
      <div class="profile-body">
        <div class="profile-heading-row">
          <p class="cp-eyebrow">Divination Arts</p>
          <h2 class="profile-title">Palmistry · Tarot · Vastu</h2>
        </div>

        <!-- ══ PALMISTRY — Hand diagram with colored lines ══ -->
        @if (hasModule('palmistry')) {
          <div class="mod-block mod-palm">
            <div class="mod-block-hdr">
              <div class="mod-block-hdr-left">
                <div class="mod-icon-wrap mod-icon-palm">
                  <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
                    <path d="M16 28 C8 28 4 22 4 16 L4 8 C4 6.9 4.9 6 6 6 C7.1 6 8 6.9 8 8 L8 14" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M8 10 L8 5 C8 3.9 8.9 3 10 3 C11.1 3 12 3.9 12 5 L12 13" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M12 9 L12 4 C12 2.9 12.9 2 14 2 C15.1 2 16 2.9 16 4 L16 13" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M16 10 L16 5 C16 3.9 16.9 3 18 3 C19.1 3 20 3.9 20 5 L20 14" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </div>
                <div>
                  <div class="mod-title">Palm Reading</div>
                  <div class="mod-sub">Indian · Chinese · Western — 3 traditions analysed</div>
                </div>
              </div>
              <div class="mod-badge mod-badge-palm">Palmistry</div>
            </div>
            <div class="mod-body-row">
              <!-- Hand SVG with labeled lines -->
              <div class="hand-svg-wrap">
                <svg viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" class="hand-svg">
                  <defs>
                    <!-- Sepia skin tone — parchment-like -->
                    <linearGradient id="skinGrad" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stop-color="#e8d5b0"/>
                      <stop offset="100%" stop-color="#d4b483"/>
                    </linearGradient>
                    <!-- Subtle paper texture filter -->
                    <filter id="paperH" x="0%" y="0%" width="100%" height="100%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" result="noise" seed="2"/>
                      <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
                      <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" result="blended"/>
                      <feComposite in="blended" in2="SourceGraphic" operator="in"/>
                    </filter>
                  </defs>
                  <!-- Manuscript parchment ground -->
                  <rect width="240" height="320" fill="#f0e9d8"/>
                  <!-- Double border — engraved manuscript -->
                  <rect x="4" y="4" width="232" height="312" fill="none" stroke="#7a5c2e" stroke-width="1" opacity="0.55"/>
                  <rect x="7" y="7" width="226" height="306" fill="none" stroke="#7a5c2e" stroke-width="0.4" opacity="0.3"/>
                  <!-- Corner ornament marks -->
                  <line x1="4" y1="18"  x2="18" y2="4"   stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <line x1="222" y1="4" x2="236" y2="18"  stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <line x1="4" y1="302" x2="18" y2="316"  stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <line x1="222" y1="316" x2="236" y2="302" stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>

                  <!-- PALM SILHOUETTE — ink sketch, anatomical -->
                  <!-- Main palm & fingers -->
                  <path d="M75 272 C58 272 43 252 40 222 C38 200 40 178 43 158
                            L46 108 C46 101 51 96 58 96 C65 96 70 101 70 108 L70 132
                            L70 83 C70 76 75 71 82 71 C89 71 94 76 94 83 L94 126
                            L94 76 C94 69 99 64 106 64 C113 64 118 69 118 76 L118 126
                            L118 80 C118 73 123 68 130 68 C137 68 142 73 142 80 L142 132
                            L142 113 C142 106 147 101 154 101 C161 101 166 106 166 113 L166 172
                            C173 188 176 208 173 228 C170 252 156 272 140 272 Z"
                        fill="url(#skinGrad)" stroke="#7a5c2e" stroke-width="1.4" stroke-linejoin="round"/>
                  <!-- Thumb -->
                  <path d="M40 172 C30 162 26 146 30 132 C34 118 46 112 55 118 C59 121 61 128 60 136"
                        fill="url(#skinGrad)" stroke="#7a5c2e" stroke-width="1.2" stroke-linejoin="round"/>
                  <!-- Finger separation lines — delicate ink -->
                  <line x1="70"  y1="108" x2="70"  y2="90" stroke="#7a5c2e" stroke-width="0.6" opacity="0.4"/>
                  <line x1="94"  y1="83"  x2="94"  y2="68" stroke="#7a5c2e" stroke-width="0.6" opacity="0.4"/>
                  <line x1="118" y1="76"  x2="118" y2="60" stroke="#7a5c2e" stroke-width="0.6" opacity="0.4"/>
                  <line x1="142" y1="80"  x2="142" y2="65" stroke="#7a5c2e" stroke-width="0.6" opacity="0.4"/>

                  <!-- LIFE LINE — warm sepia-red, hand-drawn quality -->
                  <path d="M70 204 C66 178 60 156 58 136 C56 118 61 107 70 104"
                        fill="none" stroke="#8b3a3a" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
                  <!-- HEAD LINE — muted blue-grey -->
                  <path d="M66 178 C88 174 114 170 137 164 C154 160 165 157 168 154"
                        fill="none" stroke="#3d5a80" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>
                  <!-- HEART LINE — rose sepia -->
                  <path d="M70 150 C89 145 114 140 140 132 C155 126 164 122 168 120"
                        fill="none" stroke="#7a3b52" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>
                  <!-- FATE LINE — antique gold, dashed -->
                  <path d="M106 268 C108 242 110 214 112 184 C114 158 116 138 118 112"
                        fill="none" stroke="#8b6914" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="5 3" opacity="0.7"/>
                  <!-- SUN LINE — ochre, fine -->
                  <path d="M137 258 C138 238 139 218 140 198 C140 178 141 162 142 148"
                        fill="none" stroke="#a06c1a" stroke-width="1" stroke-linecap="round" stroke-dasharray="3.5 3" opacity="0.65"/>

                  <!-- Mount labels — sepia italic -->
                  <text x="58"  y="58"  text-anchor="middle" font-size="6" fill="#5c3d0e" font-family="Georgia,serif" font-style="italic" opacity="0.65">Index</text>
                  <text x="103" y="50"  text-anchor="middle" font-size="6" fill="#5c3d0e" font-family="Georgia,serif" font-style="italic" opacity="0.65">Saturn</text>
                  <text x="130" y="45"  text-anchor="middle" font-size="6" fill="#5c3d0e" font-family="Georgia,serif" font-style="italic" opacity="0.65">Apollo</text>
                  <text x="157" y="52"  text-anchor="middle" font-size="6" fill="#5c3d0e" font-family="Georgia,serif" font-style="italic" opacity="0.65">Mercury</text>
                  <text x="34"  y="220" font-size="6"  fill="#5c3d0e" font-family="Georgia,serif" font-style="italic" opacity="0.6" transform="rotate(-90,34,220)">Life</text>
                  <text x="174" y="157" font-size="6"  fill="#3d5a80" font-family="Georgia,serif" font-style="italic" opacity="0.7">Head</text>
                  <text x="174" y="121" font-size="6"  fill="#7a3b52" font-family="Georgia,serif" font-style="italic" opacity="0.7">Heart</text>
                  <text x="120" y="108" font-size="6"  fill="#8b6914" font-family="Georgia,serif" font-style="italic" opacity="0.7">Fate</text>

                  <!-- Legend — manuscript key at base -->
                  <line x1="14" y1="291" x2="226" y2="291" stroke="#7a5c2e" stroke-width="0.5" opacity="0.3"/>
                  <circle cx="20" cy="302" r="2.2" fill="#8b3a3a" opacity="0.75"/>
                  <text x="25" y="306" font-size="6" fill="#5c3d0e" font-family="Georgia,serif">Life</text>
                  <circle cx="54" cy="302" r="2.2" fill="#3d5a80" opacity="0.75"/>
                  <text x="59" y="306" font-size="6" fill="#5c3d0e" font-family="Georgia,serif">Head</text>
                  <circle cx="95" cy="302" r="2.2" fill="#7a3b52" opacity="0.75"/>
                  <text x="100" y="306" font-size="6" fill="#5c3d0e" font-family="Georgia,serif">Heart</text>
                  <circle cx="137" cy="302" r="2.2" fill="#8b6914" opacity="0.75"/>
                  <text x="142" y="306" font-size="6" fill="#5c3d0e" font-family="Georgia,serif">Fate</text>
                  <circle cx="172" cy="302" r="2.2" fill="#a06c1a" opacity="0.75"/>
                  <text x="177" y="306" font-size="6" fill="#5c3d0e" font-family="Georgia,serif">Sun</text>
                </svg>
              </div>
              <!-- Tradition cards -->
              <div class="palm-trad-panel">
                @for (t of palmTraditions(); track t.name) {
                  <div class="palm-trad-card-v2">
                    <div class="palm-trad-hdr" [style.border-left-color]="t.color">
                      <span class="palm-trad-name-v2" [style.color]="t.color">{{ t.name }}</span>
                      <div class="palm-trad-traits">
                        @for (tr of t.traits.slice(0,3); track tr) {
                          <span class="palm-trad-trait-v2">{{ tr }}</span>
                        }
                      </div>
                    </div>
                    <div class="palm-insight-v2">{{ t.focus_insight }}</div>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- ══ TAROT — Celtic Cross / 3-card spread ══ -->
        @if (hasModule('tarot')) {
          <div class="mod-block mod-tarot">
            <div class="mod-block-hdr">
              <div class="mod-block-hdr-left">
                <div class="mod-icon-wrap mod-icon-tarot">
                  <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
                    <rect x="6" y="2" width="14" height="20" rx="3" fill="#be185d" opacity="0.8"/>
                    <rect x="12" y="6" width="14" height="20" rx="3" fill="#9d174d" opacity="0.9"/>
                    <text x="15" y="20" text-anchor="middle" font-size="10" fill="#fce7f3" font-family="serif">★</text>
                  </svg>
                </div>
                <div>
                  <div class="mod-title">Tarot Reading</div>
                  <div class="mod-sub">{{ tarotSpread() }} spread · Rider-Waite tradition</div>
                </div>
              </div>
              <div class="mod-badge mod-badge-tarot">Tarot</div>
            </div>
            <!-- Card spread -->
            <div class="tarot-spread-area">
              @for (c of tarotCards(); track c.position; let i = $index) {
                <div class="tarot-card-v2" [class.tarot-card-reversed]="c.reversed">
                  <div class="tc-pos-label">{{ c.position }}</div>
                  <div class="tc-frame" [style.background]="tarotCardGrad(i)">
                    <div class="tc-stars">✦ ✧ ✦</div>
                    <div class="tc-symbol">{{ c.symbol }}</div>
                    <div class="tc-name">{{ c.name }}</div>
                    @if (c.reversed) {
                      <div class="tc-rev-badge">↓ Reversed</div>
                    }
                    <div class="tc-border-inner"></div>
                  </div>
                  <div class="tc-keywords">{{ c.keywords }}</div>
                </div>
              }
            </div>
            <div class="tarot-overall-theme">
              <span class="tarot-theme-icon">✦</span>
              <span>{{ tarotTheme() }}</span>
            </div>
          </div>
        }

        <!-- ══ VASTU — Mandala compass diagram ══ -->
        @if (hasModule('vastu')) {
          <div class="mod-block mod-vastu">
            <div class="mod-block-hdr">
              <div class="mod-block-hdr-left">
                <div class="mod-icon-wrap mod-icon-vastu">
                  <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
                    <circle cx="16" cy="16" r="13" fill="none" stroke="#10b981" stroke-width="1.5"/>
                    <circle cx="16" cy="16" r="5"  fill="#10b981" opacity="0.3"/>
                    <line x1="16" y1="3"  x2="16" y2="29" stroke="#10b981" stroke-width="1" opacity="0.6"/>
                    <line x1="3"  y1="16" x2="29" y2="16" stroke="#10b981" stroke-width="1" opacity="0.6"/>
                    <polygon points="16,5 18,10 16,8 14,10" fill="#10b981"/>
                  </svg>
                </div>
                <div>
                  <div class="mod-title">Vastu Shastra</div>
                  <div class="mod-sub">{{ vastuPropertyType() }} · {{ vastuFacing() }} facing · Vedic tradition</div>
                </div>
              </div>
              <div class="mod-badge mod-badge-vastu">Vastu</div>
            </div>
            <div class="mod-body-row">
              <!-- Vastu Mandala SVG -->
              <div class="vastu-svg-wrap">
                <svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg" class="vastu-svg-v2">
                  <!-- Parchment ground -->
                  <rect width="280" height="280" fill="#f0e9d8"/>
                  <!-- Manuscript border -->
                  <rect x="5" y="5" width="270" height="270" fill="none" stroke="#7a5c2e" stroke-width="1" opacity="0.55"/>
                  <rect x="8" y="8" width="264" height="264" fill="none" stroke="#7a5c2e" stroke-width="0.4" opacity="0.3"/>
                  <!-- Corner marks -->
                  <line x1="5" y1="20"  x2="20" y2="5"    stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <line x1="260" y1="5" x2="275" y2="20"  stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <line x1="5" y1="260" x2="20" y2="275"  stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <line x1="260" y1="275" x2="275" y2="260" stroke="#7a5c2e" stroke-width="0.8" opacity="0.4"/>
                  <!-- Outer sacred circle -->
                  <circle cx="140" cy="140" r="126" fill="none" stroke="#8b6914" stroke-width="0.7" opacity="0.35"/>
                  <!-- Intermediate ring — sacred geometry -->
                  <circle cx="140" cy="140" r="108" fill="none" stroke="#8b6914" stroke-width="0.5" stroke-dasharray="3 4" opacity="0.25"/>
                  <!-- Zone wedges — parchment earth tones -->
                  @for (z of vastuZoneSvg(); track z.label) {
                    <path [attr.d]="z.pathV2" [attr.fill]="z.fillV2" opacity="0.75"/>
                    <path [attr.d]="z.pathV2" fill="none" stroke="#7a5c2e" stroke-width="0.9" opacity="0.5"/>
                  }
                  <!-- Radial dividing lines — compass rose -->
                  <line x1="140" y1="32"  x2="140" y2="248" stroke="#7a5c2e" stroke-width="0.5" opacity="0.2"/>
                  <line x1="32"  y1="140" x2="248" y2="140" stroke="#7a5c2e" stroke-width="0.5" opacity="0.2"/>
                  <line x1="62"  y1="62"  x2="218" y2="218" stroke="#7a5c2e" stroke-width="0.4" opacity="0.15"/>
                  <line x1="218" y1="62"  x2="62"  y2="218" stroke="#7a5c2e" stroke-width="0.4" opacity="0.15"/>
                  <!-- Zone labels — sepia manuscript -->
                  @for (z of vastuZoneSvg(); track z.label) {
                    <text [attr.x]="z.lx2" [attr.y]="z.ly2" text-anchor="middle" dominant-baseline="middle"
                          font-size="8" font-weight="700" [attr.fill]="z.textColor"
                          font-family="Georgia,serif" opacity="0.9">{{ z.label }}</text>
                    <text [attr.x]="z.lx2" [attr.y]="z.ly2+10" text-anchor="middle" dominant-baseline="middle"
                          font-size="6" [attr.fill]="z.textColor" font-family="Georgia,serif" opacity="0.65" font-style="italic">{{ z.deity }}</text>
                  }
                  <!-- Brahmasthan — sacred centre -->
                  <circle cx="140" cy="140" r="32" fill="#f0e9d8" stroke="#8b6914" stroke-width="1.2" opacity="0.95"/>
                  <circle cx="140" cy="140" r="26" fill="none" stroke="#8b6914" stroke-width="0.5" stroke-dasharray="3 2" opacity="0.5"/>
                  <!-- Sacred square inside brahma -->
                  <rect x="128" y="128" width="24" height="24" fill="none" stroke="#8b6914" stroke-width="0.6" opacity="0.4" transform="rotate(45,140,140)"/>
                  <text x="140" y="137" text-anchor="middle" font-size="6.5" font-weight="700" fill="#5c3d0e" font-family="Georgia,serif" letter-spacing="0.5">BRAHMA</text>
                  <text x="140" y="147" text-anchor="middle" font-size="6.5" font-weight="700" fill="#5c3d0e" font-family="Georgia,serif" letter-spacing="0.5">STHAN</text>
                  <!-- Cardinal direction marks — fine arrowheads -->
                  <polygon points="140,10 136,22 140,18 144,22" fill="#5c3d0e" opacity="0.6"/>
                  <polygon points="140,270 136,258 140,262 144,258" fill="#5c3d0e" opacity="0.4"/>
                  <polygon points="10,140 22,136 18,140 22,144" fill="#5c3d0e" opacity="0.4"/>
                  <polygon points="270,140 258,136 262,140 258,144" fill="#5c3d0e" opacity="0.4"/>
                  <!-- N S E W labels — engraved -->
                  <text x="140" y="24" text-anchor="middle" font-size="9" font-weight="700" fill="#5c3d0e" font-family="Georgia,serif" opacity="0.8">N</text>
                  <text x="140" y="274" text-anchor="middle" font-size="9" font-weight="700" fill="#5c3d0e" font-family="Georgia,serif" opacity="0.6">S</text>
                  <text x="16"  y="144" text-anchor="middle" font-size="9" font-weight="700" fill="#5c3d0e" font-family="Georgia,serif" opacity="0.6">W</text>
                  <text x="264" y="144" text-anchor="middle" font-size="9" font-weight="700" fill="#5c3d0e" font-family="Georgia,serif" opacity="0.6">E</text>
                </svg>
              </div>
              <!-- Zone details -->
              <div class="vastu-detail-panel">
                <div class="vastu-detail-hdr">Priority Zones</div>
                @for (z of vastuPriorityZones(); track z.zone) {
                  <div class="vastu-detail-row">
                    <div class="vastu-detail-dot"></div>
                    <div>
                      <div class="vastu-detail-zone">{{ z.zone }}</div>
                      <div class="vastu-detail-tip">{{ z.tip }}</div>
                    </div>
                  </div>
                }
                @if (vastuColors().length) {
                  <div class="vastu-colors-block">
                    <div class="vastu-colors-hdr">Recommended Colors</div>
                    <div class="vastu-colors-list">
                      @for (c of vastuColors(); track c) {
                        <span class="vastu-color-pill">{{ c }}</span>
                      }
                    </div>
                  </div>
                }
                @if (vastuEnergy()) {
                  <div class="vastu-energy-note">{{ vastuEnergy() }}</div>
                }
              </div>
            </div>
          </div>
        }

      </div><!-- /profile-body -->
    </div><!-- /pdf-page page-profile page4 -->
    }<!-- /@if palmistry||tarot||vastu -->

    <!-- ══ QUESTION SECTIONS — full A4 master template per domain ══════════════ -->
    @for (section of displayReport()!.sections; track section.question; let si = $index) {

      @if (section.domain_summary?.length && !editMode()) {

        @for (grp of section.domain_summary; track grp.domain; let gi = $index) {
          @if (grp.bullets?.length) {

          <!-- ══ MASTER TEMPLATE: full A4 page per domain ══ -->
          <div class="pdf-page page-domain-master">

            <!-- ── TOP BAND: uniform dark theme (matches cover/closing) ── -->
            <div class="dm-top-band">
              <div class="dm-top-left">
                <div class="dm-domain-icon">{{ grp.icon }}</div>
                <div class="dm-domain-info">
                  <div class="dm-domain-label">{{ grp.label }}</div>
                  <div class="dm-domain-traditions">{{ dsDomainSub(grp.domain) }}</div>
                </div>
              </div>
              <div class="dm-top-right">
                <img src="rav-logo.png" alt="Aura with Rav" class="dm-logo"/>
                <div class="dm-user-date">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</div>
              </div>
            </div>

            <!-- ── QUESTION STRIP ────────────────────────────────── -->
            <div class="dm-q-strip" [style.borderLeftColor]="dsAccent(grp.domain)">
              <div class="dm-q-num" [style.background]="dsAccent(grp.domain)">Q{{ si + 1 }}</div>
              <div class="dm-q-text">{{ despacify(section.question) }}</div>
              @if (gi > 0) {
                <div class="dm-cont-badge">continued</div>
              }
            </div>

            <!-- ── BODY: findings only ─────────────────────────────── -->
            <div class="dm-body">
              <div class="dm-findings">
                <div class="dm-findings-title" [style.color]="dsAccent(grp.domain)">
                  Findings &amp; Insights
                </div>
                <div class="dm-divider" [style.background]="dsAccent(grp.domain)"></div>

                <!-- ── Story paragraphs (numerology only, when LLM returns story arc) ── -->
                <!-- Remedies shown once: only the first question (si === 0) keeps its [REMEDIES] segment -->
                @if (grp.domain === 'numerology' && grp.bullets.length === 1 && parseStoryParagraphs(grp.bullets[0], si === 0); as storyParts) {
                  <div class="dm-story">
                    @for (part of storyParts; track part.label) {
                      <div class="dm-story-block" [style.borderLeftColor]="part.color">
                        <div class="dm-story-label" [style.color]="part.color">{{ part.label }}</div>
                        <p class="dm-story-text">{{ part.text }}</p>
                      </div>
                    }
                  </div>
                } @else {
                <!-- ── Flat numbered bullets — no tradition subheadings ── -->
                <ul class="dm-bullets">
                  @for (bullet of grp.bullets; track bullet; let bi = $index) {
                    <li class="dm-bullet">
                      <span class="dm-bullet-num" [style.background]="dsAccent(grp.domain)">{{ bi + 1 }}</span>
                      <span class="dm-bullet-text" [innerHTML]="highlightBullet(bullet, section.intent, grp.domain)"></span>
                    </li>
                  }
                </ul>
                }

                <!-- ── WATERMARK: only in the remaining empty space after bullets ── -->
                <div class="dm-watermark-zone">
                  <img src="rav-logo.png" alt="" class="dm-watermark" aria-hidden="true"/>
                </div>

              </div>
            </div>


          </div>

          } <!-- /@if grp.bullets?.length -->
        }

      } @else {
        <!-- Edit mode or no domain_summary: single page with textarea or narrative -->
        <div class="pdf-page page-question">
          <div class="page-hdr">
            <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
            <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
          </div>
          <div class="q-banner">
            <div class="q-circle">Q{{ si + 1 }}</div>
            <div class="q-text">{{ despacify(section.question) }}</div>
          </div>
          <div class="content-block">
            <h3 class="block-heading">{{ displayReport()!.label_summary || 'Summary' }}</h3>
            <div class="gold-line"></div>
            @if (editMode()) {
              <textarea class="edit-area"
                [value]="getNarrative(si)"
                (input)="setNarrative(si, $any($event.target).value)"
                rows="8"></textarea>
            } @else {
              <p class="narrative-para" [innerHTML]="colorize(getNarrative(si))"></p>
            }
          </div>
        </div>
      }

      <!-- ══ STRUCTURED SUMMARY PAGE — WHO/WHAT/WHEN/WHERE/HOW per question ══ -->
      @if (section.structured_summary?.hw_bullets?.length) {
        <div class="pdf-page page-hw-summary">
          <div class="page-hdr">
            <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo"/>
            <span class="page-hdr-right">{{ displayReport()!.user_name }} · {{ formatDate(displayReport()!.generated_at) }}</span>
          </div>
          <div class="hw-q-banner">
            <div class="hw-q-circle">Q{{ si + 1 }}</div>
            <div class="hw-q-text">{{ despacify(section.question) }}</div>
          </div>
          <div class="hw-body">
            <ul class="hw-list">
              @for (bullet of section.structured_summary!.hw_bullets; track bullet.label) {
                <li class="hw-item">
                  <div class="hw-label">{{ bullet.label }}</div>
                  @if (bullet.type === 'list' && isArray(bullet.answer)) {
                    <ul class="hw-sub-list">
                      @for (pt of asArray(bullet.answer); track pt; let bi = $index) {
                        <li class="hw-sub-item">
                          <span class="hw-sub-num">{{ bi + 1 }}</span>
                          <span class="hw-sub-text">{{ pt }}</span>
                        </li>
                      }
                    </ul>
                  } @else if (bullet.type === 'timing') {
                    <div class="hw-timing">
                      <span class="hw-timing-window">{{ asTiming(bullet.answer).window }}</span>
                      <span class="hw-timing-peak">{{ asTiming(bullet.answer).peak }}</span>
                      <span class="hw-timing-dur">{{ asTiming(bullet.answer).duration }}</span>
                    </div>
                  } @else {
                    <span class="hw-answer">{{ bullet.answer }}</span>
                  }
                </li>
              }
            </ul>
          </div>
          <div class="page-footer">
            <span>{{ displayReport()!.user_name }}</span>
            <span class="page-footer-sep">·</span>
            <span>Q{{ si + 1 }} · At a Glance</span>
            <span class="page-footer-sep">·</span>
            <span>{{ formatDate(displayReport()!.generated_at) }}</span>
          </div>
        </div>
      }

    }

    <!-- REMEDIES PAGE removed — remedies will be embedded in storytelling narrative -->

    <!-- ══ CLOSING PAGE ════════════════════════════════════════════════════════ -->
    <div class="pdf-page closing-page">
      <div class="page-hdr page-hdr-dark">
        <img src="rav-logo.png" alt="Aura with Rav" class="page-hdr-logo page-hdr-logo-dark"/>
      </div>
      <div class="closing-body">
        <img src="rav-photo.png" alt="Rav" class="closing-photo"/>
        <h2 class="closing-name">{{ displayReport()!.closing_thank_you || ('Thank you, ' + displayReport()!.user_name) }}</h2>
        <div class="gold-line gold-line-center"></div>
        <p class="closing-text">{{ displayReport()!.closing_note }}</p>
        <p class="closing-text">{{ displayReport()!.closing_consult || 'For follow-up consultations, personalised sessions, or deeper readings, reach out through Aura with Rav.' }}</p>
        <div class="closing-seal">✦</div>
        <!-- Contact links — clickable in PDF -->
        <div class="closing-contact-row">
          <a href="mailto:aurawithrav@gmail.com" class="closing-contact-link">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            aurawithrav&#64;gmail.com
          </a>
          <span class="closing-contact-sep">·</span>
          <a href="https://www.youtube.com/@aurawithrav" class="closing-contact-link" target="_blank" rel="noopener">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 1.96C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
            YouTube — &#64;aurawithrav
          </a>
          <span class="closing-contact-sep">·</span>
          <a href="https://www.linkedin.com/groups/10040340/" class="closing-contact-link" target="_blank" rel="noopener">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            LinkedIn Community
          </a>
          <span class="closing-contact-sep">·</span>
          <a href="https://topmate.io/aurawithrav" class="closing-contact-link closing-contact-cta" target="_blank" rel="noopener">
            Book a Session ↗
          </a>
        </div>
      </div>
      <div class="closing-footer">
        <img src="rav-logo.png" alt="Aura with Rav" class="closing-footer-logo"/>
        <span>{{ formatDate(displayReport()!.generated_at) }} · {{ displayReport()!.closing_confidential || 'Confidential · For personal guidance only' }}</span>
      </div>
    </div>

  </div><!-- /report-wrap -->
  </div><!-- /report-scroll -->

} @else {
  <div class="empty-state">
    <div class="empty-icon">✦</div>
    <h3 class="empty-title">No Report Generated Yet</h3>
    <p class="empty-text">Complete a 360° reading first, then your personalised report will appear here.</p>
    <div class="empty-actions">
      <button class="tb-btn-primary" (click)="goHome()">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L6.5 2l5 4.5M2.5 6v5h2.5V8h3v3h2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Start a Reading
      </button>
      @if (auth.isAdmin()) {
        <button class="tb-btn" (click)="goBack()">← Back to Review</button>
        <button class="tb-btn" (click)="router.navigate(['/admin/users'])">View Leads</button>
      }
    </div>
  </div>
}
<app-footer></app-footer>
  `,
  styles: [`
/* ═══════════════════════════════════════════════════════════════════════════
   HOST & CHROME
═══════════════════════════════════════════════════════════════════════════ */
:host {
  display: flex; flex-direction: column;
  height: 100vh;
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
.chakra-spin-portal {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none; background: transparent;
}
.chakra-spin-circle {
  width: 440px; height: 440px; border-radius: 50%; overflow: hidden;
  animation: chakra-spin 8s linear infinite; flex-shrink: 0;
}
.chakra-spin-img {
  width: auto; height: 700px; display: block;
  margin-top: -30px; margin-left: -325px;
  filter: brightness(0) saturate(1) invert(56%) sepia(100%) saturate(200%) hue-rotate(0deg) brightness(0.95);
  opacity: 0.5;
}
@keyframes chakra-spin { to { transform: rotate(360deg); } }

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
  overflow: visible;
  position: relative;
  min-height: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED ELEMENTS
═══════════════════════════════════════════════════════════════════════════ */
.page-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 40px; border-bottom: 1px solid #f0ece4; background: #fff;
  flex-shrink: 0;
}
/* Page header logo — full logo, transparent bg */
.page-hdr-logo {
  width: 80px; height: auto;
  border-radius: 0;
  object-fit: contain;
  background: transparent;
  flex-shrink: 0;
}
.page-hdr-right { font-size: 9px; color: #bbb; letter-spacing: 0.08em; text-transform: uppercase; }
.page-hdr-title { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 0.06em; text-transform: uppercase; }
.page-hdr-dark { background: transparent !important; border-bottom-color: rgba(255,255,255,0.07) !important; }
.page-hdr-logo-dark {
  width: 80px; height: auto;
  border-radius: 0;
  object-fit: contain;
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

/* ── Numerology Branch Pills & Tradition Table ───────────────────────────── */
.num-branch-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 10px; }
.num-branch-pill {
  font-size: 9.5px; font-weight: 700; padding: 2px 9px; border-radius: 99px;
  background: rgba(99,102,241,0.08); color: #4338ca;
  border: 1px solid rgba(99,102,241,0.2);
}
.num-tradition-table { margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
.ntt-hdr-row, .ntt-row { display: grid; grid-template-columns: 110px repeat(4, 1fr); gap: 4px; padding: 6px 10px; font-size: 10px; }
.ntt-hdr-row { background: #f3f4f6; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
.ntt-row { border-top: 1px solid #f5f3ef; }
.ntt-col-label { font-weight: 700; color: #374151; font-family: Georgia, serif; }
.ntt-col { text-align: center; font-weight: 700; font-family: monospace; }
.ntt-tradition { font-size: 10px; }

/* ── Report Methodology Panel ─────────────────────────────────────────────── */
.report-method-panel {
  margin-top: 18px; border-radius: 10px;
  border: 1px solid rgba(99,102,241,0.15); overflow: hidden;
  background: #fafaf9;
}
.rmp-title {
  padding: 8px 14px; font-size: 9.5px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: #4338ca; border-bottom: 1px solid rgba(99,102,241,0.12);
  background: rgba(99,102,241,0.05);
}
.rmp-grid { display: flex; flex-direction: column; gap: 0; }
.rmp-item {
  padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.05);
}
.rmp-item:last-child { border-bottom: none; }
.rmp-item-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
.rmp-icon { font-size: 13px; }
.rmp-label { font-size: 11px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif; }
.rmp-branches { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.rmp-branch {
  font-size: 9.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
  background: rgba(99,102,241,0.08); color: #4338ca;
  border: 1px solid rgba(99,102,241,0.18);
}
.rmp-meta { font-size: 9px; color: #9ca3af; font-family: Georgia, serif; }

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 1: COVER
═══════════════════════════════════════════════════════════════════════════ */
.cover { background: #14100c; min-height: 600px; overflow: hidden; }
.cover-photo-wrap {
  position: absolute; inset: 0; overflow: hidden;
  display: flex; align-items: stretch; justify-content: flex-end;
}
.cover-photo { width: 52%; height: 100%; object-fit: cover; object-position: center top; opacity: 0.72; display: block; }
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
  width: 160px; height: auto;
  border-radius: 0;
  object-fit: contain;
  display: block;
  background: transparent;
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
.letter-watermark-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 56px;
  width: 100%;
  pointer-events: none;
  border: none;
  outline: none;
  box-shadow: none;
  overflow: hidden;
}
.letter-watermark {
  width: 100%;
  max-width: 320px;
  opacity: 0.12;
  object-fit: contain;
  display: block;
  border: none;
  outline: none;
  box-shadow: none;
}
.letter-page-body {
  flex: 0 0 auto;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 32px 56px; overflow: visible;
}
.letter-inner { width: 100%; max-width: 600px; }

/* Brand row at top of letter */
.letter-brand-row {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 32px; padding-bottom: 24px;
  border-bottom: 1px solid #f0ece4;
}
.letter-brand-logo {
  width: 100px; height: auto;
  border-radius: 0;
  object-fit: contain;
  background: transparent;
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
.profile-body { flex: 1; padding: 18px 28px 20px; display: flex; flex-direction: column; gap: 14px; overflow: visible; }
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

.chart-approx-note {
  margin-top: 8px; padding: 7px 10px; border-radius: 7px;
  background: #fffbeb; border: 1px solid #fcd34d;
  font-size: 9.5px; color: #92400e; line-height: 1.5;
  font-family: Georgia, serif;
}
.chart-method-note {
  margin-top: 8px; padding: 7px 10px; border-radius: 7px;
  background: #f0fdf4; border: 1px solid #6ee7b7;
  font-size: 9.5px; color: #065f46; line-height: 1.5;
  font-family: Georgia, serif;
}

/* ── Chart Basis Panel (report page) ─────────────────────────────────── */
.chart-basis-panel {
  margin-top: 10px; border-radius: 10px;
  background: #f0fdf4; border: 1px solid #6ee7b7;
  overflow: hidden; font-family: Georgia, serif;
}
.chart-basis-approx {
  background: #fffbeb; border-color: #fcd34d;
}
.cbp-hdr {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.07em; color: #065f46;
}
.chart-basis-approx .cbp-hdr { color: #92400e; }
.cbp-icon { font-size: 11px; }
.cbp-title { }
.cbp-rows { padding: 2px 0; }
.cbp-row {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 5px 10px; border-bottom: 1px solid rgba(0,0,0,0.04);
  font-size: 9px;
}
.cbp-row:last-child { border-bottom: none; }
.cbp-lbl {
  min-width: 68px; font-weight: 800; color: #6b7280; flex-shrink: 0;
  text-transform: uppercase; letter-spacing: 0.05em; padding-top: 1px;
}
.cbp-val { color: #374151; line-height: 1.55; }
.cbp-highlight { color: #065f46; font-weight: 700; }
.chart-basis-approx .cbp-highlight { color: #92400e; }
.cbp-warn { color: #b45309; font-weight: 700; }
.cbp-note { color: #6b7280; font-style: italic; }

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

/* ════════════════════════════════════════════════════════════════════════════
   UNIFIED MODULE BLOCKS — premium visual style
════════════════════════════════════════════════════════════════════════════ */
.mod-block {
  border-radius: 18px; padding: 16px 20px; margin-top: 14px;
  break-inside: avoid; page-break-inside: avoid; flex-shrink: 0;
}
.mod-block-hdr {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
}
.mod-block-hdr-left { display: flex; align-items: center; gap: 10px; }
.mod-icon-wrap {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.mod-title { font-size: 14px; font-weight: 800; color: #1d1d1f; }
.mod-sub   { font-size: 10px; color: #6e6e73; margin-top: 1px; }
.mod-badge {
  font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 3px 10px; border-radius: 99px;
}
.mod-body-row { display: flex; gap: 16px; align-items: flex-start; }

/* ── Astrology — aged parchment ── */
.mod-astro { background: #faf6ee; border: 1px solid #c8a96e; }
.mod-icon-astro { background: #f0e8d0; }
.mod-badge-astro { background: #f0e8d0; color: #5c3d0e; border: 1px solid #c8a96e; font-family: Georgia,serif; letter-spacing: 0.12em; }
.chart-svg-wrap { width: 220px; flex-shrink: 0; }
.vedic-svg-v2 { width: 220px; height: 220px; display: block; border-radius: 4px; box-shadow: 0 2px 12px rgba(92,61,14,0.15); }
.astro-data-panel { flex: 1; min-width: 0; }
.astro-data-title { font-size: 9px; font-weight: 700; color: #5c3d0e; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; font-family: Georgia,serif; }
.planet-table { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.pt-row { display: grid; grid-template-columns: 20px 72px 28px 1fr; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 3px; background: rgba(200,169,110,0.08); border-bottom: 1px solid rgba(200,169,110,0.15); }
.pt-sym { font-size: 12px; font-weight: 700; text-align: center; font-family: Georgia,serif; }
.pt-name { font-size: 9px; font-weight: 600; color: #3c2a0e; font-family: Georgia,serif; }
.pt-house { font-size: 7.5px; font-weight: 700; color: #8b6914; background: rgba(139,105,20,0.1); border-radius: 2px; padding: 1px 3px; text-align: center; }
.pt-rashi { font-size: 8.5px; color: #5c4020; font-family: Georgia,serif; }
.pt-lagna { background: rgba(139,105,20,0.12) !important; }
.astro-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.astro-meta-cell { background: rgba(200,169,110,0.1); border-radius: 3px; padding: 5px 8px; border: 1px solid rgba(200,169,110,0.25); }
.astro-meta-lbl { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: #8b6914; }
.astro-meta-val { font-size: 10px; font-weight: 700; color: #3c2a0e; margin-top: 1px; font-family: Georgia,serif; }

/* ── Numerology — sacred tablet ── */
.mod-num { background: #f7f4ee; border: 1px solid #c0a870; }
.mod-icon-num { background: #ede8d8; }
.mod-badge-num { background: #ede8d8; color: #3d3460; border: 1px solid #a090c0; font-family: Georgia,serif; letter-spacing: 0.12em; }
.loshu-wrap { width: 180px; flex-shrink: 0; }
.loshu-svg { width: 180px; height: 180px; display: block; border-radius: 3px; box-shadow: 0 2px 12px rgba(92,61,14,0.12); }
.num-cells-panel { flex: 1; min-width: 0; }
.num-cards-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; margin: 8px 0 10px; }
.num-card {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 4px; border-radius: 3px;
  background: rgba(240,232,210,0.6);
  border: 1px solid rgba(139,105,20,0.3); text-align: center;
}
.num-card-lp { grid-column: span 1; border-color: #8b6914; background: rgba(139,105,20,0.08) !important; }
.num-card-val { font-size: 24px; font-weight: 400; line-height: 1; font-family: Georgia,serif; }
.num-card-lbl { font-size: 6.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #7a5c2e; }
.num-card-meaning { font-size: 7.5px; color: #5c4020; line-height: 1.3; font-family: Georgia,serif; font-style: italic; }
.num-lp-bar { width: 100%; height: 2px; background: rgba(139,105,20,0.15); border-radius: 99px; margin-top: 4px; overflow: hidden; }
.num-lp-fill { height: 100%; background: #8b6914; border-radius: 99px; }

/* ── Palmistry — manuscript hand sketch ── */
.mod-palm { background: #f7f3ec; border: 1px solid #c0a870; }
.mod-icon-palm { background: #ede8d8; }
.mod-badge-palm { background: #ede8d8; color: #5c3d0e; border: 1px solid #c0a870; font-family: Georgia,serif; letter-spacing: 0.12em; }
.hand-svg-wrap { width: 160px; flex-shrink: 0; }
.hand-svg { width: 160px; height: 213px; display: block; border-radius: 3px; box-shadow: 0 2px 10px rgba(92,61,14,0.12); }
.palm-trad-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.palm-trad-card-v2 { border-radius: 3px; padding: 8px 10px; background: rgba(240,232,210,0.5); border: 1px solid rgba(200,169,110,0.3); }
.palm-trad-hdr { border-left: 2px solid; padding-left: 8px; margin-bottom: 4px; }
.palm-trad-name-v2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 3px; font-family: Georgia,serif; }
.palm-trad-traits { display: flex; flex-wrap: wrap; gap: 3px; }
.palm-trad-trait-v2 { font-size: 7px; padding: 1px 6px; border-radius: 2px; background: rgba(139,105,20,0.1); color: #5c3d0e; font-weight: 600; border: 1px solid rgba(139,105,20,0.2); }
.palm-insight-v2 { font-size: 8.5px; color: #3c2a0e; font-style: italic; line-height: 1.55; font-family: Georgia,serif; }

/* ── Tarot — premium occult cards ── */
.mod-tarot { background: #f5f0ea; border: 1px solid #b8a08a; }
.mod-icon-tarot { background: #1a1410; border-radius: 6px; }
.mod-badge-tarot { background: #1a1410; color: #c8a96e; border: 1px solid #4a3828; font-family: Georgia,serif; letter-spacing: 0.12em; }
.tarot-spread-area { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
.tarot-card-v2 { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; min-width: 0; }
.tarot-card-reversed .tc-frame { transform: rotate(180deg); }
.tc-pos-label { font-size: 6.5px; font-weight: 600; color: #5c3d0e; text-transform: uppercase; letter-spacing: 0.1em; text-align: center; font-family: Georgia,serif; }
.tc-frame {
  width: 100%; aspect-ratio: 5/8;
  border-radius: 4px;
  border: 1px solid rgba(200,169,110,0.35);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; padding: 8px 5px; position: relative; overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(200,169,110,0.15);
}
.tc-border-inner {
  position: absolute; inset: 5px; border-radius: 3px;
  border: 1px solid rgba(200,169,110,0.2); pointer-events: none;
}
.tc-stars { font-size: 7px; color: rgba(200,169,110,0.55); letter-spacing: 3px; }
.tc-symbol { font-size: 24px; line-height: 1; color: #c8a96e; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5)); }
.tc-name { font-size: 7px; font-weight: 600; color: rgba(200,169,110,0.9); text-align: center; line-height: 1.3; font-family: Georgia,serif; letter-spacing: 0.05em; }
.tc-rev-badge { font-size: 5.5px; font-weight: 600; color: rgba(200,169,110,0.7); background: rgba(200,169,110,0.1); border-radius: 2px; padding: 1px 4px; }
.tc-keywords { font-size: 7.5px; color: #5c4020; text-align: center; line-height: 1.4; font-style: italic; font-family: Georgia,serif; }
.tarot-overall-theme {
  display: flex; align-items: flex-start; gap: 7px;
  font-size: 9px; color: #3c2a0e; font-style: italic; line-height: 1.55;
  border-top: 1px solid rgba(200,169,110,0.3); padding-top: 10px; margin-top: 2px;
  font-family: Georgia,serif;
}
.tarot-theme-icon { color: #8b6914; font-size: 10px; flex-shrink: 0; margin-top: 1px; }

/* ── Vastu — sacred mandala ── */
.mod-vastu { background: #f5f2eb; border: 1px solid #b8a870; }
.mod-icon-vastu { background: #e8e0c8; }
.mod-badge-vastu { background: #e8e0c8; color: #2e4a2e; border: 1px solid #8aaa80; font-family: Georgia,serif; letter-spacing: 0.12em; }
.vastu-svg-wrap { width: 200px; flex-shrink: 0; }
.vastu-svg-v2 { width: 200px; height: 200px; display: block; border-radius: 3px; box-shadow: 0 2px 10px rgba(92,61,14,0.1); }
.vastu-detail-panel { flex: 1; min-width: 0; }
.vastu-detail-hdr { font-size: 9px; font-weight: 700; color: #2e4a2e; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; font-family: Georgia,serif; }
.vastu-detail-row { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 7px; }
.vastu-detail-dot { width: 7px; height: 7px; border-radius: 50%; background: #5a7a50; flex-shrink: 0; margin-top: 3px; }
.vastu-detail-zone { font-size: 9px; font-weight: 700; color: #2e4a2e; font-family: Georgia,serif; }
.vastu-detail-tip  { font-size: 8px; color: #3c3020; line-height: 1.45; margin-top: 1px; font-style: italic; }
.vastu-colors-block { margin-top: 9px; }
.vastu-colors-hdr { font-size: 8px; font-weight: 700; color: #2e4a2e; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.07em; }
.vastu-colors-list { display: flex; flex-wrap: wrap; gap: 4px; }
.vastu-color-pill { font-size: 7.5px; padding: 2px 8px; border-radius: 2px; background: rgba(90,122,80,0.1); color: #2e4a2e; font-weight: 600; border: 1px solid rgba(90,122,80,0.3); }
.vastu-energy-note { font-size: 8px; color: #064e3b; font-style: italic; border-top: 1px solid #86efac; padding-top: 8px; margin-top: 8px; line-height: 1.5; }

/* ═══════════════════════════════════════════════════════════════════════════
   QUESTION PAGES
═══════════════════════════════════════════════════════════════════════════ */
.page-question { background: #fff; }

/* ── WHO/WHAT/WHEN/WHERE/HOW summary page ──────────────────────────────────── */
.page-hw-summary { background: #fff; display: flex; flex-direction: column; }
.hw-q-banner { display: flex; align-items: flex-start; gap: 16px; padding: 24px 48px 0; flex-shrink: 0; }
.hw-q-circle {
  flex-shrink: 0; width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; margin-top: 2px;
}
.hw-q-text { font-size: 17px; font-weight: 700; color: #14100c; line-height: 1.4; }
.hw-body { padding: 20px 48px 0; flex: 1; }

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
  font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: #8a6a00; margin: 0 0 8px;
}
.narrative-para { font-size: 15px; font-weight: 400; color: #1f2937; line-height: 2; margin: 0; }

/* ── Domain-grouped summary ──────────────────────────────────────────────── */
.domain-summary-list {
  display: flex; flex-direction: column; gap: 16px; margin-bottom: 4px;
}
.ds-group {
  display: flex; flex-direction: column;
  border: 1px solid rgba(0,0,0,0.08);
  border-left-width: 4px; /* color set inline */
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
/* Full-page single-domain card — expands to content, no fixed height */
.ds-group-full {
  display: flex; flex-direction: column;
  border: 1px solid rgba(0,0,0,0.09);
  border-left-width: 5px;
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  flex: 1;
}
.ds-group-hdr {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
}
.ds-icon-wrap {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.ds-icon { font-size: 14px; line-height: 1; }
.ds-hdr-text { display: flex; flex-direction: column; gap: 1px; flex: 1; }
.ds-label {
  font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
}
.ds-sub { font-size: 9px; color: #9ca3af; font-weight: 500; letter-spacing: 0.03em; }
/* Insight count badge in domain header */
.ds-bullet-count {
  margin-left: auto; flex-shrink: 0;
  font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
  padding: 2px 9px; border-radius: 99px;
  background: rgba(0,0,0,0.06); color: #6b7280;
}
.ds-bullets {
  list-style: none; margin: 0; padding: 10px 14px 14px 14px;
  display: flex; flex-direction: column; gap: 8px;
  background: #fff;
}
/* Full-page bullet list — generous padding, gap between paragraph-length bullets */
.ds-bullets-full {
  list-style: none; margin: 0; padding: 16px 24px 24px 24px;
  display: flex; flex-direction: column; gap: 16px;
  background: #fff; flex: 1;
}
.ds-bullet {
  font-size: 13.5px; font-weight: 400; color: #1f2937; line-height: 1.8;
  padding-left: 18px; position: relative; font-family: Georgia, serif;
  word-wrap: break-word; overflow-wrap: break-word;
}
/* Full-page bullet — each insight content shown word-for-word, no truncation */
.ds-bullet-full {
  font-size: 13.5px; font-weight: 400; color: #1f2937; line-height: 1.9;
  padding-left: 22px; position: relative; font-family: Georgia, serif;
  word-wrap: break-word; overflow-wrap: break-word;
  /* Never hide overflow — content must always be fully visible */
  overflow: visible;
}
.ds-bullet::before,
.ds-bullet-full::before {
  content: '✦'; position: absolute; left: 0; top: 5px;
  color: #d4af37; font-size: 7px;
}
.hl-intent { border-radius: 3px; padding: 0 2px; }

/* ═══════════════════════════════════════════════════════════════════════════
   DOMAIN MASTER TEMPLATE — full A4 page per domain, fills 100% of page
═══════════════════════════════════════════════════════════════════════════ */
.page-domain-master {
  /* Full A4 height on screen so it looks like a real page */
  min-height: 297mm;
  display: flex;
  flex-direction: column;
  background: #fff;
  padding: 0;        /* top band handles its own padding */
  overflow: visible;
  position: relative;
}

/* ── Watermark zone: grows to fill all empty space below bullets ── */
.dm-watermark-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  width: 100%;
  pointer-events: none;
  border: none;
  outline: none;
  box-shadow: none;
  overflow: hidden;
}
.dm-watermark {
  width: 60%;
  max-width: 320px;
  opacity: 0.25;
  object-fit: contain;
  display: block;
  border: none;
  outline: none;
  box-shadow: none;
}

/* ── Top band: white with gold accent border ── */
.dm-top-band {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 32px;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 3px solid #d4af37;
  z-index: 1;
  position: relative;
}
.dm-top-left { display: flex; align-items: center; gap: 14px; }
.dm-domain-icon { font-size: 26px; line-height: 1; }
.dm-domain-info { display: flex; flex-direction: column; gap: 2px; }
.dm-domain-label { font-size: 16px; font-weight: 800; letter-spacing: 0.04em; color: #d4af37; }
.dm-domain-traditions { font-size: 10px; color: #6b7280; letter-spacing: 0.06em; font-weight: 500; }
.dm-top-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.dm-logo { width: 80px; height: auto; object-fit: contain; opacity: 0.9; }
.dm-user-date { font-size: 9px; color: #9ca3af; letter-spacing: 0.08em; text-transform: uppercase; }

/* ── Question strip ── */
.dm-q-strip {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 32px;
  border-left: 6px solid;  /* colour set inline */
  background: #fafaf8;
  flex-shrink: 0;
  position: relative; z-index: 1;
}
.dm-q-num {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
  color: #fff; font-size: 12px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.dm-q-text { font-size: 17px; font-weight: 800; color: #14100c; line-height: 1.35; flex: 1; }
.dm-cont-badge {
  flex-shrink: 0; font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: #9ca3af;
  border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 8px;
}

/* ── Body: findings area ── */
.dm-body {
  flex: 1;
  display: flex;
  gap: 0;
  padding: 0;
  min-height: 0;
  position: relative;
  z-index: 1;
}

/* Findings area — full width (no rail) */
.dm-findings {
  flex: 1;
  padding: 20px 32px 20px 32px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dm-findings-title {
  font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; margin-bottom: 6px;
  display: flex; align-items: center; gap: 10px;
}
.dm-insight-pill {
  font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
  padding: 2px 10px; border-radius: 99px;
}
.dm-divider {
  height: 3px; border-radius: 2px; margin-bottom: 18px;
  opacity: 0.25; width: 48px;
}

/* Bullet list — numbered, verbatim content. Does NOT flex-grow — watermark zone takes remaining space */
.dm-bullets {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 18px;
  flex: 0 0 auto;
}
.dm-bullet {
  display: flex; align-items: flex-start; gap: 14px;
}
.dm-bullet-num {
  flex-shrink: 0;
  width: 24px; height: 24px; border-radius: 50%;
  color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin-top: 1px;
  opacity: 0.9;
}
/* ── Storytelling paragraph blocks (numerology 5-part arc) ── */
.dm-story {
  display: flex; flex-direction: column; gap: 16px;
}
.dm-story-block {
  border-left: 4px solid; padding: 10px 14px;
  background: rgba(255,255,255,0.55); border-radius: 0 6px 6px 0;
}
.dm-story-label {
  font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; margin-bottom: 5px; opacity: 0.9;
}
.dm-story-text {
  margin: 0; font-size: 15px; font-weight: 400; color: #1f2937;
  line-height: 1.8; font-family: Georgia, serif;
}

.dm-bullet-text {
  flex: 1;
  font-size: 16px; font-weight: 400; color: #1f2937;
  line-height: 1.9; font-family: Georgia, serif;
  word-wrap: break-word; overflow-wrap: break-word;
}


/* ── Tradition subgroup layout ── */
.dm-subgroup {
  margin-bottom: 20px;
}
.dm-subgroup:last-child { margin-bottom: 0; }
.dm-subgroup-hdr {
  display: flex; align-items: center; gap: 10px;
  border-left: 3px solid; padding-left: 10px;
  margin-bottom: 10px;
}
.dm-subgroup-num {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  color: #fff; font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.9;
}
.dm-subgroup-label {
  font-size: 12px; font-weight: 800; color: #d4af37;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.dm-bullets-sub { gap: 10px; padding-left: 8px; }
.dm-bullet-sub { gap: 10px; }
.dm-bullet-dot {
  flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
  margin-top: 8px; opacity: 0.75;
}

/* ── Legacy hw-list (kept for backend-generated reports) ─────────────────── */
.hw-list { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.hw-item {
  display: flex; flex-direction: column; gap: 8px;
  padding: 13px 16px; background: #faf8f3;
  border-left: 3px solid #d4af37; border-radius: 0 8px 8px 0;
}
.hw-label { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: none; color: #92600a; }
.hw-answer { font-size: 13.5px; font-weight: 500; color: #1f2937; line-height: 1.75; }
.hw-sub-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.hw-sub-item { display: flex; align-items: flex-start; gap: 9px; }
.hw-sub-num {
  flex-shrink: 0; width: 20px; height: 20px;
  background: #d4af37; color: #fff;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; margin-top: 1px;
}
.hw-sub-text { font-size: 13px; font-weight: 500; color: #1f2937; line-height: 1.65; }
.hw-timing { display: flex; flex-direction: column; gap: 4px; }
.hw-timing-window { font-size: 15px; font-weight: 700; color: #1f2937; letter-spacing: 0.01em; }
.hw-timing-peak { font-size: 12.5px; font-weight: 600; color: #b45309; }
.hw-timing-dur { font-size: 11.5px; font-weight: 400; color: #6b7280; }
.hw-redirect { font-size: 13.5px; font-weight: 600; color: #6d28d9; }

/* ── Consolidated Remedies Page — 2-col grid, fits one A4 page ─ */
.remedy-page {
  min-height: 0;
  display: flex; flex-direction: column;
  position: relative;
}
.remedy-page::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url('/rav-logo.png') center center / 70% auto no-repeat;
  opacity: 0.12;
  pointer-events: none;
  z-index: 0;
}
.remedy-grid {
  flex: 0 0 auto;
  padding: 16px 32px 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
  overflow: hidden;
  position: relative; z-index: 1;
}
.r-card {
  padding: 10px 14px;
  background: linear-gradient(135deg, #fdf8ee, #fffbf2);
  border: 1px solid rgba(212,175,55,0.22); border-radius: 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.r-card-hdr {
  display: flex; align-items: center; gap: 6px;
  border-bottom: 1px solid rgba(212,175,55,0.18); padding-bottom: 5px; margin-bottom: 2px;
}
.r-icon {
  font-size: 15px; line-height: 1; color: #b45309;
  width: 22px; text-align: center; flex-shrink: 0;
}
.r-label {
  font-size: 10px; font-weight: 800; letter-spacing: 0.07em;
  text-transform: uppercase; color: #92400e;
}
.r-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.r-list li { font-size: 10.5px; color: #374151; line-height: 1.55; padding-left: 12px; position: relative; }
.r-list li::before { content: '✦'; position: absolute; left: 0; color: #d4af37; font-size: 7px; top: 4px; }
.r-sub { font-size: 9.5px; color: #6b7280; font-style: italic; }

/* Dynamic color swatches */
.r-color-row { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
.r-color-chip { display: flex; align-items: center; gap: 4px; }
.r-swatch {
  width: 16px; height: 16px; border-radius: 50%;
  border: 1.5px solid rgba(0,0,0,0.12);
  flex-shrink: 0; display: inline-block;
}
.r-color-name { font-size: 10.5px; font-weight: 600; color: #374151; }

/* ── Clean remedies page ── */
.remedy-clean-page {
  display: flex; flex-direction: column; min-height: 0; position: relative;
}
.remedy-clean-body {
  flex: 1; padding: 20px 36px 16px; overflow: hidden; position: relative; z-index: 1;
}
.remedy-clean-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 10px;
}
.remedy-clean-item {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 11px 16px; border-radius: 10px;
  background: linear-gradient(135deg, #fdf8ee, #fffbf2);
  border: 1px solid rgba(212,175,55,0.20);
}
.remedy-clean-icon {
  font-size: 16px; line-height: 1.4; flex-shrink: 0; width: 24px; text-align: center;
}
.remedy-clean-content {
  display: flex; flex-direction: column; gap: 2px;
}
.remedy-clean-cat {
  font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: #92400e;
}
.remedy-clean-text {
  font-size: 11.5px; color: #374151; line-height: 1.6;
}

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
.closing-page { background: #14100c; min-height: 0; }
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
.page-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 40px; border-top: 1px solid #e5e7eb;
  font-size: 9px; color: #9ca3af; letter-spacing: 0.06em;
  position: relative; z-index: 1;
}
.page-footer-sep { color: #d1d5db; }
.closing-footer {
  display: flex; align-items: center; justify-content: center; gap: 14px; flex-shrink: 0;
  padding: 16px 40px; border-top: 1px solid rgba(255,255,255,0.07);
  font-size: 9.5px; color: rgba(255,255,255,0.28); letter-spacing: 0.08em;
}
/* Footer logo — full logo, transparent bg */
.closing-footer-logo {
  width: 70px; height: auto;
  border-radius: 0;
  object-fit: contain;
  background: transparent;
  padding: 0;
}

/* Contact links row on closing page */
.closing-contact-row {
  display: flex; align-items: center; flex-wrap: wrap; justify-content: center;
  gap: 6px; margin-top: 22px;
}
.closing-contact-link {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: rgba(255,255,255,0.45); text-decoration: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  transition: color 0.15s; white-space: nowrap;
}
.closing-contact-link:hover { color: #d4af37; }
.closing-contact-link svg { opacity: 0.6; flex-shrink: 0; }
.closing-contact-cta { color: #d4af37 !important; font-weight: 700; }
.closing-contact-sep { color: rgba(255,255,255,0.18); font-size: 11px; }

/* Watermark zone on spiritual profile page */
.profile-watermark-zone {
  flex: 1; display: flex; align-items: center; justify-content: center;
  min-height: 80px; overflow: hidden; pointer-events: none;
}
.profile-watermark {
  width: 220px; height: auto; opacity: 0.06;
  filter: grayscale(1);
  object-fit: contain;
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  color: #9ca3af; font-family: Georgia, serif;
}
.empty-icon  { font-size: 48px; color: #d4af37; opacity: 0.5; margin-bottom: 8px; }
.empty-title { font-size: 18px; font-weight: 700; color: #1e1b4b; margin-bottom: 8px; }
.empty-text  { font-size: 14px; color: #6b7280; margin-bottom: 24px; max-width: 340px; line-height: 1.6; }
.empty-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* ═══════════════════════════════════════════════════════════════════════════
   PRINT — strict A4, no blank pages
   Angular component styles are scoped with [_nghost-xxx] and do NOT match
   in print context, so real print rules are injected via printPdf() below.
   This block is kept for completeness but has no effect in print.
═══════════════════════════════════════════════════════════════════════════ */
/* ══ RESPONSIVE — MOBILE ══ */
@media (max-width: 900px) {
  /* Toolbar: shrink buttons */
  .tb-btn { padding: 7px 10px; font-size: 12px; }
  .tb-btn-primary { padding: 8px 14px; font-size: 12px; }
  .lang-select { max-width: 90px; font-size: 11px; }
}
@media (max-width: 860px) {
  .toolbar { padding: 0 14px; height: 56px; gap: 8px; overflow: hidden; }
  .tb-page-name { display: none; }
  .tb-divider { display: none; }
  .tb-brand-name { font-size: 14px; }
  .tb-center { flex: 0 0 auto; }
  .lang-pill { padding: 5px 8px; }
  .lang-select { max-width: 80px; font-size: 11px; }
  .tb-right { gap: 6px; }
  /* Icon-only buttons: hide text, keep SVG */
  .tb-btn { font-size: 0 !important; padding: 8px; width: 34px; min-width: 34px; }
  .tb-btn svg { width: 16px; height: 16px; }
  .tb-btn-primary { font-size: 0 !important; padding: 8px 10px; gap: 0; }
  .tb-btn-primary svg { width: 16px; height: 16px; }
  /* Report content */
  .report-scroll { padding: 10px 4px 40px; }
  .report-wrap { max-width: 100%; box-shadow: none; }
  .page-hdr { padding: 8px 12px; }
  .page-hdr-logo, .page-hdr-logo-dark { width: 56px; }
  /* Module sections: stack SVG above data panel */
  .mod-body-row { flex-direction: column; gap: 10px; }
  .chart-svg-wrap { width: 100% !important; max-width: 200px; margin: 0 auto; }
  .vedic-svg-v2 { width: 100% !important; max-width: 200px; height: auto !important; }
  .loshu-wrap { width: 100% !important; max-width: 160px; margin: 0 auto; }
  .loshu-svg { width: 100% !important; max-width: 160px; height: auto !important; }
  .hand-svg-wrap { width: 100% !important; max-width: 140px; margin: 0 auto; }
  .hand-svg { width: 100% !important; max-width: 140px; height: auto !important; }
  .astro-data-panel, .num-cells-panel, .palm-trad-panel { width: 100%; }
  .ntt-hdr-row, .ntt-row { grid-template-columns: 80px repeat(4, 1fr); font-size: 8px; padding: 5px 6px; }
  .pt-row { grid-template-columns: 16px 60px 24px 1fr; }
  .astro-meta-grid { grid-template-columns: 1fr 1fr; }
  .tarot-spread-area { flex-wrap: wrap; gap: 6px; }
  .tarot-card-v2 { min-width: 60px; max-width: 80px; }
  .num-cards-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 480px) {
  .toolbar { height: 52px; padding: 0 10px; gap: 6px; }
  .tb-brand-name { font-size: 12px; }
  .tb-brand-mark { font-size: 14px; }
  .lang-pill { padding: 4px 6px; }
  .lang-select { max-width: 65px; font-size: 10px; }
  .lang-badge { display: none; }
  .tb-right { gap: 4px; }
  .tb-btn { padding: 6px 8px; }
  .tb-btn-primary { padding: 6px 10px; }
  .report-scroll { padding: 6px 2px 32px; }
  .page-hdr { padding: 6px 8px; }
  .page-hdr-logo, .page-hdr-logo-dark { width: 44px; }
  .page-hdr-title { font-size: 9px; }
  .ntt-hdr-row, .ntt-row { grid-template-columns: 60px repeat(4, 1fr); font-size: 7px; padding: 4px; gap: 2px; }
  .num-cards-grid { gap: 3px; }
  .tarot-spread-area { gap: 4px; }
}
@media (max-width: 380px) {
  .toolbar { height: 48px; padding: 0 8px; gap: 4px; }
  .tb-brand-name { display: none; }
  .tb-btn-primary { padding: 5px 8px; font-size: 10px; }
  .lang-select { max-width: 55px; }
  .ntt-hdr-row, .ntt-row { grid-template-columns: 52px repeat(4, 1fr); font-size: 6.5px; }
}
/* Landscape mobile */
@media (max-height: 500px) and (orientation: landscape) {
  .toolbar { height: 48px; }
  .report-scroll { padding: 6px 4px 24px; }
}
@media print {
  .no-print, .translate-banner, .translate-error-banner { display: none !important; }
}
  `]
})
export class ReportPage implements OnInit {
  readonly router = inject(Router);
  private api    = inject(ApiService);
  readonly orch  = inject(OrchestratorService);
  readonly auth  = inject(AuthService);

  readonly chakraSpinning = signal(false);
  readonly editMode    = signal(false);
  readonly report      = computed(() => this.orch.finalReport());
  readonly languages   = signal<LanguageOption[]>([]);
  readonly selectedLang = signal('en');
  readonly translating  = signal(false);
  readonly translateError = signal('');
  readonly pendingLangName = signal('');

  // translated report overrides base report when language !== en
  private translatedReport = signal<any>(null);

  readonly displayReport = computed(() => {
    const r = this.translatedReport() ?? this.report();
    if (!r) return r;
    // If sections have domain_breakdown but no domain_summary, build domain_summary from it
    const DOMAIN_META: Record<string, { label: string; icon: string; order: number }> = {
      astrology:  { label: 'Astrology',     icon: '★',  order: 1 },
      numerology: { label: 'Numerology',    icon: '🔢', order: 2 },
      palmistry:  { label: 'Palmistry',     icon: '✋', order: 3 },
      tarot:      { label: 'Tarot',         icon: '🃏', order: 4 },
      vastu:      { label: 'Vastu Shastra', icon: '🏠', order: 5 },
    };
    const TRADITION_LABELS: Record<string, string> = {
      vedic_parashara: 'Vedic Astrology', kp_system: 'KP Astrology',
      western_tropical: 'Western Astrology', indian_vedic: 'Indian Numerology',
      chaldean: 'Chaldean Numerology', pythagorean: 'Pythagorean Numerology',
      indian: 'Indian', chinese: 'Chinese', western: 'Western',
      rider_waite: 'Rider-Waite', intuitive: 'Intuitive',
      traditional: 'Traditional Vastu', modern: 'Modern Vastu',
    };
    const DOMAIN_TRADITIONS: Record<string, string[]> = {
      astrology:  ['vedic_parashara', 'kp_system',   'western_tropical'],
      numerology: ['indian_vedic',    'chaldean',     'pythagorean'],
      palmistry:  ['indian',          'chinese',      'western'],
      tarot:      ['rider_waite',     'intuitive'],
      vastu:      ['traditional',     'modern'],
    };
    const patched = { ...r, sections: (r.sections ?? []).map((s: any) => {
      // Always prefer domain_breakdown (contains storytelling-merged bullets) over cached domain_summary
      const db: Record<string, string[]> = s.domain_breakdown ?? {};
      if (!Object.keys(db).length) return s;

      // Extract RAG remedies — stored as JSON string in db['remedies']
      let rag_remedies: Array<{ icon: string; category: string; text: string }> = [];
      if (db['remedies']?.length) {
        try { rag_remedies = JSON.parse(db['remedies'][0]); } catch { /* ignore */ }
      }

      const domain_summary = Object.entries(db)
        .filter(([d]) => DOMAIN_META[d])   // 'remedies' key not in DOMAIN_META — excluded here
        .sort(([a], [b]) => (DOMAIN_META[a]?.order ?? 99) - (DOMAIN_META[b]?.order ?? 99))
        .map(([d, rawBullets]) => {
          const seen = new Set<string>();
          const bullets = (rawBullets as string[]).filter(b => {
            const key = b.trim().slice(0, 80).toLowerCase();
            if (!b.trim() || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return { domain: d, label: DOMAIN_META[d].label, icon: DOMAIN_META[d].icon, bullets };
        })
        .filter(grp => grp.bullets.length > 0);
      return { ...s, domain_summary, rag_remedies };
    })};
    return patched;
  });

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

    // If report already has a language set (translated before navigation), reflect it in selector
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
  // ── Color Theory Emotion Lexicon ────────────────────────────────────────────
  // Each semantic category maps to a color chosen for its cognitive/emotional effect:
  //   prosperity  → Emerald green   (#059669) — growth, money, nature, go-signal
  //   love        → Rose pink       (#db2777) — warmth, romance, heart connection
  //   warning     → Amber           (#d97706) — caution, patience, slow-down signal
  //   planetary   → Teal/Cyan       (#0891b2) — cosmic, vast, scientific precision
  //   strength    → Cobalt blue     (#2563eb) — authority, confidence, stability
  //   spiritual   → Deep violet     (#7c3aed) — mystery, transcendence, higher mind
  //   timing      → Forest green    (#15803d) — momentum, forward motion, progress
  //   wisdom      → Warm gold       (#b45309) — ancient knowledge, earned insight
  //   health      → Teal            (#0e7490) — vitality, clarity, clean energy
  //   action      → Burnt orange    (#c2410c) — urgency, initiative, drive
  //   karmic      → Indigo          (#4338ca) — depth, past-life, soul-contract weight
  private readonly LEXICON: Record<string, string> = {
    // ── PROSPERITY — only truly auspicious astrology terms ──
    auspicious:'prosperity', abundance:'prosperity', gains:'prosperity',
    // ── LOVE — only relationship/marriage specific terms ──
    marriage:'love', spouse:'love', soulmate:'love',
    // ── CAUTION — only genuine warnings ──
    retrograde:'warning', debilitated:'warning', afflicted:'warning',
    // ── PLANETARY — proper nouns only (planets, systems, technical terms) ──
    lagna:'planetary', ascendant:'planetary', nakshatra:'planetary',
    dasha:'planetary', mahadasha:'planetary', antardasha:'planetary',
    venus:'planetary', jupiter:'planetary', saturn:'planetary',
    mars:'planetary', mercury:'planetary', rahu:'planetary', ketu:'planetary',
    vedic:'planetary', exalted:'planetary', combustion:'planetary',
    // ── SPIRITUAL — only rare spiritual/Sanskrit terms ──
    mantra:'spiritual', dharma:'spiritual', moksha:'spiritual',
    // ── KARMIC — rare terms only ──
    karma:'karmic', karmic:'karmic',
    // ── ACTION / INITIATIVE (burnt orange → urgency, drive) ──
    action:'action', initiative:'action', seize:'action', pursue:'action',
    act:'action', decisive:'action', move:'action', launch:'action',
  };
  private readonly COLORS: Record<string, string> = {
    prosperity: '#d4af37',  // light gold — growth, abundance
    love:       '#d4af37',  // light gold — heart, warmth
    warning:    '#92600a',  // dark gold  — caution
    planetary:  '#d4af37',  // light gold — cosmic
    strength:   '#b8962e',  // mid gold   — authority
    spiritual:  '#d4af37',  // light gold — transcendence
    timing:     '#b8962e',  // mid gold   — momentum
    wisdom:     '#92600a',  // dark gold  — ancient knowledge
    health:     '#b8962e',  // mid gold   — vitality
    karmic:     '#92600a',  // dark gold  — depth
    action:     '#d4af37',  // light gold — drive
    // legacy alias kept for colorize()
    auspicious: '#d4af37',
    caution:    '#92600a',
  };

  // Maps color names (from remedy data) to actual CSS hex values for swatches
  private readonly COLOR_HEX: Record<string, string> = {
    'red': '#e53e3e', 'red coral': '#e53e3e', 'coral': '#ff6b6b',
    'orange': '#dd6b20', 'saffron': '#dd6b20',
    'yellow': '#d69e2e', 'soft yellow': '#ecc94b', 'gold': '#d4af37', 'golden': '#d4af37',
    'green': '#38a169', 'emerald green': '#2f855a', 'light green': '#68d391',
    'blue': '#3182ce', 'sky blue': '#63b3ed', 'royal blue': '#2b6cb0',
    'dark blue': '#2c5282', 'navy': '#2c5282', 'indigo': '#4c51bf',
    'violet': '#6b46c1', 'purple': '#805ad5', 'lavender': '#b794f4',
    'pink': '#d53f8c', 'rose pink': '#ed64a6', 'ivory': '#f5f0e8',
    'white': '#e8e8e8', 'cream': '#f5f0e8', 'off-white': '#f5f0e8',
    'black': '#2d3748', 'dark': '#2d3748',
    'brown': '#92400e', 'maroon': '#742a2a',
    'silver': '#a0aec0', 'grey': '#718096', 'gray': '#718096',
    'moonstone': '#b0c4de', 'pearl': '#f0f0e8',
    'diamond': '#b0c4de', 'sapphire': '#2b6cb0',
    'ruby': '#c53030', 'yellow sapphire': '#d69e2e',
  };

  colorHex(colorName: string): string {
    const key = (colorName || '').toLowerCase().trim();
    return this.COLOR_HEX[key] ?? '#d4af37'; // fallback to gold
  }

  // Strip the spaced-uppercase pattern the AI sometimes emits:
  // "W H O I S T H E R I G H T P A R T N E R" → "Who Is The Right Partner"
  isArray(v: any): boolean { return Array.isArray(v); }
  asArray(v: any): string[] { return Array.isArray(v) ? v : []; }
  asTiming(v: any): { window: string; peak: string; duration: string } {
    return { window: v?.window ?? '', peak: v?.peak ?? '', duration: v?.duration ?? '' };
  }

  despacify(text: string): string {
    if (!text) return '';
    // Detect: every character is separated by a single space (spaced-caps pattern)
    // Pattern: single uppercase letters (or short words) separated by spaces
    const spacedCaps = /^([A-Z]\s){3,}[A-Z]$/.test(text.trim());
    if (spacedCaps) {
      return text.trim().replace(/\s/g, '').split('').map((c, i, a) => {
        // Can't recover word boundaries, so just rejoin as title words
        // Better approach: collapse all spaces between single chars
        return c;
      }).join('');
    }
    // More robust: if 80%+ of "words" are single uppercase letters, collapse them
    const words = text.trim().split(/\s+/);
    const singleUppers = words.filter(w => /^[A-Z]$/.test(w)).length;
    if (words.length >= 4 && singleUppers / words.length >= 0.75) {
      // Collapse into a readable title: join all chars, then split on natural boundaries
      const collapsed = words.join('');
      // Convert ALLCAPS to Title Case
      return collapsed.charAt(0).toUpperCase() + collapsed.slice(1).toLowerCase()
        .replace(/([.!?]\s*)(\w)/g, (_, p, c) => p + c.toUpperCase());
    }
    return text;
  }

  colorize(text: string): string {
    if (!text) return '';
    return text.split(/(\s+)/).map(token => {
      const trimmed = token.trim();
      if (!trimmed) return token;
      const stripped = trimmed.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
      const cat = this.LEXICON[stripped];
      if (cat && this.COLORS[cat]) {
        return token.replace(trimmed,
          `<span style="color:${this.COLORS[cat]};font-weight:600;">${trimmed}</span>`);
      }
      return token;
    }).join('');
  }

  // ── Domain-summary visual helpers ────────────────────────────────────────

  private readonly DS_DOMAIN_COLORS: Record<string, { accent: string; bg: string; sub: string }> = {
    astrology:  { accent: '#d4af37', bg: 'rgba(212,175,55,0.06)', sub: 'Vedic · KP · Western' },
    numerology: { accent: '#d4af37', bg: 'rgba(212,175,55,0.06)', sub: 'Indian · Chaldean · Pythagorean' },
    palmistry:  { accent: '#d4af37', bg: 'rgba(212,175,55,0.06)', sub: 'Hand Lines · Shape · Mounts' },
    tarot:      { accent: '#d4af37', bg: 'rgba(212,175,55,0.06)', sub: 'Card Spread · Guidance' },
    vastu:      { accent: '#d4af37', bg: 'rgba(212,175,55,0.06)', sub: 'Zones · Energy · Corrections' },
  };

  private readonly INTENT_HIGHLIGHT: Record<string, string> = {
    marriage:     '#d4af37',
    love:         '#d4af37',
    career:       '#b8962e',
    finance:      '#d4af37',
    health:       '#b8962e',
    spirituality: '#d4af37',
    education:    '#b8962e',
    travel:       '#d4af37',
    children:     '#d4af37',
    general:      '#92600a',
  };

  // Key phrases per intent — these get highlighted in the intent accent color
  private readonly INTENT_KEYWORDS: Record<string, string[]> = {
    marriage:     ['marriage','partner','spouse','relationship','union','commitment','bond','wedding','love','karmic','soul connection','7th house','venus','shukra'],
    career:       ['career','promotion','profession','success','leadership','authority','10th house','saturn','sun','recognition','advancement'],
    finance:      ['wealth','finance','income','money','prosperity','jupiter','gains','investment','abundance','2nd house','11th house'],
    health:       ['health','vitality','healing','6th house','mars','saturn','body','energy','recovery','wellness'],
    spirituality: ['spiritual','soul','karma','dharma','divine','meditation','mantra','inner','consciousness','ketu','12th house'],
    education:    ['education','knowledge','learning','mercury','5th house','wisdom','study','intelligence','academic'],
    travel:       ['travel','foreign','relocation','rahu','12th house','abroad','journey','move','destination'],
    children:     ['children','child','family','5th house','jupiter','motherhood','fatherhood','pregnancy','birth'],
    general:      [],
  };

  dsAccent(domain: string): string {
    return this.DS_DOMAIN_COLORS[domain]?.accent ?? '#d4af37';
  }
  dsHeaderBg(domain: string): string {
    return this.DS_DOMAIN_COLORS[domain]?.bg ?? 'rgba(212,175,55,0.06)';
  }
  dsIconBg(domain: string): string {
    const a = this.DS_DOMAIN_COLORS[domain]?.accent ?? '#d4af37';
    return a + '22'; // 13% opacity tint of the accent colour
  }
  dsDomainSub(domain: string): string {
    return this.DS_DOMAIN_COLORS[domain]?.sub ?? '';
  }

  // ── Per-category highlight style (color theory) ─────────────────────────────
  // Each category gets a background tint derived from its color's emotional role:
  //   prosperity → green tint  (growth, go-signal)
  //   love       → pink tint   (warmth, softness)
  //   warning    → amber tint  (caution, visibility)
  //   planetary  → cyan tint   (cosmic, precise)
  //   strength   → blue tint   (solid, trust)
  //   spiritual  → violet tint (mystery, depth)
  //   timing     → green tint  (forward, momentum)
  //   wisdom     → gold tint   (warmth, earned)
  //   health     → teal tint   (fresh, vital)
  //   karmic     → indigo tint (weight, depth)
  //   action     → orange tint (urgency, energy)
  // Use <span> not <mark> — <mark> has browser-default yellow background that overrides in print.
  // All highlights use explicit inline color so print renders correctly without relying on alpha.
  private _catStyle(cat: string): string {
    const c = this.COLORS[cat];
    if (!c) return '';
    return `color:${c};font-weight:600;`;
  }

  private _intentStyle(color: string): string {
    return `color:${color};font-weight:700;`;
  }

  cleanBullet(text: string): string {
    if (!text) return '';
    // Remove tradition-label prefixes that confuse users
    // e.g. "From the Vedic Astrology perspective: ..." → strip opener
    // e.g. "Across all selected traditions — ... the analysis for "Q?" consistently indicates ..." → strip
    let t = text.trim();
    t = t.replace(/^From the [^:]+perspective:\s*/i, '');
    t = t.replace(/^Across all selected traditions[^.]+\.\s*/i, '');
    t = t.replace(/^There is a tendency toward /i, 'Your natural tendency is toward ');
    // Capitalise first letter after stripping
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  highlightBullet(text: string, intent: string, domain: string): string {
    if (!text) return '';
    text = this.cleanBullet(text);
    const intentColor = this.INTENT_HIGHLIGHT[intent] ?? this.INTENT_HIGHLIGHT['general'];
    const keywords = [...(this.INTENT_KEYWORDS[intent] ?? [])];
    // Build a fast lookup set of single-word intent keywords (lowercase)
    const singleKwSet = new Set(keywords.filter(k => !k.includes(' ')).map(k => k.toLowerCase()));

    // Work on plain text only — split into tokens, tag each token exactly once.
    // NEVER run regex on already-tagged HTML — this caused "0 2px;">wealth" corruption.
    const tokens = text.split(/(\s+)/);
    const result = tokens.map(token => {
      if (/^\s+$/.test(token)) return token;

      const plain = token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
      const low   = plain.toLowerCase();
      if (!plain) return token;

      // 1. Single-word intent keywords → intent accent color, underline style (bold signal)
      if (singleKwSet.has(low)) {
        return token.replace(plain,
          `<span style="${this._intentStyle(intentColor)}">${plain}</span>`);
      }

      // 2. Color-theory lexicon match → per-category semantic color
      const cat = this.LEXICON[low];
      if (cat && this.COLORS[cat]) {
        return token.replace(plain,
          `<span style="${this._catStyle(cat)}">${plain}</span>`);
      }

      return token;
    });

    let out = result.join('');

    // 3. Phrase-level intent keywords (multi-word) — one final pass on the assembled string.
    for (const kw of keywords.filter(k => k.includes(' '))) {
      const rx = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(rx,
        `<span style="${this._intentStyle(intentColor)}">$&</span>`);
    }

    return out;
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

  // Parse storytelling narrative (6-part labelled paragraphs) into segments for colored rendering
  private readonly STORY_THEMES: Array<{ key: string; label: string; color: string }> = [
    { key: 'HOOK',       label: 'Your Truth',        color: '#d4af37' },
    { key: 'TENSION',    label: 'The Challenge',     color: '#b45309' },
    { key: 'TURN',       label: 'The Turning Point', color: '#7c3aed' },
    { key: 'RESOLUTION', label: 'What To Do',        color: '#059669' },
    { key: 'CLOSING',    label: 'Remember This',     color: '#1d4ed8' },
    { key: 'REMEDIES',   label: 'Remedies',          color: '#059669' },
  ];

  parseStoryParagraphs(text: string, includeRemedies = true): Array<{ label: string; color: string; text: string }> | null {
    if (!text || !text.includes('[HOOK]')) return null;
    const result: Array<{ label: string; color: string; text: string }> = [];
    for (let i = 0; i < this.STORY_THEMES.length; i++) {
      const { key, label, color } = this.STORY_THEMES[i];
      // Remedies must appear only once per report — skip the [REMEDIES] segment
      // for every question after the first numerology one (includeRemedies=false).
      if (key === 'REMEDIES' && !includeRemedies) continue;
      const start = text.indexOf(`[${key}]`);
      if (start === -1) continue;
      const contentStart = start + key.length + 2; // skip "[KEY]"
      const nextKeys = this.STORY_THEMES.slice(i + 1).map(t => `[${t.key}]`);
      let end = text.length;
      for (const nk of nextKeys) {
        const pos = text.indexOf(nk);
        if (pos !== -1 && pos < end) end = pos;
      }
      const content = text.slice(contentStart, end).trim();
      if (content) result.push({ label, color, text: content });
    }
    return result.length >= 2 ? result : null;
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

  // Fill colors per house — aged parchment tones, manuscript palette
  private readonly HOUSE_FILLS: string[] = [
    '#ede0c4','#e8d5b0','#e4cfa0','#ead5b8','#e0d5c0','#e8dcc8',
    '#ddd5c0','#ede0c4','#e4cfa0','#ead5b8','#e8d5b0','#e0d5c0',
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

  private _astroRaw(): any {
    return (this.orch.rawOutputs() as any)?.astrology ?? {};
  }

  lagnaRashi(): string {
    const a = this._astroRaw();
    return a?.vedic?.chart?.lagna ?? a?.lagna ?? '—';
  }
  currentDasha(): string {
    const a = this._astroRaw();
    return a?.vedic?.current_dasha ?? a?.current_dasha ?? '—';
  }
  moonNakshatra(): string {
    const a = this._astroRaw();
    return a?.vedic?.chart?.nakshatra ?? '—';
  }
  isApproxChart(): boolean {
    return !!(this._astroRaw()?.vedic?.chart?.approximate);
  }
  chartMethod(): string {
    return this._astroRaw()?.vedic?.chart?.method ?? '';
  }
  ayanamsaLabel(): string {
    return this._astroRaw()?.vedic?.chart?.ayanamsa ?? 'Lahiri';
  }

  // Planet positions and which house they fall in
  planetsInHouses(): Array<{planet:string; house:number; rashi:string; x:number; y:number}> {
    const a     = this._astroRaw();
    const chart = a?.vedic?.chart ?? {};
    const lagna = chart.lagna ?? a?.lagna ?? 'Aries';

    const RASHIS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
    const lagnaIdx = RASHIS.indexOf(lagna);

    // Use planets map from vedic.chart if available, else flat planetary_positions, else offsets
    const chartPlanets = chart.planets ?? a?.planetary_positions ?? {};
    const planets: Record<string,string> = {
      Sun:     chartPlanets['Sun']     ?? RASHIS[(lagnaIdx+2)%12],
      Moon:    chartPlanets['Moon']    ?? chart.moon_sign ?? RASHIS[(lagnaIdx+4)%12],
      Mars:    chartPlanets['Mars']    ?? RASHIS[(lagnaIdx+6)%12],
      Mercury: chartPlanets['Mercury'] ?? RASHIS[(lagnaIdx+1)%12],
      Jupiter: chartPlanets['Jupiter'] ?? RASHIS[(lagnaIdx+8)%12],
      Venus:   chartPlanets['Venus']   ?? RASHIS[(lagnaIdx+3)%12],
      Saturn:  chartPlanets['Saturn']  ?? RASHIS[(lagnaIdx+9)%12],
      Rahu:    chartPlanets['Rahu']    ?? RASHIS[(lagnaIdx+5)%12],
      Ketu:    chartPlanets['Ketu']    ?? RASHIS[(lagnaIdx+11)%12],
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
    // Sacred manuscript ink tones — warm sepia palette
    const c: Record<string,string> = {
      Sun:'#8b4513', Moon:'#3d3460', Mars:'#7a2e2e', Mercury:'#2e5c3d',
      Jupiter:'#6b4c0e', Venus:'#7a3b52', Saturn:'#3c3c3c',
      Rahu:'#2e4a5c', Ketu:'#5c3d1e', Lagna:'#8b6914',
    };
    return c[planet] ?? '#3c3c3c';
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

  hasRemedies(): boolean {
    const r = (this.displayReport() as any)?.remedies;
    if (!r) return false;
    return !!(
      r.daily_habits?.length || r.mantras?.length || r.colors?.length ||
      r.gemstones?.length || r.fasting?.length || r.charity?.length ||
      r.behavioral_adjustments?.length || r.yoga_meditation?.length ||
      r.vastu_remedies?.length
    );
  }

  remedyItems(): Array<{icon: string; category: string; text: string}> {
    const r = (this.displayReport() as any)?.remedies;
    if (!r) return [];
    const items: Array<{icon: string; category: string; text: string}> = [];
    for (const h of (r.daily_habits ?? []).slice(0, 3))
      items.push({ icon: '☀', category: 'Daily Habit', text: h });
    for (const m of (r.mantras ?? []).slice(0, 3))
      items.push({ icon: 'ॐ', category: 'Mantra', text: `${m.mantra} — ${m.purpose} (${m.count}×)` });
    for (const g of (r.gemstones ?? []).slice(0, 2))
      items.push({ icon: '◇', category: 'Gemstone', text: `${g.stone} — ${g.purpose} · ${g.finger}` });
    for (const c of (r.colors ?? []).slice(0, 5))
      items.push({ icon: '◈', category: 'Lucky Color', text: c });
    for (const f of (r.fasting ?? []).slice(0, 2))
      items.push({ icon: '☽', category: 'Fasting', text: f });
    for (const ch of (r.charity ?? []).slice(0, 2))
      items.push({ icon: '♡', category: 'Charity', text: ch });
    for (const b of (r.behavioral_adjustments ?? []).slice(0, 2))
      items.push({ icon: '⚖', category: 'Practice', text: b });
    for (const y of (r.yoga_meditation ?? []).slice(0, 2))
      items.push({ icon: '🪷', category: 'Yoga & Meditation', text: y });
    for (const v of (r.vastu_remedies ?? []).slice(0, 2))
      items.push({ icon: '⊕', category: 'Vastu', text: v });
    return items;
  }

  moduleMethods(): Record<string, any> {
    return (this.displayReport() as any)?.module_methodology ?? {};
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

  // ── Lo Shu Grid ──────────────────────────────────────────────────────────────
  loShuGrid(): Array<{pos:number;x:number;y:number;num:string;fill:string;numColor:string;labelColor:string;label:string}> {
    const c = this._numCore();
    const lp   = c['life_path']   ?? 0;
    const dest = c['destiny']     ?? 0;
    const name = c['name_number'] ?? 0;
    const soul = c['soul_urge']   ?? 0;
    // Lo Shu magic square positions: [4,9,2 / 3,5,7 / 8,1,6] — row/col order
    const LOSHU = [4,9,2,3,5,7,8,1,6];
    const LABELS = ['4','9','2','3','5','7','8','1','6'];
    // Sacred manuscript: highlighted cells get antique gold ink; others stay parchment
    const COLORS = [
      '#c8a84b','#8b6914','#a07830',
      '#7a5c2e','#b8960c','#6b4c0e',
      '#8b6914','#a07830','#c8a84b'
    ];
    const LIGHT = [
      '#ede0c4','#e8d5b0','#e4cfa0',
      '#ead5b8','#e0d5c0','#e8dcc8',
      '#ddd5c0','#ede0c4','#e4cfa0'
    ];
    const DOMAIN_LABELS = ['Family','Crown','Partnership','Growth','Soul','Spirit','Foundation','Root','Gains'];
    // highlight cells containing the user's key numbers
    const keyNums = new Set([lp, dest, name, soul].filter(Boolean).map(String));
    return LOSHU.map((num, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const isKey = keyNums.has(String(num));
      return {
        pos: i, x: col*80 + 10, y: row*80 + 10,
        num: String(num), label: DOMAIN_LABELS[i],
        fill: isKey ? COLORS[i] : LIGHT[i],
        numColor: isKey ? '#3c2a0e' : '#7a5c2e',
        labelColor: isKey ? '#5c3d0e' : '#9a7d5a',
      };
    });
  }

  // ── Tarot card gradient per position ─────────────────────────────────────────
  tarotCardGrad(i: number): string {
    // Premium occult palette — deep charcoal, midnight indigo, dark sepia
    const grads = [
      'linear-gradient(170deg,#1a1410 0%,#2c2018 100%)',
      'linear-gradient(170deg,#12101a 0%,#1e1a2e 100%)',
      'linear-gradient(170deg,#0e1614 0%,#1a2820 100%)',
      'linear-gradient(170deg,#16101a 0%,#241830 100%)',
      'linear-gradient(170deg,#141010 0%,#261818 100%)',
    ];
    return grads[i % grads.length];
  }

  // ── Palmistry helpers ────────────────────────────────────────────────────────
  palmTraditions(): Array<{name:string; color:string; traits:string[]; lines:Array<{name:string;desc:string}>; focus_insight:string}> {
    const raw = (this.orch.rawOutputs() as any)?.palmistry ?? {};
    const COLORS: Record<string,string> = { Indian:'#b45309', Chinese:'#dc2626', Western:'#1d4ed8' };
    return ['indian','chinese','western'].map(key => {
      const t = raw[key] ?? {};
      const lines = t.lines ?? {};
      return {
        name:         t.tradition ?? key.charAt(0).toUpperCase() + key.slice(1),
        color:        COLORS[key.charAt(0).toUpperCase() + key.slice(1)] ?? '#6b7280',
        traits:       t.traits ?? [],
        lines:        Object.entries(lines).slice(0, 4).map(([k, v]) => ({
          name: k.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
          desc: String(v),
        })),
        focus_insight: t.focus_insight ?? '',
      };
    }).filter(t => t.lines.length > 0 || t.focus_insight);
  }

  // ── Tarot helpers ─────────────────────────────────────────────────────────────
  private _tarotRaw(): any { return (this.orch.rawOutputs() as any)?.tarot ?? {}; }

  tarotSpread(): string {
    return this._tarotRaw()?.universal?.spread ?? '3-card';
  }

  tarotTheme(): string {
    return this._tarotRaw()?.universal?.overall_theme ?? '';
  }

  tarotCards(): Array<{position:string; name:string; symbol:string; keywords:string; reversed:boolean}> {
    const cards: any[] = this._tarotRaw()?.universal?.cards ?? [];
    const positions = ['Past / Root', 'Present Energy', 'Future Potential', 'Hidden Influence', 'Advice'];
    const SYMBOLS: Record<string,string> = {
      'The Fool':'☆','The Magician':'✦','The High Priestess':'☽','The Empress':'♀','The Emperor':'♂',
      'The Hierophant':'☩','The Lovers':'♡','The Chariot':'⚔','Strength':'∞','The Hermit':'🕯',
      'Wheel of Fortune':'☸','Justice':'⚖','The Hanged Man':'⊕','Temperance':'⚗','The Star':'★',
      'The Moon':'🌙','The Sun':'☀','Judgement':'📯','The World':'○',
    };
    return cards.slice(0, 5).map((c: any, i: number) => ({
      position: c.position ?? positions[i] ?? `Card ${i+1}`,
      name:     c.name ?? '—',
      symbol:   SYMBOLS[c.name] ?? '✦',
      keywords: (c.keywords ?? []).slice(0,3).join(' · '),
      reversed: c.orientation === 'reversed',
    }));
  }

  // ── Vastu helpers ─────────────────────────────────────────────────────────────
  private _vastuRaw(): any { return (this.orch.rawOutputs() as any)?.vastu ?? {}; }

  vastuPropertyType(): string {
    return this._vastuRaw()?.vedic?.property_type ?? 'Home';
  }
  vastuFacing(): string {
    return this._vastuRaw()?.vedic?.facing_direction ?? '—';
  }
  vastuColors(): string[] {
    return this._vastuRaw()?.vedic?.colors_recommended ?? [];
  }
  vastuPriorityZones(): Array<{zone:string; tip:string}> {
    const zoneMap: Record<string,string> = this._vastuRaw()?.vedic?.zone_analysis ?? {};
    return Object.entries(zoneMap).slice(0, 4).map(([zone, tip]) => ({ zone, tip: String(tip) }));
  }
  vastuZoneSvg(): Array<{label:string;path:string;fill:string;lx:number;ly:number;pathV2:string;fillV2:string;textColor:string;lx2:number;ly2:number;deity:string}> {
    // Old compass (220×220, cx=110)
    const cx = 110, cy = 110, r1 = 36, r2 = 98;
    // New mandala (280×280, cx=140)
    const cx2 = 140, cy2 = 140, r1v2 = 38, r2v2 = 110;
    // Manuscript earth tones — aged parchment zones, sepia text
    const zones = [
      { label:'N',  angle:-90,  fill:'#d4e8d0', fillV2:'#c8d8c0', deity:'Kubera',  textColor:'#2e4a2e' },
      { label:'NE', angle:-45,  fill:'#e8dcc8', fillV2:'#ddd0b8', deity:'Eeshaan', textColor:'#3c2e10' },
      { label:'E',  angle:0,    fill:'#d0dce8', fillV2:'#c4d0dc', deity:'Indra',   textColor:'#1e3040' },
      { label:'SE', angle:45,   fill:'#e8d4c0', fillV2:'#dcbca0', deity:'Agni',    textColor:'#4a2810' },
      { label:'S',  angle:90,   fill:'#d8d4cc', fillV2:'#ccc8c0', deity:'Yama',    textColor:'#2c2c28' },
      { label:'SW', angle:135,  fill:'#e4d4b0', fillV2:'#d8c89c', deity:'Nairuti', textColor:'#3c2c08' },
      { label:'W',  angle:180,  fill:'#c8d4e4', fillV2:'#bcc8d8', deity:'Varuna',  textColor:'#1c2c40' },
      { label:'NW', angle:225,  fill:'#d8d0e4', fillV2:'#ccc4d8', deity:'Vayu',    textColor:'#2c2040' },
    ];
    return zones.map(z => {
      // Old path
      const a1 = (z.angle - 22.5) * Math.PI / 180, a2 = (z.angle + 22.5) * Math.PI / 180;
      const x1o=cx+r2*Math.cos(a1), y1o=cy+r2*Math.sin(a1);
      const x2o=cx+r2*Math.cos(a2), y2o=cy+r2*Math.sin(a2);
      const x1i=cx+r1*Math.cos(a1), y1i=cy+r1*Math.sin(a1);
      const x2i=cx+r1*Math.cos(a2), y2i=cy+r1*Math.sin(a2);
      const path=`M${x1i} ${y1i} L${x1o} ${y1o} A${r2} ${r2} 0 0 1 ${x2o} ${y2o} L${x2i} ${y2i} A${r1} ${r1} 0 0 0 ${x1i} ${y1i}Z`;
      const lx=cx+(r1+r2)/2*Math.cos(z.angle*Math.PI/180), ly=cy+(r1+r2)/2*Math.sin(z.angle*Math.PI/180);
      // New path (mandala)
      const b1o=cx2+r2v2*Math.cos(a1), b1oy=cy2+r2v2*Math.sin(a1);
      const b2o=cx2+r2v2*Math.cos(a2), b2oy=cy2+r2v2*Math.sin(a2);
      const b1i=cx2+r1v2*Math.cos(a1), b1iy=cy2+r1v2*Math.sin(a1);
      const b2i=cx2+r1v2*Math.cos(a2), b2iy=cy2+r1v2*Math.sin(a2);
      const pathV2=`M${b1i} ${b1iy} L${b1o} ${b1oy} A${r2v2} ${r2v2} 0 0 1 ${b2o} ${b2oy} L${b2i} ${b2iy} A${r1v2} ${r1v2} 0 0 0 ${b1i} ${b1iy}Z`;
      const mid=(r1v2+r2v2)/2;
      const lx2=cx2+mid*Math.cos(z.angle*Math.PI/180), ly2=cy2+mid*Math.sin(z.angle*Math.PI/180);
      return { label:z.label, path, fill:z.fill, lx, ly, pathV2, fillV2:z.fillV2, textColor:z.textColor, lx2, ly2, deity:z.deity };
    });
  }

  vastuEnergy(): string {
    return this._vastuRaw()?.vedic?.overall_energy ?? '';
  }

  // ── Numerology numbers ───────────────────────────────────────────────────────
  // Reads from backend shape: numerology.indian.core_numbers.{life_path, destiny, name_number, soul_urge}
  // The local fallback is normalized to this same shape by _normalizeLocalNumerology().
  private _numCore(): Record<string, number> {
    const raw = (this.orch.rawOutputs() as any)?.numerology;
    // Backend / normalized-local shape
    if (raw?.indian?.core_numbers) return raw.indian.core_numbers;
    // Array shape (raw local service output — safety fallback)
    if (Array.isArray(raw)) {
      const indian = raw.find((r: any) => (r.tradition ?? '').toLowerCase() === 'indian') ?? raw[0];
      if (indian) return {
        life_path:   indian.life_path_number   ?? indian.life_path   ?? 0,
        destiny:     indian.destiny_number     ?? indian.destiny     ?? 0,
        name_number: indian.name_number        ?? 0,
        soul_urge:   indian.soul_urge_number   ?? indian.soul_urge   ?? 0,
      };
    }
    return {};
  }

  numerologyNumbers(): Array<{label:string; value:string}> {
    const c = this._numCore();
    return [
      { label:'Life Path',  value: c['life_path']   != null ? String(c['life_path'])   : '—' },
      { label:'Destiny',    value: c['destiny']      != null ? String(c['destiny'])     : '—' },
      { label:'Name No.',   value: c['name_number']  != null ? String(c['name_number']) : '—' },
      { label:'Soul Urge',  value: c['soul_urge']    != null ? String(c['soul_urge'])   : '—' },
    ];
  }
  lifePathNumber(): number {
    return this._numCore()['life_path'] ?? 0;
  }
  lifePathPct(): number {
    const lp = this.lifePathNumber();
    return lp ? Math.round((lp / 9) * 100) : 0;
  }

  numerologyBranches(): string[] {
    const mm = (this.displayReport() as any)?.module_methodology?.numerology;
    if (mm?.branches?.length) return mm.branches;
    return ['Indian Vedic Numerology', 'Chaldean Numerology', 'Pythagorean Numerology'];
  }

  numerologyTraditions(): Array<{name:string; life_path:string; name_number:string; destiny:string; soul_urge:string}> {
    const raw = (this.orch.rawOutputs() as any)?.numerology;
    if (!raw) return [];

    // Backend shape: { indian: {...}, chaldean: {...}, pythagorean: {...} }
    const MAP: Array<{key: string; label: string}> = [
      { key: 'indian',      label: 'Indian Vedic' },
      { key: 'chaldean',    label: 'Chaldean' },
      { key: 'pythagorean', label: 'Pythagorean' },
    ];

    const result: Array<{name:string; life_path:string; name_number:string; destiny:string; soul_urge:string}> = [];
    for (const { key, label } of MAP) {
      const t = raw[key];
      if (!t) continue;
      const c = t.core_numbers ?? t;
      result.push({
        name:        label,
        life_path:   c.life_path   != null ? String(c.life_path)   : '—',
        name_number: c.name_number != null ? String(c.name_number) : '—',
        destiny:     c.destiny     != null ? String(c.destiny)     : '—',
        soul_urge:   c.soul_urge   != null ? String(c.soul_urge)   : '—',
      });
    }

    // Also handle question_wise_analysis shape from raw numerology agent
    if (!result.length && raw?.question_wise_analysis?.length) {
      const subResults = raw.question_wise_analysis[0]?.sub_agent_results ?? [];
      for (const sub of subResults) {
        const c = sub.extra?.core_numbers ?? {};
        result.push({
          name:        sub.sub_agent ?? sub.tradition ?? 'Unknown',
          life_path:   c.life_path   != null ? String(c.life_path)   : '—',
          name_number: c.name_number != null ? String(c.name_number) : '—',
          destiny:     c.destiny     != null ? String(c.destiny)     : '—',
          soul_urge:   c.soul_urge   != null ? String(c.soul_urge)   : '—',
        });
      }
    }

    return result;
  }

  numColor(value: string | number): string {
    // Antique ink tones — no bright colors, manuscript palette
    const n = Number(value) % 9 || 9;
    const palette = ['#7a2e2e','#8b4513','#8b6914','#2e5c3d','#2e4a5c','#3d3460','#7a3b52','#2e5c50','#6b4c0e'];
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
    this.chakraSpinning.set(true);
    const chakraTimer = new Promise(r => setTimeout(r, 4000));

    // 1. Convert images to base64 so they survive the print context
    const imgs = document.querySelectorAll<HTMLImageElement>('#report-doc img');
    const origSrcs: string[] = [];
    await Promise.all(Array.from(imgs).map(async (img, i) => {
      origSrcs[i] = img.src;
      if (!img.src.startsWith('data:')) img.src = await this.toBase64(img.src);
    }));

    // 2. Inject unscoped print CSS globally (Angular scoped styles don't apply in print)
    const style = document.createElement('style');
    style.id = '__aura-print-css';
    style.textContent = `
      /* ══════════════════════════════════════════════════════════════
         A4 PAGE SETUP
         margin: 0 so @page handles all spacing; content pads itself.
         Browser headers/footers: user must disable in print dialog
         (More settings → Headers and footers → off).
      ══════════════════════════════════════════════════════════════ */
      @page {
        size: A4 portrait;
        margin: 0;
      }


      @media print {

        /* ════════════════════════════════════════════════════
           GLOBAL RESET
        ════════════════════════════════════════════════════ */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          box-sizing: border-box !important;
        }
        /* Ensure inline-colored spans (color-theory highlights) render in print */
        span[style] {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* Kill browser default yellow mark background — we use span[style] for highlights now */
        mark {
          background: transparent !important;
          color: inherit !important;
        }

        /* Hide all browser chrome + app UI */
        .no-print, .toolbar, .translate-banner, .translate-error-banner,
        button, select, .lang-pill, .tb-btn, .tb-btn-primary, .tb-icon-btn,
        .edit-toggle-btn, .edit-area { display: none !important; }

        html, body {
          margin: 0 !important; padding: 0 !important;
          width: 210mm !important; height: auto !important;
          overflow: visible !important; background: #fff !important;
        }

        app-report, .report-scroll {
          display: block !important; width: 210mm !important;
          height: auto !important; overflow: visible !important;
          padding: 0 !important; margin: 0 !important;
          background: transparent !important;
        }

        .report-wrap {
          display: block !important; width: 210mm !important;
          max-width: 210mm !important; height: auto !important;
          margin: 0 !important; padding: 0 !important;
          box-shadow: none !important; border-radius: 0 !important;
          background: transparent !important; overflow: visible !important;
        }

        /* ════════════════════════════════════════════════════
           BASE .pdf-page — flows naturally, no forced breaks
           Question pages intentionally allow page-break-inside
           so long content can span multiple A4 sheets.
        ════════════════════════════════════════════════════ */
        .pdf-page {
          display: block !important;
          width: 210mm !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          position: relative !important;
          padding: 10mm 12mm !important;
          margin: 0 !important;
          page-break-before: auto !important; break-before: auto !important;
          page-break-after: auto !important;  break-after: auto !important;
          page-break-inside: auto !important; break-inside: auto !important;
        }

        /* Each question starts on a new A4 sheet.
           Content flows freely across continuation sheets.
           .pdf-page padding (10mm 12mm) is inherited for internal spacing. */
        .page-question {
          page-break-before: always !important;
          break-before: page !important;
          page-break-inside: auto !important;
          break-inside: auto !important;
          background: #fff !important;
        }

        .page-hw-summary {
          page-break-before: always !important;
          break-before: page !important;
          background: #fff !important;
          padding: 0 !important;
        }
        .hw-q-banner {
          display: flex !important; align-items: flex-start !important;
          gap: 12px !important; padding: 20px 32px 0 !important;
          break-after: avoid !important;
        }
        .hw-q-circle {
          flex-shrink: 0 !important; width: 30px !important; height: 30px !important;
          border-radius: 50% !important; font-size: 12px !important; font-weight: 900 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          background: linear-gradient(135deg,#8a6a00,#d4af37) !important; color: #fff !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .hw-q-text { font-size: 14px !important; font-weight: 700 !important; line-height: 1.35 !important; }
        .hw-body { padding: 12px 32px 0 !important; }

        /* ════════════════════════════════════════════════════
           COVER PAGE — full A4, dark, portrait
           .cover IS the .pdf-page, so override its padding to 0
           and set exact A4 dimensions for edge-to-edge bleed.
        ════════════════════════════════════════════════════ */
        .cover {
          background: #14100c !important;
          width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
          padding: 0 !important;
          margin: 0 !important;
          position: relative !important;
          overflow: hidden !important;
          page-break-after: always !important;
          break-after: page !important;
        }
        .cover-photo-wrap {
          position: absolute !important; inset: 0 !important;
          overflow: hidden !important;
        }
        .cover-photo {
          display: block !important; opacity: 0.72 !important;
          position: absolute !important; right: 0 !important; top: 0 !important;
          width: 55% !important; height: 100% !important;
          object-fit: cover !important; object-position: center top !important;
        }
        .cover-fade { position: absolute !important; inset: 0 !important; z-index: 1 !important; }
        .cover-body {
          position: relative !important; z-index: 2 !important;
          padding: 36px 40px 24px !important;
          height: 100% !important;
          display: flex !important; flex-direction: column !important;
        }
        .cover-logo-wrap { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
        .cover-logo-img { width: 88px !important; height: auto !important; object-fit: contain !important; border-radius: 0 !important; background: transparent !important; }
        .cover-eyebrow { font-size: 8.5px !important; letter-spacing: 3.5px !important; margin-top: 28px !important; }
        .cover-name { font-size: 42px !important; margin: 10px 0 8px !important; line-height: 1.1 !important; }
        .cover-rule { width: 40px !important; height: 3px !important; margin-bottom: 14px !important; }
        .cover-sub { font-size: 11px !important; margin-bottom: 12px !important; max-width: 260px !important; line-height: 1.5 !important; }
        .cover-date { font-size: 9px !important; letter-spacing: 1.5px !important; margin-bottom: 20px !important; }
        .cover-questions { margin-top: auto !important; padding-bottom: 8px !important; }
        .cq-row { display: flex !important; gap: 10px !important; align-items: flex-start !important; margin-bottom: 7px !important; }
        .cq-num {
          flex-shrink: 0 !important; width: 20px !important; height: 20px !important;
          font-size: 9px !important; font-weight: 700 !important;
          border-radius: 50% !important; display: flex !important;
          align-items: center !important; justify-content: center !important;
        }
        .cq-text { font-size: 10.5px !important; line-height: 1.45 !important; }
        .cover-footer-bar {
          position: absolute !important; bottom: 0 !important;
          left: 0 !important; right: 0 !important; z-index: 3 !important;
        }

        /* ════════════════════════════════════════════════════
           LETTER PAGE (page 2)
        ════════════════════════════════════════════════════ */
        .page-letter { background: #fff !important; }
        .letter-watermark-zone {
          flex: 0 0 auto !important; display: block !important;
          text-align: center !important;
          width: 100% !important; height: auto !important;
          max-height: 160px !important; min-height: 0 !important;
          padding: 20px 0 10px !important;
          pointer-events: none !important; overflow: hidden !important;
        }
        .letter-watermark {
          width: 200px !important; max-width: 200px !important;
          height: auto !important; max-height: 140px !important;
          opacity: 0.15 !important;
          object-fit: contain !important; display: inline-block !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .letter-page-body { flex: 0 0 auto !important; }
        .letter-page-body { display: block !important; overflow: visible !important; padding: 0 !important; }
        .letter-inner { width: 100% !important; max-width: 100% !important; margin: 0 !important; }
        .letter-brand-row {
          display: flex !important; align-items: center !important; gap: 10px !important;
          margin-bottom: 10px !important; padding-bottom: 10px !important;
          border-bottom: 1px solid #f0ece4 !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }
        .letter-brand-name { font-size: 18px !important; font-weight: 700 !important; }
        .letter-brand-tagline { font-size: 13px !important; opacity: 0.65 !important; }
        .letter-title { font-size: 26px !important; margin: 0 0 10px !important; break-after: avoid !important; }
        .letter-paras p { font-size: 15px !important; line-height: 1.75 !important; margin: 0 0 10px !important; }
        .letter-sign { font-size: 16px !important; margin-top: 12px !important; break-inside: avoid !important; }
        .letter-divider { height: 1px !important; background: #f0ece4 !important; margin: 10px 0 !important; }
        .letter-disclaimer { padding: 8px 12px !important; font-size: 12px !important; line-height: 1.55 !important; break-inside: avoid !important; }
        .letter-modules { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; margin-top: 8px !important; }
        .module-chip { font-size: 12px !important; padding: 3px 10px !important; break-inside: avoid !important; }
        .report-method-panel { margin-top: 12px !important; break-inside: avoid !important; }
        .rmp-title { font-size: 11px !important; letter-spacing: 2px !important; padding: 4px 10px !important; }
        .rmp-grid { display: block !important; }
        .rmp-item { padding: 5px 10px !important; break-inside: avoid !important; }
        .rmp-item-hdr { display: flex !important; align-items: center !important; gap: 6px !important; }
        .rmp-icon { font-size: 14px !important; }
        .rmp-label { font-size: 13px !important; font-weight: 600 !important; }
        .rmp-branches { display: flex !important; flex-wrap: wrap !important; gap: 3px !important; margin: 3px 0 !important; }
        .rmp-branch { font-size: 11px !important; padding: 2px 7px !important; }
        .rmp-meta { font-size: 11px !important; color: #999 !important; }

        /* ════════════════════════════════════════════════════
           PAGE HEADER (appears on letter, profile, Q pages)
           On question pages the header is also repeated via
           CSS page counters in @page top margin.
        ════════════════════════════════════════════════════ */
        .page-hdr {
          display: flex !important; align-items: center !important;
          justify-content: space-between !important;
          padding: 0 0 7px !important;
          border-bottom: 1px solid rgba(212,175,55,0.25) !important;
          margin-bottom: 10px !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }
        .page-hdr-right { font-size: 8px !important; opacity: 0.55 !important; letter-spacing: 0.05em !important; }
        .page-hdr-dark { border-bottom-color: rgba(255,255,255,0.1) !important; }

        /* All logos */
        img { max-width: 100% !important; height: auto !important; }
        .page-hdr-logo, .page-hdr-logo-dark {
          width: 40px !important; height: auto !important;
          border-radius: 0 !important; object-fit: contain !important;
          background: transparent !important; padding: 0 !important; display: block !important;
        }
        .letter-brand-logo {
          width: 40px !important; height: auto !important;
          border-radius: 0 !important; object-fit: contain !important;
          background: transparent !important; display: block !important;
        }

        /* ════════════════════════════════════════════════════
           PROFILE PAGE — Cosmic Blueprint (astro + numerology)
           Always starts on a fresh page
        ════════════════════════════════════════════════════ */
        .page-profile {
          background: #f8f7f4 !important;
          page-break-before: always !important;
          break-before: page !important;
        }
        .profile-body { display: block !important; overflow: visible !important; height: auto !important; padding: 0 !important; }
        .profile-heading-row {
          padding: 2px 0 8px !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }
        .cp-eyebrow { font-size: 7.5px !important; letter-spacing: 2px !important; margin-bottom: 2px !important; }
        .profile-title { font-size: 19px !important; margin: 0 !important; }

        /* ── Universal section card ── */
        .mod-block {
          display: block !important;
          border: 1px solid rgba(0,0,0,0.07) !important;
          border-radius: 10px !important;
          padding: 10px 12px !important;
          margin-top: 10px !important;
          background: #fff !important;
          box-shadow: none !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          overflow: visible !important;
        }
        .mod-block-hdr {
          display: flex !important; align-items: center !important;
          justify-content: space-between !important;
          margin-bottom: 8px !important; padding-bottom: 5px !important;
          border-bottom: 1px solid rgba(0,0,0,0.05) !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }
        .mod-block-hdr-left { display: flex !important; align-items: center !important; gap: 8px !important; }
        .mod-icon-wrap { width: 26px !important; height: 26px !important; flex-shrink: 0 !important; border-radius: 7px !important; display: flex !important; align-items: center !important; justify-content: center !important; }
        .mod-title { font-size: 11px !important; font-weight: 700 !important; margin: 0 !important; }
        .mod-sub { font-size: 8px !important; color: #777 !important; margin: 1px 0 0 !important; }
        .mod-badge { font-size: 7px !important; padding: 2px 7px !important; border-radius: 4px !important; }
        .mod-body-row { display: flex !important; gap: 10px !important; align-items: flex-start !important; }

        /* SVGs */
        svg { overflow: visible !important; }
        .vedic-svg-v2  { width: 118px !important; height: 118px !important; flex-shrink: 0 !important; box-shadow: none !important; display: block !important; }
        .chart-svg-wrap { width: 118px !important; flex-shrink: 0 !important; }
        .hand-svg      { width: 88px !important; height: 117px !important; flex-shrink: 0 !important; box-shadow: none !important; display: block !important; }
        .hand-svg-wrap { width: 88px !important; flex-shrink: 0 !important; }
        .vastu-svg-v2  { width: 112px !important; height: 112px !important; flex-shrink: 0 !important; box-shadow: none !important; display: block !important; }
        .vastu-svg-wrap { width: 112px !important; flex-shrink: 0 !important; }
        .loshu-svg     { width: 98px !important; height: 98px !important; box-shadow: none !important; display: block !important; }
        .loshu-wrap    { width: 98px !important; flex-shrink: 0 !important; }

        /* Astrology table */
        .astro-data-panel { flex: 1 !important; min-width: 0 !important; }
        .astro-data-title { font-size: 7.5px !important; letter-spacing: 1.5px !important; margin-bottom: 4px !important; text-transform: uppercase !important; }
        .planet-table { display: block !important; }
        .pt-row { display: flex !important; align-items: center !important; gap: 5px !important; padding: 2px 0 !important; border-bottom: 1px solid rgba(0,0,0,0.04) !important; }
        .pt-sym { width: 15px !important; text-align: center !important; font-size: 11px !important; flex-shrink: 0 !important; }
        .pt-name { flex: 1 !important; font-size: 8.5px !important; }
        .pt-house { font-size: 7.5px !important; color: #999 !important; min-width: 20px !important; }
        .pt-rashi { font-size: 8.5px !important; min-width: 44px !important; text-align: right !important; }
        .astro-meta-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 3px !important; margin-top: 6px !important; }
        .astro-meta-cell { padding: 3px 6px !important; border-radius: 5px !important; background: rgba(0,0,0,0.03) !important; }
        .astro-meta-lbl { font-size: 6.5px !important; letter-spacing: 1px !important; color: #999 !important; text-transform: uppercase !important; }
        .astro-meta-val { font-size: 9px !important; font-weight: 700 !important; }

        /* Numerology */
        .num-cells-panel { flex: 1 !important; min-width: 0 !important; }
        .num-branch-row { display: flex !important; flex-wrap: wrap !important; gap: 3px !important; margin-bottom: 6px !important; }
        .num-branch-pill { font-size: 7px !important; padding: 1px 6px !important; border-radius: 99px !important; }
        .num-cards-grid { display: flex !important; flex-wrap: wrap !important; gap: 4px !important; margin-bottom: 5px !important; }
        .num-card {
          flex: 0 0 auto !important; width: calc(33.3% - 4px) !important;
          padding: 5px 3px !important; border-radius: 7px !important;
          border-width: 1px !important; text-align: center !important;
          break-inside: avoid !important;
        }
        .num-card-val { font-size: 17px !important; font-weight: 900 !important; line-height: 1.1 !important; }
        .num-card-lbl { font-size: 6.5px !important; letter-spacing: 0.5px !important; text-transform: uppercase !important; }
        .num-card-meaning { font-size: 7px !important; }
        .num-card-lp { width: 100% !important; }
        .num-lp-bar { height: 3px !important; margin-top: 3px !important; border-radius: 2px !important; background: rgba(0,0,0,0.07) !important; }
        .num-lp-fill { height: 100% !important; border-radius: 2px !important; }
        .num-tradition-table { margin-top: 4px !important; border-radius: 6px !important; overflow: hidden !important; }
        .ntt-hdr-row, .ntt-row { display: grid !important; grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr !important; padding: 3px 6px !important; }
        .ntt-hdr-row { font-size: 7px !important; }
        .ntt-row { font-size: 8.5px !important; }
        .ntt-col-label { font-size: 8px !important; }
        .ntt-col { text-align: center !important; font-weight: 700 !important; }

        /* Palmistry */
        .palm-trad-panel { flex: 1 !important; min-width: 0 !important; display: block !important; }
        .palm-trad-card-v2 {
          margin-bottom: 5px !important; padding: 5px 8px !important;
          border-radius: 6px !important; background: rgba(0,0,0,0.015) !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
        }
        .palm-trad-hdr {
          display: flex !important; align-items: center !important;
          flex-wrap: wrap !important; gap: 4px !important;
          border-left-width: 2px !important; border-left-style: solid !important;
          padding-left: 6px !important; margin-bottom: 2px !important;
        }
        .palm-trad-name-v2 { font-size: 9px !important; font-weight: 700 !important; }
        .palm-trad-traits { display: flex !important; gap: 3px !important; flex-wrap: wrap !important; }
        .palm-trad-trait-v2 { font-size: 7px !important; padding: 1px 5px !important; border-radius: 3px !important; }
        .palm-insight-v2 { font-size: 8.5px !important; line-height: 1.4 !important; color: #555 !important; padding-left: 8px !important; }

        /* Tarot */
        .tarot-spread-area {
          display: flex !important; gap: 5px !important; margin-top: 6px !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
        }
        .tarot-card-v2 { flex: 1 !important; min-width: 0 !important; display: flex !important; flex-direction: column !important; align-items: center !important; }
        .tc-pos-label { font-size: 6px !important; text-align: center !important; margin-bottom: 3px !important; letter-spacing: 0.5px !important; opacity: 0.7 !important; }
        .tc-frame {
          width: 100% !important; height: 80px !important;
          max-height: 80px !important; min-height: 0 !important;
          aspect-ratio: unset !important; border-radius: 5px !important;
          box-shadow: none !important; display: flex !important;
          flex-direction: column !important; align-items: center !important;
          justify-content: center !important; padding: 4px !important;
          overflow: hidden !important;
        }
        .tc-stars  { font-size: 5px !important; margin-bottom: 2px !important; opacity: 0.7 !important; }
        .tc-symbol { font-size: 18px !important; line-height: 1 !important; }
        .tc-name   { font-size: 5.5px !important; text-align: center !important; margin-top: 3px !important; letter-spacing: 0.3px !important; }
        .tc-border-inner { display: none !important; }
        .tc-rev-badge { font-size: 5px !important; margin-top: 2px !important; opacity: 0.8 !important; }
        .tc-keywords { font-size: 6.5px !important; text-align: center !important; margin-top: 3px !important; line-height: 1.3 !important; color: #555 !important; }
        .tarot-overall-theme {
          margin-top: 5px !important; font-size: 8.5px !important;
          padding: 4px 8px !important; line-height: 1.45 !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
        }

        /* Vastu */
        .vastu-detail-panel { flex: 1 !important; min-width: 0 !important; }
        .vastu-detail-hdr { font-size: 8.5px !important; font-weight: 700 !important; letter-spacing: 1px !important; margin-bottom: 6px !important; text-transform: uppercase !important; }
        .vastu-detail-row {
          display: flex !important; gap: 7px !important; align-items: flex-start !important;
          margin-bottom: 5px !important; break-inside: avoid !important;
        }
        .vastu-detail-dot { width: 8px !important; height: 8px !important; border-radius: 50% !important; margin-top: 2px !important; flex-shrink: 0 !important; background: #10b981 !important; }
        .vastu-detail-zone { font-size: 9px !important; font-weight: 700 !important; }
        .vastu-detail-tip  { font-size: 8px !important; color: #555 !important; }
        .vastu-colors-block { margin-top: 6px !important; break-inside: avoid !important; }
        .vastu-colors-hdr  { font-size: 8px !important; font-weight: 600 !important; margin-bottom: 3px !important; }
        .vastu-colors-list { display: flex !important; gap: 3px !important; flex-wrap: wrap !important; }
        .vastu-color-pill  { font-size: 7.5px !important; padding: 1px 6px !important; border-radius: 3px !important; }
        .vastu-energy-note { font-size: 8px !important; margin-top: 5px !important; font-style: italic !important; color: #666 !important; }

        /* ════════════════════════════════════════════════════
           QUESTION PAGES
           Each question starts on a new A4 page.
           Content inside (hw-items, remedy-card) flows freely
           across continuation sheets — individual cards avoid
           internal splits but the section as a whole can span
           as many pages as needed.
        ════════════════════════════════════════════════════ */
        .q-banner {
          display: flex !important; align-items: flex-start !important;
          gap: 10px !important; padding: 0 0 10px !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }
        .q-circle {
          flex-shrink: 0 !important; width: 30px !important; height: 30px !important;
          border-radius: 50% !important; font-size: 12px !important; font-weight: 900 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
        }
        .q-text { font-size: 14px !important; font-weight: 700 !important; line-height: 1.35 !important; }

        .content-block { display: block !important; padding: 0 !important; }
        .block-heading {
          display: block !important;
          font-size: 11px !important; font-weight: 700 !important;
          letter-spacing: 1.5px !important; text-transform: uppercase !important;
          color: #8a6a00 !important;
          margin: 0 0 2px !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }

        /* ── Domain summary groups (print) ── */
        .domain-summary-list {
          display: block !important; margin: 4px 0 0 !important; padding: 0 !important;
        }
        .ds-group {
          display: block !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
          margin-bottom: 10px !important;
          border: 1px solid rgba(0,0,0,0.1) !important;
          border-left-width: 4px !important;
          border-radius: 7px !important;
          overflow: hidden !important;
        }
        /* ── DOMAIN MASTER TEMPLATE — print rules ── */
        .page-domain-master {
          page-break-before: always !important;
          break-before: page !important;
          display: block !important;
          background: #fff !important;
          padding: 0 !important;
          width: 210mm !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .dm-watermark-zone {
          flex: 0 0 auto !important; display: block !important;
          text-align: center !important;
          width: 100% !important; height: auto !important;
          max-height: 140px !important; min-height: 0 !important;
          padding: 16px 0 8px !important;
          pointer-events: none !important; border: none !important;
          outline: none !important; box-shadow: none !important;
          overflow: hidden !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
        }
        .dm-watermark {
          width: 180px !important; max-width: 180px !important;
          height: auto !important; max-height: 120px !important;
          opacity: 0.18 !important;
          object-fit: contain !important; display: inline-block !important;
          border: none !important; outline: none !important; box-shadow: none !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-top-band {
          display: flex !important; align-items: center !important;
          justify-content: space-between !important;
          padding: 10px 18px !important;
          flex-shrink: 0 !important;
          background: #fff !important;
          border-bottom: 2px solid #d4af37 !important;
          break-after: avoid !important; page-break-after: avoid !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          position: relative !important; z-index: 1 !important;
        }
        .dm-top-left { display: flex !important; align-items: center !important; gap: 8px !important; }
        .dm-domain-icon { font-size: 26px !important; line-height: 1 !important; }
        .dm-domain-info { display: flex !important; flex-direction: column !important; gap: 2px !important; }
        .dm-domain-label { font-size: 18px !important; font-weight: 800 !important; color: #d4af37 !important; }
        .dm-domain-traditions { font-size: 11px !important; color: #6b7280 !important; }
        .dm-top-right { display: flex !important; flex-direction: column !important; align-items: flex-end !important; gap: 2px !important; }
        .dm-logo { width: 56px !important; height: auto !important; display: block !important; opacity: 0.9 !important; }
        .dm-user-date { font-size: 10px !important; color: #9ca3af !important; letter-spacing: 0.06em !important; }
        .dm-q-strip {
          display: flex !important; align-items: center !important; gap: 10px !important;
          padding: 11px 18px !important;
          border-left-width: 5px !important; border-left-style: solid !important;
          background: #fafaf8 !important;
          flex-shrink: 0 !important;
          break-after: avoid !important; page-break-after: avoid !important;
          position: relative !important; z-index: 1 !important;
        }
        .dm-q-num {
          flex-shrink: 0 !important; width: 26px !important; height: 26px !important;
          border-radius: 50% !important; color: #fff !important;
          font-size: 12px !important; font-weight: 800 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-q-text { font-size: 15px !important; font-weight: 800 !important; color: #14100c !important; flex: 1 !important; line-height: 1.35 !important; }
        .dm-cont-badge { font-size: 9px !important; padding: 1px 6px !important; border: 1px solid #e5e7eb !important; border-radius: 3px !important; color: #9ca3af !important; }
        .dm-body {
          display: block !important;
          height: auto !important; overflow: visible !important;
          position: relative !important; z-index: 1 !important;
        }
        .dm-findings {
          display: block !important; padding: 14px 20px !important;
          height: auto !important; overflow: visible !important;
        }
        .dm-findings-title {
          font-size: 12px !important; font-weight: 800 !important; letter-spacing: 0.07em !important;
          text-transform: uppercase !important; margin-bottom: 6px !important;
          display: flex !important; align-items: center !important; gap: 8px !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }
        .dm-insight-pill {
          font-size: 10px !important; padding: 2px 8px !important;
          border-radius: 99px !important; font-weight: 700 !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-divider {
          height: 2px !important; border-radius: 1px !important;
          margin-bottom: 12px !important; width: 40px !important; display: block !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-bullets {
          display: flex !important; flex-direction: column !important;
          list-style: none !important; flex: 0 0 auto !important;
          margin: 0 !important; padding: 0 !important; gap: 14px !important;
        }
        .dm-bullet {
          display: flex !important; align-items: flex-start !important; gap: 10px !important;
          margin-bottom: 12px !important;
          break-inside: auto !important; page-break-inside: auto !important;
        }
        .dm-bullet-num {
          flex-shrink: 0 !important; width: 20px !important; height: 20px !important;
          border-radius: 50% !important; color: #fff !important;
          font-size: 10px !important; font-weight: 700 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          margin-top: 2px !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-bullet-text {
          flex: 1 !important; font-size: 13px !important; font-weight: 400 !important;
          color: #1f2937 !important; line-height: 1.8 !important;
          font-family: Georgia, serif !important;
          word-wrap: break-word !important; overflow-wrap: break-word !important;
        }

        /* ── Story paragraph print rules ── */
        .dm-story { display: flex !important; flex-direction: column !important; gap: 12px !important; }
        .dm-story-block {
          border-left-width: 4px !important; border-left-style: solid !important;
          padding: 8px 12px !important; border-radius: 0 5px 5px 0 !important;
          break-inside: avoid !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-story-label {
          font-size: 9px !important; font-weight: 800 !important; letter-spacing: 0.08em !important;
          text-transform: uppercase !important; margin-bottom: 4px !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-story-text {
          margin: 0 !important; font-size: 13px !important; font-weight: 400 !important;
          color: #1f2937 !important; line-height: 1.8 !important; font-family: Georgia, serif !important;
        }

        /* ── Tradition subgroup print rules ── */
        .dm-subgroup { display: block !important; margin-bottom: 16px !important; break-inside: avoid !important; }
        .dm-subgroup-hdr {
          display: flex !important; align-items: center !important; gap: 8px !important;
          border-left-width: 3px !important; border-left-style: solid !important;
          padding-left: 7px !important; margin-bottom: 6px !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-subgroup-num {
          flex-shrink: 0 !important; width: 20px !important; height: 20px !important;
          border-radius: 50% !important; color: #fff !important;
          font-size: 10px !important; font-weight: 800 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-subgroup-label {
          font-size: 11px !important; font-weight: 800 !important; color: #d4af37 !important;
          letter-spacing: 0.05em !important; text-transform: uppercase !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .dm-bullets-sub { padding-left: 6px !important; gap: 10px !important; }
        .dm-bullet-sub { gap: 9px !important; margin-bottom: 8px !important; }
        .dm-bullet-dot {
          flex-shrink: 0 !important; width: 5px !important; height: 5px !important;
          border-radius: 50% !important; margin-top: 6px !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }

        /* Legacy ds-* classes (kept for any remaining references) */
        .ds-bullet::before {
          content: '✦' !important; position: absolute !important; left: 0 !important; top: 3px !important;
          color: #d4af37 !important; font-size: 6px !important;
        }
        .hl-intent { border-radius: 2px !important; padding: 0 2px !important; }

        /* ── hw bullet list — flows across pages, cards stay intact ── */
        .hw-list {
          display: block !important;
          list-style: none !important;
          margin: 6px 0 0 !important; padding: 0 !important;
        }

        /* Each bullet card: never split internally, always gap below */
        .hw-item {
          display: block !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
          margin-bottom: 7px !important; padding: 8px 12px !important;
          background: rgba(212,175,55,0.04) !important;
          border-radius: 7px !important;
          border-left: 3px solid rgba(212,175,55,0.5) !important;
        }

        /* Label row — glued to its content below */
        .hw-label {
          display: block !important;
          font-size: 14px !important; font-weight: 700 !important;
          color: #8a6a00 !important;
          margin-bottom: 6px !important;
          break-after: avoid !important; page-break-after: avoid !important;
        }

        /* WHO/WHAT/WHERE numbered list */
        .hw-sub-list {
          display: block !important;
          list-style: none !important;
          margin: 3px 0 0 !important; padding: 0 !important;
        }
        .hw-sub-item {
          display: flex !important; gap: 9px !important; align-items: flex-start !important;
          font-size: 13px !important; margin-bottom: 6px !important; line-height: 1.6 !important;
          break-inside: avoid !important;
        }
        .hw-sub-num {
          flex-shrink: 0 !important;
          width: 20px !important; height: 20px !important;
          border-radius: 50% !important;
          font-size: 11px !important; font-weight: 700 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          background: rgba(212,175,55,0.18) !important; color: #8a6a00 !important;
        }
        .hw-sub-text { flex: 1 !important; display: block !important; }

        /* WHEN timing block */
        .hw-timing {
          display: block !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
          padding: 3px 0 !important;
        }
        .hw-timing-window {
          display: block !important;
          font-size: 26px !important; font-weight: 900 !important;
          color: #1a1410 !important; line-height: 1.2 !important;
          margin-bottom: 3px !important;
        }
        .hw-timing-peak {
          display: block !important;
          font-size: 14px !important; font-weight: 600 !important;
          color: #c4963b !important; margin-bottom: 3px !important;
        }
        .hw-timing-dur {
          display: block !important;
          font-size: 12px !important; color: #999 !important; margin-top: 2px !important;
        }

        /* HOW redirect */
        .hw-redirect {
          display: block !important;
          font-size: 13px !important; font-style: italic !important;
          color: #8a6a00 !important;
        }
        .hw-answer { display: block !important; font-size: 13px !important; line-height: 1.65 !important; }

        /* ── Remedy card — split allowed between groups ── */
        /* Consolidated remedies page — one A4 page, 2-col grid */
        .remedy-page {
          width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
          overflow: hidden !important;
          display: flex !important; flex-direction: column !important;
          page-break-before: always !important; break-before: page !important;
          page-break-after: avoid !important;
          position: relative !important;
        }
        .remedy-page::after {
          content: '' !important;
          position: absolute !important;
          inset: 0 !important;
          background: url('/rav-logo.png') center center / 70% auto no-repeat !important;
          opacity: 0.12 !important;
          pointer-events: none !important;
          z-index: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .remedy-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 8px !important;
          padding: 12px 24px 6px !important;
          align-content: start !important;
          overflow: hidden !important;
          flex: 0 0 auto !important;
          position: relative !important; z-index: 1 !important;
        }
        .r-card {
          display: block !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
          padding: 8px 11px !important;
          border-radius: 7px !important;
          border: 1px solid rgba(212,175,55,0.22) !important;
          background: rgba(253,248,238,0.6) !important;
        }
        .r-card-hdr {
          display: flex !important;
          padding-bottom: 4px !important; margin-bottom: 3px !important;
          border-bottom: 1px solid rgba(212,175,55,0.18) !important;
        }
        .r-icon { font-size: 18px !important; width: 24px !important; }
        .r-label { font-size: 13px !important; font-weight: 800 !important; }
        .r-list { display: block !important; margin: 0 !important; padding: 0 !important; }
        .r-list li {
          display: block !important;
          font-size: 13px !important; line-height: 1.6 !important;
          padding-left: 14px !important; margin-bottom: 3px !important;
        }
        .r-list li::before { font-size: 9px !important; top: 4px !important; }
        .r-sub { font-size: 12px !important; }
        .r-color-row { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
        .r-color-chip { display: flex !important; align-items: center !important; gap: 5px !important; }
        .r-swatch { width: 16px !important; height: 16px !important; border-radius: 50% !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .r-color-name { font-size: 13px !important; }
        .remedy-clean-page {
          width: 210mm !important; height: 297mm !important;
          min-height: 297mm !important; max-height: 297mm !important;
          overflow: hidden !important;
          display: flex !important; flex-direction: column !important;
          page-break-before: always !important; break-before: page !important;
          page-break-after: avoid !important;
          position: relative !important;
        }
        .remedy-clean-body {
          flex: 1 !important; padding: 20px 36px 16px !important;
          overflow: hidden !important; position: relative !important; z-index: 1 !important;
        }
        .remedy-clean-list {
          list-style: none !important; margin: 0 !important; padding: 0 !important;
          display: flex !important; flex-direction: column !important; gap: 10px !important;
        }
        .remedy-clean-item {
          display: flex !important; align-items: flex-start !important; gap: 14px !important;
          padding: 11px 16px !important; border-radius: 10px !important;
          background: rgba(253,248,238,0.8) !important;
          border: 1px solid rgba(212,175,55,0.20) !important;
          break-inside: avoid !important; page-break-inside: avoid !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .remedy-clean-icon { font-size: 16px !important; flex-shrink: 0 !important; width: 24px !important; }
        .remedy-clean-cat {
          display: block !important; font-size: 9px !important; font-weight: 800 !important;
          letter-spacing: 0.08em !important; text-transform: uppercase !important; color: #92400e !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .remedy-clean-text { display: block !important; font-size: 13px !important; color: #374151 !important; line-height: 1.6 !important; }

        .narrative-para { font-size: 15px !important; line-height: 1.75 !important; }

        /* ════════════════════════════════════════════════════
           CLOSING PAGE — full A4, dark, premium ending
           .closing-page IS the .pdf-page, so override padding to 0
           and set exact A4 dimensions for full edge-to-edge coverage.
        ════════════════════════════════════════════════════ */
        .closing-page {
          background: #14100c !important;
          width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          page-break-before: always !important;
          break-before: page !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        .closing-body {
          flex: 1 !important;
          display: flex !important; flex-direction: column !important;
          align-items: center !important; justify-content: center !important;
          padding: 48px 48px 32px !important; text-align: center !important;
        }
        .closing-photo {
          width: 88px !important; height: 88px !important;
          border-radius: 50% !important; object-fit: cover !important;
          object-position: center top !important;
          border: 2px solid rgba(212,175,55,0.4) !important;
          display: block !important; margin-bottom: 20px !important;
        }
        .closing-name { font-size: 36px !important; font-weight: 800 !important; color: #fff !important; margin: 0 0 16px !important; line-height: 1.2 !important; }
        .gold-line-center { width: 48px !important; height: 3px !important; background: #d4af37 !important; margin: 0 auto 20px !important; border-radius: 1px !important; }
        .closing-text {
          font-size: 16px !important; color: rgba(255,255,255,0.55) !important;
          max-width: 420px !important; line-height: 1.8 !important; margin: 0 0 14px !important;
        }
        .closing-seal { font-size: 42px !important; color: #d4af37 !important; margin: 20px 0 0 !important; }
        .closing-contact-row {
          display: flex !important; align-items: center !important; flex-wrap: wrap !important;
          justify-content: center !important; gap: 6px !important; margin-top: 16px !important;
        }
        .closing-contact-link {
          display: inline-flex !important; align-items: center !important; gap: 4px !important;
          font-size: 10px !important; color: rgba(255,255,255,0.4) !important;
          text-decoration: none !important; white-space: nowrap !important;
        }
        .closing-contact-cta { color: #d4af37 !important; font-weight: 700 !important; }
        .closing-contact-sep { color: rgba(255,255,255,0.15) !important; font-size: 10px !important; }
        .closing-footer {
          flex-shrink: 0 !important;
          display: flex !important; align-items: center !important;
          justify-content: center !important; gap: 14px !important;
          padding: 16px 0 22px !important;
          border-top: 1px solid rgba(255,255,255,0.07) !important;
          font-size: 12px !important; color: rgba(255,255,255,0.25) !important;
          letter-spacing: 0.07em !important;
        }
        .closing-footer-logo {
          width: 48px !important; height: auto !important;
          border-radius: 0 !important; object-fit: contain !important;
          background: transparent !important; display: block !important;
        }

        /* Hide UI footer — not part of PDF */
        app-footer, .site-footer { display: none !important; }

        /* Profile page watermark */
        .profile-watermark-zone {
          flex: 0 0 auto !important; display: block !important;
          text-align: center !important;
          width: 100% !important; height: auto !important;
          max-height: 160px !important; min-height: 0 !important;
          padding: 20px 0 10px !important;
          overflow: hidden !important;
        }
        .profile-watermark {
          width: 180px !important; max-width: 180px !important;
          height: auto !important; max-height: 140px !important;
          opacity: 0.06 !important; filter: grayscale(1) !important;
          object-fit: contain !important; display: inline-block !important;
        }

        /* ════════════════════════════════════════════════════
           SHARED
        ════════════════════════════════════════════════════ */
        .gold-line {
          display: block !important;
          width: 36px !important; height: 2px !important;
          background: #d4af37 !important;
          border-radius: 1px !important;
          margin: 3px 0 8px !important;
          break-after: avoid !important;
        }
      }
    `;
    document.head.appendChild(style);

    await chakraTimer;
    this.chakraSpinning.set(false);

    window.print();

    // 3. Restore
    document.head.removeChild(style);
    Array.from(imgs).forEach((img, i) => { img.src = origSrcs[i]; });
  }

  goBack() {
    if (this.auth.isAdmin()) {
      this.router.navigate(['/review']);
    } else {
      this.router.navigate(['/']);
    }
  }

  goHome() {
    this.router.navigate(['/']);
  }
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
