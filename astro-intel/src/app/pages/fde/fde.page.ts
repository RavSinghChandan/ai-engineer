import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FdeDashboardComponent } from '../../components/fde-dashboard/fde-dashboard.component';

@Component({
  selector: 'app-fde-page',
  standalone: true,
  imports: [FdeDashboardComponent],
  template: `
    <header class="bar">
      <div class="brand">
        <img src="rav-logo.png" alt="Aura with Rav" class="logo" />
        <span>AURA <em>with Rav</em></span>
      </div>
      <nav>
        <button (click)="router.navigate(['/metrics'])">📊 Pipeline metrics</button>
        <button (click)="router.navigate(['/intake'])">Home</button>
      </nav>
    </header>
    <main class="wrap"><app-fde-dashboard /></main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f8fafc; }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px;
           padding: 10px 20px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 5; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; color: #0f172a; }
    .brand em { font-weight: 400; color: #2563eb; }
    .logo { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }
    nav { display: flex; gap: 6px; }
    nav button { border: 1px solid #e2e8f0; background: #fff; padding: 6px 12px; border-radius: 999px; cursor: pointer; font: inherit; }
    nav button:hover { border-color: #2563eb; color: #2563eb; }
    .wrap { padding: 16px 20px; }
  `],
})
export class FdePage {
  readonly router = inject(Router);
}
