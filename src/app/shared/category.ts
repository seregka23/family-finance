import { Component, input } from '@angular/core';

import { countLabel } from '../models/finance-ui-model';
@Component({
  selector: 'app-category',
  imports: [],
  templateUrl: './category.html',
  host: { style: 'display: contents' }
})
export class Category {
  readonly name = input<string>('');
  readonly amount = input<string>('');
  readonly percent = input<number>(0);
  readonly count = input<number>(0);
  readonly tone = input<string>('mint');
  readonly countLabel = countLabel;
}
