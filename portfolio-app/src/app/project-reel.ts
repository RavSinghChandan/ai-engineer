import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, computed, inject, input, output, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * The project's real screenshots, played like a short walkthrough: one step at a
 * time with a progress bar per step. It only plays while on screen, pauses on
 * hover or focus, and clicking opens the full guided demo.
 */
interface Slide { img: string; label: string; caption: string; }

@Component({
  selector: 'project-reel',
  standalone: true,
  host: { '[class.paused]': 'paused()' },
  template: `
    <div class="pr" (pointerenter)="hover.set(true)" (pointerleave)="hover.set(false)" (focusin)="hover.set(true)" (focusout)="hover.set(false)">
      <div class="pr-bars" aria-hidden="true">
        @for (s of slides(); track s.img; let i = $index) {
          <span class="pr-bar" [class.done]="i < idx()" [class.now]="i === idx()"><i [style.animation-duration]="stepMs + 'ms'"></i></span>
        }
      </div>
      <button type="button" class="pr-stage" (click)="open.emit()" [attr.aria-label]="'Open the guided demo: ' + current()?.label">
        @for (s of slides(); track s.img; let i = $index) {
          <img [src]="s.img" [alt]="s.label" [class.on]="i === idx()" loading="lazy" decoding="async"/>
        }
        <span class="pr-play" aria-hidden="true">▶ guided demo</span>
      </button>
      <div class="pr-cap">
        <span class="pr-step">{{ idx() + 1 }}/{{ slides().length }}</span>
        <span class="pr-label">{{ cleanLabel() }}</span>
        <span class="pr-nav">
          <button type="button" (click)="go(-1)" aria-label="Previous step">‹</button>
          <button type="button" (click)="go(1)" aria-label="Next step">›</button>
        </span>
      </div>
    </div>
  `,
  styleUrl: './project-reel.scss',
})
export class ProjectReel implements AfterViewInit, OnDestroy {
  slides = input.required<Slide[]>();
  open = output<void>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly stepMs = 3600;
  idx = signal(0);
  hover = signal(false);
  visible = signal(false);
  paused = computed(() => this.hover() || !this.visible());
  current = computed(() => this.slides()[this.idx()]);
  cleanLabel = computed(() => (this.current()?.label ?? '').replace(/^[^\p{L}\p{N}]+/u, ''));
  private timer?: ReturnType<typeof setInterval>;
  private io?: IntersectionObserver;

  ngAfterViewInit() {
    if (!this.browser) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;   // stays on step 1; arrows still work
    this.io = new IntersectionObserver(([e]) => this.visible.set(e.isIntersecting), { threshold: 0.35 });
    this.io.observe(this.el.nativeElement);
    this.timer = setInterval(() => { if (!this.paused()) this.idx.update(i => (i + 1) % this.slides().length); }, this.stepMs);
  }

  go(d: number) { const n = this.slides().length; this.idx.update(i => (i + d + n) % n); }

  ngOnDestroy() { clearInterval(this.timer); this.io?.disconnect(); }
}
