import { TestBed } from '@angular/core/testing';
import type { GoalsData } from '../../models/reserve-model';
import { Reserves } from './reserves';

const data: GoalsData = {
  items: [
    {
      id: 'goal',
      title: 'Отпуск',
      accountId: 'a',
      account: 'A',
      currency: 'RSD',
      kind: 'Пополняемый резерв',
      archived: false,
      priority: '',
      status: '',
      target: null,
      saved: 300,
      spent: 100,
      progress: null,
      deadline: '',
    },
    {
      id: 'archived',
      title: 'Архивная цель',
      accountId: 'b',
      account: 'B',
      currency: 'EUR',
      kind: 'Накопительная цель',
      archived: true,
      priority: '',
      status: '',
      target: 500,
      saved: 100,
      spent: 0,
      progress: 20,
      deadline: '',
    }
  ],
  history: [
    {
      id: 'e',
      reserveId: 'goal',
      reserve: 'Отпуск',
      account: 'A',
      currency: 'RSD',
      type: 'Пополнение',
      amount: 300,
      date: '2026-08-05',
      title: 'Резерв',
    }
  ]
};

describe('Reserves', () => {
  it('preserves rolling reserves, archived filtering, account filtering and history', async () => {
    const fixture = TestBed.createComponent(Reserves);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('accounts', [
      { id: 'a', name: 'A', currency: 'RSD', balance: 1000, reserved: 300, available: 700 },
      { id: 'b', name: 'B', currency: 'EUR', balance: 400, reserved: 100, available: 300 }
    ]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.reserve-row')).toHaveLength(1);
    expect(host.textContent).toContain('Можно пополнять и использовать постоянно');
    expect(host.querySelector('progress')).toBeNull();
    HTMLElement.prototype.scrollIntoView = () => {};
    host.querySelector<HTMLButtonElement>('.reserve-row-actions button')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedId()).toBe('goal');
    expect(host.querySelectorAll('.reserve-history li')).toHaveLength(1);
    fixture.componentInstance.changeArchived(true);
    await fixture.whenStable();
    expect(host.querySelectorAll('.reserve-row')).toHaveLength(2);
    fixture.componentInstance.changeAccount('b');
    await fixture.whenStable();
    expect(host.querySelectorAll('.reserve-row')).toHaveLength(1);
    expect(host.querySelector('progress')?.value).toBe(20);
    expect(host.querySelectorAll('.reserve-history li')).toHaveLength(0);
  });
  it('shows unavailable data without fabricating totals', async () => {
    const fixture = TestBed.createComponent(Reserves);
    fixture.componentRef.setInput('data', { items: [], history: [], unavailable: true });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Резервы временно недоступны'
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.reserve-account-strip')
    ).toBeNull();
  });
});
