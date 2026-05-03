import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  SystemInput, AgentOutputs, AdminReview, AdminInsight, AdminQuestion,
  FinalReport, Module, AgentStep, NormalizedQuestion, HwBullet
} from '../models/astro.models';
import { ApiService, RunResponse } from './api.service';

import { NumerologyService } from './numerology.service';
import { AstrologyService }  from './astrology.service';
import { PalmistryService }  from './palmistry.service';
import { TarotService }      from './tarot.service';
import { VastuService }      from './vastu.service';
import { RemedyService }     from './remedy.service';
import { GeocodeService }    from './geocode.service';

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
  private remedySvc = inject(RemedyService);

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
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  async approveAndGenerate(approvedIds: string[], rejectedIds: string[]): Promise<FinalReport> {
    const input = this.currentInput()!;

    // Check if any insights have been edited locally
    const review = this.adminReview();
    const hasEdits = review?.questions.some(q => q.insights.some(i => (i as any).edited));

    if (this.backendMode() === 'backend' && this.sessionId() && !hasEdits) {
      try {
        const res = await firstValueFrom(this.api.approveReport({
          session_id:           this.sessionId(),
          approved_insight_ids: approvedIds,
          rejected_insight_ids: rejectedIds,
          brand_name:           'Aura with Rav',
        }));
        const report = res.final_report as unknown as FinalReport;
        if (report && (report.sections?.length || report.report_title)) {
          this.finalReport.set(report);
          this.englishReport.set(report);
          return report;
        }
      } catch (e) {
        console.warn('[orchestrator] Backend /approve failed, falling back to local:', e);
      }
    }

    // Local fallback: build report from current adminReview (includes any edited content)
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

      // ── Build WHO/WHAT/WHERE as 3-point lists, WHEN as timing object, HOW as redirect ──
      // This mirrors exactly what the backend simplify_agent produces.
      // Intent × template maps — each must be completely different per intent.
      const WHO_LABELS: Record<string, string> = {
        marriage: 'Who is the right partner for you?', career: 'Who can help you grow professionally?',
        finance: 'Who should you work with for financial decisions?', health: 'Who should you consult for your health?',
        spirituality: 'Who or what can guide your spiritual growth?', education: 'Who can support your educational journey?',
        travel: 'Who should you travel with or consult?', children: 'Who plays a key role in your family journey?',
        general: 'Who are the key people in your journey right now?',
      };
      const WHAT_LABELS: Record<string, string> = {
        marriage: 'What should you do to attract the right person?', career: 'What actions will advance your career?',
        finance: 'What financial actions should you take?', health: 'What health actions are most important right now?',
        spirituality: 'What spiritual practices should you adopt?', education: 'What steps should you take for education?',
        travel: 'What travel or relocation steps should you take?', children: 'What steps should you take for family planning?',
        general: 'What actions will create the most impact?',
      };
      const WHEN_LABELS: Record<string, string> = {
        marriage: 'When is the best time to get married?', career: 'When is the best time to make a career move?',
        finance: 'When is the best time to invest or build wealth?', health: 'When should you take action on your health?',
        spirituality: 'When is the best time for spiritual practice?', education: 'When is the best time for exams or new courses?',
        travel: 'When is the best time to travel or move?', children: 'When is the best time for family planning?',
        general: 'When will the key changes take place?',
      };
      const WHERE_LABELS: Record<string, string> = {
        marriage: 'Where will you most likely meet the right person?', career: 'Where should you focus your professional efforts?',
        finance: 'Where should your financial energy be directed?', health: 'Where in the body does your chart show sensitivity?',
        spirituality: 'Where should you create your spiritual space?', education: 'Where should you focus your learning efforts?',
        travel: 'Where are you most likely to succeed or thrive?', children: 'Where should you focus to strengthen family bonds?',
        general: 'Where should you direct your energy?',
      };
      const HOW_LABELS: Record<string, string> = {
        marriage: 'How can you prepare yourself for a meaningful relationship?', career: 'How can you make the most of this career phase?',
        finance: 'How can you build lasting financial stability?', health: 'How can you strengthen your health and vitality?',
        spirituality: 'How can you deepen your spiritual connection?', education: 'How can you improve your study and retention?',
        travel: 'How should you prepare for the journey ahead?', children: 'How can you create a nurturing environment?',
        general: 'How can you make the most of this phase?',
      };

      // WHO — 3 specific person types per intent
      const WHO_POINTS: Record<string, string[]> = {
        marriage:     ['A person with stable values, long-term vision, and genuine emotional maturity', 'Someone introduced through family elders, a trusted community, or a spiritual network', 'A partner whose life direction complements yours — not identical, but deeply compatible'],
        career:       ['A senior decision-maker who can sponsor your visibility at the next level', 'A mentor or advisor 10+ years ahead who openly shares what worked for them', 'A peer or collaborator who challenges you — this friction accelerates your growth fastest'],
        finance:      ['A licensed financial advisor who specialises in wealth structuring, not just compliance', 'A mentor who has built lasting wealth through discipline and can share the actual framework', 'An accountant or CA who imposes financial rigour — their discipline is your highest-value asset'],
        health:       ['A specialist aligned with your primary health concern — not a generalist', 'An integrative practitioner who addresses root cause, not just symptoms', 'A therapist or counsellor if emotional patterns are driving physical outcomes'],
        spirituality: ['A realised teacher with a clear, structured lineage — not just an influencer', 'A community or sangha that holds consistent practice and genuine accountability', 'A mentor whose spiritual depth came through lived experience, not only study'],
        education:    ['A mentor already established at the level you are targeting — model their exact path', 'A professor or institution head who can open the advanced track through recommendation', 'A study peer or accountability partner who maintains consistent high standards'],
        travel:       ['A contact already settled at your target destination who can share the unfiltered reality', 'A visa or immigration specialist who prevents procedural errors that delay your move', 'A cultural or professional anchor at the destination — someone who opens the local network'],
        children:     ['Your partner — alignment on timeline, values, and readiness is the first prerequisite', 'A specialist in reproductive or family health who provides evidence-based guidance', 'A trusted family elder whose experience with parenthood gives practical, grounded wisdom'],
        general:      ['A mentor who has already solved the specific problem you are currently facing', 'A direct, honest peer who gives feedback without softening it', 'A structured professional — coach, advisor, or consultant — who prevents costly blind spots'],
      };

      // WHAT — 3 concrete actions per intent
      const WHAT_POINTS: Record<string, string[]> = {
        marriage:     ['Tell your trusted family and social network clearly that you are ready for serious introductions', 'Attend two curated social events per month in environments where values-aligned people gather', 'Define your non-negotiables before any meeting — emotional maturity, shared vision, and decision-making style'],
        career:       ['Identify the single most visible action you can take this month and execute it completely', 'Request a direct conversation with a decision-maker who can materially change your trajectory', 'Complete the one overdue deliverable that has been blocking your credibility — finish it this week'],
        finance:      ['Track every expense for 30 days — total clarity on outflows is the foundation of wealth building', 'Eliminate your single most expensive non-essential cost and redirect it to one income-building investment', 'Engage a licensed advisor for a portfolio review and structured 12-month financial roadmap'],
        health:       ['Book a comprehensive health assessment within the next 30 days — proactive, not reactive', 'Eliminate the one dietary or lifestyle habit your body has been signalling for months', 'Establish three daily non-negotiables: 7–8 hours sleep, 20 minutes movement, one less stimulant'],
        spirituality: ['Choose one practice — meditation, mantra, breathwork — and commit without substitution for 90 days', 'Attend a structured teaching or satsang once per week consistently for 3 months', 'Create a dedicated practice space at home and use it at the same time every day'],
        education:    ['Apply or enrol for your target qualification within the next 30 days — not next month', 'Block 90-minute focused study sessions with no phone, no multitasking — track completed topics daily', 'Approach one authority in your field this week for mentorship or supervised learning'],
        travel:       ['Book a reconnaissance trip to your target destination before committing to full relocation', 'Complete all documentation — visas, permits, insurance — within the next 45 days', 'Connect with someone already at the destination before you arrive — emotional anchor first'],
        children:     ['Have one clear, unambiguous conversation with your partner about timeline and mutual readiness', 'Schedule a full reproductive health baseline assessment within the next 30 days', 'Prepare the material foundation — housing stability, savings, income security — before conception'],
        general:      ['Identify your single most important goal for the next 12 months and commit to it publicly', 'Complete the one most important overdue action within 48 hours — do not defer again', 'Create one consistent daily anchor — a morning ritual, an evening review — and protect it without exception'],
      };

      // WHEN — timing windows per intent (6–18 month forward-looking windows)
      const now = new Date();
      const addMonths = (d: Date, m: number) => { const r = new Date(d); r.setMonth(r.getMonth() + m); return r; };
      const fmt = (d: Date) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const WHEN_WINDOWS: Record<string, { window: string; peak: string; duration: string }> = {
        marriage:     { window: `${fmt(addMonths(now,6))} – ${fmt(addMonths(now,24))}`, peak: `Peak probability: ${fmt(addMonths(now,14))}`, duration: 'Act within this phase — timing contracts, not expands' },
        career:       { window: `${fmt(addMonths(now,2))} – ${fmt(addMonths(now,18))}`, peak: `Peak probability: ${fmt(addMonths(now,9))}`,  duration: 'The next 12–18 months carry the highest return on initiative' },
        finance:      { window: `${fmt(addMonths(now,1))} – ${fmt(addMonths(now,12))}`, peak: `Peak probability: ${fmt(addMonths(now,6))}`,  duration: 'Plan a 12-month financial roadmap starting this month' },
        health:       { window: `${fmt(addMonths(now,0))} – ${fmt(addMonths(now,6))}`,  peak: `Act within: ${fmt(addMonths(now,2))}`,        duration: 'Schedule a health assessment within the next 60 days' },
        spirituality: { window: `${fmt(addMonths(now,1))} – ${fmt(addMonths(now,15))}`, peak: `Peak depth: ${fmt(addMonths(now,8))}`,        duration: 'Start now — even 10 minutes daily compounds significantly' },
        education:    { window: `${fmt(addMonths(now,1))} – ${fmt(addMonths(now,9))}`,  peak: `Enrol by: ${fmt(addMonths(now,3))}`,          duration: 'Apply within the next 3 months for best academic results' },
        travel:       { window: `${fmt(addMonths(now,2))} – ${fmt(addMonths(now,12))}`, peak: `Book by: ${fmt(addMonths(now,4))}`,            duration: 'Plan and book within the next 6 months' },
        children:     { window: `${fmt(addMonths(now,3))} – ${fmt(addMonths(now,18))}`, peak: `Peak window: ${fmt(addMonths(now,10))}`,       duration: 'Make the key decisions within this phase, not after it' },
        general:      { window: `${fmt(addMonths(now,1))} – ${fmt(addMonths(now,12))}`, peak: `Key inflection: ${fmt(addMonths(now,6))}`,     duration: 'Decisions made in the next 12 months shape the following 3–5 years' },
      };

      // WHERE — 3 specific environments per intent
      const WHERE_POINTS: Record<string, string[]> = {
        marriage:     ['Curated, values-aligned social environments — not random events or purely professional networking', 'Family-led or community-organised introductions — the traditional network still delivers the highest-quality matches', 'Spiritual gatherings, cultural events, or shared-interest communities where authentic connection is natural'],
        career:       ['Environments where your highest-value skill is most visible and most needed — not where you are comfortable', 'Industry events, leadership forums, and professional communities at the level above your current position', 'Internal or external settings where decision-makers observe performance directly — visibility matters most now'],
        finance:      ['Your primary income source first — maximise the existing authority before diversifying into new streams', 'Regulated, professional investment settings: licensed advisors, established funds, structured wealth products', 'Your own desk — a clear budget tracker, a 12-month financial plan, and one income-building target'],
        health:       ['Medical diagnostic settings — proactive specialist consultations, not reactive emergency visits', 'Outdoor environments with direct morning sunlight — 20–30 minutes daily at a consistent time', 'Calm, low-stimulation domestic environments — quality sleep environment is your highest-priority health investment'],
        spirituality: ['A dedicated home practice space — same location, same time, same practice every day', 'A structured teaching centre, ashram, or meditation hall with a regular programme', 'Nature environments weekly — forests, parks, or water-adjacent locations reset the nervous system faster than any technique'],
        education:    ['A quiet, distraction-free study environment used at the same time each day — habit beats willpower', 'The institution or faculty department where your target qualification is taught — be present, be visible', 'Online or in-person communities of people already doing what you are learning — peer learning accelerates retention'],
        travel:       ['Your target destination itself — a reconnaissance trip before full commitment reduces costly surprises', 'Professional or cultural hubs at the destination where your specific skills have the highest demand', 'Communities of people who have already made the same move — their experience is your most accurate roadmap'],
        children:     ['Your home environment — prepare the physical and emotional space as if the arrival is already certain', 'Medical and specialist settings for proactive fertility and health baseline assessment', 'Your immediate family and support network — proximity to those who will help is a practical, not sentimental, priority'],
        general:      ['The environment where your most important challenge is waiting — move toward it, not away', 'Your own daily workspace — organised, distraction-minimised, and reserved for your highest-priority work only', 'The relationship environments that replenish your energy — your inner circle is your most productive context'],
      };

      const intent = q.intent as string;
      // Use pre-built hw_bullets from admin review if the backend already populated them
      const existingHw: HwBullet[] | undefined = (q as any).structured_summary?.hw_bullets;
      const hw_bullets: HwBullet[] = existingHw?.length ? existingHw : [
        { label: WHO_LABELS[intent]  || WHO_LABELS['general'],  answer: WHO_POINTS[intent]  || WHO_POINTS['general'],   type: 'list' },
        { label: WHAT_LABELS[intent] || WHAT_LABELS['general'], answer: WHAT_POINTS[intent] || WHAT_POINTS['general'],  type: 'list' },
        { label: WHEN_LABELS[intent] || WHEN_LABELS['general'], answer: WHEN_WINDOWS[intent] || WHEN_WINDOWS['general'],type: 'timing' },
        { label: WHERE_LABELS[intent]|| WHERE_LABELS['general'],answer: WHERE_POINTS[intent] || WHERE_POINTS['general'], type: 'list' },
        { label: HOW_LABELS[intent]  || HOW_LABELS['general'],  answer: '👉 Refer to remedies section',                 type: 'redirect' },
      ];

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

      const habits = (INTENT_HABITS[intent] || INTENT_HABITS['general']).slice(0, 3);
      const intentColors = (INTENT_COLORS[intent] || INTENT_COLORS['general']);
      const intentMantras = (INTENT_MANTRAS[intent] || INTENT_MANTRAS['general']);
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

        // 11. Remedy — daily habits
        if (remedyHabits.length) {
          insights.push({
            id: id(11),
            content: `Recommended daily practice: ${remedyHabits[0]} ${remedyHabits[1] ?? ''}`.trim(),
            confidence: 'high', domains: mods.filter(m => ['astrology','numerology'].includes(m)), is_common: true, editable: true,
          });
        }

        // 12. Remedy — mantra
        if (mantras.length) {
          const m = mantras[0];
          insights.push({
            id: id(12),
            content: `Mantra recommendation: "${m.mantra}" — ${m.purpose}. Chant ${m.count ?? 108} times daily for best effect.`,
            confidence: 'high', domains: ['astrology'], is_common: true, editable: true,
          });
        }

        // 13. Gemstone
        if (gemstones.length) {
          const g = gemstones[0];
          insights.push({
            id: id(13),
            content: `Gemstone recommendation: ${g.stone} worn on the ${g.finger} — ${g.purpose}.`,
            confidence: 'medium', domains: ['astrology','numerology'], is_common: true, editable: true,
          });
        }

        // 14. Lucky colors
        if (colors.length) {
          insights.push({
            id: id(14),
            content: `Lucky colors for this period: ${colors.slice(0,3).join(', ')}. Wearing or surrounding yourself with these colors activates supportive energy.`,
            confidence: 'low', domains: mods, is_common: true, editable: true,
          });
        }

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
