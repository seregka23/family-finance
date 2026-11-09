import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AppClock } from '../app-clock';
import { routes } from '../app.routes';
import { FinanceApi } from '../finance-api';
import { fixtureData } from '../testing/finance-fixtures';

describe('Operations lazy route', () => {
  it('can be loaded directly without first visiting the overview', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: AppClock, useValue: { now: new Date('2026-11-10') } },
        { provide: FinanceApi, useValue: { operations: () => of(fixtureData) } }
      ]
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/operations');
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelectorAll('.trow')).toHaveLength(2);
  });
});
