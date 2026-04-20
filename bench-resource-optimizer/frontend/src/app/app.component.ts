import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="container">
        <div class="header-inner">
          <div class="brand">
            <span class="brand-icon">⚡</span>
            <span>Bench Resource Optimizer</span>
          </div>
          <nav>
            <a routerLink="/upload" routerLinkActive="active">1. Upload CV</a>
            <a routerLink="/mapping" routerLinkActive="active">2. Role Mapping</a>
            <a routerLink="/dashboard" routerLinkActive="active">3. Dashboard</a>
          </nav>
        </div>
      </div>
    </header>
    <main class="container" style="padding-top:32px; padding-bottom:48px;">
      <router-outlet />
    </main>
  `,
  styles: [`
    .header {
      background: #1e293b;
      color: #fff;
      padding: 14px 0;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-icon { font-size: 22px; }
    nav { display: flex; gap: 8px; }
    nav a {
      color: #94a3b8;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;
    }
    nav a:hover { color: #fff; background: rgba(255,255,255,0.08); }
    nav a.active { color: #fff; background: #3b82f6; }
  `],
})
export class AppComponent {}
