import { Routes } from '@angular/router';
import { authGuard, adminGuard, superadminGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
  },
  {
    // Public landing page - visitors see this before signing in.
    path: '',
    loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage),
  },
  {
    path: 'intake',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/intake/intake.page').then(m => m.IntakePage),
  },
  {
    path: 'review',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/review/review.page').then(m => m.ReviewPage),
  },
  {
    path: 'report',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/report/report.page').then(m => m.ReportPage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage),
  },
  {
    path: 'metrics',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/metrics/metrics.page').then(m => m.MetricsPage),
  },
  {
    path: 'admin/users',
    canActivate: [superadminGuard],
    loadComponent: () => import('./pages/admin-users/admin-users.page').then(m => m.AdminUsersPage),
  },
  { path: '**', redirectTo: '' }
];
