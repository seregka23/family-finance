import { Component, input } from '@angular/core';
import { UiIcon } from './ui-icon';
@Component({
  selector: 'app-page-head',
  imports: [UiIcon],
  templateUrl: './page-head.html',
  host: { style: 'display: contents' }
})
export class PageHead {
  readonly title = input<string>('');
  readonly text = input<string>('');
  readonly action = input<boolean>(false);
  readonly notionOperations = 'https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7';
}
