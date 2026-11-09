import { Service, TransferState, makeStateKey, inject } from '@angular/core';

const renderedAt = makeStateKey<string>('finance-rendered-at');

@Service()
export class AppClock {
  // A single request-scoped clock keeps date filters identical during hydration.
  readonly now: Date;
  constructor() {
    const state = inject(TransferState);
    const timestamp = state.get(renderedAt, new Date().toISOString());
    state.set(renderedAt, timestamp);
    this.now = new Date(timestamp);
  }
}
