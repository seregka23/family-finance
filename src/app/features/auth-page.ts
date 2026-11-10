import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { safeReturnTo } from '../auth-errors';

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './auth-page.html'
})
export class AuthPage {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  readonly register = this.route.snapshot.data['mode'] === 'register';
  readonly returnTo = safeReturnTo(this.route.snapshot.queryParamMap.get('return_to'));
  readonly busy = signal(false);
  readonly error = signal('');
  readonly attempted = signal(false);
  email = '';
  password = '';
  confirmPassword = '';
  name = '';
  token = '';

  constructor() {
    afterNextRender(() => {
      if (!this.register) return;
      const browser = this.document.defaultView;
      if (!browser) return;
      const fragment = new URLSearchParams(browser.location.hash.slice(1));
      const invitation = fragment.get('token');
      if (invitation === null) return;
      browser.history.replaceState(browser.history.state, '', browser.location.pathname + browser.location.search);
      this.token = invitation;
    });
  }

  submit(form: NgForm) {
    if (this.busy()) return;
    this.error.set('');
    this.attempted.set(true);
    const mismatched = this.register && this.password !== this.confirmPassword;
    if (form.invalid || mismatched) {
      form.control.markAllAsTouched();
      const fields = ['name', 'email', 'password', 'confirmPassword', 'token'];
      const first = fields.find((name) => form.controls[name]?.invalid || (name === 'confirmPassword' && mismatched));
      const ids: Record<string, string> = { name: 'auth-name', email: 'auth-email', password: 'auth-password', confirmPassword: 'auth-confirm', token: 'auth-token' };
      if (first) this.document.getElementById(ids[first])?.focus();
      return;
    }
    this.busy.set(true);
    const body = this.register
      ? { email: this.email.trim(), password: this.password, name: this.name.trim(), token: this.token.trim() }
      : { email: this.email.trim(), password: this.password };
    this.http.post(this.register ? '/api/auth/register' : '/api/auth/login', body).subscribe({
      next: () => this.document.defaultView?.location.assign(this.returnTo),
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(error instanceof HttpErrorResponse && error.status === 429
          ? 'Слишком много попыток. Попробуйте позже.'
          : error instanceof HttpErrorResponse && error.status === 503
            ? 'Сервис временно недоступен. Попробуйте позже.'
            : this.register
              ? 'Не удалось зарегистрироваться. Проверьте данные и приглашение.'
              : 'Не удалось войти. Проверьте адрес почты и пароль.');
      }
    });
  }
}
