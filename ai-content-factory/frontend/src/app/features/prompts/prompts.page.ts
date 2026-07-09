import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Prompt } from '../../core/models';

@Component({
  selector: 'acf-prompts-page',
  imports: [FormsModule],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 class="text-2xl font-bold text-white">Agent Prompts</h1>
        <p class="text-sm text-slate-400">
          Every agent's prompt is stored in the database and versioned — saving creates a new active version.
        </p>
      </header>

      <div class="grid gap-6 lg:grid-cols-[240px,1fr]">
        <nav class="card space-y-1 self-start">
          @for (prompt of activePrompts(); track prompt.agent_name) {
            <button
              class="w-full rounded-lg px-3 py-2 text-left text-sm transition"
              [class]="
                selected()?.agent_name === prompt.agent_name
                  ? 'bg-sky-500/10 font-semibold text-sky-400'
                  : 'text-slate-300 hover:bg-slate-800'
              "
              (click)="select(prompt)"
            >
              {{ prompt.agent_name }}
              <span class="float-right text-xs text-slate-500">v{{ prompt.version }}</span>
            </button>
          }
        </nav>

        @if (selected(); as prompt) {
          <form class="card space-y-4" (ngSubmit)="save()">
            <div>
              <label class="label" for="system">System prompt</label>
              <textarea id="system" class="input font-mono" rows="6" [(ngModel)]="systemPrompt" name="system"></textarea>
            </div>
            <div>
              <label class="label" for="template">User template</label>
              <textarea id="template" class="input font-mono" rows="10" [(ngModel)]="userTemplate" name="template"></textarea>
              <p class="mt-1 text-xs text-slate-500">
                Placeholders like {{ '{' }}topic{{ '}' }} are filled from pipeline state at runtime.
              </p>
            </div>
            <div>
              <label class="label" for="notes">Change notes</label>
              <input id="notes" class="input" [(ngModel)]="notes" name="notes" placeholder="What changed and why" />
            </div>
            <div class="flex items-center gap-3">
              <button class="btn-primary" type="submit" [disabled]="busy()">
                {{ busy() ? 'Saving…' : 'Save as v' + (prompt.version + 1) }}
              </button>
              @if (saved()) { <span class="text-sm text-emerald-400">Saved ✓</span> }
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class PromptsPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly prompts = signal<Prompt[]>([]);
  readonly selected = signal<Prompt | null>(null);
  readonly busy = signal(false);
  readonly saved = signal(false);

  readonly activePrompts = computed(() => this.prompts().filter((p) => p.is_active));

  systemPrompt = '';
  userTemplate = '';
  notes = '';

  async ngOnInit(): Promise<void> {
    this.prompts.set(await this.api.listPrompts());
    const first = this.activePrompts()[0];
    if (first) this.select(first);
  }

  select(prompt: Prompt): void {
    this.selected.set(prompt);
    this.systemPrompt = prompt.system_prompt;
    this.userTemplate = prompt.user_template;
    this.notes = '';
    this.saved.set(false);
  }

  async save(): Promise<void> {
    const current = this.selected();
    if (!current) return;
    this.busy.set(true);
    try {
      const updated = await this.api.updatePrompt(current.agent_name, {
        system_prompt: this.systemPrompt,
        user_template: this.userTemplate,
        notes: this.notes,
      });
      this.prompts.set(await this.api.listPrompts());
      this.selected.set(updated);
      this.saved.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
