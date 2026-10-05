import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TransactionView } from '../../core/models';
import { TransactionTable } from './transaction-table';

const transactions: TransactionView[] = [
  {
    id: '1',
    type: 'EXPENSE',
    amount: 250,
    categoryId: 'food',
    category: { id: 'food', name: 'Food', type: 'EXPENSE' },
    description: 'Lunch',
    date: '2026-09-02',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '2',
    type: 'INCOME',
    amount: 80000,
    categoryId: 'salary',
    category: { id: 'salary', name: 'Salary', type: 'INCOME' },
    description: '',
    date: '2026-09-01',
    createdAt: '',
    updatedAt: '',
  },
];

describe('TransactionTable', () => {
  let fixture: ComponentFixture<TransactionTable>;
  let element: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [TransactionTable],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(TransactionTable);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('transactions', transactions);
    fixture.detectChanges();
  });

  it('renders one row per transaction', () => {
    expect(element.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('marks income and expense rows differently, not only by colour', () => {
    const [expense, income] = Array.from(element.querySelectorAll('tbody tr'));
    expect(expense.getAttribute('data-type')).toBe('EXPENSE');
    expect(expense.querySelector('.cell-amount')?.textContent?.trim()).toBe('−₹250');
    expect(expense.querySelector('.cell-type')?.textContent).toContain('Expense');
    expect(income.querySelector('.cell-amount')?.textContent?.trim()).toBe('+₹80,000');
    expect(income.querySelector('.cell-type')?.textContent).toContain('Income');
  });

  it('shows a placeholder for a missing description', () => {
    expect(element.querySelectorAll('tbody tr')[1].querySelector('.cell-desc')?.textContent).toContain('No description');
  });

  it('emits edit and remove for the clicked row', () => {
    const edit = vi.fn();
    const remove = vi.fn();
    fixture.componentInstance.edit.subscribe(edit);
    fixture.componentInstance.remove.subscribe(remove);

    const buttons = element.querySelectorAll<HTMLButtonElement>('tbody tr:first-child .cell-actions button');
    buttons[0].click();
    buttons[1].click();

    expect(edit).toHaveBeenCalledWith(transactions[0]);
    expect(remove).toHaveBeenCalledWith(transactions[0]);
  });

  it('gives action buttons descriptive labels', () => {
    const label = element.querySelector('tbody tr:first-child .cell-actions button')?.getAttribute('aria-label');
    expect(label).toMatch(/^Edit Lunch on 02 Sep/);
  });

  it('hides actions in compact mode', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(element.querySelector('.cell-actions')).toBeNull();
  });
});
