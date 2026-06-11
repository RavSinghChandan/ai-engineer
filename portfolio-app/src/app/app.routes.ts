import { Routes } from '@angular/router';
import { App } from './app';

export const routes: Routes = [
  {
    path: 'scene3d',
    loadComponent: () => import('./scene3d/scene3d').then(m => m.Scene3dComponent),
  },
  { path: '**', component: App },
];
