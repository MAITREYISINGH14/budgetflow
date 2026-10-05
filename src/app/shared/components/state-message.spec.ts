import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StateMessage } from './state-message';

describe('StateMessage', () => {
  let fixture: ComponentFixture<StateMessage>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StateMessage],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(StateMessage);
    element = fixture.nativeElement;
  });

  it('shows a loading state as a status message with a spinner', () => {
    fixture.componentRef.setInput('kind', 'loading');
    fixture.componentRef.setInput('title', 'Loading transactions…');
    fixture.detectChanges();

    expect(element.querySelector('[role="status"]')).toBeTruthy();
    expect(element.querySelector('.spinner')).toBeTruthy();
    expect(element.textContent).toContain('Loading transactions…');
  });

  it('shows an error as an alert with a retry action', () => {
    const retry = vi.fn();
    fixture.componentInstance.action.subscribe(retry);
    fixture.componentRef.setInput('kind', 'error');
    fixture.componentRef.setInput('title', 'Unable to load transactions.');
    fixture.componentRef.setInput('message', 'Cannot reach the BudgetFlow server.');
    fixture.componentRef.setInput('actionLabel', 'Try again');
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Unable to load transactions.');
    const button = element.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Try again');
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state without a button when no action is given', () => {
    fixture.componentRef.setInput('title', 'No transactions found.');
    fixture.detectChanges();

    expect(element.textContent).toContain('No transactions found.');
    expect(element.querySelector('button')).toBeNull();
    expect(element.querySelector('.spinner')).toBeNull();
  });
});
