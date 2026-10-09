import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { LiveStatus } from './live-status.service';

/**
 * The hero's background: a blueprint of the deployment loop drawn around the edges
 * of the hero (never behind the text). Requests travel the loop; the last node is
 * aurawithrav.com, lit by the real health check.
 */
type Layer = 'client' | 'security' | 'ai' | 'data' | 'ship';
interface Node { x: number; y: number; t: string; s: string; layer: Layer; hit?: number; }


@Component({
  selector: 'hero-blueprint',
  standalone: true,
  template: `
    <svg class="bp" [attr.viewBox]="'0 0 ' + w() + ' ' + h()" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="bp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 H0 V40" fill="none" class="bp-gridline"/>
        </pattern>
        <linearGradient id="bp-layers" gradientUnits="userSpaceOnUse" x1="0" y1="0" [attr.x2]="w()" [attr.y2]="h()">
          <stop offset="0" stop-color="#86BC25"/><stop offset="0.5" stop-color="#00ABAB"/><stop offset="1" stop-color="#86BC25"/>
        </linearGradient>
        <radialGradient id="bp-mist-g"><stop offset="0" stop-color="#86BC25" stop-opacity="0.16"/><stop offset="0.6" stop-color="#00ABAB" stop-opacity="0.06"/><stop offset="1" stop-color="#00ABAB" stop-opacity="0"/></radialGradient>
        <filter id="bp-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
      </defs>
      <rect [attr.width]="w()" [attr.height]="h()" fill="url(#bp-grid)" class="bp-gridrect"/>
      <g class="bp-mist" filter="url(#bp-soft)">
        <ellipse [attr.cx]="w() * 0.78" [attr.cy]="h() * 0.18" [attr.rx]="w() * 0.22" [attr.ry]="h() * 0.2" fill="url(#bp-mist-g)" class="m1"/>
        <ellipse [attr.cx]="w() * 0.9" [attr.cy]="h() * 0.72" [attr.rx]="w() * 0.2" [attr.ry]="h() * 0.22" fill="url(#bp-mist-g)" class="m2"/>
        <ellipse [attr.cx]="w() * 0.12" [attr.cy]="h() * 0.92" [attr.rx]="w() * 0.24" [attr.ry]="h() * 0.18" fill="url(#bp-mist-g)" class="m3"/>
        <ellipse [attr.cx]="w() * 0.45" [attr.cy]="h() * 0.05" [attr.rx]="w() * 0.25" [attr.ry]="h() * 0.12" fill="url(#bp-mist-g)" class="m4"/>
      </g>

      <path [attr.d]="loop()" class="bp-loop"/>
      <path [attr.d]="loop()" class="bp-flow" pathLength="1000" stroke="url(#bp-layers)"/>
      @for (d of [0, 1, 2, 3]; track d) {
        @for (k of [3, 2, 1]; track k) {
          <circle [attr.r]="3.2 - k * 0.6" class="bp-trail" [style.opacity]="0.5 - k * 0.12" [style.offset-path]="pathCss()" [style.animation-delay]="(k * 0.14 - d * 4.5) + 's'"/>
        }
        <circle r="3.4" class="bp-packet" [style.offset-path]="pathCss()" [style.animation-delay]="-d * 4.5 + 's'"/>
      }

      @for (n of nodes(); track n.t) {
        <g class="bp-node" [attr.transform]="'translate(' + n.x + ' ' + n.y + ')'" [style.--hit]="n.hit + 's'">
          <rect x="-62" y="-15" width="124" height="30" rx="2" class="bp-box"/>
          <rect x="-62" y="-15" width="3" height="30" class="bp-tick"/>
          <path [attr.d]="icons[n.t]" transform="translate(-53 -6)" class="bp-icon"/>
          <text x="7" y="4" text-anchor="middle" class="bp-t">{{ n.t }}</text>
        </g>
      }

      <g [class]="'bp-node bp-prod ' + live.apiState()" [attr.transform]="'translate(' + box().l + ' ' + box().b + ')'">
        <circle r="26" class="bp-halo"/>
        <rect x="-74" y="-19" width="148" height="38" rx="2"/>
        <text y="4" text-anchor="middle" class="bp-t">production</text>
      </g>
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
  readonly pathCss = computed(() => `path('${this.loop()}')`);
  readonly nodes = computed<Node[]>(() => {
    const { l, r, t, b } = this.box();
    const across = (i: number, n: number) => l + ((r - l) * i) / n;
    const down = (i: number) => t + ((b - t) * i) / 3;
    return [
      { x: across(0, 4), y: t, t: 'users', s: 'web · mobile', layer: 'client' },
      { x: across(1, 4), y: t, t: 'web app', s: 'Angular · React', layer: 'client' },
      { x: across(2, 4), y: t, t: 'gateway', s: 'FastAPI · auth', layer: 'security' },
      { x: across(3, 4), y: t, t: 'agent graph', s: 'LangGraph · tools', layer: 'ai' },
      { x: r, y: t, t: 'guardrails', s: 'G1–G5', layer: 'security' },
      { x: r, y: down(1), t: 'model', s: 'DeepSeek · cache', layer: 'ai' },
      { x: r, y: down(2), t: 'retrieval', s: 'FAISS · RAG', layer: 'ai' },
      { x: r, y: b, t: 'data', s: 'Postgres · Redis', layer: 'data' },
      { x: across(3, 4), y: b, t: 'container', s: 'Docker · CI', layer: 'ship' },
      { x: across(2, 4), y: b, t: 'deploy', s: 'Render', layer: 'ship' },
      { x: across(1, 4), y: b, t: 'edge', s: 'Vercel · HTTPS', layer: 'ship' },
    ].map(n => ({ ...n, hit: this.hitDelay(n.x, n.y) }) as Node);
  });

  /** Seconds until a packet reaches (x, y): packets lap the loop in 18 s, one every 4.5 s. */
  private hitDelay(x: number, y: number): number {
    const { l, r, t, b } = this.box();
    const w = r - l, h = b - t, per = 2 * (w + h);
    let d: number;
    if (y === t) d = x - l;
    else if (x === r) d = w + (y - t);
    else if (y === b) d = w + h + (r - x);
    else d = 2 * w + h + (b - y);
    return +(((d / per) * 18) % 4.5).toFixed(2);
  }

  /** 12 x 12 line icons, one per box. */
  readonly icons: Record<string, string> = {
    'users': 'M6 5.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.5 11.5c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4',
    'web app': 'M1 2h10v8H1zM1 4.5h10M2.6 3.2h.1M4 3.2h.1',
    'gateway': 'M1 4h8.5M7.5 2l2 2-2 2M11 8H2.5M4.5 6l-2 2 2 2',
    'agent graph': 'M2.5 2.5L6 9.5L9.5 2.5Z',
    'guardrails': 'M6 1l4.5 1.8v3.4c0 2.6-1.9 4.4-4.5 5.3-2.6-.9-4.5-2.7-4.5-5.3V2.8zM4 6.2l1.5 1.5L8.3 4.8',
    'model': 'M3 3h6v6H3zM5 1v2M7 1v2M5 9v2M7 9v2M1 5h2M1 7h2M9 5h2M9 7h2',
    'retrieval': 'M5 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 8l3.2 3.2',
    'data': 'M1.5 2.8C1.5 1.8 3.5 1 6 1s4.5.8 4.5 1.8v6.4C10.5 10.2 8.5 11 6 11s-4.5-.8-4.5-1.8zM1.5 2.8c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8M1.5 6c0 1 2 1.8 4.5 1.8S10.5 7 10.5 6',
    'container': 'M6 1l5 2.5v5L6 11 1 8.5v-5zM1 3.5L6 6l5-2.5M6 6v5',
    'deploy': 'M6 1v7M3 4l3-3 3 3M1.5 10.5h9',
    'edge': 'M6 11A5 5 0 1 0 6 1a5 5 0 0 0 0 10zM1 6h10M6 1c1.6 1.4 2.4 3.1 2.4 5S7.6 9.6 6 11M6 1C4.4 2.4 3.6 4.1 3.6 6S4.4 9.6 6 11',
  };

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
