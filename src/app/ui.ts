import { Component, input, output } from '@angular/core';
import { countLabel } from './models/finance-ui-model';
const money = (value: number | null, currency: string) =>
  value === null
    ? 'Нет данных'
    : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        value
      ) +
      ' ' +
      currency;

@Component({
  selector: 'app-icon',
  imports: [],
  template: `<svg
    [attr.width]="size"
    [attr.height]="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    @switch (name) {
      @case ('family') {
        <circle cx="8" cy="7" r="3"></circle>
        <circle cx="17" cy="8" r="2.5"></circle>
        <path d="M2.5 20v-2a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v2M14 14a4.5 4.5 0 0 1 7.5 3.4V20"></path>
      }
      @case ('home') {
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"></path>
      }
      @case ('wallet') {
        <path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13"></path>
        <path d="m3 8 14-4v4M15 13h6v4h-6a2 2 0 0 1 0-4Z"></path>
      }
      @case ('card') {
        <rect x="2.5" y="5" width="19" height="14" rx="3"></rect>
        <path d="M2.5 10h19M6 15h4"></path>
      }
      @case ('down') {
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 7v10m-4-4 4 4 4-4"></path>
      }
      @case ('up') {
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 17V7m-4 4 4-4 4 4"></path>
      }
      @case ('calendar') {
        <rect x="3" y="5" width="18" height="16" rx="3"></rect>
        <path d="M7 3v4m10-4v4M3 10h18"></path>
      }
      @case ('chart') {
        <path d="M12 3v9h9"></path>
        <path d="M20 16a9 9 0 1 1-12-12"></path>
      }
      @case ('refresh') {
        <path d="M20 11a8 8 0 0 0-14.8-4L3 10"></path>
        <path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14"></path>
        <path d="M21 19v-5h-5"></path>
      }
      @case ('database') {
        <ellipse cx="12" cy="5" rx="7" ry="3"></ellipse>
        <path d="M5 5v6c0 1.7 3 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3 3 7 3s7-1.3 7-3v-6"></path>
      }
      @case ('receipt') {
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"></path>
        <path d="M9 8h6m-6 4h6m-6 4h3"></path>
      }
      @case ('search') {
        <circle cx="11" cy="11" r="7"></circle>
        <path d="m20 20-4-4"></path>
      }
      @case ('external') {
        <path d="M14 4h6v6m0-6-9 9"></path>
        <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"></path>
      }
      @case ('check') {
        <circle cx="12" cy="12" r="9"></circle>
        <path d="m8 12 2.5 2.5L16 9"></path>
      }
      @case ('alert') {
        <path
          d="M10.3 4 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z"
        ></path>
        <path d="M12 9v4m0 4h.01"></path>
      }
      @case ('close') {
        <path d="m6 6 12 12M18 6 6 18"></path>
      }
      @case ('menu') {
        <path d="M4 7h16M4 12h16M4 17h16"></path>
      }
      @case ('target') {
        <circle cx="12" cy="12" r="9"></circle>
        <circle cx="12" cy="12" r="4"></circle>
      }
      @case ('chevron') {
        <path d="m9 18 6-6-6-6"></path>
      }
    }
  </svg>`,
  host: { style: 'display: contents' }
})
export class UiIcon {
  readonly _name = input<string>('', { alias: 'name' });
  get name() {
    return this._name();
  }
  readonly _size = input<number>(22, { alias: 'size' });
  get size() {
    return this._size();
  }
}

@Component({
  selector: 'app-account-mark',
  imports: [UiIcon],
  template: `<span
    [class]="'bank-mark ' + tone + ' ' + size"
    [attr.aria-label]="bank || 'Банк не указан'"
  >
    @if (tone === 'cash') {
      <app-icon name="wallet" [size]="size === 'large' ? 24 : 19" />
    } @else {
      {{ tone === 'raiffeisen' ? 'R' : bank.trim().charAt(0).toLocaleUpperCase('ru') }}
    }
  </span>`,
  host: { style: 'display: contents' }
})
export class AccountMark {
  readonly _bank = input<string>('', { alias: 'bank' });
  get bank() {
    return this._bank();
  }
  readonly _size = input<string>('normal', { alias: 'size' });
  get size() {
    return this._size();
  }
  get tone() {
    return this.bank.toLocaleLowerCase('ru').includes('raiffeisen')
      ? 'raiffeisen'
      : this.bank.toLocaleLowerCase('ru').includes('налич')
        ? 'cash'
        : 'generic';
  }
}

@Component({
  selector: 'app-status',
  imports: [UiIcon],
  template: `<span [class]="\`status \${value === 'Готово' ? 'ready' : 'review'}\`"
    ><app-icon [name]="value === 'Готово' ? 'check' : 'alert'" [size]="14"></app-icon
    >{{ value }}</span
  >`,
  host: { style: 'display: contents' }
})
export class Status {
  readonly _value = input<string>('', { alias: 'value' });
  get value() {
    return this._value();
  }
}

@Component({
  selector: 'app-section-title',
  imports: [UiIcon],
  template: `<div class="title">
    <span
      ><app-icon [name]="icon"></app-icon>
      <h2>{{ text }}</h2></span
    >
    @if (action) {
      <button (click)="actionClick.emit()">
        {{ action }}<app-icon name="chevron" [size]="15"></app-icon>
      </button>
    } @else {
      @if (badge) {
        <em>{{ badge }}</em>
      } @else {}
    }
  </div>`,
  host: { style: 'display: contents' }
})
export class SectionTitle {
  readonly _icon = input<string>('', { alias: 'icon' });
  get icon() {
    return this._icon();
  }
  readonly _text = input<string>('', { alias: 'text' });
  get text() {
    return this._text();
  }
  readonly _action = input<string | null | undefined>(undefined, { alias: 'action' });
  get action() {
    return this._action();
  }
  readonly _badge = input<string | null | undefined>(undefined, { alias: 'badge' });
  get badge() {
    return this._badge();
  }
  readonly actionClick = output<void>();
}

@Component({
  selector: 'app-category',
  imports: [],
  template: `<div class="category">
    <div>
      <span><i [class]="tone"></i>{{ name }}</span
      ><b>{{ amount }}</b>
    </div>
    <div class="bar"><i [class]="tone" [style.width]="\`\${percent}%\`"></i></div>
    <small
      >{{ countLabel(count, ['операция', 'операции', 'операций']) }}· {{ percent.toFixed(1) }}%
      операций</small
    >
  </div>`,
  host: { style: 'display: contents' }
})
export class Category {
  readonly _name = input<string>('', { alias: 'name' });
  get name() {
    return this._name();
  }
  readonly _amount = input<string>('', { alias: 'amount' });
  get amount() {
    return this._amount();
  }
  readonly _percent = input<number>(0, { alias: 'percent' });
  get percent() {
    return this._percent();
  }
  readonly _count = input<number>(0, { alias: 'count' });
  get count() {
    return this._count();
  }
  readonly _tone = input<string>('mint', { alias: 'tone' });
  get tone() {
    return this._tone();
  }
  readonly countLabel = countLabel;
}

@Component({
  selector: 'app-page-head',
  imports: [UiIcon],
  template: `<section class="page-head">
    <div>
      <h1 [attr.tabindex]="-1">{{ title }}</h1>
      <p>{{ text }}</p>
    </div>
    @if (action) {
      <a class="cta" [href]="notionOperations" target="_blank" rel="noreferrer"
        ><b>＋</b>Добавить в Notion <app-icon name="external" [size]="17"></app-icon
      ></a>
    }
  </section>`,
  host: { style: 'display: contents' }
})
export class PageHead {
  readonly _title = input<string>('', { alias: 'title' });
  get title() {
    return this._title();
  }
  readonly _text = input<string>('', { alias: 'text' });
  get text() {
    return this._text();
  }
  readonly _action = input<boolean>(false, { alias: 'action' });
  get action() {
    return this._action();
  }
  readonly notionOperations = 'https://app.notion.com/p/cea34bd95bb844edb69b911a129b2fc7';
}

@Component({
  selector: 'app-receipt-line',
  imports: [],
  template: `<div class="receipt-line">
    <span
      >{{ name }}<small>{{ percent.toFixed(1) }}%</small></span
    >
    <div class="bar"><i [style.width]="\`\${percent}%\`"></i></div>
    <b>{{ money(amount, currency) }}</b>
  </div>`,
  host: { style: 'display: contents' }
})
export class ReceiptLine {
  readonly _name = input<string>('', { alias: 'name' });
  get name() {
    return this._name();
  }
  readonly _amount = input<number>(0, { alias: 'amount' });
  get amount() {
    return this._amount();
  }
  readonly _percent = input<number>(0, { alias: 'percent' });
  get percent() {
    return this._percent();
  }
  readonly _currency = input<string>('RSD', { alias: 'currency' });
  get currency() {
    return this._currency();
  }
  readonly money = money;
}
