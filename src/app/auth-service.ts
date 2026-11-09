import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  readonly busy = signal(false);
  readonly error = signal('');

  logout() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => this.document.defaultView?.location.assign('/login'),
      error: () => {
        this.busy.set(false);
        this.error.set('Не удалось выйти. Попробуйте ещё раз.');
      }
    });
  }
}
