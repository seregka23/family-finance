import { Component, input } from '@angular/core';
import { money } from '../finance-format';
import type { ReserveAccount } from '../finance-types';

@Component({
  selector: 'app-account-reserve-summary',
  templateUrl: './account-reserve-summary.html',
  host: { style: 'display: contents' }
})
export class AccountReserveSummary {
  readonly account = input.required<ReserveAccount>();
  readonly money = money;
}
