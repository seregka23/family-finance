import { afterNextRender, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AppClock } from '../../app-clock';
import { authErrorStatus, loginUrl } from '../../auth-errors';
import { FinanceApi } from '../../finance-api';
import { money as amountLabel, eventValue } from '../../finance-format';
import { belgradeDay } from '../../models/expense-model';

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Belgrade'
  });

@Component({ selector: 'app-expenses', templateUrl: './expenses.html' })
export class Expenses {
  private readonly clock = inject(AppClock);
  private readonly api = inject(FinanceApi);
  private readonly router = inject(Router);
  private readonly browserReady = signal(false);
  readonly currentMonth = belgradeDay(this.clock.now).slice(0, 7);
  readonly month = signal(this.currentMonth);
  readonly selectedDay = signal<string | null>(null);
  readonly chartMode = signal<'daily' | 'cumulative'>('daily');
  readonly merchantSort = signal<'amount' | 'count'>('amount');
  readonly allMerchants = signal(false);

  private readonly request = rxResource({
    params: () => (this.browserReady() ? this.month() : undefined),
    stream: ({ params }) => this.api.expenses(params)
  });
  readonly status = computed(() =>
    this.request.isLoading()
      ? 'loading'
      : this.request.error()
        ? 'error'
        : this.request.hasValue()
          ? 'ready'
          : 'loading'
  );
  readonly authError = computed(() => authErrorStatus(this.request.error()));
  readonly loginUrl = computed(() => loginUrl(this.router.url));
  readonly data = computed(() =>
    this.status() === 'ready' && this.request.hasValue() ? this.request.value() : null
  );
  readonly currency = linkedSignal<string[] | undefined, string>({
    source: () => this.data()?.currencies.map((item) => item.currency),
    computation: (options, previous) =>
      !options
        ? (previous?.value ?? 'RSD')
        : options.includes(previous?.value ?? 'RSD')
          ? (previous?.value ?? 'RSD')
          : (options[0] ?? 'RSD')
  });
  readonly bucket = computed(() =>
    this.data()?.currencies.find((item) => item.currency === this.currency())
  );
  readonly monthLabel = computed(() =>
    new Date(`${this.month()}-01T12:00:00Z`).toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Belgrade'
    })
  );
  readonly dailyMax = computed(() =>
    Math.max(
      1,
      ...(this.bucket()?.days.map((day) =>
        this.chartMode() === 'daily' ? day.amount : day.cumulative
      ) ?? [])
    )
  );
  readonly focusedDay = computed(() =>
    this.bucket()?.days.find((day) => day.date === this.selectedDay())
  );
  readonly peakDay = computed(() => {
    const days = this.bucket()?.days;
    return days?.reduce((peak, day) => (day.amount > peak.amount ? day : peak), days[0]);
  });
  readonly merchants = computed(() =>
    [...(this.bucket()?.merchants ?? [])].sort(
      (a, b) =>
        b[this.merchantSort()] - a[this.merchantSort()] ||
        b.amount - a.amount ||
        a.name.localeCompare(b.name, 'ru')
    )
  );
  readonly visibleMerchants = computed(() =>
    this.allMerchants() ? this.merchants() : this.merchants().slice(0, 6)
  );
  readonly merchantMax = computed(() =>
    Math.max(1, this.merchants()[0]?.[this.merchantSort()] ?? 0)
  );
  readonly periodLabel = computed(() => {
    const data = this.data();
    return data
      ? `${dateLabel(`${this.month()}-01`)} — ${dateLabel(data.through)}`
      : this.monthLabel();
  });
  protected readonly amountLabel = amountLabel;
  protected readonly dateLabel = dateLabel;
  protected readonly Math = Math;
  protected readonly Number = Number;
  protected readonly encodeURIComponent = encodeURIComponent;
  protected readonly eventValue = eventValue;
  protected readonly date = (value: string) => new Date(value);
  protected readonly formatNumber = (value: number, digits = 0) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);

  constructor() {
    afterNextRender(() => this.browserReady.set(true));
  }
  reload() {
    this.request.reload();
  }
  shareLabel(value: number) {
    const total = this.bucket()?.total;
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(total ? (value / total) * 100 : 0)}%`;
  }
  changeMonth(value: string) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
      value < '2000-01' ||
      value > this.currentMonth ||
      value === this.month()
    )
      return;
    this.selectedDay.set(null);
    this.allMerchants.set(false);
    this.month.set(value);
  }
}
