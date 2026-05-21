import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  SystemInput, AgentOutputs, AdminReview, AdminInsight, AdminQuestion,
  FinalReport, Module, AgentStep, NormalizedQuestion, HwBullet, DomainSummaryGroup, DomainSubGroup
} from '../models/astro.models';
import { ApiService, RunResponse } from './api.service';

import { NumerologyService } from './numerology.service';
import { AstrologyService }  from './astrology.service';
import { PalmistryService }  from './palmistry.service';
import { TarotService }      from './tarot.service';
import { VastuService }      from './vastu.service';
import { RemedyService }     from './remedy.service';
import { GeocodeService }    from './geocode.service';
import { GrammarService }   from './grammar.service';

// Known tradition order per domain — matches the backend sub-agent execution order.
// Used to assign tradition labels by position when sub_agent field is missing.
const DOMAIN_TRADITIONS: Record<string, string[]> = {
  astrology:  ['vedic_parashara', 'kp_system',    'western_tropical'],
  numerology: ['indian_vedic',    'chaldean',      'pythagorean'],
  palmistry:  ['indian',          'chinese',       'western'],
  tarot:      ['rider_waite',     'intuitive'],
  vastu:      ['traditional',     'modern'],
};

// Parse tradition from content text as secondary signal (used to disambiguate when text has clear keywords)
function _extractTraditionFromContent(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('indian numerology') || lower.includes('indian vedic numerology')) return 'indian_vedic';
  if (lower.includes('chaldean numerology') || lower.includes('chaldean')) return 'chaldean';
  if (lower.includes('pythagorean numerology') || lower.includes('pythagorean')) return 'pythagorean';
  if (lower.includes('kp analysis') || lower.includes('kp system') || lower.includes('kp wealth') || lower.includes('krishnamurti')) return 'kp_system';
  if (lower.includes('western tropical') || lower.includes('tropical astrology')) return 'western_tropical';
  if (lower.includes('vedic') || lower.includes('parashara') || lower.includes('jyotish')) return 'vedic_parashara';
  if (lower.includes('chinese palmistry') || lower.includes('chinese palm')) return 'chinese';
  if (lower.includes('western palmistry') || lower.includes('western palm')) return 'western';
  if (lower.includes('indian palmistry') || lower.includes('hasta samudrika')) return 'indian';
  if (lower.includes('rider-waite') || lower.includes('rider waite')) return 'rider_waite';
  if (lower.includes('intuitive tarot')) return 'intuitive';
  if (lower.includes('traditional vastu') || lower.includes('vedic vastu')) return 'traditional';
  if (lower.includes('modern vastu')) return 'modern';
  return '';
}

function _formatSubAgentLabel(subAgent: string): string {
  // Convert sub_agent keys like "vedic_parashara", "kp_system", "western_tropical",
  // "indian_vedic", "chaldean", "pythagorean" into readable labels
  const MAP: Record<string, string> = {
    vedic_parashara: 'Vedic (Parashara)',
    kp_system:       'KP System',
    western_tropical:'Western Tropical',
    indian_vedic:    'Indian Vedic',
    chaldean:        'Chaldean',
    pythagorean:     'Pythagorean',
    indian:          'Indian',
    chinese:         'Chinese',
    western:         'Western',
    rider_waite:     'Rider-Waite',
    intuitive:       'Intuitive',
    traditional:     'Traditional Vastu',
    modern:          'Modern Vastu',
  };
  return MAP[subAgent.toLowerCase()] ?? subAgent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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
  readonly cacheHit            = signal(false);
  // tracks how many analyses this session has completed (used for USER free tier logic)
  readonly runCount            = signal<number>(0);

  readonly progress = computed(() => {
    const s = this.steps();
    if (!s.length) return 0;
    return Math.round(s.filter(x => x.status === 'done').length / s.length * 100);
  });

  private api       = inject(ApiService);
  private numSvc    = inject(NumerologyService);
  private astroSvc  = inject(AstrologyService);
  private geoSvc    = inject(GeocodeService);
  private palmSvc   = inject(PalmistryService);
  private tarotSvc  = inject(TarotService);
  private vastuSvc  = inject(VastuService);
  private remedySvc  = inject(RemedyService);
  private grammarSvc = inject(GrammarService);

  // ── Run ────────────────────────────────────────────────────────────────────
  async run(input: SystemInput): Promise<void> {
    this.currentInput.set(input);
    this.isRunning.set(true);
    this.isDone.set(false);
    this.cacheHit.set(false);
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
      // Geocode birth place for precise astronomical computation
      let geocodeData: any = null;
      const place = (input.user_profile as any).place_of_birth ?? '';
      if (place && input.selected_modules.includes('astrology')) {
        const geo = await this.geoSvc.resolve(place);
        if (geo?.lat) {
          geocodeData = { lat: geo.lat, lon: geo.lon, timezone: geo.timezone };
        }
      }

      const res = await firstValueFrom(this.api.runAnalysis({
        user_profile:     input.user_profile as any,
        user_id:          input.user_id ?? 'anonymous',
        user_question:    input.user_question ?? '',
        questions:        input.questions ?? [],
        selected_modules: input.selected_modules,
        module_inputs:    input.module_inputs ?? {},
        geocode:          geocodeData,
        prompt_version:   (input as any).prompt_version ?? 'v2',
      }));

      clearInterval(animTimer);

      if (res.cache_hit) {
        // Skip animation — instantly mark everything done
        this.cacheHit.set(true);
      }
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
      try {
        await this._runLocal(input, steps);
      } catch (localErr: any) {
        // Last resort: set minimal adminReview so review page always has data
        const allQ = [input.user_question, ...(input.questions ?? [])].filter(Boolean);
        this.adminReview.set({
          subject: '',
          questions: (allQ.length ? allQ : ['General life overview.']).map((q, qi) => ({
            question: q,
            intent: 'general',
            insights: [{
              id: `q${qi+1}_i1`,
              content: `Combined analysis of ${input.selected_modules.join(', ')} indicates a positive, growth-oriented period. Your natural strengths support steady progress.`,
              confidence: 'medium' as any,
              domains: input.selected_modules,
              is_common: true,
              editable: true,
            }],
          })),
        });
      }
    }

    this.isRunning.set(false);
    this.isDone.set(true);
    this.runCount.update(n => n + 1);
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  async approveAndGenerate(approvedIds: string[], rejectedIds: string[]): Promise<FinalReport> {
    const input = this.currentInput()!;
    console.log('[APPROVE] approvedIds count:', approvedIds.length, '| backendMode:', this.backendMode());

    // Check if any insights have been edited locally
    const review = this.adminReview();
    const hasEdits = review?.questions.some(q => q.insights.some(i => (i as any).edited));

    // Always build locally so domain_summary (rich bullet groups) is present in the report.
    // Fire the backend approve call in the background for logging only — do not use its report format.
    if (this.backendMode() === 'backend' && this.sessionId() && !hasEdits) {
      this._setStepStatus('report',   'running');
      this._setStepStatus('simplify', 'running');
      this.api.approveReport({
        session_id:           this.sessionId(),
        approved_insight_ids: approvedIds,
        rejected_insight_ids: rejectedIds,
        brand_name:           'Aura with Rav',
      }).subscribe({ error: () => {} });
      this._setStepStatus('report',   'done');
      this._setStepStatus('simplify', 'done');
    }

    // Local fallback: build report from current adminReview (includes any edited content)
    if (!review) throw new Error('No review available');

    const DOMAIN_META: Record<string, { label: string; icon: string; order: number }> = {
      astrology:  { label: 'Astrology',    icon: '★',  order: 1 },
      numerology: { label: 'Numerology',   icon: '🔢', order: 2 },
      palmistry:  { label: 'Palmistry',    icon: '✋', order: 3 },
      tarot:      { label: 'Tarot',        icon: '🃏', order: 4 },
      vastu:      { label: 'Vastu Shastra',icon: '🏠', order: 5 },
    };

    const sections = await Promise.all(review.questions.map(async q => {
      const approved = q.insights
        .filter(i => approvedIds.includes(i.id))
        .map(i => ({ ...i, approved: true }));
      // Build domain breakdown — exclude remedy/consensus insights
      const domain_breakdown: Record<string, string[]> = {};
      for (const ins of approved) {
        if (ins.id.endsWith('_remedy') || ins.id.endsWith('_consensus')) continue;
        for (const d of ins.domains) {
          if (!domain_breakdown[d]) domain_breakdown[d] = [];
          domain_breakdown[d].push(ins.content);
        }
      }

      const insightsToGroup = approved.length > 0 ? approved : q.insights.map(i => ({ ...i, approved: true }));

      // First pass: collect insights per domain in order
      const domainInsightList: Record<string, Array<{content: string; sub_agent: string}>> = {};
      for (const ins of insightsToGroup) {
        if (ins.id.endsWith('_consensus') || ins.id.endsWith('_remedy')) continue;
        const content = ins.content?.trim();
        if (!content) continue;
        let subAgent = ins.sub_agent?.trim() ?? '';
        if (!subAgent || subAgent === 'general' || subAgent === 'consensus') {
          subAgent = _extractTraditionFromContent(content);
        }
        const domains = (ins.domains?.length ? ins.domains : (
          subAgent.includes('indian_vedic') || subAgent.includes('chaldean') || subAgent.includes('pythagorean') ? ['numerology'] :
          subAgent.includes('kp') || subAgent.includes('parashara') || subAgent.includes('western_tropical') ? ['astrology'] :
          subAgent.includes('rider') || subAgent.includes('intuitive') ? ['tarot'] :
          subAgent.includes('vastu') ? ['vastu'] :
          subAgent.includes('palmistry') || subAgent.includes('chinese') || subAgent.includes('indian') ? ['palmistry'] :
          ['astrology', 'numerology']
        ));
        for (const d of domains) {
          if (!DOMAIN_META[d]) continue;
          if (!domainInsightList[d]) domainInsightList[d] = [];
          domainInsightList[d].push({ content, sub_agent: subAgent });
        }
      }

      // For insights without a tradition key, assign by position
      for (const d of Object.keys(domainInsightList)) {
        const traditions = DOMAIN_TRADITIONS[d] ?? [];
        const list = domainInsightList[d];
        const unresolved = list.filter(x => !x.sub_agent).length;
        if (traditions.length > 0 && unresolved >= list.length / 2) {
          list.forEach((x, i) => {
            if (!x.sub_agent) x.sub_agent = traditions[i] ?? `tradition_${i + 1}`;
          });
        }
      }

      // Merge numerology bullets into one storytelling narrative via backend
      if (this.backendMode() === 'backend' && domainInsightList['numerology']?.length > 1) {
        try {
          const numBullets = domainInsightList['numerology'].map(x => x.content);
          const subject = (this.currentInput() as any)?.profile?.full_name ?? '';
          const raw = this.rawOutputs() as any;
          const lifePathNum = raw?.numerology?.indian?.core_numbers?.life_path
            ?? raw?.numerology?.indian?.life_path_number
            ?? raw?.numerology?.pythagorean?.core_numbers?.life_path
            ?? 0;
          const res = await firstValueFrom(
            this.api.mergeStory(numBullets, q.question, q.intent, subject, Number(lifePathNum))
          );
          if (res.story && res.story.length > 80) {
            domainInsightList['numerology'] = [{ content: res.story, sub_agent: 'numerology' }];
            // Also update domain_breakdown so displayReport computed rebuilds from the merged story
            domain_breakdown['numerology'] = [res.story];
          }
        } catch { /* keep original bullets on failure */ }
      }

      // Build domainMap and subAgentMap from resolved list
      const domainMap: Record<string, string[]> = {};
      const subAgentMap: Record<string, Record<string, string[]>> = {};
      for (const d of Object.keys(domainInsightList)) {
        for (const { content, sub_agent } of domainInsightList[d]) {
          if (!domainMap[d]) domainMap[d] = [];
          domainMap[d].push(content);
          if (!subAgentMap[d]) subAgentMap[d] = {};
          const key = sub_agent || 'general';
          if (!subAgentMap[d][key]) subAgentMap[d][key] = [];
          subAgentMap[d][key].push(content);
        }
      }

      const domain_summary: DomainSummaryGroup[] = Object.entries(domainMap)
        .filter(([d]) => DOMAIN_META[d] && domainMap[d].length > 0)
        .sort(([a], [b]) => (DOMAIN_META[a]?.order ?? 99) - (DOMAIN_META[b]?.order ?? 99))
        .map(([d, bullets]) => {
          const subs = subAgentMap[d] ?? {};
          const traditions = DOMAIN_TRADITIONS[d] ?? [];
          const allKeys = Object.keys(subs).filter(k => k && k !== 'consensus');
          const orderedKeys = [
            ...traditions.filter(t => allKeys.includes(t)),
            ...allKeys.filter(k => !traditions.includes(k) && k !== 'general'),
            ...(allKeys.includes('general') ? ['general'] : []),
          ];
          const subGroups: DomainSubGroup[] = orderedKeys.map(k => ({
            sub_agent: k,
            label: _formatSubAgentLabel(k),
            bullets: subs[k],
          }));
          return {
            domain: d,
            label:  DOMAIN_META[d].label,
            icon:   DOMAIN_META[d].icon,
            intent: q.intent,
            bullets,
            subGroups,
          };
        });

      const narrative = insightsToGroup.map(i => i.content.replace(/\.$/, '')).join('. ') + (insightsToGroup.length ? '.' : '');
      const simple_narrative = narrative;

      const finalInsights = approved.length > 0 ? approved : q.insights.map(i => ({ ...i, approved: true }));
      return { question: q.question, intent: q.intent, narrative, simple_narrative, domain_summary, insights: finalInsights, domain_breakdown };
    }));

    // ── Plain English pass: simplify all bullets for the PDF reader ──────────
    // Runs ONLY here (report generation), never on the review page.
    // Collects all bullets across all sections → one batch API call → writes back.
    if (this.backendMode() === 'backend') {
      try {
        // Gather every bullet from every domain group and subgroup
        const allBullets: string[] = [];
        const bulletRefs: Array<{ si: number; gi: number; type: 'flat' | 'sub'; sgi?: number; bi: number }> = [];
        sections.forEach((sec, si) => {
          (sec.domain_summary ?? []).forEach((grp: any, gi: number) => {
            if (grp.subGroups?.length) {
              grp.subGroups.forEach((sg: any, sgi: number) => {
                sg.bullets.forEach((b: string, bi: number) => {
                  bulletRefs.push({ si, gi, type: 'sub', sgi, bi });
                  allBullets.push(b);
                });
              });
            } else {
              grp.bullets.forEach((b: string, bi: number) => {
                bulletRefs.push({ si, gi, type: 'flat', bi });
                allBullets.push(b);
              });
            }
          });
        });

        if (allBullets.length > 0) {
          const { firstValueFrom } = await import('rxjs');
          const res = await firstValueFrom(this.api.simplifyBullets(allBullets));
          const simplified = res.bullets;
          // Write simplified bullets back — skip numerology (it's a crafted story, not a raw bullet)
          bulletRefs.forEach((ref, idx) => {
            const grp = sections[ref.si].domain_summary![ref.gi] as any;
            if (grp.domain === 'numerology') return; // preserve storytelling narrative as-is
            if (ref.type === 'sub' && ref.sgi !== undefined) {
              grp.subGroups[ref.sgi].bullets[ref.bi] = simplified[idx] ?? allBullets[idx];
            } else {
              grp.bullets[ref.bi] = simplified[idx] ?? allBullets[idx];
            }
          });
        }
      } catch {
        // Non-blocking — if simplification fails, original bullets are kept
      }
    }

    const rawRemedies = this.rawOutputs()?.remedies;
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
      remedies:     rawRemedies ?? this.remedySvc.compute(this.rawOutputs()),
      disclaimer:   'This report is for spiritual guidance and personal reflection only.',
      closing_note: 'Use this as a compass, not a map. Your choices remain the most powerful force in your journey.',
      confidence_distribution: { high: 0, medium: 0, low: 0 },
    };

    // Grammar agent — apply deterministic corrections to all prose in the report
    const correctedReport = this.grammarSvc.correctReport(report) as FinalReport;
    this.finalReport.set(correctedReport);
    this.englishReport.set(correctedReport);
    return correctedReport;
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

  setFinalReport(report: any): void {
    this.finalReport.set(report);
    this.isDone.set(true);
  }

  reset(): void {
    this.steps.set([]);
    this.isRunning.set(false);
    this.isDone.set(false);
    this.cacheHit.set(false);
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
            domains:    (i.domains?.length ? i.domains : Object.keys(i.detail ?? {}).filter(k => ['astrology','numerology','palmistry','tarot','vastu'].includes(k))),
            sub_agent:  i.sub_agent ?? '',
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
      astrology:    raw?.astrology,
      numerology:   raw?.numerology,
      palmistry:    raw?.palmistry,
      tarot:        raw?.tarot,
      vastu:        raw?.vastu,
      remedies:     raw?.remedies,
      consolidated: raw?.consolidated,
    };
  }

  // Converts the local NumerologyResult[] (life_path_number, destiny_number…)
  // into the backend shape (indian.core_numbers.life_path…) so all downstream
  // consumers only need to handle one shape.
  private _normalizeLocalNumerology(results: any[]): any {
    if (!results?.length) return null;
    const toCore = (r: any) => ({
      life_path:   r.life_path_number  ?? r.life_path  ?? 0,
      destiny:     r.destiny_number    ?? r.destiny    ?? 0,
      name_number: r.name_number       ?? 0,
      soul_urge:   r.soul_urge_number  ?? r.soul_urge  ?? 0,
      personality: r.personality_number ?? r.personality ?? 0,
      maturity:    (r.life_path_number ?? 0) + (r.destiny_number ?? 0),
    });
    const byTradition: any = {};
    for (const r of results) {
      const key = (r.tradition ?? 'Indian').toLowerCase();
      byTradition[key] = {
        tradition:    r.tradition,
        core_numbers: toCore(r),
        lucky_numbers: r.lucky_numbers ?? [],
        lucky_colors:  r.lucky_colors  ?? [],
        predictions:   r.predictions   ?? [],
        traits:        r.traits        ?? [],
        strengths:     r.strengths     ?? [],
        weaknesses:    r.weaknesses    ?? [],
      };
    }
    return {
      domain: 'numerology',
      indian:      byTradition['indian']      ?? null,
      chaldean:    byTradition['chaldean']    ?? null,
      pythagorean: byTradition['pythagorean'] ?? null,
    };
  }

  // ── Local fallback ─────────────────────────────────────────────────────────
  private async _runLocal(input: SystemInput, _steps: AgentStep[]): Promise<void> {
    const outputs: AgentOutputs = {};
    if (input.selected_modules.includes('astrology')) {
      // Geocode the birth place for precise lat/lon — falls back to built-in table if offline
      const coords = await this.geoSvc.resolve(input.user_profile.place_of_birth ?? '');
      outputs.astrology = this.astroSvc.compute(input.user_profile as any, coords);
    }
    if (input.selected_modules.includes('numerology')) {
      const localNum = this.numSvc.compute(input.user_profile as any);
      // Normalize to backend shape so report.page reads the same keys regardless of source
      outputs.numerology = this._normalizeLocalNumerology(localNum as any[]);
    }
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
    const a   = outputs.astrology  as any;
    const num = outputs.numerology as any;
    const rem = outputs.remedies   as any;
    const pal = outputs.palmistry  as any;
    const tar = outputs.tarot      as any;
    const vas = outputs.vastu      as any;

    // Pull rich data from each module
    const astroPreds: string[]   = a?.predictions  ?? [];
    const astroYogas: string[]   = a?.yogas         ?? [];
    const astroDasha: string     = a?.current_dasha ?? '';
    const astroLagna: string     = a?.lagna         ?? '';
    const astroMoon: string      = a?.moon_sign      ?? '';
    const astroDoshas: string[]  = a?.doshas         ?? [];
    const astroStrengths: string[] = a?.strengths    ?? [];

    const numIndian = Array.isArray(num) ? num[0] : num?.indian;
    const numChaldean = Array.isArray(num) ? num[1] : num?.chaldean;
    const numPyth   = Array.isArray(num) ? num[2] : num?.pythagorean;
    const numPreds: string[] = [
      ...(numIndian?.predictions  ?? []),
      ...(numChaldean?.predictions ?? []),
      ...(numPyth?.predictions    ?? []),
    ];
    const numTraits: string[] = [
      ...(numIndian?.traits  ?? []),
      ...(numPyth?.traits    ?? []),
    ];
    const lifePathNum = numIndian?.core_numbers?.life_path ?? numIndian?.life_path_number ?? numPyth?.core_numbers?.life_path ?? '—';
    const destinyNum  = numIndian?.core_numbers?.destiny   ?? numIndian?.destiny_number   ?? '—';

    const remedyHabits: string[] = rem?.daily_habits ?? [];
    const mantras: any[]         = rem?.mantras      ?? [];
    const gemstones: any[]       = rem?.gemstones    ?? [];
    const colors: string[]       = rem?.colors       ?? [];

    const palmTraits: string[]   = pal?.traits ?? pal?.lines_analysis ?? [];
    const tarotCards: any[]      = tar?.cards  ?? [];
    const vastuNotes: string[]   = vas?.corrections ?? [];

    return {
      subject: '',
      questions: questions.map((q, qi) => {
        const id = (n: number) => `q${qi+1}_i${n}`;
        const insights: AdminInsight[] = [];

        // 1. Combined cross-domain summary
        insights.push({
          id: id(1),
          content: `Across all selected traditions — ${mods.join(', ')} — the analysis for "${q}" consistently indicates a growth-oriented and positive period. Your natural strengths are highlighted as key drivers of progress in the coming phase.`,
          confidence: 'high', domains: mods, is_common: mods.length >= 2, editable: true,
        });

        // 2. Astrology — lagna + moon
        if (a && astroLagna) {
          insights.push({
            id: id(2),
            content: `From the Vedic Astrology perspective: your ${astroLagna} lagna (rising sign) with ${astroMoon} Moon indicates ${astroStrengths[0] ?? 'strong innate qualities supporting this area of life'}. The current ${astroDasha} period activates this theme significantly.`,
            confidence: 'high', domains: ['astrology'], is_common: false, editable: true,
          });
        }

        // 3. Astrology predictions
        if (astroPreds.length) {
          insights.push({
            id: id(3),
            content: astroPreds[qi % astroPreds.length],
            confidence: 'high', domains: ['astrology'], is_common: false, editable: true,
          });
        }

        // 4. Yogas
        if (astroYogas.length) {
          insights.push({
            id: id(4),
            content: `Planetary Yoga present in your chart: ${astroYogas[0]}`,
            confidence: 'medium', domains: ['astrology'], is_common: false, editable: true,
          });
        }

        // 5. Doshas (if any)
        if (astroDoshas.length && !astroDoshas[0].toLowerCase().includes('no significant')) {
          insights.push({
            id: id(5),
            content: `Dosha note: ${astroDoshas[0]}. Specific remedies are recommended to mitigate this influence and strengthen the positive aspects of your chart.`,
            confidence: 'medium', domains: ['astrology'], is_common: false, editable: true,
          });
        }

        // 6. Numerology — life path
        if (numIndian || numPyth) {
          insights.push({
            id: id(6),
            content: `From the Numerology perspective: Life Path ${lifePathNum}, Destiny ${destinyNum}. ${numTraits[0] ?? ''} ${numTraits[1] ?? ''}`.trim(),
            confidence: 'medium', domains: ['numerology'], is_common: false, editable: true,
          });
        }

        // 7. Numerology predictions
        if (numPreds.length) {
          insights.push({
            id: id(7),
            content: numPreds[qi % numPreds.length],
            confidence: 'medium', domains: ['numerology'], is_common: false, editable: true,
          });
        }

        // 8. Palmistry
        if (palmTraits.length) {
          insights.push({
            id: id(8),
            content: `Palmistry analysis indicates: ${palmTraits.slice(0,2).join('. ')}.`,
            confidence: 'medium', domains: ['palmistry'], is_common: false, editable: true,
          });
        }

        // 9. Tarot
        if (tarotCards.length) {
          const card = tarotCards[qi % tarotCards.length];
          insights.push({
            id: id(9),
            content: `Tarot reading — ${card.name ?? 'Card'} (${card.orientation ?? 'upright'}): ${card.meaning ?? 'A significant energy is present guiding this question.'}`,
            confidence: 'medium', domains: ['tarot'], is_common: false, editable: true,
          });
        }

        // 10. Vastu
        if (vastuNotes.length) {
          insights.push({
            id: id(10),
            content: `Vastu Shastra recommendation: ${vastuNotes[0]}`,
            confidence: 'low', domains: ['vastu'], is_common: false, editable: true,
          });
        }

        // Remedy insights (11-14) removed — remedies come from RAG and are woven
        // into the storytelling narrative, not shown as separate insights.

        return { question: q, intent: this._detectIntent(q), insights };
      }),
    };
  }

  private _detectIntent(q: string): string {
    const t = q.toLowerCase();
    if (/career|job|work|business|profession/.test(t)) return 'career';
    if (/marriage|marry|partner|love|relation|spouse/.test(t)) return 'marriage';
    if (/finance|money|wealth|income|invest/.test(t)) return 'finance';
    if (/health|ill|sick|disease|body|medical/.test(t)) return 'health';
    if (/education|study|exam|college|degree/.test(t)) return 'education';
    if (/travel|abroad|foreign|settle/.test(t)) return 'travel';
    if (/spiritual|dharma|karma|soul|purpose/.test(t)) return 'spirituality';
    if (/property|house|home|land/.test(t)) return 'property';
    return 'general';
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
    steps.push({ id: 'meta',      label: 'Meta Consensus Agent',           status: 'idle' });
    steps.push({ id: 'remedy',    label: 'Remedy Synthesis Agent',         status: 'idle' });
    steps.push({ id: 'admin',     label: 'Admin Review Generation Agent',  status: 'idle' });
    steps.push({ id: 'report',    label: 'Report Agent',                   status: 'idle' });
    steps.push({ id: 'simplify',  label: 'Simplify Agent',                 status: 'idle' });
    steps.push({ id: 'translate', label: 'Translation Agent',              status: 'idle' });
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

  _setStepStatus(id: string, status: 'idle' | 'running' | 'done'): void {
    this.steps.update(list =>
      list.map(s => s.id === id ? { ...s, status } : s)
    );
  }

  private _seed(str: string): number {
    return Array.from(str).reduce((a, c) => a + c.charCodeAt(0), 0);
  }
}

