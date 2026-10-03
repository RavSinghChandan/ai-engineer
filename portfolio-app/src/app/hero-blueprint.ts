import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { LiveStatus } from './live-status.service';

/**
 * The hero's background: a blueprint of the deployment loop drawn around the edges
 * of the hero (never behind the text). Requests travel the loop; the last node is
 * aurawithrav.com, lit by the real health check.
 */
interface Node { x: number; y: number; t: string; s: string; }


@Component({
  selector: 'hero-blueprint',
  standalone: true,
  template: `
    <svg class="bp" [attr.viewBox]="'0 0 ' + w() + ' ' + h()" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="bp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 H0 V40" fill="none" class="bp-gridline"/>
        </pattern>
        <linearGradient id="bp-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" class="bp-stop-a"/><stop offset="0.5" class="bp-stop-b"/><stop offset="1" class="bp-stop-a"/>
        </linearGradient>
      </defs>
      <rect [attr.width]="w()" [attr.height]="h()" fill="url(#bp-grid)" class="bp-gridrect"/>

      <path [attr.d]="loop()" class="bp-loop"/>
      <path [attr.d]="loop()" class="bp-flow" pathLength="1000"/>
      @for (d of [0, 1, 2, 3]; track d) {
        <circle r="3.2" class="bp-packet" [style.offset-path]="'path(\\'' + loop() + '\\')'" [style.animation-delay]="-d * 4.5 + 's'"/>
      }

      @for (n of nodes(); track n.t) {
        <g class="bp-node" [attr.transform]="'translate(' + n.x + ' ' + n.y + ')'">
          <rect x="-62" y="-15" width="124" height="30" rx="2"/>
          <text y="-2" text-anchor="middle" class="bp-t">{{ n.t }}</text>
          <text y="10" text-anchor="middle" class="bp-s">{{ n.s }}</text>
        </g>
      }

      <g [class]="'bp-node bp-prod ' + live.apiState()" [attr.transform]="'translate(' + box().l + ' ' + box().b + ')'">
        <circle r="26" class="bp-halo"/>
        <rect x="-74" y="-19" width="148" height="38" rx="2"/>
        <text y="-3" text-anchor="middle" class="bp-t">aurawithrav.com</text>
        <text y="11" text-anchor="middle" class="bp-s">{{ prodLabel() }}</text>
      </g>

      <text [attr.x]="box().r + 62" [attr.y]="box().b + 38" text-anchor="end" class="bp-title">fig. 1 · the deployment loop I run</text>
    </svg>
  `,
  styleUrl: './hero-blueprint.scss',
})
export class HeroBlueprint implements OnInit, AfterViewInit, OnDestroy {
  readonly live = inject(LiveStatus);
  private readonly el = inject(ElementRef<HTMLElement>);
  private ro?: ResizeObserver;
  readonly w = signal(1440);
  readonly h = signal(900);

  /** The loop hugs the hero's edges at whatever size the hero really is. */
  readonly box = computed(() => {
    const w = this.w(), h = this.h();
    return { l: 90, r: w - 80, t: 80, b: h - 38 };
  });
  readonly loop = computed(() => { const b = this.box(); return `M${b.l} ${b.t} H${b.r} V${b.b} H${b.l} Z`; });
  readonly nodes = computed<Node[]>(() => {
    const { l, r, t, b } = this.box();
    const across = (i: number, n: number) => l + ((r - l) * i) / n;
    const down = (i: number) => t + ((b - t) * i) / 3;
    return [
      { x: across(0, 4), y: t, t: 'users', s: 'web · mobile · slack' },
      { x: across(1, 4), y: t, t: 'web app', s: 'Angular · React' },
      { x: across(2, 4), y: t, t: 'gateway', s: 'FastAPI · auth · rate limit' },
      { x: across(3, 4), y: t, t: 'agent graph', s: 'LangGraph · tools' },
      { x: r, y: t, t: 'guardrails', s: 'G1–G5' },
      { x: r, y: down(1), t: 'model', s: 'DeepSeek · cache' },
      { x: r, y: down(2), t: 'retrieval', s: 'FAISS · RAG' },
      { x: r, y: b, t: 'data', s: 'Postgres · Redis' },
      { x: across(3, 4), y: b, t: 'container', s: 'Docker · CI' },
      { x: across(2, 4), y: b, t: 'deploy', s: 'Render' },
      { x: across(1, 4), y: b, t: 'edge', s: 'Vercel · HTTPS' },
    ];
  });

  ngAfterViewInit() {
    const host = this.el.nativeElement as HTMLElement;
    const size = () => { const r = host.getBoundingClientRect(); if (r.width && r.height) { this.w.set(Math.round(r.width)); this.h.set(Math.round(r.height)); } };
    size();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(size); this.ro.observe(host); }
  }

  ngOnDestroy() { this.ro?.disconnect(); }

  prodLabel() {
    switch (this.live.apiState()) {
      case 'ok': return `live · ${this.live.apiMs()} ms`;
      case 'slow': return 'waking up';
      case 'down': return 'not answering';
      default: return 'checking…';
    }
  }

  ngOnInit() { this.live.start(); }
}
