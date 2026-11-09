import { Component, inject } from '@angular/core';
import { FinanceWorkspace } from '../finance-workspace';
import { AccountMark } from '../shared/account-mark';
import { AccountReserveSummary } from '../shared/account-reserve-summary';
import { PageHead } from '../shared/page-head';
import { UiIcon } from '../shared/ui-icon';
import { Reserves } from './reserves/reserves';

import { accountCountLabel, eventValue, money } from '../finance-format';

@Component({
  selector: 'app-accounts',
  imports: [UiIcon, AccountMark, PageHead, Reserves, AccountReserveSummary],
  templateUrl: './accounts.html',
  host: { style: 'display: contents' }
})
export class Accounts {
  readonly vm = inject(FinanceWorkspace);
  readonly money = money;
  readonly accountCountLabel = accountCountLabel;
  readonly eventValue = eventValue;
}
