import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./components/auth/auth.component').then(m => m.AuthComponent) },
  { path: '', canActivate: [authGuard], loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'runbooks', canActivate: [authGuard], loadComponent: () => import('./components/runbooks/runbooks.component').then(m => m.RunbooksComponent) },
  { path: 'runbooks/:id', canActivate: [authGuard], loadComponent: () => import('./components/runbook-detail/runbook-detail.component').then(m => m.RunbookDetailComponent) },
  { path: 'ingest', canActivate: [authGuard], loadComponent: () => import('./components/ingest/ingest.component').then(m => m.IngestComponent) },
  { path: 'query', canActivate: [authGuard], loadComponent: () => import('./components/query/query.component').then(m => m.QueryComponent) },
  { path: 'multi', canActivate: [authGuard], loadComponent: () => import('./components/multi/multi.component').then(m => m.MultiComponent) },
  { path: '**', redirectTo: '' },
];
