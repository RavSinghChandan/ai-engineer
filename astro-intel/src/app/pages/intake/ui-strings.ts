/**
 * UI Strings for the Intake Page — full i18n via backend translation.
 *
 * UI_STRINGS_EN  — the master English strings object (flat key → string).
 * UiStrings      — TypeScript type derived from the object.
 * loadUiStrings  — async loader with in-memory cache; calls the backend
 *                  translate endpoint for any non-English language.
 */

// ── Master English strings ────────────────────────────────────────────────────

export const UI_STRINGS_EN = {

  // Header nav items
  header_astrology:  'Astrology',
  header_numerology: 'Numerology',
  header_palmistry:  'Palmistry',
  header_tarot:      'Tarot',
  header_vastu:      'Vastu',
  header_metrics:    'Metrics',
  header_leads:      'Leads',
  header_signout:    'Sign Out',

  // Birth Profile panel
  panel_birth_profile:  'Birth Profile',
  section_personal_details: 'Personal Details',
  section_personal_sub:     'Your birth data powers all calculations',

  label_full_name:       'Full Name',
  label_full_name_hint:  'as per official records',
  label_known_as:        'Known As',
  label_dob:             'Date of Birth',
  label_tob:             'Time of Birth',
  label_place_of_birth:  'Place of Birth',
  label_pincode:         'PIN Code',

  ph_full_name:      'e.g. Chandan Kumar',
  ph_known_as:       'e.g. Rav',
  ph_place_of_birth: 'City, State, Country — e.g. Patna, Bihar, India',
  ph_pincode:        'e.g. 800001',
  ph_tob_hh:         'HH',
  ph_tob_mm:         'MM',

  // Time-of-day pills
  tod_morning:   'Morning',
  tod_afternoon: 'Afternoon',
  tod_evening:   'Evening',
  tod_night:     'Night',
  tod_exact:     'Exact',

  // Question section
  section_question:     'Your Question for the Astrologer',
  section_question_sub: 'Ask about career, marriage, finance, health…',

  chip_career:   'Career',
  chip_marriage: 'Marriage',
  chip_finance:  'Finance',
  chip_love:     'Love',
  chip_health:   'Health',
  chip_business: 'Business',

  ph_question:        'e.g. Will my career grow significantly this year? What should I focus on?',
  hint_question_words: 'Add more detail — at least 5 words.',
  hint_question_area:  'Mention a life area — career, marriage, health, finance…',

  // Analysis modules panel
  panel_modules:    'Analysis Modules',
  label_report_style: 'Report Style',

  module_astrology:      'Vedic Astrology',
  module_astrology_sub:  'Lagna · Planets · Dasha · Doshas',
  module_numerology:     'Numerology',
  module_numerology_sub: 'Indian · Chaldean · Pythagorean',
  module_palmistry:      'Palmistry',
  module_palmistry_sub:  'Indian · Chinese · Western',
  module_tarot:          'Tarot',
  module_tarot_sub:      '3-card or 5-card spread',
  module_vastu:          'Vastu Shastra',
  module_vastu_sub:      'Space energy · Directions',

  style_warm:      'Warm & Exploratory',
  style_warm_sub:  'Gentle · Encouraging · Holistic',
  style_sharp:     'Laser Sharp',
  style_sharp_sub: 'Direct answers · Exact timing · Actions',
  badge_recommended: 'Recommended',

  // CTA
  btn_begin:             'Begin 360° Reading',
  hint_begin:            'All selected agents run · 20–60 s',
  btn_review:            'Download PDF Report',
  btn_rerun:             'New Reading',
  btn_review_admin:      'Review & Edit',
  badge_analysis_complete: 'Analysis complete',

  // Palmistry sub-form
  label_palm_hand_shape: 'Hand Shape',
  label_palm_dominant:   'Dominant Hand',

  // Tarot sub-form
  label_tarot_spread:  'Spread',
  label_tarot_focus:   'Focus Question',
  ph_tarot_focus:      'What should I focus on in my career?',

  // Vastu sub-form
  label_vastu_facing:  'Main Door Facing',
  label_vastu_concern: 'Floor Plan Notes',
  ph_vastu_concern:    'Kitchen SE, Master SW…',

  // Lead form (popup)
  lead_title:    'Continue Your Spiritual Journey',
  lead_subtitle: 'Your chart details are ready. Our expert astrologer will personally review your reading and prepare a deep, customised report just for you.',

  label_email:         'Email Address',
  label_mobile:        'Mobile Number',
  label_question_astro: 'Your Question for the Astrologer',
  label_pdf_lang:      'PDF Report Language',
  label_consent:       'I agree to share my birth details with the expert astrologer for a personalised reading',

  ph_email:  'you@example.com',
  ph_mobile: '+91 98765 43210',

  btn_send_expert: 'Send to Expert Astrologer',
  btn_cancel:      'Cancel',

  hint_pdf_lang: 'Your personalised report will be delivered in this language',
  hint_privacy:  'Your details are kept strictly confidential and used only for your personalised reading.',

  // Status tracker
  tracker_sent_title: 'Reading Request Sent!',
  tracker_sent_sub:   'Your expert astrologer has been notified. Track your reading progress below — this updates automatically.',

  step_submitted:      'Request Submitted',
  step_submitted_desc: 'Your birth details & question have been received by our team',
  step_notified:       'Astrologer Notified',
  step_notified_desc:  'Your dedicated expert astrologer has been assigned and notified',
  step_analysis:       'Expert Analysis',
  step_analysis_desc:  'Your personalised 360° Vedic reading is being crafted for you',
  step_ready:          'Report Ready',
  step_ready_desc:     'Your personalised report is delivered — also sent to your email',

  status_awaiting:   'Awaiting expert assignment',
  status_notified:   'Expert notified — reviewing your chart',
  status_preparing:  'Your personalised reading is being prepared',

  report_ready_msg: 'Your personalised astrology report is ready!',
  report_ready_sub: 'Check your email too — we sent it there automatically.',
  btn_open_report:  'Open My Full Report',
  label_report_lang: 'Report language:',

  btn_refresh:    'Refresh Now',
  hint_auto_poll: 'Updating every 15 seconds',

} as const;

// ── TypeScript type derived from the master object ────────────────────────────

export type UiStrings = { [K in keyof typeof UI_STRINGS_EN]: string };

// ── In-memory translation cache ───────────────────────────────────────────────

const _cache = new Map<string, UiStrings>();

// ── Loader function ───────────────────────────────────────────────────────────

/**
 * Load translated UI strings for the given language code.
 *
 * @param langCode   BCP-47 / ISO language code, e.g. 'hi', 'bn', 'en'
 * @param apiTranslate  Function that calls POST /api/v1/analysis/translate
 *                      and returns the response (a plain JS object).
 */
export async function loadUiStrings(
  langCode: string,
  apiTranslate: (req: { session_id: string; language_code: string; report: Record<string, string> }) => Promise<any>
): Promise<UiStrings> {
  if (langCode === 'en') return UI_STRINGS_EN as UiStrings;

  if (_cache.has(langCode)) return _cache.get(langCode)!;

  const res = await apiTranslate({
    session_id:    '',
    language_code: langCode,
    report:        UI_STRINGS_EN as Record<string, string>,
  });

  // The backend returns the translated key-value pairs in res.final_report
  const translated: UiStrings = { ...UI_STRINGS_EN, ...(res?.final_report ?? {}) };
  _cache.set(langCode, translated);
  return translated;
}
