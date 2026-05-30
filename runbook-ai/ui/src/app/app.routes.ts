import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'runbooks', loadComponent: () => import('./components/runbooks/runbooks.component').then(m => m.RunbooksComponent) },
  { path: 'runbooks/:id', loadComponent: () => import('./components/runbook-detail/runbook-detail.component').then(m => m.RunbookDetailComponent) },
  { path: 'ingest', loadComponent: () => import('./components/ingest/ingest.component').then(m => m.IngestComponent) },
  { path: 'query', loadComponent: () => import('./components/query/query.component').then(m => m.QueryComponent) },
  { path: 'multi', loadComponent: () => import('./components/multi/multi.component').then(m => m.MultiComponent) },
  { path: '**', redirectTo: '' },
];
