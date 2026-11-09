import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, afterRenderEffect, inject, model, viewChild } from '@angular/core';
import { categoryTone, money, receiptItemCountLabel } from './finance-format';
import type { Operation } from './finance-types';
import { operationDate } from './models/finance-ui-model';
import { Status } from './shared/status';
import { UiIcon } from './shared/ui-icon';

@Component({
  selector: 'app-operation-details',
  imports: [UiIcon, Status],
  templateUrl: './operation-details.html',
  host: { style: 'display: contents' }
})
export class OperationDetails {
  readonly operation = model<Operation | null>(null);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('operationDialog');
  private readonly document = inject(DOCUMENT);
  protected readonly money = money;
  protected readonly categoryTone = categoryTone;
  protected readonly receiptItemCountLabel = receiptItemCountLabel;
  protected readonly operationDate = operationDate;

  constructor() {
    afterRenderEffect((onCleanup) => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog || !this.operation()) return;
      const focused = this.document.activeElement as HTMLElement | null;
      const overflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
      onCleanup(() => {
        dialog.close();
        this.document.body.style.overflow = overflow;
        focused?.focus();
      });
    });
  }
  closeOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) this.operation.set(null);
  }
}
