import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input } from '@angular/core';

export type CkMood = 'smile' | 'excited' | 'think' | 'confident' | 'wow' | 'wink' | 'laugh';
export type CkPose = 'none' | 'swing' | 'wave' | 'point' | 'think' | 'type' | 'present' | 'cheer' | 'climb';
export type CkForm = 'bust' | 'full' | 'face';

interface Arm {
  shoulder: [number, number];
  upper: string; elbow: [number, number]; fore: string;
  crease: string; cuff: string; hand: string; handAt: string;
  cls: string;
}

/** Arm shapes: shoulder, elbow and wrist quads with the same radii, cuff and crease as the How I Work cards. */
const WAVE: Arm = {
  shoulder: [150, 190], upper: 'M153.1 204.7L180.6 196.2L175.4 171.8L146.9 175.3Z', elbow: [178, 184],
  fore: 'M189.5 188.9L199.2 159.9L180.8 152.1L166.5 179.1Z', crease: 'M187.2 180.3Q181.9 174.8 176.2 175.6',
  cuff: 'M198.2 166L201.2 159.2L180 150.1L177.1 157Z', hand: 'open', handAt: 'translate(190 156) rotate(-72.8)', cls: 'fx-arm--wave',
};
/** Arm hanging at the side: shoulder (150,190), elbow (162,232), wrist (166,268). */
const HANG: Arm = {
  shoulder: [150, 190], upper: 'M164.4 185.9L174 228.6L150 235.4L135.6 194.1Z', elbow: [162, 232],
  fore: 'M174.4 230.6L175.9 266.9L156.1 269.1L149.6 233.4Z', crease: 'M170.5 236Q163 240 156 236',
  cuff: 'M177 261L177.6 270L154.6 272.4L154 263.4Z', hand: 'open', handAt: 'translate(166 270) rotate(84)', cls: 'ckg-arm--still',
};
const ARMS: Record<Exclude<CkPose, 'none' | 'climb'>, Arm> = {
  wave: WAVE,
  swing: { ...HANG, cls: 'ckg-arm--swing' },
  cheer: { ...WAVE, hand: 'fist', cls: 'ckg-arm--cheer' },
  point: {
    shoulder: [150, 190], upper: 'M158.9 202.1L195.4 172.1L180.6 151.9L141.1 177.9Z', elbow: [188, 162],
    fore: 'M198.2 169.2L220.2 133.8L203.8 122.2L177.8 154.8Z', crease: 'M197.8 160.3Q193.8 153.8 188 153.4',
    cuff: 'M217.9 139.5L222.3 133.4L203.5 120.1L199.1 126.3Z', hand: 'point', handAt: 'translate(212 128) rotate(-54.8)', cls: 'fx-arm--point',
  },
  think: {
    shoulder: [148, 192], upper: 'M133.8 187.3L128.1 212L151.9 220L162.2 196.7Z', elbow: [140, 216],
    fore: 'M150.8 209.6L122.6 166.9L105.4 177.1L129.2 222.4Z', crease: 'M142.5 206.4Q134.9 207.4 132.1 212.5',
    cuff: 'M127 171.3L123.1 164.9L103.3 176.6L107.2 183Z', hand: 'fist', handAt: 'translate(114 172) rotate(-128.6)', cls: 'fx-arm--chin',
  },
  type: {
    shoulder: [150, 190], upper: 'M139.4 200.6L163.2 220.8L180.8 203.2L160.6 179.4Z', elbow: [172, 212],
    fore: 'M179.9 221.7L210.3 193.8L197.7 178.2L164.1 202.3Z', crease: 'M181.8 213Q179.8 205.7 174.3 203.7',
    cuff: 'M206.6 198.7L212.4 194L197.9 176.1L192.1 180.9Z', hand: 'flat', handAt: 'translate(204 186) rotate(-3.1)', cls: 'fx-arm--type',
  },
  present: {
    shoulder: [150, 190], upper: 'M156.2 203.7L177.2 191.4L166.8 168.6L143.8 176.3Z', elbow: [172, 180],
    fore: 'M183.2 185.6L194.9 156.5L177.1 147.5L160.8 174.4Z', crease: 'M181.4 176.9Q176.5 171.1 170.7 171.5',
    cuff: 'M193.6 162.5L197 155.8L176.4 145.5L173 152.2Z', hand: 'open', handAt: 'translate(186 152) rotate(-67.4)', cls: 'fx-arm--point',
  },
};

/** The caricature of Chandan: one character, seven moods, a handful of poses, three crops. */
@Component({
  selector: 'ck-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="ckg-svg" [attr.viewBox]="box()" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      @if (form() === 'full') {
        <g class="ckg-bob" [class.ckg-walk]="walking()">
          <!-- legs first; the knee-length kurta covers the hips, as in the photo -->
          @if (pose() === 'climb') {
            <g class="ckg-leg ckg-leg--a"><path d="M86 300V372" class="ckg-pant-ink"/><path d="M86 300V372" class="ckg-pant"/><path d="M78 360q8 3 16 0M78 366q8 3 16 0" class="ckg-gather"/><path d="M70 372H98Q110 376 113 386H68Q64 379 70 372Z" class="ckg-shoe"/></g>
            <g class="ckg-leg ckg-leg--up"><path d="M116 300L160 308L162 326" class="ckg-pant-ink"/><path d="M116 300L160 308L162 326" class="ckg-pant"/><path d="M146 326H176Q188 330 190 338H144Q140 331 146 326Z" class="ckg-shoe"/></g>
            <path d="M24 218H176C178 252 188 284 198 306Q162 312 132 326Q80 346 26 338C25 302 24 262 24 218Z" class="ckg-kurta"/>
          } @else {
            <g class="ckg-leg ckg-leg--a"><path d="M86 300V372" class="ckg-pant-ink"/><path d="M86 300V372" class="ckg-pant"/><path d="M78 360q8 3 16 0M78 366q8 3 16 0" class="ckg-gather"/><path d="M70 372H98Q110 376 113 386H68Q64 379 70 372Z" class="ckg-shoe"/></g>
            <g class="ckg-leg ckg-leg--b"><path d="M114 300V372" class="ckg-pant-ink"/><path d="M114 300V372" class="ckg-pant"/><path d="M106 360q8 3 16 0M106 366q8 3 16 0" class="ckg-gather"/><path d="M98 372H126Q138 376 141 386H96Q92 379 98 372Z" class="ckg-shoe"/></g>
            <path d="M24 218H176C176 262 175 302 174 338Q100 348 26 338C25 302 24 262 24 218Z" class="ckg-kurta"/>
            <path d="M25 224C25 264 26 304 27 338L42 340C40 304 39 264 40 224ZM175 224C175 264 174 304 173 338L158 340C160 304 161 264 160 224Z" class="ckg-shade"/>
            <path d="M30 302L27 338M170 302L173 338" class="ckg-slit"/>
          }
          <path d="M64 244q-3 40-6 86M136 244q3 40 6 86M100 236v96" class="ckg-fold"/>
          <use href="#fx-body"/>
          <ng-container [ngTemplateOutlet]="top"/>
        </g>
      } @else {
        @if (form() === 'bust') { <use href="#fx-body"/> }
        <ng-container [ngTemplateOutlet]="top"/>
      }
    </svg>

    <ng-template #top>
      <svg:g class="fx-headmove"><use href="#fx-head"/>
        <g class="fx-eyes">
          <ellipse cx="73.5" cy="92" rx="10" ry="7.6" fill="#fff"/><ellipse cx="126.5" cy="92" rx="10" ry="7.6" fill="#fff"/>
          <g class="fx-look">
            <circle cx="73.5" cy="92" r="5.3" fill="url(#fx-iris)"/><circle cx="126.5" cy="92" r="5.3" fill="url(#fx-iris)"/>
            <circle cx="73.5" cy="92" r="2.7" fill="#0f0805"/><circle cx="126.5" cy="92" r="2.7" fill="#0f0805"/>
            <circle cx="75.4" cy="90" r="1.5" fill="#fff"/><circle cx="128.4" cy="90" r="1.5" fill="#fff"/>
          </g>
          <path d="M63 90Q73.5 81.5 84 90M116 90Q126.5 81.5 137 90" stroke="#1b1316" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        </g>
        <path d="M58 83L66 83M111 83L119 83" stroke="#fff" opacity=".55" stroke-width="2.6" stroke-linecap="round"/>
        @if (mood() === 'laugh' || mood() === 'wink') {
          <!-- closed eyes: skin over the eye, a happy arc on top -->
          @if (mood() === 'laugh') { <ellipse cx="73.5" cy="92" rx="11.5" ry="9" fill="#d4925f"/><path d="M63.5 94Q73.5 84 83.5 94" stroke="#1b1316" stroke-width="3" fill="none" stroke-linecap="round"/> }
          <ellipse cx="126.5" cy="92" rx="11.5" ry="9" fill="#d4925f"/><path d="M116.5 94Q126.5 84 136.5 94" stroke="#1b1316" stroke-width="3" fill="none" stroke-linecap="round"/>
        }
        @switch (mood()) {
          @case ('smile') {
            <g class="fx-brows"><path d="M56 71C64 63 78 61 91 66C91 69 90 71 89 72C78 68 67 69 58 75C56 74 55 72 56 71Z" fill="#17151d"/><path d="M144 71C136 63 122 61 109 66C109 69 110 71 111 72C122 68 133 69 142 75C144 74 145 72 144 71Z" fill="#17151d"/></g>
            <g class="fx-mouth"><path d="M81 133C87 151 113 151 119 133C112 136.5 88 136.5 81 133Z" fill="#4a1414"/><path d="M84.5 134C92 136.8 108 136.8 115.5 134C114 138 108 139.6 100 139.6C92 139.6 86 138 84.5 134Z" fill="#fff"/><path d="M91 144.5C96 142 104 142 109 144.5C104 147.6 96 147.6 91 144.5Z" fill="#c2544a"/></g>
          }
          @case ('excited') {
            <g class="fx-brows"><path d="M56 66C64 57 78 55 91 61C91 64 90 66 89 67C78 63 67 64 58 70C56 69 55 67 56 66Z" fill="#17151d"/><path d="M144 66C136 57 122 55 109 61C109 64 110 66 111 67C122 63 133 64 142 70C144 69 145 67 144 66Z" fill="#17151d"/></g>
            <g class="fx-mouth"><path d="M82 132C84 153 116 153 118 132C110 135 90 135 82 132Z" fill="#4a1414"/><path d="M85 133C92 135.6 108 135.6 115 133C114 136.6 108 138 100 138C92 138 86 136.6 85 133Z" fill="#fff"/><path d="M88 146.5C95 143 105 143 112 146.5C106 151 94 151 88 146.5Z" fill="#c2544a"/></g>
          }
          @case ('think') {
            <g class="fx-brows"><path d="M56 66C64 56 78 54 91 60C91 63 90 65 89 66C78 62 67 63 58 70C56 69 55 67 56 66Z" fill="#17151d"/><path d="M144 75C136 70 122 69 109 72C109 75 110 77 111 78C122 75 133 75 142 79C144 78 145 76 144 75Z" fill="#17151d"/></g>
            <path d="M89 140C95 137 103 136.5 110 139.5C104 141.5 96 142 89 140Z" fill="#8f3f33"/>
          }
          @case ('confident') {
            <g class="fx-brows"><path d="M56 72C64 66 78 64 91 68C91 71 90 73 89 74C78 71 67 71 58 77C56 76 55 74 56 72Z" fill="#17151d"/><path d="M144 72C136 66 122 64 109 68C109 71 110 73 111 74C122 71 133 71 142 77C144 76 145 74 144 72Z" fill="#17151d"/></g>
            <path d="M83 134.5Q100 147.5 117 133.5Q100 141 83 134.5Z" fill="#8f3f33"/><path d="M85.5 135Q100 140 114.5 134.5" stroke="#f3e5d8" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          }
          @case ('wow') {
            <g class="fx-brows"><path d="M56 60C64 50 78 48 91 54C91 57 90 59 89 60C78 56 67 57 58 64C56 63 55 61 56 60Z" fill="#17151d"/><path d="M144 60C136 50 122 48 109 54C109 57 110 59 111 60C122 56 133 57 142 64C144 63 145 61 144 60Z" fill="#17151d"/></g>
            <g class="fx-mouth"><ellipse cx="100" cy="141" rx="8.5" ry="11" fill="#4a1414"/><path d="M93 146C97 143 103 143 107 146C103 150 97 150 93 146Z" fill="#c2544a"/></g>
          }
          @case ('wink') {
            <g class="fx-brows"><path d="M56 71C64 63 78 61 91 66C91 69 90 71 89 72C78 68 67 69 58 75C56 74 55 72 56 71Z" fill="#17151d"/><path d="M144 76C136 69 122 68 109 71C109 74 110 76 111 77C122 74 133 74 142 80C144 79 145 77 144 76Z" fill="#17151d"/></g>
            <path d="M83 134Q100 148 118 131Q102 140 83 134Z" fill="#8f3f33"/><path d="M85.5 135Q100 140.5 115 133" stroke="#f3e5d8" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          }
          @case ('laugh') {
            <g class="fx-brows"><path d="M56 66C64 57 78 55 91 61C91 64 90 66 89 67C78 63 67 64 58 70C56 69 55 67 56 66Z" fill="#17151d"/><path d="M144 66C136 57 122 55 109 61C109 64 110 66 111 67C122 63 133 64 142 70C144 69 145 67 144 66Z" fill="#17151d"/></g>
            <g class="fx-mouth"><path d="M78 130C80 158 120 158 122 130C112 134 88 134 78 130Z" fill="#4a1414"/><path d="M82 131C91 134 109 134 118 131C117 136 109 138 100 138C91 138 83 136 82 131Z" fill="#fff"/><path d="M87 149C95 144 105 144 113 149C106 155 94 155 87 149Z" fill="#c2544a"/></g>
          }
        }
      </svg:g>
      @if (arm(); as a) {
        <ng-container [ngTemplateOutlet]="armTpl" [ngTemplateOutletContext]="{ a: a, mirror: false }"/>
        @if (form() === 'full') { <svg:g transform="translate(200 0) scale(-1 1)"><ng-container [ngTemplateOutlet]="armTpl" [ngTemplateOutletContext]="{ a: otherArm(), mirror: true }"/></svg:g> }
      }
    </ng-template>

    <ng-template #armTpl let-a="a" let-mirror="mirror">
      <svg:g [class]="'fx-arm ' + a.cls + (mirror ? ' ckg-arm--mirror' : '')">
        <g fill="#3d4350" stroke="#3d4350" stroke-width="3" stroke-linejoin="round">
          <path [attr.d]="a.upper"/><circle [attr.cx]="a.elbow[0]" [attr.cy]="a.elbow[1]" r="12.5"/><path [attr.d]="a.fore"/>
        </g>
        <g fill="url(#fx-sleeve)">
          <circle [attr.cx]="a.shoulder[0]" [attr.cy]="a.shoulder[1]" r="15"/><path [attr.d]="a.upper"/>
          <circle [attr.cx]="a.elbow[0]" [attr.cy]="a.elbow[1]" r="12.5"/><path [attr.d]="a.fore"/>
        </g>
        <path [attr.d]="a.crease" stroke="#a3abba" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path [attr.d]="a.cuff" fill="#fbfcfe" stroke="#3d4350" stroke-width="1.3" stroke-linejoin="round"/>
        <use [attr.href]="'#fx-hand-' + a.hand" [attr.transform]="a.handAt"/>
      </svg:g>
    </ng-template>
  `,
  host: { class: 'ckg', '[class.ckg-full]': "form() === 'full'", '[class.ckg-face]': "form() === 'face'" },
  imports: [NgTemplateOutlet],
})
export class CkGuide {
  readonly mood = input<CkMood>('smile');
  readonly pose = input<CkPose>('none');
  readonly form = input<CkForm>('bust');
  readonly walking = input(false);

  readonly arm = computed<Arm | null>(() => {
    const p = this.pose();
    if (this.form() === 'face') return null;
    if (p === 'climb') return { ...ARMS.cheer, cls: 'ckg-arm--still' };
    // the full body always shows the second arm, so 'none' there means both arms hang
    return p === 'none' ? (this.form() === 'full' ? HANG : null) : ARMS[p];
  });
  /** The left arm of the full body (drawn mirrored). */
  readonly otherArm = computed<Arm>(() => {
    const p = this.pose();
    if (p === 'climb') return { ...ARMS.cheer, cls: 'ckg-arm--still' };
    return p === 'swing' ? { ...HANG, cls: 'ckg-arm--swing ckg-arm--swing-b' } : HANG;
  });
  readonly box = computed(() => {
    switch (this.form()) {
      case 'full': return '0 4 230 392';
      case 'face': return '36 8 128 168';
      default: return '0 4 230 222';
    }
  });

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    // animations only run while the character is on screen
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') { el.classList.add('ckg-live'); return; }
      const io = new IntersectionObserver(([e]) => el.classList.toggle('ckg-live', e.isIntersecting), { rootMargin: '80px' });
      io.observe(el);
      destroyRef.onDestroy(() => io.disconnect());
    });
  }
}
