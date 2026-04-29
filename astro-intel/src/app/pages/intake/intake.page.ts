import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrchestratorService } from '../../services/orchestrator.service';
import { Module, SystemInput } from '../../models/astro.models';

const ALL_MODULES: { id: Module; label: string; icon: string; desc: string }[] = [
  { id: 'astrology', label: 'Vedic Astrology', icon: '🪐', desc: 'Lagna, planets, doshas, dasha & predictions' },
  { id: 'numerology', label: 'Numerology', icon: '🔢', desc: 'Indian · Chaldean · Pythagorean — 3 traditions' },
  { id: 'palmistry', label: 'Palmistry', icon: '✋', desc: 'Indian · Chinese · Western — 3 traditions' },
  { id: 'tarot', label: 'Tarot Reading', icon: '🃏', desc: '3-card or 5-card intuitive spread' },
  { id: 'vastu', label: 'Vastu Shastra', icon: '🏠', desc: 'Space energy, directions & corrections' },
];

const DIRECTIONS = ['North','Northeast','East','Southeast','South','Southwest','West','Northwest'];
const SPREADS    = ['3-card','5-card'];
const HAND_SHAPES = ['Square','Rectangular','Triangular','Mixed / Unknown'];

@Component({
  selector: 'app-intake',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="intake-shell">

      <!-- Header -->
      <header class="intake-header">
        <div class="brand">
          <span class="brand-star">✦</span>
          <span class="brand-name">AstroIntel <span class="brand-accent">360°</span></span>
        </div>
        <p class="brand-sub">Internal Admin Panel — 360° Spiritual Intelligence</p>
      </header>

      <div class="intake-body">

        <!-- STEP 1: User Profile -->
        <section class="card">
          <div class="card-head">
            <span class="step-badge">1</span>
            <div>
              <h2 class="card-title">User Profile</h2>
              <p class="card-sub">Enter the subject's personal details</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Full Name <span class="req">*</span></label>
              <input type="text" [(ngModel)]="profile.full_name" placeholder="e.g. Chandan Kumar" />
            </div>
            <div class="field">
              <label>Alias / Known As</label>
              <input type="text" [(ngModel)]="profile.alias_name" placeholder="e.g. Rav" />
            </div>
            <div class="field">
              <label>Date of Birth <span class="req">*</span></label>
              <input type="date" [(ngModel)]="profile.date_of_birth" />
            </div>
            <div class="field">
              <label>Time of Birth</label>
              <input type="time" [(ngModel)]="profile.time_of_birth" />
            </div>
            <div class="field field-wide">
              <label>Place of Birth <span class="req">*</span></label>
              <input type="text" [(ngModel)]="profile.place_of_birth" placeholder="e.g. Patna, Bihar, India" />
            </div>
            <div class="field">
              <label>Pincode</label>
              <input type="text" [(ngModel)]="profile.pincode" placeholder="e.g. 800001" maxlength="10" />
            </div>
          </div>
        </section>

        <!-- STEP 1b: User Question -->
        <section class="card question-card">
          <div class="card-head">
            <span class="step-badge q-badge">?</span>
            <div>
              <h2 class="card-title">User Question <span class="opt-tag">Optional but Important</span></h2>
              <p class="card-sub">All agents will align their insights to this specific question</p>
            </div>
          </div>
          <div class="field">
            <textarea [(ngModel)]="userQuestion" rows="3"
              placeholder="e.g. Will my career grow this year? / Should I invest in this business? / When will I get married?">
            </textarea>
            <div class="intent-row">
              @if (orch.focusContext()['intent']) {
                <span class="intent-chip">
                  🎯 Focus detected: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong>
                  ({{ orch.focusContext()['confidence'] }} confidence)
                </span>
              }
            </div>
          </div>
        </section>

        <!-- STEP 2: Module Selection -->
        <section class="card">
          <div class="card-head">
            <span class="step-badge">2</span>
            <div>
              <h2 class="card-title">Select Analysis Modules</h2>
              <p class="card-sub">Choose one or more spiritual systems to activate</p>
            </div>
          </div>
          <div class="module-grid">
            @for (m of allModules; track m.id) {
              <button class="module-card" [class.module-active]="isSelected(m.id)"
                      (click)="toggleModule(m.id)">
                <span class="mod-icon">{{ m.icon }}</span>
                <span class="mod-label">{{ m.label }}</span>
                <span class="mod-desc">{{ m.desc }}</span>
                @if (isSelected(m.id)) {
                  <span class="mod-check">✓</span>
                }
              </button>
            }
          </div>
        </section>

        <!-- STEP 3: Module-specific inputs -->
        @if (isSelected('palmistry')) {
          <section class="card">
            <div class="card-head">
              <span class="step-badge">3a</span>
              <div>
                <h2 class="card-title">Palmistry Input ✋</h2>
                <p class="card-sub">Optional details to improve accuracy</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Hand Shape</label>
                <select [(ngModel)]="palmInput.hand_shape">
                  <option value="">— Select —</option>
                  @for (s of handShapes; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
              <div class="field field-wide">
                <label>Upload Left Hand Image (optional)</label>
                <div class="upload-zone" (click)="leftFile.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event, 'left')">
                  <span class="upload-icon">📷</span>
                  <span class="upload-text">{{ leftFileName() || 'Click or drag to upload' }}</span>
                  <input #leftFile type="file" accept="image/*" (change)="onFile($event,'left')" style="display:none" />
                </div>
              </div>
              <div class="field field-wide">
                <label>Upload Right Hand Image (optional)</label>
                <div class="upload-zone" (click)="rightFile.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event,'right')">
                  <span class="upload-icon">📷</span>
                  <span class="upload-text">{{ rightFileName() || 'Click or drag to upload' }}</span>
                  <input #rightFile type="file" accept="image/*" (change)="onFile($event,'right')" style="display:none" />
                </div>
              </div>
            </div>
          </section>
        }

        @if (isSelected('tarot')) {
          <section class="card">
            <div class="card-head">
              <span class="step-badge">3b</span>
              <div>
                <h2 class="card-title">Tarot Input 🃏</h2>
                <p class="card-sub">Set the focus question and spread type</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field field-wide">
                <label>Question or Focus Area</label>
                <textarea [(ngModel)]="tarotInput.question" rows="2" placeholder="e.g. What should I focus on in my career this year?"></textarea>
              </div>
              <div class="field">
                <label>Spread Type</label>
                <div class="toggle-group">
                  @for (s of spreads; track s) {
                    <button class="tgl-btn" [class.tgl-active]="tarotInput.spread === s" (click)="setSpread(s)">{{ s }}</button>
                  }
                </div>
              </div>
            </div>
          </section>
        }

        @if (isSelected('vastu')) {
          <section class="card">
            <div class="card-head">
              <span class="step-badge">3c</span>
              <div>
                <h2 class="card-title">Vastu Input 🏠</h2>
                <p class="card-sub">Provide property details for spatial analysis</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Property Type</label>
                <select [(ngModel)]="vastuInput.property_type">
                  <option value="">— Select —</option>
                  <option>Apartment / Flat</option>
                  <option>Independent House</option>
                  <option>Villa</option>
                  <option>Office / Commercial</option>
                  <option>Plot / Land</option>
                </select>
              </div>
              <div class="field">
                <label>Main Entrance Facing Direction</label>
                <select [(ngModel)]="vastuInput.facing_direction">
                  <option value="">— Select —</option>
                  @for (d of directions; track d) {
                    <option>{{ d }}</option>
                  }
                </select>
              </div>
              <div class="field field-wide">
                <label>Floor Plan Notes (optional)</label>
                <textarea [(ngModel)]="vastuInput.floor_plan_notes" rows="2" placeholder="e.g. Kitchen in Southeast, master bedroom in Southwest…"></textarea>
              </div>
            </div>
          </section>
        }

        <!-- Launch button -->
        <div class="launch-bar">
          @if (validationError()) {
            <p class="error-msg">{{ validationError() }}</p>
          }
          <button class="launch-btn" [disabled]="orch.isRunning()" (click)="launch()">
            @if (orch.isRunning()) {
              <span class="spin">⟳</span> Agents Running…
            } @else {
              ✦ Run 360° Analysis
            }
          </button>
        </div>

        <!-- Agent Progress -->
        @if (orch.isRunning() || orch.isDone()) {
          <section class="card progress-card">
            <div class="card-head">
              <span class="step-badge">⚙</span>
              <div>
                <h2 class="card-title">Agent Orchestration</h2>
                <p class="card-sub">{{ orch.progress() }}% complete</p>
              </div>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar" [style.width.%]="orch.progress()"></div>
            </div>
            <div class="agent-steps">
              @for (step of orch.steps(); track step.id) {
                <div class="agent-row" [class.agent-running]="step.status === 'running'" [class.agent-done]="step.status === 'done'">
                  <span class="agent-dot" [class.dot-run]="step.status === 'running'" [class.dot-done]="step.status === 'done'" [class.dot-idle]="step.status === 'idle'"></span>
                  <span class="agent-label">{{ step.label }}</span>
                  @if (step.tradition) { <span class="trad-badge">{{ step.tradition }}</span> }
                  <span class="agent-status">{{ step.status === 'running' ? 'Processing…' : step.status === 'done' ? '✓ Done' : 'Queued' }}</span>
                </div>
              }
            </div>
            @if (orch.backendError()) {
              <div class="warn-bar">
                ⚠ {{ orch.backendError() }} — results computed locally.
              </div>
            }
            @if (orch.sessionId()) {
              <div class="session-bar">
                🔑 Session ID: <code>{{ orch.sessionId() }}</code>
                &nbsp;·&nbsp; Mode: <strong>LangGraph Backend</strong>
                &nbsp;·&nbsp; Focus: <strong>{{ orch.focusContext()['intent'] | titlecase }}</strong>
              </div>
            }
            @if (orch.isDone()) {
              <div class="done-bar">
                <span class="done-text">✦ Analysis complete — proceed to Admin Review</span>
                <button class="review-btn" (click)="goReview()">Open Admin Review →</button>
              </div>
            }
          </section>
        }

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f5f4f0; }

    /* ── Header ── */
    .intake-header {
      background: linear-gradient(135deg, #1a0533 0%, #2d1054 50%, #1a0533 100%);
      padding: 24px 40px; text-align: center;
    }
    .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4px; }
    .brand-star { color: #f5c842; font-size: 22px; }
    .brand-name { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; }
    .brand-accent { color: #f5c842; }
    .brand-sub { color: rgba(255,255,255,0.55); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0; }

    /* ── Body ── */
    .intake-body { max-width: 860px; margin: 0 auto; padding: 32px 20px 60px; display: flex; flex-direction: column; gap: 20px; }

    /* ── Card ── */
    .card { background: #ffffff; border-radius: 16px; border: 1px solid #e8e4dc; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
    .card-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 20px; }
    .step-badge { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #6b21a8, #9333ea); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; }
    .card-title { font-size: 16px; font-weight: 700; color: #1f1035; margin: 0 0 2px; }
    .card-sub   { font-size: 12px; color: #6b7280; margin: 0; }

    /* ── Question card ── */
    .question-card { border: 2px solid #e9d5ff; background: linear-gradient(135deg, #fdf4ff 0%, #fff 100%); }
    .q-badge { background: linear-gradient(135deg, #d97706, #f59e0b) !important; }
    .opt-tag { font-size: 10px; font-weight: 600; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 99px; margin-left: 8px; }
    .intent-row { margin-top: 8px; min-height: 20px; }
    .intent-chip { font-size: 11.5px; background: #ede9fe; color: #7c3aed; padding: 3px 12px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px; }

    /* ── Form ── */
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field-wide { grid-column: span 2; }
    label { font-size: 11.5px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; }
    .req { color: #9333ea; }
    input, select, textarea {
      padding: 9px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px;
      font-size: 13.5px; color: #1f1035; background: #fafafa;
      outline: none; transition: border-color 0.15s; font-family: inherit;
    }
    input:focus, select:focus, textarea:focus { border-color: #9333ea; background: #fff; }
    textarea { resize: vertical; }

    /* ── Module grid ── */
    .module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .module-card {
      position: relative; display: flex; flex-direction: column; align-items: center;
      gap: 6px; padding: 18px 12px; border-radius: 12px;
      border: 2px solid #e8e4dc; background: #fafaf8;
      cursor: pointer; transition: all 0.15s; text-align: center;
    }
    .module-card:hover { border-color: #c084fc; background: #fdf4ff; }
    .module-active { border-color: #9333ea !important; background: #fdf4ff !important; }
    .mod-icon  { font-size: 28px; line-height: 1; }
    .mod-label { font-size: 12px; font-weight: 700; color: #1f1035; }
    .mod-desc  { font-size: 9.5px; color: #9ca3af; line-height: 1.4; }
    .mod-check { position: absolute; top: 8px; right: 10px; width: 18px; height: 18px; border-radius: 50%; background: #9333ea; color: #fff; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; }

    /* ── Upload zone ── */
    .upload-zone {
      border: 2px dashed #d1d5db; border-radius: 8px; padding: 16px;
      display: flex; align-items: center; gap: 10px; cursor: pointer;
      transition: border-color 0.15s; background: #fafafa;
    }
    .upload-zone:hover { border-color: #9333ea; background: #fdf4ff; }
    .upload-icon { font-size: 20px; }
    .upload-text { font-size: 12.5px; color: #6b7280; }

    /* ── Toggle group ── */
    .toggle-group { display: flex; gap: 6px; }
    .tgl-btn { padding: 7px 18px; border-radius: 99px; border: 2px solid #e5e7eb; background: transparent; font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.12s; }
    .tgl-active { border-color: #9333ea; background: #9333ea; color: #fff; }

    /* ── Launch bar ── */
    .launch-bar { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .error-msg { color: #dc2626; font-size: 13px; margin: 0; }
    .launch-btn {
      padding: 14px 48px; border-radius: 99px; border: none;
      background: linear-gradient(135deg, #7c3aed, #9333ea);
      color: #ffffff; font-size: 15px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 20px rgba(147,51,234,0.35); transition: all 0.2s; letter-spacing: 0.02em;
    }
    .launch-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(147,51,234,0.45); }
    .launch-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .spin { display: inline-block; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Progress card ── */
    .progress-card { border: 2px solid #ede9fe; }
    .progress-bar-wrap { height: 6px; background: #f3f4f6; border-radius: 99px; margin-bottom: 16px; overflow: hidden; }
    .progress-bar { height: 100%; background: linear-gradient(90deg, #7c3aed, #c084fc); border-radius: 99px; transition: width 0.4s ease; }
    .agent-steps { display: flex; flex-direction: column; gap: 6px; }
    .agent-row {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px;
      border-radius: 8px; background: #fafafa; font-size: 12.5px;
    }
    .agent-running { background: #fdf4ff; }
    .agent-done    { background: #f0fdf4; }
    .agent-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-idle { background: #d1d5db; }
    .dot-run  { background: #9333ea; animation: pulse 1s ease-in-out infinite; }
    .dot-done { background: #22c55e; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .agent-label { flex: 1; color: #374151; font-weight: 500; }
    .trad-badge { font-size: 9.5px; background: #ede9fe; color: #7c3aed; padding: 1px 7px; border-radius: 99px; font-weight: 600; }
    .agent-status { font-size: 11px; color: #9ca3af; font-weight: 500; }

    .warn-bar {
      margin-top: 10px; padding: 10px 14px; border-radius: 8px;
      background: #fef3c7; border: 1px solid #fde68a;
      font-size: 11.5px; color: #92400e; line-height: 1.5;
    }
    .session-bar {
      margin-top: 8px; padding: 8px 14px; border-radius: 8px;
      background: #f0fdf4; border: 1px solid #bbf7d0;
      font-size: 11px; color: #15803d; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
    }
    .session-bar code { font-family: monospace; background: #dcfce7; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; }
    .done-bar {
      margin-top: 16px; padding: 14px; border-radius: 10px;
      background: linear-gradient(135deg, #fdf4ff, #ede9fe);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .done-text { font-size: 13px; font-weight: 600; color: #7c3aed; }
    .review-btn {
      padding: 9px 22px; border-radius: 99px; border: none;
      background: #7c3aed; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .review-btn:hover { background: #6d28d9; }

    @media (max-width: 600px) {
      .form-grid { grid-template-columns: 1fr; }
      .field-wide { grid-column: span 1; }
      .intake-header { padding: 20px; }
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

  readonly selectedModules = signal<Set<Module>>(new Set(['astrology','numerology']));
  readonly validationError = signal('');
  readonly leftFileName    = signal('');
  readonly rightFileName   = signal('');

  profile = {
    full_name: '', alias_name: '', date_of_birth: '',
    time_of_birth: '', place_of_birth: '', pincode: ''
  };

  userQuestion = '';

  palmInput: { hand_shape?: string; left_hand_image?: string; right_hand_image?: string } = {};
  tarotInput: { question?: string; spread?: '3-card' | '5-card' } = { spread: '3-card' };
  vastuInput: { property_type?: string; facing_direction?: string; floor_plan_notes?: string } = {};

  isSelected(m: Module): boolean { return this.selectedModules().has(m); }

  toggleModule(m: Module): void {
    this.selectedModules.update(s => {
      const copy = new Set(s);
      copy.has(m) ? copy.delete(m) : copy.add(m);
      return copy;
    });
  }

  onFile(event: Event, side: 'left' | 'right'): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (side === 'left')  this.leftFileName.set(file.name);
    if (side === 'right') this.rightFileName.set(file.name);
  }

  onDrop(event: DragEvent, side: 'left' | 'right'): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (side === 'left')  this.leftFileName.set(file.name);
    if (side === 'right') this.rightFileName.set(file.name);
  }

  setSpread(s: string): void {
    this.tarotInput.spread = s as '3-card' | '5-card';
  }

  launch(): void {
    if (!this.profile.full_name.trim()) { this.validationError.set('Full Name is required.'); return; }
    if (!this.profile.date_of_birth)   { this.validationError.set('Date of Birth is required.'); return; }
    if (!this.profile.place_of_birth.trim()) { this.validationError.set('Place of Birth is required.'); return; }
    const mods = this.selectedModules();
    if (!mods.size) { this.validationError.set('Please select at least one module.'); return; }
    this.validationError.set('');

    const input: SystemInput = {
      user_profile: { ...this.profile },
      selected_modules: [...mods],
      module_inputs: {
        palmistry: this.isSelected('palmistry') ? { ...this.palmInput } : undefined,
        tarot:     this.isSelected('tarot')     ? { ...this.tarotInput } : undefined,
        vastu:     this.isSelected('vastu')     ? { ...this.vastuInput } : undefined,
      }
    };
    // attach user question (cast via any since model doesn't declare it at type level)
    (input as any)['user_question'] = this.userQuestion.trim();

    this.orch.run(input).then(() => {});
  }

  goReview(): void { this.router.navigate(['/review']); }
}
