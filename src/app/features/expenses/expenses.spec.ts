import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FinanceApi } from '../../finance-api';
import { aggregateExpenses } from '../../models/expense-model';
import { Expenses } from './expenses';

const data = aggregateExpenses(
  Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    date: '2026-08-05',
    amount: i + 1,
    currency: 'RSD',
    category: 'Продукты',
    merchant: `Shop ${i}`,
    title: i === 11 ? '<script>alert(1)</script>' : `Purchase ${i}`,
    review: false
  })),
  '2026-08',
  new Date('2026-09-05')
);

describe('Expense dashboards', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [{ provide: FinanceApi, useValue: { expenses: () => of(data) } }]
    })
  );
  it('renders escaped top ten purchases, both chart modes, merchant sorting and expansion', async () => {
    const fixture = TestBed.createComponent(Expenses);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.expense-rank')).toHaveLength(10);
    expect(host.textContent).toContain('<script>alert(1)</script>');
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelectorAll('.expense-merchants .expense-category')).toHaveLength(6);
    host.querySelector<HTMLButtonElement>('.expense-more')!.click();
    await fixture.whenStable();
    expect(host.querySelectorAll('.expense-merchants .expense-category')).toHaveLength(12);
    const cumulative = [...host.querySelectorAll('button')].find(
      (x) => x.textContent?.trim() === 'С начала месяца'
    )!;
    cumulative.click();
    await fixture.whenStable();
    expect(host.textContent).toContain('Расходы нарастающим итогом');
    host.querySelector<HTMLButtonElement>('.expense-columns button')!.click();
    await fixture.whenStable();
    expect(host.querySelector('.expense-day-detail')?.textContent).toContain('операций:');
    fixture.componentInstance.merchantSort.set('count');
    await fixture.whenStable();
    expect(host.textContent).toContain('средняя сумма');
  });
});
