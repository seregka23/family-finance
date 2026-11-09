import { Component, input } from '@angular/core';

import { money } from '../finance-format';
@Component({
  selector: 'app-receipt-line',
  imports: [],
  templateUrl: './receipt-line.html',
  host: { style: 'display: contents' }
})
export class ReceiptLine {
  readonly name = input<string>('');
  readonly amount = input<number>(0);
  readonly percent = input<number>(0);
  readonly currency = input<string>('RSD');
  readonly money = money;
}
