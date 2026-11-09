import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { FinanceWorkspace } from './finance-workspace';
import { OperationDetails } from './operation-details';
import { UiIcon } from './shared/ui-icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIcon, OperationDetails],
  templateUrl: './app.html'
})
export class App {
  protected readonly vm = inject(FinanceWorkspace);
  private readonly router = inject(Router);
  protected readonly menu = signal(false);
  protected readonly activated = signal(0);
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  protected readonly showStatus = computed(() => !this.url().startsWith('/dashboards'));
  protected readonly updatedLabel = computed(() => {
    const updated = this.vm.updatedAt();
    return updated
      ? new Date(updated).toLocaleTimeString('ru-RU', {
          timeZone: 'Europe/Belgrade',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';
  });
  protected readonly navigation = [
    { path: '/', label: 'Обзор', icon: 'home' },
    { path: '/operations', label: 'Операции', icon: 'receipt' },
    { path: '/plan', label: 'План', icon: 'target' },
    { path: '/accounts', label: 'Счета', icon: 'wallet' },
    { path: '/dashboards', label: 'Дашборды', icon: 'chart' }
  ];
  constructor() {
    afterRenderEffect(() => {
      this.activated();
      this.content()
        ?.nativeElement.querySelector<HTMLElement>('h1')
        ?.focus({ preventScroll: true });
    });
  }
}
