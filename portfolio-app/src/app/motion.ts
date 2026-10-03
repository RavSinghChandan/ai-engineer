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
    this.addLife(host);
    if (calm() || !('IntersectionObserver' in window)) { host.classList.add('lit'); return; }
    // lights come on once; the street only moves while the skyline is on screen
    this.io = new IntersectionObserver(([e]) => {
      host.classList.toggle('city-live', e.isIntersecting);
      if (e.isIntersecting) host.classList.add('lit');
    }, { threshold: 0.3 });
    this.io.observe(host);
  }

  /** A living street: two lanes of traffic, a train for the metro cities, clouds, birds and a plane. */
  private addLife(host: HTMLElement) {
    const svg = host.querySelector('svg');
    if (!svg || svg.querySelector('.cfx')) return;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag: string, attrs: Record<string, string | number>, parent: Element) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };
    const fx = document.createElementNS(NS, 'g');
    fx.setAttribute('class', 'cfx');
    fx.setAttribute('aria-hidden', 'true');
    const sky = el('g', { class: 'cfx-sky' }, fx);
    [[0, 14, 26, 6, 58], [-22, 22, 34, 7, 74], [-44, 10, 20, 5, 66]].forEach(([d, y, rx, ry, dur]) =>
      el('ellipse', { class: 'cfx-cloud', cx: -40, cy: y, rx, ry, style: `animation-duration:${dur}s;animation-delay:${d}s` }, sky));
    el('circle', { class: 'cfx-plane', cx: 0, cy: 6, r: 1.3 }, sky);
    [0, 6, 11].forEach((dx, i) => el('path', { class: 'cfx-bird', d: `M${-20 - dx} ${16 + i * 2} l2 -1.6 l2 1.6 l2 -1.6 l2 1.6`, style: `animation-delay:${-i * 0.4}s` }, sky));
    const road = el('g', { class: 'cfx-road' }, fx);
    const cars: [number, number, number, boolean][] = [[0, 9, 7, true], [-3.5, 12, 6, true], [-6, 8, 7.5, true], [-1, 11, 6.5, false], [-5, 9.5, 7, false], [-8, 13, 6, false]];
    cars.forEach(([delay, dur, w, east]) => {
      const g = el('g', { class: `cfx-car ${east ? 'east' : 'west'}`, style: `animation-duration:${dur}s;animation-delay:${delay}s` }, road);
      const y = east ? 67.2 : 70.6;
      el('rect', { x: 0, y, width: w, height: 2.4, rx: 1, class: 'cfx-body' }, g);
      el('circle', { cx: east ? w : 0, cy: y + 1.2, r: 0.9, class: 'cfx-head' }, g);
      el('circle', { cx: east ? 0 : w, cy: y + 1.2, r: 0.7, class: 'cfx-tail' }, g);
    });
    const city = host.querySelector('svg')!.getAttribute('class') || '';
    if (/blr|mumbai|kolkata/.test(city)) {
      const t = el('g', { class: 'cfx-train' }, road);
      for (let i = 0; i < 4; i++) {
        el('rect', { x: i * 15, y: 61, width: 13.5, height: 3.4, rx: 1, class: 'cfx-coach' }, t);
        [3, 7, 11].forEach(wx => el('rect', { x: i * 15 + wx - 1, y: 61.8, width: 1.6, height: 1.2, class: 'cfx-cw' }, t));
      }
    }
    const label = svg.querySelector('text');
    label ? svg.insertBefore(fx, label) : svg.appendChild(fx);
  }

  toggle() {
    this.off = !this.off;
    (this.el.nativeElement as HTMLElement).classList.toggle('lights-off', this.off);
  }

  ngOnDestroy() { this.io?.disconnect(); }
}
