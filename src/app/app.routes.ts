import { Routes } from '@angular/router';

// Each feature is lazy-loaded, so the first page only downloads its own code.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · BudgetFlow',
    data: { heading: 'Dashboard', hideHeading: true },
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'transactions',
    title: 'Transactions · BudgetFlow',
    data: { heading: 'Transactions' },
    loadComponent: () => import('./features/transactions/transactions-page').then((m) => m.TransactionsPage),
  },
  {
    path: 'budgets',
    title: 'Budgets · BudgetFlow',
    data: { heading: 'Budgets' },
    loadComponent: () => import('./features/budgets/budgets-page').then((m) => m.BudgetsPage),
  },
  {
    path: 'analytics',
    title: 'Analytics · BudgetFlow',
    data: { heading: 'Analytics' },
    loadComponent: () => import('./features/analytics/analytics-page').then((m) => m.AnalyticsPage),
  },
  {
    path: 'settings',
    title: 'Settings · BudgetFlow',
    data: { heading: 'Settings' },
    loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
