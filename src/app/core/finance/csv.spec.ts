import { findCategory } from '../categories';
import { TransactionView } from '../models';
import { escapeCsvCell, transactionsToCsv } from './csv';

describe('escapeCsvCell', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvCell('Lunch')).toBe('Lunch');
    expect(escapeCsvCell(250)).toBe('250');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(escapeCsvCell('Dinner, drinks')).toBe('"Dinner, drinks"');
    expect(escapeCsvCell('The "big" one')).toBe('"The ""big"" one"');
    expect(escapeCsvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('writes empty cells for missing values', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell('')).toBe('');
  });

  it('neutralises spreadsheet formulas in free text', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")', true)).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(escapeCsvCell('-refund', true)).toBe("'-refund");
  });
});

describe('transactionsToCsv', () => {
  it('builds the export with a header, BOM and CRLF line endings', () => {
    const rows: TransactionView[] = [
      { id: '1', type: 'EXPENSE', amount: 250.5, categoryId: 'food', category: findCategory('food')!, description: 'Café, "special"', date: '2026-09-01', createdAt: '', updatedAt: '' },
      { id: '2', type: 'INCOME', amount: 80000, categoryId: 'salary', category: findCategory('salary')!, description: '', date: '2026-09-02', createdAt: '', updatedAt: '' },
    ];
    expect(transactionsToCsv(rows)).toBe(
      '\uFEFFDate,Type,Category,Description,Amount\r\n' +
        '2026-09-01,EXPENSE,Food,"Café, ""special""",250.50\r\n' +
        '2026-09-02,INCOME,Salary,,80000.00\r\n',
    );
  });
});
