import { AppClock } from './app-clock';
import { Component, signal, computed, inject, afterNextRender, effect } from '@angular/core';
import { FinanceApi } from './finance-api';
import { belgradeDay, type ExpenseDashboardData } from './models/expense-model';
const sourceUrl = 'https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7';
const amountLabel = (value: number, currency: string) =>
  `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Belgrade'
  });
@Component({ selector: 'app-expenses', templateUrl: './expenses.component.html' })
export class Expenses {
  private readonly clock = inject(AppClock);
  private readonly _month = signal<string>(belgradeDay(this.clock.now).slice(0, 7));
  get month() {
    return this._month();
  }
  setMonth = (
    value:
      | ReturnType<typeof this._month>
      | ((previous: ReturnType<typeof this._month>) => ReturnType<typeof this._month>)
  ) => {
    if (typeof value === 'function') this._month.update(value);
    else this._month.set(value);
  };
  private readonly _currency = signal<string>('RSD');
  get currency() {
    return this._currency();
  }
  setCurrency = (value: string | ((previous: string) => string)) => {
    if (typeof value === 'function') this._currency.update(value);
    else this._currency.set(value);
  };
  private readonly _data = signal<ExpenseDashboardData | null>(null);
  get data() {
    return this._data();
  }
  setData = (
    value:
      | ExpenseDashboardData
      | null
      | ((previous: ExpenseDashboardData | null) => ExpenseDashboardData | null)
  ) => {
    if (typeof value === 'function') this._data.update(value);
    else this._data.set(value);
  };
  private readonly _status = signal<'loading' | 'ready' | 'error'>('loading');
  get status() {
    return this._status();
  }
  setStatus = (
    value:
      | 'loading'
      | 'ready'
      | 'error'
      | ((previous: 'loading' | 'ready' | 'error') => 'loading' | 'ready' | 'error')
  ) => {
    if (typeof value === 'function') this._status.update(value);
    else this._status.set(value);
  };
  private readonly _refresh = signal<number>(0);
  get refresh() {
    return this._refresh();
  }
  setRefresh = (value: number | ((previous: number) => number)) => {
    if (typeof value === 'function') this._refresh.update(value);
    else this._refresh.set(value);
  };
  private readonly _selectedDay = signal<string | null>(null);
  get selectedDay() {
    return this._selectedDay();
  }
  setSelectedDay = (value: string | null | ((previous: string | null) => string | null)) => {
    if (typeof value === 'function') this._selectedDay.update(value);
    else this._selectedDay.set(value);
  };
  private readonly _chartMode = signal<'daily' | 'cumulative'>('daily');
  get chartMode() {
    return this._chartMode();
  }
  setChartMode = (
    value: 'daily' | 'cumulative' | ((previous: 'daily' | 'cumulative') => 'daily' | 'cumulative')
  ) => {
    if (typeof value === 'function') this._chartMode.update(value);
    else this._chartMode.set(value);
  };
  private readonly _merchantSort = signal<'amount' | 'count'>('amount');
  get merchantSort() {
    return this._merchantSort();
  }
  setMerchantSort = (
    value: 'amount' | 'count' | ((previous: 'amount' | 'count') => 'amount' | 'count')
  ) => {
    if (typeof value === 'function') this._merchantSort.update(value);
    else this._merchantSort.set(value);
  };
  private readonly _allMerchants = signal<boolean>(false);
  get allMerchants() {
    return this._allMerchants();
  }
  setAllMerchants = (value: boolean | ((previous: boolean) => boolean)) => {
    if (typeof value === 'function') this._allMerchants.update(value);
    else this._allMerchants.set(value);
  };
  private readonly _currentMonth = computed(() => {
    return belgradeDay(this.clock.now).slice(0, 7);
  });
  get currentMonth() {
    return this._currentMonth();
  }
  reload = () => {
    const { setStatus, setRefresh } = this;
    setStatus('loading');
    setRefresh((value) => value + 1);
  };
  private readonly _bucket = computed(() => {
    const { currency, data } = this;
    return data?.currencies.find((item) => item.currency === currency);
  });
  get bucket() {
    return this._bucket();
  }
  private readonly _monthLabel = computed(() => {
    const { month } = this;
    return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Belgrade'
    });
  });
  get monthLabel() {
    return this._monthLabel();
  }
  private readonly _dailyMax = computed(() => {
    const { chartMode, bucket } = this;
    return Math.max(
      1,
      ...(bucket?.days.map((day) => (chartMode === 'daily' ? day.amount : day.cumulative)) ?? [])
    );
  });
  get dailyMax() {
    return this._dailyMax();
  }
  private readonly _focusedDay = computed(() => {
    const { selectedDay, bucket } = this;
    return bucket?.days.find((day) => day.date === selectedDay);
  });
  get focusedDay() {
    return this._focusedDay();
  }
  private readonly _peakDay = computed(() => {
    const { bucket } = this;
    return bucket?.days.reduce(
      (peak, day) => (day.amount > peak.amount ? day : peak),
      bucket.days[0]
    );
  });
  get peakDay() {
    return this._peakDay();
  }
  private readonly _merchants = computed(() => {
    const { merchantSort, bucket } = this;
    return [...(bucket?.merchants ?? [])].sort(
      (a, b) =>
        b[merchantSort] - a[merchantSort] ||
        b.amount - a.amount ||
        a.name.localeCompare(b.name, 'ru')
    );
  });
  get merchants() {
    return this._merchants();
  }
  private readonly _merchantMax = computed(() => {
    const { merchantSort, merchants } = this;
    return Math.max(1, merchants[0]?.[merchantSort] ?? 0);
  });
  get merchantMax() {
    return this._merchantMax();
  }
  shareLabel = (value: number) => {
    const { bucket } = this;
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(bucket?.total ? (value / bucket.total) * 100 : 0)}%`;
  };
  private readonly _periodLabel = computed(() => {
    const { month, data, monthLabel } = this;
    return data ? `${dateLabel(`${month}-01`)} — ${dateLabel(data.through)}` : monthLabel;
  });
  get periodLabel() {
    return this._periodLabel();
  }

  readonly amountLabel = amountLabel;
  readonly dateLabel = dateLabel;
  readonly sourceUrl = sourceUrl;
  readonly belgradeDay = belgradeDay;
  private readonly api = inject(FinanceApi);
  private readonly browserReady = signal(false);
  readonly Math = Math;
  readonly Number = Number;
  readonly encodeURIComponent = encodeURIComponent;
  readonly date = (value: string) => new Date(value);
  readonly formatNumber = (value: number, digits = 0) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
  readonly eventValue = (event: Event) => (event.target as HTMLInputElement).value;
  constructor() {
    afterNextRender(() => this.browserReady.set(true));
    effect((onCleanup) => {
      if (!this.browserReady()) return;
      const month = this.month;
      this.refresh;
      this.setStatus('loading');
      const subscription = this.api.expenses(month).subscribe({
        next: (result) => {
          this.setData(result);
          this.setCurrency((previous) =>
            result.currencies.some((item) => item.currency === previous)
              ? previous
              : (result.currencies[0]?.currency ?? 'RSD')
          );
          this.setStatus('ready');
        },
        error: () => this.setStatus('error')
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
  changeMonth(value: string) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
      value < '2000-01' ||
      value > this.currentMonth ||
      value === this.month
    )
      return;
    this.setData(null);
    this.setSelectedDay(null);
    this.setAllMerchants(false);
    this.setMonth(value);
  }
}
