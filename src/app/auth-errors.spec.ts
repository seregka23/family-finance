import { loginUrl, safeReturnTo } from './auth-errors';

describe('Post-login destinations', () => {
  it('preserves finance page queries and rejects external destinations and auth loops', () => {
    expect(safeReturnTo('/operations?month=2026-08#totals')).toBe('/operations?month=2026-08#totals');
    expect(loginUrl('/accounts')).toBe('/login?return_to=%2Faccounts');
    for (const path of [null, '//attacker.example', 'https://attacker.example', '/%2fattacker.example', '/%252fattacker.example', '/\\attacker.example', '/login', '/register', '/auth/logout', '/unknown', '/operations?value=%0aHeader']) {
      expect(safeReturnTo(path)).toBe('/');
    }
  });
});
