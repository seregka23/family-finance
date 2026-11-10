import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../auth-service';
import { loginUrl } from '../auth-errors';
import { TransactionDialog } from './transaction-dialog';
import { FinanceWorkspace } from '../finance-workspace';
import { PageHead } from '../shared/page-head';
import { ReceiptLine } from '../shared/receipt-line';
import { SectionTitle } from '../shared/section-title';
import { Status } from '../shared/status';
import { UiIcon } from '../shared/ui-icon';

import {
  categoryTone,
  eventValue,
  groupedMoney,
  money,
  receiptItemCountLabel
} from '../finance-format';

@Component({
  selector: 'app-operations',
  imports: [UiIcon, Status, SectionTitle, PageHead, ReceiptLine, TransactionDialog],
  templateUrl: './operations.html',
  host: { style: 'display: contents' }
})
export class Operations {
  readonly vm = inject(FinanceWorkspace);
  readonly auth = inject(AuthService);
  readonly adding = signal(false);
  readonly authError = signal<401 | 403 | null>(null);
  readonly saved = signal(false);
  readonly loginUrl = loginUrl('/operations');
  openAdd() { this.saved.set(false); this.authError.set(null); this.adding.set(true); }
  authFailed(status: 401 | 403) { this.vm.selected.set(null); this.adding.set(false); this.authError.set(status); this.vm.refreshData(); }
  created(date: string) {
    this.adding.set(false);
    this.saved.set(true);
    this.vm.resetFilters();
    const period = this.vm.period();
    if (!this.vm.periodValid() || date < period.from || date > period.to) {
      this.vm.periodPreset.set('custom');
      this.vm.period.set({ from: date, to: date });
    } else {
      this.vm.period.set({ ...period });
    }
  }
  readonly money = money;
  readonly groupedMoney = groupedMoney;
  readonly receiptItemCountLabel = receiptItemCountLabel;
  readonly categoryTone = categoryTone;
  readonly date = (value: string) => new Date(value);
  readonly eventValue = eventValue;
}
