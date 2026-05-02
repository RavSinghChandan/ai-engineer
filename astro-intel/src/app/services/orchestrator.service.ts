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
  readonly englishReport       = signal<FinalReport | null>(null); // always the original English
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
        this.englishReport.set(report);
        return report;
      } catch { /* fall through to local */ }
    }

    // Local fallback: build report from current adminReview
    const review = this.adminReview();
    if (!review) throw new Error('No review available');

    const sections = review.questions.map(q => {
      const approved = q.insights
        .filter(i => approvedIds.includes(i.id))
        .map(i => ({ ...i, approved: true }));
      // Build domain breakdown
      const domain_breakdown: Record<string, string[]> = {};
      for (const ins of approved) {
        for (const d of ins.domains) {
          if (!domain_breakdown[d]) domain_breakdown[d] = [];
          domain_breakdown[d].push(ins.content);
        }
      }
      // Simple narrative: join approved contents ordered by confidence
      const ordered = [
        ...approved.filter(i => i.confidence === 'high'),
        ...approved.filter(i => i.confidence === 'medium'),
        ...approved.filter(i => !['high','medium'].includes(i.confidence)),
      ];
      const narrative = ordered.map(i => i.content.replace(/\.$/, '')).join('. ') + (ordered.length ? '.' : '');
      // Build simple_narrative: deduplicate sentences, strip tradition prefixes
      const PREFIXES = [
        'From the Vedic perspective,', 'From the Indian Numerology perspective,',
        'From the Chaldean Numerology perspective,', 'From the Pythagorean Numerology perspective,',
        'From the KP system perspective,', 'From the Western astrology perspective,',
        'In Western astrology,', 'The KP system analyses', 'The combined wisdom of',
      ];
      const stripPrefix = (s: string) => {
        for (const p of PREFIXES) { if (s.startsWith(p)) { const r = s.slice(p.length).trim(); return r[0]?.toUpperCase() + r.slice(1); } }
        return s;
      };
      const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const dedup = (arr: string[]) => {
        const seen: string[] = [];
        return arr.filter(s => {
          const k = key(s); const w = new Set(k.split(' '));
          const dup = seen.some(sk => { const sw = new Set(sk.split(' ')); const inter = [...w].filter(x => sw.has(x)).length; return inter / Math.max(w.size, sw.size) > 0.75; });
          if (!dup) seen.push(k); return !dup;
        });
      };
      const allSents = ordered.flatMap(i => i.content.split(/(?<=[.!?])\s+/)).filter(Boolean);
      const simplified = dedup(allSents.map(stripPrefix).filter(s => !s.startsWith('The combined wisdom')));
      const simple_narrative = simplified.slice(0, 6).join('  ');

      // ── Structured summary: WHO/WHAT/WHEN/WHERE/HOW from insight sentences ──
      // Fully generic — keyword slot assignment, works for any question type
      const SLOT_KW: Record<string, string[]> = {
        who:   ['partner','person','mentor','guide','support','advisor','doctor','colleague','friend','family','teacher','compatibility','soulmate','companion','life path'],
        what:  ['indicates','suggests','shows','analysis','chart','tradition','reading','insight','energy','theme','pattern','favourable','positive','active','highlighted'],
        when:  ['age','ages','year','month','period','phase','timing','time','window','cycle','soon','current','next','within'],
        where: ['focus','environment','place','setting','direction','zone','space','location','area','field','sector','channel'],
        how:   ['practice','action','step','habit','meditation','mantra','routine','daily','consistent','build','invest','begin','open','communicate','express'],
      };
      const SLOT_SECOND: Record<string, string> = {
        who:   'The right people and circumstances are drawn toward those who are clear about their values and what they want.',
        what:  'Multiple spiritual traditions agree on this theme, which increases the reliability of this indication.',
        when:  'Acting with intention during this active window will yield far better results than waiting for conditions to be perfect.',
        where: 'Environments that feel naturally aligned with your energy are showing you where your momentum most wants to flow.',
        how:   'Consistent small actions, taken daily without exception, will compound into significant change within 90 days.',
      };
      const HW_LABELS: Record<string, string> = {
        who:   'Who is the key person or support in this?',
        what:  'What does the analysis say?',
        when:  'When is the best time to act?',
        where: 'Where should you focus your energy?',
        how:   'How can you take action?',
      };
      const INTENT_HABITS: Record<string, string[]> = {
        marriage:    ['Practice active, judgment-free listening in all important conversations.','Express one genuine appreciation to your partner or loved ones daily.','Work on your own inner growth — a fulfilled individual brings more to a relationship.'],
        career:      ['Begin each workday with 5 minutes of intention-setting.','Invest in one meaningful professional connection per week.','Dedicate focused, uninterrupted time to your most important task daily.'],
        finance:     ['Track every expense for 30 days — awareness is the foundation of financial growth.','Set up automatic savings on the 1st of each month.','Pause 48 hours before making major financial decisions.'],
        health:      ['Begin with 20 minutes of morning sunlight daily.','Aim for 7–8 hours of sleep — recovery is when transformation happens.','Walk 30 minutes daily.'],
        spirituality:['Practice 10 minutes of silent sitting each morning before any screen.','Keep a spiritual journal — write reflections and gratitude nightly.','Spend time in nature weekly.'],
        education:   ['Study in 50-minute focused blocks then take a 10-minute break.','Review notes within 24 hours of learning.','Maintain a regular sleep schedule during exam periods.'],
        travel:      ['Begin travel planning 3–6 months in advance.','Keep travel documents organised and accessible.','Journal your travels — writing anchors experiences.'],
        children:    ['Create consistent daily rituals with your child — predictability builds security.','Practice active, curious listening with children.','Read together daily — even 15 minutes deepens connection.'],
        general:     ['Begin each morning with 10 minutes of mindful breathing.','Keep a gratitude journal — write 3 things you appreciate each evening.','Spend 20 minutes in natural sunlight daily.'],
      };

      const hw_sentences = dedup(allSents.map(stripPrefix));
      const usedIdx = new Set<number>();
      const slots: Record<string, string[]> = { who: [], what: [], when: [], where: [], how: [] };
      for (const slot of ['who','what','when','where','how']) {
        for (let si = 0; si < hw_sentences.length; si++) {
          if (usedIdx.has(si)) continue;
          if (SLOT_KW[slot].some(kw => hw_sentences[si].toLowerCase().includes(kw))) {
            slots[slot].push(hw_sentences[si]); usedIdx.add(si);
            if (slots[slot].length >= 2) break;
          }
        }
      }
      const rem = hw_sentences.filter((_, si) => !usedIdx.has(si));
      let ri = 0;
      for (const slot of ['who','what','when','where','how']) {
        if (!slots[slot].length && rem.length) slots[slot].push(rem[ri++ % rem.length]);
      }
      const hw_bullets = ['who','what','when','where','how'].map(slot => {
        const sents = slots[slot];
        const first = sents[0] || 'The traditions indicate a positive period for this area of your life.';
        const answer = sents.length >= 2 ? `${first} ${sents[1]}` : `${first.replace(/\.$/, '')}. ${SLOT_SECOND[slot]}`;
        return { label: HW_LABELS[slot], answer };
      });
      const INTENT_COLORS: Record<string, string[]> = {
        marriage:     ['Rose Pink', 'Ivory', 'Lavender'],
        career:       ['Royal Blue', 'Gold', 'White'],
        finance:      ['Green', 'Gold', 'Yellow'],
        health:       ['Green', 'White', 'Sky Blue'],
        spirituality: ['Violet', 'White', 'Indigo'],
        education:    ['Yellow', 'Green', 'White'],
        travel:       ['Orange', 'Blue', 'White'],
        children:     ['Soft Yellow', 'Green', 'White'],
        general:      ['Gold', 'White', 'Green'],
      };
      const INTENT_MANTRAS: Record<string, string[]> = {
        marriage:     ['Om Shukraya Namah — Venus blessings for love and harmony (108 times)', 'Om Namah Shivaya — Well-being, protection, and inner peace (108 times)'],
        career:       ['Om Suryaya Namah — Confidence, clarity, and professional success (108 times)', 'Gayatri Mantra — Wisdom and divine clarity of mind (21 times)'],
        finance:      ['Om Lakshmyai Namah — Abundance, prosperity, and financial flow (108 times)', 'Om Ganeshaya Namah — Removing obstacles on your path (108 times)'],
        health:       ['Om Dhanvantre Namah — Healing, vitality, and well-being (108 times)', 'Mahamrityunjaya Mantra — Protection and strength of body and mind (11 times)'],
        spirituality: ['Om Namah Shivaya — Inner peace, higher awareness, and liberation (108 times)', 'So Hum — I am that, connecting to universal consciousness (21 times)'],
        education:    ['Om Saraswatyai Namah — Knowledge, wisdom, and academic clarity (108 times)', 'Gayatri Mantra — Divine light and intellect (21 times)'],
        travel:       ['Om Gam Ganapataye Namah — Safe journeys and removal of obstacles (108 times)', 'Om Namah Shivaya — Overall protection and well-being (108 times)'],
        children:     ['Om Santana Gopala Namah — Blessings for family and children (108 times)', 'Om Namah Shivaya — Protection and inner peace for the family (108 times)'],
        general:      ['Om Namah Shivaya — Overall well-being, protection, and inner peace (108 times)', 'Gayatri Mantra — Wisdom, divine light, and clarity of mind (21 times)'],
      };

      const habits = (INTENT_HABITS[q.intent] || INTENT_HABITS['general']).slice(0, 3);
      const intentColors = (INTENT_COLORS[q.intent] || INTENT_COLORS['general']);
      const intentMantras = (INTENT_MANTRAS[q.intent] || INTENT_MANTRAS['general']);
      const remedy_bullets = {
        daily_habits: habits,
        mantras: intentMantras,
        lucky_colors: intentColors.map(c => `Wear or surround yourself with ${c}`),
      };
      const structured_summary = { question: q.question, intent: q.intent, hw_bullets, remedy_bullets };

      return { question: q.question, intent: q.intent, narrative, simple_narrative, structured_summary, insights: approved, domain_breakdown };
    }).filter(s => s.insights.length > 0);

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
    this.englishReport.set(report);
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
    this.englishReport.set(null);
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
