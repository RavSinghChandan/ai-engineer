import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Job, Project } from '../../core/models';
import { StatusBadge } from '../shared/status-badge';

@Component({
  selector: 'acf-project-page',
  imports: [FormsModule, RouterLink, DatePipe, StatusBadge],
  template: `
    <div class="mx-auto max-w-6xl space-y-8">
      <a routerLink="/" class="text-sm text-slate-400 hover:text-sky-400">← All projects</a>

      @if (project(); as p) {
        <header>
          <h1 class="text-2xl font-bold text-white">{{ p.name }}</h1>
          <p class="mt-1 text-sm text-slate-400">
            {{ p.niche }} @if (p.audience) { · for {{ p.audience }} }
          </p>
        </header>

        <form class="card space-y-4" (ngSubmit)="createAndStart()">
          <div class="flex flex-col gap-3 md:flex-row md:items-end">
            <div class="flex-1">
              <label class="label" for="topic">New video topic</label>
              <input
                id="topic"
                class="input"
                [(ngModel)]="topic"
                name="topic"
                placeholder="e.g. What is RAG and why every AI engineer must know it"
                required
                minlength="3"
              />
            </div>
            <button class="btn-primary whitespace-nowrap" type="submit" [disabled]="busy() || topic.length < 3">
              {{ busy() ? 'Starting…' : '▶ Produce video' }}
            </button>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" [(ngModel)]="useOwnScript" name="useOwnScript" class="accent-sky-500" />
            I already have my script — skip research, writing and review
          </label>
          @if (useOwnScript) {
            <div>
              <label class="label" for="scriptText">Your script (used word-for-word)</label>
              <textarea
                id="scriptText"
                class="input font-mono"
                rows="8"
                [(ngModel)]="scriptText"
                name="scriptText"
                placeholder="Paste your finished YouTube script here…"
              ></textarea>
            </div>
          }

          <div>
            <label class="label" for="thumbInstr">Thumbnail instructions (optional)</label>
            <input
              id="thumbInstr"
              class="input"
              [(ngModel)]="thumbnailInstructions"
              name="thumbInstr"
              placeholder="e.g. red and black theme, headline about RAG mistakes, shocked mood"
            />
          </div>
        </form>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-white">Videos</h2>
          @if (jobs().length === 0) {
            <div class="card text-center text-slate-400">No videos yet — enter a topic above.</div>
          }
          @for (job of jobs(); track job.id) {
            <a
              [routerLink]="['/jobs', job.id]"
              class="card flex items-center justify-between gap-4 transition hover:border-sky-600"
            >
              <div class="min-w-0">
                <p class="truncate font-medium text-white">
                  {{ job.result?.title || job.topic }}
                </p>
                <p class="mt-1 text-xs text-slate-500">{{ job.created_at | date: 'medium' }}</p>
              </div>
              <acf-status-badge [status]="job.status" />
            </a>
          }
        </section>
      }
    </div>
  `,
})
export class ProjectPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly project = signal<Project | null>(null);
  readonly jobs = signal<Job[]>([]);
  readonly busy = signal(false);

  topic = '';
  useOwnScript = false;
  scriptText = '';
  thumbnailInstructions = '';

  async ngOnInit(): Promise<void> {
    const [project, jobs] = await Promise.all([
      this.api.getProject(this.id()),
      this.api.listJobs(this.id()),
    ]);
    this.project.set(project);
    this.jobs.set(jobs);
  }

  async createAndStart(): Promise<void> {
    this.busy.set(true);
    try {
      const job = await this.api.createJob(
        this.id(),
        this.topic,
        this.useOwnScript ? this.scriptText : '',
        this.thumbnailInstructions,
      );
      await this.api.startJob(job.id);
      await this.router.navigate(['/jobs', job.id]);
    } finally {
      this.busy.set(false);
    }
  }
}
