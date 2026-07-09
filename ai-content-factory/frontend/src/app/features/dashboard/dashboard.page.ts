import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CreatorProfile, Project } from '../../core/models';

@Component({
  selector: 'acf-dashboard-page',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="mx-auto max-w-6xl space-y-8">
      <header class="flex items-end justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Projects</h1>
          <p class="text-sm text-slate-400">Each project is a channel or content series</p>
        </div>
        <button class="btn-primary" (click)="showForm.set(!showForm())">
          {{ showForm() ? 'Close' : '+ New project' }}
        </button>
      </header>

      @if (showForm()) {
        <form class="card grid gap-4 md:grid-cols-2" (ngSubmit)="create()">
          <div>
            <label class="label" for="name">Project name</label>
            <input id="name" class="input" [(ngModel)]="draft.name" name="name" required />
          </div>
          <div>
            <label class="label" for="niche">Niche</label>
            <input id="niche" class="input" [(ngModel)]="draft.niche" name="niche" placeholder="AI Engineering" />
          </div>
          <div class="md:col-span-2">
            <label class="label" for="audience">Target audience</label>
            <input id="audience" class="input" [(ngModel)]="draft.audience" name="audience" placeholder="Software engineers learning AI" />
          </div>
          <div class="md:col-span-2">
            <label class="label" for="description">Description</label>
            <textarea id="description" class="input" rows="2" [(ngModel)]="draft.description" name="description"></textarea>
          </div>
          <div class="md:col-span-2">
            <label class="label" for="profile">Creator profile (voice + avatar)</label>
            <select id="profile" class="input" [(ngModel)]="draft.creator_profile_id" name="creator_profile_id">
              <option [ngValue]="null">Use my default profile</option>
              @for (profile of creatorProfiles(); track profile.id) {
                <option [ngValue]="profile.id">
                  {{ profile.name }}{{ profile.is_default ? ' (default)' : '' }}
                </option>
              }
            </select>
          </div>
          <div class="md:col-span-2">
            <button class="btn-primary" type="submit" [disabled]="busy() || !draft.name">Create project</button>
          </div>
        </form>
      }

      @if (loading()) {
        <p class="text-slate-400">Loading projects…</p>
      } @else if (projects().length === 0) {
        <div class="card text-center text-slate-400">No projects yet — create your first one.</div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (project of projects(); track project.id) {
            <a [routerLink]="['/projects', project.id]" class="card block transition hover:border-sky-600">
              <h2 class="text-lg font-semibold text-white">{{ project.name }}</h2>
              @if (project.niche) {
                <span class="badge mt-2 bg-sky-950 text-sky-400">{{ project.niche }}</span>
              }
              <p class="mt-3 line-clamp-2 text-sm text-slate-400">{{ project.description || 'No description' }}</p>
              <p class="mt-3 text-xs text-slate-500">Created {{ project.created_at | date: 'mediumDate' }}</p>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly projects = signal<Project[]>([]);
  readonly creatorProfiles = signal<CreatorProfile[]>([]);
  readonly loading = signal(true);
  readonly showForm = signal(false);
  readonly busy = signal(false);

  draft: Partial<Project> = { name: '', niche: '', audience: '', description: '', creator_profile_id: null };

  async ngOnInit(): Promise<void> {
    const [projects, profiles] = await Promise.all([this.api.listProjects(), this.api.listProfiles()]);
    this.projects.set(projects);
    this.creatorProfiles.set(profiles);
    this.loading.set(false);
  }

  async create(): Promise<void> {
    this.busy.set(true);
    try {
      const project = await this.api.createProject(this.draft);
      this.projects.update((list) => [project, ...list]);
      this.showForm.set(false);
      this.draft = { name: '', niche: '', audience: '', description: '', creator_profile_id: null };
    } finally {
      this.busy.set(false);
    }
  }
}
