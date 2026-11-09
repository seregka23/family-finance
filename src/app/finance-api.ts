import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { ExpenseDashboardData } from './models/expense-model';
import type { FinanceData } from './finance-types';

@Service()
export class FinanceApi {
  private readonly http = inject(HttpClient);
  operations(from: string, to: string, month: string) {
    return this.http.get<FinanceData>('/api/operations', {
      params: { from, to, month },
      timeout: 60000,
      transferCache: false
    });
  }
  expenses(month: string) {
    return this.http.get<ExpenseDashboardData>('/api/expenses', {
      params: { month },
      timeout: 60000,
      transferCache: false
    });
  }
}
