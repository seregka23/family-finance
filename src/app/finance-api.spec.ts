import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FinanceApi } from './finance-api';

describe('Finance API transport', () => {
  it('sends the selected period and excludes user data from transfer caching', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    const api = TestBed.inject(FinanceApi);
    const http = TestBed.inject(HttpTestingController);
    const subscription = api.operations('2026-11-01', '2026-11-30', '2026-11-01').subscribe();
    const request = http.expectOne((r) => r.url === '/api/operations');
    expect(request.request.params.get('from')).toBe('2026-11-01');
    expect(request.request.params.get('to')).toBe('2026-11-30');
    expect(request.request.transferCache).toBe(false);
    expect(request.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
    const expenseSubscription = api.expenses('2026-11').subscribe();
    const expense = http.expectOne((r) => r.url === '/api/expenses');
    expect(expense.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(expense.request.transferCache).toBe(false);
    expenseSubscription.unsubscribe();
    const optionsSubscription = api.transactionOptions().subscribe();
    const options = http.expectOne('/api/transaction-options');
    expect(options.request.method).toBe('GET');
    expect(options.request.transferCache).toBe(false);
    optionsSubscription.unsubscribe();
    const payload = { requestId: crypto.randomUUID(), operationType: 'Расход' as const, title: 'Purchase', amount: '12.34', currency: 'RSD' as const, operationDate: '2026-11-10', operationTime: '', merchant: '', note: '', accountId: null, categoryId: null };
    const creation = api.createOperation(payload).subscribe();
    const mutation = http.expectOne('/api/operations');
    expect(mutation.request.method).toBe('POST');
    expect(mutation.request.body).toEqual(payload);
    creation.unsubscribe();
    http.verify();
  });
});
