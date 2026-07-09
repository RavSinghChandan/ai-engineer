import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { JobStreamService } from '../../core/job-stream.service';
import {
  AgentInfo,
  Asset,
  JobDetail,
  JobEvent,
  ScriptContent,
} from '../../core/models';
import { StatusBadge } from '../shared/status-badge';

type AgentVisualStatus = 'pending' | 'running' | 'completed' | 'failed';

@Component({
  selector: 'acf-job-page',
  imports: [RouterLink, DatePipe, StatusBadge],
  template: `
    @if (job(); as j) {
      <div class="mx-auto max-w-6xl space-y-6">
        <a [routerLink]="['/projects', j.project_id]" class="text-sm text-slate-400 hover:text-sky-400">← Back to project</a>

        <header class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <h1 class="truncate text-xl font-bold text-white">{{ j.result?.title || j.topic }}</h1>
            <p class="mt-1 text-xs text-slate-500">Started {{ j.created_at | date: 'medium' }}</p>
          </div>
          <div class="flex items-center gap-3">
            <acf-status-badge [status]="j.status" />
            @if (j.status === 'awaiting_approval') {
              <button class="btn-primary" (click)="approve()">✓ Approve video</button>
            }
            @if (j.status === 'failed') {
              <button class="btn-ghost" (click)="retry()">↻ Retry</button>
            }
          </div>
        </header>

        @if (j.error && j.status === 'failed') {
          <p class="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-400">{{ j.error }}</p>
        }

        <!-- Agent pipeline -->
        <section class="card">
          <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Agent pipeline</h2>
          <div class="flex flex-wrap gap-2">
            @for (agent of agents(); track agent.name) {
              <div
                class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition"
                [class]="agentClasses(statusOf(agent.name))"
                [title]="agent.description"
              >
                <span class="inline-block h-2 w-2 rounded-full" [class]="dotClasses(statusOf(agent.name))"></span>
                {{ agent.name }}
              </div>
            }
          </div>
        </section>

        <div class="grid gap-6 lg:grid-cols-2">
          <!-- Live log -->
          <section class="card">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Live execution log
              @if (connected()) { <span class="ml-2 text-emerald-400">● live</span> }
            </h2>
            <div class="max-h-96 space-y-1.5 overflow-y-auto font-mono text-xs" #logBox>
              @for (event of events(); track event.id) {
                <p [class]="event.type.includes('failed') ? 'text-red-400' : 'text-slate-300'">
                  <span class="text-slate-600">{{ event.created_at | date: 'HH:mm:ss' }}</span>
                  @if (event.agent) { <span class="text-sky-500">[{{ event.agent }}]</span> }
                  {{ event.message }}
                </p>
              } @empty {
                <p class="text-slate-500">No events yet.</p>
              }
            </div>
          </section>

          <!-- Script -->
          <section class="card">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Script @if (latestScript()) { (v{{ j.script_versions.length }}) }
            </h2>
            @if (latestScript(); as script) {
              <div class="max-h-96 space-y-4 overflow-y-auto text-sm">
                <h3 class="font-semibold text-white">{{ script.title }}</h3>
                <p class="italic text-sky-300">{{ script.hook }}</p>
                @for (section of script.sections; track section.heading) {
                  <div>
                    <p class="font-semibold text-slate-200">{{ section.heading }}</p>
                    <p class="mt-1 text-slate-400">{{ section.narration }}</p>
                  </div>
                }
                <p class="font-medium text-emerald-300">{{ script.cta }}</p>
              </div>
            } @else {
              <p class="text-sm text-slate-500">The script will appear here once written.</p>
            }
          </section>
        </div>

        <!-- Deliverables -->
        @if (videoUrl() || thumbUrl() || j.result) {
          <section class="card space-y-5">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400">Deliverables</h2>
            <div class="grid gap-6 lg:grid-cols-2">
              @if (videoUrl(); as url) {
                <div>
                  <p class="label">Final video</p>
                  <video [src]="url" controls class="w-full rounded-lg border border-slate-800"></video>
                </div>
              }
              @if (thumbUrl(); as url) {
                <div>
                  <p class="label">Thumbnail</p>
                  <img [src]="url" alt="Thumbnail" class="w-full rounded-lg border border-slate-800" />
                </div>
              }
            </div>
            @if (j.result?.seo; as seo) {
              <div class="space-y-3 border-t border-slate-800 pt-4 text-sm">
                <div>
                  <p class="label">SEO title</p>
                  <p class="text-white">{{ seo.best_title }}</p>
                </div>
                <div>
                  <p class="label">Description</p>
                  <p class="whitespace-pre-line text-slate-400">{{ seo.description }}</p>
                </div>
                <div>
                  <p class="label">Tags</p>
                  <div class="flex flex-wrap gap-1.5">
                    @for (tag of seo.tags ?? []; track tag) {
                      <span class="badge bg-slate-800 text-slate-300">{{ tag }}</span>
                    }
                  </div>
                </div>
              </div>
            }
          </section>
        }
      </div>
    }
  `,
})
export class JobPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly stream = inject(JobStreamService);

  readonly id = input.required<string>();
  readonly job = signal<JobDetail | null>(null);
  readonly agents = signal<AgentInfo[]>([]);
  readonly events = signal<JobEvent[]>([]);
  readonly connected = signal(false);
  readonly videoUrl = signal<string | null>(null);
  readonly thumbUrl = signal<string | null>(null);

  readonly latestScript = computed<ScriptContent | null>(() => {
    const versions = this.job()?.script_versions ?? [];
    return versions.at(-1)?.content ?? null;
  });

  /** Derive each agent's visual status from the event stream. */
  readonly agentStatus = computed<Record<string, AgentVisualStatus>>(() => {
    const statuses: Record<string, AgentVisualStatus> = {};
    for (const event of this.events()) {
      if (!event.agent) continue;
      if (event.type === 'agent_started') statuses[event.agent] = 'running';
      else if (event.type === 'agent_completed') statuses[event.agent] = 'completed';
      else if (event.type === 'agent_failed') statuses[event.agent] = 'failed';
    }
    return statuses;
  });

  private disconnect: (() => void) | null = null;

  statusOf(agentName: string): AgentVisualStatus {
    return this.agentStatus()[agentName] ?? 'pending';
  }

  agentClasses(status: AgentVisualStatus): string {
    switch (status) {
      case 'running':
        return 'border-sky-600 bg-sky-950/50 text-sky-300';
      case 'completed':
        return 'border-emerald-800 bg-emerald-950/40 text-emerald-300';
      case 'failed':
        return 'border-red-800 bg-red-950/40 text-red-300';
      default:
        return 'border-slate-800 bg-slate-900 text-slate-500';
    }
  }

  dotClasses(status: AgentVisualStatus): string {
    switch (status) {
      case 'running':
        return 'animate-pulse bg-sky-400';
      case 'completed':
        return 'bg-emerald-400';
      case 'failed':
        return 'bg-red-400';
      default:
        return 'bg-slate-600';
    }
  }

  async ngOnInit(): Promise<void> {
    const [job, agents] = await Promise.all([this.api.getJob(this.id()), this.api.listAgents()]);
    this.job.set(job);
    this.agents.set(agents);
    await this.loadAssets(job.assets);
    this.openStream();
  }

  ngOnDestroy(): void {
    this.disconnect?.();
  }

  private openStream(): void {
    this.disconnect?.();
    this.disconnect = this.stream.connect(
      this.id(),
      this.events().at(-1)?.id ?? 0,
      (event) => this.onEvent(event),
      () => this.connected.set(false),
    );
    this.connected.set(true);
  }

  private async onEvent(event: JobEvent): Promise<void> {
    this.events.update((list) => [...list, event]);
    const isTerminal = ['job_completed', 'job_failed', 'agent_completed'].includes(event.type);
    if (isTerminal) {
      const job = await this.api.getJob(this.id());
      this.job.set(job);
      await this.loadAssets(job.assets);
    }
  }

  private async loadAssets(assets: Asset[]): Promise<void> {
    const video = assets.find((a) => a.kind === 'video');
    const thumb = assets.find((a) => a.kind === 'thumbnail');
    if (video && !this.videoUrl()) this.videoUrl.set(await this.api.assetObjectUrl(video.id));
    if (thumb && !this.thumbUrl()) this.thumbUrl.set(await this.api.assetObjectUrl(thumb.id));
  }

  async approve(): Promise<void> {
    await this.api.approveJob(this.id());
    this.job.set(await this.api.getJob(this.id()));
  }

  async retry(): Promise<void> {
    await this.api.startJob(this.id());
    this.job.set(await this.api.getJob(this.id()));
    this.openStream();
  }
}
