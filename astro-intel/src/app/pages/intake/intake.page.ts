import { Component, inject, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { GeocodeService } from '../../services/geocode.service';
import { Module, SystemInput } from '../../models/astro.models';
import { AgentFlowComponent } from '../../components/agent-flow/agent-flow.component';

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
  imports: [CommonModule, FormsModule, AgentFlowComponent],
  template: `
<div class="shell">

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
      <img src="rav-photo.png" alt="Rav Singh" class="hdr-avatar"/>
      <div class="hdr-user-text">
        <span class="hdr-uname">Rav Singh</span>
        <span class="hdr-urole">Spiritual Intelligence Expert</span>
      </div>
    </div>
  </header>

  <!-- ══ VIEW: HOME — Birth Profile (center) + Modules (right) ══ -->
  @if (view() === 'home') {
  <div class="home-wrapper">
  <div class="workspace home-layout">

    <!-- ── CENTER: Birth Profile ── -->
    <section class="panel panel-center">
      <div class="ptb">
        <span class="ptb-title">Birth Profile</span>
      </div>

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
              <div class="card-title">Personal Details</div>
              <div class="card-sub">Your birth data powers all calculations</div>
            </div>
          </div>

          <div class="fields">

            <!-- Full Name + Known As -->
            <div class="field-row">
              <div class="field field-grow">
                <label class="flabel">
                  Full Name <span class="req">*</span>
                  <span class="flabel-hint">as per official records</span>
                </label>
                <div class="inp-wrap"
                     [class.inp-err]="touched()['full_name'] && errors()['full_name']"
                     [class.inp-ok]="touched()['full_name'] && !errors()['full_name'] && profile().full_name">
                  <input class="inp" type="text"
                         placeholder="e.g. Chandan Kumar"
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
                <label class="flabel">Known As <span class="opt">optional</span></label>
                <div class="inp-wrap">
                  <input class="inp" type="text" placeholder="e.g. Rav"
                         [value]="profile().alias_name"
                         (input)="patch('alias_name', $any($event.target).value)"/>
                </div>
              </div>
            </div>

            <!-- Date of Birth + Time of Birth -->
            <div class="field-row">
              <div class="field">
                <label class="flabel">Date of Birth <span class="req">*</span></label>
                <div class="inp-wrap"
                     [class.inp-err]="touched()['date_of_birth'] && errors()['date_of_birth']"
                     [class.inp-ok]="touched()['date_of_birth'] && !errors()['date_of_birth'] && profile().date_of_birth">
                  <input class="inp" type="date" [max]="todayStr"
                         [value]="profile().date_of_birth"
                         (input)="patch('date_of_birth', $any($event.target).value)"
                         (blur)="touch('date_of_birth')"/>
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
                  Time of Birth <span class="opt">optional</span>
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
              <label class="flabel">Place of Birth <span class="req">*</span></label>
              <div class="inp-wrap"
                   [class.inp-err]="touched()['place_of_birth'] && errors()['place_of_birth']"
                   [class.inp-ok]="touched()['place_of_birth'] && !errors()['place_of_birth'] && profile().place_of_birth">
                <svg class="inp-ico" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5c0-2.485-2.015-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.2"/>
                  <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.2"/>
                </svg>
                <input class="inp inp-icon" type="text"
                       placeholder="City, State, Country — e.g. Patna, Bihar, India"
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
              <div class="card-title">Your Question</div>
              <div class="card-sub">Ask about career, marriage, finance, health…</div>
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
                      placeholder="e.g. Will my career grow significantly this year? What should I focus on?"></textarea>
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

          @if (orch.focusContext()['intent']) {
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
        <span class="ptb-title">Analysis Modules</span>
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
          <div class="pv-label">Report Style</div>
          <div class="pv-options">

            <button class="pv-opt pv-opt-v1" [class.pv-opt-on]="promptVersion() === 'v1'" (click)="promptVersion.set('v1')">
              <div class="pv-radio" [class.pv-radio-on]="promptVersion() === 'v1'">
                @if (promptVersion() === 'v1') { <div class="pv-radio-dot pv-radio-dot-warm"></div> }
              </div>
              <div class="pv-icon-wrap pv-icon-warm" [class.pv-icon-on]="promptVersion() === 'v1'">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </div>
              <div class="pv-body">
                <span class="pv-name">Warm &amp; Exploratory</span>
                <span class="pv-desc">Gentle · Encouraging · Holistic</span>
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
                  <span class="pv-name">Laser Sharp</span>
                  <span class="pv-badge">Recommended</span>
                </div>
                <span class="pv-desc">Direct answers · Exact timing · Actions</span>
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
                Analysis complete
              </div>
              <button class="cta cta-review" (click)="goReview()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M4 5h6M4 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                View Analysis
              </button>
              <button class="cta-rerun" (click)="rerun()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 6A4 4 0 1 1 8.5 2.5M10 1v3H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                New Reading
              </button>
            </div>
          } @else {
            <button class="cta" [disabled]="orch.isRunning()" (click)="launch()">
              @if (orch.isRunning()) {
                <span class="spinner"></span> Agents Running…
              } @else {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linejoin="round"/></svg>
                Begin 360° Reading
              }
            </button>
            <p class="cta-hint">All selected agents run · 20–60 s</p>
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
        @if (orch.sessionId()) {
          <div class="alert-ok">🔑 Session {{ orch.sessionId() }} · Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong></div>
        }
        @if (orch.isDone()) {
          <div class="done-row">
            @if (orch.cacheHit()) {
              <span class="cache-hit-badge">⚡ Response served from cache</span>
            }
            <span class="done-msg">✦ Reading complete</span>
            <button class="done-btn" (click)="goReview()">Open Review →</button>
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
  <footer class="ftr">
    <div class="ftr-brand">
      <img src="rav-logo.png" class="ftr-logo" alt=""/>
      <span class="ftr-name">AURA with Rav</span>
      <span class="ftr-sep">·</span>
      <span class="ftr-tag">See life — as it is.</span>
    </div>
    <div class="ftr-links">
      <span>Vedic Astrology</span><span class="ftr-sep">·</span>
      <span>Numerology</span><span class="ftr-sep">·</span>
      <span>Palmistry</span><span class="ftr-sep">·</span>
      <span>Tarot</span><span class="ftr-sep">·</span>
      <span>Vastu</span>
    </div>
    <p class="ftr-copy">© {{ year }} Aura with Rav · For guidance only · Powered by AI</p>
  </footer>

</div>
  `,
  styles: [`
/* ════════════════════════════════════════════════════════════════
   AURA WITH RAV — Apple-quality UI · White + Indigo/Green
════════════════════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:host {
  display: block; height: 100vh; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  color: #111827; background: #f1f5f9;
  -webkit-font-smoothing: antialiased;
}

/* ══ SHELL ══ */
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ══ HEADER ══ */
.hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px; height: 104px; flex-shrink: 0;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(24px) saturate(200%);
  border-bottom: 1px solid rgba(0,0,0,0.07);
  box-shadow: 0 1px 0 rgba(0,0,0,0.05);
  position: relative; z-index: 100;
}
.hdr-brand { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.hdr-logo  { width: 60px; height: 60px; object-fit: cover; object-position: center top; border-radius: 50%; border: 2.5px solid rgba(99,102,241,0.35); }
.hdr-brand-text { display: flex; flex-direction: column; gap: 2px; }
.hdr-name  { font-size: 22px; font-weight: 700; color: #1e1b4b; letter-spacing: 0.06em; line-height: 1.2; }
.hdr-name em { font-style: normal; font-weight: 400; color: #6366f1; }
.hdr-tag   { font-size: 13px; color: #94a3b8; letter-spacing: 0.04em; }
.hdr-nav   { display: flex; align-items: center; gap: 6px; }
.hdr-nav-item { font-size: 16px; color: #4b5563; padding: 7px 14px; border-radius: 10px; cursor: default; transition: background 0.15s; white-space: nowrap; font-weight: 500; }
.hdr-nav-item:hover { background: rgba(99,102,241,0.07); color: #4338ca; }
.hdr-sep { color: rgba(0,0,0,0.15); font-size: 18px; }
.hdr-user { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.hdr-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; object-position: top; border: 2.5px solid rgba(99,102,241,0.35); }
.hdr-user-text { display: flex; flex-direction: column; gap: 2px; text-align: right; }
.hdr-uname { font-size: 16px; font-weight: 600; color: #1e1b4b; line-height: 1.2; }
.hdr-urole { font-size: 12px; color: #94a3b8; }

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
.mod-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
.mod-chip {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 11px 6px 9px; border-radius: 12px; border: 1.5px solid rgba(0,0,0,0.09);
  background: #f9fafb; cursor: pointer; transition: all 0.18s; text-align: center;
  font-family: inherit;
}
.mod-chip:hover { border-color: #6366f1; background: #eef2ff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.12); }
.mod-chip-on {
  border-color: #6366f1 !important; background: #eef2ff !important;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important;
}
.mod-chip-icon { font-size: 22px; line-height: 1; }
.mod-chip-body { display: flex; flex-direction: column; gap: 1px; }
.mod-chip-name { font-size: 10px; font-weight: 700; color: #374151; }
.mod-chip-desc { font-size: 8.5px; color: #9ca3af; line-height: 1.3; }
.mod-chip-check {
  position: absolute; top: 5px; right: 5px;
  width: 14px; height: 14px; border-radius: 50%; background: #6366f1;
  color: #fff; font-size: 8px; font-weight: 900; display: flex; align-items: center; justify-content: center;
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

/* ══ FOOTER ══ */
.ftr {
  flex-shrink: 0; height: 32px; padding: 0 20px;
  background: rgba(255,255,255,0.8); backdrop-filter: blur(10px);
  border-top: 1px solid rgba(0,0,0,0.06);
  display: flex; align-items: center; justify-content: space-between;
  position: relative; z-index: 100;
}
.ftr-brand { display: flex; align-items: center; gap: 6px; }
.ftr-logo  { width: 16px; height: 16px; object-fit: contain; border-radius: 4px; }
.ftr-name  { font-size: 10.5px; font-weight: 700; color: #4338ca; letter-spacing: 0.06em; }
.ftr-tag   { font-size: 10px; color: #9ca3af; }
.ftr-sep   { color: rgba(0,0,0,0.15); font-size: 10px; }
.ftr-links { display: flex; align-items: center; gap: 5px; }
.ftr-links span { font-size: 10px; color: #9ca3af; }
.ftr-copy  { font-size: 9.5px; color: #d1d5db; }

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
  position: absolute; bottom: 16px; right: 20px; z-index: 50;
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

/* ══ RESPONSIVE ══ */
@media (max-width: 960px) {
  .home-layout { flex-direction: column; align-items: stretch; overflow-y: auto; }
  .panel-center { width: 100% !important; }
  .panel-right  { width: 100% !important; }
  .panel-right .mod-grid { grid-template-columns: repeat(3, 1fr); }
  .hdr-nav, .ftr-links { display: none; }
}
@media (max-width: 600px) {
  .panel-right .mod-grid { grid-template-columns: repeat(2, 1fr); }
  .field-row { grid-template-columns: 1fr; }
}
  `]
})
export class IntakePage {
  private router   = inject(Router);
  readonly orch    = inject(OrchestratorService);
  private geoSvc   = inject(GeocodeService);

  readonly geoResolved  = signal<{display_name:string; lat:number; lon:number} | null>(null);
  readonly geoResolving = signal(false);

  readonly allModules = ALL_MODULES;
  readonly directions = DIRECTIONS;
  readonly spreads    = SPREADS;
  readonly handShapes = HAND_SHAPES;
  readonly year       = new Date().getFullYear();
  readonly todayStr   = new Date().toISOString().split('T')[0];

  readonly selectedModules = signal<Set<Module>>(new Set(['astrology','numerology']));
  readonly launchError     = signal('');
  readonly leftFileName    = signal('');
  readonly rightFileName   = signal('');
  readonly maxPanel        = signal<'left'|'modules'|'pipeline'|null>(null);
  readonly view            = signal<'home'|'pipeline'>('home');
  readonly showGraph       = signal(false);
  readonly promptVersion   = signal<'v1'|'v2'>('v2');

  constructor() {}

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

  launch() {
    this.touchAll();
    if (Object.keys(this.errors()).length) {
      this.launchError.set('Please fix the highlighted errors in Birth Profile.'); return;
    }
    if (!this.selectedModules().size) {
      this.launchError.set('Please select at least one analysis module.'); return;
    }
    this.launchError.set('');
    const rawQ = this.userQuestion.trim();
    const input: SystemInput = {
      user_profile:     { ...this.profileSig() },
      user_question:    rawQ,   // single source of truth
      questions:        [],     // not used for single-question mode
      selected_modules: [...this.selectedModules()],
      module_inputs: {
        palmistry: this.isSelected('palmistry') ? { ...this.palmInput } : undefined,
        tarot:     this.isSelected('tarot')     ? { ...this.tarotInput } : undefined,
        vastu:     this.isSelected('vastu')     ? { ...this.vastuInput } : undefined,
      },
      prompt_version: this.promptVersion(),
    };
    this.view.set('pipeline');
    this.orch.run(input);
  }

  goReview() { this.router.navigate(['/review']); }

  rerun() {
    this.orch.reset();
    this.view.set('home');
  }
}
