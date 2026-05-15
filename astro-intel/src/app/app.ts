import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="gw" aria-hidden="true"></div>
    <router-outlet />
  `,
  styles: [`
    :host { display: block; }

    /* Rav logo brand stamp — bottom-right, clearly visible golden mark */
    .gw {
      position: fixed;
      bottom: 24px;
      right: 28px;
      width: 120px;
      height: 120px;
      background: url('/rav-logo.png') center / contain no-repeat;
      filter: sepia(1) saturate(6) hue-rotate(5deg) brightness(0.85);
      opacity: 0.35;
      pointer-events: none;
      z-index: 9999;
    }

    @media print {
      .gw { display: none !important; }
    }
  `]
})
export class App {}
