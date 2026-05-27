import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-icon">⚡</span>
          <span class="brand-name">Bench Resource Optimizer</span>
          <span class="brand-tag">Enterprise</span>
        </div>

        <nav class="nav" *ngIf="auth.isLoggedIn()">
          <a routerLink="/upload"    routerLinkActive="nav-active" class="nav-link">1. Upload CV</a>
          <a routerLink="/mapping"   routerLinkActive="nav-active" class="nav-link">2. Role Mapping</a>
          <a routerLink="/dashboard" routerLinkActive="nav-active" class="nav-link">3. Dashboard</a>
          <a routerLink="/memory"    routerLinkActive="nav-active" class="nav-link nav-link-memory">Memory</a>
          <a routerLink="/metrics"   routerLinkActive="nav-active" class="nav-link nav-link-outline">Metrics</a>
          <a routerLink="/admin"     routerLinkActive="nav-active" class="nav-link nav-link-admin"
             *ngIf="auth.isAdmin()">HR Admin</a>
          <a routerLink="/graph"     routerLinkActive="nav-active" class="nav-link nav-link-graph">Agent Graph</a>
        </nav>

        <div class="user-area" *ngIf="auth.isLoggedIn()">
          <div class="user-chip">
            <span class="user-avatar">{{ userInitial }}</span>
            <span class="user-id">{{ auth.currentUser()?.user_id }}</span>
            <span class="role-badge" [class.role-admin]="auth.isAdmin()">
              {{ auth.isAdmin() ? 'Admin' : 'User' }}
            </span>
          </div>
          <button class="btn-logout" (click)="auth.logout()">Sign out</button>
        </div>
      </div>
    </header>

    <main class="main-content">
      <div class="page-container">
        <router-outlet />
      </div>
    </main>
  `,
  styles: [`
    .header {
      background: #1e293b;
      padding: 0 24px;
      height: 56px;
      display: flex;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .header-inner {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .brand-icon  { font-size: 22px; line-height: 1; }
    .brand-name  { font-size: 16px; font-weight: 700; color: #ffffff; white-space: nowrap; }
    .brand-tag   {
      background: #3b82f6; color: #ffffff;
      font-size: 10px; font-weight: 700;
      padding: 2px 7px; border-radius: 4px;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: 1;
      justify-content: center;
      flex-wrap: wrap;
    }
    .nav-link {
      display: inline-block; color: #cbd5e1; text-decoration: none;
      padding: 5px 11px; border-radius: 6px; font-size: 13px; font-weight: 500;
      transition: all 0.15s; white-space: nowrap;
    }
    .nav-link:hover          { color: #ffffff; background: rgba(255,255,255,0.1); }
    .nav-link.nav-active     { color: #ffffff; background: #3b82f6; }
    .nav-link-outline        { border: 1px solid rgba(203,213,225,0.3); margin-left: 4px; }
    .nav-link-outline:hover  { border-color: rgba(255,255,255,0.4); }
    .nav-link-outline.nav-active { background: #475569; border-color: transparent; }
    .nav-link-admin          { color: #fca5a5; border: 1px solid rgba(239,68,68,0.35); }
    .nav-link-admin:hover    { color: #fff; background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.5); }
    .nav-link-admin.nav-active { background: #dc2626; color: #fff; border-color: transparent; }
    .nav-link-memory         { color: #c4b5fd; border: 1px solid rgba(167,139,250,0.3); }
    .nav-link-memory:hover   { color: #fff; background: rgba(124,58,237,0.2); }
    .nav-link-memory.nav-active { background: #7c3aed; color: #fff; border-color: transparent; }
    .nav-link-graph          { color: #7dd3fc; border: 1px solid rgba(125,211,252,0.3); }
    .nav-link-graph:hover    { color: #fff; background: rgba(14,165,233,0.2); }
    .nav-link-graph.nav-active { background: #0ea5e9; color: #fff; border-color: transparent; }

    /* ── User area ─────────────────────────────────────────────────── */
    .user-area {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .user-chip {
      display: flex;
      align-items: center;
      gap: 7px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 4px 12px 4px 5px;
    }
    .user-avatar {
      width: 26px; height: 26px;
      background: #3b82f6;
      color: #fff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      text-transform: uppercase;
    }
    .user-id {
      font-size: 13px;
      font-weight: 500;
      color: #e2e8f0;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .role-badge {
      font-size: 10px; font-weight: 700;
      padding: 1px 6px; border-radius: 4px;
      background: #334155; color: #94a3b8;
      text-transform: uppercase;
    }
    .role-badge.role-admin {
      background: #451a03; color: #fbbf24;
    }
    .btn-logout {
      background: transparent;
      border: 1px solid rgba(203,213,225,0.3);
      color: #94a3b8;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-logout:hover {
      border-color: #ef4444;
      color: #ef4444;
      background: rgba(239,68,68,0.08);
    }

    .main-content {
      background: #f1f5f9;
      min-height: calc(100vh - 56px);
      padding: 32px 0 60px;
    }
    .page-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 32px;
    }
  `],
})
export class AppComponent {
  auth = inject(AuthService);

  get userInitial(): string {
    return (this.auth.currentUser()?.user_id ?? '?')[0].toUpperCase();
  }
}
