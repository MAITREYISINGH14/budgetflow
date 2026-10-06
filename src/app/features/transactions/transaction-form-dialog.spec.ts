import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { ApiError } from '../../core/interceptors/api-error.interceptor';
import { Transaction } from '../../core/models';
import { FinanceStore } from '../../core/state/finance-store';
import { TransactionFormDialog } from './transaction-form-dialog';

const saved: Transaction = {
  id: '99',
  type: 'EXPENSE',
  amount: 250.5,
  categoryId: 'food',
  description: 'Lunch',
  date: '2026-01-15',
  createdAt: '',
  updatedAt: '',
};

describe('TransactionFormDialog', () => {
  let fixture: ComponentFixture<TransactionFormDialog>;
  let component: TransactionFormDialog;
  let element: HTMLElement;
  let store: { createTransaction: ReturnType<typeof vi.fn>; updateTransaction: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    store = { createTransaction: vi.fn(), updateTransaction: vi.fn() };
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [TransactionFormDialog],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: {} },
        { provide: FinanceStore, useValue: store },
      ],
    });

    fixture = TestBed.createComponent(TransactionFormDialog);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  const form = () => component['form'];

  it('shows required-field errors instead of submitting an empty form', () => {
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(store.createTransaction).not.toHaveBeenCalled();
    expect(element.querySelector('#txn-amount-error')?.textContent).toContain('This field is required.');
    expect(element.querySelector('#txn-category-error')?.textContent).toContain('Choose a category.');
    expect(element.querySelector('#txn-amount')?.getAttribute('aria-describedby')).toBe('txn-amount-error');
  });

  it('only offers categories for the selected type', () => {
    const options = () =>
      Array.from(element.querySelectorAll('#txn-category option')).map((o) => o.textContent?.trim());
    expect(options()).toContain('Food');
    expect(options()).not.toContain('Salary');

    form().controls.type.setValue('INCOME');
    fixture.detectChanges();
    expect(options()).toEqual(['Choose a category', 'Salary', 'Freelance', 'Bonus', 'Investment', 'Other']);
  });

  it('clears the category when the type changes and it no longer fits', () => {
    form().controls.categoryId.setValue('food');
    form().controls.type.setValue('INCOME');
    expect(form().controls.categoryId.value).toBeNull();
  });

  it('submits a trimmed payload once, even when clicked twice', () => {
    const response = new Subject<Transaction>();
    store.createTransaction.mockReturnValue(response);
    form().setValue({
      type: 'EXPENSE',
      amount: 250.5,
      categoryId: 'food',
      description: '  Lunch  ',
      date: '2026-01-15',
    });

    component['submit']();
    component['submit']();

    expect(store.createTransaction).toHaveBeenCalledTimes(1);
    expect(store.createTransaction).toHaveBeenCalledWith({
      type: 'EXPENSE',
      amount: 250.5,
      categoryId: 'food',
      description: 'Lunch',
      date: '2026-01-15',
    });

    response.next(saved);
    response.complete();
    expect(dialogRef.close).toHaveBeenCalledWith(saved);
  });

  it('keeps the dialog open and shows the error when saving fails', () => {
    store.createTransaction.mockReturnValue(
      throwError(() => new ApiError(422, 'The free MockAPI plan stores up to 100 transactions.')),
    );
    form().setValue({ type: 'EXPENSE', amount: 10, categoryId: 'food', description: '', date: '2026-01-15' });

    component['submit']();
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('stores up to 100 transactions');
    expect((element.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
