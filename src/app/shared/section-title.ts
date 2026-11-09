import { Component, input, output } from '@angular/core';
import { UiIcon } from './ui-icon';
@Component({
  selector: 'app-section-title',
  imports: [UiIcon],
  templateUrl: './section-title.html',
  host: { style: 'display: contents' }
})
export class SectionTitle {
  readonly icon = input<string>('');
  readonly text = input<string>('');
  readonly action = input<string | null | undefined>(undefined);
  readonly badge = input<string | null | undefined>(undefined);
  readonly actionClick = output<void>();
}
