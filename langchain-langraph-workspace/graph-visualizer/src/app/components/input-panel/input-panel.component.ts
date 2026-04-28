import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExecutionEngineService } from '../../services/execution-engine.service';
import { EndpointDef } from '../../models/visualizer.models';

@Component({
  selector: 'gv-input-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="input-panel">

      <!-- Brand section -->
      <div class="brand-section">
        <div class="brand-row">
          <!-- Logo: crop to show only the brain icon part -->
          <div class="brand-logo-wrap">
            <img class="brand-logo-img" src="assets/logo.png" alt="logo">
          </div>
          <div class="brand-info">
            <div class="brand-name">
              AI with Rav
              <span [style.color]="accentColor()">{{ eng.adapter()?.accentWord }}</span>
            </div>
            <div class="brand-sub">{{ eng.adapter()?.productTagline }}</div>
          </div>
          <div class="status-indicator"
               [class.si-active]="eng.isRunning()"
               [class.si-done]="eng.isComplete() && !eng.isRunning()"
               [title]="eng.isRunning() ? 'Running' : eng.isComplete() ? 'Done' : 'Idle'">
            <span class="si-dot"></span>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Endpoint selector — Change 5: beautiful dynamic tag -->
      <div class="section ep-section">
        <label class="section-label">SELECT API ENDPOINT</label>

        <div class="ep-trigger"
             [class.ep-open]="dropOpen"
             [class.ep-disabled]="eng.isRunning()"
             [style.border-color]="dropOpen ? accentColor() : ''"
             [style.box-shadow]="dropOpen ? '0 0 0 3px ' + accentColor() + '15' : ''"
             (click)="!eng.isRunning() && toggleDrop()">
          <div class="ep-icon-circle" [style.background]="selected().color + '15'">
            <span class="ep-emoji">{{ selected().emoji }}</span>
          </div>
          <div class="ep-body">
            <div class="ep-name-row">
              <span class="ep-name" [style.color]="selected().color">{{ selected().label }}</span>
              <span class="ep-method-pill" [class]="'v-' + selected().method.toLowerCase()">
                {{ selected().method }}
              </span>
            </div>
            <span class="ep-path-row">
              <span class="ep-path-label">endpoint</span>
              <span class="ep-path-val">{{ selected().path }}</span>
            </span>
          </div>
          <svg class="caret" [class.caret-open]="dropOpen" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Dropdown -->
        @if (dropOpen) {
          <div class="ep-dropdown">
            @for (ep of endpoints(); track ep.id) {
              <div class="ep-option"
                   [class.ep-opt-active]="ep.id === selectedId()"
                   (click)="pickEndpoint(ep.id)">
                <span class="ep-opt-icon" [style.background]="ep.color + '15'">{{ ep.emoji }}</span>
                <div class="ep-opt-body">
                  <div class="ep-opt-name-row">
                    <span class="ep-opt-name" [style.color]="ep.id === selectedId() ? ep.color : '#374151'">{{ ep.label }}</span>
                    <span class="ep-opt-pill" [class]="'v-' + ep.method.toLowerCase()">{{ ep.method }}</span>
                  </div>
                  <span class="ep-opt-path">{{ ep.path }}</span>
                </div>
                @if (ep.id === selectedId()) {
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L5 9.5L10 3" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                }
              </div>
            }
          </div>
        }

        <!-- Tagline card -->
        <div class="ep-tagline-card" [style.border-left-color]="accentColor()">
          <span class="ep-tagline-text">{{ selected().tagline }}</span>
        </div>
      </div>

      <!-- Dynamic form fields -->
      @for (field of selected().fields; track field.name) {
        <div class="section">
          <label class="section-label">{{ field.label }}</label>

          @if (field.type === 'select') {
            <select class="form-input" [(ngModel)]="formValues[selectedId()][field.name]">
              @for (opt of field.options ?? []; track opt) {
                <option [value]="opt">{{ opt }}</option>
              }
            </select>

          } @else if (field.type === 'textarea') {
            <textarea class="form-input form-textarea" rows="3"
                      [placeholder]="field.placeholder ?? ''"
                      [(ngModel)]="formValues[selectedId()][field.name]">
            </textarea>

          } @else if (field.type === 'number') {
            <input class="form-input" type="number"
                   [placeholder]="field.placeholder ?? ''"
                   [(ngModel)]="formValues[selectedId()][field.name]">

          } @else if (field.type === 'toggle') {
            <label class="toggle-row">
              <span class="toggle-track" [class.toggle-on]="formValues[selectedId()][field.name]"
                    [style.--ton]="accentColor()">
                <span class="toggle-thumb"></span>
              </span>
              <input type="checkbox" class="toggle-hidden"
                     [(ngModel)]="formValues[selectedId()][field.name]">
              <span class="toggle-hint"
                    [style.color]="formValues[selectedId()][field.name] ? accentColor() : '#9ca3af'">
                {{ formValues[selectedId()][field.name] ? 'Enabled' : 'Disabled' }}
              </span>
            </label>

          } @else if (field.type === 'file') {
            <!-- Change 4: Beautiful file upload -->
            <div class="file-upload-zone"
                 [class.file-has]="fileNames[selectedId() + '_' + field.name]"
                 (click)="fileInput.click()"
                 (dragover)="$event.preventDefault()"
                 (drop)="onFileDrop($event, field.name)">
              <input #fileInput type="file" class="file-hidden"
                     [accept]="field.accept ?? '*'"
                     (change)="onFileChange($event, field.name)">
              @if (fileNames[selectedId() + '_' + field.name]) {
                <div class="file-selected">
                  <div class="file-icon-done">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 5" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <div class="file-info">
                    <span class="file-name">{{ fileNames[selectedId() + '_' + field.name] }}</span>
                    <span class="file-ready">Ready to upload</span>
                  </div>
                  <button class="file-clear" (click)="clearFile($event, field.name)">✕</button>
                </div>
              } @else {
                <div class="file-placeholder">
                  <div class="file-upload-icon" [style.color]="accentColor()">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <span class="file-up-label">Click or drag &amp; drop</span>
                  <span class="file-up-hint">{{ field.placeholder ?? 'PDF, DOCX, TXT supported' }}</span>
                </div>
              }
            </div>

          } @else {
            <input class="form-input" type="text"
                   [placeholder]="field.placeholder ?? ''"
                   [(ngModel)]="formValues[selectedId()][field.name]">
          }
        </div>
      }

      <div class="actions">
        <!-- Run button -->
        <button class="run-btn"
                [style.background]="eng.isRunning() ? '#9ca3af' : ('linear-gradient(135deg,' + accentColor() + ',' + accentColor() + 'cc)')"
                [style.box-shadow]="eng.isRunning() ? 'none' : '0 4px 14px ' + accentColor() + '44'"
                [disabled]="eng.isRunning()"
                (click)="runFlow()">
          @if (eng.isRunning()) {
            <span class="btn-spinner"></span>
            <span>Running…</span>
          } @else {
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 2.5L11 6.5L3 10.5V2.5Z" fill="white"/>
            </svg>
            <span>Run AI Flow</span>
          }
        </button>

        <!-- Secondary controls -->
        <div class="btn-row">
          <button class="sec-btn"
                  [disabled]="!eng.isRunning() || eng.isComplete()"
                  (click)="eng.nextStep()">
            Next Step
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5H8M5.5 2.5L8 5L5.5 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="sec-btn sec-btn-auto"
                  [class.sec-btn-stop]="eng.autoPlaying()"
                  [disabled]="!eng.isRunning() || eng.isComplete()"
                  [style.border-color]="eng.autoPlaying() ? '#ef4444' : accentColor()"
                  [style.color]="eng.autoPlaying() ? '#ef4444' : accentColor()"
                  (click)="eng.toggleAutoPlay()">
            @if (eng.autoPlaying()) { ⏹ Stop } @else { ▷ Auto Play }
          </button>
        </div>

        <button class="reset-btn" (click)="eng.reset()">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M9.5 5.5A4 4 0 1 1 5.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M9.5 1.5V5.5H5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Reset
        </button>
      </div>

      <!-- Status / Response -->
      @if (eng.isComplete() && eng.apiResponse()) {
        <div class="status-card" [class.status-error]="eng.apiResponse()!['error']">
          <div class="sc-header">
            @if (!eng.apiResponse()!['error']) {
              <span class="sc-dot sc-dot-green"></span>
              <span class="sc-title">Response Ready</span>
            } @else {
              <span class="sc-dot sc-dot-red"></span>
              <span class="sc-title sc-err">Error</span>
            }
            <span class="sc-ep">{{ selected().method }} {{ selected().path }}</span>
          </div>
          @if (eng.apiResponse()!['answer']) {
            <p class="sc-body">{{ eng.apiResponse()!['answer'] }}</p>
          } @else if (eng.apiResponse()!['decision']) {
            <p class="sc-body">Decision: <strong>{{ eng.apiResponse()!['decision'] | uppercase }}</strong></p>
          } @else if (eng.apiResponse()!['verdict']) {
            <p class="sc-body">Verdict: <strong>{{ eng.apiResponse()!['verdict'] | uppercase }}</strong></p>
          } @else if (eng.apiResponse()!['message']) {
            <p class="sc-body">{{ eng.apiResponse()!['message'] }}</p>
          }
        </div>
      } @else if (eng.isRunning()) {
        <div class="status-running" [style.border-color]="accentColor() + '22'"
             [style.background]="accentColor() + '08'">
          <span class="sr-spinner" [style.border-top-color]="accentColor()"></span>
          <span class="sr-text" [style.color]="accentColor()">Executing flow…</span>
        </div>
      }

    </div>
  `,
  styles: [`
    .input-panel {
      display: flex; flex-direction: column; gap: 0;
      padding: 0; height: 100%; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
      box-sizing: border-box;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }
    .input-panel::-webkit-scrollbar { width: 4px; }
    .input-panel::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }

    /* Brand */
    .brand-section { padding: 12px 14px 10px; }
    .brand-row { display: flex; align-items: center; gap: 10px; }

    /* Logo: clip to just the brain icon (left ~38% of the wide PNG) */
    .brand-logo-wrap {
      width: 38px; height: 38px; border-radius: 10px;
      overflow: hidden; flex-shrink: 0;
      border: 1px solid #f0f0f5;
    }
    .brand-logo-img {
      width: 100px; height: 38px;
      object-fit: cover; object-position: left center;
      display: block;
    }

    .brand-info { flex: 1; min-width: 0; }
    .brand-name {
      font-size: 12.5px; font-weight: 800; color: #111827;
      letter-spacing: -0.02em; line-height: 1.3; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .brand-sub { font-size: 9px; color: #9ca3af; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .status-indicator {
      width: 24px; height: 24px; border-radius: 50%;
      background: #f3f4f6; border: 1px solid #e5e7eb;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: all 0.3s;
    }
    .si-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #d1d5db; transition: background 0.3s;
    }
    .si-active .si-dot {
      background: #22c55e;
      box-shadow: 0 0 0 2px rgba(34,197,94,0.25);
      animation: blink 1.4s ease-in-out infinite;
    }
    .si-done .si-dot { background: #22c55e; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.35} }

    .divider { height: 1px; background: #f0f2f8; flex-shrink: 0; }
    .section { padding: 10px 16px; display: flex; flex-direction: column; gap: 6px; }
    .ep-section { gap: 8px; }
    .section-label {
      font-size: 9.5px; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.1em;
    }

    /* ── Endpoint trigger (Change 5: beautiful) ── */
    .ep-trigger {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border: 1.5px solid #e8eaf0; border-radius: 12px;
      background: #fff; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .ep-trigger:hover:not(.ep-disabled) { border-color: #c7d2fe; box-shadow: 0 2px 8px rgba(99,102,241,0.06); }
    .ep-disabled { opacity: 0.55; cursor: not-allowed; }

    .ep-icon-circle {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .ep-emoji { font-size: 16px; line-height: 1; }

    .ep-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .ep-name-row { display: flex; align-items: center; gap: 6px; }
    .ep-name {
      font-size: 12px; font-weight: 700; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .ep-method-pill {
      font-size: 8px; font-weight: 800; padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
    }
    .ep-path-row { display: flex; align-items: center; gap: 5px; }
    .ep-path-label {
      font-size: 8.5px; color: #c4c9d6; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .ep-path-val {
      font-size: 9.5px; color: #6b7280;
      font-family: 'JetBrains Mono', monospace; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .caret { color: #9ca3af; flex-shrink: 0; transition: transform 0.2s; }
    .caret-open { transform: rotate(180deg); }

    /* Verb pills */
    .v-get    { background: #dcfce7; color: #15803d; }
    .v-post   { background: #ede9fe; color: #6d28d9; }
    .v-delete { background: #fee2e2; color: #dc2626; }
    .v-put    { background: #fef3c7; color: #b45309; }

    /* Dropdown */
    .ep-dropdown {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.1);
      overflow: hidden; max-height: 260px; overflow-y: auto;
      scrollbar-width: thin;
    }
    .ep-option {
      display: flex; align-items: center; gap: 9px;
      padding: 9px 12px; cursor: pointer; transition: background 0.12s;
    }
    .ep-option:hover { background: #f9fafb; }
    .ep-opt-active { background: #f5f3ff !important; }
    .ep-opt-icon {
      width: 30px; height: 30px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; flex-shrink: 0;
    }
    .ep-opt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .ep-opt-name-row { display: flex; align-items: center; gap: 5px; }
    .ep-opt-name { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ep-opt-pill { font-size: 7.5px; font-weight: 800; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
    .ep-opt-path { font-size: 9px; color: #9ca3af; font-family: 'JetBrains Mono', monospace; }

    /* Tagline card */
    .ep-tagline-card {
      padding: 7px 10px;
      border-left: 3px solid;
      background: #fafbff; border-radius: 0 6px 6px 0;
    }
    .ep-tagline-text { font-size: 10px; color: #6b7280; line-height: 1.5; }

    /* Toggle */
    .toggle-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .toggle-hidden { display: none; }
    .toggle-track {
      width: 36px; height: 20px; border-radius: 99px;
      background: #e5e7eb; border: 1.5px solid #d1d5db;
      position: relative; flex-shrink: 0; transition: background 0.2s, border-color 0.2s;
    }
    .toggle-on { background: var(--ton, #6366f1); border-color: var(--ton, #6366f1); }
    .toggle-thumb {
      position: absolute; top: 2px; left: 2px;
      width: 14px; height: 14px; border-radius: 50%;
      background: white; transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.18);
    }
    .toggle-on .toggle-thumb { transform: translateX(16px); }
    .toggle-hint { font-size: 11px; font-weight: 600; }

    /* File upload (Change 4) */
    .file-upload-zone {
      border: 2px dashed #e5e7eb; border-radius: 12px;
      background: #fafbff; cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      overflow: hidden;
    }
    .file-upload-zone:hover { border-color: #c7d2fe; background: #f5f3ff; }
    .file-has { border-style: solid; border-color: #bbf7d0; background: #f0fdf4; }
    .file-hidden { display: none; }

    .file-placeholder {
      display: flex; flex-direction: column; align-items: center;
      padding: 18px 12px; gap: 5px;
    }
    .file-upload-icon { line-height: 0; }
    .file-up-label { font-size: 11px; font-weight: 600; color: #374151; }
    .file-up-hint { font-size: 10px; color: #9ca3af; text-align: center; }

    .file-selected {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    }
    .file-icon-done {
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(34,197,94,0.12); display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .file-name { font-size: 11px; font-weight: 600; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-ready { font-size: 9px; color: #22c55e; font-weight: 600; }
    .file-clear {
      width: 22px; height: 22px; border-radius: 50%; border: none;
      background: #f3f4f6; color: #9ca3af; font-size: 10px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s, color 0.15s;
    }
    .file-clear:hover { background: #fee2e2; color: #ef4444; }

    /* Form inputs */
    .form-input {
      width: 100%; padding: 8px 10px;
      border: 1.5px solid #e5e7eb; border-radius: 8px;
      font-size: 12px; color: #111827; background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box; font-family: inherit;
    }
    .form-input:focus {
      outline: none; border-color: #a5b4fc;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
    }
    .form-textarea { resize: vertical; }

    /* Actions */
    .actions { padding: 4px 16px 12px; display: flex; flex-direction: column; gap: 7px; }
    .run-btn {
      width: 100%; padding: 11px 16px;
      border: none; border-radius: 10px;
      color: white; font-size: 12px; font-weight: 700;
      cursor: pointer; transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 7px;
      letter-spacing: 0.01em;
    }
    .run-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    .run-btn:active:not(:disabled) { transform: translateY(0); }
    .run-btn:disabled { cursor: not-allowed; }
    .btn-spinner {
      width: 12px; height: 12px;
      border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .btn-row { display: flex; gap: 6px; }
    .sec-btn {
      flex: 1; padding: 7px 6px;
      border-radius: 8px; border: 1.5px solid #e5e7eb;
      background: #fff; font-size: 10.5px; font-weight: 600; color: #374151;
      cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 4px;
    }
    .sec-btn:hover:not(:disabled) { border-color: #a5b4fc; color: #6366f1; }
    .sec-btn:disabled { opacity: 0.38; cursor: not-allowed; }
    .sec-btn-stop { color: #ef4444 !important; }

    .reset-btn {
      width: 100%; padding: 7px;
      border-radius: 8px; border: 1.5px solid #fde8e8;
      background: #fff9f9; font-size: 11px; font-weight: 600; color: #dc2626;
      cursor: pointer; transition: background 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 5px;
    }
    .reset-btn:hover { background: #fee2e2; }

    /* Status cards */
    .status-card {
      margin: 0 16px 12px;
      border-radius: 10px; padding: 10px 12px;
      background: #f0fdf4; border: 1px solid rgba(34,197,94,0.2);
    }
    .status-error { background: #fef2f2; border-color: rgba(239,68,68,0.2); }
    .sc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .sc-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .sc-dot-green { background: #22c55e; }
    .sc-dot-red   { background: #ef4444; }
    .sc-title { font-size: 11px; font-weight: 700; color: #15803d; }
    .sc-err   { color: #dc2626; }
    .sc-ep { font-size: 9px; color: #9ca3af; margin-left: auto; font-family: 'JetBrains Mono', monospace; }
    .sc-body { font-size: 11px; color: #374151; line-height: 1.5; margin: 0; }

    .status-running {
      margin: 0 16px 12px;
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 8px; border: 1px solid;
    }
    .sr-spinner {
      width: 10px; height: 10px; flex-shrink: 0;
      border: 2px solid rgba(0,0,0,0.1);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    .sr-text { font-size: 11px; font-weight: 600; }
  `]
})
export class InputPanelComponent implements OnInit {
  readonly eng = inject(ExecutionEngineService);

  readonly selectedId = signal<string>('');
  readonly endpoints  = this.eng.endpoints$;
  dropOpen = false;
  formValues: Record<string, Record<string, any>> = {};
  fileNames: Record<string, string> = {};  // key: `${endpointId}_${fieldName}`

  constructor() {
    effect(() => {
      const eps = this.endpoints();
      if (!eps.length) return;
      // Reset on adapter switch
      this.formValues = {};
      this.fileNames  = {};
      this.selectedId.set(eps[0].id);
      eps.forEach(ep => {
        this.formValues[ep.id] = {};
        ep.fields.forEach(f => { this.formValues[ep.id][f.name] = f.default ?? ''; });
      });
    });
  }

  ngOnInit(): void {}

  selected(): EndpointDef {
    const eps = this.endpoints();
    return eps.find(e => e.id === this.selectedId()) ?? eps[0];
  }

  accentColor(): string { return this.eng.adapter()?.accentColor ?? '#6366f1'; }

  toggleDrop(): void { this.dropOpen = !this.dropOpen; }

  pickEndpoint(id: string): void {
    this.selectedId.set(id);
    this.eng.selectEndpoint(id);
    this.dropOpen = false;
    if (!this.formValues[id]) {
      this.formValues[id] = {};
      this.eng.getEndpoint(id)?.fields.forEach(f => {
        this.formValues[id][f.name] = f.default ?? '';
      });
    }
  }

  runFlow(): void {
    if (this.eng.isRunning()) return;
    this.eng.startFlow(this.selectedId(), this.formValues[this.selectedId()] ?? {});
  }

  onFileChange(event: Event, fieldName: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const key = `${this.selectedId()}_${fieldName}`;
      this.fileNames[key] = file.name;
      this.formValues[this.selectedId()][fieldName] = file;
    }
  }

  onFileDrop(event: DragEvent, fieldName: string): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      const key = `${this.selectedId()}_${fieldName}`;
      this.fileNames[key] = file.name;
      this.formValues[this.selectedId()][fieldName] = file;
    }
  }

  clearFile(event: Event, fieldName: string): void {
    event.stopPropagation();
    const key = `${this.selectedId()}_${fieldName}`;
    delete this.fileNames[key];
    this.formValues[this.selectedId()][fieldName] = '';
  }
}
