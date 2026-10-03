import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, inject, input } from '@angular/core';

const calm = () => typeof window === 'undefined' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Walks through the host's children one at a time (adds .on), like someone
 * presenting each row, but only while the host is on screen.
 */
@Directive({ selector: '[cycleRows]', standalone: true })
export class CycleRows implements AfterViewInit, OnDestroy {
  cycleRows = input('');                    // child selector; empty = direct children
  cycleMs = input(2600);
  private readonly el = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;
  private timer?: ReturnType<typeof setInterval>;
  private i = 0;

  ngAfterViewInit() {
    if (calm() || !('IntersectionObserver' in window)) return;
    this.io = new IntersectionObserver(([e]) => (e.isIntersecting ? this.start() : this.stop()), { threshold: 0.4 });
    this.io.observe(this.el.nativeElement);
  }

  private rows(): HTMLElement[] {
    const host = this.el.nativeElement as HTMLElement;
    return Array.from(this.cycleRows() ? host.querySelectorAll(this.cycleRows()) : host.children) as HTMLElement[];
  }
  private show() {
    const rows = this.rows();
    rows.forEach((r, k) => r.classList.toggle('on', k === this.i % rows.length));
    (this.el.nativeElement as HTMLElement).classList.add('cycling');
  }
  private start() {
    this.stop();
    this.show();
    this.timer = setInterval(() => { this.i++; this.show(); }, this.cycleMs());
  }
  private stop() { clearInterval(this.timer); }
  ngOnDestroy() { this.io?.disconnect(); this.stop(); }
}

/**
 * The timeline fills as the reader scrolls (--fill on the host), and each item
 * gets .reached once the middle of the screen passes it.
 */
@Directive({ selector: '[scrollFill]', standalone: true })
export class ScrollFill implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private raf = 0;
  private readonly onScroll = () => { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.update()); };

  ngAfterViewInit() {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
    });
    this.update();
  }

  private update() {
    const host = this.el.nativeElement as HTMLElement;
    const r = host.getBoundingClientRect(), mid = window.innerHeight * 0.55;
    const fill = calm() ? 1 : Math.min(1, Math.max(0, (mid - r.top) / r.height));
    host.style.setProperty('--fill', fill.toFixed(4));
    for (const item of Array.from(host.children) as HTMLElement[]) {
      item.classList.toggle('reached', calm() || item.getBoundingClientRect().top < mid);
    }
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    cancelAnimationFrame(this.raf);
  }
}

/**
 * City skylines as light bulbs: the small window shapes switch on one by one when
 * the skyline comes on screen, and a tap or click flips the city's lights.
 */
@Directive({
  selector: '[cityLights]', standalone: true,
  host: { role: 'button', tabindex: '0', '[attr.aria-pressed]': '!off', '(click)': 'toggle()', '(keydown.enter)': 'toggle()', '(keydown.space)': '$event.preventDefault(); toggle()' },
})
export class CityLights implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;
  off = false;

  ngAfterViewInit() {
    const host = this.el.nativeElement as HTMLElement;
    let k = 0;
    for (const r of Array.from(host.querySelectorAll('svg rect')) as SVGRectElement[]) {
      const w = parseFloat(r.getAttribute('width') || '99'), fill = r.getAttribute('fill') || r.parentElement?.getAttribute('fill') || '';
      if (w > 6 || fill.startsWith('url') || fill === '#000') continue;
      r.classList.add('win');
      r.style.setProperty('--d', `${(k++ * 0.07 + Math.random() * 0.25).toFixed(2)}s`);
      if (Math.random() < 0.18) r.classList.add('twinkle');
    }
    if (calm() || !('IntersectionObserver' in window)) { host.classList.add('lit'); return; }
    this.io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { host.classList.add('lit'); this.io?.disconnect(); } }, { threshold: 0.5 });
    this.io.observe(host);
  }

  toggle() {
    this.off = !this.off;
    (this.el.nativeElement as HTMLElement).classList.toggle('lights-off', this.off);
  }

  ngOnDestroy() { this.io?.disconnect(); }
}
