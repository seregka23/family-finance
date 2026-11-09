import { Service, afterNextRender, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { AppClock } from './app-clock';
import { FinanceApi } from './finance-api';
import { compareAccountCurrencies, money } from './finance-format';
import type { Operation, ReceiptData, Tab } from './finance-types';
import {
  accountActivity,
  currentMonthStart,
  operationDay,
  periodBounds,
  validPeriod,
  type PeriodPreset
} from './models/finance-ui-model';

@Service()
export class FinanceWorkspace {
  private readonly clock = inject(AppClock);
  private readonly api = inject(FinanceApi);
  private readonly router = inject(Router);
  private readonly browserReady = signal(false);

  readonly period = signal(periodBounds('month', this.clock.now));
  readonly periodPreset = signal<PeriodPreset | 'custom'>('month');
  readonly query = signal('');
  readonly accountsView = signal<'balances' | 'reserves'>('balances');
  readonly accountCurrencyFilter = signal('Все');
  readonly accountOwnerFilter = signal('Все');
  readonly accountKindFilter = signal('Все');
  readonly selected = signal<Operation | null>(null);
  readonly accountTones = ['mint', 'violet', 'blue'] as const;

  private readonly request = rxResource({
    params: () => (this.browserReady() && validPeriod(this.period()) ? this.period() : undefined),
    stream: ({ params }) =>
      this.api.operations(params.from, params.to, currentMonthStart()).pipe(
        map((data) => {
          if (!Array.isArray(data.operations))
            throw new Error('Ответ с данными неполный. Повторите загрузку.');
          return { ...data, updatedAt: data.updatedAt ?? new Date().toISOString() };
        })
      )
  });
  readonly state = computed(() =>
    this.request.isLoading()
      ? 'loading'
      : this.request.error()
        ? 'error'
        : this.request.hasValue()
          ? 'ready'
          : 'loading'
  );
  // Never expose data from a superseded period or a failed request.
  private readonly data = computed(() =>
    this.state() === 'ready' && this.request.hasValue() ? this.request.value() : undefined
  );
  readonly operations = computed(() => this.data()?.operations ?? []);
  readonly accountSummaries = computed(() => this.data()?.accounts ?? []);
  readonly monthlyPlan = computed(() => this.data()?.monthlyPlan ?? null);
  readonly receipts = computed(() => this.data()?.receipts ?? null);
  readonly goals = computed(() => this.data()?.goals ?? null);
  readonly updatedAt = computed(() => this.data()?.updatedAt ?? null);
  readonly errorMessage = computed(() => 'Не удалось получить данные. Попробуйте ещё раз.');
  // Preserve a chosen filter if it is still present in the next successful response.
  readonly categoryFilter = linkedSignal<string[] | undefined, string>({
    source: () =>
      this.state() === 'ready' ? this.operations().map((item) => item.category) : undefined,
    computation: (options, previous) => {
      const selected = previous?.value ?? 'Все';
      return !options || options.includes(selected) ? selected : 'Все';
    }
  });
  readonly operationAccountFilter = linkedSignal<string[] | undefined, string>({
    source: () =>
      this.state() === 'ready' ? this.operations().map((item) => item.account) : undefined,
    computation: (options, previous) => {
      const selected = previous?.value ?? 'Все';
      return !options || options.includes(selected) ? selected : 'Все';
    }
  });

  constructor() {
    afterNextRender(() => this.browserReady.set(true));
  }
  readonly periodValid = computed(() => {
    return validPeriod(this.period());
  });
  readonly accounts = computed(() => {
    return this.accountSummaries().map((account, index) => ({
      ...account,
      label: account.name,
      bank: account.bank || 'Банк не указан',
      kind: account.kind || 'Счёт',
      mask: account.mask || 'Маска не указана',
      tone: this.accountTones[index % this.accountTones.length]
    }));
  });
  readonly accountCurrencies = computed(() => {
    return Array.from(new Set(this.accounts().map((account) => account.currency))).sort(
      compareAccountCurrencies
    );
  });
  readonly accountOwners = computed(() => {
    return Array.from(new Set(this.accounts().map((account) => account.owner || 'Не указан'))).sort(
      (a, b) => a.localeCompare(b, 'ru')
    );
  });
  readonly accountKinds = computed(() => {
    return Array.from(new Set(this.accounts().map((account) => account.kind))).sort((a, b) =>
      a.localeCompare(b, 'ru')
    );
  });
  readonly filteredAccounts = computed(() => {
    return [...this.accounts()]
      .sort((a, b) => compareAccountCurrencies(a.currency, b.currency))
      .filter(
        (account) =>
          (this.accountCurrencyFilter() === 'Все' ||
            account.currency === this.accountCurrencyFilter()) &&
          (this.accountOwnerFilter() === 'Все' ||
            (account.owner || 'Не указан') === this.accountOwnerFilter()) &&
          (this.accountKindFilter() === 'Все' || account.kind === this.accountKindFilter())
      );
  });
  readonly accountCurrencyTotals = computed(() => {
    return Object.values(
      this.filteredAccounts().reduce<
        Record<
          string,
          {
            currency: string;
            balance: number;
            known: number;
            total: number;
          }
        >
      >((totals, account) => {
        totals[account.currency] ??= { currency: account.currency, balance: 0, known: 0, total: 0 };
        totals[account.currency].total += 1;
        if (account.balance !== null) {
          totals[account.currency].balance += account.balance;
          totals[account.currency].known += 1;
        }
        return totals;
      }, {})
    ).sort((a, b) => compareAccountCurrencies(a.currency, b.currency));
  });
  readonly overviewAccounts = computed(() => this.accounts().slice(0, 3));
  readonly filteredOperations = computed(() => {
    return this.operations().filter((item) => {
      const q = this.query().toLocaleLowerCase('ru').trim();
      const inPeriod =
        operationDay(item.isoDate) >= this.period().from &&
        operationDay(item.isoDate) <= this.period().to;
      return (
        inPeriod &&
        (this.categoryFilter() === 'Все' || item.category === this.categoryFilter()) &&
        (this.operationAccountFilter() === 'Все' ||
          item.account === this.operationAccountFilter()) &&
        (!q ||
          `${item.title} ${item.merchant} ${item.account} ${item.plan}`
            .toLocaleLowerCase('ru')
            .includes(q))
      );
    });
  });
  readonly periodOperations = computed(() => {
    return this.state() === 'ready' && this.periodValid()
      ? this.operations().filter(
          (item) =>
            operationDay(item.isoDate) >= this.period().from &&
            operationDay(item.isoDate) <= this.period().to
        )
      : [];
  });
  readonly expenseOperations = computed(() => {
    return this.periodOperations().filter((item) => item.operationType === 'Расход');
  });
  readonly categoryOptions = computed(() => {
    return [
      'Все',
      ...Array.from(new Set(this.operations().map((item) => item.category))).sort((a, b) =>
        a.localeCompare(b, 'ru')
      )
    ];
  });
  readonly operationAccountOptions = computed(() => {
    return Array.from(
      this.operations().reduce((options, item) => {
        if (!options.has(item.account))
          options.set(item.account, item.shortAccount || item.account);
        return options;
      }, new Map<string, string>())
    ).sort(([, first], [, second]) => first.localeCompare(second, 'ru'));
  });
  readonly categoryBreakdown = computed(() => {
    return Object.entries(
      this.expenseOperations().reduce<
        Record<
          string,
          {
            items: Operation[];
            count: number;
          }
        >
      >((totals, item) => {
        totals[item.category] ??= { items: [], count: 0 };
        totals[item.category].items.push(item);
        totals[item.category].count += 1;
        return totals;
      }, {})
    ).sort(([, first], [, second]) => second.count - first.count);
  });
  readonly needsReview = computed(() => {
    return this.periodOperations().filter((item) => item.status === 'Нужна проверка').length;
  });
  readonly latest = computed<Operation | undefined>(() => {
    return this.periodOperations()[0];
  });
  readonly latestReceipt = computed<ReceiptData['items'][number] | undefined>(() => {
    return this.receipts()?.items[0];
  });
  readonly planItems = computed(() => {
    return this.monthlyPlan()?.items ?? [];
  });
  readonly sortedPlanItems = computed(() => {
    return [...this.planItems()].sort((first, second) => {
      const firstProgress =
        first.amount > 0
          ? first.actual / first.amount
          : first.actual > 0
            ? Number.POSITIVE_INFINITY
            : 0;
      const secondProgress =
        second.amount > 0
          ? second.actual / second.amount
          : second.actual > 0
            ? Number.POSITIVE_INFINITY
            : 0;
      return (
        secondProgress - firstProgress ||
        second.actual - first.actual ||
        first.title.localeCompare(second.title, 'ru')
      );
    });
  });
  readonly planTotals = computed(() => {
    return Object.values(
      this.planItems().reduce<
        Record<
          string,
          {
            currency: string;
            amount: number;
            actual: number;
          }
        >
      >((totals, item) => {
        totals[item.currency] ??= { currency: item.currency, amount: 0, actual: 0 };
        totals[item.currency].amount += item.amount;
        totals[item.currency].actual += item.actual;
        return totals;
      }, {})
    );
  });
  readonly reserveAccounts = computed(() =>
    this.accounts().filter((account) => account.reserveNames.length)
  );
  readonly firstReview = computed(
    () => this.periodOperations().find((item) => item.status === 'Нужна проверка') ?? null
  );
  readonly filteredIncome = computed(() =>
    this.filteredOperations().filter((item) => item.operationType === 'Доход')
  );
  readonly filteredExpenses = computed(() =>
    this.filteredOperations().filter((item) => item.operationType === 'Расход')
  );
  activityFor(account: string, currency: string) {
    const total = accountActivity(this.periodOperations(), account, currency);
    return (
      [
        total.income ? `+${money(total.income, currency)}` : '',
        total.expense ? `−${money(total.expense, currency)}` : ''
      ]
        .filter(Boolean)
        .join(' · ') || 'Нет операций'
    );
  }
  go(tab: Tab) {
    void this.router.navigateByUrl(tab === 'overview' ? '/' : `/${tab}`);
  }
  openReserves() {
    this.accountsView.set('reserves');
    this.go('accounts');
  }
  changePeriod(value: string) {
    if (!['day', 'week', 'month', 'halfYear', 'year'].includes(value)) return;
    const preset = value as PeriodPreset;
    this.periodPreset.set(preset);
    this.period.set(periodBounds(preset));
  }
  changeDate(field: 'from' | 'to', value: string) {
    this.periodPreset.set('custom');
    this.period.update((previous) => ({ ...previous, [field]: value }));
  }
  refreshData() {
    if (this.periodValid() && !this.request.isLoading()) this.request.reload();
  }
  resetFilters() {
    this.query.set('');
    this.categoryFilter.set('Все');
    this.operationAccountFilter.set('Все');
  }
}
