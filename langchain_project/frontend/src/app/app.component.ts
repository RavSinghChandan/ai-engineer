import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InputPanelComponent } from './components/input-panel/input-panel.component';
import { FlowDiagramComponent } from './components/flow-diagram/flow-diagram.component';
import { StepTimelineComponent } from './components/step-timeline/step-timeline.component';
import { CodePanelComponent } from './components/code-panel/code-panel.component';
import { JsonPanelComponent } from './components/json-panel/json-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    InputPanelComponent,
    FlowDiagramComponent,
    StepTimelineComponent,
    CodePanelComponent,
    JsonPanelComponent,
  ],
  template: `
    <div class="app-shell">

      <!-- TOP: brand bar -->
      <header class="top-bar">
        <div class="top-bar-inner">
          <div class="logo">
            <span class="logo-icon">⚡</span>
            <span class="logo-text">LangChain <span class="logo-accent">Execution Visualizer</span></span>
          </div>
          <div class="top-badges">
            <span class="badge badge-lc">LangChain</span>
            <span class="badge badge-fapi">FastAPI</span>
            <span class="badge badge-ng">Angular 21</span>
          </div>
        </div>
      </header>

      <!-- MAIN: three-column layout -->
      <main class="main-layout">

        <!-- LEFT: Input + Controls -->
        <aside class="left-col">
          <app-input-panel />
        </aside>

        <!-- RIGHT: Flow + Timeline + Code + JSON -->
        <section class="right-col">

          <!-- Row 1: flow diagram -->
          <div class="panel flow-panel">
            <app-flow-diagram />
          </div>

          <!-- Row 2: timeline + code side by side -->
          <div class="mid-row">
            <div class="panel timeline-panel">
              <app-step-timeline />
            </div>
            <div class="panel code-panel-host">
              <app-code-panel />
            </div>
          </div>

          <!-- Row 3: JSON accordion -->
          <div class="panel json-panel-host">
            <app-json-panel />
          </div>

        </section>
      </main>

    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #f5f5f7;
      font-family: 'Inter', system-ui, sans-serif;
    }

    /* Top bar */
    .top-bar {
      background: white;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      z-index: 10;
    }
    .top-bar-inner {
      max-width: 1600px;
      margin: 0 auto;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-icon { font-size: 18px; }
    .logo-text {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
    }
    .logo-accent { color: #6366f1; }
    .top-badges {
      display: flex;
      gap: 6px;
    }
    .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 99px;
    }
    .badge-lc  { background: #eef2ff; color: #6366f1; }
    .badge-fapi { background: #ecfdf5; color: #059669; }
    .badge-ng  { background: #fef2f2; color: #dc2626; }

    /* Main layout */
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
      padding: 16px;
      gap: 16px;
      max-width: 1600px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }

    /* Left col */
    .left-col {
      width: 300px;
      flex-shrink: 0;
      background: white;
      border-radius: 16px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
    }

    /* Right col */
    .right-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
      min-width: 0;
    }

    /* Generic panel */
    .panel {
      background: white;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
    }

    /* Flow panel */
    .flow-panel {
      flex-shrink: 0;
    }

    /* Mid row: timeline + code */
    .mid-row {
      flex: 1;
      display: flex;
      gap: 12px;
      overflow: hidden;
      min-height: 0;
    }
    .timeline-panel {
      width: 280px;
      flex-shrink: 0;
      overflow: hidden;
    }
    .code-panel-host {
      flex: 1;
      overflow: hidden;
      min-width: 0;
    }

    /* JSON panel */
    .json-panel-host {
      flex-shrink: 0;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .main-layout { flex-direction: column; overflow-y: auto; }
      .left-col { width: 100%; }
      .mid-row { flex-direction: column; }
      .timeline-panel { width: 100%; }
    }
  `]
})
export class AppComponent {}
