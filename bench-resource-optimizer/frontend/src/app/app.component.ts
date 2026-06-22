import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { BenchAgentComponent } from './components/bench-agent/bench-agent.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, BenchAgentComponent],
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
          <a routerLink="/profile" class="user-chip" title="View my profile">
            <span class="user-avatar">{{ userInitial }}</span>
            <span class="user-id">{{ auth.currentUser()?.user_id }}</span>
            <span class="role-badge" [class.role-admin]="auth.isAdmin()">
              {{ auth.isAdmin() ? 'Admin' : 'User' }}
            </span>
          </a>
          <button class="btn-logout" (click)="auth.logout()">Sign out</button>
        </div>
      </div>
    </header>

    <main class="main-content">
      <div class="page-container">
        <router-outlet />
      </div>
    </main>

    <!-- ── Footer ───────────────────────────────────────────────────── -->
    <footer class="footer">
      <div class="footer-inner">

        <!-- Brand column -->
        <div class="f-brand">
          <div class="f-logo">
            <span class="f-logo-icon">⚡</span>
            <span class="f-logo-name">Bench Resource Optimizer</span>
          </div>
          <p class="f-tagline">Enterprise AI platform that turns bench time into readiness.</p>
          <div class="f-badges">
            <span class="f-badge">FastAPI 3.0</span>
            <span class="f-badge">Angular 17</span>
            <span class="f-badge">DeepSeek LLM</span>
            <span class="f-badge f-badge-green">94.7% Coverage</span>
          </div>
          <p class="f-built">Built by <strong>Chandan Kumar</strong> · Senior AI Engineer</p>
        </div>

        <!-- Pipeline column -->
        <div class="f-col">
          <h4 class="f-heading">RAG Pipeline</h4>
          <ul class="f-list">
            <li><span class="f-dot blue"></span>FAISS + BM25 + RRF Fusion</li>
            <li><span class="f-dot blue"></span>HyDE Query Expansion</li>
            <li><span class="f-dot blue"></span>CRAG Quality Scoring</li>
            <li><span class="f-dot blue"></span>Cross-Encoder Reranker</li>
            <li><span class="f-dot blue"></span>Semantic Cache L1 / L2</li>
          </ul>
        </div>

        <!-- Guardrails column -->
        <div class="f-col">
          <h4 class="f-heading">Guardrails G1–G5</h4>
          <ul class="f-list">
            <li><span class="f-dot green"></span>G1 — Rate Limiter (60/min)</li>
            <li><span class="f-dot green"></span>G2 — Circuit Breaker</li>
            <li><span class="f-dot green"></span>G3 — JSON Repair Cascade</li>
            <li><span class="f-dot green"></span>G4 — PII Output Filter</li>
            <li><span class="f-dot green"></span>G5 — Graceful Degradation</li>
          </ul>
        </div>

        <!-- Platform column -->
        <div class="f-col">
          <h4 class="f-heading">Platform</h4>
          <ul class="f-list">
            <li><span class="f-dot purple"></span>4 LLM Agents</li>
            <li><span class="f-dot purple"></span>Episodic + Long-term Memory</li>
            <li><span class="f-dot purple"></span>SSE Token Streaming</li>
            <li><span class="f-dot purple"></span>JWT RBAC Auth</li>
            <li><span class="f-dot purple"></span>RAGAS Evaluation</li>
          </ul>
          <h4 class="f-heading" style="margin-top:16px">Nova AI</h4>
          <ul class="f-list">
            <li><span class="f-dot orange"></span>Voice STT + TTS</li>
            <li><span class="f-dot orange"></span>Universal Agent v3</li>
          </ul>
        </div>

      </div>

      <!-- Bottom bar -->
      <div class="f-bottom">
        <div class="f-bottom-inner">
          <div class="f-stats">
            <span class="f-stat"><strong>502</strong> tests</span>
            <span class="f-sep">·</span>
            <span class="f-stat"><strong>94.7%</strong> coverage</span>
            <span class="f-sep">·</span>
            <span class="f-stat"><strong>0</strong> bugs</span>
            <span class="f-sep">·</span>
            <span class="f-stat"><strong>0</strong> vulnerabilities</span>
            <span class="f-sep">·</span>
            <span class="f-stat">SonarQube <strong class="f-pass">PASSED</strong></span>
          </div>
          <div class="f-copy">
            © 2026 Bench Resource Optimizer · Aura with Rav · MIT Licence
          </div>
        </div>
      </div>
    </footer>

    <app-bench-agent />
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
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .user-chip:hover {
      background: rgba(255,255,255,0.15);
      border-color: rgba(255,255,255,0.25);
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
      padding: 32px 0 48px;
    }
    .page-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 32px;
    }

    /* ── Footer ─────────────────────────────────────────────────── */
    .footer {
      background: #0f172a;
      border-top: 1px solid rgba(59,130,246,0.15);
    }
    .footer-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 48px 32px 40px;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 40px;
    }

    /* Brand column */
    .f-brand { display: flex; flex-direction: column; gap: 12px; }
    .f-logo  { display: flex; align-items: center; gap: 8px; }
    .f-logo-icon { font-size: 22px; }
    .f-logo-name { font-size: 16px; font-weight: 800; color: #f1f5f9; white-space: nowrap; }
    .f-tagline   { font-size: 12.5px; color: #64748b; line-height: 1.6; margin: 0; max-width: 260px; }
    .f-badges    { display: flex; flex-wrap: wrap; gap: 6px; }
    .f-badge {
      font-size: 10px; font-weight: 700;
      padding: 3px 8px; border-radius: 5px;
      background: rgba(59,130,246,0.12);
      color: #93c5fd;
      border: 1px solid rgba(59,130,246,0.2);
      letter-spacing: 0.3px;
    }
    .f-badge-green {
      background: rgba(34,197,94,0.1);
      color: #86efac;
      border-color: rgba(34,197,94,0.2);
    }
    .f-built { font-size: 11.5px; color: #475569; margin: 0; }
    .f-built strong { color: #94a3b8; font-weight: 600; }

    /* Link columns */
    .f-col { display: flex; flex-direction: column; gap: 8px; }
    .f-heading {
      font-size: 11px; font-weight: 700; letter-spacing: 1px;
      text-transform: uppercase; color: #475569;
      margin: 0 0 4px;
    }
    .f-list {
      list-style: none; margin: 0; padding: 0;
      display: flex; flex-direction: column; gap: 8px;
    }
    .f-list li {
      display: flex; align-items: center; gap: 8px;
      font-size: 12.5px; color: #94a3b8; line-height: 1.4;
    }
    .f-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .f-dot.blue   { background: #3b82f6; }
    .f-dot.green  { background: #22c55e; }
    .f-dot.purple { background: #a78bfa; }
    .f-dot.orange { background: #fb923c; }

    /* Bottom bar */
    .f-bottom {
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.2);
    }
    .f-bottom-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 14px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .f-stats {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .f-stat { font-size: 11.5px; color: #475569; }
    .f-stat strong { color: #94a3b8; font-weight: 700; }
    .f-pass { color: #22c55e; }
    .f-sep  { color: #334155; }
    .f-copy { font-size: 11px; color: #334155; }

    @media (max-width: 900px) {
      .footer-inner { grid-template-columns: 1fr 1fr; gap: 28px; }
    }
    @media (max-width: 560px) {
      .footer-inner { grid-template-columns: 1fr; padding: 32px 20px; }
      .f-bottom-inner { flex-direction: column; align-items: flex-start; gap: 8px; }
    }
  `],
})
export class AppComponent {
  auth = inject(AuthService);

  get userInitial(): string {
    return (this.auth.currentUser()?.user_id ?? '?')[0].toUpperCase();
  }
}
