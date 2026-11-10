import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { CreateOperation, FinanceData, TransactionOptions } from './finance-types';
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
  transactionOptions() {
    return this.http.get<TransactionOptions>('/api/transaction-options', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }, timeout: 60000, transferCache: false
    });
  }
  createOperation(body: CreateOperation) {
    return this.http.post<{ id: string; created: boolean }>('/api/operations', body, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }, timeout: 60000
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
