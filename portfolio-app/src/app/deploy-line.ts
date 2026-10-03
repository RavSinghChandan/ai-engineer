import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LiveStatus } from './live-status.service';

/**
 * The hero sentence "problem -> architecture -> agent -> integration -> production"
 * drawn as a pipeline. A signal runs along it; the last stage is wired to the real
 * production API, so its light is green only when aurawithrav.com is answering.
 */
interface Stage { name: string; fact: string; link: string; linkText: string; }

@Component({
  selector: 'deploy-line',
  standalone: true,
  template: `
    <div class="dl" (pointerenter)="hold = true" (pointerleave)="hold = false">
      <ol class="dl-track" role="tablist" aria-label="How I take a problem to production">
        <li class="dl-rail" aria-hidden="true"><span class="dl-signal"></span></li>
        @for (s of stages; track s.name; let i = $index; let last = $last) {
          <li class="dl-stage" [class.on]="active() === i" [class.past]="i < active()">
            <button type="button" role="tab" [attr.aria-selected]="active() === i" (click)="pick(i)" (focus)="pick(i)">
              <span class="dl-node" [class]="'dl-node ' + (last ? 'prod ' + live.apiState() : '')">
                @if (last) { <span class="dl-ping" aria-hidden="true"></span> }
              </span>
              <span class="dl-name">{{ s.name }}</span>
              @if (last) {
                <span class="dl-meta">{{ prodLabel() }}</span>
              }
            </button>
          </li>
        }
      </ol>
      <p class="dl-fact" role="tabpanel" aria-live="polite">
        <span class="dl-step">{{ active() + 1 }}/{{ stages.length }}</span>
        {{ stages[active()].fact }}
        <a [href]="stages[active()].link" [attr.target]="stages[active()].link.startsWith('http') ? '_blank' : null" rel="noopener">{{ stages[active()].linkText }} →</a>
      </p>
    </div>
  `,
  styleUrl: './deploy-line.scss',
})
export class DeployLine implements OnInit, OnDestroy {
  readonly live = inject(LiveStatus);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly stages: Stage[] = [
    { name: 'Problem', fact: 'RunbookAI: I scoped the real risk first, a hallucinated command in the middle of an incident, and dropped RAG because of it.', link: '#projects', linkText: 'See the decision' },
    { name: 'Architecture', fact: 'LangGraph graphs with parallel domain agents, conditional edges and a human approval step before anything goes out.', link: '#projects', linkText: 'See the graphs' },
    { name: 'Agent', fact: '18+ agents built. Under incident pressure RunbookAI returns commands verbatim from SQL: zero hallucinated commands.', link: '#by-numbers', linkText: 'See the numbers' },
    { name: 'Integration', fact: 'One agent engine serves four apps, FastAPI, Angular, React and plain HTML, through SDKs and YAML. No rewrites.', link: '#by-numbers', linkText: 'See how' },
    { name: 'Production', fact: 'aurawithrav.com: Angular on Vercel, Dockerized FastAPI + LangGraph on Render. The light on this stage is its real health check, run by your browser.', link: 'https://aurawithrav.com', linkText: 'Open it' },
  ];

  active = signal(0);
  hold = false;
  private timer?: ReturnType<typeof setInterval>;

  readonly prodLabel = computed(() => {
    switch (this.live.apiState()) {
      case 'ok': return `live · ${this.live.apiMs()} ms`;
      case 'slow': return 'waking up';
      case 'down': return 'unreachable';
      default: return 'checking…';
    }
  });

  ngOnInit() {
    this.live.start();
    if (!this.browser || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.timer = setInterval(() => { if (!this.hold) this.active.update(i => (i + 1) % this.stages.length); }, 3200);
  }

  ngOnDestroy() { clearInterval(this.timer); }

  pick(i: number) { this.active.set(i); this.hold = true; }
}
