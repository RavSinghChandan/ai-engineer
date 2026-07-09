import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'projects/:id',
        loadComponent: () => import('./features/project/project.page').then((m) => m.ProjectPage),
      },
      {
        path: 'jobs/:id',
        loadComponent: () => import('./features/job/job.page').then((m) => m.JobPage),
      },
      {
        path: 'prompts',
        loadComponent: () => import('./features/prompts/prompts.page').then((m) => m.PromptsPage),
      },
      {
        path: 'profiles',
        loadComponent: () => import('./features/profiles/profiles.page').then((m) => m.ProfilesPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
