import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/intake/intake.page').then(m => m.IntakePage),
  },
  {
    path: 'review',
    loadComponent: () => import('./pages/review/review.page').then(m => m.ReviewPage),
  },
  {
    path: 'report',
    loadComponent: () => import('./pages/report/report.page').then(m => m.ReportPage),
  },
  { path: '**', redirectTo: '' }
];
