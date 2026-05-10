import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-icon">⚡</span>
          <span class="brand-name">Bench Resource Optimizer</span>
          <span class="brand-tag">Enterprise</span>
        </div>
        <nav class="nav">
          <a routerLink="/upload"    routerLinkActive="nav-active" class="nav-link">1. Upload CV</a>
          <a routerLink="/mapping"   routerLinkActive="nav-active" class="nav-link">2. Role Mapping</a>
          <a routerLink="/dashboard" routerLinkActive="nav-active" class="nav-link">3. Dashboard</a>
          <a routerLink="/metrics"   routerLinkActive="nav-active" class="nav-link nav-link-outline">Metrics</a>
          <a routerLink="/admin"     routerLinkActive="nav-active" class="nav-link nav-link-admin">HR Admin</a>
          <a routerLink="/graph"     routerLinkActive="nav-active" class="nav-link nav-link-graph">Agent Graph</a>
        </nav>
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
      padding: 0 32px;
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
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      font-size: 22px;
      line-height: 1;
    }
    .brand-name {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
    }
    .brand-tag {
      background: #3b82f6;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .nav-link {
      display: inline-block;
      color: #cbd5e1;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .nav-link:hover {
      color: #ffffff;
      background: rgba(255,255,255,0.1);
    }
    .nav-link.nav-active {
      color: #ffffff;
      background: #3b82f6;
    }
    .nav-link-outline {
      border: 1px solid rgba(203,213,225,0.3);
      margin-left: 8px;
    }
    .nav-link-outline:hover {
      border-color: rgba(255,255,255,0.4);
    }
    .nav-link-outline.nav-active {
      background: #475569;
      border-color: transparent;
    }
    .nav-link-admin {
      color: #fca5a5;
      border: 1px solid rgba(239,68,68,0.35);
    }
    .nav-link-admin:hover {
      color: #ffffff;
      background: rgba(239,68,68,0.2);
      border-color: rgba(239,68,68,0.5);
    }
    .nav-link-admin.nav-active {
      background: #dc2626;
      color: #ffffff;
      border-color: transparent;
    }
    .nav-link-graph {
      color: #7dd3fc;
      border: 1px solid rgba(125,211,252,0.3);
    }
    .nav-link-graph:hover {
      color: #ffffff;
      background: rgba(14,165,233,0.2);
      border-color: rgba(125,211,252,0.5);
    }
    .nav-link-graph.nav-active {
      background: #0ea5e9;
      color: #ffffff;
      border-color: transparent;
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
export class AppComponent {}
