import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ApiService, LanguageOption } from '../../services/api.service';
import { AdminInsight, AdminQuestion } from '../../models/astro.models';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="shell">

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
    </div>

    <div class="hdr-right">
      <div class="progress-pill">
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="approvalPct()"></div>
        </div>
        <span class="progress-label">{{ approvedCount() }}/{{ totalInsightCount() }}</span>
      </div>
      <button class="btn-outline-green" (click)="approveAll()">Approve All</button>
      @if (!reportGenerated()) {
        <button class="btn-primary" [disabled]="approvedCount() === 0 || generating()" (click)="generate()">
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

      @for (qBlock of questionBlocks(); track qBlock.question; let qi = $index) {
        <div class="q-card">

          <!-- Question header -->
          <div class="q-hdr">
            <div class="q-num-circle">Q{{ qi + 1 }}</div>
            <div class="q-info">
              <div class="q-text">{{ qBlock.question }}</div>
              <div class="q-meta">
                <span class="intent-tag">{{ qBlock.intent | titlecase }}</span>
                <span class="q-stat">{{ approvedInBlock(qBlock) }}/{{ qBlock.insights.length }} approved</span>
              </div>
            </div>
          </div>

          <!-- Insights -->
          <div class="insights">
            @for (ins of qBlock.insights; track ins.id) {
              <div class="insight"
                   [class.insight-on]="approvedIds().has(ins.id)"
                   [class.insight-off]="rejectedIds().has(ins.id)">

                <div class="insight-top">
                  <div class="insight-tags">
                    <span class="conf"
                          [class.conf-h]="ins.confidence==='high'"
                          [class.conf-m]="ins.confidence==='medium'"
                          [class.conf-l]="ins.confidence==='low'">
                      {{ ins.confidence | uppercase }}
                    </span>
                    @if (ins.is_common) {
                      <span class="multi-tag">MULTI-DOMAIN</span>
                    }
                    @for (d of ins.domains; track d) {
                      <span class="domain-tag">{{ d }}</span>
                    }
                    @if (ins.edited) {
                      <span class="edited-tag">Edited</span>
                    }
                    <span class="ins-id">{{ ins.id }}</span>
                  </div>

                  <div class="insight-actions">
                    <button class="act-btn act-edit" (click)="toggleEdit(ins.id)">
                      {{ editingId() === ins.id ? '✓ Save' : 'Edit' }}
                    </button>
                    <button class="act-btn act-reject"
                            [class.act-reject-on]="rejectedIds().has(ins.id)"
                            (click)="toggleReject(ins.id)">Reject</button>
                    <button class="act-btn act-approve"
                            [class.act-approve-on]="approvedIds().has(ins.id)"
                            (click)="toggleApprove(ins.id)">
                      @if (approvedIds().has(ins.id)) {
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      }
                      Approve
                    </button>
                  </div>
                </div>

                @if (editingId() === ins.id) {
                  <textarea class="ins-editor"
                    [value]="ins.content"
                    (input)="onEdit(ins.id, $event)"
                    rows="4"></textarea>
                } @else {
                  <p class="ins-text">{{ ins.content }}</p>
                }

              </div>
            }
          </div>

        </div>
      }

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

</div>
  `,
  styles: [`
/* ── Shell ────────────────────────────────────────────────────────────────── */
:host { display: flex; flex-direction: column; min-height: 100vh; background: #f5f3ef; }
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
  `]
})
export class ReviewPage {
  private router = inject(Router);
  private api    = inject(ApiService);
  readonly orch  = inject(OrchestratorService);

  readonly activeTab   = signal<'review'|'translate'|'raw'|'log'>('review');
  readonly editingId   = signal<string|null>(null);
  readonly approvedIds = signal<Set<string>>(new Set());
  readonly rejectedIds = signal<Set<string>>(new Set());
  readonly rawKey      = signal<string>('astrology');

  // Report generation state
  readonly generating     = signal(false);
  readonly reportGenerated = signal(false);

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

  readonly totalInsightCount = computed(() =>
    this.questionBlocks().reduce((sum, q) => sum + q.insights.length, 0)
  );
  readonly approvedCount = computed(() => this.approvedIds().size);
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

  approvedInBlock(q: AdminQuestion): number {
    return q.insights.filter(i => this.approvedIds().has(i.id)).length;
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
    const all = this.questionBlocks().flatMap(q => q.insights.map(i => i.id));
    this.approvedIds.set(new Set(all));
    this.rejectedIds.set(new Set());
  }
  toggleEdit(id: string) { this.editingId.set(this.editingId() === id ? null : id); }
  onEdit(id: string, event: Event) {
    this.orch.updateInsight(id, (event.target as HTMLTextAreaElement).value);
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

  async generate() {
    this.generating.set(true);
    try {
      await this.orch.approveAndGenerate([...this.approvedIds()], [...this.rejectedIds()]);
      this.reportGenerated.set(true);
      // Load languages from backend for translation tab
      try {
        const res = await firstValueFrom(this.api.getLanguages());
        this.languages.set(res.languages);
      } catch { /* keep fallback */ }
    } finally {
      this.generating.set(false);
    }
  }

  async doTranslate() {
    const report = this.orch.finalReport();
    if (!report) return;

    const lang = this.languages().find(l => l.code === this.selectedTranslateLang);
    this.pendingLangName.set(lang?.name ?? this.selectedTranslateLang);
    this.translating.set(true);
    this.translateError.set('');
    this.translatedSections.set([]);
    this.transApprovedIds.set(new Set());
    this.transRejectedIds.set(new Set());

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

    } catch (err: any) {
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

  goBack() { this.router.navigate(['/']); }
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
