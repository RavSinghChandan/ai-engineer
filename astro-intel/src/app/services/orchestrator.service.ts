import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  SystemInput, AgentOutputs, AdminReview, ReviewSection, FinalReport,
  Module, AgentStep
} from '../models/astro.models';
import { ApiService, RunResponse } from './api.service';

// local fallback services
import { NumerologyService } from './numerology.service';
import { AstrologyService }  from './astrology.service';
import { PalmistryService }  from './palmistry.service';
import { TarotService }      from './tarot.service';
import { VastuService }      from './vastu.service';
import { RemedyService }     from './remedy.service';

@Injectable({ providedIn: 'root' })
export class OrchestratorService {

  // ── State signals ──────────────────────────────────────────────────────────
  readonly steps        = signal<AgentStep[]>([]);
  readonly isRunning    = signal(false);
  readonly isDone       = signal(false);
  readonly rawOutputs   = signal<AgentOutputs>({});
  readonly adminReview  = signal<AdminReview | null>(null);
  readonly finalReport  = signal<FinalReport | null>(null);
  readonly currentInput = signal<SystemInput | null>(null);
  readonly sessionId    = signal<string>('');
  readonly agentLog     = signal<string[]>([]);
  readonly focusContext = signal<Record<string, any>>({});
  readonly backendMode  = signal<'backend' | 'local'>('backend');
  readonly backendError = signal<string>('');

  readonly progress = computed(() => {
    const s = this.steps();
    if (!s.length) return 0;
    const done = s.filter(x => x.status === 'done').length;
    return Math.round((done / s.length) * 100);
  });

  private api      = inject(ApiService);
  private numSvc   = inject(NumerologyService);
  private astroSvc = inject(AstrologyService);
  private palmSvc  = inject(PalmistryService);
  private tarotSvc = inject(TarotService);
  private vastuSvc = inject(VastuService);
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

    const steps = this._buildSteps(input.selected_modules);
    this.steps.set(steps);

    // Animate steps while waiting for backend
    const animTimer = this._startAnimation(steps);

    try {
      const res = await firstValueFrom(this.api.runAnalysis({
        user_profile:     input.user_profile as any,
        user_question:    (input as any).user_question ?? '',
        selected_modules: input.selected_modules,
        module_inputs:    input.module_inputs ?? {},
      }));

      clearInterval(animTimer);
      this._markAllDone(steps);

      // Store backend results
      this.sessionId.set(res.session_id);
      this.agentLog.set(res.agent_log ?? []);
      this.focusContext.set(res.focus_context ?? {});
      this.backendMode.set('backend');

      // Map backend admin_review to our model
      const review = this._mapAdminReview(res.admin_review);
      this.adminReview.set(review);
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

  // ── Approve (calls backend or builds locally) ──────────────────────────────
  async approveAndGenerate(approved: string[], rejected: string[]): Promise<FinalReport> {
    const input = this.currentInput()!;

    if (this.backendMode() === 'backend' && this.sessionId()) {
      try {
        const res = await firstValueFrom(this.api.approveReport({
          session_id: this.sessionId(),
          approved_sections: approved,
          rejected_sections: rejected,
          brand_name: 'AstroIntel 360°',
        }));
        const report = this._buildFinalReport(input, approved, res.final_report);
        this.finalReport.set(report);
        return report;
      } catch { /* fall through to local */ }
    }

    // Local fallback
    const review = this.adminReview();
    if (!review) throw new Error('No review available');
    const approvedSections = review.sections.filter(s => approved.includes(s.id)).map(s => ({ ...s, approved: true }));
    const report: FinalReport = {
      brand_name: 'AstroIntel 360°',
      image_url: '{{IMAGE_URL}}',
      user_name: input.user_profile.full_name,
      generated_at: new Date().toISOString(),
      sections: approvedSections,
      raw_outputs: this.rawOutputs(),
    };
    this.finalReport.set(report);
    return report;
  }

  updateSection(id: string, content: string): void {
    this.adminReview.update(r => {
      if (!r) return r;
      return { ...r, sections: r.sections.map(s => s.id === id ? { ...s, content, edited: true } : s) };
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
    this.backendError.set('');
  }

  // ── Local fallback ─────────────────────────────────────────────────────────
  private async _runLocal(input: SystemInput, steps: AgentStep[]): Promise<void> {
    const outputs: AgentOutputs = {};
    if (input.selected_modules.includes('astrology'))  outputs.astrology  = this.astroSvc.compute(input.user_profile as any);
    if (input.selected_modules.includes('numerology')) outputs.numerology = this.numSvc.compute(input.user_profile as any);
    if (input.selected_modules.includes('palmistry'))  outputs.palmistry  = this.palmSvc.compute(input.module_inputs?.['palmistry'] ?? {});
    if (input.selected_modules.includes('tarot'))      outputs.tarot      = this.tarotSvc.compute(input.module_inputs?.['tarot'] ?? {}, this._seed(input.user_profile.full_name));
    if (input.selected_modules.includes('vastu'))      outputs.vastu      = this.vastuSvc.compute(input.module_inputs?.['vastu'] ?? {});
    outputs.remedies = this.remedySvc.compute(outputs);
    this.rawOutputs.set(outputs);
    const review = this._buildLocalAdminReview(outputs, input.selected_modules, (input as any).user_question ?? '');
    this.adminReview.set(review);
  }

  // ── Mapping helpers ────────────────────────────────────────────────────────
  private _mapAdminReview(raw: any): AdminReview {
    const sections = (raw?.sections ?? []).map((s: any) => ({
      id:         s.id,
      title:      s.title,
      content:    s.content,
      confidence: s.confidence,
      sources:    s.sources ?? [],
      approved:   false,
      edited:     false,
    }));
    return { sections };
  }

  private _mapRawOutputs(raw: any): AgentOutputs {
    return {
      astrology:  raw?.astrology?.vedic  ?? raw?.astrology,
      numerology: raw?.numerology ? Object.values(raw.numerology) : undefined,
      palmistry:  raw?.palmistry  ? Object.values(raw.palmistry)  : undefined,
      tarot:      raw?.tarot?.universal ?? raw?.tarot,
      vastu:      raw?.vastu?.vedic     ?? raw?.vastu,
      remedies:   raw?.remedies,
    } as any;
  }

  private _buildFinalReport(input: SystemInput, approved: string[], backendReport: any): FinalReport {
    const review = this.adminReview()!;
    const approvedSections = review.sections.filter(s => approved.includes(s.id)).map(s => ({ ...s, approved: true }));
    return {
      brand_name:   backendReport.brand_name ?? 'AstroIntel 360°',
      image_url:    backendReport.image_url  ?? '{{IMAGE_URL}}',
      user_name:    input.user_profile.full_name,
      generated_at: backendReport.generated_at ?? new Date().toISOString(),
      sections:     approvedSections,
      raw_outputs:  this.rawOutputs(),
    };
  }

  private _buildLocalAdminReview(outputs: AgentOutputs, mods: string[], question: string): AdminReview {
    const sections: ReviewSection[] = [];
    const traits = this._collectTraits(outputs);
    const topTraits = this._topPatterns(traits);

    if (question) sections.push({ id: 'sec_answer', title: 'Answer to Your Question', content: `Regarding your question: "${question}" — the combined analysis suggests a positive, growth-oriented response. ${topTraits.join(', ')} are your core strengths guiding this path.`, confidence: 'medium', sources: mods as any });
    sections.push({ id: 'sec_personality', title: 'Personality Overview', content: `There is a strong tendency toward ${topTraits.slice(0,3).join(', ')} — consistent across multiple traditions.`, confidence: topTraits.length >= 3 ? 'high' : 'medium', sources: ['astrology','numerology','palmistry'] as any });
    sections.push({ id: 'sec_career', title: 'Career & Vocation', content: this._careerText(outputs), confidence: 'medium', sources: ['astrology','numerology'] as any });
    sections.push({ id: 'sec_relationships', title: 'Relationships & Emotional Life', content: this._relText(outputs), confidence: 'medium', sources: ['palmistry','astrology'] as any });
    sections.push({ id: 'sec_health', title: 'Health & Vitality', content: this._healthText(outputs), confidence: 'medium', sources: ['palmistry','astrology'] as any });
    if (outputs.astrology) sections.push({ id: 'sec_timing', title: 'Current Dasha & Timing', content: `Currently running ${(outputs.astrology as any).current_dasha}. ${(outputs.astrology as any).predictions?.[0] ?? ''}`, confidence: 'high', sources: ['astrology'] as any });
    if (outputs.remedies) {
      sections.push({ id: 'sec_remedy_habits', title: 'Daily Habits & Lifestyle', content: (outputs.remedies as any).daily_habits?.join(' ') ?? '', confidence: 'high', sources: mods as any });
      sections.push({ id: 'sec_remedy_mantras', title: 'Mantras & Spiritual Practices', content: (outputs.remedies as any).mantras?.map((m: any) => `${m.mantra} — ${m.purpose}`).join('; ') ?? '', confidence: 'high', sources: ['astrology','numerology'] as any });
      sections.push({ id: 'sec_remedy_behavioral', title: 'Behavioral Adjustments', content: (outputs.remedies as any).behavioral_adjustments?.join(' ') ?? '', confidence: 'high', sources: mods as any });
    }
    return { sections };
  }

  private _collectTraits(outputs: AgentOutputs): string[] {
    const t: string[] = [];
    if (outputs.numerology) (outputs.numerology as any[]).forEach(n => t.push(...(n.traits ?? [])));
    if (outputs.palmistry)  (outputs.palmistry  as any[]).forEach(p => t.push(...(p.traits ?? [])));
    return t;
  }

  private _topPatterns(items: string[]): string[] {
    const freq: Record<string, number> = {};
    for (const t of items) { const k = t.toLowerCase().trim(); freq[k] = (freq[k] ?? 0) + 1; }
    return Object.entries(freq).filter(([,c]) => c >= 2).sort((a,b) => b[1]-a[1]).map(([k]) => k).slice(0,4);
  }

  private _careerText(o: AgentOutputs): string {
    const preds = (o.astrology as any)?.predictions ?? [];
    const notes = (o.palmistry as any[])?.[0]?.career_notes ?? [];
    return [...preds.slice(0,2), ...notes.slice(0,1)].join(' ') || 'Steady career growth is indicated.';
  }

  private _relText(o: AgentOutputs): string {
    const notes = (o.palmistry as any[])?.[0]?.relationship_notes ?? [];
    return notes.join(' ') || 'Deep, loyal partnerships are indicated.';
  }

  private _healthText(o: AgentOutputs): string {
    const notes = (o.palmistry as any[])?.[0]?.health_notes ?? [];
    return notes.join(' ') || 'Good health is generally indicated.';
  }

  private _buildFinalReport2 = this._buildFinalReport;

  // ── Step helpers ───────────────────────────────────────────────────────────
  private _buildSteps(mods: Module[]): AgentStep[] {
    const steps: AgentStep[] = [{ id: 'question', label: 'Question Interpretation Agent', status: 'idle' }];
    if (mods.includes('astrology'))  steps.push({ id: 'astro',    label: 'Vedic Astrology Agent',          status: 'idle' });
    if (mods.includes('numerology')) steps.push(...[
      { id: 'num-indian',      label: 'Indian Numerology Agent',      status: 'idle' as const, tradition: 'Indian' },
      { id: 'num-chaldean',    label: 'Chaldean Numerology Agent',    status: 'idle' as const, tradition: 'Chaldean' },
      { id: 'num-pythagorean', label: 'Pythagorean Numerology Agent', status: 'idle' as const, tradition: 'Pythagorean' },
    ]);
    if (mods.includes('palmistry'))  steps.push(...[
      { id: 'palm-indian',  label: 'Indian Palmistry Agent',  status: 'idle' as const, tradition: 'Indian' },
      { id: 'palm-chinese', label: 'Chinese Palmistry Agent', status: 'idle' as const, tradition: 'Chinese' },
      { id: 'palm-western', label: 'Western Palmistry Agent', status: 'idle' as const, tradition: 'Western' },
    ]);
    if (mods.includes('tarot'))  steps.push({ id: 'tarot', label: 'Tarot Reading Agent',         status: 'idle' });
    if (mods.includes('vastu'))  steps.push({ id: 'vastu', label: 'Vastu Analysis Agent',         status: 'idle' });
    steps.push({ id: 'meta',    label: 'Meta Consensus Agent',           status: 'idle' });
    steps.push({ id: 'remedy',  label: 'Remedy Synthesis Agent',         status: 'idle' });
    steps.push({ id: 'review',  label: 'Admin Review Generation Agent',  status: 'idle' });
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
    }, 400);
  }

  private _markAllDone(steps: AgentStep[]): void {
    steps.forEach(s => s.status = 'done');
    this.steps.set([...steps]);
  }

  private _seed(str: string): number {
    return Array.from(str).reduce((a, c) => a + c.charCodeAt(0), 0);
  }
}
