import { Component, inject } from '@angular/core';
import { FinanceWorkspace } from '../finance-workspace';
import { UiIcon } from '../shared/ui-icon';

import { money, monthName, notionPlan, shortPlanTitle } from '../finance-format';
import { currentMonthStart } from '../models/finance-ui-model';
@Component({
  selector: 'app-plan',
  imports: [UiIcon],
  templateUrl: './plan.html',
  host: { style: 'display: contents' }
})
export class Plan {
  readonly vm = inject(FinanceWorkspace);
  readonly money = money;
  readonly monthName = monthName;
  readonly shortPlanTitle = shortPlanTitle;
  readonly currentMonthStart = currentMonthStart;
  readonly notionPlan = notionPlan;
  readonly Math = Math;
}
