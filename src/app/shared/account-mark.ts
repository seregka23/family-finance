import { Component, computed, input } from '@angular/core';
import { UiIcon } from './ui-icon';
@Component({
  selector: 'app-account-mark',
  imports: [UiIcon],
  templateUrl: './account-mark.html',
  host: { style: 'display: contents' }
})
export class AccountMark {
  readonly bank = input<string>('');
  readonly size = input<string>('normal');
  readonly tone = computed(() =>
    this.bank().toLocaleLowerCase('ru').includes('raiffeisen')
      ? 'raiffeisen'
      : this.bank().toLocaleLowerCase('ru').includes('налич')
        ? 'cash'
        : 'generic'
  );
}
