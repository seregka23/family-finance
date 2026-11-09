import { TestBed } from '@angular/core/testing';
import { OperationDetails } from './operation-details';
import { fixtureData } from './testing/finance-fixtures';

describe('Operation details dialog', () => {
  it('opens after rendering and restores focus and scrolling when the model is cleared', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const fixture = TestBed.createComponent(OperationDetails);
    fixture.componentRef.setInput('operation', fixtureData.operations[0]);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('dialog')?.open).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    host.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.operation()).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
