import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { App } from './app';
import { FinanceApi } from './finance-api';
import { periodBounds } from './models/finance-ui-model';
import type { FinanceData } from './finance-types';

const operation = (id: string, category: string, account: string) => ({
  id,
  category,
  account,
  shortAccount: account,
  title: `Purchase ${id}`,
  merchant: 'Shop',
  amount: 100,
  currency: 'RSD' as const,
  operationType: 'Расход' as const,
  date: '5 ноября',
  time: '',
  isoDate: '2026-11-05',
  plan: 'Продукты',
  source: 'SMS' as const,
  status: 'Готово' as const,
  participant: 'Семья' as const,
  note: '',
  notionUrl: 'https://notion.so/test'
});

const fixtureData: FinanceData = {
  operations: [operation('one', 'Продукты', 'A'), operation('two', 'Транспорт', 'B')],
  accounts: [
    {
      id: 'a',
      name: 'A',
      balance: 1000,
      reserved: 300,
      available: 700,
      reserveNames: ['Отпуск'],
      currency: 'RSD',
      active: true,
      includeInCapital: true,
      owner: 'Муж',
      kind: 'Дебетовая карта',
      bank: 'Raiffeisen',
      mask: '1234'
    }
  ],
  monthlyPlan: {
    month: '2026-11-01',
    items: [
      {
        id: 'p',
        title: 'Продукты',
        category: 'Продукты',
        section: 'Гибкие расходы',
        amount: 1000,
        actual: 200,
        currency: 'RSD',
        notionUrl: 'https://notion.so/p'
      }
    ]
  },
  receipts: { items: [] },
  goals: { items: [], history: [] },
  viewer: { accountOwner: 'Муж' }
};

describe('Finance workspace', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FinanceApi,
          useValue: { operations: () => of(fixtureData), expenses: () => new Subject() }
        }
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

  it('keeps operations, filtering, plans, accounts, and drawer details interactive', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.setPeriod(periodBounds('month', new Date('2026-11-10')));
    app.go('operations');
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
    app.go('plan');
    await fixture.whenStable();
    expect(host.querySelectorAll('.plan-table-row')).toHaveLength(1);
    expect(host.textContent).toContain('Продукты');
    app.go('accounts');
    await fixture.whenStable();
    expect(host.querySelectorAll('.account-card')).toHaveLength(1);
    expect(host.querySelector('.account-reserve-values')?.textContent).toContain('700');
    app.setAccountCurrencyFilter('EUR');
    await fixture.whenStable();
    expect(host.querySelectorAll('.account-card')).toHaveLength(0);
  });

  it('cancels superseded loads and hides old totals on failure or invalid dates', async () => {
    const requests: Subject<FinanceData>[] = [];
    const api = TestBed.inject(FinanceApi);
    const spy = vi.spyOn(api, 'operations').mockImplementation(() => {
      const request = new Subject<FinanceData>();
      requests.push(request);
      return request;
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    requests[0].next(fixtureData);
    await fixture.whenStable();
    fixture.componentInstance.changePeriod('year');
    await fixture.whenStable();
    requests[0].next({ ...fixtureData, operations: [] });
    expect(fixture.componentInstance.dataState).toBe('loading');
    requests[1].error({ status: 502 });
    await fixture.whenStable();
    expect(fixture.componentInstance.periodOperations).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')).toBeTruthy();
    const before = spy.mock.calls.length;
    fixture.componentInstance.changeDate('from', '');
    await fixture.whenStable();
    expect(spy.mock.calls.length).toBe(before);
    expect(fixture.componentInstance.periodValid).toBe(false);
  });
});
