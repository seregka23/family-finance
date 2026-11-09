import { Component, input } from '@angular/core';

@Component({
  selector: 'app-icon',
  imports: [],
  templateUrl: './ui-icon.html',
  host: { style: 'display: contents' }
})
export class UiIcon {
  readonly name = input<string>('');
  readonly size = input<number>(22);
}
