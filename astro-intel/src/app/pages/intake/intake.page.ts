import { Component, inject, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrchestratorService } from '../../services/orchestrator.service';
import { GeocodeService } from '../../services/geocode.service';
import { Module, SystemInput } from '../../models/astro.models';
import { AgentFlowComponent } from '../../components/agent-flow/agent-flow.component';
import { AppFooterComponent } from '../../components/shared/app-footer.component';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UI_STRINGS_EN, UiStrings, getUiStrings } from './ui-strings';

const BACKEND = environment.apiUrl;

const ALL_MODULES: { id: Module; label: string; icon: string; desc: string; glyph: string }[] = [
  { id: 'astrology',  label: 'Vedic Astrology', icon: '🪐', glyph: '♈', desc: 'Lagna · Planets · Dasha · Doshas' },
  { id: 'numerology', label: 'Numerology',       icon: '🔢', glyph: '∞', desc: 'Indian · Chaldean · Pythagorean' },
  { id: 'palmistry',  label: 'Palmistry',        icon: '✋', glyph: '☽', desc: 'Indian · Chinese · Western' },
  { id: 'tarot',      label: 'Tarot',            icon: '🃏', glyph: '★', desc: '3-card or 5-card spread' },
  { id: 'vastu',      label: 'Vastu Shastra',    icon: '🏠', glyph: '⊕', desc: 'Space energy · Directions' },
];

const DIRECTIONS  = ['North','Northeast','East','Southeast','South','Southwest','West','Northwest'];
const SPREADS     = ['3-card','5-card'];
const HAND_SHAPES = ['Square','Rectangular','Triangular','Mixed / Unknown'];

// ── Noise patterns rejected for name fields ────────────────────────────────
const KEYBOARD_PATTERNS = /^(qwerty|asdf|zxcv|qwer|asdfgh|zxcvbn|abcd|abcde|abcdef|xyz|test|demo|foo|bar|aaa|bbb|ccc|ddd|eee|fff|ggg|hhh|iii|jjj|kkk|lll|mmm|nnn|ooo|ppp|qqq|rrr|sss|ttt|uuu|vvv|www|xxx|yyy|zzz|1234|name|sample|dummy)/i;
const REPEATED_CHARS    = /(.)\1{3,}/; // 4+ same chars in a row

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function isValidNameWord(w: string): boolean {
  if (w.length < 2) return false;
  if (REPEATED_CHARS.test(w)) return false;
  if (KEYBOARD_PATTERNS.test(w)) return false;
  return true;
}

function isValidDate(val: string): boolean {
  if (!val) return false;
  if (/^\d{1,2}:\d{2}/.test(val)) return false;
  return !isNaN(new Date(val).getTime());
}

// ── Question quality check ─────────────────────────────────────────────────
const INTENT_KEYWORDS = [
  'career','job','work','business','finance','money','wealth','income','salary','investment',
  'marriage','love','relationship','partner','spouse','wedding','divorce','family','children',
  'health','disease','illness','recovery','medical','body','mind','mental',
  'education','study','exam','college','degree','course','skill','learning',
  'travel','abroad','foreign','country','move','relocate','visa',
  'property','house','home','land','flat','rent','buy','sell',
  'spiritual','karma','dharma','soul','purpose','life','path','destiny',
  'when','will','should','can','how','why','what','is','are','my','me',
  'grow','improve','change','start','stop','continue','succeed','fail',
  'year','month','time','soon','future','next','this',
];
const NOISE_QUESTIONS = /^(hi|hello|hey|test|testing|ok|okay|yes|no|maybe|idk|hmm|\?+|\.+|na|n\/a|none|nothing|anything|everything)$/i;

function questionScore(q: string): { ok: boolean; hint: string } {
  const trimmed = q.trim();
  if (!trimmed) return { ok: false, hint: '' };
  if (NOISE_QUESTIONS.test(trimmed)) return { ok: false, hint: 'Please enter a real question about your life.' };
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 5) return { ok: false, hint: 'Add more detail — at least 5 words.' };
  const lower = trimmed.toLowerCase();
  const hasIntent = INTENT_KEYWORDS.some(k => lower.includes(k));
  if (!hasIntent) return { ok: false, hint: 'Mention a life area — career, marriage, health, finance…' };
  return { ok: true, hint: '' };
}

// ── Question suggestion engine ─────────────────────────────────────────────
function suggestQuestion(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (/career|job|work/.test(t))    return 'Will my career grow significantly in the next 2 years?';
  if (/marriage|marry|wed/.test(t)) return 'When is the right time for me to get married?';
  if (/business|start/.test(t))     return 'Should I start a new business this year — will it succeed?';
  if (/finance|money|wealth/.test(t)) return 'Will my financial situation improve in the coming months?';
  if (/health|ill|sick/.test(t))    return 'What does my health chart indicate for the next year?';
  if (/love|relation|partner/.test(t)) return 'Will I find a compatible life partner soon?';
  if (/foreign|abroad|travel/.test(t)) return 'Are there opportunities for me to travel or settle abroad?';
  if (/property|house|home/.test(t)) return 'Is this a good time for me to buy a home or property?';
  return 'Will my career grow this year, and what should I focus on?';
}

type FieldErrors = Record<string, string>;

// ── Form UI label translations for all 23 languages ──────────────────────────
// Keys: English field label → translated label/placeholder in each language
type FormLabels = {
  fullName: string; knownAs: string; dateOfBirth: string; timeOfBirth: string;
  placeOfBirth: string; email: string; mobile: string; yourQuestion: string;
  pdfLang: string; consent: string; sendToExpert: string;
  fullNamePh: string; knownAsPh: string; placeOfBirthPh: string;
  emailPh: string; mobilePh: string; questionPh: string; timePh: string;
};

const FORM_LABELS: Record<string, FormLabels> = {
  en:  { fullName:'Full Name', knownAs:'Known As', dateOfBirth:'Date of Birth', timeOfBirth:'Time of Birth', placeOfBirth:'Place of Birth', email:'Email Address', mobile:'Mobile Number', yourQuestion:'Your Question for the Astrologer', pdfLang:'PDF Report Language', consent:'I agree to share my birth details with the expert astrologer for a personalised reading', sendToExpert:'Send to Expert Astrologer', fullNamePh:'Your full name', knownAsPh:'Nickname', placeOfBirthPh:'City, State, Country', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'e.g. Will my career grow this year?', timePh:'e.g. 10:30 (HH:MM)' },
  hi:  { fullName:'पूरा नाम', knownAs:'उपनाम', dateOfBirth:'जन्म तिथि', timeOfBirth:'जन्म समय', placeOfBirth:'जन्म स्थान', email:'ईमेल पता', mobile:'मोबाइल नंबर', yourQuestion:'ज्योतिषी के लिए आपका प्रश्न', pdfLang:'PDF रिपोर्ट भाषा', consent:'मैं व्यक्तिगत पठन के लिए विशेषज्ञ ज्योतिषी के साथ अपना जन्म विवरण साझा करने की सहमति देता/देती हूँ', sendToExpert:'विशेषज्ञ ज्योतिषी को भेजें', fullNamePh:'आपका पूरा नाम', knownAsPh:'उपनाम', placeOfBirthPh:'शहर, राज्य, देश', emailPh:'आप@उदाहरण.com', mobilePh:'+91 98765 43210', questionPh:'जैसे: क्या इस वर्ष मेरा करियर आगे बढ़ेगा?', timePh:'जैसे: 10:30' },
  bn:  { fullName:'পুরো নাম', knownAs:'ডাকনাম', dateOfBirth:'জন্ম তারিখ', timeOfBirth:'জন্মের সময়', placeOfBirth:'জন্মস্থান', email:'ইমেইল ঠিকানা', mobile:'মোবাইল নম্বর', yourQuestion:'জ্যোতিষীর জন্য আপনার প্রশ্ন', pdfLang:'PDF রিপোর্ট ভাষা', consent:'আমি ব্যক্তিগত পাঠের জন্য বিশেষজ্ঞ জ্যোতিষীর সাথে আমার জন্ম বিবরণ শেয়ার করতে সম্মত', sendToExpert:'বিশেষজ্ঞ জ্যোতিষীকে পাঠান', fullNamePh:'আপনার পুরো নাম', knownAsPh:'ডাকনাম', placeOfBirthPh:'শহর, রাজ্য, দেশ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'উদা: এই বছর কি আমার ক্যারিয়ার বাড়বে?', timePh:'উদা: 10:30' },
  te:  { fullName:'పూర్తి పేరు', knownAs:'మారుపేరు', dateOfBirth:'పుట్టిన తేదీ', timeOfBirth:'పుట్టిన సమయం', placeOfBirth:'జన్మస్థలం', email:'ఇమెయిల్ చిరునామా', mobile:'మొబైల్ నంబర్', yourQuestion:'జ్యోతిష్కుడికి మీ ప్రశ్న', pdfLang:'PDF నివేదిక భాష', consent:'నేను వ్యక్తిగత పఠనానికి నా జన్మ వివరాలు నిపుణ జ్యోతిష్కుడితో పంచుకోవడానికి అంగీకరిస్తున్నాను', sendToExpert:'నిపుణ జ్యోతిష్కుడికి పంపండి', fullNamePh:'మీ పూర్తి పేరు', knownAsPh:'మారుపేరు', placeOfBirthPh:'నగరం, రాష్ట్రం, దేశం', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ఉదా: ఈ సంవత్సరం నా కెరీర్ అభివృద్ధి చెందుతుందా?', timePh:'ఉదా: 10:30' },
  mr:  { fullName:'पूर्ण नाव', knownAs:'टोपणनाव', dateOfBirth:'जन्मतारीख', timeOfBirth:'जन्मवेळ', placeOfBirth:'जन्मस्थान', email:'ईमेल पत्ता', mobile:'मोबाइल क्रमांक', yourQuestion:'ज्योतिषाचार्यांसाठी तुमचा प्रश्न', pdfLang:'PDF अहवाल भाषा', consent:'वैयक्तिक वाचनासाठी तज्ञ ज्योतिषाचार्यांसोबत माझे जन्म तपशील शेअर करण्यास मी सहमत आहे', sendToExpert:'तज्ञ ज्योतिषाचार्यांना पाठवा', fullNamePh:'तुमचे पूर्ण नाव', knownAsPh:'टोपणनाव', placeOfBirthPh:'शहर, राज्य, देश', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'उदा: या वर्षी माझी कारकीर्द वाढेल का?', timePh:'उदा: 10:30' },
  ta:  { fullName:'முழு பெயர்', knownAs:'அன்பு பெயர்', dateOfBirth:'பிறந்த தேதி', timeOfBirth:'பிறந்த நேரம்', placeOfBirth:'பிறந்த இடம்', email:'மின்னஞ்சல் முகவரி', mobile:'மொபைல் எண்', yourQuestion:'ஜோதிடருக்கான உங்கள் கேள்வி', pdfLang:'PDF அறிக்கை மொழி', consent:'தனிப்பட்ட வாசிப்புக்காக என் பிறப்பு விவரங்களை நிபுணர் ஜோதிடருடன் பகிர ஒப்புக்கொள்கிறேன்', sendToExpert:'நிபுணர் ஜோதிடருக்கு அனுப்பவும்', fullNamePh:'உங்கள் முழு பெயர்', knownAsPh:'அன்பு பெயர்', placeOfBirthPh:'நகரம், மாநிலம், நாடு', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'எ.கா: இந்த ஆண்டு என் வாழ்க்கை வளருமா?', timePh:'எ.கா: 10:30' },
  gu:  { fullName:'પૂર્ણ નામ', knownAs:'હુલામણું નામ', dateOfBirth:'જન્મ તારીખ', timeOfBirth:'જન્મ સમય', placeOfBirth:'જન્મ સ્થળ', email:'ઇમેઇલ સરનામું', mobile:'મોબાઇલ નંબર', yourQuestion:'જ્યોતિષી માટે તમારો પ્રશ્ન', pdfLang:'PDF રિપોર્ટ ભાષા', consent:'વ્યક્તિગત વાંચન માટે મારી જન્મ વિગતો નિષ્ણાત જ્યોતિષી સાથે શેર કરવા હું સંમત છું', sendToExpert:'નિષ્ણાત જ્યોતિષીને મોકલો', fullNamePh:'તમારું પૂર્ણ નામ', knownAsPh:'હુલામણું નામ', placeOfBirthPh:'શહેર, રાજ્ય, દેશ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ઉ.દા: શું આ વર્ષે મારી કારકિર્દી આગળ વધશે?', timePh:'ઉ.દા: 10:30' },
  kn:  { fullName:'ಪೂರ್ಣ ಹೆಸರು', knownAs:'ಅಡ್ಡಹೆಸರು', dateOfBirth:'ಹುಟ್ಟಿದ ದಿನಾಂಕ', timeOfBirth:'ಹುಟ್ಟಿದ ಸಮಯ', placeOfBirth:'ಹುಟ್ಟಿದ ಸ್ಥಳ', email:'ಇಮೇಲ್ ವಿಳಾಸ', mobile:'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', yourQuestion:'ಜ್ಯೋತಿಷಿಗೆ ನಿಮ್ಮ ಪ್ರಶ್ನೆ', pdfLang:'PDF ವರದಿ ಭಾಷೆ', consent:'ವೈಯಕ್ತಿಕ ಓದುವಿಕೆಗಾಗಿ ತಜ್ಞ ಜ್ಯೋತಿಷಿಯೊಂದಿಗೆ ನನ್ನ ಜನ್ಮ ವಿವರಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಲು ಒಪ್ಪಿಗೆ ನೀಡುತ್ತೇನೆ', sendToExpert:'ತಜ್ಞ ಜ್ಯೋತಿಷಿಗೆ ಕಳುಹಿಸಿ', fullNamePh:'ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು', knownAsPh:'ಅಡ್ಡಹೆಸರು', placeOfBirthPh:'ನಗರ, ರಾಜ್ಯ, ದೇಶ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ಉದಾ: ಈ ವರ್ಷ ನನ್ನ ವೃತ್ತಿ ಬೆಳೆಯುತ್ತದೆಯೇ?', timePh:'ಉದಾ: 10:30' },
  ml:  { fullName:'പൂർണ്ണ നാമം', knownAs:'വിളിപ്പേര്', dateOfBirth:'ജനന തീയതി', timeOfBirth:'ജനന സമയം', placeOfBirth:'ജന്മസ്ഥലം', email:'ഇമെയിൽ വിലാസം', mobile:'മൊബൈൽ നമ്പർ', yourQuestion:'ജ്യോതിഷിക്കുള്ള നിങ്ങളുടെ ചോദ്യം', pdfLang:'PDF റിപ്പോർട്ട് ഭാഷ', consent:'വ്യക്തിഗത വായനയ്ക്കായി വിദഗ്ധ ജ്യോതിഷിയുമായി എന്റെ ജനന വിശദാംശങ്ങൾ പങ്കിടാൻ ഞാൻ സമ്മതിക്കുന്നു', sendToExpert:'വിദഗ്ധ ജ്യോതിഷിക്ക് അയക്കുക', fullNamePh:'നിങ്ങളുടെ പൂർണ്ണ നാമം', knownAsPh:'വിളിപ്പേര്', placeOfBirthPh:'നഗരം, സംസ്ഥാനം, രാജ്യം', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ഉദാ: ഈ വർഷം എന്റെ കരിയർ വളരുമോ?', timePh:'ഉദാ: 10:30' },
  pa:  { fullName:'ਪੂਰਾ ਨਾਮ', knownAs:'ਉਪਨਾਮ', dateOfBirth:'ਜਨਮ ਤਾਰੀਖ', timeOfBirth:'ਜਨਮ ਸਮਾਂ', placeOfBirth:'ਜਨਮ ਸਥਾਨ', email:'ਈਮੇਲ ਪਤਾ', mobile:'ਮੋਬਾਈਲ ਨੰਬਰ', yourQuestion:'ਜੋਤਿਸ਼ੀ ਲਈ ਤੁਹਾਡਾ ਸਵਾਲ', pdfLang:'PDF ਰਿਪੋਰਟ ਭਾਸ਼ਾ', consent:'ਮੈਂ ਵਿਅਕਤੀਗਤ ਪੜ੍ਹਾਈ ਲਈ ਮਾਹਰ ਜੋਤਿਸ਼ੀ ਨਾਲ ਆਪਣੇ ਜਨਮ ਵੇਰਵੇ ਸਾਂਝੇ ਕਰਨ ਲਈ ਸਹਿਮਤ ਹਾਂ', sendToExpert:'ਮਾਹਰ ਜੋਤਿਸ਼ੀ ਨੂੰ ਭੇਜੋ', fullNamePh:'ਤੁਹਾਡਾ ਪੂਰਾ ਨਾਮ', knownAsPh:'ਉਪਨਾਮ', placeOfBirthPh:'ਸ਼ਹਿਰ, ਰਾਜ, ਦੇਸ਼', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ਉਦਾ: ਕੀ ਇਸ ਸਾਲ ਮੇਰਾ ਕਰੀਅਰ ਵਧੇਗਾ?', timePh:'ਉਦਾ: 10:30' },
  ur:  { fullName:'پورا نام', knownAs:'عرفی نام', dateOfBirth:'تاریخ پیدائش', timeOfBirth:'وقت پیدائش', placeOfBirth:'جائے پیدائش', email:'ای میل پتہ', mobile:'موبائل نمبر', yourQuestion:'نجومی کے لیے آپ کا سوال', pdfLang:'PDF رپورٹ زبان', consent:'میں ذاتی پڑھنے کے لیے ماہر نجومی کے ساتھ اپنی پیدائش کی تفصیلات شیئر کرنے پر رضامند ہوں', sendToExpert:'ماہر نجومی کو بھیجیں', fullNamePh:'آپ کا پورا نام', knownAsPh:'عرفی نام', placeOfBirthPh:'شہر، صوبہ، ملک', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'مثال: کیا اس سال میرا کیریئر ترقی کرے گا؟', timePh:'مثال: 10:30' },
  or:  { fullName:'ସମ୍ପୂର୍ଣ ନାମ', knownAs:'ଡାକ ନାମ', dateOfBirth:'ଜନ୍ମ ତାରିଖ', timeOfBirth:'ଜନ୍ମ ସମୟ', placeOfBirth:'ଜନ୍ମ ସ୍ଥାନ', email:'ଇମେଲ ଠିକଣା', mobile:'ମୋବାଇଲ ନମ୍ବର', yourQuestion:'ଜ୍ୟୋତିଷୀ ପାଇଁ ଆପଣଙ୍କ ପ୍ରଶ୍ନ', pdfLang:'PDF ରିପୋର୍ଟ ଭାଷା', consent:'ବ୍ୟକ୍ତିଗତ ପଠନ ପାଇଁ ବିଶେଷଜ୍ଞ ଜ୍ୟୋତିଷୀ ସହ ମୋ ଜନ୍ମ ବିବରଣୀ ଅଂଶୀଦାର କରିବାକୁ ମୁଁ ରାଜି', sendToExpert:'ବିଶେଷଜ୍ଞ ଜ୍ୟୋତିଷୀଙ୍କୁ ପଠାନ୍ତୁ', fullNamePh:'ଆପଣଙ୍କ ସମ୍ପୂର୍ଣ ନାମ', knownAsPh:'ଡାକ ନାମ', placeOfBirthPh:'ସହର, ରାଜ୍ୟ, ଦେଶ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ଉ.ଦା: ଏ ବର୍ଷ ମୋ କ୍ୟାରିୟର ବଢ଼ିବ କି?', timePh:'ଉ.ଦା: 10:30' },
  as:  { fullName:'সম্পূৰ্ণ নাম', knownAs:'মতা নাম', dateOfBirth:'জন্ম তাৰিখ', timeOfBirth:'জন্মৰ সময়', placeOfBirth:'জন্মস্থান', email:'ইমেইল ঠিকনা', mobile:'মোবাইল নম্বৰ', yourQuestion:'জ্যোতিষীৰ বাবে আপোনাৰ প্ৰশ্ন', pdfLang:'PDF প্ৰতিবেদন ভাষা', consent:'ব্যক্তিগত পঠনৰ বাবে বিশেষজ্ঞ জ্যোতিষীৰ সৈতে মোৰ জন্মৰ বিৱৰণ ভাগ বতৰা কৰিবলৈ মই সন্মত', sendToExpert:'বিশেষজ্ঞ জ্যোতিষীলৈ পঠাওক', fullNamePh:'আপোনাৰ সম্পূৰ্ণ নাম', knownAsPh:'মতা নাম', placeOfBirthPh:'চহৰ, ৰাজ্য, দেশ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'উদা: এই বছৰ মোৰ জীৱন আগবাঢ়িব নে?', timePh:'উদা: 10:30' },
  ne:  { fullName:'पूरा नाम', knownAs:'उपनाम', dateOfBirth:'जन्म मिति', timeOfBirth:'जन्म समय', placeOfBirth:'जन्मस्थान', email:'इमेल ठेगाना', mobile:'मोबाइल नम्बर', yourQuestion:'ज्योतिषीका लागि तपाईंको प्रश्न', pdfLang:'PDF रिपोर्ट भाषा', consent:'व्यक्तिगत पठनका लागि विशेषज्ञ ज्योतिषीसँग मेरो जन्म विवरण साझा गर्न म सहमत छु', sendToExpert:'विशेषज्ञ ज्योतिषीलाई पठाउनुस्', fullNamePh:'तपाईंको पूरा नाम', knownAsPh:'उपनाम', placeOfBirthPh:'सहर, प्रदेश, देश', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'उदाहरण: के यो वर्ष मेरो करियर बढ्छ?', timePh:'उदाहरण: 10:30' },
  sa:  { fullName:'पूर्णं नाम', knownAs:'उपनाम', dateOfBirth:'जन्मदिनाङ्कः', timeOfBirth:'जन्मसमयः', placeOfBirth:'जन्मस्थानम्', email:'विद्युत्पत्रम्', mobile:'दूरभाषसंख्या', yourQuestion:'ज्योतिर्विदे भवतः प्रश्नः', pdfLang:'PDF विवरणस्य भाषा', consent:'वैयक्तिकपठनार्थं विशेषज्ञज्योतिर्विदा सह मम जन्मविवरणं प्रदातुम् अहम् अनुमतिं ददामि', sendToExpert:'विशेषज्ञज्योतिर्विदे प्रेषयतु', fullNamePh:'भवतः पूर्णं नाम', knownAsPh:'उपनाम', placeOfBirthPh:'नगरम्, राज्यम्, देशः', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'उदाहरणम्: अस्मिन् वर्षे मम जीविका वर्धिष्यते किम्?', timePh:'उदाहरणम्: 10:30' },
  kok: { fullName:'पुराय नांव', knownAs:'देंवचें नांव', dateOfBirth:'जल्माची तारीख', timeOfBirth:'जल्माची वेळ', placeOfBirth:'जल्माची जागा', email:'इमेल पत्तो', mobile:'मोबायल नंबर', yourQuestion:'ज्योतिषाक तुमचो प्रस्न', pdfLang:'PDF रिपोर्ट भास', consent:'वैयक्तिक वाचपाखातीर विशेशज्ञ ज्योतिषाकडें म्हजें जल्म माहिती वांटूंक हांव तयार आसां', sendToExpert:'विशेशज्ञ ज्योतिषाक धाड', fullNamePh:'तुमचें पुराय नांव', knownAsPh:'देंवचें नांव', placeOfBirthPh:'शार, राज्य, देश', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'उदा: ह्या वर्सा म्हजें काम फुडें वताय?', timePh:'उदा: 10:30' },
  mni: { fullName:'ꯃꯤꯡ ꯃꯐꯝ', knownAs:'ꯃꯤꯡ ꯇꯧꯕ', dateOfBirth:'ꯆꯥꯡꯖꯔꯕ ꯅꯤꯡꯊꯧꯔꯝ', timeOfBirth:'ꯆꯥꯡꯖꯔꯕ ꯇꯥꯛ', placeOfBirth:'ꯆꯥꯡꯖꯔꯕ ꯂꯩꯐꯝ', email:'ꯏꯃꯦꯏꯜ', mobile:'ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ', yourQuestion:'ꯖꯩꯎꯇꯤꯁꯀꯤ ꯅꯠꯇ꯭ꯔꯒ ꯅꯨꯡꯍꯥꯛꯀꯤ ꯍꯥꯏꯖꯔꯕ ꯈꯛꯇꯥꯕ', pdfLang:'PDF ꯔꯤꯄꯣꯔꯠ ꯂꯣꯜ', consent:'ꯈꯨꯗꯤꯡꯒꯤ ꯐꯣꯡꯗꯣꯛꯄꯒꯤꯗꯃꯛ ꯎꯂꯨ ꯖꯩꯎꯇꯤꯁꯀꯒ ꯆꯥꯡꯖꯔꯕ ꯃꯑꯣꯡ ꯃꯄꯨꯡꯐꯥꯕ ꯁꯤꯁꯤꯅꯕꯒꯤ ꯁꯝꯃꯤꯠꯅꯤ', sendToExpert:'ꯎꯂꯨ ꯖꯩꯎꯇꯤꯁꯀꯅ ꯄꯩꯑꯣꯒꯅꯨ', fullNamePh:'ꯅꯨꯡꯒꯤ ꯃꯤꯡ ꯃꯐꯝ', knownAsPh:'ꯃꯤꯡ ꯇꯧꯕ', placeOfBirthPh:'ꯃꯐꯝ, ꯔꯥꯖꯁ꯭ꯊꯥꯟ, ꯂꯩꯄꯥꯛ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ꯅꯪꯒꯤ ꯊꯧꯗꯥꯡ ꯐꯕꯒꯅꯤ', timePh:'ꯃꯔꯝ: 10:30' },
  mai: { fullName:'पूरा नाम', knownAs:'उपनाम', dateOfBirth:'जन्म तिथि', timeOfBirth:'जन्म समय', placeOfBirth:'जन्मस्थान', email:'ईमेल पता', mobile:'मोबाइल नंबर', yourQuestion:'ज्योतिषी लेल अहाँक प्रश्न', pdfLang:'PDF रिपोर्ट भाषा', consent:'व्यक्तिगत पठन लेल विशेषज्ञ ज्योतिषीसँ अपन जन्म विवरण साझा करबाक लेल हम सहमत छी', sendToExpert:'विशेषज्ञ ज्योतिषीकेँ पठाउ', fullNamePh:'अहाँक पूरा नाम', knownAsPh:'उपनाम', placeOfBirthPh:'शहर, राज्य, देश', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'जेना: की एहि साल हमर करियर बढ़त?', timePh:'जेना: 10:30' },
  doi: { fullName:'पूरा नां', knownAs:'लाडू नां', dateOfBirth:'जनम तरीक', timeOfBirth:'जनम वेल', placeOfBirth:'जनम थाह', email:'ईमेल पता', mobile:'मोबाइल नंबर', yourQuestion:'ज्योतिशी लेई तुआडा सुआल', pdfLang:'PDF रिपोर्ट भाशा', consent:'निजी पठन लेई माहर ज्योतिशी दे नाल अपनी जनम जानकारी साँझी करन लेई मैं राजी हां', sendToExpert:'माहर ज्योतिशी गी भेजो', fullNamePh:'तुआडा पूरा नां', knownAsPh:'लाडू नां', placeOfBirthPh:'शहर, राज्य, देश', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'जिवें: की एस साल मेरा काम अग्गे जाऊगा?', timePh:'जिवें: 10:30' },
  sd:  { fullName:'پورو نالو', knownAs:'عرفي نالو', dateOfBirth:'ڄمڻ جي تاريخ', timeOfBirth:'ڄمڻ جو وقت', placeOfBirth:'ڄمڻ جي جاءِ', email:'اي ميل پتو', mobile:'موبائيل نمبر', yourQuestion:'نجومي لاءِ توهانجو سوال', pdfLang:'PDF رپورٽ ٻولي', consent:'ذاتي پڙهڻ لاءِ ماهر نجومي سان پنهنجي ڄمڻ جي تفصيل شيئر ڪرڻ تي مان راضي آهيان', sendToExpert:'ماهر نجومي کي موڪليو', fullNamePh:'توهانجو پورو نالو', knownAsPh:'عرفي نالو', placeOfBirthPh:'شهر، صوبو، ملڪ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'مثال: ڇا هن سال منهنجي ڪيريئر ۾ واڌارو ايندو؟', timePh:'مثال: 10:30' },
  ks:  { fullName:'پوٗرٕ ناو', knownAs:'عرفی ناو', dateOfBirth:'جنمۍ تٲریٖخ', timeOfBirth:'جنمۍ وَقت', placeOfBirth:'جنمۍ جاے', email:'ای میل پتہ', mobile:'موبائل نمبر', yourQuestion:'نجُومیۍ تام سوٗال', pdfLang:'PDF رپوٗرٹ زبٲن', consent:'ذاتی پَرنۍ کھوتٕ ماہر نجُومی سیٛتھ جنمۍ تفصیٖل ونٛڈِتھ مہ راضی چھُس', sendToExpert:'ماہر نجُومیۍ کنہ پاٹھاو', fullNamePh:'سُنٛدرٕ ناو', knownAsPh:'عرفی ناو', placeOfBirthPh:'شہر، صوبہ، مُلک', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'مثال: کیا یۄس سالہ مہ کام بَڑِتھ ؟', timePh:'مثال: 10:30' },
  sat: { fullName:'ᱯᱩᱨᱟ ᱨᱮᱱ', knownAs:'ᱫᱟᱠ ᱨᱮᱱ', dateOfBirth:'ᱡᱚᱱᱚᱢ ᱛᱟᱨᱤᱠ', timeOfBirth:'ᱡᱚᱱᱚᱢ ᱸᱦᱤᱡ', placeOfBirth:'ᱡᱚᱱᱚᱢ ᱫᱷᱟᱱ', email:'ᱤᱢᱮᱞ ᱯᱚᱛᱚ', mobile:'ᱢᱚᱵᱟᱭᱞ ᱱᱚᱢᱵᱚᱨ', yourQuestion:'ᱡᱳᱛᱤᱥᱤᱟᱜ ᱟᱯᱱᱟᱜ ᱯᱩᱪᱷᱤᱡ', pdfLang:'PDF ᱨᱤᱯᱚᱨᱴ ᱪᱷᱟᱸᱫ', consent:'ᱵᱮᱜᱚᱨ ᱯᱚᱱᱚᱜ ᱠᱷᱟᱛᱤᱨ ᱵᱤᱥᱮᱥᱚᱡᱽᱱ ᱡᱳᱛᱤᱥᱤᱟᱠᱤᱱ ᱡᱚᱱᱚᱢ ᱴᱷᱤᱠᱟᱱᱟ ᱵᱟᱸᱫᱷᱟᱣ ᱠᱮᱫᱮ ᱫᱚ ᱦᱚᱸ ᱨᱟᱡᱤ', sendToExpert:'ᱵᱤᱥᱮᱥᱚᱡᱽᱱ ᱡᱳᱛᱤᱥᱤᱟᱠᱤᱱ ᱦᱩᱰᱤᱧ ᱠᱟᱛᱮ', fullNamePh:'ᱟᱯᱱᱟᱜ ᱯᱩᱨᱟ ᱨᱮᱱ', knownAsPh:'ᱫᱟᱠ ᱨᱮᱱ', placeOfBirthPh:'ᱱᱚᱜᱚᱨ, ᱨᱟᱡᱽᱭᱚ, ᱫᱮᱥ', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'ᱩᱫᱟ: ᱱᱚᱣᱟ ᱥᱟᱞᱚᱜ ᱟᱢ ᱠᱟᱢ ᱵᱟᱲᱟᱭᱟᱜᱟ?', timePh:'ᱩᱫᱟ: 10:30' },
  bo:  { fullName:'पूरो नांउ', knownAs:'डाकनांउ', dateOfBirth:'जोनोम तारिख', timeOfBirth:'जोनोम थांखि', placeOfBirth:'जोनोम बिथाय', email:'इमेल फरा', mobile:'मोबाइल नोम्बर', yourQuestion:'ज्योतिशीनि थाखाय नङाव सुंसारि', pdfLang:'PDF रिपोर्ट हादरसे', consent:'थिसनाय पोरसानाय थाखाय बिसेस ज्योतिशीनि गेजेर जोनोम सोमोन्दो थाबायनाय थाखाय मो राजि', sendToExpert:'बिसेस ज्योतिशीनो पाठाव', fullNamePh:'नङाव पूरो नांउ', knownAsPh:'डाकनांउ', placeOfBirthPh:'बिदाय, राज, हादर', emailPh:'you@example.com', mobilePh:'+91 98765 43210', questionPh:'जादों: मानो आं ब्युरो बोसोरावनो काम बाड़ाब?', timePh:'जादों: 10:30' },
};

function getFormLabels(langCode: string): FormLabels {
  return FORM_LABELS[langCode] ?? FORM_LABELS['en'];
}

// ── 22 Indian Constitutional Languages + English ───────────────────────────
const INDIAN_LANGUAGES = [
  { code: 'en',  name: 'English',    native: 'English' },
  { code: 'hi',  name: 'Hindi',      native: 'हिन्दी' },
  { code: 'bn',  name: 'Bengali',    native: 'বাংলা' },
  { code: 'te',  name: 'Telugu',     native: 'తెలుగు' },
  { code: 'mr',  name: 'Marathi',    native: 'मराठी' },
  { code: 'ta',  name: 'Tamil',      native: 'தமிழ்' },
  { code: 'gu',  name: 'Gujarati',   native: 'ગુજરાતી' },
  { code: 'kn',  name: 'Kannada',    native: 'ಕನ್ನಡ' },
  { code: 'ml',  name: 'Malayalam',  native: 'മലയാളം' },
  { code: 'pa',  name: 'Punjabi',    native: 'ਪੰਜਾਬੀ' },
  { code: 'or',  name: 'Odia',       native: 'ଓଡ଼ିଆ' },
  { code: 'as',  name: 'Assamese',   native: 'অসমীয়া' },
  { code: 'ur',  name: 'Urdu',       native: 'اردو' },
  { code: 'ks',  name: 'Kashmiri',   native: 'कॉशुर' },
  { code: 'ne',  name: 'Nepali',     native: 'नेपाली' },
  { code: 'sd',  name: 'Sindhi',     native: 'سنڌي' },
  { code: 'sa',  name: 'Sanskrit',   native: 'संस्कृत' },
  { code: 'kok', name: 'Konkani',    native: 'कोंकणी' },
  { code: 'mni', name: 'Manipuri',   native: 'মৈতৈলোন্' },
  { code: 'mai', name: 'Maithili',   native: 'मैथिली' },
  { code: 'doi', name: 'Dogri',      native: 'डोगरी' },
  { code: 'sat', name: 'Santali',    native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'bo',  name: 'Bodo',       native: 'बड़ो' },
];

function validateProfile(p: {
  full_name: string; date_of_birth: string; time_of_birth: string;
  place_of_birth: string; pincode: string;
}): FieldErrors {
  const e: FieldErrors = {};

  // ── Full name ──
  const name = p.full_name.trim();
  if (!name) {
    e['full_name'] = 'Full name is required.';
  } else if (!/^[a-zA-Z\s\-'.]{2,80}$/.test(name)) {
    e['full_name'] = 'Use letters only — no numbers or symbols.';
  } else {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      e['full_name'] = 'Enter your full name — at least two words.';
    } else if (words.some(w => !isValidNameWord(w))) {
      e['full_name'] = 'Name looks unusual — please enter your real full name.';
    }
  }

  // ── Date of birth ──
  const dob = p.date_of_birth;
  if (!dob) {
    e['date_of_birth'] = 'Date of birth is required.';
  } else if (!isValidDate(dob)) {
    e['date_of_birth'] = 'Enter a valid date.';
  } else {
    const d = new Date(dob); const now = new Date(); now.setHours(0,0,0,0);
    if (d > now) e['date_of_birth'] = 'Date of birth cannot be in the future.';
    else if (d < new Date('1900-01-01')) e['date_of_birth'] = 'Enter a date after 1 Jan 1900.';
    else {
      const age = Math.floor((now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
      if (age > 120) e['date_of_birth'] = 'Age exceeds 120 years — please check.';
    }
  }

  // ── Time of birth ──
  const tob = p.time_of_birth;
  if (tob && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(tob))
    e['time_of_birth'] = 'Enter hours (0–23) and minutes (0–59).';

  // ── Place of birth ──
  const place = p.place_of_birth.trim();
  if (!place) {
    e['place_of_birth'] = 'Place of birth is required.';
  } else if (place.length < 3) {
    e['place_of_birth'] = 'Enter at least 3 characters.';
  } else if (/[0-9@#$%^&*()_+=<>{}[\]|\\]/.test(place)) {
    e['place_of_birth'] = 'Enter a city or town name — letters only.';
  }

  // ── Pincode ──
  const pin = p.pincode.trim();
  if (pin && !/^\d{4,8}$/.test(pin)) e['pincode'] = 'Enter a valid 4–8 digit PIN code.';

  return e;
}

@Component({
  selector: 'app-intake',
  standalone: true,
  imports: [CommonModule, FormsModule, AgentFlowComponent, AppFooterComponent],
  template: `
<div class="shell">

<!-- ══ ASTROLOGICAL TRANSLATION OVERLAY ══════════════════════════════════════ -->
@if (preparingReport() || chakraLoading()) {
  <div class="astro-overlay">
    <div class="chakra-spin-wrap">
      <div class="chakra-glow-ring"></div>
      <img src="rav-logo.png" class="chakra-spin-logo" alt=""/>
    </div>
  </div>
}

  <!-- ══ HEADER ══ -->
  <header class="hdr">
    <div class="hdr-brand">
      <img src="rav-logo.png" alt="Aura with Rav" class="hdr-logo"/>
      <div class="hdr-brand-text">
        <span class="hdr-name">AURA <em>with Rav</em></span>
        <span class="hdr-tag">See life — as it is.</span>
      </div>
    </div>
    <nav class="hdr-nav">
      <span class="hdr-nav-item">🪐 Astrology</span>
      <span class="hdr-sep">·</span>
      <span class="hdr-nav-item">🔢 Numerology</span>
      <span class="hdr-sep">·</span>
      <span class="hdr-nav-item">✋ Palmistry</span>
      <span class="hdr-sep">·</span>
      <span class="hdr-nav-item">🃏 Tarot</span>
      <span class="hdr-sep">·</span>
      <span class="hdr-nav-item">🏠 Vastu</span>
    </nav>
    <div class="hdr-user">
      <!-- Admin quick-nav buttons -->
      @if (auth.isAdmin()) {
        <button class="hdr-icon-btn" (click)="router.navigate(['/metrics'])" title="Metrics">
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><rect x="1" y="7" width="3" height="6" rx="1" fill="currentColor"/><rect x="5.5" y="4" width="3" height="9" rx="1" fill="currentColor"/><rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor"/></svg>
          <span class="hdr-btn-label">Metrics</span>
        </button>
        <button class="hdr-icon-btn hdr-leads-btn" (click)="router.navigate(['/admin/users'])" title="Leads">
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 7l1.5 1.5L13.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="hdr-btn-label">Leads</span>
          @if (newLeadCount() > 0) {
            <span class="lead-count-badge">{{ newLeadCount() }}</span>
          }
        </button>
      }

      <!-- Book a Session CTA -->
      <a href="https://topmate.io/aurawithrav" class="hdr-book-btn" target="_blank" rel="noopener">Book a Session</a>

      <!-- Divider -->
      <div class="hdr-divider"></div>

      <!-- Identity chip: avatar + name + role badge -->
      <div class="hdr-identity">
        <img src="rav-photo.png" alt="" class="hdr-avatar"/>
        <div class="hdr-id-text">
          <span class="hdr-uname">{{ auth.userName() || auth.tenantName() || 'User' }}</span>
          @if (auth.isAdmin()) {
            <span class="hdr-role-badge" [class]="auth.role()">{{ auth.role() | uppercase }}</span>
          }
        </div>
      </div>

      <!-- Profile + Sign Out -->
      <button class="hdr-icon-btn" (click)="router.navigate(['/profile'])" title="Profile">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span class="hdr-btn-label">Profile</span>
      </button>
      <button class="hdr-signout-btn" (click)="auth.logout()" title="Sign Out">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span class="hdr-btn-label">Sign Out</span>
      </button>
    </div>
  </header>

  <!-- Lead reading mode banner -->
  @if (leadReadingMode()) {
    <div class="lead-reading-banner">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6.5" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.2"/><path d="M7.5 4v4M7.5 10v.5" stroke="#92400e" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>Expert Reading Mode — completing analysis for <strong>{{ profileSig().full_name || 'client' }}</strong>. This reading will be delivered to them automatically.</span>
      <button class="lead-reading-cancel" (click)="leadReadingMode.set(false); leadReadingId.set(''); router.navigate(['/admin/users'])">← Back to Leads</button>
    </div>
  }

  <!-- ══ VIEW: HOME — Birth Profile (center) + Modules (right) ══ -->
  @if (view() === 'home') {
  <div class="home-wrapper">
  <div class="workspace home-layout">

    <!-- ── CENTER: Birth Profile ── -->
    <section class="panel panel-center">
      <div class="ptb">
        <span class="ptb-title">Birth Profile</span>
        <!-- Language switcher — visible on main page, switches all form labels instantly -->
        <div class="ptb-lang-wrap">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;opacity:0.7">
            <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zM2 10h4M14 10h4M10 2v4M10 14v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M4.9 4.9C6.4 7.1 8 8.9 10 10c2-.9 3.5-2.7 5.1-5.1M15.1 15.1C13.6 12.9 12 11.1 10 10c-2 .9-3.5 2.7-5.1 5.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <select class="ptb-lang-select"
            [ngModel]="uiLanguage()"
            (ngModelChange)="switchLanguage($event)">
            @for (lang of availableLanguages; track lang.code) {
              <option [value]="lang.code">{{ lang.native }}</option>
            }
          </select>
          @if (uiLoading()) {
            <span class="ptb-lang-spinner"></span>
          }
        </div>
      </div>
      @if (uiLoading()) {
        <div class="ui-translating-overlay">
          <span class="ui-translating-spinner"></span>
          Translating UI…
        </div>
      }

      <div class="panel-scroll">

        <!-- ── Personal Details card ── -->
        <div class="card">
          <div class="card-hdr">
            <div class="card-icon-wrap" style="background:rgba(99,102,241,0.1)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke-linecap="round"/>
              </svg>
            </div>
            <div>
              <div class="card-title">{{ uiStrings().section_personal_details }}</div>
              <div class="card-sub">{{ uiStrings().section_personal_sub }}</div>
            </div>
          </div>

          <div class="fields">

            <!-- Full Name + Known As -->
            <div class="field-row">
              <div class="field field-grow">
                <label class="flabel">
                  {{ uiStrings().label_full_name }} <span class="req">*</span>
                  <span class="flabel-hint">{{ uiStrings().label_full_name_hint }}</span>
                </label>
                <div class="inp-wrap"
                     [class.inp-err]="touched()['full_name'] && errors()['full_name']"
                     [class.inp-ok]="touched()['full_name'] && !errors()['full_name'] && profile().full_name">
                  <input class="inp" type="text"
                         [placeholder]="uiStrings().ph_full_name"
                         [value]="profile().full_name"
                         (input)="onNameInput($any($event.target).value)"
                         (blur)="touch('full_name')"
                         autocomplete="name" spellcheck="false"/>
                  @if (touched()['full_name'] && !errors()['full_name'] && profile().full_name) {
                    <span class="inp-check">✓</span>
                  }
                </div>
                @if (touched()['full_name'] && errors()['full_name']) {
                  <span class="ferr">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" stroke-width="1.2"/><path d="M6 3.5v3M6 8v.5" stroke="#ef4444" stroke-width="1.3" stroke-linecap="round"/></svg>
                    {{ errors()['full_name'] }}
                  </span>
                }
              </div>
              <div class="field">
                <label class="flabel">{{ uiStrings().label_known_as }} <span class="opt">optional</span></label>
                <div class="inp-wrap">
                  <input class="inp" type="text" [placeholder]="uiStrings().ph_known_as"
                         [value]="profile().alias_name"
                         (input)="patch('alias_name', $any($event.target).value)"/>
                </div>
              </div>
            </div>

            <!-- Date of Birth + Time of Birth -->
            <div class="field-row">
              <div class="field">
                <label class="flabel">{{ uiStrings().label_dob }} <span class="req">*</span></label>
                <div class="inp-wrap"
                     [class.inp-err]="touched()['date_of_birth'] && errors()['date_of_birth']"
                     [class.inp-ok]="touched()['date_of_birth'] && !errors()['date_of_birth'] && profile().date_of_birth">
                  <input class="inp dob-text-inp"
                         type="text"
                         inputmode="numeric"
                         placeholder="DD / MM / YYYY"
                         maxlength="14"
                         autocomplete="bday"
                         [value]="dobDisplayValue()"
                         (input)="onDobInput($any($event.target).value)"
                         (blur)="touch('date_of_birth')" />
                  @if (touched()['date_of_birth'] && !errors()['date_of_birth'] && profile().date_of_birth) {
                    <span class="inp-check">✓</span>
                  }
                </div>
                @if (touched()['date_of_birth'] && errors()['date_of_birth']) {
                  <span class="ferr">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" stroke-width="1.2"/><path d="M6 3.5v3M6 8v.5" stroke="#ef4444" stroke-width="1.3" stroke-linecap="round"/></svg>
                    {{ errors()['date_of_birth'] }}
                  </span>
                }
                @if (ageDisplay()) {
                  <span class="field-hint-ok">Age: {{ ageDisplay() }}</span>
                }
              </div>
              <div class="field">
                <label class="flabel">
                  {{ uiStrings().label_tob }} <span class="opt">optional</span>
                </label>
                <!-- Time-of-day quick selector -->
                <div class="tod-pills">
                  @for (tod of timeOfDayOptions; track tod.value) {
                    <button class="tod-pill"
                            [class.tod-pill-on]="selectedTod() === tod.value"
                            (click)="selectTod(tod.value)">
                      {{ tod.icon }} {{ tod.label }}
                    </button>
                  }
                </div>
                <!-- Exact time input — explicit 24h HH:MM spinners -->
                @if (selectedTod() === 'exact' || profile().time_of_birth) {
                  <div class="tob-24h-wrap" style="margin-top:6px"
                       [class.tob-err]="touched()['time_of_birth'] && errors()['time_of_birth']">
                    <span class="tob-badge">24h</span>
                    <input class="tob-hh" type="number" min="0" max="23"
                           placeholder="HH"
                           [value]="tobHH()"
                           (input)="onTobHH($any($event.target).value)"
                           (blur)="touch('time_of_birth')"
                           maxlength="2"/>
                    <span class="tob-sep">:</span>
                    <input class="tob-mm" type="number" min="0" max="59"
                           placeholder="MM"
                           [value]="tobMM()"
                           (input)="onTobMM($any($event.target).value)"
                           (blur)="touch('time_of_birth')"
                           maxlength="2"/>
                    @if (profile().time_of_birth && !errors()['time_of_birth']) {
                      <span class="tob-ok">✓ {{ profile().time_of_birth }}</span>
                    }
                  </div>
                }
                @if (touched()['time_of_birth'] && errors()['time_of_birth']) {
                  <span class="ferr">{{ errors()['time_of_birth'] }}</span>
                }
                @if (selectedTod() && selectedTod() !== 'exact') {
                  <span class="field-hint-ok">{{ todHint() }} (24h) · Exact time improves accuracy</span>
                }
              </div>
            </div>

            <!-- Place of Birth -->
            <div class="field">
              <label class="flabel">{{ uiStrings().label_place_of_birth }} <span class="req">*</span></label>
              <div class="inp-wrap"
                   [class.inp-err]="touched()['place_of_birth'] && errors()['place_of_birth']"
                   [class.inp-ok]="touched()['place_of_birth'] && !errors()['place_of_birth'] && profile().place_of_birth">
                <svg class="inp-ico" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5c0-2.485-2.015-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.2"/>
                  <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.2"/>
                </svg>
                <input class="inp inp-icon" type="text"
                       [placeholder]="uiStrings().ph_place_of_birth"
                       [value]="profile().place_of_birth"
                       (input)="patch('place_of_birth', $any($event.target).value)"
                       (blur)="touch('place_of_birth')"/>
                @if (touched()['place_of_birth'] && !errors()['place_of_birth'] && profile().place_of_birth) {
                  <span class="inp-check">✓</span>
                }
              </div>
              @if (touched()['place_of_birth'] && errors()['place_of_birth']) {
                <span class="ferr">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" stroke-width="1.2"/><path d="M6 3.5v3M6 8v.5" stroke="#ef4444" stroke-width="1.3" stroke-linecap="round"/></svg>
                  {{ errors()['place_of_birth'] }}
                </span>
              }
              @if (geoResolved()) {
                <span class="geo-badge">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#10b981" stroke-width="1.4"/><path d="M3.5 6l2 2L8.5 4" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {{ geoResolved()!.display_name | slice:0:48 }} · {{ geoResolved()!.lat.toFixed(2) }}°N {{ geoResolved()!.lon.toFixed(2) }}°E
                </span>
              }
              @if (geoResolving()) {
                <span class="geo-resolving">Resolving coordinates…</span>
              }
            </div>

            <!-- Pincode -->
            <div class="field">
              <label class="flabel">PIN Code <span class="opt">optional</span></label>
              <div class="inp-wrap" [class.inp-err]="touched()['pincode'] && errors()['pincode']">
                <input class="inp" type="text" placeholder="e.g. 800001" maxlength="10"
                       inputmode="numeric"
                       [value]="profile().pincode"
                       (input)="patch('pincode', $any($event.target).value)"
                       (blur)="touch('pincode')"/>
              </div>
              @if (touched()['pincode'] && errors()['pincode']) {
                <span class="ferr">{{ errors()['pincode'] }}</span>
              }
            </div>

          </div>
        </div>

        <!-- ── Your Question card ── -->
        <div class="card card-question">
          <div class="card-hdr">
            <div class="card-icon-wrap" style="background:rgba(16,185,129,0.1)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.8">
                <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <div class="card-title">{{ uiStrings().section_question }}</div>
              <div class="card-sub">{{ uiStrings().section_question_sub }}</div>
            </div>
          </div>

          <!-- Quick topic pills -->
          <div class="topic-pills">
            @for (t of questionTopics; track t.label) {
              <button class="topic-pill" (click)="setTopicQuestion(t.q)">{{ t.icon }} {{ t.label }}</button>
            }
          </div>

          <div class="inp-wrap q-inp-wrap"
               [class.inp-err]="questionTouched() && !qScore().ok && userQuestion.trim()"
               [class.inp-ok]="qScore().ok">
            <textarea class="inp inp-ta q-ta" [(ngModel)]="userQuestion"
                      (ngModelChange)="onQuestionChange()"
                      (blur)="questionTouched.set(true)"
                      rows="4"
                      [placeholder]="uiStrings().ph_question"></textarea>
            <!-- Character / quality indicator -->
            <div class="q-footer">
              <span class="q-word-count" [class.q-wc-ok]="qScore().ok">
                {{ wordCount() }} words
              </span>
              @if (qScore().ok) {
                <span class="q-quality-badge">✓ Good question</span>
              }
            </div>
          </div>

          <!-- Inline quality hint -->
          @if (questionTouched() && userQuestion.trim() && !qScore().ok) {
            <div class="q-hint-row">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#f59e0b" stroke-width="1.2"/><path d="M6 3.5v3M6 8v.5" stroke="#f59e0b" stroke-width="1.3" stroke-linecap="round"/></svg>
              <span class="q-hint-text">{{ qScore().hint }}</span>
            </div>
          }

          <!-- AI suggestion -->
          @if (questionTouched() && userQuestion.trim() && !qScore().ok) {
            <div class="q-suggestion">
              <span class="q-sug-label">✦ Try this instead:</span>
              <span class="q-sug-text">{{ questionSuggestion() }}</span>
              <button class="q-sug-btn" (click)="applyQuestionSuggestion()">Use this</button>
            </div>
          }

          @if (auth.isAdmin() && orch.focusContext()['intent']) {
            <div class="focus-chip">
              <span class="focus-chip-dot"></span>
              Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong>
              &nbsp;·&nbsp; {{ orch.focusContext()['confidence'] }} confidence
            </div>
          }
        </div>

      </div>
    </section>

    <!-- ── RIGHT: Analysis Modules ── -->
    <aside class="panel panel-right">
      <div class="ptb">
        <span class="ptb-title">{{ uiStrings().panel_modules }}</span>
      </div>

      <div class="panel-scroll">

        <!-- Module chips -->
        <div class="mod-grid">
          @for (m of allModules; track m.id) {
            <button class="mod-chip" [class.mod-chip-on]="isSelected(m.id)" (click)="toggleModule(m.id)">
              <span class="mod-chip-icon">{{ m.icon }}</span>
              <div class="mod-chip-body">
                <span class="mod-chip-name">{{ m.label }}</span>
                <span class="mod-chip-desc">{{ m.desc }}</span>
              </div>
              @if (isSelected(m.id)) {
                <span class="mod-chip-check">✓</span>
              }
            </button>
          }
        </div>

        <!-- Sub inputs -->
        @if (isSelected('palmistry')) {
          <div class="sub-card">
            <div class="sub-card-title">✋ Palmistry Details <span class="sub-badge">optional</span></div>
            <div class="field-row">
              <div class="field">
                <label class="flabel">Hand Shape</label>
                <div class="inp-wrap">
                  <select class="inp inp-sel" [(ngModel)]="palmInput.hand_shape">
                    <option value="">— Select —</option>
                    @for (s of handShapes; track s) { <option [value]="s">{{ s }}</option> }
                  </select>
                </div>
              </div>
              <div class="field">
                <label class="flabel">Left Hand</label>
                <div class="upload-zone" (click)="lRef.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event,'left')">
                  <span>📷</span><span>{{ leftFileName() || 'Upload image' }}</span>
                  <input #lRef type="file" accept="image/*" (change)="onFile($event,'left')" style="display:none"/>
                </div>
              </div>
              <div class="field">
                <label class="flabel">Right Hand</label>
                <div class="upload-zone" (click)="rRef.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event,'right')">
                  <span>📷</span><span>{{ rightFileName() || 'Upload image' }}</span>
                  <input #rRef type="file" accept="image/*" (change)="onFile($event,'right')" style="display:none"/>
                </div>
              </div>
            </div>
          </div>
        }

        @if (isSelected('tarot')) {
          <div class="sub-card">
            <div class="sub-card-title">🃏 Tarot Settings</div>
            <div class="field-row">
              <div class="field" style="flex:2">
                <label class="flabel">Focus Question</label>
                <div class="inp-wrap">
                  <textarea class="inp inp-ta" [(ngModel)]="tarotInput.question" rows="2"
                    placeholder="What should I focus on in my career?"></textarea>
                </div>
              </div>
              <div class="field">
                <label class="flabel">Spread</label>
                <div class="seg">
                  @for (s of spreads; track s) {
                    <button class="seg-btn" [class.seg-on]="tarotInput.spread === s" (click)="setSpread(s)">{{ s }}</button>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        @if (isSelected('vastu')) {
          <div class="sub-card">
            <div class="sub-card-title">🏠 Vastu Details</div>
            <div class="field-row">
              <div class="field">
                <label class="flabel">Property Type</label>
                <div class="inp-wrap">
                  <select class="inp inp-sel" [(ngModel)]="vastuInput.property_type">
                    <option value="">— Select —</option>
                    <option>Apartment / Flat</option><option>Independent House</option>
                    <option>Villa</option><option>Office / Commercial</option><option>Plot / Land</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label class="flabel">Main Door Facing</label>
                <div class="inp-wrap">
                  <select class="inp inp-sel" [(ngModel)]="vastuInput.facing_direction">
                    <option value="">— Select —</option>
                    @for (d of directions; track d) { <option>{{ d }}</option> }
                  </select>
                </div>
              </div>
              <div class="field" style="flex:2">
                <label class="flabel">Floor Plan Notes</label>
                <div class="inp-wrap">
                  <textarea class="inp inp-ta" [(ngModel)]="vastuInput.floor_plan_notes" rows="2"
                    placeholder="Kitchen SE, Master SW…"></textarea>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- ── Prompt Version Selector ── -->
        <div class="pv-card">
          <div class="pv-label">{{ uiStrings().label_report_style }}</div>
          <div class="pv-options">

            <button class="pv-opt pv-opt-v1" [class.pv-opt-on]="promptVersion() === 'v1'" (click)="promptVersion.set('v1')">
              <div class="pv-radio" [class.pv-radio-on]="promptVersion() === 'v1'">
                @if (promptVersion() === 'v1') { <div class="pv-radio-dot pv-radio-dot-warm"></div> }
              </div>
              <div class="pv-icon-wrap pv-icon-warm" [class.pv-icon-on]="promptVersion() === 'v1'">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </div>
              <div class="pv-body">
                <span class="pv-name">{{ uiStrings().style_warm }}</span>
                <span class="pv-desc">{{ uiStrings().style_warm_sub }}</span>
              </div>
            </button>

            <button class="pv-opt pv-opt-v2" [class.pv-opt-on]="promptVersion() === 'v2'" (click)="promptVersion.set('v2')">
              <div class="pv-radio" [class.pv-radio-on]="promptVersion() === 'v2'">
                @if (promptVersion() === 'v2') { <div class="pv-radio-dot pv-radio-dot-sharp"></div> }
              </div>
              <div class="pv-icon-wrap pv-icon-sharp" [class.pv-icon-on]="promptVersion() === 'v2'">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <div class="pv-body">
                <div class="pv-name-row">
                  <span class="pv-name">{{ uiStrings().style_sharp }}</span>
                  <span class="pv-badge">{{ uiStrings().badge_recommended }}</span>
                </div>
                <span class="pv-desc">{{ uiStrings().style_sharp_sub }}</span>
              </div>
            </button>

          </div>
        </div>

        <!-- CTA -->
        <div class="cta-row">
          @if (launchError()) { <p class="launch-err">⚠ {{ launchError() }}</p> }

          @if (orch.isDone()) {
            <!-- Results are ready — show Review button prominently -->
            <div class="results-ready-row">
              <div class="results-ready-badge">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" fill="#10b981" opacity="0.15"/>
                  <path d="M3.5 7l2.5 2.5L10.5 4" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ uiStrings().badge_analysis_complete }}
              </div>
              <button class="cta cta-review" (click)="goReview()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M4 5h6M4 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                {{ auth.isAdmin() ? uiStrings().btn_review_admin : uiStrings().btn_review }}
              </button>
              <button class="cta-rerun" (click)="rerun()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 6A4 4 0 1 1 8.5 2.5M10 1v3H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ uiStrings().btn_rerun }}
              </button>
            </div>
          } @else {
            <button class="cta" [disabled]="orch.isRunning()" (click)="launch()">
              @if (orch.isRunning()) {
                <span class="spinner"></span> Agents Running…
              } @else {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linejoin="round"/></svg>
                {{ uiStrings().btn_begin }}
              }
            </button>
            <p class="cta-hint">{{ uiStrings().hint_begin }}</p>
          }
        </div>

      </div>
    </aside>

  </div><!-- /home-layout -->

  <!-- ── Graph drawer — shown when showGraph() is true ── -->
  @if (showGraph()) {
    <div class="graph-drawer">
      <div class="graph-drawer-header">
        <span class="ptb-title">Agent Pipeline · Dynamic Graph</span>
        <button class="graph-drawer-close" (click)="showGraph.set(false)" title="Close graph">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="graph-drawer-body">
        <app-agent-flow></app-agent-flow>
      </div>
    </div>
  }

  <!-- ── Graph toggle button (fixed to bottom-right) ── -->
  <button class="graph-fab" (click)="showGraph.update(v => !v)" [class.graph-fab-active]="showGraph()" title="Toggle Pipeline Graph">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="5"  cy="12" r="2.5"/><circle cx="19" cy="5"  r="2.5"/><circle cx="19" cy="19" r="2.5"/>
      <line x1="7.5" y1="11" x2="16.6" y2="6.5" stroke-linecap="round"/>
      <line x1="7.5" y1="13" x2="16.6" y2="17.5" stroke-linecap="round"/>
    </svg>
    {{ showGraph() ? 'Hide Graph' : 'View Pipeline Graph' }}
  </button>

  </div><!-- /home-wrapper -->
  }

  <!-- ══ VIEW: PIPELINE — full-page agent pipeline ══ -->
  @if (view() === 'pipeline') {
  <div class="workspace pipeline-layout">

    <!-- Pipeline header bar -->
    <div class="pipeline-topbar">
      <button class="pipeline-back" (click)="view.set('home')">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </button>
      <div class="pipeline-topbar-title">
        <span class="ptb-title">Agent Pipeline</span>
        <span class="pipeline-topbar-sub">360° · Multi-Tradition Neural Orchestration</span>
      </div>
      <div class="pipeline-status-legend">
        <span class="leg-dot leg-queued"></span><span class="leg-label">Queued</span>
        <span class="leg-dot leg-running"></span><span class="leg-label">Running</span>
        <span class="leg-dot leg-done"></span><span class="leg-label">Done</span>
      </div>
    </div>

    <!-- Progress card -->
    @if (orch.isRunning() || orch.isDone()) {
      <div class="pipeline-progress-bar-wrap">
        <div class="prog-track pipeline-prog-track">
          <div class="prog-fill" [style.width.%]="orch.progress()"></div>
        </div>
        <span class="prog-pct">{{ orch.progress() }}%</span>
        @if (auth.isAdmin() && orch.sessionId()) {
          <div class="alert-ok">🔑 Session {{ orch.sessionId() }} · Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong></div>
        }
        @if (orch.isDone()) {
          <div class="done-row">
            @if (orch.cacheHit()) {
              <span class="cache-hit-badge">⚡ Response served from cache</span>
            }
            <span class="done-msg">✦ Reading complete</span>
            <button class="done-btn" (click)="goReview()">
              {{ auth.isAdmin() ? 'Open Review →' : 'Get My PDF Report →' }}
            </button>
          </div>
        }
      </div>
    }

    <!-- Agent flow fills remaining space -->
    <section class="panel pipeline-panel">
      <div class="panel-fill">
        <app-agent-flow></app-agent-flow>
      </div>
    </section>

  </div>
  }

  <!-- ══ FOOTER ══ -->
<!-- ══ LEAD FORM MODAL (USER 2nd run+) ══════════════════════════════════════ -->
@if (showLeadForm() && !leadSubmitted()) {
  <div class="lead-overlay">
    <div class="lead-card">
      <div class="lead-card-header">
        <div class="lead-star-badge">✦</div>
        <h2 class="lead-title">{{ uiStrings().lead_title }}</h2>
        <p class="lead-subtitle">{{ uiStrings().lead_subtitle }}</p>
      </div>

      @if (leadError()) {
        <div class="lead-error">⚠ {{ leadError() }}</div>
      }

      <!-- UI Language Switcher — switches form labels + placeholders -->
      <div class="ui-lang-bar">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zM2 10h4M14 10h4M10 2v4M10 14v4" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/><path d="M4.9 4.9C6.4 7.1 8 8.9 10 10c2-.9 3.5-2.7 5.1-5.1M15.1 15.1C13.6 12.9 12 11.1 10 10c-2 .9-3.5 2.7-5.1 5.1" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="ui-lang-label">Fill form in:</span>
        <select class="ui-lang-select"
          [ngModel]="uiLanguage()"
          (ngModelChange)="switchLanguage($event)">
          @for (lang of availableLanguages; track lang.code) {
            <option [value]="lang.code">{{ lang.native }} — {{ lang.name }}</option>
          }
        </select>
      </div>

      <div class="lead-form">
        <div class="lead-field-row">
          <div class="lead-field">
            <label class="lead-label">{{ uiStrings().label_full_name }} *</label>
            <input class="lead-input" type="text"
              [(ngModel)]="leadForm.name"
              [placeholder]="uiStrings().ph_full_name"/>
          </div>
          <div class="lead-field">
            <label class="lead-label">{{ uiStrings().label_known_as }}</label>
            <input class="lead-input" type="text"
              [(ngModel)]="leadForm.alias_name"
              [placeholder]="uiStrings().ph_known_as"/>
          </div>
        </div>
        <div class="lead-field-row">
          <div class="lead-field">
            <label class="lead-label">{{ uiStrings().label_dob }} *</label>
            <input class="lead-input" type="date"
              [(ngModel)]="leadForm.dob"/>
          </div>
          <div class="lead-field">
            <label class="lead-label">{{ uiStrings().label_tob }}</label>
            <input class="lead-input" type="text"
              [(ngModel)]="leadForm.time_of_birth"
              [placeholder]="uiStrings().ph_tob_hh + ':' + uiStrings().ph_tob_mm"/>
          </div>
        </div>
        <div class="lead-field-row">
          <div class="lead-field lead-field-grow">
            <label class="lead-label">{{ uiStrings().label_place_of_birth }} *</label>
            <input class="lead-input" type="text"
              [(ngModel)]="leadForm.place_of_birth"
              [placeholder]="uiStrings().ph_place_of_birth"/>
          </div>
        </div>
        <div class="lead-field-row">
          <div class="lead-field">
            <label class="lead-label">{{ uiStrings().label_email }} *</label>
            <input class="lead-input" type="email"
              [(ngModel)]="leadForm.email"
              [placeholder]="uiStrings().ph_email"/>
          </div>
          <div class="lead-field">
            <label class="lead-label">{{ uiStrings().label_mobile }}</label>
            <input class="lead-input" type="tel"
              [(ngModel)]="leadForm.phone"
              [placeholder]="uiStrings().ph_mobile"/>
          </div>
        </div>
        <div class="lead-field-row">
          <div class="lead-field lead-field-grow">
            <label class="lead-label">{{ uiStrings().label_question_astro }} *</label>
            <textarea class="lead-input lead-textarea"
              [(ngModel)]="leadForm.question"
              [placeholder]="uiStrings().ph_question"
              rows="2"></textarea>
          </div>
        </div>
        <!-- Language Picker — PDF output language (synced with UI language above) -->
        <div class="lead-field-row">
          <div class="lead-field lead-field-grow">
            <label class="lead-label">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style="vertical-align:-2px;margin-right:4px"><path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zM2 10h4M14 10h4M10 2v4M10 14v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4.9 4.9C6.4 7.1 8 8.9 10 10c2-.9 3.5-2.7 5.1-5.1M15.1 15.1C13.6 12.9 12 11.1 10 10c-2 .9-3.5 2.7-5.1 5.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              {{ uiStrings().label_pdf_lang }}
            </label>
            <select class="lead-input lead-select"
              [(ngModel)]="leadForm.preferred_language"
              (ngModelChange)="switchLanguage($event)">
              @for (lang of availableLanguages; track lang.code) {
                <option [value]="lang.code">{{ lang.native }} — {{ lang.name }}</option>
              }
            </select>
            <span class="lead-lang-hint">{{ uiStrings().hint_pdf_lang }}</span>
          </div>
        </div>

        <label class="lead-consent">
          <input type="checkbox" [checked]="leadForm.consent"
            (change)="leadForm.consent = $any($event.target).checked"/>
          <span>{{ uiStrings().label_consent }}</span>
        </label>
      </div>

      <div class="lead-actions">
        <button class="lead-submit-btn" [disabled]="leadSubmitting()" (click)="submitLead()">
          @if (leadSubmitting()) {
            <span class="lead-spinner"></span> Sending to Expert…
          } @else {
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M13 7.5L2 2l2.5 5.5L2 13z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            {{ uiStrings().btn_send_expert }}
          }
        </button>
        <button class="lead-cancel-btn" (click)="showLeadForm.set(false)">
          {{ uiStrings().btn_cancel }}
        </button>
      </div>

      <p class="lead-privacy">
        🔒 {{ uiStrings().hint_privacy }}
      </p>
    </div>
  </div>
}

<!-- ══ LEAD SUBMITTED — 4-step status tracker ═══════════════════════════════ -->
@if (leadSubmitted()) {
  <div class="lead-overlay">
    <div class="lead-card lead-tracker-card">

      <!-- Top-left Home button -->
      <div class="tracker-top-bar">
        <button class="tracker-home-btn" (click)="rerun()" title="Back to Home">
          <svg width="14" height="14" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L6.5 2l5 4.5M2.5 6v5h2.5V8h3v3h2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Home
        </button>
      </div>

      <!-- Header -->
      <div class="lead-card-header">
        <div class="lead-check-badge">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="1.5"/>
            <path d="M8 14l4 4 8-8" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="lead-title">{{ uiStrings().tracker_sent_title }}</h2>
        <p class="lead-subtitle">{{ uiStrings().tracker_sent_sub }}</p>
      </div>

      <!-- ── Colorful 4-step journey tracker ── -->
      <div class="journey-wrap">

        <!-- Step 1: Submitted -->
        <div class="journey-step" [class.js-done]="isStepDone('submitted')" [class.js-active]="isStepActive('submitted')">
          <div class="js-icon-wrap js-color-blue">
            @if (isStepDone('submitted')) {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4.5 4.5 7.5-7.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            } @else {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M14 3.5L4 8l4 2 2 4 4.5-10z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
            }
          </div>
          <div class="js-body">
            <div class="js-row">
              <span class="js-label">{{ uiStrings().step_submitted }}</span>
              @if (isStepDone('submitted') && !isStepActive('submitted')) {
                <span class="js-badge js-badge-done">Done</span>
              } @else if (isStepActive('submitted')) {
                <span class="js-badge js-badge-active">In Progress</span>
              }
            </div>
            <span class="js-desc">{{ uiStrings().step_submitted_desc }}</span>
          </div>
        </div>

        <div class="js-connector" [class.js-connector-done]="isStepDone('admin_notified')"></div>

        <!-- Step 2: Astrologer Notified -->
        <div class="journey-step" [class.js-done]="isStepDone('admin_notified')" [class.js-active]="isStepActive('admin_notified')">
          <div class="js-icon-wrap js-color-violet">
            @if (isStepDone('admin_notified')) {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4.5 4.5 7.5-7.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            } @else {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a5 5 0 0 1 5 5c0 2.5-1.5 4.5-3 5.5H7C5.5 11.5 4 9.5 4 7a5 5 0 0 1 5-5z" stroke="#fff" stroke-width="1.5"/><path d="M6.5 14.5h5M9 16v1" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
            }
          </div>
          <div class="js-body">
            <div class="js-row">
              <span class="js-label">{{ uiStrings().step_notified }}</span>
              @if (isStepDone('admin_notified') && !isStepActive('admin_notified')) {
                <span class="js-badge js-badge-done">Done</span>
              } @else if (isStepActive('admin_notified')) {
                <span class="js-badge js-badge-active">Active</span>
              }
            </div>
            <span class="js-desc">{{ uiStrings().step_notified_desc }}</span>
          </div>
        </div>

        <div class="js-connector" [class.js-connector-done]="isStepDone('expert_analysis')"></div>

        <!-- Step 3: Expert Analysis -->
        <div class="journey-step" [class.js-done]="isStepDone('expert_analysis')" [class.js-active]="isStepActive('expert_analysis')">
          <div class="js-icon-wrap js-color-amber">
            @if (isStepDone('expert_analysis')) {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4.5 4.5 7.5-7.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            } @else {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3" fill="#fff"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
            }
          </div>
          <div class="js-body">
            <div class="js-row">
              <span class="js-label">{{ uiStrings().step_analysis }}</span>
              @if (isStepDone('expert_analysis') && !isStepActive('expert_analysis')) {
                <span class="js-badge js-badge-done">Done</span>
              } @else if (isStepActive('expert_analysis')) {
                <span class="js-badge js-badge-amber">Preparing</span>
              }
            </div>
            <span class="js-desc">{{ uiStrings().step_analysis_desc }}</span>
          </div>
        </div>

        <div class="js-connector" [class.js-connector-done]="isStepDone('report_ready')"></div>

        <!-- Step 4: Report Ready -->
        <div class="journey-step" [class.js-done]="isStepDone('report_ready')" [class.js-active]="isStepActive('report_ready')">
          <div class="js-icon-wrap js-color-green">
            @if (isStepDone('report_ready')) {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4.5 4.5 7.5-7.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            } @else {
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v8M5.5 7l3.5 4 3.5-4" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 14h12" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>
            }
          </div>
          <div class="js-body">
            <div class="js-row">
              <span class="js-label">{{ uiStrings().step_ready }}</span>
              @if (isStepDone('report_ready')) {
                <span class="js-badge js-badge-green">Ready!</span>
              }
            </div>
            <span class="js-desc">{{ uiStrings().step_ready_desc }}</span>
          </div>
        </div>

      </div>

      <!-- Status message + download -->
      <div class="tracker-status-msg">
        @if (leadStatus() === 'submitted') {
          <span class="status-pill status-pending">⏳ {{ uiStrings().status_awaiting }}</span>
        } @else if (leadStatus() === 'admin_notified') {
          <span class="status-pill status-active">🔔 {{ uiStrings().status_notified }}</span>
        } @else if (leadStatus() === 'expert_analysis') {
          <span class="status-pill status-amber">✦ {{ uiStrings().status_preparing }}</span>
        } @else if (leadStatus() === 'report_ready') {
          <div class="report-ready-block">
            <div class="report-ready-glow">🎉</div>
            <p class="report-ready-msg">{{ uiStrings().report_ready_msg }}</p>
            <p class="report-ready-sub">{{ uiStrings().report_ready_sub }}</p>
            <div class="report-lang-badge">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style="vertical-align:-2px"><path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zM2 10h4M14 10h4M10 2v4M10 14v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4.9 4.9C6.4 7.1 8 8.9 10 10c2-.9 3.5-2.7 5.1-5.1M15.1 15.1C13.6 12.9 12 11.1 10 10c-2 .9-3.5 2.7-5.1 5.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              {{ uiStrings().label_report_lang }} <strong>{{ leadLanguageDisplay() }}</strong>
            </div>
            <button class="lead-submit-btn report-dl-btn" [disabled]="reportTranslating()" (click)="downloadLeadReport()">
              @if (reportTranslating()) {
                <span class="lead-spinner"></span> Translating to {{ leadLanguageDisplay() }}…
              } @else {
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M3.5 6.5l3.5 4 3.5-4M1.5 12h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ uiStrings().btn_open_report }}
              }
            </button>
          </div>
        }
      </div>

      <!-- Auto-poll indicator + actions -->
      <div class="lead-actions">
        @if (leadStatus() !== 'report_ready') {
          <span class="auto-poll-note">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="#6366f1" opacity="0.3"/><circle cx="5" cy="5" r="2" fill="#6366f1"/></svg>
            {{ uiStrings().hint_auto_poll }}
          </span>
          <button class="refresh-btn" (click)="pollLeadStatus()">
            <span class="refresh-icon">↻</span>
            {{ uiStrings().btn_refresh }}
          </button>
        } @else {
          <button class="lead-submit-btn report-dl-btn" [disabled]="reportTranslating()" (click)="downloadLeadReport()">
            @if (reportTranslating()) {
              <span class="lead-spinner"></span> Opening report…
            } @else {
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M3.5 6.5l3.5 4 3.5-4M1.5 12h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {{ uiStrings().btn_open_report }}
            }
          </button>
          @if (reportDownloadError()) {
            <div class="report-dl-error">
              ⚠ {{ reportDownloadError() }}
              <button class="report-dl-retry" (click)="reportDownloadError.set(''); downloadLeadReport()">Try again</button>
            </div>
          }
        }
        <!-- Always visible: return to home form -->
        <button class="home-btn" (click)="rerun()">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L6.5 2l5 4.5M2.5 6v5h2.5V8h3v3h2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Home / New Reading
        </button>
      </div>

    </div>
  </div>
}

  <app-footer></app-footer>

</div>
  `,
  styles: [`
/* ════════════════════════════════════════════════════════════════
   AURA WITH RAV — Apple-quality UI · White + Indigo/Green
════════════════════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Chakra loading overlay — golden spinning logo only ── */
.astro-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(10, 8, 4, 0.92);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.chakra-spin-wrap {
  position: relative;
  width: 180px; height: 180px;
  display: flex; align-items: center; justify-content: center;
}
.chakra-glow-ring {
  position: absolute; inset: -14px; border-radius: 50%;
  background: conic-gradient(from 0deg,
    #b8860b, #ffd700, #ffec6e, #ffc200, #f0a500, #b8860b);
  animation: chakra-rotate 3s linear infinite;
  opacity: 0.6;
  filter: blur(10px);
}
.chakra-spin-logo {
  width: 160px; height: 160px; object-fit: contain;
  position: relative; z-index: 1;
  animation: chakra-rotate 4s linear infinite;
  filter:
    sepia(1) saturate(4) hue-rotate(5deg) brightness(1.1)
    drop-shadow(0 0 22px rgba(255, 200, 0, 0.85))
    drop-shadow(0 0 50px rgba(255, 165, 0, 0.4));
}
@keyframes chakra-rotate { to { transform: rotate(360deg); } }

:host {
  display: block; height: 100vh; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  color: #111827; background: #f1f5f9;
  -webkit-font-smoothing: antialiased;
}

/* ══ SHELL ══ */
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; position: relative; }

/* ══ HEADER ══ */
.hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 32px; height: 72px; flex-shrink: 0;
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(0,0,0,0.07);
  box-shadow: 0 1px 0 rgba(0,0,0,0.04);
  position: relative; z-index: 100; gap: 16px;
}
.hdr-brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.hdr-logo  { width: 40px; height: 40px; object-fit: contain; border-radius: 0; background: transparent; padding: 0; border: none; }
.hdr-brand-text { display: flex; flex-direction: column; gap: 1px; }
.hdr-name  { font-size: 17px; font-weight: 700; color: #1e1b4b; letter-spacing: 0.04em; line-height: 1.2; }
.hdr-name em { font-style: normal; font-weight: 400; color: #6366f1; }
.hdr-tag   { font-size: 11px; color: #94a3b8; letter-spacing: 0.03em; }
.hdr-nav   { display: flex; align-items: center; gap: 2px; flex: 1; justify-content: center; }
.hdr-nav-item { font-size: 12px; color: #6b7280; padding: 5px 11px; border-radius: 99px; cursor: default; transition: all 0.15s; white-space: nowrap; font-weight: 600; letter-spacing: 0.01em; border: 1px solid transparent; }
.hdr-nav-item:hover { background: rgba(99,102,241,0.08); color: #4338ca; border-color: rgba(99,102,241,0.15); }
.hdr-sep { color: rgba(0,0,0,0.12); font-size: 14px; }

/* ── User zone: right-aligned, single flex row, never overflows ── */
.hdr-user {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
/* Generic icon+label button used for Metrics, Leads, Profile */
.hdr-icon-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(99,102,241,0.2);
  background: rgba(99,102,241,0.06); color: #4338ca;
  font-size: 12px; font-weight: 600; cursor: pointer;
  white-space: nowrap; font-family: inherit; transition: all .15s;
}
.hdr-icon-btn:hover { background: rgba(99,102,241,0.13); border-color: rgba(99,102,241,0.35); }
.hdr-leads-btn { position: relative; }
.hdr-btn-label { display: inline; }
/* Vertical rule between nav buttons and identity chip */
.hdr-divider { width: 1px; height: 28px; background: rgba(0,0,0,0.1); margin: 0 4px; flex-shrink: 0; }

.hdr-book-btn {
  display: inline-flex; align-items: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; text-decoration: none;
  font-size: 0.75rem; font-weight: 700;
  padding: 0.38rem 0.85rem; border-radius: 0.5rem;
  white-space: nowrap; flex-shrink: 0;
  transition: opacity 0.15s, transform 0.15s;
  letter-spacing: 0.02em;
}
.hdr-book-btn:hover { opacity: 0.88; transform: translateY(-1px); }
/* Identity: small avatar + name + role in one tight block */
.hdr-identity { display: flex; align-items: center; gap: 8px; }
.hdr-avatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; object-position: top; border: 2px solid rgba(99,102,241,0.28); flex-shrink: 0; }
.hdr-id-text { display: flex; flex-direction: column; gap: 2px; }
.hdr-uname { font-size: 13px; font-weight: 700; color: #1e1b4b; line-height: 1; white-space: nowrap; }
.hdr-role-badge { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 99px; letter-spacing: 0.07em; background: rgba(99,102,241,0.1); color: #6366f1; border: 1px solid rgba(99,102,241,0.22); align-self: flex-start; }
.hdr-role-badge.admin      { color: #059669; background: rgba(5,150,105,0.08); border-color: rgba(5,150,105,0.22); }
.hdr-role-badge.superadmin { color: #d97706; background: rgba(217,119,6,0.08); border-color: rgba(217,119,6,0.22); }
/* Sign out — distinct red-tinted ghost */
.hdr-signout-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);
  background: transparent; color: #6b7280;
  font-size: 12px; font-weight: 500; cursor: pointer;
  white-space: nowrap; font-family: inherit; transition: all .15s;
}
.hdr-signout-btn:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
/* Keep old class names alive so nothing else breaks */
.metrics-btn { display: flex; align-items: center; gap: 5px; background: rgba(99,102,241,.08); border: 1px solid rgba(99,102,241,.22); color: #4338ca; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; }
.metrics-btn:hover { background: rgba(99,102,241,.15); border-color: rgba(99,102,241,.4); }
.lead-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; padding: 0 4px;
  background: #ef4444; color: #fff;
  border-radius: 99px; font-size: 10px; font-weight: 700;
  line-height: 1;
}
.lead-reading-banner {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  background: #fffbeb; border-bottom: 1.5px solid #fde68a;
  padding: 9px 20px; font-size: 12.5px; color: #78350f;
}
.lead-reading-banner strong { color: #92400e; }
.lead-reading-cancel {
  margin-left: auto; padding: 4px 12px; border-radius: 6px;
  border: 1px solid #fde68a; background: transparent;
  color: #92400e; font-size: 11.5px; font-weight: 600;
  cursor: pointer; font-family: inherit; white-space: nowrap;
}
.lead-reading-cancel:hover { background: #fef3c7; }
.hdr-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; object-position: top; border: 2.5px solid rgba(99,102,241,0.35); }
.hdr-user-text { display: flex; flex-direction: column; gap: 2px; text-align: right; }
.hdr-uname { font-size: 16px; font-weight: 600; color: #1e1b4b; line-height: 1.2; }
.hdr-urole { font-size: 12px; color: #94a3b8; display: flex; align-items: center; justify-content: flex-end; }
.hdr-role-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.07em; background: rgba(99,102,241,0.1); color: #6366f1; border: 1px solid rgba(99,102,241,0.22); }
.hdr-role-badge.admin      { color: #059669; background: rgba(5,150,105,0.08); border-color: rgba(5,150,105,0.22); }
.hdr-role-badge.superadmin { color: #d97706; background: rgba(217,119,6,0.08); border-color: rgba(217,119,6,0.22); }
.signout-btn { display: flex; align-items: center; gap: 5px; background: transparent; border: 1px solid rgba(0,0,0,0.12); color: #6b7280; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap; }
.signout-btn:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.hdr-nav-btn { display: flex; align-items: center; gap: 5px; background: rgba(99,102,241,.08); border: 1px solid rgba(99,102,241,.22); color: #4338ca; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; font-family: inherit; }
.hdr-nav-btn:hover { background: rgba(99,102,241,.15); }

/* ══ WORKSPACE ══ */
.workspace {
  flex: 1; overflow: hidden;
  display: flex; flex-direction: row;
  padding: 10px; gap: 10px;
  background: #f1f5f9;
}

/* Home layout: center panel + right aside */
.home-layout {
  align-items: stretch;
  justify-content: center;
}

/* Pipeline layout: full column */
.pipeline-layout {
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
}

/* ══ PANELS ══ */
.panel {
  display: flex; flex-direction: column;
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.07);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.panel:hover { box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.07); }

/* Center panel — Birth Profile */
.panel-center {
  width: 520px;
  flex-shrink: 0;
}

/* Right aside — Analysis Modules */
.panel-right {
  width: 380px;
  flex-shrink: 0;
}

/* Pipeline panel fills remaining height */
.pipeline-panel {
  flex: 1;
  border-radius: 0;
  border: none;
  border-top: 1px solid rgba(0,0,0,0.06);
}

/* ── Pipeline top bar ── */
.pipeline-topbar {
  display: flex; align-items: center; gap: 16px; flex-shrink: 0;
  padding: 10px 20px;
  background: rgba(255,255,255,0.97);
  border-bottom: 1px solid rgba(0,0,0,0.07);
}
.pipeline-back {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.12); background: #f9fafb;
  color: #374151; font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.pipeline-back:hover { background: #f3f4f6; border-color: rgba(0,0,0,0.2); }
.pipeline-topbar-title { display: flex; flex-direction: column; gap: 1px; flex: 1; }
.pipeline-topbar-sub { font-size: 10px; color: #9ca3af; letter-spacing: 0.04em; }
.pipeline-status-legend { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.leg-dot { width: 8px; height: 8px; border-radius: 50%; }
.leg-queued  { background: #d1d5db; }
.leg-running { background: #6366f1; }
.leg-done    { background: #10b981; }
.leg-label   { font-size: 10.5px; color: #6b7280; margin-right: 8px; }

/* ── Pipeline progress strip ── */
.pipeline-progress-bar-wrap {
  display: flex; align-items: center; gap: 12px; flex-shrink: 0;
  padding: 8px 20px;
  background: #fff;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  flex-wrap: wrap;
}
.pipeline-prog-track { flex: 1; min-width: 120px; }

/* ── Modules grid: 2-col in right panel (was 5-col for wide workspace) ── */
.panel-right .mod-grid { grid-template-columns: repeat(2, 1fr); }

.dob-text-inp { width: 100%; letter-spacing: 0.08em; font-size: 1rem; font-weight: 500; }

/* ── Panel toolbar ── */
.ptb {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px 10px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  flex-shrink: 0;
}
.ptb-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: #6b7280;
}
.ptb-lang-wrap {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px 3px 6px; border-radius: 8px;
  background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.18);
  color: #6366f1;
}
.ptb-lang-select {
  border: none; background: transparent; font-size: 12px; font-weight: 600;
  color: #4338ca; cursor: pointer; outline: none; font-family: inherit;
  max-width: 130px;
}
.ptb-lang-select:focus { outline: none; }
.ptb-actions { display: flex; gap: 6px; }
.ptb-btn {
  width: 26px; height: 26px; border-radius: 7px; border: 1px solid rgba(0,0,0,0.1);
  background: #f9fafb; color: #6b7280; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.ptb-btn:hover { background: #f3f4f6; color: #374151; border-color: rgba(0,0,0,0.18); }

/* ── Scrollable content inside panel ── */
.panel-scroll {
  flex: 1; overflow-y: auto; padding: 12px 14px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.panel-scroll::-webkit-scrollbar { width: 4px; }
.panel-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }

/* Fill for pipeline (no padding, agent-flow fills it) */
.panel-fill { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }


/* ══ CARDS ══ */
.card {
  background: #ffffff; border: 1px solid rgba(0,0,0,0.07);
  border-radius: 12px; padding: 14px; flex-shrink: 0;
}
.card-question { background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-color: rgba(16,185,129,0.2); }
.card-hdr { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
.card-icon-wrap { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.card-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 2px; }
.card-sub   { font-size: 10.5px; color: #9ca3af; }

/* ══ FORM ══ */
.fields { display: flex; flex-direction: column; gap: 10px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; }

.flabel { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
.req { color: #ef4444; }
.opt { font-size: 9px; color: #9ca3af; text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: 3px; }

.inp-wrap {
  border: 1.5px solid rgba(0,0,0,0.12); border-radius: 9px;
  background: #f9fafb; position: relative;
  transition: border-color 0.16s, box-shadow 0.16s, background 0.16s;
}
.inp-wrap:focus-within {
  border-color: #6366f1; background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}
.inp-wrap.inp-err { border-color: #fca5a5; background: #fff8f8; }
.inp-wrap.inp-err:focus-within { box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }

.inp-ico {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  width: 12px; height: 12px; color: #9ca3af; pointer-events: none;
}
.inp {
  width: 100%; display: block; border: none; border-radius: 9px;
  padding: 8px 10px; font-size: 13px; color: #111827; background: transparent;
  outline: none; font-family: inherit; -webkit-appearance: none;
}
.inp::placeholder { color: #d1d5db; }
.inp-icon { padding-left: 28px; }
.inp-ta { resize: none; line-height: 1.55; min-height: 64px; }
.inp-sel { cursor: pointer; }
.inp-sel option { background: #fff; color: #111827; }
input[type=date].inp, input[type=time].inp { color-scheme: light; }
.ferr { font-size: 10px; color: #ef4444; }

/* Focus chip */
.focus-chip {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 8px;
  font-size: 11px; color: #065f46; background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.25); border-radius: 99px; padding: 4px 12px;
}
.focus-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: chipPulse 2s infinite; }
@keyframes chipPulse { 0%,100%{opacity:1}50%{opacity:0.3} }

/* ══ MODULE CHIPS ══ */
.mod-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.mod-chip {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 14px 10px 12px;
  border-radius: 14px; border: 1.5px solid rgba(0,0,0,0.08);
  background: #fff; cursor: pointer; font-family: inherit;
  transition: all 0.18s cubic-bezier(0.4,0,0.2,1);
  position: relative; text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.mod-chip:hover { border-color: #6366f1; background: #fafbff; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99,102,241,0.13); }
.mod-chip-on {
  border-color: #6366f1 !important; background: linear-gradient(145deg, #eef2ff, #f5f3ff) !important;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12), 0 4px 16px rgba(99,102,241,0.15) !important;
}
.mod-chip-icon { font-size: 28px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
.mod-chip-body { display: flex; flex-direction: column; gap: 2px; }
.mod-chip-name { font-size: 11px; font-weight: 700; color: #1e1b4b; letter-spacing: 0.01em; }
.mod-chip-desc { font-size: 9px; color: #94a3b8; line-height: 1.4; }
.mod-chip-check {
  position: absolute; top: 7px; right: 8px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #6366f1; color: #fff;
  font-size: 9px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(99,102,241,0.4);
}

/* ══ SUB CARDS ══ */
.sub-card {
  border: 1px solid rgba(0,0,0,0.07); border-radius: 10px;
  padding: 12px; background: #f9fafb;
}
.sub-card-title { font-size: 11.5px; font-weight: 600; color: #374151; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.sub-badge { font-size: 9px; color: #9ca3af; background: #e5e7eb; padding: 2px 7px; border-radius: 99px; font-weight: 400; }

.upload-zone {
  display: flex; align-items: center; gap: 7px; padding: 8px 10px;
  border: 1.5px dashed rgba(0,0,0,0.15); border-radius: 9px;
  background: #fff; cursor: pointer; font-size: 11.5px; color: #9ca3af; transition: all 0.15s;
}
.upload-zone:hover { border-color: #6366f1; color: #4338ca; background: #eef2ff; }

.seg { display: flex; background: #f3f4f6; border-radius: 8px; padding: 2px; margin-top: 4px; }
.seg-btn { padding: 5px 12px; border-radius: 6px; border: none; background: transparent; font-size: 11.5px; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.14s; font-family: inherit; }
.seg-on { background: #6366f1; color: #fff; box-shadow: 0 1px 4px rgba(99,102,241,0.3); }

/* ══ Prompt Version Selector ══ */
.pv-card {
  margin: 10px 0 6px;
  padding: 10px 12px 12px;
  background: #f9fafb;
  border: 1px solid rgba(0,0,0,0.09);
  border-radius: 12px;
}
.pv-label {
  font-size: 9.5px; font-weight: 700; color: #6b7280;
  letter-spacing: 0.07em; text-transform: uppercase;
  margin-bottom: 8px; padding-left: 1px;
}
.pv-options { display: flex; flex-direction: column; gap: 6px; }

.pv-opt {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 9px 11px;
  border-radius: 9px; border: 1.5px solid rgba(0,0,0,0.09);
  background: #ffffff;
  cursor: pointer; font-family: inherit; text-align: left;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.pv-opt:hover {
  border-color: rgba(99,102,241,0.3);
  background: #f5f4ff;
}

/* V1 selected — amber warm tone */
.pv-opt-v1.pv-opt-on {
  border-color: #f59e0b;
  background: #fffbeb;
  box-shadow: 0 0 0 3px rgba(245,158,11,0.1);
}
/* V2 selected — indigo sharp tone */
.pv-opt-v2.pv-opt-on {
  border-color: #6366f1;
  background: #eef2ff;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}

/* Radio */
.pv-radio {
  width: 15px; height: 15px; border-radius: 50%;
  border: 1.5px solid #d1d5db;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: border-color 0.15s;
}
.pv-radio-on { border-color: #6366f1; }
.pv-opt-v1.pv-opt-on .pv-radio { border-color: #f59e0b; }
.pv-radio-dot { width: 7px; height: 7px; border-radius: 50%; }
.pv-radio-dot-warm  { background: #f59e0b; }
.pv-radio-dot-sharp { background: #6366f1; }

/* Icon chip */
.pv-icon-wrap {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.15s;
}
.pv-icon-warm  { background: #fef3c7; color: #d97706; }
.pv-icon-sharp { background: #e0e7ff; color: #6366f1; }
.pv-icon-on.pv-icon-warm  { background: #fde68a; color: #b45309; }
.pv-icon-on.pv-icon-sharp { background: #c7d2fe; color: #4338ca; }

/* Text */
.pv-body { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pv-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pv-name {
  font-size: 12px; font-weight: 600;
  color: #6b7280; transition: color 0.15s;
}
.pv-opt-on .pv-name { color: #111827; }
.pv-desc {
  font-size: 10px; color: #9ca3af; transition: color 0.15s;
}
.pv-opt-on .pv-desc { color: #6b7280; }
.pv-badge {
  font-size: 8.5px; font-weight: 700;
  background: #d1fae5; color: #065f46;
  padding: 1px 6px; border-radius: 4px;
  letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
}

/* ══ CTA ══ */
.cta-row { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 4px 0; }
.launch-err { font-size: 11px; color: #ef4444; }
.cta {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 40px; border-radius: 99px; border: none;
  background: linear-gradient(135deg, #4338ca, #6366f1, #818cf8);
  background-size: 200% auto;
  color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  font-family: inherit; letter-spacing: 0.01em;
  box-shadow: 0 4px 14px rgba(99,102,241,0.4);
  transition: all 0.28s; min-width: 200px;
}
.cta:hover:not(:disabled) { background-position: right center; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(99,102,241,0.5); }
.cta:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.cta-hint { font-size: 10px; color: #9ca3af; }

.results-ready-row {
  display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;
}
.results-ready-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 14px; border-radius: 99px;
  background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);
  font-size: 11.5px; font-weight: 600; color: #065f46;
}
.cta-review {
  background: linear-gradient(135deg, #059669, #10b981);
  box-shadow: 0 4px 14px rgba(16,185,129,0.4);
  padding: 12px 36px; min-width: 180px;
}
.cta-review:hover:not(:disabled) { box-shadow: 0 8px 20px rgba(16,185,129,0.5); }
.cta-rerun {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 16px; border-radius: 99px;
  border: 1.5px solid rgba(0,0,0,0.12); background: transparent;
  font-size: 11px; font-weight: 600; color: #6b7280;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.cta-rerun:hover { border-color: #6366f1; color: #4338ca; background: rgba(99,102,241,0.05); }

/* ══ LEAD MODAL OVERLAY ══ */
.lead-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.lead-card {
  background: #fff; border-radius: 20px;
  padding: 36px 40px; width: 100%; max-width: 540px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.22);
  display: flex; flex-direction: column; gap: 20px;
  max-height: 90vh; overflow-y: auto;
}
.lead-card-header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lead-star-badge {
  width: 48px; height: 48px; border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(99,102,241,0.4);
}
.lead-check-badge { display: flex; justify-content: center; }
.lead-title { font-size: 20px; font-weight: 800; color: #111827; line-height: 1.3; }
.lead-subtitle { font-size: 13.5px; color: #6b7280; line-height: 1.6; max-width: 400px; }
.lead-error {
  background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
  padding: 10px 14px; border-radius: 8px; font-size: 13px;
}
.lead-form { display: flex; flex-direction: column; gap: 14px; }
.lead-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lead-field { display: flex; flex-direction: column; gap: 5px; }
.lead-field-grow { grid-column: 1 / -1; }
.lead-textarea { resize: vertical; min-height: 60px; }
.lead-label { font-size: 12px; font-weight: 600; color: #374151; }
.lead-input {
  padding: 10px 13px; border: 1.5px solid #e5e7eb; border-radius: 10px;
  font-size: 13.5px; font-family: inherit; color: #111827; outline: none;
  transition: border-color .15s; background: #fafafa;
}
.lead-input:focus { border-color: #6366f1; background: #fff; }
/* ── UI Language Switcher Bar ── */
.ui-lang-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-bottom: 12px;
  background: linear-gradient(135deg, #eef2ff, #f5f3ff);
  border: 1px solid #c7d2fe; border-radius: 10px;
}
.ui-lang-label { font-size: 12px; font-weight: 600; color: #4338ca; white-space: nowrap; }
.ui-lang-select {
  flex: 1; padding: 5px 10px; border: 1px solid #c7d2fe; border-radius: 7px;
  font-size: 12.5px; color: #1e1b4b; background: #fff; cursor: pointer;
  font-family: inherit; outline: none;
}
.ui-lang-select:focus { border-color: #6366f1; }

.lead-select {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center;
  padding-right: 32px !important; cursor: pointer;
}
.lead-lang-hint {
  font-size: 11px; color: #9ca3af; margin-top: 4px; display: block;
}
.lead-consent {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 12.5px; color: #4b5563; line-height: 1.5; cursor: pointer;
}
.lead-consent input[type="checkbox"] { margin-top: 2px; flex-shrink: 0; accent-color: #6366f1; width: 15px; height: 15px; }
.lead-actions { display: flex; flex-direction: column; gap: 10px; }
.lead-submit-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px 24px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 4px 16px rgba(99,102,241,0.4);
  transition: all .18s;
}
.lead-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.5); }
.lead-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.lead-cancel-btn {
  padding: 10px; border-radius: 10px; border: 1.5px solid #e5e7eb;
  background: transparent; color: #6b7280; font-size: 13px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: all .15s;
}
.lead-cancel-btn:hover { border-color: #9ca3af; color: #374151; }
.lead-privacy { font-size: 11.5px; color: #9ca3af; text-align: center; }
.lead-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
  animation: spin 0.8s linear infinite; flex-shrink: 0;
}

/* ══ COLORFUL JOURNEY TRACKER ══ */
.lead-tracker-card { max-width: 520px; }

.journey-wrap {
  display: flex; flex-direction: column; gap: 0;
  background: #f8fafc; border-radius: 14px;
  padding: 6px 12px; border: 1px solid #e5e7eb;
  margin: 4px 0;
}

.journey-step {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 4px; opacity: 0.4; transition: opacity .3s;
}
.journey-step.js-done, .journey-step.js-active { opacity: 1; }

.js-icon-wrap {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: all .3s;
}
.js-color-blue   { background: linear-gradient(135deg, #3b82f6, #6366f1); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
.js-color-violet { background: linear-gradient(135deg, #8b5cf6, #a855f7); box-shadow: 0 4px 12px rgba(139,92,246,0.3); }
.js-color-amber  { background: linear-gradient(135deg, #f59e0b, #ef4444); box-shadow: 0 4px 12px rgba(245,158,11,0.3); }
.js-color-green  { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 12px rgba(16,185,129,0.3); }

/* Dim icon when not yet reached */
.journey-step:not(.js-done):not(.js-active) .js-icon-wrap {
  background: #e5e7eb !important; box-shadow: none !important;
}

.js-body { display: flex; flex-direction: column; gap: 3px; flex: 1; padding-top: 8px; }
.js-row  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.js-label { font-size: 13.5px; font-weight: 700; color: #111827; }
.js-desc  { font-size: 12px; color: #6b7280; line-height: 1.4; }

.js-badge {
  font-size: 10px; font-weight: 700; padding: 2px 9px;
  border-radius: 99px; letter-spacing: 0.04em;
}
.js-badge-done   { background: #dcfce7; color: #166534; }
.js-badge-active { background: #e0e7ff; color: #3730a3; }
.js-badge-amber  { background: #fef3c7; color: #92400e; }
.js-badge-green  { background: #d1fae5; color: #065f46; }

.js-connector {
  width: 2px; height: 18px; background: #e5e7eb;
  margin-left: 31px; transition: background .4s;
}
.js-connector-done { background: linear-gradient(to bottom, #6366f1, #10b981); }

/* ── Active step pulse on icon ── */
.journey-step.js-active .js-icon-wrap {
  animation: js-pulse 2s ease-in-out infinite;
}
@keyframes js-pulse {
  0%,100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

/* ── Report ready celebration block ── */
.report-ready-block {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
  border: 1.5px solid #6ee7b7; border-radius: 14px;
  padding: 20px 24px; text-align: center;
}
.report-ready-glow { font-size: 2.5rem; line-height: 1; }
.report-ready-msg  { font-size: 15px; font-weight: 700; color: #065f46; margin: 0; }
.report-ready-sub  { font-size: 12px; color: #047857; margin: 0; }
.report-lang-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 99px;
  background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2);
  font-size: 12px; color: #4338ca;
}
.report-dl-btn {
  background: linear-gradient(135deg, #059669, #10b981) !important;
  box-shadow: 0 4px 14px rgba(16,185,129,0.4) !important;
  padding: 12px 28px !important; font-size: 14px !important;
}

/* ── Auto-poll note ── */
.auto-poll-note {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: #9ca3af; flex: 1;
}
.lead-submit-btn-sm {
  padding: 8px 16px !important; font-size: 12px !important;
}

/* Tracker card top bar — Home button in top-left */
.tracker-top-bar {
  display: flex; align-items: center; margin-bottom: 4px;
}
.tracker-home-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
  background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.tracker-home-btn:hover { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }

.home-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 8px; font-size: 12.5px; font-weight: 600;
  background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
  cursor: pointer; transition: background 0.15s, color 0.15s; font-family: inherit;
}
.home-btn:hover { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }

.report-dl-error {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  padding: 10px 14px; font-size: 12.5px; color: #dc2626;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.report-dl-retry {
  background: #fff; border: 1px solid #fca5a5; border-radius: 6px;
  padding: 4px 10px; font-size: 12px; font-weight: 600; color: #dc2626;
  cursor: pointer; transition: background 0.15s; white-space: nowrap; font-family: inherit;
}
.report-dl-retry:hover { background: #fef2f2; }

.tracker-status-msg { text-align: center; margin: 4px 0; }
.status-pill {
  display: inline-block; padding: 7px 18px; border-radius: 99px;
  font-size: 12.5px; font-weight: 600;
}
.status-amber { background: #fef3c7; color: #92400e; }
.status-pending { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.status-active  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.status-done    { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ══ PROGRESS ══ */
.progress-card {
  border: 1px solid rgba(99,102,241,0.15); border-radius: 12px;
  background: #fff; padding: 14px;
}
.prog-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.prog-title { font-size: 11.5px; font-weight: 600; color: #374151; }
.prog-pct   { font-size: 11px; font-weight: 700; color: #6366f1; }
.prog-track { height: 4px; background: #e0e7ff; border-radius: 99px; overflow: hidden; margin-bottom: 12px; }
.prog-fill  { height: 100%; background: linear-gradient(90deg, #4338ca, #6366f1, #a5b4fc); border-radius: 99px; transition: width 0.4s ease; }

.step-list { display: flex; flex-direction: column; gap: 3px; }
.step { display: flex; align-items: center; gap: 7px; padding: 5px 8px; border-radius: 7px; font-size: 11px; color: #6b7280; background: #f9fafb; }
.step-run  { background: #eff6ff; color: #1d4ed8; }
.step-done { background: #f0fdf4; color: #15803d; }
.sdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: #d1d5db; }
.sdot-run  { background: #6366f1; animation: chipPulse 1.2s infinite; }
.sdot-done { background: #10b981; }
.sname { flex: 1; font-weight: 500; }
.strad { font-size: 9px; background: rgba(99,102,241,0.1); color: #6366f1; padding: 1px 5px; border-radius: 99px; }
.sstate { font-size: 9.5px; font-weight: 600; }

.alert-ok   { margin-top: 6px; padding: 7px 11px; border-radius: 8px; background: #f0fdf4; border: 1px solid #6ee7b7; font-size: 11px; color: #065f46; }

.done-row { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1.5px solid #6ee7b7; border-radius: 12px; flex-wrap: wrap; box-shadow: 0 2px 12px rgba(16,185,129,0.12); }
.done-msg { font-size: 13px; font-weight: 700; color: #065f46; }
.done-btn { padding: 10px 28px; border-radius: 99px; border: none; background: linear-gradient(135deg, #059669, #10b981); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; box-shadow: 0 3px 12px rgba(16,185,129,0.35); transition: all 0.18s; letter-spacing: 0.01em; }
.done-btn:hover { background: linear-gradient(135deg, #047857, #059669); box-shadow: 0 5px 18px rgba(16,185,129,0.45); transform: translateY(-1px); }
.cache-hit-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 99px;
  background: linear-gradient(90deg, #fef3c7, #fde68a);
  border: 1px solid #f59e0b;
  font-size: 11px; font-weight: 700; color: #92400e;
  letter-spacing: 0.02em; white-space: nowrap;
  box-shadow: 0 1px 4px rgba(245,158,11,0.25);
}

/* ══ FOOTER — old strip removed; app-footer component handles this ══ */

/* ══ ENHANCED FORM ELEMENTS ══ */

/* Input success state */
.inp-wrap.inp-ok {
  border-color: #10b981 !important;
  background: #f0fdf9 !important;
}
.inp-wrap.inp-ok:focus-within {
  box-shadow: 0 0 0 3px rgba(16,185,129,0.1) !important;
}

/* Inline check mark */
.inp-check {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  font-size: 12px; color: #10b981; font-weight: 700; pointer-events: none;
}

/* Label hint */
.flabel-hint {
  font-size: 9px; font-weight: 400; color: #9ca3af;
  text-transform: none; letter-spacing: 0; margin-left: 6px;
}

/* Field hint ok */
.field-hint-ok {
  font-size: 10px; color: #10b981; font-weight: 500; margin-top: 3px;
}
.geo-badge {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;
  font-size: 10px; color: #065f46; font-weight: 500;
  background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25);
  border-radius: 6px; padding: 3px 8px;
}
.geo-resolving {
  font-size: 10px; color: #9ca3af; margin-top: 4px; display: block;
}

/* Grow field takes more space in field-row */
.field-grow { flex: 2; }

/* ── Time-of-day pills ── */
.tod-pills {
  display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 2px;
}
.tod-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 99px; border: 1.5px solid rgba(0,0,0,0.1);
  background: #f9fafb; font-size: 11px; font-weight: 600; color: #6b7280;
  cursor: pointer; font-family: inherit; transition: all 0.14s; white-space: nowrap;
}
.tod-pill:hover { border-color: #6366f1; color: #4338ca; background: #eef2ff; }
.tod-pill-on {
  border-color: #6366f1 !important; background: #eef2ff !important; color: #4338ca !important;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
}

/* ── 24h Time-of-birth widget ── */
.tob-24h-wrap {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 10px;
  border: 1.5px solid rgba(0,0,0,0.12); background: #fff;
  transition: border-color 0.15s;
}
.tob-24h-wrap:focus-within { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.tob-err { border-color: #ef4444 !important; }
.tob-badge {
  font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px;
  background: #eef2ff; color: #4338ca; letter-spacing: 0.06em; flex-shrink: 0;
}
.tob-hh, .tob-mm {
  width: 48px; border: none; outline: none; background: transparent;
  font-size: 18px; font-weight: 700; color: #1a1a1a; text-align: center;
  font-family: 'JetBrains Mono', monospace; -moz-appearance: textfield;
}
.tob-hh::-webkit-outer-spin-button,
.tob-hh::-webkit-inner-spin-button,
.tob-mm::-webkit-outer-spin-button,
.tob-mm::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.tob-sep { font-size: 20px; font-weight: 700; color: #6b7280; line-height: 1; }
.tob-ok { font-size: 11px; font-weight: 700; color: #16a34a; margin-left: 4px; white-space: nowrap; }

/* ── Question textarea ── */
.q-inp-wrap { position: relative; }
.q-ta { min-height: 80px; resize: none; }

.q-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 10px 6px;
}
.q-word-count {
  font-size: 10px; color: #d1d5db; font-weight: 500; transition: color 0.2s;
}
.q-wc-ok { color: #10b981 !important; }
.q-quality-badge {
  font-size: 10px; font-weight: 700; color: #10b981;
  background: rgba(16,185,129,0.08); padding: 2px 8px; border-radius: 99px;
}

/* Question hint row */
.q-hint-row {
  display: flex; align-items: flex-start; gap: 6px; margin-top: 6px;
  padding: 6px 10px; border-radius: 8px; background: #fffbeb;
  border: 1px solid rgba(245,158,11,0.2);
}
.q-hint-text { font-size: 11px; color: #92400e; line-height: 1.5; }

/* AI suggestion strip */
.q-suggestion {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
  padding: 8px 12px; border-radius: 10px;
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  border: 1px solid rgba(14,165,233,0.2);
  flex-wrap: wrap;
}
.q-sug-label { font-size: 10px; font-weight: 700; color: #0369a1; flex-shrink: 0; }
.q-sug-text  { font-size: 11.5px; color: #0c4a6e; font-style: italic; flex: 1; min-width: 0; line-height: 1.5; }
.q-sug-btn {
  padding: 4px 12px; border-radius: 99px; border: none;
  background: #0ea5e9; color: #fff; font-size: 11px; font-weight: 700;
  cursor: pointer; font-family: inherit; white-space: nowrap; flex-shrink: 0;
  transition: background 0.15s;
}
.q-sug-btn:hover { background: #0284c7; }

/* Topic quick-start pills */
.topic-pills {
  display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px;
}
.topic-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 11px; border-radius: 99px; border: 1.5px solid rgba(0,0,0,0.09);
  background: #f9fafb; font-size: 11px; font-weight: 600; color: #374151;
  cursor: pointer; font-family: inherit; transition: all 0.14s; white-space: nowrap;
}
.topic-pill:hover { border-color: #10b981; color: #065f46; background: #f0fdf4; }

/* ══ HOME WRAPPER — column that holds the row + optional graph drawer ══ */
.home-wrapper {
  flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;
}

/* Graph drawer — slides up from the bottom of home-wrapper */
.graph-drawer {
  flex-shrink: 0;
  height: 420px;
  display: flex; flex-direction: column;
  border-top: 2px solid rgba(99,102,241,0.2);
  background: #fff;
  overflow: hidden;
  animation: drawerSlideUp 0.22s cubic-bezier(0.4,0,0.2,1);
}
@keyframes drawerSlideUp {
  from { height: 0; opacity: 0; }
  to   { height: 420px; opacity: 1; }
}
.graph-drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; flex-shrink: 0;
  background: #f8f9ff;
  border-bottom: 1px solid rgba(99,102,241,0.12);
}
.graph-drawer-close {
  width: 28px; height: 28px; border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.1); background: #fff;
  color: #6b7280; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.graph-drawer-close:hover { background: #fee2e2; border-color: #fca5a5; color: #ef4444; }
.graph-drawer-body {
  flex: 1; overflow: hidden; display: flex; flex-direction: column;
}

/* Floating action button — anchored to bottom-right of home-wrapper */
.graph-fab {
  position: absolute; bottom: 56px; left: 20px; z-index: 50;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 18px; border-radius: 99px; border: none;
  background: #1e1b4b;
  color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 4px 16px rgba(30,27,75,0.3);
  transition: all 0.2s;
}
.graph-fab:hover { background: #312e81; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(30,27,75,0.4); }
.graph-fab-active {
  background: linear-gradient(135deg, #4338ca, #6366f1);
  box-shadow: 0 4px 16px rgba(99,102,241,0.45);
}

/* ══ RESPONSIVE — MOBILE ══
   Core fix: on mobile the whole page must scroll naturally.
   Remove overflow:hidden from workspace/home-wrapper so panels
   can grow to their full content height and the HOST scrolls.
══════════════════════════════════════════════════════════════ */
@media (max-width: 960px) {
  /* ── Host + Shell: unlock fixed height so page scrolls naturally ── */
  :host { height: auto !important; min-height: 100dvh; overflow: visible !important; }
  .shell { height: auto !important; overflow: visible !important; }
  .workspace {
    overflow: visible !important;
    height: auto !important;
    flex: none !important;
    flex-direction: column;
    padding: 8px; gap: 8px;
  }
  .home-wrapper { overflow: visible !important; height: auto !important; flex: none !important; }
  .home-layout {
    flex-direction: column; align-items: stretch;
    overflow: visible !important; height: auto !important;
  }
  /* Panels: full width, natural height (no inner scroll on mobile) */
  /* panel-right (Analysis Modules) floats to top so users see module picker + CTA first */
  .panel-center { width: 100% !important; flex-shrink: 1; height: auto; order: 2; }
  .panel-right  { width: 100% !important; flex-shrink: 1; height: auto; order: 1; }
  /* Panel scroll becomes auto-height — no clipping */
  .panel-scroll { overflow-y: visible; height: auto; max-height: none; flex: none; }
  /* Module grid */
  .panel-right .mod-grid { grid-template-columns: repeat(3, 1fr); }
  /* Header */
  .hdr-nav { display: none; }
  .hdr { padding: 0 16px; height: 64px; }
  .hdr-btn-label { display: none; }
  .hdr-icon-btn, .hdr-signout-btn { padding: 7px 9px; }
  .hdr-uname { max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
  .hdr-avatar { width: 34px !important; height: 34px !important; }
  /* Graph drawer: full-height overlay on mobile */
  .graph-drawer {
    position: fixed; inset: 0; z-index: 200;
    height: 100dvh !important;
    animation: drawerFadeIn 0.2s ease;
  }
  @keyframes drawerFadeIn { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
  /* Pipeline view: full natural scroll */
  .pipeline-layout { overflow: visible; height: auto; }
  .pipeline-panel { flex: none; height: 90dvh; }
}

@media (max-width: 600px) {
  .panel-right .mod-grid { grid-template-columns: repeat(2, 1fr); }
  .field-row { grid-template-columns: 1fr; }
  .hdr-divider { display: none; }
  .hdr-book-btn { font-size: 0.68rem; padding: 0.32rem 0.55rem; }
  .workspace { padding: 6px; gap: 6px; }
  .panel { border-radius: 10px; }
  /* Hide name/role text — keep avatar + icon buttons only */
  .hdr-id-text, .hdr-uname, .hdr-urole, .hdr-user-text { display: none; }
  .hdr-logo { width: 32px !important; height: 32px !important; }
  .hdr-brand { gap: 6px; min-width: 0; }
  .hdr-name { font-size: 14px; }
  .hdr-tag { display: none; }
  .hdr-avatar { width: 26px !important; height: 26px !important; }
  .hdr-icon-btn { padding: 5px 6px; }
  .hdr-signout-btn { font-size: 0 !important; padding: 5px 6px; }
  .hdr-signout-btn svg { width: 14px; height: 14px; }
  .hdr-nav-btn { font-size: 0 !important; padding: 5px 6px; }
  .hdr-user { gap: 4px; }
}

@media (max-width: 480px) {
  .hdr { height: 56px; padding: 0 12px; }
  .hdr-logo { height: 30px !important; width: 30px !important; }
  .hdr-uname, .hdr-urole, .hdr-user-text, .hdr-id-text { display: none; }
  .hdr-signout-btn { font-size: 0 !important; padding: 6px 8px; }
  .hdr-icon-btn { padding: 6px 8px; }
  .workspace { padding: 4px; gap: 4px; }
  .panel { border-radius: 8px; }
  .field-row { grid-template-columns: 1fr; }
  .pipeline-topbar { flex-wrap: wrap; gap: 6px; padding: 8px 12px; }
}

@media (max-width: 380px) {
  .hdr { height: 52px; padding: 0 8px; }
  .hdr-brand { display: none; }
  .workspace { padding: 2px; gap: 4px; }
  .panel-right .mod-grid { grid-template-columns: 1fr 1fr; }
  .hdr-icon-btn, .hdr-signout-btn { padding: 5px 7px; }
}

/* ── Landscape mobile: side-by-side panels, natural scroll ── */
@media (max-width: 860px) and (orientation: landscape) {
  :host { height: auto !important; min-height: 100dvh; overflow: visible !important; }
  .shell { height: auto !important; overflow: visible !important; }
  .workspace { flex-direction: row; flex-wrap: wrap; overflow: visible !important; height: auto !important; flex: none !important; }
  .home-wrapper { overflow: visible !important; height: auto !important; flex: none !important; }
  .home-layout { flex-direction: row; flex-wrap: wrap; overflow: visible !important; }
  .panel-center { width: 55% !important; order: 2; }
  .panel-right  { width: 43% !important; order: 1; }
  .panel-scroll { overflow-y: visible; height: auto; max-height: none; }
  .hdr { height: 48px; }
  /* Graph drawer landscape: right half of screen */
  .graph-drawer { position: fixed; inset: 0; z-index: 200; height: 100dvh !important; }
}
  
.refresh-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.12); background: #f9fafb;
  color: #374151; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.refresh-btn:hover:not(:disabled) { background: #f3f4f6; border-color: #6366f1; color: #6366f1; }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.refresh-btn .refresh-icon { font-size: 15px; display: inline-block; }
.refresh-btn.spinning .refresh-icon { animation: refresh-spin 0.75s linear infinite; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }
.auto-refresh-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  background: #f3f4f6; border: 1px solid rgba(0,0,0,0.08);
  font-size: 11px; color: #6b7280; font-weight: 500; white-space: nowrap;
}
.auto-refresh-badge::before {
  content: ''; display: inline-block; width: 6px; height: 6px;
  border-radius: 50%; background: #22c55e;
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
`]
})
export class IntakePage {
  readonly router  = inject(Router);
  private route    = inject(ActivatedRoute);
  readonly orch    = inject(OrchestratorService);
  private geoSvc   = inject(GeocodeService);
  readonly auth    = inject(AuthService);

  // Set when admin navigates here via "Do Reading" from a lead
  readonly leadReadingMode = signal(false);
  readonly leadReadingId   = signal('');

  readonly geoResolved  = signal<{display_name:string; lat:number; lon:number} | null>(null);
  readonly geoResolving = signal(false);

  readonly allModules = ALL_MODULES;
  readonly directions = DIRECTIONS;
  readonly spreads    = SPREADS;
  readonly handShapes = HAND_SHAPES;
  readonly year       = new Date().getFullYear();
  readonly todayStr   = new Date().toISOString().split('T')[0];
  readonly dobDisplayValue = computed(() => {
    const d = this.profile().date_of_birth;
    if (!d) return '';
    const [y, m, dd] = d.split('-');
    if (!y || !m || !dd) return '';
    return `${dd} / ${m} / ${y}`;
  });

  onDobInput(raw: string) {
    const digits = raw.replace(/\D/g, '');
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    if (dd && mm && yyyy && yyyy.length === 4) {
      this.patch('date_of_birth', `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
    } else if (!digits) {
      this.patch('date_of_birth', '');
    }
  }

  readonly selectedModules = signal<Set<Module>>(new Set(['astrology','numerology']));
  readonly launchError     = signal('');
  readonly leftFileName    = signal('');
  readonly rightFileName   = signal('');
  readonly maxPanel        = signal<'left'|'modules'|'pipeline'|null>(null);
  readonly view            = signal<'home'|'pipeline'>('home');
  readonly showGraph       = signal(false);
  readonly promptVersion   = signal<'v1'|'v2'>('v2');
  readonly showLeadForm          = signal(false);
  readonly leadSubmitted         = signal(false);
  readonly leadId                = signal('');
  readonly leadStatus            = signal('submitted');
  readonly leadSubmitting        = signal(false);
  readonly leadError             = signal('');
  readonly newLeadCount          = signal(0);
  readonly leadPreferredLanguage = signal('en');

  readonly leadLanguageDisplay = computed(() => {
    const lang = INDIAN_LANGUAGES.find(l => l.code === this.leadPreferredLanguage());
    return lang ? `${lang.native} (${lang.name})` : 'English';
  });

  readonly availableLanguages = INDIAN_LANGUAGES;

  // UI language for the lead form (switches labels/placeholders)
  readonly uiLanguage  = signal('en');
  readonly uiStrings   = signal<UiStrings>(UI_STRINGS_EN as UiStrings);
  readonly uiLoading   = signal(false);

  switchLanguage(langCode: string) {
    this.uiLanguage.set(langCode);
    this.leadForm.preferred_language = langCode;
    // Fully static — instant, no API call, no network
    this.uiStrings.set(getUiStrings(langCode));
  }

  private async _backTranslateToEnglish(text: string): Promise<string> {
    if (this.uiLanguage() === 'en' || !text.trim()) return text;
    try {
      const res = await firstValueFrom(this.api.translateReport({
        session_id:    '',
        language_code: 'en',
        report:        { text },
      }));
      return (res?.final_report as any)?.text ?? text;
    } catch {
      return text; // fallback: send as-is
    }
  }

  leadForm = { name: '', email: '', phone: '', dob: '', consent: false,
               place_of_birth: '', time_of_birth: '', alias_name: '', question: '',
               preferred_language: 'en' };

  private http    = inject(HttpClient);
  private api     = inject(ApiService);
  readonly reportTranslating   = signal(false);
  readonly preparingReport     = signal(false);  // true while translating before navigating to /report
  readonly preparingLangName   = signal('');     // e.g. "Hindi" shown in overlay
  readonly chakraLoading       = signal(false);  // spinning chakra overlay on page transitions
  readonly reportDownloadError = signal('');     // shown when report fetch fails

  private _autoPollTimer: ReturnType<typeof setInterval> | null = null;

  startAutoPoll() {
    if (this._autoPollTimer) return;
    this._autoPollTimer = setInterval(async () => {
      await this.pollLeadStatus();
      if (this.leadStatus() === 'report_ready') {
        clearInterval(this._autoPollTimer!);
        this._autoPollTimer = null;
      }
    }, 15000);
  }

  stopAutoPoll() {
    if (this._autoPollTimer) { clearInterval(this._autoPollTimer); this._autoPollTimer = null; }
  }

  constructor() {
    // Poll new lead count for admins every 30s
    if (typeof window !== 'undefined') {
      this._pollLeadCount();
      setInterval(() => this._pollLeadCount(), 30000);
    }

    // ?lead=lead_xxx — user clicked "Open My Full Report" from email
    // Jump straight to their tracker screen so they see the download button
    const p = this.route.snapshot.queryParams;
    if (p['lead']) {
      this.leadId.set(p['lead']);
      this.leadSubmitted.set(true);
      this.router.navigate([], { replaceUrl: true });
      // Poll immediately so tracker shows current status
      setTimeout(() => this.pollLeadStatus(), 300);
    }

    // Pre-fill from lead query params when admin comes via "Do Reading"
    if (p['leadId']) {
      this.leadReadingMode.set(true);
      this.leadReadingId.set(p['leadId']);
      // Pre-fill birth profile with all lead data — admin should not re-type anything
      this.profileSig.update(prof => ({
        ...prof,
        full_name:      p['name']           || prof.full_name,
        alias_name:     p['alias_name']     || prof.alias_name,
        date_of_birth:  p['dob']            || prof.date_of_birth,
        time_of_birth:  p['time_of_birth']  || prof.time_of_birth,
        place_of_birth: p['place_of_birth'] || prof.place_of_birth,
      }));
      // Pre-fill user question
      if (p['question']) {
        this.userQuestion = p['question'];
        this.questionTouched.set(true);
      }
      // Trigger geocode for place if present
      if (p['place_of_birth']) {
        this._geocodeDebounced(p['place_of_birth']);
      }
      // Clear query params from URL without navigation
      this.router.navigate([], { replaceUrl: true });
    }
  }

  private async _pollLeadCount() {
    if (!this.auth.isAdmin()) return;
    try {
      const res: any = await firstValueFrom(this.http.get(`${BACKEND}/admin/leads/count-new`));
      this.newLeadCount.set(res.count ?? 0);
    } catch { /* silent — admin may not have loaded yet */ }
  }

  readonly profileSig = signal({
    full_name: '', alias_name: '', date_of_birth: '',
    time_of_birth: '', place_of_birth: '', pincode: ''
  });
  readonly touchedSig = signal<Record<string, boolean>>({});
  readonly errors     = computed<FieldErrors>(() => validateProfile(this.profileSig()));

  profile() { return this.profileSig(); }
  touched() { return this.touchedSig(); }
  patch(field: string, value: string) {
    this.profileSig.update(p => ({ ...p, [field]: value }));
    if (field === 'place_of_birth') this._geocodeDebounced(value);
  }

  private _geoTimer: ReturnType<typeof setTimeout> | null = null;
  private _geocodeDebounced(place: string) {
    if (this._geoTimer) clearTimeout(this._geoTimer);
    this.geoResolved.set(null);
    if (!place || place.trim().length < 3) return;
    this._geoTimer = setTimeout(async () => {
      this.geoResolving.set(true);
      const result = await this.geoSvc.resolve(place);
      this.geoResolving.set(false);
      this.geoResolved.set(result ? { display_name: result.display_name, lat: result.lat, lon: result.lon } : null);
    }, 700);
  }
  touch(field: string) { this.touchedSig.update(t => ({ ...t, [field]: true })); }
  touchAll() {
    this.touchedSig.update(t => ({ ...t, full_name: true, date_of_birth: true, time_of_birth: true, place_of_birth: true, pincode: true }));
  }

  userQuestion = '';
  palmInput: { hand_shape?: string } = {};
  tarotInput: { question?: string; spread?: '3-card'|'5-card' } = { spread: '3-card' };
  vastuInput: { property_type?: string; facing_direction?: string; floor_plan_notes?: string } = {};

  isSelected(m: Module) { return this.selectedModules().has(m); }
  toggleModule(m: Module) {
    this.selectedModules.update(s => { const c = new Set(s); c.has(m) ? c.delete(m) : c.add(m); return c; });
  }

  toggleMax(panel: 'left'|'modules'|'pipeline') {
    this.maxPanel.update(v => v === panel ? null : panel);
  }

  // ── Name field: auto title-case + touch ───────────────────────────────────
  onNameInput(raw: string) {
    const titled = toTitleCase(raw);
    this.patch('full_name', titled);
    this.touch('full_name');
  }

  // ── Age display ───────────────────────────────────────────────────────────
  readonly ageDisplay = computed(() => {
    const dob = this.profileSig().date_of_birth;
    if (!dob || !isValidDate(dob)) return '';
    const d = new Date(dob);
    const now = new Date();
    const age = Math.floor((now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 0 || age > 120) return '';
    return `${age} years`;
  });

  // ── 24h time-of-birth HH / MM helpers ───────────────────────────────────
  tobHH(): string {
    const tob = this.profile().time_of_birth;
    if (!tob || !tob.includes(':')) return '';
    return tob.split(':')[0];
  }
  tobMM(): string {
    const tob = this.profile().time_of_birth;
    if (!tob || !tob.includes(':')) return '';
    return tob.split(':')[1];
  }
  private _normTob(hh: string, mm: string): string {
    const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  onTobHH(val: string) {
    const mm = this.tobMM() || '00';
    this.patch('time_of_birth', this._normTob(val, mm));
  }
  onTobMM(val: string) {
    const hh = this.tobHH() || '00';
    this.patch('time_of_birth', this._normTob(hh, val));
  }

  // ── Time-of-day quick selector ────────────────────────────────────────────
  readonly timeOfDayOptions = [
    { value: 'morning',   icon: '🌅', label: 'Morning',   approx: '06:00' },
    { value: 'afternoon', icon: '☀️',  label: 'Afternoon', approx: '12:00' },
    { value: 'evening',   icon: '🌇', label: 'Evening',   approx: '18:00' },
    { value: 'night',     icon: '🌙', label: 'Night',     approx: '22:00' },
    { value: 'exact',     icon: '🕐', label: 'Exact',     approx: '' },
  ];
  readonly selectedTod = signal('');

  selectTod(val: string) {
    this.selectedTod.set(val);
    if (val !== 'exact') {
      const opt = this.timeOfDayOptions.find(o => o.value === val);
      if (opt?.approx) this.patch('time_of_birth', opt.approx);
    } else {
      this.patch('time_of_birth', '');
    }
  }

  todHint(): string {
    const opt = this.timeOfDayOptions.find(o => o.value === this.selectedTod());
    return opt ? `~${opt.approx}` : '';
  }

  // ── Question intelligence ─────────────────────────────────────────────────
  readonly questionTouched = signal(false);

  readonly qScore = computed(() => questionScore(this.userQuestion));

  readonly wordCount = computed(() =>
    this.userQuestion.trim() ? this.userQuestion.trim().split(/\s+/).filter(Boolean).length : 0
  );

  readonly questionSuggestion = computed(() => suggestQuestion(this.userQuestion));

  onQuestionChange() {
    // Mark touched after a short delay so user isn't nagged on first keypress
    if (this.userQuestion.trim().length > 3) this.questionTouched.set(true);
  }

  applyQuestionSuggestion() {
    this.userQuestion = this.questionSuggestion();
    this.questionTouched.set(true);
  }

  // ── Question topic quick-starters ─────────────────────────────────────────
  readonly questionTopics = [
    { icon: '💼', label: 'Career',   q: 'Will my career grow significantly this year, and what steps should I take?' },
    { icon: '💍', label: 'Marriage', q: 'When is the right time for me to get married, and what does my chart indicate?' },
    { icon: '💰', label: 'Finance',  q: 'Will my financial situation improve in the coming months, and how?' },
    { icon: '❤️', label: 'Love',     q: 'Will I find a compatible life partner soon, and what should I look for?' },
    { icon: '🏥', label: 'Health',   q: 'What does my birth chart indicate about my health in the next year?' },
    { icon: '🚀', label: 'Business', q: 'Should I start a new business this year — will it be successful?' },
  ];

  setTopicQuestion(q: string) {
    this.userQuestion = q;
    this.questionTouched.set(true);
  }

  onFile(e: Event, side: 'left'|'right') {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) side === 'left' ? this.leftFileName.set(f.name) : this.rightFileName.set(f.name);
  }
  onDrop(e: DragEvent, side: 'left'|'right') {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) side === 'left' ? this.leftFileName.set(f.name) : this.rightFileName.set(f.name);
  }
  setSpread(s: string) { this.tarotInput.spread = s as '3-card'|'5-card'; }

  /* ── Resize: left panel width ── */
  @ViewChild('leftPanel',  { read: ElementRef }) private lpEl!: ElementRef<HTMLElement>;
  @ViewChild('topPanel',   { read: ElementRef }) private tpEl!: ElementRef<HTMLElement>;
  @ViewChild('bottomPanel',{ read: ElementRef }) private bpEl!: ElementRef<HTMLElement>;
  @ViewChild('workspace',  { read: ElementRef }) private wsEl!: ElementRef<HTMLElement>;

  private hDrag = false; private hX0 = 0; private hW0 = 0;
  private vDrag = false; private vY0 = 0; private vH0 = 0;

  hResizeStart(e: MouseEvent) {
    e.preventDefault(); this.hDrag = true; this.hX0 = e.clientX; this.hW0 = this.lpEl.nativeElement.offsetWidth;
  }
  vResizeStart(e: MouseEvent) {
    e.preventDefault(); this.vDrag = true; this.vY0 = e.clientY; this.vH0 = this.tpEl.nativeElement.offsetHeight;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    if (this.hDrag) {
      const ws = this.wsEl.nativeElement.offsetWidth;
      const w = Math.min(Math.max(this.hW0 + (e.clientX - this.hX0), 240), ws * 0.55);
      this.lpEl.nativeElement.style.width = w + 'px';
    }
    if (this.vDrag) {
      const newH = Math.max(this.vH0 + (e.clientY - this.vY0), 120);
      this.tpEl.nativeElement.style.flex = 'none';
      this.tpEl.nativeElement.style.height = newH + 'px';
    }
  }

  @HostListener('document:mouseup')
  onUp() { this.hDrag = false; this.vDrag = false; }

  @HostListener('document:keydown.escape')
  onEsc() { this.maxPanel.set(null); }

  async launch() {
    this.touchAll();
    if (Object.keys(this.errors()).length) {
      this.launchError.set('Please fix the highlighted errors in Birth Profile.'); return;
    }
    if (!this.selectedModules().size) {
      this.launchError.set('Please select at least one analysis module.'); return;
    }
    this.launchError.set('');

    // USER on 2nd run+ → show lead capture form instead of running AI
    // Skip when admin is doing a reading for a specific lead
    if (!this.auth.isAdmin() && this.orch.runCount() >= 1 && !this.leadReadingMode()) {
      const profile = this.profileSig();
      this.leadForm.name           = profile.full_name || '';
      this.leadForm.alias_name     = profile.alias_name || '';
      this.leadForm.dob            = profile.date_of_birth || '';
      this.leadForm.time_of_birth  = profile.time_of_birth || '';
      this.leadForm.place_of_birth = profile.place_of_birth || '';
      this.leadForm.question       = this.userQuestion || '';
      this.leadForm.email              = '';
      this.leadForm.phone              = '';
      this.leadForm.consent            = false;
      this.leadForm.preferred_language = 'en';
      this.leadError.set('');
      this.showLeadForm.set(true);
      return;
    }

    const rawQ = this.userQuestion.trim();
    // If user typed question in a non-English language, translate it to English
    // before sending to the backend pipeline (uses existing /translate endpoint).
    const englishQ = await this._backTranslateToEnglish(rawQ);
    const input: SystemInput = {
      user_profile:     { ...this.profileSig() },
      user_question:    englishQ,
      questions:        [],
      selected_modules: [...this.selectedModules()],
      module_inputs: {
        palmistry: this.isSelected('palmistry') ? { ...this.palmInput } : undefined,
        tarot:     this.isSelected('tarot')     ? { ...this.tarotInput } : undefined,
        vastu:     this.isSelected('vastu')     ? { ...this.vastuInput } : undefined,
      },
      prompt_version: this.promptVersion(),
    };
    this.chakraLoading.set(true);
    await new Promise(r => setTimeout(r, 4000));
    this.chakraLoading.set(false);
    this.view.set('pipeline');
    this.orch.run(input);
  }

  async goReview() {
    this.chakraLoading.set(true);
    await new Promise(r => setTimeout(r, 4000));
    this.chakraLoading.set(false);
    if (this.auth.isAdmin()) {
      this.router.navigate(['/review'], {
        queryParams: this.leadReadingMode() ? { leadId: this.leadReadingId() } : {}
      });
      return;
    }
    // USER — auto-approve all insights, generate PDF directly
    const review = this.orch.adminReview();
    if (!review) return;
    const allIds = review.questions.flatMap(q => q.insights.map(i => i.id));
    this.view.set('pipeline');
    const lang = this.uiLanguage();

    try {
      // Step 1: generate English report
      const englishReport = await this.orch.approveAndGenerate(allIds, []);

      // Step 2: if user chose a non-English language, translate NOW before navigating
      if (lang && lang !== 'en' && englishReport) {
        const langMeta = INDIAN_LANGUAGES.find(l => l.code === lang);
        this.preparingLangName.set(langMeta?.name ?? lang);
        this.preparingReport.set(true);
        try {
          const res = await firstValueFrom(this.api.translateReport({
            session_id:    this.orch.sessionId() ?? '',
            language_code: lang,
            report:        englishReport as any,
          }));
          if (res?.final_report) {
            // Stamp language_code so report page selector reflects the correct language
            const translated = { ...res.final_report, language_code: lang };
            this.orch.setFinalReport(translated);
          }
        } catch {
          // Translation failed — report page opens in English, user can switch manually
        } finally {
          this.preparingReport.set(false);
        }
      }
    } catch {
      // approveAndGenerate failed — navigate anyway
    }

    this.router.navigate(['/report']);
  }

  rerun() {
    this.orch.reset();
    this.view.set('home');
    this.showLeadForm.set(false);
    this.leadSubmitted.set(false);
    this.leadId.set('');
    this.leadStatus.set('submitted');
    this.leadPreferredLanguage.set('en');
    this.reportDownloadError.set('');
    this.reportTranslating.set(false);
    this.stopAutoPoll();
  }

  async submitLead() {
    this.leadError.set('');
    if (!this.leadForm.name.trim()) { this.leadError.set('Please enter your full name.'); return; }
    if (!this.leadForm.email.trim()) { this.leadError.set('Please enter your email address.'); return; }
    if (!this.leadForm.consent) { this.leadError.set('Please confirm your consent to share details.'); return; }

    // Always pull from the birth profile — leadForm fields shadow it
    const profile = this.profileSig();
    const payload = {
      name:               this.leadForm.name           || profile.full_name,
      alias_name:         this.leadForm.alias_name     || profile.alias_name,
      email:              this.leadForm.email,
      phone:              this.leadForm.phone,
      dob:                this.leadForm.dob            || profile.date_of_birth,
      place_of_birth:     this.leadForm.place_of_birth || profile.place_of_birth,
      time_of_birth:      this.leadForm.time_of_birth  || profile.time_of_birth,
      question:           this.leadForm.question       || this.userQuestion,
      consent:            this.leadForm.consent,
      preferred_language: this.leadForm.preferred_language || 'en',
    };

    this.leadSubmitting.set(true);
    try {
      const res: any = await firstValueFrom(this.http.post(`${BACKEND}/leads`, payload));
      this.leadId.set(res.lead_id);
      this.leadStatus.set('submitted');
      this.leadPreferredLanguage.set(this.leadForm.preferred_language || 'en');
      this.showLeadForm.set(false);
      this.leadSubmitted.set(true);
      this.startAutoPoll();
    } catch (e: any) {
      this.leadError.set(e?.error?.detail ?? 'Something went wrong. Please try again.');
    } finally {
      this.leadSubmitting.set(false);
    }
  }

  async pollLeadStatus() {
    if (!this.leadId()) return;
    try {
      const res: any = await firstValueFrom(this.http.get(`${BACKEND}/leads/${this.leadId()}`));
      this.leadStatus.set(res.status);
    } catch { /* silent */ }
  }

  async downloadLeadReport() {
    if (!this.leadId()) return;
    this.reportTranslating.set(true);
    this.reportDownloadError.set('');
    try {
      const report: any = await firstValueFrom(
        this.http.get(`${BACKEND}/leads/${this.leadId()}/report`)
      );

      if (!report) {
        this.reportDownloadError.set('Report is not ready yet. Please try again in a moment.');
        return;
      }

      const lang = this.leadPreferredLanguage();
      if (lang && lang !== 'en') {
        try {
          const res = await firstValueFrom(this.api.translateReport({
            session_id:    '',
            language_code: lang,
            report,
          }));
          this.orch.setFinalReport(res.final_report ?? report);
        } catch {
          // Translation failed — use English report rather than blocking the user
          this.orch.setFinalReport(report);
        }
      } else {
        this.orch.setFinalReport(report);
      }

      this.router.navigate(['/report']);
    } catch (e: any) {
      // Re-poll status so the UI reflects the real state
      await this.pollLeadStatus();
      const status = this.leadStatus();
      if (status !== 'report_ready') {
        this.reportDownloadError.set('Your report is still being prepared. Please wait and try again.');
      } else {
        this.reportDownloadError.set(
          e?.error?.detail ?? 'Could not load the report. Please click the button again.'
        );
      }
    } finally {
      this.reportTranslating.set(false);
    }
  }

  private readonly STEP_ORDER = ['submitted', 'admin_notified', 'expert_analysis', 'report_ready'];

  isStepDone(step: string): boolean {
    const current = this.STEP_ORDER.indexOf(this.leadStatus());
    const target  = this.STEP_ORDER.indexOf(step);
    return target <= current;
  }

  isStepActive(step: string): boolean {
    return this.leadStatus() === step;
  }
}
