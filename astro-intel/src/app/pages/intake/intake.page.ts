import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
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

type FieldErrors = Record<string, string>;

function isValidDate(val: string): boolean {
  if (!val) return false;
  if (/^\d{1,2}:\d{2}/.test(val)) return false;
  return !isNaN(new Date(val).getTime());
}

function validateProfile(p: {
  full_name: string; date_of_birth: string; time_of_birth: string;
  place_of_birth: string; pincode: string;
}): FieldErrors {
  const e: FieldErrors = {};
  const name = p.full_name.trim();
  if (!name) e['full_name'] = 'Full name is required.';
  else if (!/^[a-zA-Z\s\-'.]{2,100}$/.test(name)) e['full_name'] = 'Name must be 2–100 letters/spaces only.';

  const dob = p.date_of_birth;
  if (!dob) { e['date_of_birth'] = 'Date of birth is required.'; }
  else if (!isValidDate(dob)) { e['date_of_birth'] = 'Enter a valid date (not a time string).'; }
  else {
    const d = new Date(dob); const now = new Date(); now.setHours(0,0,0,0);
    if (d > now) e['date_of_birth'] = 'Date of birth cannot be in the future.';
    else if (d < new Date('1900-01-01')) e['date_of_birth'] = 'Date of birth cannot be before 1900.';
  }

  const tob = p.time_of_birth;
  if (tob && !/^([01]\d|2[0-3]):[0-5]\d$/.test(tob))
    e['time_of_birth'] = 'Enter time in HH:MM (00:00–23:59).';

  const place = p.place_of_birth.trim();
  if (!place) e['place_of_birth'] = 'Place of birth is required.';
  else if (place.length < 3) e['place_of_birth'] = 'At least 3 characters.';
  else if (/[0-9@#$%^&*()_+=<>{}[\]|\\]/.test(place)) e['place_of_birth'] = 'No numbers or special characters.';

  const pin = p.pincode.trim();
  if (pin && !/^\d{4,8}$/.test(pin)) e['pincode'] = 'Pincode must be 4–8 digits.';

  return e;
}

@Component({
  selector: 'app-intake',
  standalone: true,
  imports: [CommonModule, FormsModule, AgentFlowComponent],
  template: `
<div class="shell">

  <!-- ══ STARFIELD BACKGROUND ══ -->
  <div class="starfield" aria-hidden="true">
    <div class="star s1"></div><div class="star s2"></div><div class="star s3"></div>
    <div class="star s4"></div><div class="star s5"></div><div class="star s6"></div>
    <div class="star s7"></div><div class="star s8"></div><div class="star s9"></div>
    <div class="star s10"></div><div class="star s11"></div><div class="star s12"></div>
  </div>

  <!-- ══ HEADER ══ -->
  <header class="site-header">
    <div class="header-inner">

      <!-- Brand -->
      <div class="brand">
        <img src="rav-logo.png" alt="Aura with Rav" class="brand-logo" />
        <div class="brand-text">
          <span class="brand-name">AURA <em>with Rav</em></span>
          <span class="brand-tag">See life — as it is.</span>
        </div>
      </div>

      <!-- Centre nav pills -->
      <nav class="header-nav">
        <span class="nav-pill">♈ Astrology</span>
        <span class="nav-sep">·</span>
        <span class="nav-pill">∞ Numerology</span>
        <span class="nav-sep">·</span>
        <span class="nav-pill">☽ Palmistry</span>
        <span class="nav-sep">·</span>
        <span class="nav-pill">★ Tarot</span>
        <span class="nav-sep">·</span>
        <span class="nav-pill">⊕ Vastu</span>
      </nav>

      <!-- Rav identity -->
      <div class="header-rav">
        <img src="rav-photo.png" alt="Rav Singh" class="rav-avatar" />
        <div class="rav-text">
          <span class="rav-name">Rav Singh</span>
          <span class="rav-role">Spiritual Intelligence Expert</span>
        </div>
      </div>

    </div>
  </header>

  <!-- ══ WORKSPACE ══ -->
  <div class="workspace">

    <!-- ── LEFT PANEL ── -->
    <aside class="panel left-panel">

      <!-- Section header -->
      <div class="section-eyebrow">
        <span class="eyebrow-line"></span>
        <span class="eyebrow-text">Birth Profile</span>
        <span class="eyebrow-line"></span>
      </div>

      <!-- Profile card -->
      <div class="glass-card">
        <div class="glass-card-header">
          <svg class="card-glyph" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <div>
            <h3 class="card-title">Personal Details</h3>
            <p class="card-subtitle">Your birth data powers all calculations</p>
          </div>
        </div>

        <div class="fields">

          <div class="field-group">
            <div class="field">
              <label class="flabel">Full Name <span class="req-dot">*</span></label>
              <div class="input-wrap" [class.input-err]="touchedSig()['full_name'] && errors()['full_name']">
                <input type="text" class="finput"
                       [value]="profileSig().full_name"
                       (input)="patch('full_name', $any($event.target).value)"
                       (blur)="touch('full_name')"
                       placeholder="e.g. Chandan Kumar" autocomplete="name" />
              </div>
              @if (touchedSig()['full_name'] && errors()['full_name']) {
                <p class="ferr">{{ errors()['full_name'] }}</p>
              }
            </div>

            <div class="field">
              <label class="flabel">Known As <span class="fopt">optional</span></label>
              <div class="input-wrap">
                <input type="text" class="finput"
                       [value]="profileSig().alias_name"
                       (input)="patch('alias_name', $any($event.target).value)"
                       placeholder="e.g. Rav" />
              </div>
            </div>
          </div>

          <div class="field-group">
            <div class="field">
              <label class="flabel">Date of Birth <span class="req-dot">*</span></label>
              <div class="input-wrap" [class.input-err]="touchedSig()['date_of_birth'] && errors()['date_of_birth']">
                <input type="date" class="finput"
                       [value]="profileSig().date_of_birth"
                       (input)="patch('date_of_birth', $any($event.target).value)"
                       (blur)="touch('date_of_birth')"
                       [max]="todayStr" />
              </div>
              @if (touchedSig()['date_of_birth'] && errors()['date_of_birth']) {
                <p class="ferr">{{ errors()['date_of_birth'] }}</p>
              }
            </div>

            <div class="field">
              <label class="flabel">Time of Birth <span class="fopt">optional</span></label>
              <div class="input-wrap" [class.input-err]="touchedSig()['time_of_birth'] && errors()['time_of_birth']">
                <input type="time" class="finput"
                       [value]="profileSig().time_of_birth"
                       (input)="patch('time_of_birth', $any($event.target).value)"
                       (blur)="touch('time_of_birth')" />
              </div>
              @if (touchedSig()['time_of_birth'] && errors()['time_of_birth']) {
                <p class="ferr">{{ errors()['time_of_birth'] }}</p>
              }
            </div>
          </div>

          <div class="field">
            <label class="flabel">Place of Birth <span class="req-dot">*</span></label>
            <div class="input-wrap" [class.input-err]="touchedSig()['place_of_birth'] && errors()['place_of_birth']">
              <svg class="input-icon" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5c0-2.485-2.015-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.2"/>
                <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.2"/>
              </svg>
              <input type="text" class="finput has-icon"
                     [value]="profileSig().place_of_birth"
                     (input)="patch('place_of_birth', $any($event.target).value)"
                     (blur)="touch('place_of_birth')"
                     placeholder="e.g. Patna, Bihar, India" />
            </div>
            @if (touchedSig()['place_of_birth'] && errors()['place_of_birth']) {
              <p class="ferr">{{ errors()['place_of_birth'] }}</p>
            }
          </div>

          <div class="field">
            <label class="flabel">Pincode <span class="fopt">optional</span></label>
            <div class="input-wrap" [class.input-err]="touchedSig()['pincode'] && errors()['pincode']">
              <input type="text" class="finput"
                     [value]="profileSig().pincode"
                     (input)="patch('pincode', $any($event.target).value)"
                     (blur)="touch('pincode')"
                     placeholder="e.g. 800001" maxlength="10" />
            </div>
            @if (touchedSig()['pincode'] && errors()['pincode']) {
              <p class="ferr">{{ errors()['pincode'] }}</p>
            }
          </div>

        </div>
      </div>

      <!-- Question card -->
      <div class="section-eyebrow" style="margin-top:4px">
        <span class="eyebrow-line"></span>
        <span class="eyebrow-text">Your Question</span>
        <span class="eyebrow-line"></span>
      </div>

      <div class="glass-card question-glass">
        <div class="question-prompt">
          <span class="question-star">✦</span>
          <p class="question-hint">What do you seek to understand today?<br>
            <span class="question-hint-sub">All agents align their findings to your question.</span>
          </p>
        </div>
        <div class="input-wrap question-wrap">
          <textarea class="finput fta" [(ngModel)]="userQuestion" rows="3"
            placeholder="e.g. Will my career grow this year? · When will I get married? · Should I start this business?">
          </textarea>
        </div>
        @if (orch.focusContext()['intent']) {
          <div class="focus-pill">
            <span class="focus-dot"></span>
            Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong>
            &nbsp;·&nbsp; {{ orch.focusContext()['confidence'] }} confidence
          </div>
        }
      </div>

    </aside>

    <!-- ── RIGHT PANEL ── -->
    <main class="panel right-panel">

      <div class="section-eyebrow">
        <span class="eyebrow-line"></span>
        <span class="eyebrow-text">Analysis Modules</span>
        <span class="eyebrow-line"></span>
      </div>

      <!-- Module grid -->
      <div class="module-grid">
        @for (m of allModules; track m.id) {
          <button class="mod-tile" [class.mod-on]="isSelected(m.id)" (click)="toggleModule(m.id)">
            <span class="mod-glyph">{{ m.glyph }}</span>
            <span class="mod-icon">{{ m.icon }}</span>
            <span class="mod-name">{{ m.label }}</span>
            <span class="mod-desc">{{ m.desc }}</span>
            @if (isSelected(m.id)) {
              <span class="mod-check">✓</span>
            }
          </button>
        }
      </div>

      <!-- Sub-inputs -->
      @if (isSelected('palmistry')) {
        <div class="sub-section">
          <div class="sub-header">
            <span class="sub-glyph">☽</span>
            <span class="sub-title">Palmistry Details</span>
            <span class="sub-badge">optional</span>
          </div>
          <div class="field-group">
            <div class="field">
              <label class="flabel">Hand Shape</label>
              <div class="input-wrap">
                <select class="finput fselect" [(ngModel)]="palmInput.hand_shape">
                  <option value="">— Select shape —</option>
                  @for (s of handShapes; track s) { <option [value]="s">{{ s }}</option> }
                </select>
              </div>
            </div>
            <div class="field">
              <label class="flabel">Left Hand Image</label>
              <div class="upload-btn" (click)="lRef.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event,'left')">
                <span class="upload-ico">📷</span>
                <span>{{ leftFileName() || 'Upload or drag here' }}</span>
                <input #lRef type="file" accept="image/*" (change)="onFile($event,'left')" style="display:none"/>
              </div>
            </div>
            <div class="field">
              <label class="flabel">Right Hand Image</label>
              <div class="upload-btn" (click)="rRef.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event,'right')">
                <span class="upload-ico">📷</span>
                <span>{{ rightFileName() || 'Upload or drag here' }}</span>
                <input #rRef type="file" accept="image/*" (change)="onFile($event,'right')" style="display:none"/>
              </div>
            </div>
          </div>
        </div>
      }

      @if (isSelected('tarot')) {
        <div class="sub-section">
          <div class="sub-header">
            <span class="sub-glyph">★</span>
            <span class="sub-title">Tarot Settings</span>
          </div>
          <div class="field-group">
            <div class="field" style="flex:2">
              <label class="flabel">Focus Question</label>
              <div class="input-wrap">
                <textarea class="finput fta" [(ngModel)]="tarotInput.question" rows="2"
                  placeholder="What should I focus on in my career this year?"></textarea>
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
        <div class="sub-section">
          <div class="sub-header">
            <span class="sub-glyph">⊕</span>
            <span class="sub-title">Vastu Details</span>
          </div>
          <div class="field-group">
            <div class="field">
              <label class="flabel">Property Type</label>
              <div class="input-wrap">
                <select class="finput fselect" [(ngModel)]="vastuInput.property_type">
                  <option value="">— Select —</option>
                  <option>Apartment / Flat</option><option>Independent House</option>
                  <option>Villa</option><option>Office / Commercial</option><option>Plot / Land</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label class="flabel">Main Entrance Facing</label>
              <div class="input-wrap">
                <select class="finput fselect" [(ngModel)]="vastuInput.facing_direction">
                  <option value="">— Select —</option>
                  @for (d of directions; track d) { <option>{{ d }}</option> }
                </select>
              </div>
            </div>
            <div class="field" style="flex:2">
              <label class="flabel">Floor Plan Notes</label>
              <div class="input-wrap">
                <textarea class="finput fta" [(ngModel)]="vastuInput.floor_plan_notes" rows="2"
                  placeholder="e.g. Kitchen in Southeast, master bedroom Southwest…"></textarea>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- ── CTA ── -->
      <div class="cta-zone">
        @if (launchError()) {
          <p class="launch-err">⚠ {{ launchError() }}</p>
        }
        <button class="cta-btn" [disabled]="orch.isRunning()" (click)="launch()">
          @if (orch.isRunning()) {
            <span class="cta-spinner"></span> Agents Running…
          } @else {
            <span class="cta-star">✦</span> Begin 360° Reading
          }
        </button>
        <p class="cta-sub">All selected agents run in sequence · 20–60 seconds</p>
      </div>

      <!-- ── Progress ── -->
      @if (orch.isRunning() || orch.isDone()) {
        <div class="progress-card">
          <div class="prog-header">
            <span class="prog-title">Agent Orchestration</span>
            <span class="prog-pct">{{ orch.progress() }}%</span>
          </div>
          <div class="prog-rail"><div class="prog-bar" [style.width.%]="orch.progress()"></div></div>
          <div class="step-list">
            @for (step of orch.steps(); track step.id) {
              <div class="step" [class.step-run]="step.status==='running'" [class.step-done]="step.status==='done'">
                <span class="step-dot" [class.dot-run]="step.status==='running'" [class.dot-done]="step.status==='done'" [class.dot-idle]="step.status==='idle'"></span>
                <span class="step-name">{{ step.label }}</span>
                @if (step.tradition) { <span class="step-trad">{{ step.tradition }}</span> }
                <span class="step-state">{{ step.status==='running'?'Processing…':step.status==='done'?'✓ Done':'Queued' }}</span>
              </div>
            }
          </div>
          @if (orch.backendError()) {
            <div class="alert-warn">⚠ {{ orch.backendError() }} — results computed locally.</div>
          }
          @if (orch.sessionId()) {
            <div class="alert-ok">
              🔑 Session <code>{{ orch.sessionId() }}</code> · LangGraph · Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong>
            </div>
          }
          @if (orch.isDone()) {
            <div class="done-banner">
              <span class="done-icon">✦</span>
              <span class="done-msg">Reading complete — proceed to Admin Review</span>
              <button class="done-cta" (click)="goReview()">Open Review →</button>
            </div>
          }
        </div>
      }

      <!-- ── Agent Flow Graph ── -->
      <div class="flow-section">
        <div class="flow-section-hdr">
          <span class="flow-section-title">Under the Hood</span>
          <span class="flow-section-sub">How your reading is generated</span>
        </div>
        <app-agent-flow></app-agent-flow>
      </div>

    </main>
  </div>

  <!-- ══ FOOTER ══ -->
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img src="rav-logo.png" class="footer-logo" alt="Aura with Rav"/>
        <div>
          <span class="footer-name">AURA with Rav</span>
          <span class="footer-tag">See life — as it is.</span>
        </div>
      </div>
      <div class="footer-links">
        <span>Vedic Astrology</span><span class="fd">·</span>
        <span>Numerology</span><span class="fd">·</span>
        <span>Palmistry</span><span class="fd">·</span>
        <span>Tarot</span><span class="fd">·</span>
        <span>Vastu</span>
      </div>
      <p class="footer-copy">© {{ year }} Aura with Rav &nbsp;·&nbsp; All readings are for guidance only &nbsp;·&nbsp; Powered by AI</p>
    </div>
  </footer>

</div>
  `,
  styles: [`
/* ════════════════════════════════════════════════════════════════
   AURA WITH RAV — White / Light theme  ·  Gold accents · Serif elegance
════════════════════════════════════════════════════════════════ */

:host {
  display: block; height: 100vh; overflow: hidden;
  background: #f7f4ee;
  font-family: Georgia, 'Times New Roman', serif;
  color: #2c2418;
}
* { box-sizing: border-box; margin: 0; padding: 0; }

.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; position: relative; }

/* ══ SUBTLE TEXTURE — very faint warm dots ══ */
.starfield { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.star { position: absolute; border-radius: 50%; background: rgba(212,175,55,0.35); }
.s1  { width:3px; height:3px; top:8%;  left:12%; opacity:.4; }
.s2  { width:2px; height:2px; top:15%; left:78%; opacity:.3; }
.s3  { width:4px; height:4px; top:22%; left:34%; opacity:.2; }
.s4  { width:2px; height:2px; top:35%; left:91%; opacity:.3; }
.s5  { width:3px; height:3px; top:45%; left:5%;  opacity:.25;}
.s6  { width:5px; height:5px; top:55%; left:62%; opacity:.15;}
.s7  { width:2px; height:2px; top:65%; left:28%; opacity:.3; }
.s8  { width:3px; height:3px; top:72%; left:85%; opacity:.2; }
.s9  { width:2px; height:2px; top:80%; left:48%; opacity:.25;}
.s10 { width:3px; height:3px; top:90%; left:18%; opacity:.2; }
.s11 { width:2px; height:2px; top:18%; left:55%; opacity:.35;}
.s12 { width:4px; height:4px; top:40%; left:40%; opacity:.15;}

/* ══ HEADER ══ */
.site-header {
  flex-shrink: 0; position: relative; z-index: 10;
  background: #ffffff;
  border-bottom: 1px solid rgba(212,175,55,0.3);
  box-shadow: 0 1px 12px rgba(180,140,20,0.08);
  padding: 0 28px;
}
.header-inner {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  height: 56px;
}

/* Brand */
.brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.brand-logo { width: 36px; height: 36px; object-fit: contain; }
.brand-text { display: flex; flex-direction: column; gap: 1px; }
.brand-name { font-size: 14px; font-weight: 700; color: #8a6a00; letter-spacing: 0.14em; text-transform: uppercase; line-height: 1; font-family: Georgia, serif; }
.brand-name em { font-style: normal; font-weight: 400; letter-spacing: 0.06em; color: #b8960c; }
.brand-tag { font-size: 9.5px; color: #b8960c; letter-spacing: 0.08em; font-style: italic; font-family: Georgia, serif; opacity: 0.7; }

/* Centre nav */
.header-nav {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; letter-spacing: 0.06em; font-family: Georgia, serif;
}
.nav-pill { color: #6b5a2e; transition: color 0.2s; cursor: default; }
.nav-pill:hover { color: #8a6a00; }
.nav-sep { color: rgba(180,140,20,0.3); }

/* Rav identity */
.header-rav { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.rav-avatar { width: 36px; height: 36px; object-fit: cover; object-position: top; border-radius: 50%; border: 2px solid rgba(212,175,55,0.5); box-shadow: 0 0 0 3px rgba(212,175,55,0.1); }
.rav-text { display: flex; flex-direction: column; gap: 1px; text-align: right; }
.rav-name { font-size: 12px; font-weight: 700; color: #8a6a00; font-family: Georgia, serif; letter-spacing: 0.03em; }
.rav-role { font-size: 9.5px; color: #9c8050; letter-spacing: 0.04em; }

/* ══ WORKSPACE ══ */
.workspace {
  flex: 1; overflow: hidden; position: relative; z-index: 1;
  display: grid; grid-template-columns: 390px 1fr;
}

/* ── PANELS ── */
.panel { overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.panel::-webkit-scrollbar { width: 3px; }
.panel::-webkit-scrollbar-thumb { background: rgba(180,140,20,0.2); border-radius: 99px; }

.left-panel  { background: #ffffff; border-right: 1px solid rgba(212,175,55,0.2); }
.right-panel { background: #f7f4ee; }

/* ── Section eyebrow ── */
.section-eyebrow { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.eyebrow-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(180,140,20,0.35), transparent); }
.eyebrow-text { font-size: 9.5px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #b8960c; white-space: nowrap; font-family: Georgia, serif; font-style: italic; }

/* ══ CARDS ══ */
.glass-card {
  background: #ffffff;
  border: 1px solid rgba(212,175,55,0.25);
  border-radius: 14px;
  box-shadow: 0 2px 16px rgba(180,140,20,0.07), 0 1px 3px rgba(0,0,0,0.04);
  padding: 18px; flex-shrink: 0;
}
.glass-card-header {
  display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px;
  padding-bottom: 12px; border-bottom: 1px solid rgba(212,175,55,0.15);
}
.card-glyph { width: 20px; height: 20px; color: #b8960c; flex-shrink: 0; margin-top: 2px; }
.card-title { font-size: 13px; font-weight: 700; color: #2c2418; letter-spacing: 0.02em; font-family: Georgia, serif; margin-bottom: 2px; }
.card-subtitle { font-size: 10.5px; color: #9c8050; font-style: italic; font-family: Georgia, serif; }

.question-glass {
  background: linear-gradient(135deg, #fffef8 0%, #ffffff 100%);
  border-color: rgba(212,175,55,0.35);
  box-shadow: 0 2px 16px rgba(212,175,55,0.1);
}

/* ── Question prompt ── */
.question-prompt { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 12px; }
.question-star { font-size: 18px; color: #d4af37; line-height: 1; flex-shrink: 0; margin-top: 1px; }
.question-hint { font-size: 12.5px; color: #4a3c20; line-height: 1.6; font-family: Georgia, serif; font-style: italic; }
.question-hint-sub { font-size: 10.5px; color: #9c8050; font-style: normal; }
.question-wrap { margin-top: 0; }

/* ── Focus pill ── */
.focus-pill {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 8px;
  font-size: 11px; color: #8a6a00; background: rgba(212,175,55,0.12);
  border: 1px solid rgba(212,175,55,0.3); border-radius: 99px; padding: 4px 12px;
  font-family: Georgia, serif;
}
.focus-dot { width: 6px; height: 6px; border-radius: 50%; background: #d4af37; animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* ══ FORM FIELDS ══ */
.fields { display: flex; flex-direction: column; gap: 11px; }
.field-group { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; }

.flabel { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #8a6a00; font-family: Georgia, serif; }
.req-dot { color: #b8960c; }
.fopt { font-size: 9px; color: #c0a060; text-transform: none; letter-spacing: 0; font-style: italic; margin-left: 4px; font-weight: 400; }

.input-wrap {
  position: relative;
  border: 1.5px solid rgba(180,140,20,0.25);
  border-radius: 8px;
  background: #fdfcf8;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.input-wrap:focus-within {
  border-color: rgba(180,140,20,0.65);
  box-shadow: 0 0 0 3px rgba(212,175,55,0.1);
  background: #ffffff;
}
.input-wrap.input-err { border-color: rgba(220,38,38,0.5); background: #fff8f8; }
.input-wrap.input-err:focus-within { box-shadow: 0 0 0 3px rgba(220,38,38,0.08); }

.input-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; height: 13px; color: #b8960c; pointer-events: none; opacity: 0.6; }

.finput {
  width: 100%; display: block;
  padding: 8px 11px; border: none; border-radius: 8px;
  font-size: 13px; color: #2c2418; background: transparent;
  outline: none; font-family: Georgia, serif; -webkit-appearance: none;
}
.finput::placeholder { color: #c4aa70; font-style: italic; }
.has-icon { padding-left: 28px; }
.fta { resize: none; min-height: 68px; line-height: 1.6; }
.fselect { cursor: pointer; }
.fselect option { background: #fff; color: #2c2418; }

input[type=date].finput, input[type=time].finput { color-scheme: light; }

.ferr { font-size: 10.5px; color: #dc2626; font-style: italic; margin-top: 2px; font-family: Georgia, serif; }

/* ══ MODULE GRID ══ */
.module-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; flex-shrink: 0; }
.mod-tile {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 14px 8px 12px; border-radius: 12px;
  border: 1.5px solid rgba(180,140,20,0.2);
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  cursor: pointer; transition: all 0.2s; text-align: center;
  font-family: Georgia, serif; color: #2c2418; overflow: hidden;
}
.mod-tile::before {
  content: ''; position: absolute; inset: 0; border-radius: 12px;
  background: radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.12) 0%, transparent 70%);
  opacity: 0; transition: opacity 0.2s;
}
.mod-tile:hover::before, .mod-on::before { opacity: 1 !important; }
.mod-tile:hover { border-color: rgba(180,140,20,0.5); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(180,140,20,0.12); }
.mod-on {
  border-color: #d4af37 !important;
  background: linear-gradient(160deg, #fffbee 0%, #fff9e0 100%) !important;
  box-shadow: 0 4px 16px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.8) !important;
}
.mod-glyph { font-size: 16px; color: #b8960c; line-height: 1; }
.mod-icon  { font-size: 20px; line-height: 1; }
.mod-name  { font-size: 10px; font-weight: 700; color: #8a6a00; letter-spacing: 0.04em; margin-top: 2px; }
.mod-desc  { font-size: 8.5px; color: #9c8050; line-height: 1.35; font-style: italic; }
.mod-check {
  position: absolute; top: 6px; right: 6px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #d4af37; color: #fff; font-size: 8px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
}

/* ══ SUB-SECTIONS ══ */
.sub-section {
  border: 1.5px solid rgba(180,140,20,0.18); border-radius: 12px;
  background: #ffffff; padding: 14px; flex-shrink: 0;
  box-shadow: 0 1px 6px rgba(0,0,0,0.04);
}
.sub-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
  padding-bottom: 8px; border-bottom: 1px solid rgba(180,140,20,0.12);
}
.sub-glyph { font-size: 14px; color: #b8960c; font-family: Georgia, serif; }
.sub-title { font-size: 11.5px; font-weight: 700; color: #2c2418; font-family: Georgia, serif; letter-spacing: 0.04em; }
.sub-badge { font-size: 9px; color: #9c8050; background: rgba(180,140,20,0.08); padding: 2px 7px; border-radius: 99px; font-style: italic; }

.upload-btn {
  display: flex; align-items: center; gap: 8px; padding: 8px 11px;
  border: 1.5px dashed rgba(180,140,20,0.3); border-radius: 8px;
  background: #fdfcf8; cursor: pointer; transition: all 0.15s;
  font-size: 11.5px; color: #9c8050; font-family: Georgia, serif; font-style: italic;
}
.upload-btn:hover { border-color: #d4af37; color: #8a6a00; background: #fffef5; }
.upload-ico { font-size: 14px; }

/* ── Segmented control ── */
.seg { display: flex; background: #f0ece0; border-radius: 7px; padding: 2px; border: 1px solid rgba(180,140,20,0.2); width: fit-content; margin-top: 4px; }
.seg-btn { padding: 5px 14px; border-radius: 5px; border: none; background: transparent; font-size: 11.5px; font-weight: 600; color: #9c8050; cursor: pointer; transition: all 0.14s; font-family: Georgia, serif; }
.seg-on { background: #d4af37; color: #ffffff; font-weight: 700; box-shadow: 0 1px 4px rgba(180,140,20,0.3); }

/* ══ CTA ZONE ══ */
.cta-zone { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 6px 0 2px; flex-shrink: 0; }
.launch-err { color: #dc2626; font-size: 11.5px; font-style: italic; font-family: Georgia, serif; }

.cta-btn {
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 14px 48px; border-radius: 99px;
  border: 1px solid rgba(180,140,20,0.4);
  background: linear-gradient(135deg, #8a6a00 0%, #d4af37 50%, #8a6a00 100%);
  background-size: 200% auto;
  color: #ffffff; font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: Georgia, serif; letter-spacing: 0.05em;
  box-shadow: 0 4px 20px rgba(180,140,20,0.35), 0 1px 0 rgba(255,255,255,0.15) inset;
  transition: all 0.3s; min-width: 220px;
}
.cta-btn::after {
  content: ''; position: absolute; inset: 0; border-radius: 99px;
  background: radial-gradient(ellipse at 50% -20%, rgba(255,255,255,0.3) 0%, transparent 60%);
  pointer-events: none;
}
.cta-btn:hover:not(:disabled) { background-position: right center; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(180,140,20,0.45); }
.cta-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.cta-star { font-size: 16px; }
.cta-sub { font-size: 10.5px; color: #9c8050; font-style: italic; font-family: Georgia, serif; }

.cta-spinner {
  display: inline-block; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ══ PROGRESS ══ */
.progress-card {
  border: 1.5px solid rgba(180,140,20,0.25); border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  padding: 16px; flex-shrink: 0;
}
.prog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.prog-title { font-size: 12px; font-weight: 700; color: #8a6a00; font-family: Georgia, serif; letter-spacing: 0.06em; }
.prog-pct { font-size: 11px; color: #b8960c; font-family: Georgia, serif; }
.prog-rail { height: 4px; background: #f0ece0; border-radius: 99px; overflow: hidden; margin-bottom: 14px; }
.prog-bar { height: 100%; background: linear-gradient(90deg, #8a6a00, #d4af37, #f0d060); border-radius: 99px; transition: width 0.4s ease; }

.step-list { display: flex; flex-direction: column; gap: 4px; }
.step { display: flex; align-items: center; gap: 8px; padding: 6px 9px; border-radius: 7px; font-size: 11.5px; background: #fafaf6; transition: background 0.2s; }
.step-run  { background: #fffbee; }
.step-done { background: #f0fdf4; }
.step-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.dot-idle { background: #d0c8a0; }
.dot-run  { background: #d4af37; animation: pulse 1.2s ease-in-out infinite; }
.dot-done { background: #16a34a; }
.step-name  { flex: 1; color: #4a3c20; font-family: Georgia, serif; }
.step-trad  { font-size: 9px; background: rgba(212,175,55,0.15); color: #8a6a00; padding: 1px 6px; border-radius: 99px; font-style: italic; }
.step-state { font-size: 10px; color: #9c8050; }

.alert-warn { margin-top: 10px; padding: 8px 12px; border-radius: 7px; background: #fffbeb; border: 1px solid rgba(180,140,20,0.3); font-size: 11px; color: #92400e; font-style: italic; font-family: Georgia, serif; }
.alert-ok   { margin-top: 6px; padding: 8px 12px; border-radius: 7px; background: #f0fdf4; border: 1px solid rgba(22,163,74,0.25); font-size: 11px; color: #15803d; font-family: Georgia, serif; }
.alert-ok code { font-family: monospace; background: rgba(22,163,74,0.1); padding: 1px 5px; border-radius: 3px; font-size: 10px; }

.done-banner { margin-top: 12px; padding: 14px; border-radius: 10px; background: linear-gradient(135deg, #fffbee 0%, #fff9e0 100%); border: 1px solid rgba(180,140,20,0.3); display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 8px rgba(180,140,20,0.1); }
.done-icon { font-size: 18px; color: #d4af37; }
.done-msg { flex: 1; font-size: 12px; color: #4a3c20; font-family: Georgia, serif; font-style: italic; }
.done-cta { padding: 8px 20px; border-radius: 99px; border: 1px solid rgba(180,140,20,0.4); background: #d4af37; color: #ffffff; font-size: 12px; font-weight: 700; cursor: pointer; font-family: Georgia, serif; white-space: nowrap; }
.done-cta:hover { background: #b8960c; }

/* ══ AGENT FLOW SECTION ══ */
.flow-section {
  margin-top: 18px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 16px rgba(180,140,20,0.07);
}
.flow-section-hdr {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 10px 16px 6px;
  background: #fff; border-bottom: 1px solid #e8e4dc;
}
.flow-section-title {
  font-size: 12px; font-weight: 700; color: #4a3c20; letter-spacing: 0.05em; font-family: Georgia, serif;
}
.flow-section-sub {
  font-size: 10px; color: #bbb; font-family: Georgia, serif; font-style: italic;
}

/* ══ FOOTER ══ */
.site-footer {
  flex-shrink: 0; position: relative; z-index: 10;
  background: #ffffff; border-top: 1px solid rgba(212,175,55,0.25);
  box-shadow: 0 -1px 8px rgba(180,140,20,0.06);
  padding: 8px 28px;
}
.footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.footer-brand { display: flex; align-items: center; gap: 8px; }
.footer-logo  { width: 22px; height: 22px; object-fit: contain; }
.footer-name  { font-size: 11px; font-weight: 700; color: #8a6a00; letter-spacing: 0.1em; font-family: Georgia, serif; display: block; }
.footer-tag   { font-size: 9.5px; color: #b8960c; font-style: italic; font-family: Georgia, serif; display: block; }
.footer-links { display: flex; align-items: center; gap: 6px; }
.footer-links span { font-size: 10.5px; color: #9c8050; font-family: Georgia, serif; }
.fd { color: rgba(180,140,20,0.3) !important; }
.footer-copy { font-size: 10px; color: #c0a878; font-family: Georgia, serif; font-style: italic; }

/* ══ RESPONSIVE ══ */
@media (max-width: 1024px) { .module-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px) {
  :host { height: auto; overflow: auto; }
  .shell { height: auto; overflow: visible; }
  .workspace { grid-template-columns: 1fr; overflow: visible; }
  .panel { height: auto; overflow: visible; }
  .left-panel { border-right: none; border-bottom: 1px solid rgba(212,175,55,0.2); }
  .header-nav { display: none; }
  .field-group { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .module-grid { grid-template-columns: repeat(2, 1fr); }
  .footer-inner { flex-direction: column; align-items: center; }
  .site-header { padding: 0 16px; }
  .panel { padding: 14px 14px; }
}
  `]
})
export class IntakePage {
  private router = inject(Router);
  readonly orch  = inject(OrchestratorService);

  readonly allModules = ALL_MODULES;
  readonly directions = DIRECTIONS;
  readonly spreads    = SPREADS;
  readonly handShapes = HAND_SHAPES;
  readonly year       = new Date().getFullYear();

  readonly selectedModules = signal<Set<Module>>(new Set(['astrology','numerology']));
  readonly launchError     = signal('');
  readonly leftFileName    = signal('');
  readonly rightFileName   = signal('');

  readonly profileSig = signal({
    full_name: '', alias_name: '', date_of_birth: '',
    time_of_birth: '', place_of_birth: '', pincode: ''
  });

  get profile() { return this.profileSig(); }
  patch(field: string, value: string) { this.profileSig.update(p => ({ ...p, [field]: value })); }

  userQuestion = '';
  palmInput: { hand_shape?: string } = {};
  tarotInput: { question?: string; spread?: '3-card'|'5-card' } = { spread: '3-card' };
  vastuInput: { property_type?: string; facing_direction?: string; floor_plan_notes?: string } = {};

  readonly touchedSig = signal<Record<string, boolean>>({});
  readonly todayStr   = new Date().toISOString().split('T')[0];
  readonly errors     = computed<FieldErrors>(() => validateProfile(this.profileSig()));

  touch(field: string) { this.touchedSig.update(t => ({ ...t, [field]: true })); }
  touchAll() {
    this.touchedSig.update(t => ({
      ...t, full_name: true, date_of_birth: true,
      time_of_birth: true, place_of_birth: true, pincode: true
    }));
  }

  isSelected(m: Module) { return this.selectedModules().has(m); }
  toggleModule(m: Module) {
    this.selectedModules.update(s => {
      const c = new Set(s); c.has(m) ? c.delete(m) : c.add(m); return c;
    });
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

  launch() {
    this.touchAll();
    const errs = validateProfile(this.profile);
    if (Object.keys(errs).length) {
      this.launchError.set('Please fix the highlighted errors in the Profile panel.');
      return;
    }
    if (!this.selectedModules().size) {
      this.launchError.set('Please select at least one analysis module.');
      return;
    }
    this.launchError.set('');
    const rawQ = this.userQuestion.trim();
    const input: SystemInput = {
      user_profile:     { ...this.profileSig() },
      user_question:    rawQ,
      questions:        rawQ ? [rawQ] : [],
      selected_modules: [...this.selectedModules()],
      module_inputs: {
        palmistry: this.isSelected('palmistry') ? { ...this.palmInput } : undefined,
        tarot:     this.isSelected('tarot')     ? { ...this.tarotInput } : undefined,
        vastu:     this.isSelected('vastu')     ? { ...this.vastuInput } : undefined,
      }
    };
    this.orch.run(input).then(() => {});
  }

  goReview() { this.router.navigate(['/review']); }
}
