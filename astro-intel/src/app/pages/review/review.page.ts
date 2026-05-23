import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ApiService, LanguageOption } from '../../services/api.service';
import { AdminInsight, AdminQuestion, InsightDetail } from '../../models/astro.models';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AppFooterComponent } from '../../components/shared/app-footer.component';
import { environment } from '../../../environments/environment';

const BACKEND = environment.apiUrl;

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, FormsModule, KeyValuePipe, AppFooterComponent],
  template: `
<div class="shell">

@if (chakraSpinning()) {
  <div class="chakra-spin-portal" aria-hidden="true">
    <div class="chakra-spin-circle">
      <img src="rav-logo.png" class="chakra-spin-img" alt=""/>
    </div>
  </div>
}

  <!-- ══ Header ════════════════════════════════════════════════════════════ -->
  <header class="hdr">
    <div class="hdr-left">
      <button class="icon-btn" (click)="goBack()" title="Back">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="brand">
        <span class="brand-mark">✦</span>
        <span class="brand-name">Aura with Rav</span>
        <span class="brand-sep">·</span>
        <span class="brand-page">Admin Review</span>
      </div>
      @if (userName()) {
        <span class="user-chip">{{ userName() }}</span>
      }
      @if (leadId()) {
        <span class="lead-chip">📋 Expert Reading for Client</span>
      }
    </div>

    <div class="hdr-right">
      <button class="hdr-nav-btn hdr-home-btn" (click)="router.navigate(['/'])" title="Home">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L6.5 2l5 4.5M2.5 6v5h2.5V8h3v3h2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Home
      </button>
      @if (auth.isAdmin()) {
        <button class="hdr-nav-btn" (click)="router.navigate(['/admin/users'])" title="Leads & Users">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 6a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0zM2 11.5c0-2 2-3.5 4.5-3.5s4.5 1.5 4.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          Leads
        </button>
        <button class="hdr-nav-btn" (click)="router.navigate(['/metrics'])" title="Metrics">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 10.5l3-4 3 2.5 3.5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Metrics
        </button>
      }
      <div class="progress-pill">
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="approvalPct()"></div>
        </div>
        <span class="progress-label">{{ approvedCount() }}/{{ totalInsightCount() }}</span>
      </div>
      @if (auth.isAdmin()) {
        <button class="btn-outline-green" (click)="approveAll()">Approve All</button>
      }
      @if (!reportGenerated()) {
        @if (generateError()) {
          <span class="generate-err">⚠ {{ generateError() }}</span>
        }
        <button class="btn-primary" [disabled]="(!auth.isAdmin() && approvedCount() === 0) || generating()" (click)="generate()"
                [title]="approvedCount() === 0 && auth.isAdmin() ? 'Approve at least one insight first' : ''">
          @if (generating()) {
            <span class="btn-spinner"></span> Generating…
          } @else {
            Generate Report
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 2l5 4.5L4 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          }
        </button>
      } @else {
        <button class="btn-primary" (click)="finalizeReport()">
          View Report
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 2l5 4.5L4 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      }
    </div>
  </header>

  <!-- ══ Session info ═══════════════════════════════════════════════════════ -->
  @if (orch.sessionId() || orch.backendMode() === 'local') {
    <div class="session-bar">
      @if (orch.sessionId()) {
        <span class="sb-item">
          <span class="sb-dot sb-dot-green"></span>
          Session <code>{{ orch.sessionId().slice(0,8) }}…</code>
        </span>
        <span class="sb-sep">·</span>
        <span class="sb-item">Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong></span>
        <span class="sb-sep">·</span>
        <span class="sb-item">{{ questionBlocks().length }} question{{ questionBlocks().length !== 1 ? 's' : '' }}</span>
        <span class="sb-sep">·</span>
        <span class="sb-brand">360° Multi-agent Pipeline</span>
      } @else {
        <span class="sb-dot sb-dot-amber"></span>
        <span class="sb-amber">Local mode — backend offline</span>
      }
    </div>
  }

  <!-- ══ Tab bar ════════════════════════════════════════════════════════════ -->
  <nav class="tabs">
    <button class="tab" [class.tab-on]="activeTab()==='review'" (click)="activeTab.set('review')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M4 5h5M4 8h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      Review
    </button>
    <button class="tab" [class.tab-on]="activeTab()==='translate'"
            [class.tab-locked]="!reportGenerated()"
            (click)="reportGenerated() && activeTab.set('translate')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M6.5 1.5C6.5 1.5 4.5 3.8 4.5 6.5s2 5 2 5M6.5 1.5C6.5 1.5 8.5 3.8 8.5 6.5s-2 5-2 5M1.5 6.5h10" stroke="currentColor" stroke-width="1.3"/>
      </svg>
      Translation
      @if (!reportGenerated()) {
        <span class="tab-lock-icon">🔒</span>
      } @else if (translatedSections().length) {
        <span class="tab-count tab-count-purple">{{ translationApprovedCount() }}/{{ translatedSections().length }}</span>
      }
    </button>
    <button class="tab" [class.tab-on]="activeTab()==='raw'" (click)="activeTab.set('raw')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 4l-2 2.5 2 2.5M10 4l2 2.5-2 2.5M7 2l-1 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Raw JSON
    </button>
    <button class="tab" [class.tab-on]="activeTab()==='log'" (click)="activeTab.set('log')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 3.5h10M1.5 6.5h7M1.5 9.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      Agent Log
      @if (orch.agentLog().length) {
        <span class="tab-count">{{ orch.agentLog().length }}</span>
      }
    </button>
    <button class="tab" [class.tab-on]="activeTab()==='astrology'" (click)="activeTab.set('astrology')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M6.5 2v1M6.5 10v1M2 6.5h1M10 6.5h1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      Astrology
    </button>
  </nav>

  <!-- ══ REVIEW TAB ═════════════════════════════════════════════════════════ -->
  @if (activeTab() === 'review') {
    <div class="body">

      @if (!questionBlocks().length) {
        <div class="empty">
          <div class="empty-icon">✦</div>
          <p class="empty-title">No analysis yet</p>
          <p class="empty-sub">Run the analysis from the intake form first.</p>
          <button class="btn-outline" (click)="goBack()">← Go to Analysis</button>
        </div>
      }

      @if (domainGroups().length && approvedCount() === 0 && !reportGenerated()) {
        <div class="approve-hint">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#d4af37" stroke-width="1.4"/><path d="M7 4.5v3M7 9.5v.5" stroke="#d4af37" stroke-width="1.6" stroke-linecap="round"/></svg>
          Select findings from each tradition below, then edit or approve your selections before generating the report.
        </div>
      }

      @for (qBlock of questionBlocks(); track qBlock.question; let qi = $index) {
        <div class="q-card">

          <!-- Question header -->
          <div class="q-hdr">
            <div class="q-num-circle">Q{{ qi + 1 }}</div>
            <div class="q-info">
              <div class="q-text">{{ qBlock.question }}</div>
              <div class="q-meta">
                <span class="intent-tag">{{ qBlock.intent | titlecase }}</span>
                <span class="q-stat">{{ approvedInBlock(qBlock) }} approved</span>
              </div>
            </div>
          </div>

          <!-- Domain-grouped branch findings -->
          @for (domainGroup of domainGroupsForQuestion(qBlock.question, qi); track domainGroup.domain) {
            <div class="domain-section">
              <div class="domain-section-hdr">
                <span class="domain-icon">{{ domainGroup.icon }}</span>
                <span class="domain-label">{{ domainGroup.domainLabel }}</span>
                <span class="branch-count">{{ domainGroup.branches.length }} tradition{{ domainGroup.branches.length !== 1 ? 's' : '' }}</span>
              </div>

              <div class="branch-grid">
                @for (branch of domainGroup.branches; track branch.branchKey) {
                  <div class="branch-card"
                       [class.branch-selected]="selectedBranchIds().has(branch.insightId)"
                       [class.branch-approved]="approvedIds().has(branch.insightId)"
                       [class.branch-rejected]="rejectedIds().has(branch.insightId)">

                    <!-- Branch header: name + priority + select toggle -->
                    <div class="branch-hdr">
                      <div class="branch-hdr-left">
                        <span class="branch-name">{{ branch.branchLabel }}</span>
                        <span class="branch-priority"
                              [class.priority-h]="branch.confidence==='high'"
                              [class.priority-m]="branch.confidence==='medium'"
                              [class.priority-l]="branch.confidence==='low'">
                          {{ branch.confidence | uppercase }} priority
                        </span>
                      </div>
                      @if (auth.isAdmin()) {
                        <button class="branch-select-btn"
                                [class.branch-select-on]="selectedBranchIds().has(branch.insightId)"
                                (click)="toggleBranchSelect(branch.insightId, qBlock, branch)">
                          @if (selectedBranchIds().has(branch.insightId)) {
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            Selected
                          } @else {
                            + Select
                          }
                        </button>
                      }
                    </div>

                    <!-- Finding text -->
                    @if (editingId() === branch.insightId) {
                      <textarea class="ins-editor"
                        [value]="branch.content"
                        (input)="onEdit(branch.insightId, $event)"
                        rows="4"></textarea>
                    } @else {
                      <p class="branch-text">{{ branch.content }}</p>
                    }

                    <!-- Domain-specific structured detail panel -->
                    @if (branch.detail && hasDetail(branch.detail)) {

                      <!-- NUMEROLOGY: core numbers + lucky -->
                      @if (domainGroup.domain === 'numerology') {
                        <div class="detail-panel">
                          @if (branch.detail.core_numbers) {
                            <div class="detail-section">
                              <div class="detail-section-title">Core Numbers</div>
                              <div class="detail-chips-row">
                                @for (entry of objectEntries(branch.detail.core_numbers); track entry[0]) {
                                  @if (entry[1] !== null) {
                                    <div class="detail-num-chip">
                                      <span class="chip-label">{{ entry[0] }}</span>
                                      <span class="chip-val">{{ entry[1] }}</span>
                                    </div>
                                  }
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.lucky_numbers?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Lucky Numbers</div>
                              <div class="detail-chips-row">
                                @for (n of branch.detail.lucky_numbers!; track n) {
                                  <span class="lucky-num">{{ n }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.lucky_colors?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Lucky Colors</div>
                              <div class="detail-chips-row">
                                @for (c of branch.detail.lucky_colors!; track c) {
                                  <span class="lucky-color-chip">{{ c }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.traits?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Traits</div>
                              <div class="detail-chips-row">
                                @for (t of branch.detail.traits!; track t) {
                                  <span class="trait-chip">{{ t }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.strengths?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Strengths</div>
                              <div class="detail-bullets">
                                @for (s of branch.detail.strengths!; track s) {
                                  <span class="detail-bullet detail-bullet-green">{{ s }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.weaknesses?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Watch Out</div>
                              <div class="detail-bullets">
                                @for (w of branch.detail.weaknesses!; track w) {
                                  <span class="detail-bullet detail-bullet-amber">{{ w }}</span>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <!-- PALMISTRY: lines, notes -->
                      @if (domainGroup.domain === 'palmistry') {
                        <div class="detail-panel">
                          @if (branch.detail.focus_insight) {
                            <div class="detail-section">
                              <div class="detail-focus-insight">✦ {{ branch.detail.focus_insight }}</div>
                            </div>
                          }
                          @if (branch.detail.lines && objectKeys(branch.detail.lines).length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Hand Lines</div>
                              <div class="detail-line-list">
                                @for (entry of objectEntries(branch.detail.lines); track entry[0]) {
                                  <div class="detail-line-row">
                                    <span class="detail-line-key">{{ entry[0] | titlecase }}</span>
                                    <span class="detail-line-val">{{ entry[1] }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.career_notes?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Career Indicators</div>
                              <div class="detail-bullets">
                                @for (n of branch.detail.career_notes!; track n) {
                                  <span class="detail-bullet detail-bullet-blue">{{ n }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.health_notes?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Health Notes</div>
                              <div class="detail-bullets">
                                @for (n of branch.detail.health_notes!; track n) {
                                  <span class="detail-bullet detail-bullet-green">{{ n }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.relationship_notes?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Relationship Notes</div>
                              <div class="detail-bullets">
                                @for (n of branch.detail.relationship_notes!; track n) {
                                  <span class="detail-bullet detail-bullet-purple">{{ n }}</span>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <!-- TAROT: cards + guidance -->
                      @if (domainGroup.domain === 'tarot') {
                        <div class="detail-panel">
                          @if (branch.detail.overall_theme) {
                            <div class="detail-section">
                              <div class="detail-focus-insight">✦ {{ branch.detail.overall_theme }}</div>
                            </div>
                          }
                          @if (branch.detail.cards?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Cards Drawn ({{ branch.detail.spread }})</div>
                              <div class="tarot-cards-row">
                                @for (card of branch.detail.cards!; track card.name) {
                                  <div class="tarot-card-chip" [class.reversed]="card.orientation==='reversed'">
                                    <div class="tc-position">{{ card.position }}</div>
                                    <div class="tc-name">{{ card.name }}</div>
                                    <div class="tc-orient" [class.tc-reversed]="card.orientation==='reversed'">{{ card.orientation }}</div>
                                    <div class="tc-meaning">{{ card.meaning }}</div>
                                    <div class="tc-keywords">
                                      @for (kw of card.keywords; track kw) {
                                        <span class="tc-kw">{{ kw }}</span>
                                      }
                                    </div>
                                  </div>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <!-- VASTU: zones, corrections, colors -->
                      @if (domainGroup.domain === 'vastu') {
                        <div class="detail-panel">
                          @if (branch.detail.overall_energy) {
                            <div class="detail-section">
                              <div class="detail-focus-insight">✦ {{ branch.detail.overall_energy }}</div>
                            </div>
                          }
                          @if (branch.detail.priority_zones?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Priority Zones</div>
                              <div class="detail-bullets">
                                @for (z of branch.detail.priority_zones!; track z) {
                                  <span class="detail-bullet detail-bullet-amber">{{ z }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.corrections?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Corrections / Remedies</div>
                              <div class="detail-bullets">
                                @for (c of branch.detail.corrections!; track c) {
                                  <span class="detail-bullet detail-bullet-green">{{ c }}</span>
                                }
                              </div>
                            </div>
                          }
                          @if (branch.detail.colors_recommended?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Recommended Colors</div>
                              <div class="detail-chips-row">
                                @for (c of branch.detail.colors_recommended!; track c) {
                                  <span class="lucky-color-chip">{{ c }}</span>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <!-- ASTROLOGY: full structured data -->
                      @if (domainGroup.domain === 'astrology') {
                        <div class="detail-panel">

                          @if (branch.detail.current_dasha) {
                            <div class="detail-section">
                              <div class="detail-focus-insight">✦ Current Dasha: {{ branch.detail.current_dasha }}{{ branch.detail.dasha_planet ? ' (Lord: ' + branch.detail.dasha_planet + ')' : '' }}</div>
                            </div>
                          }

                          @if (branch.detail.predictions?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Predictions</div>
                              <div class="detail-bullets">
                                @for (p of branch.detail.predictions!; track p) {
                                  <span class="detail-bullet detail-bullet-blue">{{ p }}</span>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.strengths?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Indicated Strengths</div>
                              <div class="detail-bullets">
                                @for (s of branch.detail.strengths!; track s) {
                                  <span class="detail-bullet detail-bullet-green">{{ s }}</span>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.challenges?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Challenges</div>
                              <div class="detail-bullets">
                                @for (c of branch.detail.challenges!; track c) {
                                  <span class="detail-bullet detail-bullet-amber">{{ c }}</span>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.doshas?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Doshas / Cautions</div>
                              <div class="detail-bullets">
                                @for (d of branch.detail.doshas!; track d) {
                                  <span class="detail-bullet detail-bullet-amber">{{ d }}</span>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.yogas_rich?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Active Yogas</div>
                              <div class="detail-line-list">
                                @for (y of branch.detail.yogas_rich!; track y.name) {
                                  <div class="detail-line-row">
                                    <span class="detail-line-key">{{ y.name }}</span>
                                    <span class="detail-line-val">{{ y.description }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }
                          @else if (branch.detail.yogas?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Active Yogas</div>
                              <div class="detail-chips-row">
                                @for (y of branch.detail.yogas!; track y) {
                                  <span class="trait-chip">{{ y }}</span>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.dasha_periods?.length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Dasha Timeline</div>
                              <div class="detail-line-list">
                                @for (dp of branch.detail.dasha_periods!; track dp.planet) {
                                  <div class="detail-line-row">
                                    <span class="detail-line-key">{{ dp.planet }} ({{ dp.duration }})</span>
                                    <span class="detail-line-val">{{ dp.from }} → {{ dp.to }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.house_analysis && objectKeys(branch.detail.house_analysis).length) {
                            <div class="detail-section">
                              <div class="detail-section-title">House Analysis</div>
                              <div class="detail-line-list">
                                @for (entry of objectEntries(branch.detail.house_analysis); track entry[0]) {
                                  <div class="detail-line-row">
                                    <span class="detail-line-key house-key">{{ entry[0] }}</span>
                                    <span class="detail-line-val">{{ entry[1] }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.planetary_positions && objectKeys(branch.detail.planetary_positions).length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Planetary Positions</div>
                              <div class="detail-chips-row">
                                @for (entry of objectEntries(branch.detail.planetary_positions); track entry[0]) {
                                  <div class="detail-num-chip">
                                    <span class="chip-label">{{ entry[0] }}</span>
                                    <span class="chip-val">{{ entry[1] }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                          @if (branch.detail.cusp_analysis && objectKeys(branch.detail.cusp_analysis).length) {
                            <div class="detail-section">
                              <div class="detail-section-title">Cusp Analysis (KP)</div>
                              <div class="detail-line-list">
                                @for (entry of objectEntries(branch.detail.cusp_analysis); track entry[0]) {
                                  <div class="detail-line-row">
                                    <span class="detail-line-key">{{ entry[0] }}</span>
                                    <span class="detail-line-val">{{ entry[1] }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                        </div>
                      }

                    }

                    <!-- Actions — only shown when selected -->
                    @if (selectedBranchIds().has(branch.insightId)) {
                      <div class="branch-actions">
                        @if (auth.isAdmin()) {
                          <button class="act-btn act-edit" (click)="toggleEdit(branch.insightId)">
                            {{ editingId() === branch.insightId ? '✓ Save' : 'Edit' }}
                          </button>
                          <button class="act-btn act-reject"
                                  [class.act-reject-on]="rejectedIds().has(branch.insightId)"
                                  (click)="toggleReject(branch.insightId)">Reject</button>
                          <button class="act-btn act-approve"
                                  [class.act-approve-on]="approvedIds().has(branch.insightId)"
                                  (click)="toggleApprove(branch.insightId)">
                            @if (approvedIds().has(branch.insightId)) {
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            }
                            Approve
                          </button>
                        }
                        @if (branch.edited) {
                          <span class="edited-tag">Edited</span>
                        }
                      </div>
                    }

                  </div>
                }
              </div>

            </div>
          }

        </div>
      }

      <!-- ── RAG Remedies — from numerology books ─────────────────────────── -->
      <div class="q-card">
        <div class="q-hdr">
          <div class="q-num-circle" style="background: linear-gradient(135deg,#d4af37,#b8962e)">📖</div>
          <div class="q-info">
            <div class="q-text">Remedies from Books</div>
            <div class="q-meta">
              <span class="intent-tag" style="background:rgba(212,175,55,0.1);color:#92600a;border-color:rgba(212,175,55,0.3)">RAG · Numerology Library</span>
              <span class="q-stat">{{ ragRemedies().length }} remedies</span>
            </div>
          </div>
          @if (ragRemediesLoading()) {
            <span style="margin-left:auto;font-size:12px;color:#92600a">Loading from books…</span>
          }
        </div>

        @if (ragRemedies().length) {
          <div class="domain-section">
            <div class="domain-section-hdr">
              <span class="domain-icon">🌿</span>
              <span class="domain-label">Numerology Remedies</span>
              <span class="branch-count">{{ ragRemedies().length }} remedies</span>
            </div>
            <div class="branch-grid">
              @for (rem of ragRemedies(); track rem.id) {
                <div class="branch-card"
                     [class.branch-selected]="selectedBranchIds().has(rem.id)"
                     [class.branch-approved]="approvedIds().has(rem.id)"
                     [class.branch-rejected]="rejectedIds().has(rem.id)">

                  <div class="branch-hdr">
                    <div class="branch-hdr-left">
                      <span class="branch-name">{{ rem.icon }} {{ rem.category }}</span>
                      <span class="branch-priority priority-m">RAG</span>
                    </div>
                    @if (auth.isAdmin()) {
                      <button class="branch-select-btn"
                              [class.branch-select-on]="selectedBranchIds().has(rem.id)"
                              (click)="toggleBranchSelect(rem.id, null, null)">
                        @if (selectedBranchIds().has(rem.id)) {
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          Selected
                        } @else {
                          + Select
                        }
                      </button>
                    }
                  </div>

                  @if (editingId() === rem.id) {
                    <textarea class="ins-editor"
                      [value]="getRemedyContent(rem.id, rem.text)"
                      (input)="onRemedyEdit(rem.id, $event)"
                      rows="3"></textarea>
                  } @else {
                    <p class="branch-text">{{ getRemedyContent(rem.id, rem.text) }}</p>
                  }

                  @if (selectedBranchIds().has(rem.id)) {
                    <div class="branch-actions">
                      @if (auth.isAdmin()) {
                        <button class="act-btn act-edit" (click)="toggleEdit(rem.id)">
                          {{ editingId() === rem.id ? '✓ Save' : 'Edit' }}
                        </button>
                        <button class="act-btn act-reject"
                                [class.act-reject-on]="rejectedIds().has(rem.id)"
                                (click)="toggleReject(rem.id)">Reject</button>
                        <button class="act-btn act-approve"
                                [class.act-approve-on]="approvedIds().has(rem.id)"
                                (click)="toggleApprove(rem.id)">
                          @if (approvedIds().has(rem.id)) {
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          }
                          Approve
                        </button>
                      }
                    </div>
                  }

                </div>
              }
            </div>
          </div>
        } @else if (!ragRemediesLoading()) {
          <p class="branch-text" style="padding:16px 20px;color:#6b7280">
            Remedies will auto-load from your numerology book library once the analysis is complete.
          </p>
        }
      </div>

    </div>
  }

  <!-- ══ TRANSLATION TAB ════════════════════════════════════════════════════ -->
  @if (activeTab() === 'translate') {
    <div class="body">

      <!-- Translation control bar -->
      <div class="trans-ctrl-bar">
        <div class="trans-ctrl-left">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" class="trans-globe">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          <span class="trans-ctrl-label">Translate report to:</span>
          <select class="lang-select-ctrl" [(ngModel)]="selectedTranslateLang" [disabled]="translating()">
            @for (lang of languages(); track lang.code) {
              @if (lang.code !== 'en') {
                <option [value]="lang.code">{{ lang.native }} · {{ lang.name }}</option>
              }
            }
          </select>
        </div>
        <div class="trans-ctrl-right">
          @if (translatedSections().length && !translating()) {
            <span class="trans-status-ok">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l3.5 3.5 5.5-6" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Translated · {{ translationApprovedCount() }}/{{ translatedSections().length }} approved
            </span>
          }
          <button class="btn-translate"
                  [disabled]="translating()"
                  (click)="doTranslate()">
            @if (translating()) {
              <span class="btn-spinner"></span> Translating…
            } @else {
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" stroke-width="1.3"/></svg>
              {{ translatedSections().length ? 'Re-translate' : 'Translate Now' }}
            }
          </button>
          @if (translatedSections().length) {
            <button class="btn-finalize" (click)="finalizeWithTranslation()">
              Finalize & View Report
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 2l5 4.5L4 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          }
        </div>
      </div>

      <!-- Translation error -->
      @if (translateError()) {
        <div class="trans-error-bar">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          {{ translateError() }}
          <button class="err-dismiss" (click)="translateError.set('')">×</button>
        </div>
      }

      <!-- Translation loading state -->
      @if (translating()) {
        <div class="trans-loading-card">
          <div class="trans-loading-ring"></div>
          <div class="trans-loading-text">
            <strong>Translation Agent is working…</strong>
            <span>Translating to {{ pendingLangName() }} — preserving tone, structure, and spiritual register across all 22 Indian Constitutional languages.</span>
          </div>
        </div>
      }

      <!-- Translated sections -->
      @if (!translating() && translatedSections().length) {
        <div class="trans-intro-banner">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#8b5cf6" stroke-width="1.4"/><path d="M7 4v3.5l2.5 1.5" stroke="#8b5cf6" stroke-width="1.4" stroke-linecap="round"/></svg>
          Review each translated section below. You can edit or reject any mistranslation before finalizing.
        </div>

        @for (section of translatedSections(); track section.question; let si = $index) {
          <div class="q-card">

            <div class="q-hdr q-hdr-purple">
              <div class="q-num-circle q-num-purple">Q{{ si + 1 }}</div>
              <div class="q-info">
                <div class="q-text">{{ section.question }}</div>
                <div class="q-meta">
                  <span class="intent-tag intent-tag-purple">{{ currentLangNative() }}</span>
                  <span class="q-stat q-stat-purple">{{ transSectionApprovedCount(si) }}/{{ section.insights.length }} approved</span>
                </div>
              </div>
            </div>

            <div class="insights">
              @for (ins of section.insights; track ins.id; let ii = $index) {
                <div class="insight"
                     [class.insight-on]="transApprovedIds().has(ins.id)"
                     [class.insight-off]="transRejectedIds().has(ins.id)">

                  <div class="insight-top">
                    <div class="insight-tags">
                      <span class="conf conf-m">TRANSLATED</span>
                      @for (d of ins.domains; track d) {
                        <span class="domain-tag">{{ d }}</span>
                      }
                      <span class="ins-id">{{ ins.id }}</span>
                    </div>
                    <div class="insight-actions">
                      <button class="act-btn act-edit" (click)="toggleTransEdit(ins.id)">
                        {{ transEditingId() === ins.id ? '✓ Save' : 'Edit' }}
                      </button>
                      <button class="act-btn act-reject"
                              [class.act-reject-on]="transRejectedIds().has(ins.id)"
                              (click)="toggleTransReject(ins.id)">Reject</button>
                      <button class="act-btn act-approve"
                              [class.act-approve-on]="transApprovedIds().has(ins.id)"
                              (click)="toggleTransApprove(ins.id)">
                        @if (transApprovedIds().has(ins.id)) {
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        }
                        Approve
                      </button>
                    </div>
                  </div>

                  @if (transEditingId() === ins.id) {
                    <textarea class="ins-editor"
                      [value]="ins.content"
                      (input)="onTransEdit(si, ii, $event)"
                      rows="4"></textarea>
                  } @else {
                    <p class="ins-text ins-text-native">{{ ins.content }}</p>
                  }

                </div>
              }
            </div>

          </div>
        }

      } @else if (!translating() && !translatedSections().length) {
        <div class="trans-empty">
          <svg width="40" height="40" viewBox="0 0 14 14" fill="none" class="trans-empty-icon">
            <circle cx="7" cy="7" r="5.5" stroke="#d4af37" stroke-width="1.3"/>
            <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="#d4af37" stroke-width="1.3"/>
          </svg>
          <p class="trans-empty-title">No translation yet</p>
          <p class="trans-empty-sub">Select a language above and click "Translate Now" to begin. The Translation Agent will preserve tone, meaning, and spiritual register.</p>
        </div>
      }

    </div>
  }

  <!-- ══ ASTROLOGY TAB ════════════════════════════════════════════════════════ -->
  @if (activeTab() === 'astrology') {
    <div class="body">

      @if (!astroRaw()?.vedic) {
        <div class="empty">
          <div class="empty-icon">★</div>
          <p class="empty-title">No astrology data</p>
          <p class="empty-sub">Run the analysis with the Astrology module enabled first.</p>
        </div>
      } @else {

        <!-- ── Module Methodology card ──────────────────────────────────── -->
        @if (moduleMethodology() | keyvalue; as entries) {
          @if (entries.length) {
            <div class="method-card">
              <div class="method-card-hdr">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.4"/><path d="M4 5h6M4 7.5h4M4 10h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                Analysis Methodology — Branches Used
              </div>
              <div class="method-modules">
                @for (entry of entries; track entry.key) {
                  <div class="method-module">
                    <div class="mm-header">
                      <span class="mm-icon">{{ entry.value.icon }}</span>
                      <span class="mm-label">{{ entry.value.label }}</span>
                    </div>
                    <div class="mm-branches">
                      @for (branch of entry.value.branches; track branch) {
                        <span class="mm-branch">{{ branch }}</span>
                      }
                    </div>
                    @if (entry.value.ayanamsa) {
                      <div class="mm-detail">Ayanamsa: <strong>{{ entry.value.ayanamsa }}</strong></div>
                    }
                    @if (entry.value.engine) {
                      <div class="mm-detail">Engine: {{ entry.value.engine }}</div>
                    }
                    <div class="mm-desc">{{ entry.value.description }}</div>
                  </div>
                }
              </div>
            </div>
          }
        }

        <!-- ── Astrology Basis card ───────────────────────────────────────── -->
        <div class="astro-basis-card">
          <div class="astro-basis-hdr">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#d4af37" stroke-width="1.4"/><path d="M7 4.5v3M7 9.5v.5" stroke="#d4af37" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span>Chart Computation Basis</span>
          </div>
          <div class="astro-basis-grid">
            <div class="basis-row">
              <span class="basis-label">System</span>
              <span class="basis-val">Vedic Jyotish (Indian Sidereal)</span>
            </div>
            <div class="basis-row">
              <span class="basis-label">Ayanamsa</span>
              <span class="basis-val basis-highlight">{{ ayanamsaLabel() }} — Chitra Paksha (Lahiri)</span>
            </div>
            <div class="basis-row">
              <span class="basis-label">Engine</span>
              <span class="basis-val">VSOP87-simplified (Sun) + ELP2000-simplified (Moon), ~0.3° accuracy</span>
            </div>
            <div class="basis-row">
              <span class="basis-label">Birth Time</span>
              <span class="basis-val" [class.basis-warn]="isApproxChart()">
                {{ isApproxChart() ? '⚠ Not provided — Lagna is approximate (noon assumed)' : '✓ Provided by client — used as-is' }}
              </span>
            </div>
            <div class="basis-row">
              <span class="basis-label">Coordinates</span>
              <span class="basis-val">{{ coordSource() }}</span>
            </div>
            <div class="basis-row">
              <span class="basis-label">Sun Sign Note</span>
              <span class="basis-val basis-note">Vedic sidereal Sun is ≈23° earlier than Western tropical — a client born in Oct (tropical Libra) may have Vedic Virgo Sun. This is correct.</span>
            </div>
          </div>
        </div>

        <!-- ── Planetary positions table ────────────────────────────────── -->
        <div class="astro-section-card">
          <div class="astro-section-hdr">Planetary Positions (Sidereal / Lahiri)</div>
          <div class="astro-planet-table">
            <div class="apt-row apt-head">
              <span>Planet</span><span>Rashi (Sign)</span><span>Longitude</span><span>Nakshatra</span>
            </div>
            @for (row of planetRows(); track row.planet) {
              <div class="apt-row" [class.apt-lagna]="row.planet === 'Lagna'">
                <span class="apt-planet">
                  <span class="apt-sym" [style.color]="planetColor(row.planet)">{{ planetSymbol(row.planet) }}</span>
                  {{ row.planet }}
                </span>
                <span class="apt-rashi">{{ row.rashi }}</span>
                <span class="apt-lon">{{ row.longitude }}</span>
                <span class="apt-nak">{{ row.nakshatra }}</span>
              </div>
            }
          </div>
        </div>

        <!-- ── Dasha timeline ────────────────────────────────────────────── -->
        <div class="astro-section-card">
          <div class="astro-section-hdr">Vimshottari Dasha</div>
          <div class="astro-dasha-row">
            <div class="dasha-cell dasha-current">
              <div class="dasha-label">Current Mahadasha</div>
              <div class="dasha-val">{{ currentDasha() }}</div>
            </div>
            <div class="dasha-cell">
              <div class="dasha-label">Moon Nakshatra</div>
              <div class="dasha-val">{{ moonNakshatra() }}</div>
            </div>
            <div class="dasha-cell">
              <div class="dasha-label">Lagna (Ascendant)</div>
              <div class="dasha-val">{{ lagnaRashi() }}</div>
            </div>
          </div>
          @if (dashaSequence().length) {
            <div class="dasha-sequence">
              <div class="dasha-seq-label">Dasha Sequence</div>
              <div class="dasha-seq-pills">
                @for (d of dashaSequence(); track d.lord) {
                  <span class="dasha-pill" [class.dasha-pill-on]="d.current">
                    {{ d.lord }} <span class="dasha-years">{{ d.years }}y</span>
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- ── Active Yogas ───────────────────────────────────────────────── -->
        @if (activeYogas().length) {
          <div class="astro-section-card">
            <div class="astro-section-hdr">Active Yogas</div>
            <div class="astro-yoga-list">
              @for (y of activeYogas(); track y) {
                <span class="yoga-pill">{{ y }}</span>
              }
            </div>
          </div>
        }

      }
    </div>
  }

  <!-- ══ RAW JSON TAB ═══════════════════════════════════════════════════════ -->
  @if (activeTab() === 'raw') {
    <div class="code-body">
      <div class="code-tabs">
        @for (key of rawKeys(); track key) {
          <button class="code-tab" [class.code-tab-on]="rawKey()===key" (click)="rawKey.set(key)">{{ key }}</button>
        }
      </div>
      <pre class="code-pre">{{ rawJson() }}</pre>
    </div>
  }

  <!-- ══ 360° READABLE TAB — REMOVED ══════════════════════════════════════ -->
  @if (false) {
    <div class="cov-body">
      <!-- Toolbar -->
      <div class="cov-toolbar">
        <div class="cov-chips">
          <button class="cov-chip" [class.cov-chip-on]="covDomain() === 'all'" (click)="covSetDomain('all')">All</button>
          @for (d of covDomains(); track d) {
            <button class="cov-chip" [class.cov-chip-on]="covDomain() === d" (click)="covSetDomain(d)">
              {{ covIcon(d) }} {{ covLabel(d) }}
            </button>
          }
        </div>
        <div class="cov-toolbar-r">
          <input class="cov-search" type="text" placeholder="Search findings…"
            [ngModel]="covSearch()" (ngModelChange)="covSetSearch($event)"/>
          <select class="cov-psize" [ngModel]="covPageSize()" (ngModelChange)="covSetPageSize(+$event)">
            <option [value]="10">10 / page</option>
            <option [value]="25">25 / page</option>
            <option [value]="50">50 / page</option>
          </select>
        </div>
      </div>
      <!-- Stats -->
      <div class="cov-stats">
        <span><b>{{ covFiltered().length }}</b> findings</span>
        <span class="cov-dot">·</span>
        <span><b>{{ covDomains().length }}</b> domains</span>
        <span class="cov-dot">·</span>
        <span>Page <b>{{ covPage() }}</b> / <b>{{ covTotalPages() }}</b></span>
        @if (covAllRows().length === 0) {
          <span class="cov-hint">Run an analysis first to see data here</span>
        }
      </div>
      <!-- Empty -->
      @if (covAllRows().length === 0) {
        <div class="cov-empty">
          <div style="font-size:40px">🔭</div>
          <p style="font-weight:600;color:#5c4a1e;margin:8px 0 4px">No agent output yet</p>
          <p style="color:#92835c;font-size:13px">Complete the pipeline run to see all findings here in readable format.</p>
        </div>
      } @else {
        <!-- Grid -->
        <div class="cov-table-wrap">
          <table class="cov-table">
            <thead>
              <tr>
                <th class="cov-th" (click)="covSortBy('domain')">Domain <span class="cov-si">{{ covSortField()==='domain' ? (covSortDir()==='asc'?'↑':'↓') : '⇅' }}</span></th>
                <th class="cov-th" (click)="covSortBy('tradition')">Tradition <span class="cov-si">{{ covSortField()==='tradition' ? (covSortDir()==='asc'?'↑':'↓') : '⇅' }}</span></th>
                <th class="cov-th" (click)="covSortBy('field')">Field <span class="cov-si">{{ covSortField()==='field' ? (covSortDir()==='asc'?'↑':'↓') : '⇅' }}</span></th>
                <th class="cov-th cov-th-value">Finding</th>
                <th class="cov-th" (click)="covSortBy('confidence')">Conf <span class="cov-si">{{ covSortField()==='confidence' ? (covSortDir()==='asc'?'↑':'↓') : '⇅' }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (row of covPaged(); track row.idx) {
                <tr class="cov-row">
                  <td class="cov-td">
                    <span class="cov-badge" [attr.data-d]="row.domain">{{ covIcon(row.domain) }} {{ covLabel(row.domain) }}</span>
                  </td>
                  <td class="cov-td cov-td-trad">{{ row.tradition || '—' }}</td>
                  <td class="cov-td"><code class="cov-code">{{ row.field }}</code></td>
                  <td class="cov-td cov-td-val">{{ row.value }}</td>
                  <td class="cov-td cov-td-conf">
                    @if (row.confidence) {
                      <span class="cov-conf" [attr.data-c]="row.confidence">{{ row.confidence }}</span>
                    } @else { <span class="cov-conf">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <!-- Pagination -->
        <div class="cov-pager">
          <button class="cov-pg-btn" [disabled]="covPage() <= 1" (click)="covPrev()">← Prev</button>
          <span class="cov-pg-info">{{ covPage() }} / {{ covTotalPages() }} · {{ covFiltered().length }} rows</span>
          <button class="cov-pg-btn" [disabled]="covPage() >= covTotalPages()" (click)="covNext()">Next →</button>
        </div>
      }
    </div>
  }

  <!-- ══ AGENT LOG TAB ══════════════════════════════════════════════════════ -->
  @if (activeTab() === 'log') {
    <div class="code-body">
      <div class="log-hdr">
        <span class="log-hdr-title">Agent Execution Log</span>
        <span class="log-count-badge">{{ orch.agentLog().length }} entries</span>
      </div>
      @if (!orch.agentLog().length) {
        <p class="log-empty">No log entries — run the analysis first.</p>
      }
      <div class="log-list">
        @for (entry of orch.agentLog(); track $index) {
          <div class="log-row">
            <span class="log-n">{{ $index + 1 }}</span>
            <span class="log-txt">{{ entry }}</span>
          </div>
        }
      </div>
    </div>
  }

<app-footer></app-footer>
</div>
  `,
  styles: [`
/* ── Golden Chakra Spinner ── */
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
  filter:
    brightness(0) saturate(1)
    invert(56%) sepia(100%) saturate(200%) hue-rotate(0deg) brightness(0.95);
  opacity: 0.5;
}
@keyframes chakra-spin { to { transform: rotate(360deg); } }

/* ── Shell ────────────────────────────────────────────────────────────────── */
:host { display: flex; flex-direction: column; min-height: 100vh; background: transparent; }
.shell { display: flex; flex-direction: column; min-height: 100vh; }

/* ── Header ───────────────────────────────────────────────────────────────── */
.hdr {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 0 20px; height: 56px; flex-shrink: 0;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border-bottom: 1px solid rgba(0,0,0,0.06);
  position: sticky; top: 0; z-index: 100;
}
.hdr-left  { display: flex; align-items: center; gap: 10px; min-width: 0; }
.hdr-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.icon-btn {
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.1); background: transparent;
  color: #555; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.icon-btn:hover { background: rgba(0,0,0,0.05); color: #111; }

.brand { display: flex; align-items: center; gap: 7px; }
.brand-mark { color: #d4af37; font-size: 14px; }
.brand-name { font-size: 13px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif; }
.brand-sep  { color: #d1d5db; }
.brand-page { font-size: 12px; color: #9ca3af; font-family: Georgia, serif; }

.user-chip {
  padding: 3px 12px; border-radius: 99px;
  background: rgba(212,175,55,0.1); color: #8a6a00;
  font-size: 11.5px; font-weight: 600;
  border: 1px solid rgba(212,175,55,0.25);
}
.lead-chip {
  padding: 3px 12px; border-radius: 99px;
  background: rgba(79,70,229,0.1); color: #4338ca;
  font-size: 11.5px; font-weight: 600;
  border: 1px solid rgba(79,70,229,0.25);
}

/* Progress pill */
.progress-pill {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 12px; border-radius: 99px;
  background: #f3f4f6; border: 1px solid #e5e7eb;
}
.progress-track {
  width: 64px; height: 4px; border-radius: 99px;
  background: #e5e7eb; overflow: hidden;
}
.progress-fill {
  height: 100%; background: linear-gradient(90deg, #22c55e, #10b981);
  border-radius: 99px; transition: width 0.4s ease;
}
.progress-label { font-size: 11px; font-weight: 700; color: #374151; white-space: nowrap; }

/* Buttons */
.hdr-nav-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
  background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.22);
  color: #4338ca; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.hdr-nav-btn:hover { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); }

.btn-outline-green {
  padding: 6px 14px; border-radius: 8px;
  border: 1.5px solid #22c55e; background: transparent;
  color: #16a34a; font-size: 11.5px; font-weight: 600;
  cursor: pointer; font-family: Georgia, serif; transition: all 0.15s;
}
.btn-outline-green:hover { background: rgba(34,197,94,0.07); }

.btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 18px; border-radius: 8px; border: none;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: Georgia, serif;
  box-shadow: 0 2px 10px rgba(212,175,55,0.3); transition: all 0.15s;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(212,175,55,0.4); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.generate-err { font-size: 11px; color: #dc2626; font-weight: 600; white-space: nowrap; }

.approve-hint {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: rgba(212,175,55,0.08);
  border: 1px solid rgba(212,175,55,0.3); border-radius: 10px;
  font-size: 12.5px; color: #78500a; font-family: Georgia, serif; line-height: 1.5;
}

.btn-outline {
  padding: 7px 18px; border-radius: 8px;
  border: 1px solid #d1d5db; background: #fff;
  color: #374151; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: Georgia, serif;
}

.btn-spinner {
  width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
  animation: spin 0.7s linear infinite; display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Session bar ──────────────────────────────────────────────────────────── */
.session-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 6px 20px; background: #f0fdf4; border-bottom: 1px solid #bbf7d0;
  font-size: 11.5px; font-family: Georgia, serif; flex-shrink: 0;
}
.sb-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.sb-dot-green { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
.sb-dot-amber { background: #f59e0b; }
.sb-item { color: #374151; }
.sb-item code { font-family: monospace; background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; }
.sb-item strong { color: #8a6a00; }
.sb-sep   { color: #d1d5db; }
.sb-brand { color: #15803d; font-weight: 600; }
.sb-amber { color: #92400e; font-weight: 600; background: #fef3c7; padding: 2px 10px; border-radius: 99px; }

/* ── Tab bar ──────────────────────────────────────────────────────────────── */
.tabs {
  display: flex; gap: 0; padding: 0 20px;
  background: #fff; border-bottom: 1px solid rgba(0,0,0,0.07); flex-shrink: 0;
}
.tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 12px 18px; border: none; background: transparent;
  font-size: 12.5px; font-weight: 600; color: #9ca3af;
  cursor: pointer; border-bottom: 2.5px solid transparent;
  transition: all 0.15s; font-family: Georgia, serif;
  white-space: nowrap;
}
.tab:hover { color: #374151; }
.tab-on { color: #8a6a00; border-bottom-color: #d4af37; }
.tab-locked { opacity: 0.45; cursor: not-allowed !important; }
.tab-lock-icon { font-size: 10px; }
.tab-count {
  background: #f3f4f6; color: #6b7280; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 99px;
}
.tab-on .tab-count { background: rgba(212,175,55,0.15); color: #8a6a00; }
.tab-count-purple { background: rgba(139,92,246,0.1); color: #7c3aed; }

/* ── Review body ──────────────────────────────────────────────────────────── */
.body {
  flex: 1; overflow-y: auto; padding: 20px 20px 60px;
  display: flex; flex-direction: column; gap: 16px;
}
.body::-webkit-scrollbar { width: 6px; }
.body::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.25); border-radius: 99px; }

/* Empty state */
.empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  padding: 80px 20px; text-align: center;
}
.empty-icon  { font-size: 32px; color: #d4af37; opacity: 0.4; }
.empty-title { font-size: 16px; font-weight: 700; color: #374151; font-family: Georgia, serif; margin: 0; }
.empty-sub   { font-size: 13px; color: #9ca3af; font-family: Georgia, serif; margin: 0; }

/* Question card */
.q-card {
  background: #fff; border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.07);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03);
  overflow: hidden;
}

.q-hdr {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 18px 20px;
  background: linear-gradient(135deg, #fffbf0 0%, #fff 60%);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.q-hdr-purple {
  background: linear-gradient(135deg, #f5f3ff 0%, #fff 60%);
}
.q-num-circle {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  font-family: Georgia, serif; margin-top: 1px;
}
.q-num-purple { background: linear-gradient(135deg, #6d28d9, #8b5cf6); }
.q-info { flex: 1; min-width: 0; }
.q-text { font-size: 14.5px; font-weight: 700; color: #1a1a1a; line-height: 1.5; margin-bottom: 6px; font-family: Georgia, serif; }
.q-meta { display: flex; align-items: center; gap: 8px; }
.intent-tag {
  font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 99px;
  background: rgba(212,175,55,0.1); color: #8a6a00;
  border: 1px solid rgba(212,175,55,0.25); letter-spacing: 0.06em; text-transform: uppercase;
}
.intent-tag-purple {
  background: rgba(139,92,246,0.1); color: #6d28d9; border-color: rgba(139,92,246,0.25);
}
.q-stat { font-size: 11px; color: #16a34a; font-weight: 600; }
.q-stat-purple { color: #7c3aed; }

/* Insights list */
.insights { display: flex; flex-direction: column; }
.insight {
  padding: 16px 20px 20px;
  border-bottom: 1px solid #f5f3ef;
  transition: background 0.15s;
}
.insight:last-child { border-bottom: none; }
.insight-on  { background: #f0fdf4; }
.insight-off { background: #fef2f2; opacity: 0.6; }

.insight-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
}
.insight-tags { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.insight-actions { display: flex; gap: 5px; flex-shrink: 0; align-items: center; }

/* Confidence badge */
.conf {
  font-size: 9.5px; font-weight: 800; padding: 2px 8px;
  border-radius: 99px; letter-spacing: 0.07em;
}
.conf-h { background: #dcfce7; color: #15803d; }
.conf-m { background: #fef9c3; color: #854d0e; }
.conf-l { background: #f3f4f6; color: #6b7280; }

.multi-tag {
  font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px;
  background: rgba(212,175,55,0.12); color: #8a6a00;
  border: 1px solid rgba(212,175,55,0.28); letter-spacing: 0.06em;
}
.domain-tag {
  font-size: 9.5px; background: #f3f4f6; color: #555;
  padding: 2px 8px; border-radius: 99px; font-weight: 600; text-transform: capitalize;
}
.edited-tag {
  font-size: 9px; background: #fef3c7; color: #92400e;
  padding: 2px 8px; border-radius: 99px; font-weight: 700;
}
.ins-id { font-size: 9px; color: #d1d5db; font-family: monospace; }

/* Action buttons */
.act-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 7px; font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: Georgia, serif; transition: all 0.15s; white-space: nowrap;
}
.act-edit {
  border: 1.5px solid #e5e7eb; background: transparent; color: #6b7280;
}
.act-edit:hover { border-color: #d4af37; color: #8a6a00; background: rgba(212,175,55,0.05); }

.act-reject {
  border: 1.5px solid #fca5a5; background: transparent; color: #dc2626;
}
.act-reject:hover { background: rgba(239,68,68,0.06); }
.act-reject-on { background: #ef4444 !important; color: #fff !important; border-color: #ef4444 !important; }

.act-approve {
  border: 1.5px solid #86efac; background: transparent; color: #16a34a;
}
.act-approve:hover { background: rgba(34,197,94,0.06); }
.act-approve-on { background: #22c55e !important; color: #fff !important; border-color: #22c55e !important; }
.read-only-tag { font-size: 10px; color: #9ca3af; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 8px; background: #f9fafb; }

.ins-text {
  font-size: 14px; color: #374151; line-height: 1.85; margin: 0;
  font-family: Georgia, serif;
}
.ins-text-native { font-size: 15px; line-height: 2; }
.ins-editor {
  width: 100%; box-sizing: border-box; padding: 10px 12px;
  border: 1.5px solid #d4af37; border-radius: 8px; outline: none;
  font-family: Georgia, serif; font-size: 13px; color: #374151;
  line-height: 1.75; background: #fffbf0; resize: vertical; min-height: 88px;
}
.ins-editor:focus { box-shadow: 0 0 0 3px rgba(212,175,55,0.12); }

/* ── Translation tab specific ─────────────────────────────────────────────── */
.trans-ctrl-bar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  background: #fff; border-radius: 12px; padding: 14px 18px;
  border: 1px solid rgba(139,92,246,0.15);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.trans-ctrl-left { display: flex; align-items: center; gap: 10px; }
.trans-ctrl-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.trans-globe { color: #7c3aed; flex-shrink: 0; }
.trans-ctrl-label { font-size: 13px; font-weight: 600; color: #374151; font-family: Georgia, serif; white-space: nowrap; }
.lang-select-ctrl {
  padding: 6px 12px; border-radius: 8px; border: 1.5px solid rgba(139,92,246,0.3);
  background: rgba(139,92,246,0.05); color: #4c1d95; font-size: 13px; font-weight: 600;
  font-family: Georgia, serif; cursor: pointer; outline: none;
}
.lang-select-ctrl:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139,92,246,0.1); }
.lang-select-ctrl:disabled { opacity: 0.5; cursor: not-allowed; }
.lang-select-ctrl option { background: #fff; color: #374151; }

.trans-status-ok {
  display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 600; color: #16a34a;
}

.btn-translate {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; border-radius: 8px; border: none;
  background: linear-gradient(135deg, #5b21b6, #8b5cf6);
  color: #fff; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: Georgia, serif;
  box-shadow: 0 2px 10px rgba(139,92,246,0.3); transition: all 0.15s;
}
.btn-translate:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(139,92,246,0.4); }
.btn-translate:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.btn-finalize {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; border-radius: 8px; border: none;
  background: linear-gradient(135deg, #8a6a00, #d4af37);
  color: #fff; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: Georgia, serif;
  box-shadow: 0 2px 10px rgba(212,175,55,0.3); transition: all 0.15s;
}
.btn-finalize:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(212,175,55,0.4); }

.trans-error-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
  font-size: 12px; color: #991b1b; font-family: Georgia, serif;
}
.err-dismiss {
  margin-left: auto; background: transparent; border: none;
  color: #991b1b; font-size: 16px; cursor: pointer; line-height: 1;
}

.trans-loading-card {
  display: flex; align-items: flex-start; gap: 16px;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border: 1px solid rgba(139,92,246,0.2); border-radius: 14px;
  padding: 20px 22px;
}
.trans-loading-ring {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
  border: 3px solid rgba(139,92,246,0.2); border-top-color: #8b5cf6;
  animation: spin 0.8s linear infinite;
}
.trans-loading-text {
  display: flex; flex-direction: column; gap: 4px;
}
.trans-loading-text strong {
  font-size: 14px; font-weight: 700; color: #5b21b6; font-family: Georgia, serif;
}
.trans-loading-text span {
  font-size: 12.5px; color: #6d28d9; font-family: Georgia, serif; line-height: 1.65;
}

.trans-intro-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: rgba(139,92,246,0.06);
  border: 1px solid rgba(139,92,246,0.18); border-radius: 10px;
  font-size: 12.5px; color: #5b21b6; font-family: Georgia, serif;
}

.trans-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 80px 20px; text-align: center;
}
.trans-empty-icon { opacity: 0.5; }
.trans-empty-title { font-size: 16px; font-weight: 700; color: #374151; font-family: Georgia, serif; margin: 0; }
.trans-empty-sub { font-size: 13px; color: #9ca3af; font-family: Georgia, serif; margin: 0; max-width: 440px; line-height: 1.7; }

/* ── Module Methodology card ──────────────────────────────────────────────── */
.method-card {
  background: #fff; border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.07);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03);
  overflow: hidden;
}
.method-card-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px; border-bottom: 1px solid rgba(99,102,241,0.12);
  font-size: 13px; font-weight: 700; color: #4338ca; font-family: Georgia, serif;
  background: linear-gradient(135deg, #eef2ff, #fff);
}
.method-modules {
  display: flex; flex-direction: column; gap: 0;
}
.method-module {
  padding: 14px 18px; border-bottom: 1px solid #f5f3ef;
}
.method-module:last-child { border-bottom: none; }
.mm-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.mm-icon { font-size: 16px; }
.mm-label { font-size: 13px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif; }
.mm-branches { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.mm-branch {
  font-size: 10.5px; font-weight: 700; padding: 3px 10px; border-radius: 99px;
  background: rgba(99,102,241,0.08); color: #4338ca;
  border: 1px solid rgba(99,102,241,0.2); font-family: Georgia, serif;
}
.mm-detail {
  font-size: 11px; color: #6b7280; font-family: Georgia, serif;
  margin-bottom: 3px; line-height: 1.5;
}
.mm-detail strong { color: #374151; }
.mm-desc {
  font-size: 11.5px; color: #9ca3af; font-family: Georgia, serif;
  line-height: 1.65; font-style: italic;
}

/* ── Astrology tab ────────────────────────────────────────────────────────── */
.astro-basis-card, .astro-section-card {
  background: #fff; border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.07);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03);
  overflow: hidden;
}
.astro-basis-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px; border-bottom: 1px solid rgba(212,175,55,0.15);
  font-size: 13px; font-weight: 700; color: #8a6a00; font-family: Georgia, serif;
  background: linear-gradient(135deg, #fffbf0, #fff);
}
.astro-basis-grid { padding: 4px 0; }
.basis-row {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 10px 18px; border-bottom: 1px solid #f5f3ef;
  font-size: 12.5px; font-family: Georgia, serif;
}
.basis-row:last-child { border-bottom: none; }
.basis-label {
  min-width: 110px; font-weight: 700; color: #6b7280; flex-shrink: 0;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 2px;
}
.basis-val { color: #374151; line-height: 1.6; }
.basis-highlight { color: #8a6a00; font-weight: 600; }
.basis-warn { color: #b45309; font-weight: 600; }
.basis-note { color: #6b7280; font-size: 11.5px; font-style: italic; line-height: 1.65; }

.astro-section-hdr {
  padding: 13px 18px; border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 13px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif;
  background: linear-gradient(135deg, #fffbf0, #fff);
}

.astro-planet-table { padding: 0 18px 12px; }
.apt-row {
  display: grid; grid-template-columns: 140px 1fr 90px 1fr;
  gap: 8px; padding: 8px 0; border-bottom: 1px solid #f5f3ef;
  font-size: 12.5px; font-family: Georgia, serif; align-items: center;
}
.apt-row:last-child { border-bottom: none; }
.apt-head {
  font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.07em; color: #9ca3af; padding-bottom: 8px;
  border-bottom: 1.5px solid #e5e7eb;
}
.apt-lagna { background: rgba(212,175,55,0.05); border-radius: 6px; padding: 8px 6px; }
.apt-planet { display: flex; align-items: center; gap: 6px; font-weight: 700; color: #1a1a1a; }
.apt-sym { font-size: 15px; }
.apt-rashi { color: #374151; }
.apt-lon { font-family: monospace; color: #6b7280; font-size: 11.5px; }
.apt-nak { color: #7c3aed; font-size: 12px; }

.astro-dasha-row {
  display: flex; gap: 1px; padding: 0 18px 16px;
  flex-wrap: wrap;
}
.dasha-cell {
  flex: 1; min-width: 120px; padding: 14px 16px;
  background: #f9fafb; border-radius: 10px; margin: 8px 4px 0;
}
.dasha-current { background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.2); }
.dasha-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #9ca3af; font-weight: 700; margin-bottom: 4px; }
.dasha-val { font-size: 15px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif; }
.dasha-sequence { padding: 0 18px 18px; }
.dasha-seq-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #9ca3af; font-weight: 700; margin-bottom: 8px; }
.dasha-seq-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.dasha-pill {
  padding: 4px 12px; border-radius: 99px; font-size: 11.5px; font-weight: 600;
  background: #f3f4f6; color: #6b7280; font-family: Georgia, serif;
  border: 1px solid #e5e7eb;
}
.dasha-pill-on { background: rgba(212,175,55,0.12); color: #8a6a00; border-color: rgba(212,175,55,0.3); }
.dasha-years { font-size: 10px; color: #9ca3af; margin-left: 4px; }

.astro-yoga-list { padding: 14px 18px; display: flex; flex-wrap: wrap; gap: 8px; }
.yoga-pill {
  padding: 5px 14px; border-radius: 99px; font-size: 12px; font-weight: 600;
  background: rgba(99,102,241,0.08); color: #4338ca;
  border: 1px solid rgba(99,102,241,0.2); font-family: Georgia, serif;
}

/* ── Code / JSON / Log body ───────────────────────────────────────────────── */
.code-body {
  flex: 1; overflow: hidden; display: flex; flex-direction: column;
  padding: 16px 20px; gap: 10px;
}
.code-tabs { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.code-tab {
  padding: 5px 14px; border-radius: 99px; border: 1.5px solid #e5e7eb;
  background: transparent; font-size: 11.5px; font-weight: 600; color: #6b7280;
  cursor: pointer; text-transform: capitalize; font-family: Georgia, serif; transition: all 0.15s;
}
.code-tab:hover { border-color: #d4af37; color: #8a6a00; }
.code-tab-on { background: #8a6a00; color: #fff; border-color: #8a6a00; }
.code-pre {
  flex: 1; overflow: auto; background: #0f1117; color: #a5f3fc;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 11px;
  padding: 18px; border-radius: 12px; margin: 0; line-height: 1.7;
}

/* ── 360° Readable tab ─────────────────────────────────────────────────── */
.cov-body { flex:1; overflow:hidden; display:flex; flex-direction:column; padding:16px 20px; gap:10px; }
.cov-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; flex-shrink:0; }
.cov-chips { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.cov-chip {
  padding:4px 14px; border-radius:99px; border:1.5px solid #e5d8a0;
  background:transparent; font-size:12px; font-weight:500; color:#6b5a1e;
  cursor:pointer; font-family:Georgia,serif; transition:all 0.15s;
}
.cov-chip:hover { border-color:#d4af37; color:#8a6a00; background:#fdf8ec; }
.cov-chip-on { background:#8a6a00; color:#fff; border-color:#8a6a00; }
.cov-toolbar-r { display:flex; align-items:center; gap:8px; }
.cov-search {
  padding:6px 12px; border-radius:8px; border:1.5px solid #e5d8a0;
  font-size:12px; font-family:inherit; color:#374151; outline:none;
  width:200px; transition:border-color 0.15s;
}
.cov-search:focus { border-color:#d4af37; }
.cov-psize {
  padding:5px 8px; border-radius:8px; border:1.5px solid #e5d8a0;
  font-size:12px; font-family:inherit; color:#374151; cursor:pointer; outline:none;
}
.cov-stats { display:flex; align-items:center; gap:8px; font-size:12px; color:#92835c; flex-shrink:0; }
.cov-dot { color:#d4af37; }
.cov-hint { margin-left:auto; font-style:italic; color:#b45309; font-size:11px; background:#fffbeb; padding:2px 8px; border-radius:6px; }
.cov-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; }
.cov-table-wrap { flex:1; overflow:auto; border-radius:10px; border:1px solid #e5d8a0; background:#fff; }
.cov-table { width:100%; border-collapse:collapse; font-size:12px; min-width:800px; }
.cov-th {
  padding:8px 12px; text-align:left; font-weight:700; font-size:10.5px;
  letter-spacing:0.06em; text-transform:uppercase; color:#8a6a00;
  background:#fdf8ec; border-bottom:1.5px solid #e5d8a0;
  white-space:nowrap; cursor:pointer; user-select:none;
  position:sticky; top:0; z-index:2;
}
.cov-th:hover { background:#fdf0d0; }
.cov-th-value { min-width:280px; cursor:default; }
.cov-si { margin-left:3px; font-size:9px; opacity:0.7; }
.cov-row { border-bottom:1px solid #f5eed8; transition:background 0.1s; }
.cov-row:last-child { border-bottom:none; }
.cov-row:hover { background:#fdfaf0; }
.cov-td { padding:7px 12px; vertical-align:top; color:#374151; line-height:1.5; }
.cov-td-trad { color:#92835c; font-size:11.5px; }
.cov-td-val { color:#1f2937; }
.cov-td-conf { text-align:center; }
.cov-badge {
  display:inline-flex; align-items:center; gap:4px;
  padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;
  background:#fdf8ec; color:#8a6a00; white-space:nowrap;
}
.cov-badge[data-d="astrology"]  { background:#ede9fe; color:#5b21b6; }
.cov-badge[data-d="numerology"] { background:#dbeafe; color:#1e40af; }
.cov-badge[data-d="palmistry"]  { background:#dcfce7; color:#166534; }
.cov-badge[data-d="tarot"]      { background:#fce7f3; color:#9d174d; }
.cov-badge[data-d="vastu"]      { background:#fef3c7; color:#92400e; }
.cov-badge[data-d="remedies"]   { background:#d1fae5; color:#065f46; }
.cov-code {
  font-family:'Fira Mono','Courier New',monospace; font-size:10.5px;
  background:#f5f0e0; color:#8a6a00; padding:1px 5px; border-radius:4px;
}
.cov-conf {
  display:inline-block; padding:1px 7px; border-radius:8px;
  font-size:10.5px; font-weight:600; text-transform:capitalize;
  background:#f5eed8; color:#8a6a00;
}
.cov-conf[data-c="high"]   { background:#dcfce7; color:#166534; }
.cov-conf[data-c="medium"] { background:#fef3c7; color:#92400e; }
.cov-conf[data-c="low"]    { background:#fee2e2; color:#991b1b; }
.cov-pager { display:flex; align-items:center; justify-content:center; gap:14px; padding:10px 0; flex-shrink:0; }
.cov-pg-btn {
  padding:5px 14px; border-radius:8px; border:1.5px solid #e5d8a0;
  background:#fff; font-size:12px; font-weight:600; color:#8a6a00;
  cursor:pointer; font-family:inherit; transition:all 0.15s;
}
.cov-pg-btn:hover:not(:disabled) { border-color:#d4af37; background:#fdf8ec; }
.cov-pg-btn:disabled { opacity:0.4; cursor:not-allowed; }
.cov-pg-info { font-size:12px; color:#92835c; }

/* Log */
.log-hdr { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.log-hdr-title { font-size: 13px; font-weight: 700; color: #374151; font-family: Georgia, serif; }
.log-count-badge {
  font-size: 10.5px; font-weight: 700; color: #6b7280;
  background: #f3f4f6; padding: 3px 10px; border-radius: 99px;
}
.log-empty { color: #9ca3af; font-size: 13px; text-align: center; padding: 40px; font-family: Georgia, serif; }
.log-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.log-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 12px; border-radius: 8px; background: #0f1117;
  font-size: 11.5px; line-height: 1.6;
}
.log-n   { flex-shrink: 0; color: #d4af37; font-family: monospace; font-weight: 700; min-width: 20px; }
.log-txt { color: #a5f3fc; font-family: 'JetBrains Mono', monospace; }
  
.refresh-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.12); background: #f9fafb;
  color: #374151; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.refresh-btn:hover:not(:disabled) { background: #f3f4f6; border-color: #6366f1; color: #6366f1; }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.refresh-btn .refresh-icon { font-size: 15px; display: inline-block; }
.refresh-btn.spinning .refresh-icon { animation: refresh-spin 0.75s linear infinite; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }
.auto-refresh-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  background: #f3f4f6; border: 1px solid rgba(0,0,0,0.08);
  font-size: 11px; color: #6b7280; font-weight: 500; white-space: nowrap;
}
.auto-refresh-badge::before {
  content: ''; display: inline-block; width: 6px; height: 6px;
  border-radius: 50%; background: #22c55e;
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }

/* ── Structured detail panels ────────────────────────────────────────────── */
.detail-panel {
  border-top: 1px dashed rgba(0,0,0,0.08);
  padding: 10px 14px 4px;
  display: flex; flex-direction: column; gap: 10px;
  background: rgba(250,250,248,0.6);
}
.detail-section { display: flex; flex-direction: column; gap: 6px; }
.detail-section-title {
  font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.07em; color: #9ca3af;
}
.detail-focus-insight {
  font-size: 12.5px; color: #8a6a00; font-style: italic;
  font-family: Georgia, serif; line-height: 1.6;
  background: rgba(212,175,55,0.06); border-left: 3px solid #d4af37;
  padding: 6px 10px; border-radius: 0 6px 6px 0;
}
.detail-chips-row { display: flex; flex-wrap: wrap; gap: 5px; }
.detail-num-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 5px 10px; border-radius: 8px;
  background: #fff; border: 1px solid #e5e7eb;
  min-width: 58px; text-align: center;
}
.chip-label { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
.chip-val   { font-size: 17px; font-weight: 800; color: #d4af37; font-family: Georgia, serif; line-height: 1.3; }
.lucky-num  {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(212,175,55,0.12); border: 1.5px solid rgba(212,175,55,0.35);
  font-size: 14px; font-weight: 800; color: #8a6a00; font-family: Georgia, serif;
}
.lucky-color-chip {
  padding: 3px 12px; border-radius: 99px; font-size: 11.5px; font-weight: 600;
  background: rgba(99,102,241,0.07); color: #4338ca;
  border: 1px solid rgba(99,102,241,0.18);
}
.trait-chip {
  padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600;
  background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;
}
.detail-bullets { display: flex; flex-direction: column; gap: 4px; }
.detail-bullet {
  font-size: 12px; padding: 4px 10px; border-radius: 6px;
  font-family: Georgia, serif; line-height: 1.55;
}
.detail-bullet-green  { background: #f0fdf4; color: #15803d; border-left: 3px solid #22c55e; }
.detail-bullet-amber  { background: #fffbeb; color: #92400e; border-left: 3px solid #f59e0b; }
.detail-bullet-blue   { background: #eff6ff; color: #1d4ed8; border-left: 3px solid #3b82f6; }
.detail-bullet-purple { background: #faf5ff; color: #6d28d9; border-left: 3px solid #8b5cf6; }

/* Palmistry lines table */
.detail-line-list { display: flex; flex-direction: column; gap: 3px; }
.detail-line-row  { display: flex; gap: 10px; font-size: 12px; font-family: Georgia, serif; line-height: 1.5; align-items: flex-start; }
.detail-line-key  { min-width: 100px; font-weight: 700; color: #6b7280; flex-shrink: 0; font-size: 11px; text-transform: capitalize; }
.detail-line-key.house-key { min-width: 200px; }
.detail-line-val  { color: #374151; flex: 1; }

/* Tarot cards */
.tarot-cards-row  { display: flex; flex-wrap: wrap; gap: 8px; }
.tarot-card-chip  {
  flex: 1; min-width: 130px; max-width: 200px;
  border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 10px;
  background: #fff; display: flex; flex-direction: column; gap: 4px;
}
.tarot-card-chip.reversed { border-color: rgba(239,68,68,0.3); background: #fef2f2; }
.tc-position { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; }
.tc-name     { font-size: 13px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif; }
.tc-orient   { font-size: 10px; font-weight: 600; color: #22c55e; }
.tc-reversed { color: #ef4444; }
.tc-meaning  { font-size: 11.5px; color: #6b7280; font-family: Georgia, serif; line-height: 1.5; font-style: italic; }
.tc-keywords { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.tc-kw       {
  font-size: 9.5px; padding: 1px 7px; border-radius: 99px;
  background: rgba(99,102,241,0.07); color: #4338ca; border: 1px solid rgba(99,102,241,0.15);
}

/* ── Domain section grouping ─────────────────────────────────────────────── */
.domain-section {
  border-top: 1px solid #f0ece4;
  padding: 0;
}
.domain-section-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #fafaf8, #fff);
  font-size: 12.5px; font-weight: 700; color: #374151; font-family: Georgia, serif;
}
.domain-icon { font-size: 15px; }
.domain-label { color: #1a1a1a; font-size: 13px; }
.branch-count {
  margin-left: auto; font-size: 10.5px; font-weight: 600; color: #9ca3af;
  background: #f3f4f6; padding: 2px 9px; border-radius: 99px;
}

/* ── Branch cards grid ───────────────────────────────────────────────────── */
.branch-grid {
  display: flex; flex-direction: column; gap: 0;
  padding: 0 18px 14px;
}
.branch-card {
  border: 1.5px solid #e5e7eb; border-radius: 12px;
  margin-top: 10px; overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: #fafaf8;
}
.branch-card:hover { border-color: #d4af37; }
.branch-selected {
  border-color: #d4af37 !important;
  background: #fffbf0;
  box-shadow: 0 0 0 3px rgba(212,175,55,0.10);
}
.branch-approved {
  border-color: #22c55e !important;
  background: #f0fdf4;
  box-shadow: 0 0 0 3px rgba(34,197,94,0.08);
}
.branch-rejected {
  border-color: #ef4444 !important;
  background: #fef2f2; opacity: 0.6;
}

.branch-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.05);
  gap: 10px;
}
.branch-hdr-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.branch-name {
  font-size: 12.5px; font-weight: 700; color: #1a1a1a; font-family: Georgia, serif;
}
.branch-priority {
  font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 99px;
  letter-spacing: 0.05em;
}
.priority-h { background: #dcfce7; color: #15803d; border: 1px solid rgba(21,128,61,0.2); }
.priority-m { background: #fef9c3; color: #a16207; border: 1px solid rgba(161,98,7,0.2); }
.priority-l { background: #fee2e2; color: #b91c1c; border: 1px solid rgba(185,28,28,0.2); }

.branch-select-btn {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  padding: 5px 13px; border-radius: 8px;
  border: 1.5px solid #d4af37; background: transparent;
  font-size: 11.5px; font-weight: 700; color: #8a6a00;
  cursor: pointer; transition: all 0.15s; font-family: Georgia, serif;
}
.branch-select-btn:hover { background: rgba(212,175,55,0.08); }
.branch-select-on {
  background: #d4af37 !important; color: #fff !important;
  border-color: #b8962e !important;
}

.branch-text {
  margin: 0; padding: 12px 14px;
  font-size: 13px; color: #374151; line-height: 1.75;
  font-family: Georgia, serif;
}

.branch-actions {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-top: 1px solid rgba(0,0,0,0.05);
  background: rgba(0,0,0,0.01);
  flex-wrap: wrap;
}

/* ── Remedies section ────────────────────────────────────────────────────── */
.remedy-card { border-color: rgba(139,92,246,0.2); }
.remedy-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.rag-rem-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(212,175,55,0.1); }
.rag-rem-row:last-child { border-bottom: none; }
.rag-rem-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
.rag-rem-cat { flex-shrink: 0; min-width: 110px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #92600a; padding-top: 2px; }
.rag-rem-text { font-size: 13px; color: #374151; line-height: 1.6; }
.remedy-section { display: flex; flex-direction: column; gap: 8px; }
.remedy-section-title {
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;
  color: #7c3aed; padding-bottom: 4px; border-bottom: 1px solid rgba(139,92,246,0.15);
}

/* ══ RESPONSIVE — MOBILE ══ */
@media (max-width: 860px) {
  /* Header: icon-only right-side buttons */
  .hdr { padding: 0 12px; height: 52px; }
  .brand-name, .brand-sep, .brand-page { display: none; }
  .hdr-right { gap: 6px; }
  .hdr-nav-btn { font-size: 0 !important; padding: 7px 8px; }
  .hdr-nav-btn svg { width: 15px; height: 15px; }
  .progress-pill { display: none; }
  .user-chip, .lead-chip { max-width: 90px; overflow: hidden; text-overflow: ellipsis; font-size: 10px; padding: 2px 8px; }
  /* Tabs: scroll horizontally */
  .tabs { overflow-x: auto; padding: 0 12px; -webkit-overflow-scrolling: touch; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { padding: 10px 12px; font-size: 11.5px; }
  /* Body padding */
  .body { padding: 12px 10px 60px; }
  /* Action buttons in cards */
  .insight-actions { flex-wrap: wrap; }
  /* Coverage table */
  .cov-table { min-width: 600px; }
  /* Astrology grid */
  .detail-line-key.house-key { min-width: 130px; }
}
@media (max-width: 600px) {
  .hdr { padding: 0 8px; }
  .body { padding: 8px 6px 60px; }
  .tab { padding: 9px 10px; font-size: 11px; }
  .card { margin: 0; }
}
@media (max-width: 480px) {
  .hdr-right .btn-outline-green,
  .hdr-right .hdr-nav-btn:not(:first-child) { display: none; }
}
`]
})
export class ReviewPage {
  readonly router = inject(Router);
  private route  = inject(ActivatedRoute);
  private http   = inject(HttpClient);
  private api    = inject(ApiService);
  readonly orch  = inject(OrchestratorService);
  readonly auth  = inject(AuthService);

  // Set when admin arrives from "Do Reading" for a lead
  readonly leadId = signal(this.route.snapshot.queryParams['leadId'] ?? '');

  readonly activeTab        = signal<'review'|'translate'|'raw'|'log'|'astrology'>('review');
  readonly editingId        = signal<string|null>(null);
  readonly approvedIds      = signal<Set<string>>(new Set());
  readonly rejectedIds      = signal<Set<string>>(new Set());
  readonly selectedBranchIds = signal<Set<string>>(new Set());
  readonly rawKey           = signal<string>('astrology');

  // Branch content edits (keyed by insightId)
  private _branchEdits: Record<string, string> = {};

  // Report generation state
  readonly generating      = signal(false);
  readonly reportGenerated = signal(false);
  readonly chakraSpinning  = signal(false);

  // Translation state
  readonly translating       = signal(false);
  readonly translateError    = signal('');
  readonly pendingLangName   = signal('');
  selectedTranslateLang      = 'hi'; // default Hindi
  readonly languages         = signal<LanguageOption[]>(FALLBACK_LANGUAGES);

  // Translated content — per-section list of insights
  readonly translatedSections = signal<Array<{ question: string; intent: string; insights: Array<{ id: string; content: string; domains: string[]; }> }>>([]);
  readonly transApprovedIds   = signal<Set<string>>(new Set());
  readonly transRejectedIds   = signal<Set<string>>(new Set());
  readonly transEditingId     = signal<string|null>(null);

  // Finalized translated report stored for report page
  private _translatedReport: any = null;
  private _translatedLangCode = '';

  readonly questionBlocks = computed(() => this.orch.adminReview()?.questions ?? []);
  readonly userName       = computed(() => this.orch.currentInput()?.user_profile.full_name ?? '');
  readonly remedyData     = computed(() => (this.orch.rawOutputs() as any)?.remedies ?? null);

  // RAG remedies from numerology books (with stable IDs for branch-card tracking)
  readonly ragRemedies = signal<Array<{ id: string; icon: string; category: string; text: string }>>([]);
  readonly ragRemediesLoading = signal(false);
  private _ragLoaded = false;

  constructor() {
    // Auto-load RAG remedies once numerology data is available
    effect(() => {
      const raw = this.orch.rawOutputs() as any;
      if (this._ragLoaded || this.ragRemediesLoading()) return;
      const lifePathNum = Number(
        raw?.numerology?.indian?.core_numbers?.life_path
        ?? raw?.numerology?.indian?.life_path_number
        ?? raw?.numerology?.pythagorean?.core_numbers?.life_path
        ?? 0
      );
      if (!lifePathNum) return;
      this._ragLoaded = true;
      this.loadRagRemedies();
    });
  }

  loadRagRemedies(): void {
    const raw = this.orch.rawOutputs() as any;
    const lifePathNum = Number(
      raw?.numerology?.indian?.core_numbers?.life_path
      ?? raw?.numerology?.indian?.life_path_number
      ?? raw?.numerology?.pythagorean?.core_numbers?.life_path
      ?? 0
    );
    const intent = this.orch.adminReview()?.questions?.[0]?.intent ?? 'general';
    if (!lifePathNum) return;
    this.ragRemediesLoading.set(true);
    this.api.getRagRemedies(lifePathNum, intent).subscribe({
      next: res => {
        const items = (res.remedies ?? []).map((r, i) => ({ ...r, id: `rag_rem_${i}` }));
        this.ragRemedies.set(items);
        this.ragRemediesLoading.set(false);
      },
      error: () => this.ragRemediesLoading.set(false),
    });
  }

  // Remedy item edits (keyed by item id)
  _remedyEdits: Record<string, string> = {};
  onRemedyEdit(id: string, event: Event) {
    this._remedyEdits[id] = (event.target as HTMLTextAreaElement).value;
  }
  getRemedyContent(id: string, fallback: string): string {
    return this._remedyEdits[id] !== undefined ? this._remedyEdits[id] : fallback;
  }

  readonly remedyApprovedCount = computed(() => {
    const groups = this.remedyGroups();
    const ids = groups.flatMap(g => g.items.map(i => i.id));
    const approved = this.approvedIds();
    const selected = this.selectedBranchIds();
    const rejected = this.rejectedIds();
    return ids.filter(id => approved.has(id) || (selected.has(id) && !rejected.has(id))).length;
  });

  readonly remedyGroups = computed((): Array<{
    key: string; label: string; icon: string;
    items: Array<{ id: string; label: string; content: string; extra: any }>;
  }> => {
    const r = this.remedyData();
    if (!r) return [];
    const groups: Array<{ key: string; label: string; icon: string; items: Array<{ id: string; label: string; content: string; extra: any }> }> = [];

    const makeItems = (arr: string[], prefix: string): Array<{ id: string; label: string; content: string; extra: any }> =>
      (arr ?? []).map((text, i) => ({ id: `remedy_${prefix}_${i}`, label: `${prefix.replace(/_/g,' ')} ${i+1}`, content: text, extra: null }));

    if (r.mantras?.length) groups.push({ key: 'mantras', label: 'Mantras', icon: '🕉', items: (r.mantras as any[]).map((m, i) => ({ id: `remedy_mantra_${i}`, label: m.purpose ?? `Mantra ${i+1}`, content: `${m.mantra} ×${m.count}`, extra: { mantra: m.mantra, count: m.count } })) });
    if (r.daily_habits?.length) groups.push({ key: 'daily_habits', label: 'Daily Habits', icon: '☀', items: makeItems(r.daily_habits, 'habit') });
    if (r.behavioral_adjustments?.length) groups.push({ key: 'behavioral', label: 'Behavioral Adjustments', icon: '🧠', items: makeItems(r.behavioral_adjustments, 'behavior') });
    if (r.yoga_meditation?.length) groups.push({ key: 'yoga', label: 'Yoga & Meditation', icon: '🧘', items: makeItems(r.yoga_meditation, 'yoga') });
    if (r.colors?.length) groups.push({ key: 'colors', label: 'Prescribed Colors', icon: '🎨', items: (r.colors as string[]).map((c, i) => ({ id: `remedy_color_${i}`, label: c, content: `Wear, use, or surround yourself with ${c}`, extra: null })) });
    if (r.gemstones?.length) groups.push({ key: 'gemstones', label: 'Gemstones', icon: '💎', items: (r.gemstones as any[]).map((g, i) => ({ id: `remedy_gem_${i}`, label: g.stone, content: g.purpose, extra: { finger: g.finger } })) });
    if (r.fasting?.length) groups.push({ key: 'fasting', label: 'Fasting', icon: '🌙', items: makeItems(r.fasting, 'fast') });
    if (r.charity?.length) groups.push({ key: 'charity', label: 'Charity / Seva', icon: '🤲', items: makeItems(r.charity, 'charity') });
    if (r.vastu_remedies?.length) groups.push({ key: 'vastu', label: 'Vastu Corrections', icon: '🏠', items: makeItems(r.vastu_remedies, 'vastu') });

    // Per-question remedies
    if (r.question_remedies?.length) {
      (r.question_remedies as any[]).forEach((qr, qi) => {
        const qItems: Array<{ id: string; label: string; content: string; extra: any }> = [];
        (qr.habits ?? []).forEach((h: string, i: number) => qItems.push({ id: `remedy_q${qi}_habit_${i}`, label: `Habit ${i+1}`, content: h, extra: null }));
        (qr.mantras ?? []).forEach((m: any, i: number) => qItems.push({ id: `remedy_q${qi}_mantra_${i}`, label: m.purpose ?? `Mantra ${i+1}`, content: `${m.mantra} ×${m.count}`, extra: { mantra: m.mantra, count: m.count } }));
        if (qr.colors?.length) qItems.push({ id: `remedy_q${qi}_colors`, label: 'Lucky Colors', content: (qr.colors as string[]).join(', '), extra: { colors: qr.colors } });
        if (qItems.length) groups.push({ key: `q${qi+1}_remedies`, label: `Q${qi+1} Specific — ${qr.question?.slice(0,60)}`, icon: '✦', items: qItems });
      });
    }

    return groups;
  });

  readonly totalInsightCount = computed(() =>
    this.questionBlocks().reduce((sum, q) => sum + q.insights.length, 0)
  );
  // Count selected (not rejected) as effectively approved for progress display
  readonly approvedCount = computed(() => {
    const approved  = this.approvedIds();
    const selected  = this.selectedBranchIds();
    const rejected  = this.rejectedIds();
    const effective = new Set([...approved]);
    for (const id of selected) { if (!rejected.has(id)) effective.add(id); }
    return effective.size;
  });
  readonly approvalPct   = computed(() => {
    const t = this.totalInsightCount();
    return t ? Math.round(this.approvedCount() / t * 100) : 0;
  });

  readonly translationApprovedCount = computed(() => this.transApprovedIds().size);

  readonly currentLangNative = computed(() => {
    const lang = this.languages().find(l => l.code === this.selectedTranslateLang);
    return lang?.native ?? this.selectedTranslateLang;
  });
  readonly currentLangName = computed(() => {
    const lang = this.languages().find(l => l.code === this.selectedTranslateLang);
    return lang?.name ?? this.selectedTranslateLang;
  });

  readonly rawKeys = computed(() => {
    const out = this.orch.rawOutputs();
    return Object.keys(out).filter(k => (out as any)[k] !== undefined);
  });
  readonly rawJson = computed(() => {
    const out = this.orch.rawOutputs();
    return JSON.stringify((out as any)[this.rawKey()] ?? {}, null, 2);
  });

  // ── 360° Readable tab ────────────────────────────────────────────────────
  private static readonly _TRAD_MAP: Record<string, Record<string, string>> = {
    astrology:  { vedic_parashara: 'Vedic (Parashara)', kp_system: 'KP System', western_tropical: 'Western Tropical' },
    numerology: { indian_vedic: 'Indian Vedic', chaldean: 'Chaldean', pythagorean: 'Pythagorean' },
    palmistry:  { indian: 'Indian', chinese: 'Chinese', western: 'Western' },
    tarot:      { rider_waite: 'Rider-Waite', intuitive: 'Intuitive' },
    vastu:      { traditional: 'Traditional Vastu', modern: 'Modern Vastu' },
  };
  private static readonly _ICONS: Record<string, string> = {
    astrology:'🪐', numerology:'🔢', palmistry:'✋', tarot:'🃏', vastu:'🏠', remedies:'🌿',
  };
  private static readonly _LEAF = new Set([
    'predictions','traits','strengths','weaknesses','lucky_numbers','lucky_colors',
    'corrections','colors_recommended','priority_zones','guidance','doshas','yogas',
    'career_notes','health_notes','relationship_notes','daily_habits','challenges',
  ]);
  private static readonly _SKIP_F = new Set(['sub_agent','tradition','id','detail']);

  readonly covDomainSig  = signal<string>('all');
  readonly covSearch     = signal<string>('');
  readonly covSortField  = signal<string>('domain');
  readonly covSortDir    = signal<'asc'|'desc'>('asc');
  readonly covPage       = signal<number>(1);
  readonly covPageSize   = signal<number>(25);

  covDomain() { return this.covDomainSig(); }

  readonly covDomains = computed<string[]>(() => {
    const raw = this.orch.rawOutputs() as any;
    return Object.keys(raw).filter(k => k !== 'consolidated' && raw[k]);
  });

  readonly covAllRows = computed<any[]>(() => {
    const raw = this.orch.rawOutputs() as any;
    const rows: any[] = [];
    for (const domain of Object.keys(raw)) {
      if (domain === 'consolidated' || !raw[domain]) continue;
      this._covFlatten(domain, raw[domain], rows);
    }
    return rows;
  });

  readonly covFiltered = computed<any[]>(() => {
    let rows = this.covAllRows();
    const d = this.covDomainSig();
    if (d !== 'all') rows = rows.filter((r: any) => r.domain === d);
    const q = this.covSearch().toLowerCase().trim();
    if (q) rows = rows.filter((r: any) =>
      r.value.toLowerCase().includes(q) ||
      r.field.toLowerCase().includes(q) ||
      r.tradition.toLowerCase().includes(q)
    );
    const sf = this.covSortField();
    const sd = this.covSortDir();
    return [...rows].sort((a: any, b: any) => {
      const av = a[sf] ?? ''; const bv = b[sf] ?? '';
      return sd === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  });

  readonly covPaged = computed<any[]>(() => {
    const rows = this.covFiltered();
    const ps = this.covPageSize(); const pg = this.covPage();
    return rows.slice((pg - 1) * ps, pg * ps);
  });

  readonly covTotalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.covFiltered().length / this.covPageSize()))
  );

  private _covFlatten(domain: string, data: any, rows: any[]) {
    const tradMap = ReviewPage._TRAD_MAP[domain] ?? {};
    const push = (trad: string, field: string, value: string, conf = '') => {
      const label = tradMap[trad] ?? trad.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
      rows.push({ domain, tradition: label, field, value: String(value).trim(), confidence: conf, idx: rows.length });
    };
    if (Array.isArray(data)) {
      data.forEach((item: any, i: number) => {
        const trad = item?.sub_agent ?? `agent_${i+1}`;
        this._covFlatObj(trad, item, push);
      });
    } else if (typeof data === 'object') {
      const trad = data?.sub_agent ?? '';
      this._covFlatObj(trad, data, push);
    }
  }

  private _covFlatObj(trad: string, obj: any, push: (t: string, f: string, v: string, c?: string) => void) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (ReviewPage._SKIP_F.has(k) || v == null) continue;
      if (ReviewPage._LEAF.has(k) && Array.isArray(v)) {
        (v as any[]).forEach(item => item != null && push(trad, k, typeof item === 'object' ? JSON.stringify(item) : String(item)));
      } else if (Array.isArray(v)) {
        (v as any[]).forEach(item => item != null && push(trad, k, typeof item === 'object' ? JSON.stringify(item) : String(item)));
      } else if (typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v as any)) {
          if (sv != null) push(trad, `${k}.${sk}`, String(sv));
        }
      } else {
        push(trad, k, String(v));
      }
    }
  }

  covSetDomain(d: string) { this.covDomainSig.set(d); this.covPage.set(1); }
  covSetSearch(q: string) { this.covSearch.set(q); this.covPage.set(1); }
  covSetPageSize(n: number) { this.covPageSize.set(n); this.covPage.set(1); }
  covSortBy(f: string) {
    if (this.covSortField() === f) this.covSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    else { this.covSortField.set(f); this.covSortDir.set('asc'); }
    this.covPage.set(1);
  }
  covPrev() { if (this.covPage() > 1) this.covPage.update(p => p - 1); }
  covNext() { if (this.covPage() < this.covTotalPages()) this.covPage.update(p => p + 1); }
  covIcon(d: string) { return ReviewPage._ICONS[d] ?? '📦'; }
  covLabel(d: string) { return d.charAt(0).toUpperCase() + d.slice(1); }

  approvedInBlock(q: AdminQuestion): number {
    return q.insights.filter(i => this.approvedIds().has(i.id)).length;
  }

  // ── Domain/branch grouping ───────────────────────────────────────────────

  private static readonly _DOMAIN_META: Record<string, { label: string; icon: string; order: number }> = {
    astrology:   { label: 'Astrology',              icon: '★',  order: 1 },
    numerology:  { label: 'Numerology',             icon: '🔢', order: 2 },
    palmistry:   { label: 'Palmistry',              icon: '✋', order: 3 },
    tarot:       { label: 'Tarot',                  icon: '🃏', order: 4 },
    vastu:       { label: 'Vastu',                  icon: '🏠', order: 5 },
    _consensus:  { label: 'Cross-Domain Consensus', icon: '✦',  order: 6 },
  };

  private static readonly _BRANCH_LABELS: Record<string, string> = {
    vedic:       'Vedic (Jyotish)',
    kp:          'KP System',
    western:     'Western',
    indian:      'Indian',
    chaldean:    'Chaldean',
    pythagorean: 'Pythagorean',
    chinese:     'Chinese',
    universal:   'Universal',
    lal_kitab:   'Lal Kitab',
    vastu:       'Vastu Shastra',
    tarot:       'Tarot Reading',
    consensus:   'AI Synthesis',
  };

  readonly domainGroups = computed(() => {
    const blocks = this.questionBlocks();
    if (!blocks.length) return [];
    // Collect all unique domains across all questions
    const domains = new Set<string>();
    blocks.forEach(q => q.insights.forEach(i => i.domains.forEach(d => domains.add(d))));
    return [...domains].sort((a, b) => {
      const oa = ReviewPage._DOMAIN_META[a]?.order ?? 99;
      const ob = ReviewPage._DOMAIN_META[b]?.order ?? 99;
      return oa - ob;
    });
  });

  domainGroupsForQuestion(question: string, qi: number): Array<{
    domain: string; domainLabel: string; icon: string;
    branches: Array<{
      insightId: string; branchKey: string; branchLabel: string;
      content: string; confidence: string; edited: boolean;
      detail: InsightDetail;
    }>;
  }> {
    const qBlock = this.questionBlocks().find(q => q.question === question);
    if (!qBlock) return [];

    // Only show domains the user actually selected (+ consensus)
    const selectedModules: string[] = this.orch.currentInput()?.selected_modules ?? [];

    // Group insights by domain (consensus insights go into a special "_consensus" bucket)
    const byDomain: Record<string, typeof qBlock.insights> = {};
    for (const ins of qBlock.insights) {
      const dom = ins.id.endsWith('_consensus') ? '_consensus' : (ins.domains[0] ?? 'general');
      // Filter out domains not in selected_modules (always keep consensus)
      if (dom !== '_consensus' && selectedModules.length > 0 && !selectedModules.includes(dom)) continue;
      if (!byDomain[dom]) byDomain[dom] = [];
      byDomain[dom].push(ins);
    }

    return Object.entries(byDomain)
      .sort(([a], [b]) => {
        const oa = ReviewPage._DOMAIN_META[a]?.order ?? 99;
        const ob = ReviewPage._DOMAIN_META[b]?.order ?? 99;
        return oa - ob;
      })
      .map(([domain, insights]) => ({
        domain,
        domainLabel: ReviewPage._DOMAIN_META[domain]?.label ?? domain,
        icon: ReviewPage._DOMAIN_META[domain]?.icon ?? '✦',
        branches: insights.map(ins => {
          // Derive branch key from insight id (e.g. q1_i2) or sub_agent field
          const subAgent = ins.sub_agent ?? '';
          const branchKey = subAgent || ins.id;
          const knownBranch = Object.keys(ReviewPage._BRANCH_LABELS)
            .find(k => subAgent.toLowerCase() === k || subAgent.toLowerCase().startsWith(k));
          const branchLabel = knownBranch
            ? ReviewPage._BRANCH_LABELS[knownBranch]
            : (subAgent ? this._toTitleCase(subAgent) : `Finding ${ins.id}`);
          return {
            insightId:   ins.id,
            branchKey,
            branchLabel,
            content:     this._branchEdits[ins.id] ?? ins.content,
            confidence:  ins.confidence,
            edited:      !!ins.edited || !!this._branchEdits[ins.id],
            detail:      (ins.detail ?? {}) as InsightDetail,
          };
        }),
      }));
  }

  private _toTitleCase(s: string): string {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Template helpers for Object iteration
  objectEntries(obj: Record<string, any> | null | undefined): [string, any][] {
    return obj ? Object.entries(obj) : [];
  }
  objectKeys(obj: Record<string, any> | null | undefined): string[] {
    return obj ? Object.keys(obj) : [];
  }
  hasDetail(detail: InsightDetail | undefined): boolean {
    if (!detail) return false;
    return Object.values(detail).some(v =>
      v !== null && v !== undefined && v !== '' &&
      !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
    );
  }

  toggleBranchSelect(insightId: string, qBlock: AdminQuestion | null, branch: any) {
    this.selectedBranchIds.update(s => {
      const c = new Set(s);
      if (c.has(insightId)) {
        c.delete(insightId);
        // Also remove from approved/rejected when deselected
        this.approvedIds.update(a => { const ac = new Set(a); ac.delete(insightId); return ac; });
        this.rejectedIds.update(r => { const rc = new Set(r); rc.delete(insightId); return rc; });
      } else {
        c.add(insightId);
      }
      return c;
    });
  }

  transSectionApprovedCount(si: number): number {
    const section = this.translatedSections()[si];
    if (!section) return 0;
    return section.insights.filter(ins => this.transApprovedIds().has(ins.id)).length;
  }

  toggleApprove(id: string) {
    this.approvedIds.update(s => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });
    this.rejectedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }
  toggleReject(id: string) {
    this.rejectedIds.update(s => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });
    this.approvedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }
  approveAll() {
    // Approve all selected branches (if none selected, select+approve all)
    const selected = this.selectedBranchIds();
    if (selected.size === 0) {
      const all = this.questionBlocks().flatMap(q => q.insights.map(i => i.id));
      this.selectedBranchIds.set(new Set(all));
      this.approvedIds.set(new Set(all));
    } else {
      this.approvedIds.set(new Set(selected));
    }
    this.rejectedIds.set(new Set());
  }
  toggleEdit(id: string) { this.editingId.set(this.editingId() === id ? null : id); }
  onEdit(id: string, event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this._branchEdits[id] = val;
    this.orch.updateInsight(id, val);
  }

  toggleTransApprove(id: string) {
    this.transApprovedIds.update(s => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });
    this.transRejectedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }
  toggleTransReject(id: string) {
    this.transRejectedIds.update(s => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });
    this.transApprovedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }
  toggleTransEdit(id: string) { this.transEditingId.set(this.transEditingId() === id ? null : id); }
  onTransEdit(si: number, ii: number, event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.translatedSections.update(sections => {
      const copy = sections.map(s => ({ ...s, insights: [...s.insights] }));
      if (copy[si]?.insights[ii]) copy[si].insights[ii] = { ...copy[si].insights[ii], content: val };
      return copy;
    });
  }

  readonly generateError = signal('');

  async generate() {
    if (!this.orch.adminReview()) {
      this.generateError.set('No analysis data found. Please run the analysis first.');
      return;
    }
    this.generating.set(true);
    this.generateError.set('');
    this.chakraSpinning.set(true);
    const chakraTimer = new Promise(r => setTimeout(r, 5000));

    try {
      // Treat selected-but-not-explicitly-approved as approved
      const selected   = this.selectedBranchIds();
      const approved   = this.approvedIds();
      const rejected   = this.rejectedIds();
      // Any selected item that isn't rejected counts as approved
      const effectiveApproved = new Set([...approved]);
      for (const id of selected) {
        if (!rejected.has(id)) effectiveApproved.add(id);
      }
      // If nothing selected/approved at all, approve everything (admin wants full report)
      const allIds = this.questionBlocks().flatMap(q => q.insights.map(i => i.id));
      const finalApproved = effectiveApproved.size > 0 ? [...effectiveApproved] : allIds;
      await this.orch.approveAndGenerate(finalApproved, [...rejected]);
      this.reportGenerated.set(true);
      try {
        const res = await firstValueFrom(this.api.getLanguages());
        this.languages.set(res.languages);
      } catch { /* keep fallback */ }

      // If this was a lead reading, attach the report to the lead → triggers user's tracker to report_ready
      if (this.leadId()) {
        try {
          const report = this.orch.finalReport();
          await firstValueFrom(this.http.post(
            `${BACKEND}/admin/leads/${this.leadId()}/attach-report`,
            { report_json: JSON.stringify(report) }
          ));
        } catch { /* non-blocking — report still usable locally */ }
      }
    } catch (err: any) {
      this.generateError.set(err?.message ?? 'Failed to generate report. Please try again.');
    } finally {
      await chakraTimer;
      this.chakraSpinning.set(false);
      this.generating.set(false);
    }
  }

  async doTranslate() {
    const report = this.orch.finalReport();
    if (!report) {
      this.translateError.set('Generate the report first before translating.');
      return;
    }

    const lang = this.languages().find(l => l.code === this.selectedTranslateLang);
    this.pendingLangName.set(lang?.name ?? this.selectedTranslateLang);
    this.translating.set(true);
    this.translateError.set('');
    this.translatedSections.set([]);
    this.transApprovedIds.set(new Set());
    this.transRejectedIds.set(new Set());
    this.orch._setStepStatus('translate', 'running');

    try {
      const res = await firstValueFrom(this.api.translateReport({
        session_id:    this.orch.sessionId() ?? '',
        language_code: this.selectedTranslateLang,
        report:        report as any,
      }));

      this._translatedReport = res.final_report;
      this._translatedLangCode = this.selectedTranslateLang;

      // Extract per-insight translated sections from the translated report
      const sections = res.final_report?.sections ?? [];
      this.translatedSections.set(sections.map((sec: any) => ({
        question: sec.question ?? '',
        intent:   sec.intent ?? 'general',
        insights: (sec.insights ?? []).map((ins: any) => ({
          id:      ins.id,
          content: ins.content,
          domains: ins.domains ?? [],
        })),
      })));

      // Auto-approve all translated insights by default
      const allTransIds = sections.flatMap((s: any) => (s.insights ?? []).map((i: any) => i.id));
      this.transApprovedIds.set(new Set(allTransIds));
      this.orch._setStepStatus('translate', 'done');

    } catch (err: any) {
      this.orch._setStepStatus('translate', 'idle');
      this.translateError.set(
        err?.message ?? `Translation to ${this.pendingLangName()} failed. Please try again.`
      );
    } finally {
      this.translating.set(false);
    }
  }

  finalizeWithTranslation() {
    if (!this._translatedReport) return;

    // Apply any edits / rejections to the translated report before navigating
    const modified = { ...this._translatedReport };
    if (modified.sections) {
      modified.sections = modified.sections.map((sec: any, si: number) => {
        const transSec = this.translatedSections()[si];
        if (!transSec) return sec;
        return {
          ...sec,
          insights: (sec.insights ?? []).map((ins: any, ii: number) => {
            const transIns = transSec.insights[ii];
            const rejected = this.transRejectedIds().has(ins.id);
            return {
              ...ins,
              content: transIns?.content ?? ins.content,
              approved: !rejected,
            };
          }).filter((ins: any) => !this.transRejectedIds().has(ins.id)),
        };
      });
    }

    this.orch.finalReport.set(modified);
    this.router.navigate(['/report']);
  }

  finalizeReport() {
    this.router.navigate(['/report']);
  }

  goBack() {
    // F6: admin doing a lead reading should return to leads, not home
    if (this.auth.isAdmin() && this.leadId()) {
      this.router.navigate(['/admin/users']);
    } else {
      this.router.navigate(['/']);
    }
  }

  // ── Module methodology ───────────────────────────────────────────────────
  moduleMethodology(): Record<string, any> {
    return (this.orch.adminReview() as any)?.module_methodology ?? {};
  }

  // ── Astrology tab helpers ────────────────────────────────────────────────
  astroRaw(): any {
    return (this.orch.rawOutputs() as any)?.astrology ?? null;
  }

  private _astroChart(): any {
    return this.astroRaw()?.vedic?.chart ?? {};
  }

  lagnaRashi(): string {
    const a = this.astroRaw();
    return a?.vedic?.chart?.lagna ?? a?.lagna ?? '—';
  }

  currentDasha(): string {
    const a = this.astroRaw();
    return a?.vedic?.current_dasha ?? '—';
  }

  moonNakshatra(): string {
    return this._astroChart().nakshatra ?? '—';
  }

  isApproxChart(): boolean {
    return !!(this._astroChart().approximate);
  }

  ayanamsaLabel(): string {
    return this._astroChart().ayanamsa ?? 'Lahiri 23.86°';
  }

  coordSource(): string {
    const geo = (this.orch.rawOutputs() as any)?.astrology?.vedic?.chart?.coord_source;
    if (geo === 'geocoded') return 'Geocoded via Nominatim (lat/lon resolved from place name)';
    if (geo === 'builtin')  return 'Built-in city table (approximate coordinates)';
    return geo ?? 'Not resolved — chart may use default coordinates';
  }

  activeYogas(): string[] {
    return this.astroRaw()?.vedic?.active_yogas ?? [];
  }

  dashaSequence(): Array<{lord: string; years: number; current: boolean}> {
    return this.astroRaw()?.vedic?.dasha_sequence ?? [];
  }

  planetRows(): Array<{planet: string; rashi: string; longitude: string; nakshatra: string}> {
    const chart = this._astroChart();
    const planets = chart.planets ?? {};
    const lons = chart.planet_longitudes ?? {};
    const naks = chart.planet_nakshatras ?? {};

    const order = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];
    const rows = order.map(p => ({
      planet:    p,
      rashi:     planets[p] ?? '—',
      longitude: lons[p]    ? `${Number(lons[p]).toFixed(2)}°` : '—',
      nakshatra: naks[p]    ?? '—',
    }));

    rows.unshift({
      planet:    'Lagna',
      rashi:     chart.lagna ?? '—',
      longitude: chart.lagna_longitude ? `${Number(chart.lagna_longitude).toFixed(2)}°` : '—',
      nakshatra: '—',
    });

    return rows;
  }

  planetSymbol(planet: string): string {
    const s: Record<string, string> = {
      Sun:'☉', Moon:'☽', Mars:'♂', Mercury:'☿', Jupiter:'♃',
      Venus:'♀', Saturn:'♄', Rahu:'☊', Ketu:'☋', Lagna:'⊕',
    };
    return s[planet] ?? planet.slice(0, 2);
  }

  planetColor(planet: string): string {
    const c: Record<string, string> = {
      Sun:'#d97706', Moon:'#7c3aed', Mars:'#dc2626', Mercury:'#16a34a',
      Jupiter:'#d4af37', Venus:'#db2777', Saturn:'#374151',
      Rahu:'#0891b2', Ketu:'#92400e', Lagna:'#d4af37',
    };
    return c[planet] ?? '#374151';
  }
}

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
