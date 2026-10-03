import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * "Let's build something real", acted out: a message flies from the visitor to me
 * and a reply flies back, cycling through the three reasons people get in touch.
 */
@Component({
  selector: 'contact-flow',
  standalone: true,
  host: { '[class.live]': 'live()' },
  template: `
    <div class="cf" aria-live="polite">
      <div class="cf-end you"><span class="cf-av">you</span><small>your problem</small></div>
      <div class="cf-lane">
        <span class="cf-wire" aria-hidden="true"></span>
        @for (c of [cycle()]; track c) {
          <span class="cf-chip out">✉ {{ pairs[c % pairs.length].ask }}</span>
          <span class="cf-chip back">↩ {{ pairs[c % pairs.length].reply }}</span>
        }
      </div>
      <div class="cf-end me"><img class="cf-av" src="chandan-photo.jpg" alt="Chandan" /><small>reads it himself</small></div>
    </div>
  `,
  styleUrl: './contact-flow.scss',
})
export class ContactFlow implements AfterViewInit, OnDestroy {
  readonly pairs = [
    { ask: 'Building an AI product?', reply: 'a working product, shipped and running' },
    { ask: 'A hard engineering problem?', reply: 'a scoped design first, then the fix' },
    { ask: 'Hiring a forward deployed engineer?', reply: 'someone who builds, ships and runs it' },
  ];
  cycle = signal(0);
  live = signal(false);
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private timer?: ReturnType<typeof setInterval>;
  private io?: IntersectionObserver;

  ngAfterViewInit() {
    if (!this.browser) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { this.live.set(true); return; }
    this.io = new IntersectionObserver(([e]) => this.live.set(e.isIntersecting), { threshold: 0.3 });
    this.io.observe(this.el.nativeElement);
    this.timer = setInterval(() => { if (this.live()) this.cycle.update(c => c + 1); }, 5200);
  }

  ngOnDestroy() { clearInterval(this.timer); this.io?.disconnect(); }
}
