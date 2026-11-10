import { OperationDetails } from '../operation-details';
import { fixtureData } from '../testing/finance-fixtures';
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

  it('links every invalid field to an inline error, focuses it and preserves the remaining values', async () => {
    const fixture = TestBed.createComponent(TransactionDialog); await fixture.whenStable();
    const component = fixture.componentInstance; const host: HTMLElement = fixture.nativeElement;
    const ids = [...host.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [field, value] of [
      ['title', ' '], ['amount', '0'], ['operationDate', '2026-02-30'],
      ['operationTime', '24:01'], ['merchant', 'm'.repeat(201)], ['note', 'n'.repeat(2001)]
    ]) {
      component.model.update((previous) => ({ ...previous, title: 'Preserved purchase', amount: '12,34', operationDate: '2026-11-10', operationTime: '', merchant: 'Shop', note: 'Preserved note', [field]: value }));
      await fixture.whenStable(); submit(component); await fixture.whenStable();
      const input = host.querySelector<HTMLElement>(`#transaction-${field}`)!;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(input);
      const references = input.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) expect(host.querySelector(`[id="${reference}"]`)?.textContent?.trim()).toBeTruthy();
      expect(host.textContent).not.toContain('Обновить счета и категории');
      expect(attempts).toHaveLength(0);
    }
    expect(component.model().title).toBe('Preserved purchase');
  });
  it('restores background scrolling and trigger focus when the dialog is destroyed', async () => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'scroll';
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const fixture = TestBed.createComponent(TransactionDialog); await fixture.whenStable();
    expect(document.body.style.overflow).toBe('hidden');
    fixture.destroy();
    expect(document.body.style.overflow).toBe('scroll'); expect(document.activeElement).toBe(trigger);
    trigger.remove(); document.body.style.overflow = priorOverflow;
  });

  it('keeps scrolling locked until the last dialog closes regardless of teardown order', async () => {
    const previous = document.body.style.overflow; document.body.style.overflow = 'scroll';
    const transaction = TestBed.createComponent(TransactionDialog); await transaction.whenStable();
    const details = TestBed.createComponent(OperationDetails); details.componentRef.setInput('operation', fixtureData.operations[0]); await details.whenStable();
    transaction.destroy(); expect(document.body.style.overflow).toBe('hidden');
    details.destroy(); expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = previous;
  });

});
