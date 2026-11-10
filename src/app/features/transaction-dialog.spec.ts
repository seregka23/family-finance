import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { FinanceApi } from '../finance-api';
import type { CreateOperation } from '../finance-types';
import { TransactionDialog } from './transaction-dialog';

describe('Manual transaction dialog', () => {
  let attempts: { payload: CreateOperation; response: Subject<{ id: string; created: boolean }> }[];
  beforeEach(() => {
    attempts = [];
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    TestBed.configureTestingModule({ providers: [{ provide: FinanceApi, useValue: {
      transactionOptions: () => of({ accounts: [{ id: 'euros', name: 'Euro savings', currency: 'EUR' }], categories: [] }),
      createOperation: (payload: CreateOperation) => {
        const response = new Subject<{ id: string; created: boolean }>();
        attempts.push({ payload, response }); return response;
      }
    } }] });
  });
  const submit = (component: TransactionDialog) => component.submit(new Event('submit', { cancelable: true }));
  it('validates exact amounts/dates, supports no account/category and keeps retries idempotent while busy', async () => {
    const fixture = TestBed.createComponent(TransactionDialog); await fixture.whenStable();
    const component = fixture.componentInstance;
    for (const changes of [{ amount: '0' }, { amount: '1.001' }, { operationDate: '2026-02-30' }]) {
      component.model.update((value) => ({ ...value, title: 'Groceries', amount: '12,34', operationDate: '2026-11-10', ...changes }));
      await fixture.whenStable(); submit(component); expect(attempts).toHaveLength(0);
    }
    component.model.update((value) => ({ ...value, amount: '12,34', operationDate: '2026-11-10' }));
    await fixture.whenStable();
    const cancelled = vi.fn(), saved = vi.fn(); component.cancelled.subscribe(cancelled); component.saved.subscribe(saved);
    submit(component); submit(component); component.close();
    const cancel = new Event('cancel', { cancelable: true }); component.onCancel(cancel);
    expect(cancel.defaultPrevented).toBe(true); expect(cancelled).not.toHaveBeenCalled(); expect(attempts).toHaveLength(1);
    expect(attempts[0].payload.accountId).toBeNull(); expect(attempts[0].payload.categoryId).toBeNull();
    const firstId = attempts[0].payload.requestId;
    attempts[0].response.error(new HttpErrorResponse({ status: 503 }));
    await fixture.whenStable(); expect(component.busy()).toBe(false);
    submit(component); expect(attempts[1].payload.requestId).toBe(firstId);
    attempts[1].response.error(new HttpErrorResponse({ status: 503 }));
    component.model.update((value) => ({ ...value, amount: '15.00' })); await fixture.whenStable();
    submit(component); expect(attempts[2].payload.requestId).not.toBe(firstId);
    attempts[2].response.next({ id: attempts[2].payload.requestId, created: true });
    expect(saved).toHaveBeenCalledWith('2026-11-10');
  });
  it('selecting an account fixes currency and authentication failures close through the parent output', async () => {
    const fixture = TestBed.createComponent(TransactionDialog); await fixture.whenStable(); const component = fixture.componentInstance;
    const labels = [...fixture.nativeElement.querySelectorAll('label')] as HTMLLabelElement[];
    const select = labels.find((label) => label.textContent?.trim().startsWith('Счёт'))!.querySelector('select')!;
    const currency = labels.find((label) => label.textContent?.trim().startsWith('Валюта'))!.querySelector('select')!;
    select.value = 'euros'; select.dispatchEvent(new Event('change')); await fixture.whenStable();
    expect(component.model().currency).toBe('EUR'); expect(component.model().accountId).toBe('euros');
    expect(currency.disabled).toBe(true);
    select.value = ''; select.dispatchEvent(new Event('change')); await fixture.whenStable();
    expect(component.model().accountId).toBe(''); expect(currency.disabled).toBe(false);
    component.model.update((value) => ({ ...value, title: 'Purchase', amount: '2.00' })); await fixture.whenStable();
    const authFailed = vi.fn(); component.authFailed.subscribe(authFailed);
    submit(component); attempts[0].response.error(new HttpErrorResponse({ status: 401 }));
    expect(authFailed).toHaveBeenCalledWith(401);
    submit(component); attempts[1].response.error(new HttpErrorResponse({ status: 403 }));
    expect(authFailed).toHaveBeenCalledWith(403);
  });
  it('allows cancelling without writing and creating the first entry when options are empty', async () => {
    TestBed.overrideProvider(FinanceApi, { useValue: { transactionOptions: () => of({ accounts: [], categories: [] }), createOperation: vi.fn() } });
    const fixture = TestBed.createComponent(TransactionDialog); await fixture.whenStable();
    const cancelled = vi.fn(); fixture.componentInstance.cancelled.subscribe(cancelled); fixture.componentInstance.close();
    expect(cancelled).toHaveBeenCalledOnce(); expect(TestBed.inject(FinanceApi).createOperation).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button[type=submit]')?.disabled).toBe(false);
  });
  it('blocks saving after options fail until a successful reload, while empty options remain usable', async () => {
    const failed = new Subject<never>();
    const transactionOptions = vi.fn().mockReturnValueOnce(failed).mockReturnValue(of({ accounts: [], categories: [] }));
    const createOperation = vi.fn();
    TestBed.overrideProvider(FinanceApi, { useValue: { transactionOptions, createOperation } });
    const fixture = TestBed.createComponent(TransactionDialog); await fixture.whenStable();
    failed.error(new HttpErrorResponse({ status: 503 })); await fixture.whenStable();
    const component = fixture.componentInstance;
    component.model.update((value) => ({ ...value, title: 'Purchase', amount: '2.00' })); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button[type=submit]')?.disabled).toBe(true);
    submit(component); expect(createOperation).not.toHaveBeenCalled();
    component.loadOptions(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button[type=submit]')?.disabled).toBe(false);
  });

});
