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
    http.verify();
  });
});
