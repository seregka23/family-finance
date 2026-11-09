import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AppClock } from './app-clock';
import { FinanceApi } from './finance-api';
import type { FinanceData } from './finance-types';
import { FinanceWorkspace } from './finance-workspace';
import { fixtureData } from './testing/finance-fixtures';

@Component({ template: '' })
class Host {
  readonly workspace = inject(FinanceWorkspace);
}

describe('Finance resource and dependent filters', () => {
  let requests: Subject<FinanceData>[];
  beforeEach(() => {
    requests = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AppClock, useValue: { now: new Date('2026-11-10') } },
        {
          provide: FinanceApi,
          useValue: {
            operations: () => {
              const subject = new Subject<FinanceData>();
              requests.push(subject);
              return subject;
            }
          }
        }
      ]
    });
  });
  async function start() {
    const fixture = TestBed.createComponent(Host);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].next(fixtureData);
    await fixture.whenStable();
    return { fixture, workspace: fixture.componentInstance.workspace };
  }
  it('cancels old requests, hides failed totals, and skips invalid periods', async () => {
    const { fixture, workspace } = await start();
    expect(workspace.periodOperations()).toHaveLength(2);
    workspace.changePeriod('year');
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].observed).toBe(false);
    expect(workspace.state()).toBe('loading');
    expect(workspace.periodOperations()).toHaveLength(0);
    requests[0].next({ ...fixtureData, operations: [] });
    requests[1].error({ status: 502 });
    await fixture.whenStable();
    expect(workspace.state()).toBe('error');
    expect(workspace.periodOperations()).toHaveLength(0);
    expect(workspace.accountSummaries()).toHaveLength(0);
    workspace.changeDate('from', '');
    await fixture.whenStable();
    expect(requests).toHaveLength(2);
    expect(workspace.periodValid()).toBe(false);
  });
  it('retains valid choices through reloads and resets removed categories and accounts', async () => {
    const { fixture, workspace } = await start();
    workspace.categoryFilter.set('Продукты');
    workspace.operationAccountFilter.set('A');
    workspace.refreshData();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(workspace.categoryFilter()).toBe('Продукты');
    requests[1].next(fixtureData);
    await fixture.whenStable();
    expect(workspace.categoryFilter()).toBe('Продукты');
    expect(workspace.operationAccountFilter()).toBe('A');
    workspace.refreshData();
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].next({ ...fixtureData, operations: [fixtureData.operations[1]] });
    await fixture.whenStable();
    expect(workspace.categoryFilter()).toBe('Все');
    expect(workspace.operationAccountFilter()).toBe('Все');
  });
  it('treats an empty public workspace as ready without a viewer or external data', async () => {
    const fixture = TestBed.createComponent(Host);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].next({
      operations: [], accounts: [], monthlyPlan: { month: '2026-11-01', items: [] },
      receipts: { items: [] }, goals: { items: [], history: [] }
    });
    await fixture.whenStable();
    const workspace = fixture.componentInstance.workspace;
    expect(workspace.state()).toBe('ready');
    expect(workspace.operations()).toHaveLength(0);
    expect(workspace.accountSummaries()).toHaveLength(0);
  });
  it('fails closed on an incomplete API payload', async () => {
    const fixture = TestBed.createComponent(Host);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].next({ ...fixtureData, operations: null! });
    await fixture.whenStable();
    expect(fixture.componentInstance.workspace.state()).toBe('error');
    expect(fixture.componentInstance.workspace.operations()).toHaveLength(0);
  });
});
