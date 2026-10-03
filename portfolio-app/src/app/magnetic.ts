import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/** The element leans a few pixels toward the pointer, and settles back when it leaves. */
@Directive({ selector: '[magnetic]', standalone: true })
export class Magnetic {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly calm = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || window.matchMedia?.('(hover: none)').matches);

  @HostListener('pointermove', ['$event'])
  move(e: PointerEvent) {
    if (this.calm) return;
    const r = this.el.nativeElement.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.22;
    const y = (e.clientY - r.top - r.height / 2) * 0.35;
    this.el.nativeElement.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  @HostListener('pointerleave')
  leave() { this.el.nativeElement.style.transform = ''; }
}
