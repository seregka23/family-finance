import { Component, input, output } from '@angular/core';
import { money } from '../../finance-format';
import { operationDate } from '../../models/finance-ui-model';
import type { FinancialReserve } from '../../models/reserve-model';

@Component({
  selector: 'app-reserve-row',
  templateUrl: './reserve-row.html',
  host: { style: 'display: contents' }
})
export class ReserveRow {
  readonly goal = input.required<FinancialReserve>();
  readonly history = output<void>();
  readonly money = money;
  readonly operationDate = operationDate;
  readonly Math = Math;
}
