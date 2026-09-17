import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent, ActiveTab } from './components/sidebar/sidebar.component';
import { WorkflowBuilderComponent } from './components/workflow-builder/workflow-builder.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LearningInsightsComponent } from './components/learning-insights/learning-insights.component';
import { AgenticAgentComponent } from './components/agentic-agent/agentic-agent.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    WorkflowBuilderComponent,
    DashboardComponent,
    LearningInsightsComponent,
    AgenticAgentComponent,
  ],
  template: `
    <div class="flex min-h-screen">
      <app-sidebar [activeTab]="activeTab" (tabChange)="activeTab = $event" />

      <main class="flex-1 overflow-y-auto">
        <!-- Top bar -->
        <header class="sticky top-0 z-10 border-b border-slate-200 px-6 py-3 flex items-center justify-between"
                style="background: rgba(255,255,255,0.78); backdrop-filter: saturate(180%) blur(20px);">
          <div class="flex items-center gap-2">
            <span class="text-slate-500 text-sm">Agentic Growth OS</span>
            <span class="text-slate-300">/</span>
            <span class="text-slate-900 text-sm font-semibold capitalize">{{ activeTab.replace('-', ' ') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="badge-green">LangGraph Powered</div>
            <div class="badge-purple">Auto-Learning ON</div>
          </div>
        </header>

        <!-- Content -->
        <div class="p-6">
          <app-workflow-builder   *ngIf="activeTab === 'workflow'" />
          <app-dashboard          *ngIf="activeTab === 'dashboard'" />
          <app-learning-insights  *ngIf="activeTab === 'learning'" />
        </div>
      </main>
    </div>
    <app-agentic-agent />
  `,
})
export class AppComponent {
  activeTab: ActiveTab = 'workflow';
}
