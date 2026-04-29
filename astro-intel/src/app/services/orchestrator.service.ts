import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  SystemInput, AgentOutputs, AdminReview, AdminInsight, AdminQuestion,
  FinalReport, Module, AgentStep, NormalizedQuestion
} from '../models/astro.models';
import { ApiService, RunResponse } from './api.service';

import { NumerologyService } from './numerology.service';
import { AstrologyService }  from './astrology.service';
import { PalmistryService }  from './palmistry.service';
import { TarotService }      from './tarot.service';
import { VastuService }      from './vastu.service';
import { RemedyService }     from './remedy.service';

@Injectable({ providedIn: 'root' })
export class OrchestratorService {

  // ── State signals ──────────────────────────────────────────────────────────
  readonly steps               = signal<AgentStep[]>([]);
  readonly isRunning           = signal(false);
  readonly isDone              = signal(false);
  readonly rawOutputs          = signal<AgentOutputs>({});
  readonly adminReview         = signal<AdminReview | null>(null);
  readonly finalReport         = signal<FinalReport | null>(null);
  readonly currentInput        = signal<SystemInput | null>(null);
  readonly sessionId           = signal<string>('');
  readonly agentLog            = signal<string[]>([]);
  readonly focusContext        = signal<Record<string, any>>({});
  readonly normalizedQuestions = signal<NormalizedQuestion[]>([]);
  readonly backendMode         = signal<'backend' | 'local'>('backend');
  readonly backendError        = signal<string>('');

  readonly progress = computed(() => {
    const s = this.steps();
    if (!s.length) return 0;
    return Math.round(s.filter(x => x.status === 'done').length / s.length * 100);
  });

  private api       = inject(ApiService);
  private numSvc    = inject(NumerologyService);
  private astroSvc  = inject(AstrologyService);
  private palmSvc   = inject(PalmistryService);
  private tarotSvc  = inject(TarotService);
  private vastuSvc  = inject(VastuService);
  private remedySvc = inject(RemedyService);

  // ── Run ────────────────────────────────────────────────────────────────────
  async run(input: SystemInput): Promise<void> {
    this.currentInput.set(input);
    this.isRunning.set(true);
    this.isDone.set(false);
    this.adminReview.set(null);
    this.finalReport.set(null);
    this.backendError.set('');
    this.sessionId.set('');
    this.agentLog.set([]);
    this.focusContext.set({});
    this.normalizedQuestions.set([]);

    const steps = this._buildSteps(input.selected_modules);
    this.steps.set(steps);
    const animTimer = this._startAnimation(steps);

    try {
      const res = await firstValueFrom(this.api.runAnalysis({
        user_profile:     input.user_profile as any,
        user_question:    input.user_question ?? '',
        questions:        input.questions ?? [],
        selected_modules: input.selected_modules,
        module_inputs:    input.module_inputs ?? {},
      }));

      clearInterval(animTimer);
      this._markAllDone(steps);

      this.sessionId.set(res.session_id);
      this.agentLog.set(res.agent_log ?? []);
      this.focusContext.set(res.focus_context ?? {});
      this.normalizedQuestions.set(res.normalized_questions ?? []);
      this.backendMode.set('backend');

      this.adminReview.set(this._mapAdminReview(res.admin_review));
      this.rawOutputs.set(this._mapRawOutputs(res.raw_outputs));

    } catch (err: any) {
      clearInterval(animTimer);
      this._markAllDone(steps);
      this.backendError.set(err?.message ?? 'Backend unavailable — using local computation.');
      this.backendMode.set('local');
      await this._runLocal(input, steps);
    }

    this.isRunning.set(false);
    this.isDone.set(true);
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  async approveAndGenerate(approvedIds: string[], rejectedIds: string[]): Promise<FinalReport> {
    const input = this.currentInput()!;

    if (this.backendMode() === 'backend' && this.sessionId()) {
      try {
        const res = await firstValueFrom(this.api.approveReport({
          session_id:           this.sessionId(),
          approved_insight_ids: approvedIds,
          rejected_insight_ids: rejectedIds,
          brand_name:           'Aura with Rav',
        }));
        const report = res.final_report as unknown as FinalReport;
        this.finalReport.set(report);
        return report;
      } catch { /* fall through to local */ }
    }

    // Local fallback: build report from current adminReview
    const review = this.adminReview();
    if (!review) throw new Error('No review available');

    const sections = review.questions.map(q => ({
      question: q.question,
      intent:   q.intent,
      insights: q.insights
        .filter(i => approvedIds.includes(i.id))
        .map(i => ({ ...i, approved: true })),
    })).filter(s => s.insights.length > 0);

    const report: FinalReport = {
      brand_name:   'Aura with Rav',
      logo_url:     '{{LOGO_URL}}',
      image_url:    '{{IMAGE_URL}}',
      report_title: '360° Spiritual Intelligence Report',
      user_name:    input.user_profile.full_name,
      questions:    review.questions.map(q => q.question),
      generated_at: new Date().toISOString(),
      modules_used: input.selected_modules,
      sections,
      disclaimer:   'This report is for spiritual guidance and personal reflection only.',
      closing_note: 'Use this as a compass, not a map. Your choices remain the most powerful force in your journey.',
      confidence_distribution: { high: 0, medium: 0, low: 0 },
    };
    this.finalReport.set(report);
    return report;
  }

  // ── Edit insight content ───────────────────────────────────────────────────
  updateInsight(id: string, content: string): void {
    this.adminReview.update(r => {
      if (!r) return r;
      return {
        ...r,
        questions: r.questions.map(q => ({
          ...q,
          insights: q.insights.map(i => i.id === id ? { ...i, content, edited: true } : i),
        })),
      };
    });
  }

  reset(): void {
    this.steps.set([]);
    this.isRunning.set(false);
    this.isDone.set(false);
    this.rawOutputs.set({});
    this.adminReview.set(null);
    this.finalReport.set(null);
    this.currentInput.set(null);
    this.sessionId.set('');
    this.agentLog.set([]);
    this.focusContext.set({});
    this.normalizedQuestions.set([]);
    this.backendError.set('');
  }

  // ── Map backend admin_review to frontend model ─────────────────────────────
  private _mapAdminReview(raw: any): AdminReview {
    if (raw?.questions && Array.isArray(raw.questions)) {
      return {
        subject: raw.subject ?? '',
        questions: (raw.questions as any[]).map(q => ({
          question: q.question,
          intent:   q.intent,
          insights: (q.insights ?? []).map((i: any) => ({
            id:         i.id,
            content:    i.content,
            confidence: i.confidence ?? 'medium',
            domains:    i.domains ?? [],
            is_common:  i.is_common ?? false,
            editable:   true,
            edited:     false,
          })),
        })),
      };
    }
    // Legacy flat sections fallback
    const sections = (raw?.sections ?? []);
    return {
      subject: raw?.subject ?? '',
      questions: [{
        question: raw?.question ?? 'General life overview.',
        intent:   raw?.focus ?? 'general',
        insights: sections.map((s: any, i: number) => ({
          id:         s.id ?? `q1_i${i+1}`,
          content:    s.content ?? '',
          confidence: s.confidence ?? 'medium',
          domains:    s.sources ?? [],
          is_common:  (s.sources?.length ?? 0) >= 3,
          editable:   true,
          edited:     false,
        })),
      }],
    };
  }

  private _mapRawOutputs(raw: any): AgentOutputs {
    return {
      astrology:   raw?.astrology,
      numerology:  raw?.numerology,
      palmistry:   raw?.palmistry,
      tarot:       raw?.tarot,
      vastu:       raw?.vastu,
      remedies:    raw?.remedies,
      consolidated: raw?.consolidated,
    };
  }

  // ── Local fallback ─────────────────────────────────────────────────────────
  private async _runLocal(input: SystemInput, _steps: AgentStep[]): Promise<void> {
    const outputs: AgentOutputs = {};
    if (input.selected_modules.includes('astrology'))  outputs.astrology  = this.astroSvc.compute(input.user_profile as any);
    if (input.selected_modules.includes('numerology')) outputs.numerology = this.numSvc.compute(input.user_profile as any);
    if (input.selected_modules.includes('palmistry'))  outputs.palmistry  = this.palmSvc.compute(input.module_inputs?.['palmistry'] ?? {});
    if (input.selected_modules.includes('tarot'))      outputs.tarot      = this.tarotSvc.compute(input.module_inputs?.['tarot'] ?? {}, this._seed(input.user_profile.full_name));
    if (input.selected_modules.includes('vastu'))      outputs.vastu      = this.vastuSvc.compute(input.module_inputs?.['vastu'] ?? {});
    outputs.remedies = this.remedySvc.compute(outputs);
    this.rawOutputs.set(outputs);

    const allQuestions = [
      ...(input.user_question ? [input.user_question] : []),
      ...(input.questions ?? []),
    ].filter(Boolean);
    if (!allQuestions.length) allQuestions.push('General life overview.');

    const review = this._buildLocalAdminReview(outputs, input.selected_modules, allQuestions);
    this.adminReview.set(review);
  }

  private _buildLocalAdminReview(outputs: AgentOutputs, mods: string[], questions: string[]): AdminReview {
    return {
      subject: '',
      questions: questions.map((q, qi) => {
        const insights: AdminInsight[] = [];
        insights.push({
          id: `q${qi+1}_i1`, content: `Regarding "${q}": combined analysis suggests a positive, growth-oriented response. Your natural strengths guide this path.`,
          confidence: 'medium', domains: mods, is_common: mods.length >= 3, editable: true,
        });
        if (outputs.astrology) {
          const a = outputs.astrology as any;
          insights.push({
            id: `q${qi+1}_i2`, content: `Astrology: ${a.predictions?.[0] ?? 'Steady growth is indicated.'}`,
            confidence: 'high', domains: ['astrology'], is_common: false, editable: true,
          });
        }
        if (outputs.numerology) {
          const n = Array.isArray(outputs.numerology) ? outputs.numerology[0] : outputs.numerology;
          const pred = (n as any)?.predictions?.[0] ?? 'Life path energy supports steady advancement.';
          insights.push({
            id: `q${qi+1}_i3`, content: `Numerology: ${pred}`,
            confidence: 'medium', domains: ['numerology'], is_common: false, editable: true,
          });
        }
        if (outputs.remedies) {
          const habits = (outputs.remedies as any)?.daily_habits?.[0] ?? '';
          if (habits) insights.push({
            id: `q${qi+1}_remedy`, content: `Recommended practice: ${habits}`,
            confidence: 'high', domains: ['astrology','numerology'], is_common: true, editable: true,
          });
        }
        return { question: q, intent: 'general', insights };
      }),
    };
  }

  // ── Step helpers ───────────────────────────────────────────────────────────
  private _buildSteps(mods: Module[]): AgentStep[] {
    const steps: AgentStep[] = [{ id: 'question', label: 'Question Normalization Agent', status: 'idle' }];
    if (mods.includes('astrology'))  steps.push(
      { id: 'astro-vedic',    label: 'Vedic Astrology Agent',       status: 'idle', tradition: 'Vedic' },
      { id: 'astro-kp',       label: 'KP Astrology Agent',          status: 'idle', tradition: 'KP' },
      { id: 'astro-western',  label: 'Western Astrology Agent',     status: 'idle', tradition: 'Western' },
    );
    if (mods.includes('numerology')) steps.push(
      { id: 'num-indian',     label: 'Indian Numerology Agent',     status: 'idle', tradition: 'Indian' },
      { id: 'num-chaldean',   label: 'Chaldean Numerology Agent',   status: 'idle', tradition: 'Chaldean' },
      { id: 'num-pythagorean',label: 'Pythagorean Numerology Agent',status: 'idle', tradition: 'Pythagorean' },
    );
    if (mods.includes('palmistry'))  steps.push(
      { id: 'palm-indian',    label: 'Indian Palmistry Agent',      status: 'idle', tradition: 'Indian' },
      { id: 'palm-chinese',   label: 'Chinese Palmistry Agent',     status: 'idle', tradition: 'Chinese' },
      { id: 'palm-western',   label: 'Western Palmistry Agent',     status: 'idle', tradition: 'Western' },
    );
    if (mods.includes('tarot'))  steps.push(
      { id: 'tarot-rw',       label: 'Rider-Waite Tarot Agent',     status: 'idle', tradition: 'Rider-Waite' },
      { id: 'tarot-int',      label: 'Intuitive Tarot Agent',       status: 'idle', tradition: 'Intuitive' },
    );
    if (mods.includes('vastu'))  steps.push(
      { id: 'vastu-trad',     label: 'Traditional Vastu Agent',     status: 'idle', tradition: 'Traditional' },
      { id: 'vastu-modern',   label: 'Modern Vastu Agent',          status: 'idle', tradition: 'Modern' },
    );
    steps.push({ id: 'meta',   label: 'Meta Consensus Agent',           status: 'idle' });
    steps.push({ id: 'remedy', label: 'Remedy Synthesis Agent',         status: 'idle' });
    steps.push({ id: 'admin',  label: 'Admin Review Generation Agent',  status: 'idle' });
    return steps;
  }

  private _startAnimation(steps: AgentStep[]): ReturnType<typeof setInterval> {
    let i = 0;
    return setInterval(() => {
      if (i < steps.length) {
        if (i > 0) steps[i-1].status = 'done';
        steps[i].status = 'running';
        this.steps.set([...steps]);
        i++;
      }
    }, 350);
  }

  private _markAllDone(steps: AgentStep[]): void {
    steps.forEach(s => s.status = 'done');
    this.steps.set([...steps]);
  }

  private _seed(str: string): number {
    return Array.from(str).reduce((a, c) => a + c.charCodeAt(0), 0);
  }
}
