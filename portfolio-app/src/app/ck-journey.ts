import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { CkGuide, CkMood } from './ck-guide';

const STEPS = 7;
const PATH_FROM = 6;     // percent of the width where the first waypoint sits
const PATH_TO = 84;      // ...and the last
const FLAG_AT = 94;
const WALK_MS = 2600;

/**
 * One colour world per milestone, so no two banners look alike: board gradient (a → b) and a
 * light highlight for the pill, the walked path and the waypoint. Every board keeps white text
 * at 4.5:1 or better.
 */
export const MILESTONES = [
  { a: '#0f766e', b: '#0b3f45', hi: '#5eead4', icon: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M14.8 14.8L20.5 20.5' },            // 1 FDE: discover
  { a: '#4338ca', b: '#1e1b4b', hi: '#a5b4fc', icon: 'M12 2.5c3 2.2 5 6.2 4 11.5H8C7 8.7 9 4.7 12 2.5zM8 14l-2.4 3.4H9M16 14l2.4 3.4H15M10.4 17.6L12 21.5l1.6-3.9' }, // 2 products: ship
  { a: '#c2410c', b: '#5a1d06', hi: '#fdba74', icon: 'M3.5 20.5h17M7 17v-5M12 17V8M17 17V4' },                                         // 3 numbers
  { a: '#3f7f1a', b: '#153a0b', hi: '#bef264', icon: 'M6 3.5v11M6 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6M18 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6M18 9c0 5-12 2-12 6' }, // 4 open source: merge
  { a: '#1d4ed8', b: '#0b1f52', hi: '#93c5fd', icon: 'M3.5 8h17v11.5h-17zM9 8V5h6v3M3.5 13h17' },                                       // 5 experience
  { a: '#9d174d', b: '#4a0a26', hi: '#f9a8d4', icon: 'M4 5c3-1 6-1 8 1c2-2 5-2 8-1v14c-3-1-6-1-8 1c-2-2-5-2-8-1zM12 6v14' },             // 6 story
  { a: '#b45309', b: '#4a2306', hi: '#fde68a', icon: 'M4 5h16v10.5H9.5L4 20z' },                                                       // 7 contact
];

/** What each step of the welcome staircase leads to: the section it opens, and the word on its flag. */
export const STEP_GOALS = [
  { id: 'projects', place: 'My Products', flag: 'Products' },
  { id: 'by-numbers', place: 'Proof in Numbers', flag: 'Numbers' },
  { id: 'experience', place: 'My Work Experience', flag: 'Experience' },
  { id: 'skills', place: 'How I Work', flag: 'How I Work' },
  { id: 'opensource', place: 'Open Source', flag: 'Open Source' },
  { id: 'story', place: 'My Story', flag: 'Story' },
  { id: 'contact', place: 'Contact Me', flag: 'Contact' },
];
/** How long the numbers on the steps take to count up when the card comes into view. */
const COUNT_MS = 1400;
/** Relative width of each step: the higher ones carry more text (Contact holds an email address). */
const STEP_WEIGHTS = [1, 1.18, 1.05, 1.12, 1.15, 1.0, 1.55];

/** Height of the path (0 = top, 100 = bottom of the scene) at a percent of the width: a gentle hill. */
function pathY(x: number): number {
  const t = x / 100;
  return 84 - 26 * (t * t * (3 - 2 * t)) + 4 * Math.sin(t * 18);
}
const xOf = (n: number) => PATH_FROM + ((n - 1) / (STEPS - 1)) * (PATH_TO - PATH_FROM);
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The "You are on Step N" banner. When it scrolls into view the caricature walks along the path
 * from the previous waypoint to this one (feet on the line the whole way), then turns to the
 * visitor with this section's pose and mood. `stairs` mode is the welcome band: a staircase in
 * the seven milestone colours, with the caricature on the first step.
 */
@Component({
  selector: 'ck-journey',
  imports: [CkGuide],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './ck-journey.html',
  styleUrl: './ck-journey.scss',
  host: {
    '[style.--ck-a]': 'theme().a', '[style.--ck-b]': 'theme().b', '[style.--ck-hi]': 'theme().hi',
  },
})
export class CkJourney {
  /**
   * Widen the staircase into the free room beside it, never under the text or the big me, and
   * size each step's text to fit its face (from 12.5px, never below 9px).
   */
  private layoutStairs(el: HTMLElement): void {
    const climb = el.querySelector<HTMLElement>('.ckj-climb');
    if (!climb) return;
    const card = el.querySelector<HTMLElement>('.ckj')!.getBoundingClientRect();
    const box = climb.getBoundingClientRect();
    const twoColumns = box.top < el.querySelector<HTMLElement>('.ckj-text')!.getBoundingClientRect().bottom;
    let left = card.left + 22;
    if (twoColumns) {
      const blockers = [...el.querySelectorAll<HTMLElement>('.ckj-text > *, .ckj-host')]
        .map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
      const text = el.querySelector<HTMLElement>('.ckj-text')!;
      const range = document.createRange();
      const rights = blockers.map(r => r.right);
      for (const node of text.querySelectorAll('p, h2, li, .ckj-pill')) {
        range.selectNodeContents(node);
        rights.push(range.getBoundingClientRect().right);
      }
      left = Math.max(...rights) + 14;
    }
    climb.style.setProperty('--spill-l', `${Math.max(0, box.left - left)}px`);
    climb.style.setProperty('--spill-r', `${twoColumns ? 0 : Math.max(0, card.right - 10 - box.right)}px`);
    // Width of each step from its content: the longest word it must show (a line wraps at a
    // space or before the @ of an address, never inside a word), at the largest size at which
    // all seven fit; the room left over is shared out by STEP_WEIGHTS.
    const cols = [...el.querySelectorAll<HTMLElement>('.ckj-col')];
    const faceTexts = cols.map(c => c.querySelector<HTMLElement>('.ckj-face-text')!);
    const total = el.querySelector<HTMLElement>('.ckj-cols')!.getBoundingClientRect().width;
    const miniH = cols[0].querySelector<HTMLElement>('.ckj-mini')!.getBoundingClientRect().height;
    const minCol = miniH * 1.26; // neighbouring green flags never reach each other's pole
    const ctx = document.createElement('canvas').getContext('2d')!;
    const style = getComputedStyle(faceTexts[0]);
    const family = style.fontFamily;
    const weight = style.fontWeight;
    const spacing = (parseFloat(style.letterSpacing) || 0) / parseFloat(style.fontSize); // in em
    const words = faceTexts.map(t => [...t.querySelectorAll('.ckj-win')]
      .flatMap(w => (w.textContent ?? '').replace(/@/, ' @').split(/\s+/)).filter(Boolean));
    const need = (size: number) => words.map(ws => {
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.letterSpacing = `${spacing * size}px`;
      return Math.max(minCol, ...ws.map(w => ctx.measureText(w).width + 5));
    });
    let size = 12.5;
    while (size > 9 && need(size).reduce((a, b) => a + b, 0) > total) size -= 0.5;
    const widths = need(size);
    const spare = Math.max(0, total - widths.reduce((a, b) => a + b, 0));
    const weightSum = STEP_WEIGHTS.reduce((a, b) => a + b, 0);
    cols.forEach((c, i) => c.style.flex = `0 0 ${widths[i] + (spare * STEP_WEIGHTS[i]) / weightSum}px`);
    for (const face of faceTexts) {
      let fit = size;
      face.style.fontSize = `${fit}px`;
      const overflows = () => face.scrollHeight > face.clientHeight + 0.5 ||
        [...face.querySelectorAll<HTMLElement>('.ckj-win')].some(w => w.scrollWidth > face.clientWidth + 0.5);
      while (fit > 9 && overflows()) {
        fit -= 0.5;
        face.style.fontSize = `${fit}px`;
      }
    }
  }

  readonly step = input(1);
  readonly place = input('');
  readonly note = input('');
  readonly mood = input<CkMood>('smile');
  readonly mode = input<'path' | 'stairs'>('path');
  /** Welcome card only: the role line, short facts under it, and what each step has achieved. */
  readonly role = input('');
  readonly facts = input<string[]>([]);
  readonly wins = input<string[][]>([]);
  readonly total = STEPS;
  readonly milestones = MILESTONES;

  readonly theme = computed(() => this.mode() === 'stairs'
    ? { a: '#1e293b', b: '#0b1220', hi: '#f7c873', icon: '' }
    : MILESTONES[this.clamped() - 1]);
  readonly clamped = computed(() => Math.min(STEPS, Math.max(1, this.step())));
  readonly num = computed(() => String(this.clamped()).padStart(2, '0'));

  readonly d = (() => {
    const pts: string[] = [];
    for (let x = 0; x <= 100; x += 1) pts.push(`${x === 0 ? 'M' : 'L'}${x} ${pathY(x).toFixed(2)}`);
    return pts.join(' ');
  })();
  readonly flagX = FLAG_AT;
  readonly flagY = pathY(FLAG_AT);
  /** A little me on every step of the welcome staircase, cheering with that step's goal on a flag. */
  readonly goals = STEP_GOALS.map((g, i) => ({
    ...g, n: i + 1, a: MILESTONES[i].a, hi: MILESTONES[i].hi, weight: STEP_WEIGHTS[i],
    delay: `${-0.17 * i}s`,
  }));

  /**
   * What each step has achieved, written on its own face of the staircase: all seven at once,
   * each inside its step, so they never overlap. An address breaks after the @ when it must;
   * on Contact the lines are links.
   */
  readonly faces = computed(() => this.wins().map((lines, i) => lines.map(text => {
    const at = text.indexOf('@');
    const contact = STEP_GOALS[i].id === 'contact';
    return {
      text, head: at > 0 ? text.slice(0, at) : text, tail: at > 0 ? text.slice(at) : '',
      href: !contact ? '' : at > 0 ? `mailto:${text}` : `tel:${text.replace(/[^+\d]/g, '')}`,
    };
  })));

  /** 0 → 1 once, when the card first comes into view: the numbers on the steps count up. */
  readonly progress = signal(1);
  count(text: string, i: number): string {
    const p = this.progress();
    if (p >= 1 || STEP_GOALS[i].id === 'contact') return text;
    return text.replace(/\d+/g, n => String(Math.round(Number(n) * p)));
  }

  readonly stops = Array.from({ length: STEPS }, (_, i) => ({ n: i + 1, x: xOf(i + 1), y: pathY(xOf(i + 1)), hi: MILESTONES[i].hi }));

  /** Where the caricature is right now (percent of the width); y always comes from the path. */
  readonly walkX = signal(xOf(1));
  readonly walkY = computed(() => pathY(this.walkX()));
  readonly arrived = signal(false);
  readonly guideMood = computed<CkMood>(() => (this.arrived() ? this.mood() : 'smile'));
  /** The goal of this step, whose word the big me carries on its green flag. */
  readonly goal = computed(() => STEP_GOALS[this.clamped() - 1]);
  /** True when the carried flag would cross the left edge of the card, so it flies right instead. */
  readonly flagRight = signal(false);

  private placeFlag(el: HTMLElement): void {
    const pole = el.querySelector('.ckj-carry .ckj-mini-pole')?.getBoundingClientRect();
    const cloth = el.querySelector('.ckj-carry .ckj-mini-cloth')?.getBoundingClientRect();
    if (!pole || !cloth) return;
    const card = el.querySelector<HTMLElement>('.ckj')!.getBoundingClientRect();
    this.flagRight.set(pole.left - cloth.width < card.left + 8);
  }

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const to = xOf(this.clamped());
      const from = this.clamped() > 1 ? xOf(this.clamped() - 1) : 0;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined';
      if (this.mode() === 'stairs') {
        this.walkX.set(to); this.arrived.set(true);
        const ro = new ResizeObserver(() => this.layoutStairs(el));
        ro.observe(el);
        destroyRef.onDestroy(() => ro.disconnect());
        this.layoutStairs(el);
        if (still) return;
        this.progress.set(0);
        let raf = 0;
        const io = new IntersectionObserver(([e]) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          const t0 = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - t0) / COUNT_MS);
            this.progress.set(1 - (1 - t) ** 3);
            if (t < 1) raf = requestAnimationFrame(tick); else this.layoutStairs(el);
          };
          raf = requestAnimationFrame(tick);
        }, { threshold: 0.3 });
        io.observe(el);
        destroyRef.onDestroy(() => { io.disconnect(); cancelAnimationFrame(raf); });
        return;
      }
      const ro = new ResizeObserver(() => this.placeFlag(el));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
      if (still) { this.walkX.set(to); this.arrived.set(true); return; }
      this.walkX.set(from);
      let raf = 0;
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / WALK_MS);
          this.walkX.set(from + (to - from) * ease(t));
          this.placeFlag(el);
          if (t < 1) raf = requestAnimationFrame(tick); else this.arrived.set(true);
        };
        raf = requestAnimationFrame(tick);
      }, { threshold: 0.5 });
      io.observe(el);
      destroyRef.onDestroy(() => { io.disconnect(); cancelAnimationFrame(raf); });
    });
  }
}
