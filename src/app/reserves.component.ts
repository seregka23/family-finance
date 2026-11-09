import { Component, computed, input, output, signal, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { operationDate } from './models/finance-ui-model';
import type { GoalsData, FinancialReserve } from './models/reserve-model';

type ReserveAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number | null;
  reserved: number | null;
  available: number | null;
};
const money = (value: number | null, currency: string) =>
  value === null
    ? 'Нет данных'
    : `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;

@Component({
  selector: 'app-account-reserve-summary',
  templateUrl: './account-reserve-summary.html',
  host: { style: 'display: contents' }
})
export class AccountReserveSummary {
  readonly accountInput = input.required<ReserveAccount>({ alias: 'account' });
  get account() {
    return this.accountInput();
  }
  readonly money = money;
}
@Component({
  selector: 'app-reserve-row',
  templateUrl: './reserve-row.html',
  host: { style: 'display: contents' }
})
export class ReserveRow {
  readonly goalInput = input.required<FinancialReserve>({ alias: 'goal' });
  get goal() {
    return this.goalInput();
  }
  readonly history = output<void>();
  onHistory = () => this.history.emit();
  readonly money = money;
  readonly operationDate = operationDate;
  readonly Math = Math;
}
@Component({
  selector: 'app-reserves',
  imports: [ReserveRow],
  templateUrl: './reserves.component.html',
  host: { style: 'display: contents' }
})
export class Reserves {
  private readonly document = inject(DOCUMENT);
  readonly dataInput = input<GoalsData | null>(null, { alias: 'data' });
  readonly accountsInput = input<ReserveAccount[]>([], { alias: 'accounts' });
  readonly refresh = output<void>();
  get data() {
    return this.dataInput();
  }
  get accounts() {
    return this.accountsInput();
  }
  readonly accountId = signal('Все');
  readonly selectedId = signal('Все');
  readonly showArchived = signal(false);
  readonly limit = signal(30);
  readonly goals = computed(() =>
    (this.data?.items ?? []).filter(
      (goal) =>
        (this.showArchived() || !goal.archived) &&
        (this.accountId() === 'Все' || goal.accountId === this.accountId())
    )
  );
  readonly history = computed(() => {
    const ids = new Set(this.goals().map((goal) => goal.id));
    return (this.data?.history ?? []).filter(
      (event) =>
        ids.has(event.reserveId) &&
        (this.selectedId() === 'Все' || event.reserveId === this.selectedId())
    );
  });
  readonly reserveAccounts = computed(() =>
    this.accounts.filter(
      (account) =>
        this.data?.items.some((goal) => goal.accountId === account.id) &&
        (this.accountId() === 'Все' || account.id === this.accountId())
    )
  );
  readonly money = money;
  readonly operationDate = operationDate;
  readonly eventValue = (event: Event) => (event.target as HTMLInputElement).value;
  readonly eventChecked = (event: Event) => (event.target as HTMLInputElement).checked;
  onRefresh = () => this.refresh.emit();
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
