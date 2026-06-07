import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./book-shell/book-shell.component').then(m => m.BookShellComponent),
    children: [
      { path: '', redirectTo: 'pattern/p1', pathMatch: 'full' },
      { path: 'pattern/:id', loadComponent: () => import('./pattern-view/pattern-view.component').then(m => m.PatternViewComponent) },
    ]
  },
  { path: '**', redirectTo: '' },
];
