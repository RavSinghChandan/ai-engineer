import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { CkGuide, CkMood, CkPose } from './ck-guide';

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
/** The staircase takes this share of the climb's height, leaving room above for the little ones. */
const STAIRS_H = 62;

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
  readonly step = input(1);
  readonly place = input('');
  readonly note = input('');
  readonly mood = input<CkMood>('smile');
  readonly pose = input<CkPose>('wave');
  readonly mode = input<'path' | 'stairs'>('path');
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
    ...g, n: i + 1, a: MILESTONES[i].a,
    left: ((i + 0.5) / STEPS) * 100,
    bottom: (STAIRS_H * (i + 1)) / STEPS,
    delay: `${-0.17 * i}s`,
  }));
  readonly stairsH = STAIRS_H;

  readonly stops = Array.from({ length: STEPS }, (_, i) => ({ n: i + 1, x: xOf(i + 1), y: pathY(xOf(i + 1)), hi: MILESTONES[i].hi }));

  /** Where the caricature is right now (percent of the width); y always comes from the path. */
  readonly walkX = signal(xOf(1));
  readonly walkY = computed(() => pathY(this.walkX()));
  readonly arrived = signal(false);
  readonly guideMood = computed<CkMood>(() => (this.arrived() ? this.mood() : 'smile'));
  readonly guidePose = computed<CkPose>(() => (this.arrived() ? this.pose() : 'swing'));

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const to = xOf(this.clamped());
      const from = this.clamped() > 1 ? xOf(this.clamped() - 1) : 0;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined';
      if (still || this.mode() === 'stairs') { this.walkX.set(to); this.arrived.set(true); return; }
      this.walkX.set(from);
      let raf = 0;
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / WALK_MS);
          this.walkX.set(from + (to - from) * ease(t));
          if (t < 1) raf = requestAnimationFrame(tick); else this.arrived.set(true);
        };
        raf = requestAnimationFrame(tick);
      }, { threshold: 0.5 });
      io.observe(el);
      destroyRef.onDestroy(() => { io.disconnect(); cancelAnimationFrame(raf); });
    });
  }
}
