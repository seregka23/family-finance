import { AppClock } from './app-clock';
import {
  Component,
  signal,
  computed,
  inject,
  afterNextRender,
  viewChild,
  ElementRef,
  effect
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FinanceApi } from './finance-api';
import { UiIcon, AccountMark, Status, SectionTitle, Category, PageHead, ReceiptLine } from './ui';
import { Expenses } from './expenses.component';
import { Reserves, AccountReserveSummary } from './reserves.component';
import type { GoalsData } from './models/reserve-model';
import {
  accountActivity,
  countLabel,
  currentMonthStart,
  operationDate,
  operationDay,
  periodBounds,
  validPeriod,
  type PeriodPreset
} from './models/finance-ui-model';
import type { Tab, AccountSummary, MonthlyPlan, ReceiptData, Operation } from './finance-types';
const operations: Operation[] = [];
const notionOperations = 'https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7';
const notionPlan = 'https://app.notion.com/p/56f21d527b044920a7b513902c777b48';
const notionReceiptItems = 'https://app.notion.com/p/b0d2c33e97fc4735bde63018a7789a64';
const notionGoals = 'https://app.notion.com/p/6f5e3d2ff27f4e4792ca9989dbce0632';
function money(value: number, currency = 'RSD') {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}
function groupedMoney(items: Operation[]) {
  const totals = items.reduce<Record<string, number>>((result, item) => {
    result[item.currency] = (result[item.currency] ?? 0) + item.amount;
    return result;
  }, {});
  return (
    Object.entries(totals)
      .map(([currency, amount]) => money(amount, currency))
      .join(' · ') || money(0)
  );
}
function groupedAverage(items: Operation[]) {
  const totals = items.reduce<Record<string, { amount: number; count: number }>>((result, item) => {
    result[item.currency] ??= { amount: 0, count: 0 };
    result[item.currency].amount += item.amount;
    result[item.currency].count += 1;
    return result;
  }, {});
  return (
    Object.entries(totals)
      .map(([currency, total]) => money(total.count ? total.amount / total.count : 0, currency))
      .join(' · ') || money(0)
  );
}
function monthName(value: string) {
  const label = new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function shortPlanTitle(value: string) {
  return value.includes(' — ') ? value.split(' — ').slice(1).join(' — ') : value;
}
function accountCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'счетов'
      : mod10 === 1
        ? 'счёт'
        : mod10 >= 2 && mod10 <= 4
          ? 'счёта'
          : 'счетов';
  return `${count} ${word}`;
}
function receiptItemCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'позиций'
      : mod10 === 1
        ? 'позиция'
        : mod10 >= 2 && mod10 <= 4
          ? 'позиции'
          : 'позиций';
  return `${count} ${word}`;
}
function goalStatusLabel(status: string) {
  if (status === 'Done') return 'выполнено';
  if (status === 'In progress') return 'в процессе';
  return 'не начато';
}
function categoryTone(category: string) {
  const tones = ['mint', 'violet', 'blue', 'warning'] as const;
  let hash = 0;
  for (const character of category) hash = (hash + character.charCodeAt(0)) % tones.length;
  return tones[hash];
}
const accountCurrencyOrder = ['RSD', 'EUR', 'RUB', 'USD'];
function compareAccountCurrencies(a: string, b: string) {
  const aIndex = accountCurrencyOrder.indexOf(a.toUpperCase());
  const bIndex = accountCurrencyOrder.indexOf(b.toUpperCase());
  const aRank = aIndex === -1 ? accountCurrencyOrder.length : aIndex;
  const bRank = bIndex === -1 ? accountCurrencyOrder.length : bIndex;
  return aRank - bRank || a.localeCompare(b);
}
@Component({
  selector: 'app-root',
  imports: [
    UiIcon,
    AccountMark,
    Status,
    SectionTitle,
    Category,
    PageHead,
    ReceiptLine,
    Expenses,
    Reserves,
    AccountReserveSummary
  ],
  templateUrl: './app.html'
})
export class App {
  private readonly clock = inject(AppClock);
  private readonly _liveOperations = signal<Operation[]>(operations);
  get liveOperations() {
    return this._liveOperations();
  }
  setLiveOperations = (value: Operation[] | ((previous: Operation[]) => Operation[])) => {
    if (typeof value === 'function') this._liveOperations.update(value);
    else this._liveOperations.set(value);
  };
  private readonly _dataState = signal<'loading' | 'ready' | 'error'>('loading');
  get dataState() {
    return this._dataState();
  }
  setDataState = (
    value:
      | 'loading'
      | 'ready'
      | 'error'
      | ((previous: 'loading' | 'ready' | 'error') => 'loading' | 'ready' | 'error')
  ) => {
    if (typeof value === 'function') this._dataState.update(value);
    else this._dataState.set(value);
  };
  private readonly _tab = signal<Tab>('overview');
  get tab() {
    return this._tab();
  }
  setTab = (value: Tab | ((previous: Tab) => Tab)) => {
    if (typeof value === 'function') this._tab.update(value);
    else this._tab.set(value);
  };
  private readonly _query = signal<string>('');
  get query() {
    return this._query();
  }
  setQuery = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._query.update(value);
    else this._query.set(value);
  };
  private readonly _filter = signal<string>('Все');
  get filter() {
    return this._filter();
  }
  setFilter = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._filter.update(value);
    else this._filter.set(value);
  };
  private readonly _operationAccountFilter = signal<string>('Все');
  get operationAccountFilter() {
    return this._operationAccountFilter();
  }
  setOperationAccountFilter = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._operationAccountFilter.update(value);
    else this._operationAccountFilter.set(value);
  };
  private readonly _periodPreset = signal<PeriodPreset | 'custom'>('month');
  get periodPreset() {
    return this._periodPreset();
  }
  setPeriodPreset = (
    value:
      PeriodPreset | 'custom' | ((previous: PeriodPreset | 'custom') => PeriodPreset | 'custom')
  ) => {
    if (typeof value === 'function') this._periodPreset.update(value);
    else this._periodPreset.set(value);
  };
  private readonly _period = signal(periodBounds('month', this.clock.now));
  get period() {
    return this._period();
  }
  setPeriod = (
    value:
      | ReturnType<typeof this._period>
      | ((previous: ReturnType<typeof this._period>) => ReturnType<typeof this._period>)
  ) => {
    if (typeof value === 'function') this._period.update(value);
    else this._period.set(value);
  };
  private readonly _refreshToken = signal<number>(0);
  get refreshToken() {
    return this._refreshToken();
  }
  setRefreshToken = (value: number | ((previous: number) => number)) => {
    if (typeof value === 'function') this._refreshToken.update(value);
    else this._refreshToken.set(value);
  };
  private readonly _accountBalances = signal<AccountSummary[]>([]);
  get accountBalances() {
    return this._accountBalances();
  }
  setAccountBalances = (
    value: AccountSummary[] | ((previous: AccountSummary[]) => AccountSummary[])
  ) => {
    if (typeof value === 'function') this._accountBalances.update(value);
    else this._accountBalances.set(value);
  };
  private readonly _accountsView = signal<'balances' | 'reserves'>('balances');
  get accountsView() {
    return this._accountsView();
  }
  setAccountsView = (
    value:
      'balances' | 'reserves' | ((previous: 'balances' | 'reserves') => 'balances' | 'reserves')
  ) => {
    if (typeof value === 'function') this._accountsView.update(value);
    else this._accountsView.set(value);
  };
  private readonly _accountCurrencyFilter = signal<string>('Все');
  get accountCurrencyFilter() {
    return this._accountCurrencyFilter();
  }
  setAccountCurrencyFilter = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._accountCurrencyFilter.update(value);
    else this._accountCurrencyFilter.set(value);
  };
  private readonly _accountOwnerFilter = signal<string>('Все');
  get accountOwnerFilter() {
    return this._accountOwnerFilter();
  }
  setAccountOwnerFilter = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._accountOwnerFilter.update(value);
    else this._accountOwnerFilter.set(value);
  };
  private readonly _accountKindFilter = signal<string>('Все');
  get accountKindFilter() {
    return this._accountKindFilter();
  }
  setAccountKindFilter = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._accountKindFilter.update(value);
    else this._accountKindFilter.set(value);
  };
  private readonly _monthlyPlan = signal<MonthlyPlan | null>(null);
  get monthlyPlan() {
    return this._monthlyPlan();
  }
  setMonthlyPlan = (
    value: MonthlyPlan | null | ((previous: MonthlyPlan | null) => MonthlyPlan | null)
  ) => {
    if (typeof value === 'function') this._monthlyPlan.update(value);
    else this._monthlyPlan.set(value);
  };
  private readonly _receipts = signal<ReceiptData | null>(null);
  get receipts() {
    return this._receipts();
  }
  setReceipts = (
    value: ReceiptData | null | ((previous: ReceiptData | null) => ReceiptData | null)
  ) => {
    if (typeof value === 'function') this._receipts.update(value);
    else this._receipts.set(value);
  };
  private readonly _goals = signal<GoalsData | null>(null);
  get goals() {
    return this._goals();
  }
  setGoals = (value: GoalsData | null | ((previous: GoalsData | null) => GoalsData | null)) => {
    if (typeof value === 'function') this._goals.update(value);
    else this._goals.set(value);
  };
  private readonly _viewerOwner = signal<string | null>(null);
  get viewerOwner() {
    return this._viewerOwner();
  }
  setViewerOwner = (value: string | null | ((previous: string | null) => string | null)) => {
    if (typeof value === 'function') this._viewerOwner.update(value);
    else this._viewerOwner.set(value);
  };
  private readonly _selected = signal<Operation | null>(null);
  get selected() {
    return this._selected();
  }
  setSelected = (value: Operation | null | ((previous: Operation | null) => Operation | null)) => {
    if (typeof value === 'function') this._selected.update(value);
    else this._selected.set(value);
  };
  private readonly _menu = signal<boolean>(false);
  get menu() {
    return this._menu();
  }
  setMenu = (value: boolean | ((previous: boolean) => boolean)) => {
    if (typeof value === 'function') this._menu.update(value);
    else this._menu.set(value);
  };
  private readonly _loadError = signal<string>('');
  get loadError() {
    return this._loadError();
  }
  setLoadError = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._loadError.update(value);
    else this._loadError.set(value);
  };
  private readonly _updatedAt = signal<string | null>(null);
  get updatedAt() {
    return this._updatedAt();
  }
  setUpdatedAt = (value: string | null | ((previous: string | null) => string | null)) => {
    if (typeof value === 'function') this._updatedAt.update(value);
    else this._updatedAt.set(value);
  };
  private readonly _periodValid = computed(() => {
    const { period } = this;
    return validPeriod(period);
  });
  get periodValid() {
    return this._periodValid();
  }
  private readonly _accountTones = computed(() => {
    return ['mint', 'violet', 'blue'] as const;
  });
  get accountTones() {
    return this._accountTones();
  }
  private readonly _accounts = computed(() => {
    const { accountBalances, accountTones } = this;
    return accountBalances.map((account, index) => ({
      ...account,
      label: account.name,
      bank: account.bank || 'Банк не указан',
      kind: account.kind || 'Счёт',
      mask: account.mask || 'Маска не указана',
      tone: accountTones[index % accountTones.length]
    }));
  });
  get accounts() {
    return this._accounts();
  }
  private readonly _accountCurrencies = computed(() => {
    const { accounts } = this;
    return Array.from(new Set(accounts.map((account) => account.currency))).sort(
      compareAccountCurrencies
    );
  });
  get accountCurrencies() {
    return this._accountCurrencies();
  }
  private readonly _accountOwners = computed(() => {
    const { accounts } = this;
    return Array.from(new Set(accounts.map((account) => account.owner || 'Не указан'))).sort(
      (a, b) => a.localeCompare(b, 'ru')
    );
  });
  get accountOwners() {
    return this._accountOwners();
  }
  private readonly _accountKinds = computed(() => {
    const { accounts } = this;
    return Array.from(new Set(accounts.map((account) => account.kind))).sort((a, b) =>
      a.localeCompare(b, 'ru')
    );
  });
  get accountKinds() {
    return this._accountKinds();
  }
  private readonly _filteredAccounts = computed(() => {
    const { filter, accountCurrencyFilter, accountOwnerFilter, accountKindFilter, accounts } = this;
    return [...accounts]
      .sort((a, b) => compareAccountCurrencies(a.currency, b.currency))
      .filter(
        (account) =>
          (accountCurrencyFilter === 'Все' || account.currency === accountCurrencyFilter) &&
          (accountOwnerFilter === 'Все' || (account.owner || 'Не указан') === accountOwnerFilter) &&
          (accountKindFilter === 'Все' || account.kind === accountKindFilter)
      );
  });
  get filteredAccounts() {
    return this._filteredAccounts();
  }
  private readonly _accountCurrencyTotals = computed(() => {
    const { filteredAccounts } = this;
    return Object.values(
      filteredAccounts.reduce<
        Record<string, { currency: string; balance: number; known: number; total: number }>
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
  get accountCurrencyTotals() {
    return this._accountCurrencyTotals();
  }
  private readonly _raiffeisenRsdAccounts = computed(() => {
    const { filter, accounts } = this;
    return accounts
      .filter((account) => {
        const identity = `${account.name} ${account.bank}`.toLocaleLowerCase('ru');
        return (
          account.currency === 'RSD' &&
          (identity.includes('raiffeisen') || identity.includes('райф'))
        );
      })
      .slice(0, 2);
  });
  get raiffeisenRsdAccounts() {
    return this._raiffeisenRsdAccounts();
  }
  private readonly _viewerOwnerNormalized = computed(() => {
    const { viewerOwner } = this;
    return viewerOwner?.toLocaleLowerCase('ru') ?? '';
  });
  get viewerOwnerNormalized() {
    return this._viewerOwnerNormalized();
  }
  private readonly _viewerCashAccount = computed(() => {
    const { accounts, viewerOwnerNormalized } = this;
    return accounts.find((account) => {
      const identity = `${account.name} ${account.kind}`.toLocaleLowerCase('ru');
      if (!identity.includes('налич')) return false;
      if (account.owner.toLocaleLowerCase('ru') === viewerOwnerNormalized) return true;
      if (viewerOwnerNormalized === 'муж')
        return identity.includes('сереж') || identity.includes('сергей');
      if (viewerOwnerNormalized === 'жена') return identity.includes('свет');
      return false;
    });
  });
  get viewerCashAccount() {
    return this._viewerCashAccount();
  }
  private readonly _overviewAccounts = computed(() => {
    const { raiffeisenRsdAccounts, viewerCashAccount } = this;
    return [...raiffeisenRsdAccounts, ...(viewerCashAccount ? [viewerCashAccount] : [])];
  });
  get overviewAccounts() {
    return this._overviewAccounts();
  }
  private readonly _filtered = computed(() => {
    const { liveOperations, query, filter, operationAccountFilter, period } = this;
    return liveOperations.filter((item) => {
      const q = query.toLocaleLowerCase('ru').trim();
      const inPeriod =
        operationDay(item.isoDate) >= period.from && operationDay(item.isoDate) <= period.to;
      return (
        inPeriod &&
        (filter === 'Все' || item.category === filter) &&
        (operationAccountFilter === 'Все' || item.account === operationAccountFilter) &&
        (!q ||
          `${item.title} ${item.merchant} ${item.account} ${item.plan}`
            .toLocaleLowerCase('ru')
            .includes(q))
      );
    });
  });
  get filtered() {
    return this._filtered();
  }
  private readonly _periodOperations = computed(() => {
    const { liveOperations, dataState, filter, period, periodValid } = this;
    return dataState === 'ready' && periodValid
      ? liveOperations.filter(
          (item) =>
            operationDay(item.isoDate) >= period.from && operationDay(item.isoDate) <= period.to
        )
      : [];
  });
  get periodOperations() {
    return this._periodOperations();
  }
  private readonly _expenseOperations = computed(() => {
    const { filter, periodOperations } = this;
    return periodOperations.filter((item) => item.operationType === 'Расход');
  });
  get expenseOperations() {
    return this._expenseOperations();
  }
  private readonly _categoryOptions = computed(() => {
    const { liveOperations } = this;
    return [
      'Все',
      ...Array.from(new Set(liveOperations.map((item) => item.category))).sort((a, b) =>
        a.localeCompare(b, 'ru')
      )
    ];
  });
  get categoryOptions() {
    return this._categoryOptions();
  }
  private readonly _operationAccountOptions = computed(() => {
    const { liveOperations } = this;
    return Array.from(
      liveOperations.reduce((options, item) => {
        if (!options.has(item.account))
          options.set(item.account, item.shortAccount || item.account);
        return options;
      }, new Map<string, string>())
    ).sort(([, first], [, second]) => first.localeCompare(second, 'ru'));
  });
  get operationAccountOptions() {
    return this._operationAccountOptions();
  }
  private readonly _categoryBreakdown = computed(() => {
    const { expenseOperations } = this;
    return Object.entries(
      expenseOperations.reduce<Record<string, { items: Operation[]; count: number }>>(
        (totals, item) => {
          totals[item.category] ??= { items: [], count: 0 };
          totals[item.category].items.push(item);
          totals[item.category].count += 1;
          return totals;
        },
        {}
      )
    ).sort(([, first], [, second]) => second.count - first.count);
  });
  get categoryBreakdown() {
    return this._categoryBreakdown();
  }
  private readonly _needsReview = computed(() => {
    const { filter, periodOperations } = this;
    return periodOperations.filter((item) => item.status === 'Нужна проверка').length;
  });
  get needsReview() {
    return this._needsReview();
  }
  private readonly _latest = computed<Operation | undefined>(() => {
    const { periodOperations } = this;
    return periodOperations[0];
  });
  get latest() {
    return this._latest();
  }
  private readonly _latestReceipt = computed<ReceiptData['items'][number] | undefined>(() => {
    const { receipts } = this;
    return receipts?.items[0];
  });
  get latestReceipt() {
    return this._latestReceipt();
  }
  activityFor = (account: string, currency: string) => {
    const { filter, periodOperations } = this;
    const total = accountActivity(periodOperations, account, currency);
    return (
      [
        total.income ? `+${money(total.income, currency)}` : '',
        total.expense ? `−${money(total.expense, currency)}` : ''
      ]
        .filter(Boolean)
        .join(' · ') || 'Нет операций'
    );
  };
  private readonly _planItems = computed(() => {
    const { monthlyPlan } = this;
    return monthlyPlan?.items ?? [];
  });
  get planItems() {
    return this._planItems();
  }
  private readonly _sortedPlanItems = computed(() => {
    const { planItems } = this;
    return [...planItems].sort((first, second) => {
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
  get sortedPlanItems() {
    return this._sortedPlanItems();
  }
  private readonly _planTotals = computed(() => {
    const { planItems } = this;
    return Object.values(
      planItems.reduce<Record<string, { currency: string; amount: number; actual: number }>>(
        (totals, item) => {
          totals[item.currency] ??= { currency: item.currency, amount: 0, actual: 0 };
          totals[item.currency].amount += item.amount;
          totals[item.currency].actual += item.actual;
          return totals;
        },
        {}
      )
    );
  });
  get planTotals() {
    return this._planTotals();
  }
  go = (next: Tab) => {
    const { setTab, setMenu } = this;
    setTab(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => this.document.querySelector<HTMLElement>('h1')?.focus());
  };
  openReserves = () => {
    const { setAccountsView, accounts, go } = this;
    setAccountsView('reserves');
    go('accounts');
  };
  changePeriod = (value: string) => {
    if (!['day', 'week', 'month', 'halfYear', 'year'].includes(value)) return;
    const preset = value as PeriodPreset;
    const { setDataState, setPeriodPreset, setPeriod } = this;
    setDataState('loading');
    setPeriodPreset(preset);
    setPeriod(periodBounds(preset));
  };
  refreshData = () => {
    const { dataState, setDataState, setRefreshToken, periodValid } = this;
    if (dataState === 'loading' || !periodValid) return;
    setDataState('loading');
    setRefreshToken((value) => value + 1);
  };
  changeDate = (field: 'from' | 'to', value: string) => {
    const { setDataState, setPeriodPreset, period, setPeriod } = this;
    setPeriodPreset('custom');
    if (validPeriod({ ...period, [field]: value })) setDataState('loading');
    setPeriod((previous) => ({ ...previous, [field]: value }));
  };
  resetFilters = () => {
    const { setQuery, setFilter, setOperationAccountFilter } = this;
    setQuery('');
    setFilter('Все');
    setOperationAccountFilter('Все');
  };
  readonly money = money;
  readonly groupedMoney = groupedMoney;
  readonly groupedAverage = groupedAverage;
  readonly monthName = monthName;
  readonly shortPlanTitle = shortPlanTitle;
  readonly accountCountLabel = accountCountLabel;
  readonly receiptItemCountLabel = receiptItemCountLabel;
  readonly goalStatusLabel = goalStatusLabel;
  readonly categoryTone = categoryTone;
  readonly compareAccountCurrencies = compareAccountCurrencies;
  readonly countLabel = countLabel;
  readonly currentMonthStart = currentMonthStart;
  readonly operationDate = operationDate;
  readonly operationDay = operationDay;
  readonly periodBounds = periodBounds;
  readonly validPeriod = validPeriod;
  readonly notionOperations = notionOperations;
  readonly notionPlan = notionPlan;
  readonly notionReceiptItems = notionReceiptItems;
  readonly notionGoals = notionGoals;

  private readonly api = inject(FinanceApi);
  private readonly document = inject(DOCUMENT);
  private readonly browserReady = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('operationDialog');
  readonly Math = Math;
  readonly date = (value: string) => new Date(value);
  readonly eventValue = (event: Event) => (event.target as HTMLInputElement).value;
  readonly eventChecked = (event: Event) => (event.target as HTMLInputElement).checked;
  constructor() {
    afterNextRender(() => this.browserReady.set(true));
    effect((onCleanup) => {
      if (!this.browserReady()) return;
      const { from, to } = this.period;
      this.refreshToken;
      if (!validPeriod({ from, to })) return;
      this.setDataState('loading');
      this.setLoadError('');
      const subscription = this.api.operations(from, to, currentMonthStart()).subscribe({
        next: (data) => {
          if (!Array.isArray(data.operations)) {
            this.setLoadError('Ответ с данными неполный. Повторите загрузку.');
            this.setDataState('error');
            return;
          }
          this.setLiveOperations(data.operations);
          this.setAccountBalances(data.accounts ?? []);
          this.setMonthlyPlan(data.monthlyPlan ?? null);
          this.setReceipts(data.receipts ?? null);
          this.setGoals(data.goals ?? null);
          this.setViewerOwner(data.viewer?.accountOwner ?? null);
          this.setUpdatedAt(data.updatedAt ?? new Date().toISOString());
          this.setFilter((previous) =>
            previous === 'Все' || data.operations.some((item) => item.category === previous)
              ? previous
              : 'Все'
          );
          this.setOperationAccountFilter((previous) =>
            previous === 'Все' || data.operations.some((item) => item.account === previous)
              ? previous
              : 'Все'
          );
          this.setDataState('ready');
        },
        error: (error: { status?: number }) => {
          this.setLoadError(
            error.status === 401
              ? 'Сессия завершилась. Войдите в аккаунт заново.'
              : error.status === 403
                ? 'У аккаунта нет доступа к данным.'
                : 'Не удалось получить данные из Notion. Попробуйте ещё раз.'
          );
          this.setDataState('error');
        }
      });
      onCleanup(() => subscription.unsubscribe());
    });
    effect((onCleanup) => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog || !this.selected || !this.browserReady()) return;
      const focused = this.document.activeElement as HTMLElement | null;
      const overflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
      onCleanup(() => {
        dialog.close();
        this.document.body.style.overflow = overflow;
        focused?.focus();
      });
    });
  }
  closeOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) this.setSelected(null);
  }
}
