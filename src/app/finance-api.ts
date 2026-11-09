import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { FinanceData } from './finance-types';
import type { ExpenseDashboardData } from './models/expense-model';

@Service()
export class FinanceApi {
  private readonly http = inject(HttpClient);
  operations(from: string, to: string, month: string) {
    return this.http.get<FinanceData>('/api/operations', {
      params: { from, to, month },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 60000,
      transferCache: false
    });
  }
  expenses(month: string) {
    return this.http.get<ExpenseDashboardData>('/api/expenses', {
      params: { month },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 60000,
      transferCache: false
    });
  }
}
