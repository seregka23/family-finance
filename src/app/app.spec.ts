import { By } from '@angular/platform-browser';
import { TransactionDialog } from './features/transaction-dialog';
import { AuthService } from './auth-service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { FinanceData } from './finance-types';
import { App } from './app';
import { AppClock } from './app-clock';
import { routes } from './app.routes';
import { FinanceApi } from './finance-api';
import { FinanceWorkspace } from './finance-workspace';
import { fixtureData } from './testing/finance-fixtures';

// Real routes and outlets prove navigation, not a mocked router.
describe('Routed finance workspace', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { logout: vi.fn(), busy: () => false, error: () => '' } },
        { provide: AppClock, useValue: { now: new Date('2026-11-10') } },
        { provide: FinanceApi, useValue: { operations: () => of(fixtureData) } }
      ]
    });
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    window.scrollTo = () => {};
  });
  it('preserves filtering, operation details and state across lazy feature navigation', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/operations');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.trow')).toHaveLength(2);
    const search = host.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'Purchase one';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(host.querySelectorAll('.trow')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('.trow')!.click();
    await fixture.whenStable();
    expect(host.querySelector('dialog')?.open).toBe(true);
    expect(host.querySelector('#operation-dialog-title')?.textContent).toContain('Purchase one');
    host.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')!.click();
    await fixture.whenStable();
    expect(host.querySelector('dialog')).toBeNull();
    await router.navigateByUrl('/plan');
    await fixture.whenStable();
    expect(host.querySelectorAll('.plan-table-row')).toHaveLength(1);
    await router.navigateByUrl('/accounts');
    await fixture.whenStable();
    expect(host.querySelectorAll('.account-card')).toHaveLength(1);
    expect(host.querySelector('.account-reserve-values')?.textContent).toContain('700');
    TestBed.inject(FinanceWorkspace).accountCurrencyFilter.set('EUR');
    await fixture.whenStable();
    expect(host.querySelectorAll('.account-card')).toHaveLength(0);
    await router.navigateByUrl('/operations');
    await fixture.whenStable();
    expect(host.querySelector<HTMLInputElement>('input[type=search]')?.value).toBe('Purchase one');
    expect(host.querySelectorAll('.trow')).toHaveLength(1);
    const active = host.querySelector('[aria-current=page]');
    expect(active?.getAttribute('aria-label')).toBe('Операции');
  });
  it.each([401, 403] as const)('clears open operation details after authentication failure %s and subsequent recovery', async (status) => {
    const requests: Subject<FinanceData>[] = [];
    TestBed.overrideProvider(FinanceApi, { useValue: { operations: () => {
      const response = new Subject<FinanceData>();
      requests.push(response);
      return response;
    } } });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/operations');
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].next(fixtureData);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('.trow')!.click();
    await fixture.whenStable();
    expect(host.querySelector('dialog')?.open).toBe(true);
    const workspace = TestBed.inject(FinanceWorkspace);
    expect(workspace.selected()).not.toBeNull();
    workspace.refreshData();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].error(new HttpErrorResponse({ status }));
    await fixture.whenStable();
    expect(workspace.selected()).toBeNull();
    expect(host.querySelector('dialog')).toBeNull();
    expect(host.querySelector('#operation-dialog-title')).toBeNull();
    workspace.refreshData();
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].next(fixtureData);
    await fixture.whenStable();
    expect(workspace.selected()).toBeNull();
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('renders public authentication routes without starting finance requests', async () => {
    const operations = vi.fn(() => of(fixtureData));
    TestBed.overrideProvider(FinanceApi, { useValue: { operations } });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#auth-title')?.textContent).toBe('Вход');
    expect(operations).not.toHaveBeenCalled();
    await router.navigateByUrl('/register?token=invitation');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#auth-title')?.textContent).toBe('Регистрация');
    expect(operations).not.toHaveBeenCalled();
  });

  it('refreshes journal and resets filters after saving an operation outside the current period', async () => {
    const operations = vi.fn(() => of(fixtureData));
    const creation = new Subject<{ id: string; created: boolean }>();
    TestBed.overrideProvider(FinanceApi, { useValue: { operations, transactionOptions: () => of({ accounts: [], categories: [] }), createOperation: () => creation } });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/operations'); await fixture.whenStable();
    const workspace = TestBed.inject(FinanceWorkspace);
    workspace.categoryFilter.set('Продукты'); workspace.operationAccountFilter.set('A');
    fixture.nativeElement.querySelector('.transaction-add').click(); await fixture.whenStable();
    const dialog = fixture.debugElement.query(By.directive(TransactionDialog)).componentInstance as TransactionDialog;
    dialog.model.update((value) => ({ ...value, title: 'Older purchase', amount: '2.00', operationDate: '2026-08-20' })); await fixture.whenStable();
    const previousCalls = operations.mock.calls.length;
    dialog.submit(new Event('submit', { cancelable: true })); creation.next({ id: 'created', created: true }); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-transaction-dialog')).toBeNull();
    expect(fixture.nativeElement.querySelector('.transaction-success')).not.toBeNull();
    expect(workspace.period()).toEqual({ from: '2026-08-20', to: '2026-08-20' });
    expect(workspace.categoryFilter()).toBe('Все'); expect(workspace.operationAccountFilter()).toBe('Все');
    expect(operations.mock.calls.length).toBeGreaterThan(previousCalls);
  });
  it.each([401, 403] as const)('closes a new transaction and clears old selection after save fails %s', async (status) => {
    const creation = new Subject<{ id: string; created: boolean }>();
    TestBed.overrideProvider(FinanceApi, { useValue: { operations: vi.fn().mockReturnValueOnce(of(fixtureData)).mockReturnValue(throwError(() => new HttpErrorResponse({ status }))), transactionOptions: () => of({ accounts: [], categories: [] }), createOperation: () => creation } });
    const fixture = TestBed.createComponent(App); await TestBed.inject(Router).navigateByUrl('/operations'); await fixture.whenStable();
    fixture.nativeElement.querySelector('.transaction-add').click(); await fixture.whenStable();
    const workspace = TestBed.inject(FinanceWorkspace); workspace.selected.set(fixtureData.operations[0]);
    const dialog = fixture.debugElement.query(By.directive(TransactionDialog)).componentInstance as TransactionDialog;
    dialog.model.update((value) => ({ ...value, title: 'Purchase', amount: '2.00' })); await fixture.whenStable();
    dialog.submit(new Event('submit', { cancelable: true })); creation.error(new HttpErrorResponse({ status })); await fixture.whenStable();
    expect(workspace.selected()).toBeNull(); expect(workspace.operations()).toHaveLength(0); expect(fixture.nativeElement.querySelector('app-transaction-dialog')).toBeNull();
    expect(fixture.nativeElement.querySelector('.transaction-error')).not.toBeNull();
  });

  it('offers adding the first operation in a truly empty journal', async () => {
    TestBed.overrideProvider(FinanceApi, { useValue: {
      operations: () => of({ ...fixtureData, operations: [] }),
      transactionOptions: () => of({ accounts: [], categories: [] }), createOperation: vi.fn()
    } });
    const fixture = TestBed.createComponent(App); await TestBed.inject(Router).navigateByUrl('/operations'); await fixture.whenStable();
    const empty: HTMLElement = fixture.nativeElement.querySelector('.empty');
    expect(empty.textContent).toContain('Добавить операцию');
    expect(empty.textContent).not.toContain('Сбросить фильтры');
    empty.querySelector<HTMLButtonElement>('button')!.click(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-transaction-dialog')).not.toBeNull();
    expect(TestBed.inject(FinanceApi).createOperation).not.toHaveBeenCalled();
  });
  it('offers resetting filters when existing journal entries are hidden by search', async () => {
    const fixture = TestBed.createComponent(App); await TestBed.inject(Router).navigateByUrl('/operations'); await fixture.whenStable();
    const workspace = TestBed.inject(FinanceWorkspace); workspace.query.set('no matching purchase'); await fixture.whenStable();
    const empty: HTMLElement = fixture.nativeElement.querySelector('.empty');
    expect(empty.textContent).toContain('Сбросить фильтры');
    empty.querySelector<HTMLButtonElement>('button')!.click(); await fixture.whenStable();
    expect(workspace.query()).toBe(''); expect(fixture.nativeElement.querySelectorAll('.trow')).toHaveLength(2);
  });

  it('shows first-use journal actions only after data loads successfully', async () => {
    const requests: Subject<FinanceData>[] = [];
    TestBed.overrideProvider(FinanceApi, { useValue: { operations: () => {
      const response = new Subject<FinanceData>(); requests.push(response); return response;
    } } });
    const fixture = TestBed.createComponent(App); await TestBed.inject(Router).navigateByUrl('/operations');
    const workspace = TestBed.inject(FinanceWorkspace);
    await vi.waitFor(() => expect(requests).toHaveLength(1)); fixture.detectChanges();
    expect(workspace.state()).toBe('loading');
    expect(fixture.nativeElement.querySelector('.empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('.transaction-add')).toBeNull();
    requests[0].error(new HttpErrorResponse({ status: 503 })); await fixture.whenStable();
    expect(workspace.state()).toBe('error');
    expect(fixture.nativeElement.querySelector('.empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('.transaction-add')).toBeNull();
    workspace.refreshData(); await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].next({ ...fixtureData, operations: [] }); await fixture.whenStable();
    expect(workspace.state()).toBe('ready');
    expect(fixture.nativeElement.querySelector('.empty')?.textContent).toContain('Добавить операцию');
    expect(fixture.nativeElement.querySelector('.transaction-add')).not.toBeNull();
  });

});
