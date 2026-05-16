/**
 * UI Strings for the Intake Page — fully static i18n.
 *
 * UI_STRINGS_EN  — master English strings (flat key → string).
 * STATIC_UI_STRINGS — pre-translated static map for all supported languages.
 * UiStrings      — TypeScript type derived from the master object.
 * getUiStrings   — instant synchronous lookup; no API call, no network.
 *
 * To add a new language:
 *   1. Add its code to STATIC_UI_STRINGS below.
 *   2. Add it to INDIAN_LANGUAGES in intake.page.ts.
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
  panel_birth_profile:      'Birth Profile',
  section_personal_details: 'Personal Details',
  section_personal_sub:     'Your birth data powers all calculations',

  label_full_name:      'Full Name',
  label_full_name_hint: 'as per official records',
  label_known_as:       'Known As',
  label_dob:            'Date of Birth',
  label_tob:            'Time of Birth',
  label_place_of_birth: 'Place of Birth',
  label_pincode:        'PIN Code',

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

  ph_question:         'e.g. Will my career grow significantly this year? What should I focus on?',
  hint_question_words: 'Add more detail — at least 5 words.',
  hint_question_area:  'Mention a life area — career, marriage, health, finance…',

  // Analysis modules panel
  panel_modules:      'Analysis Modules',
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

  style_warm:        'Warm & Exploratory',
  style_warm_sub:    'Gentle · Encouraging · Holistic',
  style_sharp:       'Laser Sharp',
  style_sharp_sub:   'Direct answers · Exact timing · Actions',
  badge_recommended: 'Recommended',

  // CTA
  btn_begin:               'Begin 360° Reading',
  hint_begin:              'All selected agents run · 20–60 s',
  btn_review:              'Download PDF Report',
  btn_rerun:               'New Reading',
  btn_review_admin:        'Review & Edit',
  badge_analysis_complete: 'Analysis complete',

  // Palmistry sub-form
  label_palm_hand_shape: 'Hand Shape',
  label_palm_dominant:   'Dominant Hand',

  // Tarot sub-form
  label_tarot_spread: 'Spread',
  label_tarot_focus:  'Focus Question',
  ph_tarot_focus:     'What should I focus on in my career?',

  // Vastu sub-form
  label_vastu_facing:  'Main Door Facing',
  label_vastu_concern: 'Floor Plan Notes',
  ph_vastu_concern:    'Kitchen SE, Master SW…',

  // Lead form (popup)
  lead_title:    'Continue Your Spiritual Journey',
  lead_subtitle: 'Your chart details are ready. Our expert astrologer will personally review your reading and prepare a deep, customised report just for you.',

  label_email:          'Email Address',
  label_mobile:         'Mobile Number',
  label_question_astro: 'Your Question for the Astrologer',
  label_pdf_lang:       'PDF Report Language',
  label_consent:        'I agree to share my birth details with the expert astrologer for a personalised reading',

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

  status_awaiting:  'Awaiting expert assignment',
  status_notified:  'Expert notified — reviewing your chart',
  status_preparing: 'Your personalised reading is being prepared',

  report_ready_msg: 'Your personalised astrology report is ready!',
  report_ready_sub: 'Check your email too — we sent it there automatically.',
  btn_open_report:  'Open My Full Report',
  label_report_lang: 'Report language:',

  btn_refresh:    'Refresh Now',
  hint_auto_poll: 'Updating every 15 seconds',

} as const;

// ── TypeScript type derived from the master object ────────────────────────────

export type UiStrings = { [K in keyof typeof UI_STRINGS_EN]: string };

// ── Static translation map — pre-translated, zero API calls ──────────────────
// Extend this object to add more languages. Keys must match UI_STRINGS_EN exactly.

const STATIC_UI_STRINGS: Record<string, UiStrings> = {

  // ── English (master) ────────────────────────────────────────────────────────
  en: UI_STRINGS_EN as UiStrings,

  // ── Hindi ───────────────────────────────────────────────────────────────────
  hi: {
    header_astrology:  'ज्योतिष',
    header_numerology: 'अंकशास्त्र',
    header_palmistry:  'हस्तरेखा',
    header_tarot:      'टैरो',
    header_vastu:      'वास्तु',
    header_metrics:    'मेट्रिक्स',
    header_leads:      'लीड्स',
    header_signout:    'साइन आउट',

    panel_birth_profile:      'जन्म प्रोफ़ाइल',
    section_personal_details: 'व्यक्तिगत विवरण',
    section_personal_sub:     'आपका जन्म डेटा सभी गणनाओं को संचालित करता है',

    label_full_name:      'पूरा नाम',
    label_full_name_hint: 'आधिकारिक रिकॉर्ड के अनुसार',
    label_known_as:       'उपनाम',
    label_dob:            'जन्म तिथि',
    label_tob:            'जन्म समय',
    label_place_of_birth: 'जन्म स्थान',
    label_pincode:        'पिन कोड',

    ph_full_name:      'जैसे: चंदन कुमार',
    ph_known_as:       'जैसे: राव',
    ph_place_of_birth: 'शहर, राज्य, देश — जैसे: पटना, बिहार, भारत',
    ph_pincode:        'जैसे: ८००००१',
    ph_tob_hh:         'घं',
    ph_tob_mm:         'मि',

    tod_morning:   'सुबह',
    tod_afternoon: 'दोपहर',
    tod_evening:   'शाम',
    tod_night:     'रात',
    tod_exact:     'सटीक',

    section_question:     'ज्योतिषी के लिए आपका प्रश्न',
    section_question_sub: 'करियर, विवाह, वित्त, स्वास्थ्य के बारे में पूछें…',

    chip_career:   'करियर',
    chip_marriage: 'विवाह',
    chip_finance:  'वित्त',
    chip_love:     'प्रेम',
    chip_health:   'स्वास्थ्य',
    chip_business: 'व्यापार',

    ph_question:         'जैसे: क्या इस वर्ष मेरा करियर काफी आगे बढ़ेगा? मुझे किस पर ध्यान देना चाहिए?',
    hint_question_words: 'अधिक विवरण जोड़ें — कम से कम ५ शब्द।',
    hint_question_area:  'जीवन का क्षेत्र बताएं — करियर, विवाह, स्वास्थ्य, वित्त…',

    panel_modules:      'विश्लेषण मॉड्यूल',
    label_report_style: 'रिपोर्ट शैली',

    module_astrology:      'वैदिक ज्योतिष',
    module_astrology_sub:  'लग्न · ग्रह · दशा · दोष',
    module_numerology:     'अंकशास्त्र',
    module_numerology_sub: 'भारतीय · कल्डियन · पाइथागोरस',
    module_palmistry:      'हस्तरेखा शास्त्र',
    module_palmistry_sub:  'भारतीय · चीनी · पश्चिमी',
    module_tarot:          'टैरो',
    module_tarot_sub:      '३-कार्ड या ५-कार्ड स्प्रेड',
    module_vastu:          'वास्तु शास्त्र',
    module_vastu_sub:      'अंतरिक्ष ऊर्जा · दिशाएं',

    style_warm:        'गर्म और अन्वेषणात्मक',
    style_warm_sub:    'सौम्य · प्रोत्साहक · समग्र',
    style_sharp:       'लेज़र शार्प',
    style_sharp_sub:   'सीधे उत्तर · सटीक समय · कार्य',
    badge_recommended: 'अनुशंसित',

    btn_begin:               '३६०° रीडिंग शुरू करें',
    hint_begin:              'सभी चुने हुए एजेंट चलते हैं · २०–६० सेकंड',
    btn_review:              'PDF रिपोर्ट डाउनलोड करें',
    btn_rerun:               'नई रीडिंग',
    btn_review_admin:        'समीक्षा और संपादन',
    badge_analysis_complete: 'विश्लेषण पूर्ण',

    label_palm_hand_shape: 'हाथ का आकार',
    label_palm_dominant:   'प्रमुख हाथ',

    label_tarot_spread: 'स्प्रेड',
    label_tarot_focus:  'फ़ोकस प्रश्न',
    ph_tarot_focus:     'मुझे अपने करियर में किस पर ध्यान देना चाहिए?',

    label_vastu_facing:  'मुख्य द्वार की दिशा',
    label_vastu_concern: 'फ़्लोर प्लान नोट्स',
    ph_vastu_concern:    'रसोई दक्षिण-पूर्व, मास्टर दक्षिण-पश्चिम…',

    lead_title:    'अपनी आध्यात्मिक यात्रा जारी रखें',
    lead_subtitle: 'आपके चार्ट विवरण तैयार हैं। हमारे विशेषज्ञ ज्योतिषी व्यक्तिगत रूप से आपकी रीडिंग की समीक्षा करेंगे और आपके लिए एक गहरी, कस्टमाइज्ड रिपोर्ट तैयार करेंगे।',

    label_email:          'ईमेल पता',
    label_mobile:         'मोबाइल नंबर',
    label_question_astro: 'ज्योतिषी के लिए आपका प्रश्न',
    label_pdf_lang:       'PDF रिपोर्ट भाषा',
    label_consent:        'मैं व्यक्तिगत पठन के लिए विशेषज्ञ ज्योतिषी के साथ अपना जन्म विवरण साझा करने की सहमति देता/देती हूँ',

    ph_email:  'you@example.com',
    ph_mobile: '+९१ ९८७६५ ४३२१०',

    btn_send_expert: 'विशेषज्ञ ज्योतिषी को भेजें',
    btn_cancel:      'रद्द करें',

    hint_pdf_lang: 'आपकी व्यक्तिगत रिपोर्ट इस भाषा में दी जाएगी',
    hint_privacy:  'आपका विवरण पूरी तरह गोपनीय रखा जाता है और केवल आपकी व्यक्तिगत रीडिंग के लिए उपयोग किया जाता है।',

    tracker_sent_title: 'रीडिंग अनुरोध भेज दिया गया!',
    tracker_sent_sub:   'आपके विशेषज्ञ ज्योतिषी को सूचित कर दिया गया है। नीचे अपनी रीडिंग प्रगति ट्रैक करें — यह स्वतः अपडेट होता है।',

    step_submitted:      'अनुरोध सबमिट किया',
    step_submitted_desc: 'आपके जन्म विवरण और प्रश्न हमारी टीम को प्राप्त हो गए हैं',
    step_notified:       'ज्योतिषी को सूचित किया',
    step_notified_desc:  'आपके समर्पित विशेषज्ञ ज्योतिषी को नियुक्त और सूचित किया गया है',
    step_analysis:       'विशेषज्ञ विश्लेषण',
    step_analysis_desc:  'आपकी व्यक्तिगत ३६०° वैदिक रीडिंग तैयार की जा रही है',
    step_ready:          'रिपोर्ट तैयार',
    step_ready_desc:     'आपकी व्यक्तिगत रिपोर्ट वितरित की गई है — आपके ईमेल पर भी भेजी गई है',

    status_awaiting:  'विशेषज्ञ नियुक्ति की प्रतीक्षा',
    status_notified:  'विशेषज्ञ सूचित — आपके चार्ट की समीक्षा कर रहे हैं',
    status_preparing: 'आपकी व्यक्तिगत रीडिंग तैयार की जा रही है',

    report_ready_msg:  'आपकी व्यक्तिगत ज्योतिष रिपोर्ट तैयार है!',
    report_ready_sub:  'अपना ईमेल भी देखें — हमने वहाँ भी स्वतः भेज दिया है।',
    btn_open_report:   'मेरी पूरी रिपोर्ट खोलें',
    label_report_lang: 'रिपोर्ट भाषा:',

    btn_refresh:    'अभी रिफ्रेश करें',
    hint_auto_poll: 'हर १५ सेकंड में अपडेट हो रहा है',
  },

  // ── Bengali ─────────────────────────────────────────────────────────────────
  bn: {
    header_astrology:  'জ্যোতিষ',
    header_numerology: 'সংখ্যাতত্ত্ব',
    header_palmistry:  'হস্তরেখা',
    header_tarot:      'ট্যারো',
    header_vastu:      'বাস্তু',
    header_metrics:    'মেট্রিক্স',
    header_leads:      'লিডস',
    header_signout:    'সাইন আউট',

    panel_birth_profile:      'জন্ম প্রোফাইল',
    section_personal_details: 'ব্যক্তিগত বিবরণ',
    section_personal_sub:     'আপনার জন্ম তথ্য সমস্ত গণনা পরিচালনা করে',

    label_full_name:      'পুরো নাম',
    label_full_name_hint: 'সরকারি রেকর্ড অনুযায়ী',
    label_known_as:       'ডাকনাম',
    label_dob:            'জন্ম তারিখ',
    label_tob:            'জন্মের সময়',
    label_place_of_birth: 'জন্মস্থান',
    label_pincode:        'পিন কোড',

    ph_full_name:      'যেমন: চন্দন কুমার',
    ph_known_as:       'যেমন: রাভ',
    ph_place_of_birth: 'শহর, রাজ্য, দেশ — যেমন: পাটনা, বিহার, ভারত',
    ph_pincode:        'যেমন: ৮০০০০১',
    ph_tob_hh:         'ঘণ্টা',
    ph_tob_mm:         'মিনিট',

    tod_morning:   'সকাল',
    tod_afternoon: 'দুপুর',
    tod_evening:   'সন্ধ্যা',
    tod_night:     'রাত',
    tod_exact:     'সঠিক',

    section_question:     'জ্যোতিষীর জন্য আপনার প্রশ্ন',
    section_question_sub: 'ক্যারিয়ার, বিবাহ, অর্থ, স্বাস্থ্য সম্পর্কে জিজ্ঞেস করুন…',

    chip_career:   'ক্যারিয়ার',
    chip_marriage: 'বিবাহ',
    chip_finance:  'অর্থ',
    chip_love:     'প্রেম',
    chip_health:   'স্বাস্থ্য',
    chip_business: 'ব্যবসা',

    ph_question:         'যেমন: এই বছর কি আমার ক্যারিয়ার উল্লেখযোগ্যভাবে বাড়বে? আমার কোথায় মনোযোগ দেওয়া উচিত?',
    hint_question_words: 'আরও বিবরণ যোগ করুন — কমপক্ষে ৫টি শব্দ।',
    hint_question_area:  'জীবনের একটি ক্ষেত্র উল্লেখ করুন — ক্যারিয়ার, বিবাহ, স্বাস্থ্য, অর্থ…',

    panel_modules:      'বিশ্লেষণ মডিউল',
    label_report_style: 'রিপোর্ট শৈলী',

    module_astrology:      'বৈদিক জ্যোতিষ',
    module_astrology_sub:  'লগ্ন · গ্রহ · দশা · দোষ',
    module_numerology:     'সংখ্যাতত্ত্ব',
    module_numerology_sub: 'ভারতীয় · ক্যালডীয় · পিথাগোরিয়',
    module_palmistry:      'হস্তরেখা শাস্ত্র',
    module_palmistry_sub:  'ভারতীয় · চীনা · পাশ্চাত্য',
    module_tarot:          'ট্যারো',
    module_tarot_sub:      '৩-কার্ড বা ৫-কার্ড স্প্রেড',
    module_vastu:          'বাস্তু শাস্ত্র',
    module_vastu_sub:      'স্থান শক্তি · দিকনির্দেশ',

    style_warm:        'উষ্ণ ও অন্বেষণমূলক',
    style_warm_sub:    'মৃদু · উৎসাহজনক · সামগ্রিক',
    style_sharp:       'লেজার শার্প',
    style_sharp_sub:   'সরাসরি উত্তর · সঠিক সময় · পদক্ষেপ',
    badge_recommended: 'প্রস্তাবিত',

    btn_begin:               '৩৬০° রিডিং শুরু করুন',
    hint_begin:              'সমস্ত নির্বাচিত এজেন্ট চলবে · ২০–৬০ সেকেন্ড',
    btn_review:              'PDF রিপোর্ট ডাউনলোড করুন',
    btn_rerun:               'নতুন রিডিং',
    btn_review_admin:        'পর্যালোচনা ও সম্পাদনা',
    badge_analysis_complete: 'বিশ্লেষণ সম্পন্ন',

    label_palm_hand_shape: 'হাতের আকৃতি',
    label_palm_dominant:   'প্রধান হাত',

    label_tarot_spread: 'স্প্রেড',
    label_tarot_focus:  'ফোকাস প্রশ্ন',
    ph_tarot_focus:     'আমার ক্যারিয়ারে কোথায় মনোযোগ দেওয়া উচিত?',

    label_vastu_facing:  'প্রধান দরজার দিক',
    label_vastu_concern: 'ফ্লোর প্ল্যান নোটস',
    ph_vastu_concern:    'রান্নাঘর দক্ষিণ-পূর্ব, মাস্টার দক্ষিণ-পশ্চিম…',

    lead_title:    'আপনার আধ্যাত্মিক যাত্রা চালিয়ে যান',
    lead_subtitle: 'আপনার চার্ট বিবরণ প্রস্তুত। আমাদের বিশেষজ্ঞ জ্যোতিষী ব্যক্তিগতভাবে আপনার রিডিং পর্যালোচনা করবেন এবং আপনার জন্য একটি গভীর, কাস্টমাইজড রিপোর্ট তৈরি করবেন।',

    label_email:          'ইমেইল ঠিকানা',
    label_mobile:         'মোবাইল নম্বর',
    label_question_astro: 'জ্যোতিষীর জন্য আপনার প্রশ্ন',
    label_pdf_lang:       'PDF রিপোর্ট ভাষা',
    label_consent:        'আমি ব্যক্তিগত পাঠের জন্য বিশেষজ্ঞ জ্যোতিষীর সাথে আমার জন্ম বিবরণ শেয়ার করতে সম্মত',

    ph_email:  'you@example.com',
    ph_mobile: '+৯১ ৯৮৭৬৫ ৪৩২১০',

    btn_send_expert: 'বিশেষজ্ঞ জ্যোতিষীকে পাঠান',
    btn_cancel:      'বাতিল করুন',

    hint_pdf_lang: 'আপনার ব্যক্তিগত রিপোর্ট এই ভাষায় দেওয়া হবে',
    hint_privacy:  'আপনার বিবরণ সম্পূর্ণ গোপনীয় রাখা হয় এবং শুধুমাত্র আপনার ব্যক্তিগত রিডিংয়ের জন্য ব্যবহার করা হয়।',

    tracker_sent_title: 'রিডিং অনুরোধ পাঠানো হয়েছে!',
    tracker_sent_sub:   'আপনার বিশেষজ্ঞ জ্যোতিষীকে জানানো হয়েছে। নিচে আপনার রিডিং অগ্রগতি ট্র্যাক করুন — এটি স্বয়ংক্রিয়ভাবে আপডেট হয়।',

    step_submitted:      'অনুরোধ জমা দেওয়া হয়েছে',
    step_submitted_desc: 'আপনার জন্ম বিবরণ ও প্রশ্ন আমাদের দলের কাছে পৌঁছেছে',
    step_notified:       'জ্যোতিষীকে জানানো হয়েছে',
    step_notified_desc:  'আপনার নিবেদিত বিশেষজ্ঞ জ্যোতিষীকে নিযুক্ত ও জানানো হয়েছে',
    step_analysis:       'বিশেষজ্ঞ বিশ্লেষণ',
    step_analysis_desc:  'আপনার ব্যক্তিগত ৩৬০° বৈদিক রিডিং তৈরি করা হচ্ছে',
    step_ready:          'রিপোর্ট প্রস্তুত',
    step_ready_desc:     'আপনার ব্যক্তিগত রিপোর্ট পৌঁছে দেওয়া হয়েছে — আপনার ইমেইলেও পাঠানো হয়েছে',

    status_awaiting:  'বিশেষজ্ঞ নিয়োগের অপেক্ষায়',
    status_notified:  'বিশেষজ্ঞ জানানো হয়েছে — আপনার চার্ট পর্যালোচনা করছেন',
    status_preparing: 'আপনার ব্যক্তিগত রিডিং প্রস্তুত করা হচ্ছে',

    report_ready_msg:  'আপনার ব্যক্তিগত জ্যোতিষ রিপোর্ট প্রস্তুত!',
    report_ready_sub:  'আপনার ইমেইলও দেখুন — আমরা সেখানেও স্বয়ংক্রিয়ভাবে পাঠিয়েছি।',
    btn_open_report:   'আমার সম্পূর্ণ রিপোর্ট খুলুন',
    label_report_lang: 'রিপোর্ট ভাষা:',

    btn_refresh:    'এখনই রিফ্রেশ করুন',
    hint_auto_poll: 'প্রতি ১৫ সেকেন্ডে আপডেট হচ্ছে',
  },

};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the UI strings for the given language code instantly — no async, no API.
 * Falls back to English for any language not yet in the static map.
 */
export function getUiStrings(langCode: string): UiStrings {
  return STATIC_UI_STRINGS[langCode] ?? (UI_STRINGS_EN as UiStrings);
}

/**
 * True if we have a static translation for this language code.
 */
export function hasStaticTranslation(langCode: string): boolean {
  return langCode in STATIC_UI_STRINGS;
}
