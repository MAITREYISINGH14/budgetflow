import { TransactionView } from '../models';

// Cells starting with these characters are run as formulas by Excel and Google Sheets.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * RFC 4180 escaping: quote values containing commas, quotes or line breaks and double
 * any embedded quotes. Free text is also guarded against spreadsheet formula injection.
 */
export function escapeCsvCell(value: string | number | null | undefined, freeText = false): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (freeText && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function transactionsToCsv(items: readonly TransactionView[]): string {
  const header = ['Date', 'Type', 'Category', 'Description', 'Amount'];
  const rows = items.map((t) =>
    [
      t.date,
      t.type,
      escapeCsvCell(t.category.name, true),
      escapeCsvCell(t.description, true),
      t.amount.toFixed(2),
    ].join(','),
  );
  // BOM so Excel opens the file as UTF-8 and keeps ₹ and non-English text intact.
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}
