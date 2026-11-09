import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
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
        provideRouter(routes),
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

});
