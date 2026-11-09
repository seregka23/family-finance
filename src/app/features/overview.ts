import { Component, inject } from '@angular/core';
import { FinanceWorkspace } from '../finance-workspace';
import { AccountMark } from '../shared/account-mark';
import { Category } from '../shared/category';
import { SectionTitle } from '../shared/section-title';
import { Status } from '../shared/status';
import { UiIcon } from '../shared/ui-icon';

import {
  categoryTone,
  eventValue,
  groupedAverage,
  groupedMoney,
  money,
  monthName,
  shortPlanTitle
} from '../finance-format';
import { countLabel, currentMonthStart } from '../models/finance-ui-model';
@Component({
  selector: 'app-overview',
  imports: [UiIcon, AccountMark, Status, SectionTitle, Category],
  templateUrl: './overview.html',
  host: { style: 'display: contents' }
})
export class Overview {
  readonly vm = inject(FinanceWorkspace);
  readonly money = money;
  readonly groupedMoney = groupedMoney;
  readonly groupedAverage = groupedAverage;
  readonly monthName = monthName;
  readonly shortPlanTitle = shortPlanTitle;
  readonly categoryTone = categoryTone;
  readonly countLabel = countLabel;
  readonly currentMonthStart = currentMonthStart;
  readonly Math = Math;
  readonly date = (value: string) => new Date(value);
  readonly eventValue = eventValue;
}
