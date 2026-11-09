import { Component, inject } from '@angular/core';
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
  notionReceiptItems,
  receiptItemCountLabel
} from '../finance-format';

@Component({
  selector: 'app-operations',
  imports: [UiIcon, Status, SectionTitle, PageHead, ReceiptLine],
  templateUrl: './operations.html',
  host: { style: 'display: contents' }
})
export class Operations {
  readonly vm = inject(FinanceWorkspace);
  readonly money = money;
  readonly groupedMoney = groupedMoney;
  readonly receiptItemCountLabel = receiptItemCountLabel;
  readonly categoryTone = categoryTone;
  readonly notionReceiptItems = notionReceiptItems;
  readonly date = (value: string) => new Date(value);
  readonly eventValue = eventValue;
}
