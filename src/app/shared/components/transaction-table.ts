import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TransactionView } from '../../core/models';
import { DisplayDatePipe } from '../pipes/display-date.pipe';
import { MoneyPipe } from '../pipes/money.pipe';

/**
 * Used by the transactions page (with actions) and the dashboard's recent list (compact).
 * On narrow screens each row becomes a card via CSS, so nothing scrolls sideways.
 */
@Component({
  selector: 'bf-transaction-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, DisplayDatePipe],
  templateUrl: './transaction-table.html',
  styleUrl: './transaction-table.scss',
})
export class TransactionTable {
  readonly transactions = input.required<TransactionView[]>();
  readonly caption = input('Transactions');
  readonly compact = input(false);
  readonly edit = output<TransactionView>();
  readonly remove = output<TransactionView>();
}
