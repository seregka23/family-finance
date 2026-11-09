import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth-page').then((m) => m.AuthPage), data: { mode: 'login' } },
  { path: 'register', loadComponent: () => import('./features/auth-page').then((m) => m.AuthPage), data: { mode: 'register' } },
  {
    path: '',
    loadComponent: () => import('./finance-shell').then((m) => m.FinanceShell),
    children: [
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
    ]
  }
];
