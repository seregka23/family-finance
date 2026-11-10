import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, required, maxLength, pattern, disabled } from '@angular/forms/signals';
import { FinanceApi } from '../finance-api';
import { authErrorStatus } from '../auth-errors';
import { belgradeDay } from '../models/expense-model';
import type { CreateOperation, TransactionOptions } from '../finance-types';

type Currency = CreateOperation['currency'];
@Component({ selector: 'app-transaction-dialog', imports: [FormField], templateUrl: './transaction-dialog.html' })
export class TransactionDialog {
  private readonly api = inject(FinanceApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly cancelled = output<void>();
  readonly saved = output<string>();
  readonly authFailed = output<401 | 403>();
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly optionsFailed = signal(false);
  readonly optionsReady = signal(false);
  readonly error = signal('');
  readonly options = signal<TransactionOptions>({ accounts: [], categories: [] });
  readonly model = signal({ operationType: 'Расход' as 'Расход' | 'Доход', title: '', amount: '', currency: 'RSD' as Currency,
    operationDate: belgradeDay(new Date()), operationTime: '', accountId: '', categoryId: '', merchant: '', note: '' });
  readonly fields = form(this.model, (path) => {
    required(path.title); maxLength(path.title, 200);
    required(path.amount); pattern(path.amount, /^\d+(?:[.,]\d{1,2})?$/);
    required(path.operationDate);
    disabled(path.currency, { when: ({ valueOf }) => !!valueOf(path.accountId) });
    maxLength(path.merchant, 200); maxLength(path.note, 2000);
  });
  private priorPayload = '';
  private requestId = '';
  constructor() {
    afterRenderEffect((onCleanup) => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      const focused = this.document.activeElement as HTMLElement | null;
      dialog.showModal();
      onCleanup(() => { if (dialog.open) dialog.close(); focused?.focus(); });
    });
    this.loadOptions();
  }
  loadOptions() {
    this.loading.set(true); this.optionsReady.set(false); this.optionsFailed.set(false); this.error.set('');
    this.api.transactionOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (options) => { this.options.set(options); this.optionsReady.set(true); this.loading.set(false); },
      error: (error: unknown) => { this.loading.set(false); this.optionsFailed.set(true); this.handleError(error, 'Не удалось загрузить счета и категории. Попробуйте ещё раз.'); }
    });
  }
  accountChanged(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.model.update((value) => ({ ...value, accountId: id }));
    const account = this.options().accounts.find((item) => item.id === id);
    if (account && ['RSD', 'EUR', 'USD', 'RUB'].includes(account.currency)) {
      this.model.update((value) => ({ ...value, accountId: id, currency: account.currency as Currency }));
    }
  }
  close() { if (!this.busy()) this.cancelled.emit(); }
  onCancel(event: Event) { event.preventDefault(); this.close(); }
  submit(event: Event) {
    event.preventDefault();
    if (this.busy() || this.loading() || !this.optionsReady()) return;
    const value = this.model();
    const amount = value.amount.replace(',', '.');
    const date = new Date(`${value.operationDate}T00:00:00Z`);
    if (!this.fields().valid() || !value.title.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 ||
        Number(amount) > 900719925474.09 || !/^\d{4}-\d{2}-\d{2}$/.test(value.operationDate) ||
        Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value.operationDate ||
        (value.operationTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.operationTime))) {
      this.error.set('Проверьте название, дату и сумму: сумма должна быть больше нуля и содержать не более двух знаков после запятой.');
      return;
    }
    const payload = { ...value, title: value.title.trim(), amount: value.amount, merchant: value.merchant.trim(), note: value.note.trim(), accountId: value.accountId || null, categoryId: value.categoryId || null };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== this.priorPayload) { this.requestId = crypto.randomUUID(); this.priorPayload = fingerprint; }
    this.error.set(''); this.busy.set(true);
    this.api.createOperation({ ...payload, requestId: this.requestId }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.saved.emit(value.operationDate); },
      error: (error: unknown) => {
        this.busy.set(false);
        const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        this.handleError(error, status === 0 || status === 503 || status === undefined
          ? 'Не удалось подтвердить сохранение. Повторите отправку.'
          : 'Не удалось сохранить операцию. Проверьте данные и повторите попытку.');
      }
    });
  }
  private handleError(error: unknown, fallback: string) {
    const status = authErrorStatus(error);
    if (status) { this.authFailed.emit(status); return; }
    this.error.set(fallback);
  }
}
