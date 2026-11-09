import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/overview').then((m) => m.Overview)
  },
  {
    path: 'operations',
    loadComponent: () => import('./features/operations').then((m) => m.Operations)
  },
  { path: 'plan', loadComponent: () => import('./features/plan').then((m) => m.Plan) },
  { path: 'accounts', loadComponent: () => import('./features/accounts').then((m) => m.Accounts) },
  {
    path: 'dashboards',
    loadComponent: () => import('./features/expenses/expenses').then((m) => m.Expenses)
  }
];
