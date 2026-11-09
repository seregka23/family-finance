import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { money } from '../../finance-format';
import type { ReserveAccount } from '../../finance-types';
import { operationDate } from '../../models/finance-ui-model';
import type { GoalsData } from '../../models/reserve-model';

import { ReserveRow } from './reserve-row';
@Component({
  selector: 'app-reserves',
  imports: [ReserveRow],
  templateUrl: './reserves.html',
  host: { style: 'display: contents' }
})
export class Reserves {
  private readonly document = inject(DOCUMENT);
  readonly data = input<GoalsData | null>(null);
  readonly accounts = input<ReserveAccount[]>([]);
  readonly refresh = output<void>();
  readonly accountId = signal('Все');
  readonly selectedId = signal('Все');
  readonly showArchived = signal(false);
  readonly limit = signal(30);
  readonly goals = computed(() =>
    (this.data()?.items ?? []).filter(
      (goal) =>
        (this.showArchived() || !goal.archived) &&
        (this.accountId() === 'Все' || goal.accountId === this.accountId())
    )
  );
  readonly history = computed(() => {
    const ids = new Set(this.goals().map((goal) => goal.id));
    return (this.data()?.history ?? []).filter(
      (event) =>
        ids.has(event.reserveId) &&
        (this.selectedId() === 'Все' || event.reserveId === this.selectedId())
    );
  });
  readonly reserveAccounts = computed(() =>
    this.accounts().filter(
      (account) =>
        this.data()?.items.some((goal) => goal.accountId === account.id) &&
        (this.accountId() === 'Все' || account.id === this.accountId())
    )
  );
  readonly accountOptions = computed(() =>
    this.accounts().filter((account) =>
      this.data()?.items.some((goal) => goal.accountId === account.id)
    )
  );
  readonly money = money;
  readonly operationDate = operationDate;
  readonly eventValue = (event: Event) => (event.target as HTMLInputElement).value;
  readonly eventChecked = (event: Event) => (event.target as HTMLInputElement).checked;
  changeAccount(value: string) {
    this.accountId.set(value);
    this.selectedId.set('Все');
    this.limit.set(30);
  }
  changeArchived(value: boolean) {
    this.showArchived.set(value);
    this.selectedId.set('Все');
  }
  showHistory(id: string) {
    this.selectedId.set(id);
    this.limit.set(30);
    this.document.getElementById('reserve-history-heading')?.focus({ preventScroll: true });
    this.document
      .getElementById('reserve-history')
      ?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
}
