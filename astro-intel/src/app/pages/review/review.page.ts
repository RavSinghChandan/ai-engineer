import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ReviewSection, Confidence } from '../../models/astro.models';

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
          <span class="section-count">{{ approvedCount() }} / {{ totalCount() }} approved</span>
          <button class="approve-all-btn" (click)="approveAll()">Approve All</button>
          <button class="generate-btn" [disabled]="approvedCount() === 0" (click)="generate()">
            Generate Report →
          </button>
        </div>
      </header>

      <!-- Session / mode info bar -->
      @if (orch.sessionId() || orch.backendMode() === 'local') {
        <div class="session-info-bar">
          @if (orch.sessionId()) {
            <span class="sib-item">🔗 Backend session: <code>{{ orch.sessionId() }}</code></span>
            <span class="sib-sep">·</span>
            <span class="sib-item">🎯 Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong></span>
            <span class="sib-sep">·</span>
            <span class="sib-item sib-green">⚡ LangGraph multi-agent</span>
          } @else {
            <span class="sib-item sib-amber">⚙ Local computation mode (backend offline)</span>
          }
        </div>
      }

      <!-- Raw outputs tab bar -->
      <div class="tab-bar">
        <button class="tab" [class.tab-active]="activeTab() === 'review'" (click)="activeTab.set('review')">📋 Admin Review</button>
        <button class="tab" [class.tab-active]="activeTab() === 'raw'"    (click)="activeTab.set('raw')">&#123;&#125; Raw JSON</button>
        <button class="tab" [class.tab-active]="activeTab() === 'log'"    (click)="activeTab.set('log')">📜 Agent Log</button>
      </div>

      <!-- REVIEW TAB -->
      @if (activeTab() === 'review') {
        <div class="review-body">

          @if (!sections().length) {
            <div class="empty-state">
              <p>No review data available. Please run the analysis first.</p>
              <button class="back-btn" (click)="goBack()">← Go to Analysis</button>
            </div>
          }

          @for (section of sections(); track section.id) {
            <div class="section-card" [class.section-approved]="approvedIds().has(section.id)" [class.section-rejected]="rejectedIds().has(section.id)">

              <!-- Section header -->
              <div class="section-hdr">
                <div class="section-meta">
                  <h3 class="section-title">{{ section.title }}</h3>
                  <div class="section-tags">
                    <span class="conf-badge" [class.conf-high]="section.confidence === 'high'" [class.conf-medium]="section.confidence === 'medium'" [class.conf-low]="section.confidence === 'low'">
                      {{ section.confidence | uppercase }} CONFIDENCE
                    </span>
                    @for (src of section.sources; track src) {
                      <span class="src-tag">{{ src }}</span>
                    }
                    @if (section.edited) {
                      <span class="edited-tag">✏ Edited</span>
                    }
                  </div>
                </div>
                <div class="section-actions">
                  <button class="edit-btn" (click)="toggleEdit(section.id)">
                    {{ editingId() === section.id ? '✓ Save' : '✏ Edit' }}
                  </button>
                  <button class="reject-btn"  [class.active-reject]="rejectedIds().has(section.id)"  (click)="toggleReject(section.id)">✗ Reject</button>
                  <button class="approve-btn" [class.active-approve]="approvedIds().has(section.id)" (click)="toggleApprove(section.id)">✓ Approve</button>
                </div>
              </div>

              <!-- Content: editable or display -->
              @if (editingId() === section.id) {
                <textarea class="section-editor" [value]="section.content" (input)="onEdit(section.id, $event)" rows="6"></textarea>
              } @else {
                <p class="section-content">{{ section.content }}</p>
              }

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
            <span class="log-title">LangGraph Agent Execution Log</span>
            <span class="log-count">{{ orch.agentLog().length }} entries</span>
          </div>
          @if (!orch.agentLog().length) {
            <p class="log-empty">No agent log available — run the analysis first or backend may be offline.</p>
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
    :host { display: block; height: 100vh; overflow: hidden; background: #f5f4f0; display: flex; flex-direction: column; }

    /* ── Header ── */
    .review-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 24px; background: #1a0533; flex-shrink: 0;
      flex-wrap: wrap; gap: 10px;
    }
    .hdr-left  { display: flex; align-items: center; gap: 14px; }
    .hdr-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .hdr-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: #fff; }
    .hdr-star  { color: #f5c842; font-size: 18px; }
    .back-btn  { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; }
    .back-btn:hover { background: rgba(255,255,255,0.2); }
    .user-chip { background: rgba(245,200,66,0.2); color: #f5c842; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; }
    .section-count { color: rgba(255,255,255,0.6); font-size: 12px; }
    .approve-all-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid #22c55e; background: transparent; color: #22c55e; font-size: 12px; font-weight: 600; cursor: pointer; }
    .approve-all-btn:hover { background: rgba(34,197,94,0.15); }
    .generate-btn { padding: 8px 20px; border-radius: 8px; border: none; background: linear-gradient(135deg, #7c3aed, #9333ea); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
    .generate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Session info bar ── */
    .session-info-bar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      padding: 7px 24px; background: #f0fdf4; border-bottom: 1px solid #bbf7d0;
      flex-shrink: 0; font-size: 11.5px;
    }
    .sib-item { color: #374151; }
    .sib-item code { font-family: monospace; background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; }
    .sib-item strong { color: #7c3aed; }
    .sib-sep { color: #d1d5db; }
    .sib-green { color: #15803d; font-weight: 600; }
    .sib-amber { color: #92400e; font-weight: 600; background: #fef3c7; padding: 2px 10px; border-radius: 99px; }

    /* ── Tab bar ── */
    .tab-bar { display: flex; gap: 0; background: #fff; border-bottom: 1px solid #e8e4dc; padding: 0 24px; flex-shrink: 0; }
    .tab { padding: 11px 20px; border: none; background: transparent; font-size: 13px; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.15s; }
    .tab:hover { color: #7c3aed; }
    .tab-active { color: #7c3aed; border-bottom-color: #7c3aed; }

    /* ── Review body ── */
    .review-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }

    .empty-state { text-align: center; padding: 60px 20px; color: #9ca3af; display: flex; flex-direction: column; align-items: center; gap: 14px; font-size: 14px; }

    /* ── Section card ── */
    .section-card {
      background: #fff; border-radius: 12px; border: 2px solid #e8e4dc;
      padding: 18px 20px; transition: border-color 0.2s;
    }
    .section-approved { border-color: #22c55e; background: #f0fdf4; }
    .section-rejected { border-color: #ef4444; background: #fef2f2; opacity: 0.65; }

    .section-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
    .section-meta { flex: 1; min-width: 0; }
    .section-title { font-size: 15px; font-weight: 700; color: #1f1035; margin: 0 0 6px; }
    .section-tags  { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .section-actions { display: flex; gap: 6px; flex-shrink: 0; }

    .conf-badge { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.08em; }
    .conf-high   { background: #dcfce7; color: #15803d; }
    .conf-medium { background: #fef9c3; color: #854d0e; }
    .conf-low    { background: #f3f4f6; color: #6b7280; }

    .src-tag { font-size: 9.5px; background: #ede9fe; color: #7c3aed; padding: 2px 8px; border-radius: 99px; font-weight: 600; text-transform: capitalize; }
    .edited-tag { font-size: 9.5px; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 99px; font-weight: 600; }

    .edit-btn    { padding: 5px 13px; border-radius: 8px; border: 1.5px solid #e5e7eb; background: transparent; font-size: 11.5px; font-weight: 600; color: #6b7280; cursor: pointer; }
    .edit-btn:hover { border-color: #9333ea; color: #9333ea; }
    .reject-btn  { padding: 5px 13px; border-radius: 8px; border: 1.5px solid #fca5a5; background: transparent; font-size: 11.5px; font-weight: 600; color: #ef4444; cursor: pointer; }
    .active-reject  { background: #ef4444; color: #fff; border-color: #ef4444; }
    .approve-btn { padding: 5px 13px; border-radius: 8px; border: 1.5px solid #86efac; background: transparent; font-size: 11.5px; font-weight: 600; color: #16a34a; cursor: pointer; }
    .active-approve { background: #22c55e; color: #fff; border-color: #22c55e; }

    .section-content { font-size: 13.5px; color: #374151; line-height: 1.75; margin: 0; }
    .section-editor { width: 100%; border: 1.5px solid #9333ea; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #374151; line-height: 1.7; resize: vertical; font-family: inherit; outline: none; box-sizing: border-box; background: #fdf4ff; }

    /* ── Raw JSON ── */
    .raw-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 16px; gap: 10px; }
    .raw-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .rtab { padding: 5px 14px; border-radius: 99px; border: 1.5px solid #e5e7eb; background: transparent; font-size: 11.5px; font-weight: 600; color: #6b7280; cursor: pointer; text-transform: capitalize; }
    .rtab-active { background: #7c3aed; color: #fff; border-color: #7c3aed; }
    .raw-pre { flex: 1; overflow: auto; background: #1a0533; color: #a5f3fc; font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 16px; border-radius: 12px; margin: 0; line-height: 1.7; }

    /* ── Agent Log ── */
    .log-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .log-title  { font-size: 13px; font-weight: 700; color: #374151; }
    .log-count  { font-size: 11px; color: #9ca3af; background: #f3f4f6; padding: 2px 10px; border-radius: 99px; }
    .log-empty  { color: #9ca3af; font-size: 13px; text-align: center; padding: 40px; }
    .log-list   { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .log-row {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 12px; border-radius: 8px; background: #1a0533;
      font-size: 11.5px; line-height: 1.6;
    }
    .log-idx  { flex-shrink: 0; color: #f5c842; font-family: monospace; font-weight: 700; min-width: 20px; }
    .log-text { color: #a5f3fc; font-family: 'JetBrains Mono', monospace; }
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

  readonly sections = computed(() => this.orch.adminReview()?.sections ?? []);
  readonly userName  = computed(() => this.orch.currentInput()?.user_profile.full_name ?? '—');

  readonly totalCount    = computed(() => this.sections().length);
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

  toggleApprove(id: string): void {
    this.approvedIds.update(s => {
      const c = new Set(s);
      c.has(id) ? c.delete(id) : c.add(id);
      return c;
    });
    this.rejectedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }

  toggleReject(id: string): void {
    this.rejectedIds.update(s => {
      const c = new Set(s);
      c.has(id) ? c.delete(id) : c.add(id);
      return c;
    });
    this.approvedIds.update(s => { const c = new Set(s); c.delete(id); return c; });
  }

  approveAll(): void {
    this.approvedIds.set(new Set(this.sections().map(s => s.id)));
    this.rejectedIds.set(new Set());
  }

  toggleEdit(id: string): void {
    if (this.editingId() === id) {
      this.editingId.set(null);
    } else {
      this.editingId.set(id);
    }
  }

  onEdit(id: string, event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.orch.updateSection(id, val);
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
