import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';
import { CkGuide, CkMood, CkPose } from './ck-guide';

const STEPS = 7;
const PATH_FROM = 6;     // percent of the width where the path starts
const PATH_TO = 84;      // ...and where the last waypoint sits
const FLAG_AT = 94;

/** Height of the path (0 = top, 100 = bottom of the scene) at a given percent of the width: a gentle hill. */
function pathY(x: number): number {
  const t = x / 100;
  return 84 - 26 * (t * t * (3 - 2 * t)) + 4 * Math.sin(t * 18);
}

/**
 * The "You are on Step N" banner: a chalkboard with the hand-drawn path, the walking caricature
 * at this section's waypoint and the flag at the end. `stairs` mode is the welcome band that
 * climbs a staircase instead.
 */
@Component({
  selector: 'ck-journey',
  imports: [CkGuide],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './ck-journey.html',
  styleUrl: './ck-journey.scss',
})
export class CkJourney {
  readonly step = input(1);
  readonly place = input('');
  readonly note = input('');
  readonly mood = input<CkMood>('smile');
  readonly pose = input<CkPose>('wave');
  readonly mode = input<'path' | 'stairs'>('path');
  readonly total = STEPS;

  readonly d = (() => {
    const pts: string[] = [];
    for (let x = 0; x <= 100; x += 2) pts.push(`${x === 0 ? 'M' : 'L'}${x} ${pathY(x).toFixed(2)}`);
    return pts.join(' ');
  })();
  readonly flagX = FLAG_AT;
  readonly flagY = pathY(FLAG_AT);
  /** Fraction of the path already walked, for the solid chalk line. */
  readonly progress = computed(() => this.xOf(this.step()) / 100);
  readonly stops = Array.from({ length: STEPS }, (_, i) => ({ n: i + 1, x: this.xOf(i + 1), y: pathY(this.xOf(i + 1)) }));
  readonly me = computed(() => this.stops[Math.min(STEPS, Math.max(1, this.step())) - 1]);

  private xOf(n: number): number {
    return PATH_FROM + ((n - 1) / (STEPS - 1)) * (PATH_TO - PATH_FROM);
  }
}
