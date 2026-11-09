import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthPage } from './auth-page';

describe.each(['login', 'register'])('In-app %s form', (mode) => {
  beforeEach(() => { window.history.replaceState(null, '', '/'); TestBed.configureTestingModule({ providers: [
    provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: ActivatedRoute, useValue: { snapshot: { data: { mode }, queryParamMap: convertToParamMap({ token: 'a'.repeat(64), return_to: '//attacker.example' }) } } }
  ] }); });
  it('validates fields, posts credentials once, and exposes retryable errors without navigating', async () => {
    const fixture = TestBed.createComponent(AuthPage);
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.token).toBe('');
    const form = host.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    http.expectNone(`/api/auth/${mode}`);
    expect(host.querySelector('[role=alert]')).not.toBeNull();
    const fill = async (id: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value; input.dispatchEvent(new Event('input')); await fixture.whenStable();
    };
    await fill('auth-email', 'person@example.test');
    await fill('auth-password', 'Correct horse battery staple!');
    if (mode === 'register') {
      await fill('auth-name', 'Person');
      await fill('auth-token', 'a'.repeat(64));
      await fill('auth-confirm', 'Mismatched password!');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      http.expectNone('/api/auth/register');
      expect(host.textContent).toContain('Пароли не совпадают');
      await fill('auth-confirm', 'Correct horse battery staple!');
    }
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    const request = http.expectOne(`/api/auth/${mode}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(mode === 'register'
      ? { email: 'person@example.test', password: 'Correct horse battery staple!', name: 'Person', token: 'a'.repeat(64) }
      : { email: 'person@example.test', password: 'Correct horse battery staple!' });
    expect(host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    expect(fixture.componentInstance.returnTo).toBe('/');
    request.flush({ error: 'Denied' }, { status: 429, statusText: 'Too many requests' });
    await fixture.whenStable();
    expect(host.textContent).toContain('Слишком много попыток');
    expect(host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
    http.verify();
  });
});

describe('Private invitation fragment', () => {
  it('reads the token after browser rendering and removes it from the visible URL immediately', async () => {
    const token = 'b'.repeat(64);
    window.history.replaceState(null, '', `/register?return_to=%2Faccounts#token=${token}`);
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { mode: 'register' }, queryParamMap: convertToParamMap({ token: 'ignored-query-token' }) } } }
    ] });
    const fixture = TestBed.createComponent(AuthPage);
    expect(fixture.componentInstance.token).toBe('');
    await fixture.whenStable();
    expect(fixture.componentInstance.token).toBe(token);
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?return_to=%2Faccounts');
    expect(fixture.nativeElement.querySelector('#auth-token')?.value).toBe(token);
    window.history.replaceState(null, '', '/');
  });
});
