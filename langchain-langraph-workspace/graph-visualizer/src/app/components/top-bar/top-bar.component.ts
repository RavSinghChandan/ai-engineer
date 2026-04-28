import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionEngineService } from '../../services/execution-engine.service';

@Component({
  selector: 'gv-top-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (adapter()) {
      <header class="top-bar">

        <!-- Left: logo + brand name + tagline -->
        <div class="tb-left">
          <!-- Logo image (the brain circuit "AI with Rav" mark) -->
          <img class="logo-img" src="assets/logo.png" alt="AI with Rav logo"
               onerror="this.style.display='none'">

          <div class="brand-block">
            <div class="brand-name">
              AI with Rav
              <span class="brand-accent" [style.color]="adapter()!.accentColor">
                {{ adapter()!.accentWord }}
              </span>
            </div>
            <div class="brand-tagline">{{ adapter()!.productTagline }}</div>
          </div>
        </div>

        <!-- Center: badges (hidden on narrow screens via overflow) -->
        <div class="tb-badges">
          @for (badge of adapter()!.topBadges; track badge) {
            <span class="tb-badge"
                  [style.color]="adapter()!.accentColor"
                  [style.border-color]="adapter()!.accentColor + '30'"
                  [style.background]="adapter()!.accentColor + '0d'">
              {{ badge }}
            </span>
          }
        </div>

        <!-- Right: presenter name + avatar -->
        @if (adapter()!.presenterName) {
          <div class="presenter">
            <div class="presenter-info">
              <span class="presenter-name">{{ adapter()!.presenterName }}</span>
              @if (adapter()!.presenterRole) {
                <span class="presenter-role">{{ adapter()!.presenterRole }}</span>
              }
            </div>
            <div class="avatar-wrap" [style.outline-color]="adapter()!.accentColor + '55'">
              <img class="avatar-img" src="assets/avatar-photo.jpg" alt="Chandan Kumar"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
              <div class="avatar-initials"
                   [style.background]="adapter()!.accentColor + '20'"
                   [style.color]="adapter()!.accentColor">
                {{ presenterInitials() }}
              </div>
            </div>
          </div>
        }

      </header>
    }
  `,
  styles: [`
    .top-bar {
      display: flex; align-items: center;
      padding: 0 18px;
      height: 54px;
      background: #ffffff;
      border-bottom: 1px solid #e8eaf0;
      flex-shrink: 0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      gap: 12px;
      overflow: hidden;
    }

    /* ── Left block ── */
    .tb-left {
      display: flex; align-items: center; gap: 10px;
      flex-shrink: 0; min-width: 0;
    }

    /* Logo: show only the brain icon — crop the text portion of the PNG */
    .logo-img {
      height: 40px;
      width: 40px;
      object-fit: cover;
      object-position: left center;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .brand-block {
      display: flex; flex-direction: column; gap: 1px; min-width: 0;
    }
    .brand-name {
      font-size: 14px; font-weight: 800; color: #111827;
      letter-spacing: -0.025em; white-space: nowrap; line-height: 1.2;
    }
    .brand-accent {
      font-weight: 800; letter-spacing: -0.025em;
    }
    .brand-tagline {
      font-size: 9.5px; color: #9ca3af; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 200px; line-height: 1.2;
    }

    /* ── Center badges ── */
    .tb-badges {
      flex: 1; display: flex; align-items: center;
      justify-content: center; gap: 5px;
      overflow: hidden; min-width: 0;
    }
    .tb-badge {
      font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
      padding: 3px 10px; border-radius: 99px; border: 1px solid;
      white-space: nowrap; flex-shrink: 0;
    }

    /* ── Right: presenter ── */
    .presenter {
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    }
    .presenter-info {
      display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
    }
    .presenter-name {
      font-size: 11px; font-weight: 700; color: #111827; white-space: nowrap; line-height: 1.2;
    }
    .presenter-role {
      font-size: 9px; color: #9ca3af; white-space: nowrap; line-height: 1.2;
    }

    .avatar-wrap {
      width: 38px; height: 38px; border-radius: 50%;
      outline: 2px solid transparent; outline-offset: 1px;
      position: relative; flex-shrink: 0; overflow: hidden;
      border: 2px solid #e8eaf0;
    }
    .avatar-img {
      width: 100%; height: 100%; border-radius: 50%;
      object-fit: cover; object-position: center top;
      display: block;
    }
    .avatar-initials {
      display: none;
      width: 100%; height: 100%; border-radius: 50%;
      align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800;
    }
  `]
})
export class TopBarComponent {
  private eng = inject(ExecutionEngineService);
  readonly adapter = this.eng.adapter;

  presenterInitials(): string {
    const name = this.adapter()?.presenterName ?? '';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
}
