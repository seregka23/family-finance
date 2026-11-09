import { Component, input } from '@angular/core';
@Component({
  selector: 'app-page-head',
  templateUrl: './page-head.html',
  host: { style: 'display: contents' }
})
export class PageHead {
  readonly title = input<string>('');
  readonly text = input<string>('');
}
