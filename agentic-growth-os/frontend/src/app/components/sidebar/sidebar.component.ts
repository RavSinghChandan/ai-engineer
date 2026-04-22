import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ActiveTab = 'workflow' | 'dashboard' | 'learning';

interface NavItem { id: ActiveTab; label: string; icon: string; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="w-64 flex-shrink-0 flex flex-col bg-gray-900/60 border-r border-white/5 h-screen sticky top-0">
      <!-- Logo -->
      <div class="p-6 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-900/50 text-xl">
            ⚡
          </div>
          <div>
            <div class="font-bold text-white text-sm leading-none">Agentic Growth</div>
            <div class="text-xs text-indigo-400 font-medium mt-0.5">OS — LangGraph</div>
          </div>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 p-4 space-y-1">
        <div class="label-text px-3 mb-3">Navigation</div>
        <button *ngFor="let item of navItems"
          (click)="onTabClick(item.id)"
          [class]="activeTab === item.id ? 'nav-item-active' : 'nav-item-inactive'">
          <span class="text-lg w-5 text-center">{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </nav>

      <!-- Platform Tags -->
      <div class="px-4 pb-2">
        <div class="label-text px-1 mb-2">Simulated Platforms</div>
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span class="text-sm">🔵</span>
            <span class="text-xs text-blue-400 font-medium">Google Ads</span>
          </div>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <span class="text-sm">🟣</span>
            <span class="text-xs text-indigo-400 font-medium">Meta Ads</span>
          </div>
        </div>
      </div>

      <!-- AI Status -->
      <div class="p-4 border-t border-white/5">
        <div class="glass-card p-3">
          <div class="flex items-center gap-2 mb-1.5">
            <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span class="text-xs font-semibold text-emerald-400">LangGraph Engine Active</span>
          </div>
          <div class="text-xs text-gray-500">5 agent nodes ready</div>
          <div class="text-xs text-gray-500">Auto-learning: ON</div>
        </div>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  @Input() activeTab: ActiveTab = 'workflow';
  @Output() tabChange = new EventEmitter<ActiveTab>();

  navItems: NavItem[] = [
    { id: 'workflow',  label: 'Workflow Builder',    icon: '🔀' },
    { id: 'dashboard', label: 'Campaign Dashboard',  icon: '📈' },
    { id: 'learning',  label: 'Learning Insights',   icon: '🧠' },
  ];

  onTabClick(id: ActiveTab): void { this.tabChange.emit(id); }
}
