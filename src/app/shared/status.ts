import { Component, input } from '@angular/core';
import { UiIcon } from './ui-icon';
@Component({
  selector: 'app-status',
  imports: [UiIcon],
  templateUrl: './status.html',
  host: { style: 'display: contents' }
})
export class Status {
  readonly value = input<string>('');
}
