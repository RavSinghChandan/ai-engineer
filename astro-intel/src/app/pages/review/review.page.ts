import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { AdminInsight, AdminQuestion } from '../../models/astro.models';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="review-shell">

      <!-- Top bar -->
      <header class="review-header">
        <div class="hdr-left">
          <button class="back-btn" (click)="goBack()">← Back</button>
          <div class="hdr-title">
            <span class="hdr-star">✦</span>
            <span>Admin Review Panel</span>
          </div>
          <span class="user-chip">{{ userName() }}</span>
        </div>
        <div class="hdr-right">
          <span class="section-count">{{ approvedCount() }} / {{ totalInsightCount() }} approved</span>
          <button class="approve-all-btn" (click)="approveAll()">Approve All</button>
          <button class="generate-btn" [disabled]="approvedCount() === 0" (click)="generate()">
            Generate Report →
          </button>
        </div>
      </header>

      <!-- Session info bar -->
      @if (orch.sessionId() || orch.backendMode() === 'local') {
        <div class="session-info-bar">
          @if (orch.sessionId()) {
            <span class="sib-item">Session: <code>{{ orch.sessionId().slice(0,8) }}…</code></span>
            <span class="sib-sep">·</span>
            <span class="sib-item">Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong></span>
            <span class="sib-sep">·</span>
            <span class="sib-item">Questions: <strong>{{ questionBlocks().length }}</strong></span>
            <span class="sib-sep">·</span>
            <span class="sib-green">Aura with Rav · 360° Multi-agent Pipeline</span>
          } @else {
            <span class="sib-amber">Local computation mode (backend offline)</span>
          }
        </div>
      }

      <!-- Tab bar -->
      <div class="tab-bar">
        <button class="tab" [class.tab-active]="activeTab() === 'review'" (click)="activeTab.set('review')">Review</button>
        <button class="tab" [class.tab-active]="activeTab() === 'raw'"    (click)="activeTab.set('raw')">Raw JSON</button>
        <button class="tab" [class.tab-active]="activeTab() === 'log'"    (click)="activeTab.set('log')">Agent Log</button>
      </div>

      <!-- REVIEW TAB -->
      @if (activeTab() === 'review') {
        <div class="review-body">

          @if (!questionBlocks().length) {
            <div class="empty-state">
              <p>No review data available. Please run the analysis first.</p>
              <button class="back-btn-plain" (click)="goBack()">← Go to Analysis</button>
            </div>
          }

          @for (qBlock of questionBlocks(); track qBlock.question; let qi = $index) {
            <div class="question-block">

              <!-- Question header -->
              <div class="question-hdr">
                <div class="q-number">Q{{ qi + 1 }}</div>
                <div class="q-info">
                  <div class="q-text">{{ qBlock.question }}</div>
                  <div class="q-intent-badge">{{ qBlock.intent | titlecase }}</div>
                </div>
                <div class="q-stats">
                  <span class="q-approved-count">{{ approvedInBlock(qBlock) }} / {{ qBlock.insights.length }} approved</span>
                </div>
              </div>

              <!-- Insights for this question -->
              <div class="insights-list">
                @for (insight of qBlock.insights; track insight.id) {
                  <div class="insight-card"
                       [class.insight-approved]="approvedIds().has(insight.id)"
                       [class.insight-rejected]="rejectedIds().has(insight.id)">

                    <div class="insight-hdr">
                      <div class="insight-meta">
                        <div class="insight-tags">
                          <span class="conf-badge"
                                [class.conf-high]="insight.confidence === 'high'"
                                [class.conf-medium]="insight.confidence === 'medium'"
                                [class.conf-low]="insight.confidence === 'low'">
                            {{ insight.confidence | uppercase }}
                          </span>
                          @if (insight.is_common) {
                            <span class="common-badge">MULTI-DOMAIN</span>
                          }
                          @for (d of insight.domains; track d) {
                            <span class="domain-tag">{{ d }}</span>
                          }
                          @if (insight.edited) {
                            <span class="edited-tag">Edited</span>
                          }
                        </div>
                        <div class="insight-id">{{ insight.id }}</div>
                      </div>
                      <div class="insight-actions">
                        <button class="edit-btn" (click)="toggleEdit(insight.id)">
                          {{ editingId() === insight.id ? 'Save' : 'Edit' }}
                        </button>
                        <button class="reject-btn"
                                [class.active-reject]="rejectedIds().has(insight.id)"
                                (click)="toggleReject(insight.id)">Reject</button>
                        <button class="approve-btn"
                                [class.active-approve]="approvedIds().has(insight.id)"
                                (click)="toggleApprove(insight.id)">Approve</button>
                      </div>
                    </div>

                    @if (editingId() === insight.id) {
                      <textarea class="insight-editor"
                                [value]="insight.content"
                                (input)="onEdit(insight.id, $event)"
                                rows="5"></textarea>
                    } @else {
                      <p class="insight-content">{{ insight.content }}</p>
                    }

                  </div>
                }
              </div>

            </div>
          }

        </div>
      }

      <!-- RAW JSON TAB -->
      @if (activeTab() === 'raw') {
        <div class="raw-body">
          <div class="raw-tabs">
            @for (key of rawKeys(); track key) {
              <button class="rtab" [class.rtab-active]="rawKey() === key" (click)="rawKey.set(key)">{{ key }}</button>
            }
          </div>
          <pre class="raw-pre">{{ rawJson() }}</pre>
        </div>
      }

      <!-- AGENT LOG TAB -->
      @if (activeTab() === 'log') {
        <div class="raw-body">
          <div class="log-header">
            <span class="log-title">Agent Execution Log</span>
            <span class="log-count">{{ orch.agentLog().length }} entries</span>
          </div>
          @if (!orch.agentLog().length) {
            <p class="log-empty">No agent log available — run the analysis first.</p>
          }
          <div class="log-list">
            @for (entry of orch.agentLog(); track $index) {
              <div class="log-row">
                <span class="log-idx">{{ $index + 1 }}</span>
                <span class="log-text">{{ entry }}</span>
              </div>
            }
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; background: #f7f4ee; font-family: Georgia, serif; }

    .review-shell { display: flex; flex-direction: column; min-height: 100vh; }

    /* Header */
    .review-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 24px; background: #fff; border-bottom: 1px solid #e8e4dc;
      flex-shrink: 0; flex-wrap: wrap;
    }
    .hdr-left  { display: flex; align-items: center; gap: 14px; }
    .hdr-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .hdr-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: #1a1a1a; }
    .hdr-star  { color: #d4af37; font-size: 18px; }
    .back-btn  { background: #f7f4ee; border: 1px solid #e8e4dc; color: #555; padding: 6px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; font-family: Georgia, serif; }
    .back-btn:hover { background: #eee; }
    .user-chip { background: rgba(212,175,55,0.12); color: #8a6a00; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; border: 1px solid rgba(212,175,55,0.3); }
    .section-count { color: #888; font-size: 12px; }
    .approve-all-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid #22c55e; background: transparent; color: #16a34a; font-size: 12px; font-weight: 600; cursor: pointer; font-family: Georgia, serif; }
    .approve-all-btn:hover { background: rgba(34,197,94,0.08); }
    .generate-btn { padding: 8px 20px; border-radius: 8px; border: none; background: linear-gradient(135deg, #8a6a00, #d4af37, #8a6a00); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; font-family: Georgia, serif; }
    .generate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Session info bar */
    .session-info-bar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      padding: 7px 24px; background: #f0fdf4; border-bottom: 1px solid #bbf7d0;
      flex-shrink: 0; font-size: 11.5px; font-family: Georgia, serif;
    }
    .sib-item { color: #374151; }
    .sib-item code { font-family: monospace; background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; }
    .sib-item strong { color: #8a6a00; }
    .sib-sep  { color: #d1d5db; }
    .sib-green { color: #15803d; font-weight: 600; }
    .sib-amber { color: #92400e; font-weight: 600; background: #fef3c7; padding: 2px 10px; border-radius: 99px; }

    /* Tab bar */
    .tab-bar { display: flex; background: #fff; border-bottom: 1px solid #e8e4dc; padding: 0 24px; flex-shrink: 0; }
    .tab { padding: 11px 20px; border: none; background: transparent; font-size: 13px; font-weight: 600; color: #888; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.15s; font-family: Georgia, serif; }
    .tab:hover { color: #8a6a00; }
    .tab-active { color: #8a6a00; border-bottom-color: #d4af37; }

    /* Review body */
    .review-body { flex: 1; overflow-y: auto; padding: 20px 24px 48px; display: flex; flex-direction: column; gap: 20px; }
    .review-body::-webkit-scrollbar { width: 6px; }
    .review-body::-webkit-scrollbar-track { background: transparent; }
    .review-body::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.3); border-radius: 99px; }
    .empty-state { text-align: center; padding: 60px 20px; color: #9ca3af; display: flex; flex-direction: column; align-items: center; gap: 14px; font-size: 14px; }
    .back-btn-plain { padding: 8px 20px; border-radius: 8px; border: 1px solid #e8e4dc; background: #fff; color: #555; font-size: 13px; cursor: pointer; font-family: Georgia, serif; }

    /* Question block */
    .question-block { background: #fff; border-radius: 14px; border: 1px solid #e8e4dc; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.05); }

    .question-hdr {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 16px 20px; background: linear-gradient(135deg, #fffbf0, #fff);
      border-bottom: 1px solid #e8e4dc;
    }
    .q-number { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #8a6a00, #d4af37); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
    .q-info { flex: 1; min-width: 0; }
    .q-text { font-size: 14px; font-weight: 600; color: #1a1a1a; line-height: 1.5; margin-bottom: 6px; }
    .q-intent-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: rgba(212,175,55,0.12); color: #8a6a00; border: 1px solid rgba(212,175,55,0.3); letter-spacing: 0.06em; text-transform: uppercase; }
    .q-stats { flex-shrink: 0; font-size: 11.5px; color: #888; padding-top: 6px; }
    .q-approved-count { font-weight: 600; color: #16a34a; }

    /* Insights list */
    .insights-list { display: flex; flex-direction: column; }

    .insight-card {
      padding: 18px 20px 22px; border-bottom: 1px solid #f0ece4;
      transition: background 0.15s; overflow: visible;
    }
    .insight-card:last-child { border-bottom: none; padding-bottom: 26px; }
    .insight-approved { background: #f0fdf4; }
    .insight-rejected { background: #fef2f2; opacity: 0.65; }

    .insight-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .insight-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .insight-tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .insight-id { font-size: 9px; color: #bbb; font-family: monospace; margin-top: 2px; }
    .insight-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }

    .conf-badge { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.08em; }
    .conf-high   { background: #dcfce7; color: #15803d; }
    .conf-medium { background: #fef9c3; color: #854d0e; }
    .conf-low    { background: #f3f4f6; color: #6b7280; }
    .common-badge { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; background: rgba(212,175,55,0.15); color: #8a6a00; border: 1px solid rgba(212,175,55,0.3); letter-spacing: 0.06em; }
    .domain-tag  { font-size: 9.5px; background: #f3f4f6; color: #555; padding: 2px 8px; border-radius: 99px; font-weight: 600; text-transform: capitalize; }
    .edited-tag  { font-size: 9.5px; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 99px; font-weight: 600; }

    .edit-btn    { padding: 5px 13px; border-radius: 6px; border: 1.5px solid #e5e7eb; background: transparent; font-size: 11px; font-weight: 600; color: #888; cursor: pointer; font-family: Georgia, serif; white-space: nowrap; }
    .edit-btn:hover { border-color: #d4af37; color: #8a6a00; }
    .reject-btn  { padding: 5px 13px; border-radius: 6px; border: 1.5px solid #fca5a5; background: transparent; font-size: 11px; font-weight: 600; color: #ef4444; cursor: pointer; font-family: Georgia, serif; white-space: nowrap; }
    .active-reject  { background: #ef4444; color: #fff; border-color: #ef4444; }
    .approve-btn { padding: 5px 13px; border-radius: 6px; border: 1.5px solid #86efac; background: transparent; font-size: 11px; font-weight: 600; color: #16a34a; cursor: pointer; font-family: Georgia, serif; white-space: nowrap; }
    .active-approve { background: #22c55e; color: #fff; border-color: #22c55e; }

    .insight-content {
      font-size: 14px; color: #374151; line-height: 1.85;
      margin: 0; padding-bottom: 4px;
      display: block; overflow: visible; word-wrap: break-word;
    }
    .insight-editor  { width: 100%; border: 1.5px solid #d4af37; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #374151; line-height: 1.7; resize: vertical; font-family: Georgia, serif; outline: none; box-sizing: border-box; background: #fffbf0; min-height: 100px; }

    /* Raw JSON */
    .raw-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 16px; gap: 10px; }
    .raw-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .rtab { padding: 5px 14px; border-radius: 99px; border: 1.5px solid #e5e7eb; background: transparent; font-size: 11.5px; font-weight: 600; color: #6b7280; cursor: pointer; text-transform: capitalize; font-family: Georgia, serif; }
    .rtab-active { background: #8a6a00; color: #fff; border-color: #8a6a00; }
    .raw-pre { flex: 1; overflow: auto; background: #1a1a2e; color: #a5f3fc; font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 16px; border-radius: 12px; margin: 0; line-height: 1.7; }

    /* Agent Log */
    .log-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .log-title  { font-size: 13px; font-weight: 700; color: #374151; font-family: Georgia, serif; }
    .log-count  { font-size: 11px; color: #9ca3af; background: #f3f4f6; padding: 2px 10px; border-radius: 99px; }
    .log-empty  { color: #9ca3af; font-size: 13px; text-align: center; padding: 40px; }
    .log-list   { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
    .log-row    { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border-radius: 8px; background: #1a1a2e; font-size: 11.5px; line-height: 1.6; }
    .log-idx    { flex-shrink: 0; color: #d4af37; font-family: monospace; font-weight: 700; min-width: 20px; }
    .log-text   { color: #a5f3fc; font-family: 'JetBrains Mono', monospace; }
  `]
})
export class ReviewPage {
  private router = inject(Router);
  readonly orch  = inject(OrchestratorService);

  readonly activeTab   = signal<'review'|'raw'|'log'>('review');
  readonly editingId   = signal<string|null>(null);
  readonly approvedIds = signal<Set<string>>(new Set());
  readonly rejectedIds = signal<Set<string>>(new Set());
  readonly rawKey      = signal<string>('astrology');

  readonly questionBlocks = computed(() => this.orch.adminReview()?.questions ?? []);
  readonly userName       = computed(() => this.orch.currentInput()?.user_profile.full_name ?? '—');

  readonly totalInsightCount = computed(() =>
    this.questionBlocks().reduce((sum, q) => sum + q.insights.length, 0)
  );
  readonly approvedCount = computed(() => this.approvedIds().size);

  readonly rawKeys = computed(() => {
    const out = this.orch.rawOutputs();
    return Object.keys(out).filter(k => (out as any)[k] !== undefined);
  });

  readonly rawJson = computed(() => {
    const out = this.orch.rawOutputs();
    const key = this.rawKey();
    return JSON.stringify((out as any)[key] ?? {}, null, 2);
  });

  approvedInBlock(q: AdminQuestion): number {
    return q.insights.filter(i => this.approvedIds().has(i.id)).length;
  }

  toggleApprove(id: string): void {
    this.approvedIds.update(s => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });
    this.rejectedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }

  toggleReject(id: string): void {
    this.rejectedIds.update(s => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });
    this.approvedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }

  approveAll(): void {
    const allIds = this.questionBlocks().flatMap(q => q.insights.map(i => i.id));
    this.approvedIds.set(new Set(allIds));
    this.rejectedIds.set(new Set());
  }

  toggleEdit(id: string): void {
    this.editingId.set(this.editingId() === id ? null : id);
  }

  onEdit(id: string, event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.orch.updateInsight(id, val);
  }

  generate(): void {
    const approved = [...this.approvedIds()];
    const rejected = [...this.rejectedIds()];
    this.orch.approveAndGenerate(approved, rejected).then(() => {
      this.router.navigate(['/report']);
    });
  }

  goBack(): void { this.router.navigate(['/']); }
}
