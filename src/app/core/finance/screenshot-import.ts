import { findCategory } from '../categories';
import { Transaction, TransactionPayload, TransactionType } from '../models';
import { addDays, isValidIsoDate, MIN_DATE } from '../utils/dates';
import { DESCRIPTION_MAX, MAX_AMOUNT } from '../utils/form-validators';
import { toPaise } from '../utils/money';

/**
 * Screenshot import, after the server has read the images. Nothing here trusts the model:
 * every row is re-checked, personal details are removed, and anything doubtful starts
 * unticked with a reason, because the person reviews every row before it is saved.
 */

export type ImportStatus = 'success' | 'failed' | 'pending' | 'refunded';

export interface ImportRow {
  /** Stable key for the review table. */
  key: string;
  include: boolean;
  /** Why the row starts unticked, or why it cannot be added; null when it is fine. */
  reason: string | null;
  /** False when the row cannot be saved as it stands (bad amount or date). */
  valid: boolean;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  categoryId: string;
  status: ImportStatus;
}

/** How far back an unlabelled date can reach; older rows are almost certainly misread. */
const MAX_AGE_DAYS = 400;

// Most specific first; matched against the lower-cased merchant name.
const MERCHANT_CATEGORIES: [RegExp, string][] = [
  [/salary|payroll/, 'salary'],
  [/swiggy instamart|blinkit|zepto|bigbasket|dmart|grocer|kirana/, 'food'],
  [/swiggy|zomato|domino|pizza|kfc|mcdonald|starbucks|cafe|restaurant|bakery|chai/, 'food'],
  [/uber|ola|rapido|metro|petrol|fuel|indian oil|hpcl|bpcl|parking|fastag/, 'transport'],
  [/irctc|makemytrip|goibibo|indigo|air india|vistara|akasa|redbus|oyo|airbnb|hotel/, 'travel'],
  [/netflix|spotify|hotstar|prime video|youtube|jiocinema|zee5|sonyliv|apple\.com|google play/, 'subscriptions'],
  [/airtel|jio|vodafone|\bvi\b|bsnl|electricity|bescom|tata power|adani|gas|water|broadband|recharge|bill/, 'bills'],
  [/apollo|pharm|1mg|netmeds|medplus|hospital|clinic|diagnostic|lab/, 'healthcare'],
  [/bookmyshow|pvr|inox|cinema|steam|playstation/, 'entertainment'],
  [/udemy|coursera|byju|unacademy|school|college|tuition|book/, 'education'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|decathlon|croma|reliance digital|ikea|store|mart/, 'shopping'],
];

function clean(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Removes UPI IDs, phone, account and reference numbers that may have slipped into a name. */
export function stripPersonalInfo(text: string): string {
  return text
    .replace(/\S+@\S+/g, '')
    .replace(/(?:x{2,}|\*{2,})\s?\d{2,}/gi, '')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, DESCRIPTION_MAX);
}

/** A category from the merchant name first, then the model's hint, else Other. */
export function guessCategory(name: string, type: TransactionType, hint: unknown): string {
  const lower = name.toLowerCase();
  for (const [pattern, id] of MERCHANT_CATEGORIES) {
    if (pattern.test(lower) && findCategory(id)?.type === type) return id;
  }
  const hinted = findCategory(clean(hint));
  if (hinted && hinted.type === type) return hinted.id;
  return type === 'INCOME' ? 'other-income' : 'other-expense';
}

/**
 * The model's date, kept only if it is a real date that is not after today and not
 * implausibly old. A date a few months ahead usually means the wrong year was assumed
 * for a heading like "12 Dec", so it is moved back a year.
 */
export function resolveDate(raw: unknown, today: string): string | null {
  let date = clean(raw).slice(0, 10);
  if (!isValidIsoDate(date)) return null;
  if (date > today) {
    const lastYear = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
    date = isValidIsoDate(lastYear) ? lastYear : `${Number(date.slice(0, 4)) - 1}-02-28`;
    if (date > today) return null;
  }
  if (date < MIN_DATE || date < addDays(today, -MAX_AGE_DAYS)) return null;
  return date;
}

const STATUS_REASON: Record<Exclude<ImportStatus, 'success'>, string> = {
  failed: 'Failed payment',
  pending: 'Still pending',
  refunded: 'Refunded',
};

function toStatus(value: unknown): ImportStatus {
  return value === 'failed' || value === 'pending' || value === 'refunded' ? value : 'success';
}

/** Turns the server's rows into review rows. Rows with no usable amount are dropped. */
export function toImportRows(raw: unknown, today: string): ImportRow[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.flatMap((item, index): ImportRow[] => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const amount = Math.round(Number(row['amount']) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const type: TransactionType = row['direction'] === 'credit' ? 'INCOME' : 'EXPENSE';
    const description = stripPersonalInfo(clean(row['name']));
    const status = toStatus(row['status']);
    const date = resolveDate(row['date'], today);
    const tooLarge = amount > MAX_AMOUNT;

    let reason: string | null = null;
    if (row['partial'] === true) reason = 'Cut off in the screenshot';
    else if (status !== 'success') reason = STATUS_REASON[status];
    if (!date) reason = 'Date unclear: pick one';
    if (tooLarge) reason = 'Amount looks wrong';

    return [
      {
        key: `row-${index}`,
        include: reason === null,
        reason,
        valid: !!date && !tooLarge,
        type,
        amount,
        date: date ?? today,
        description,
        categoryId: guessCategory(description, type, row['categoryHint']),
        status,
      },
    ];
  });
}

/** Same payment: same day, type and amount, and the same name once spacing and case are ignored. */
function fingerprint(r: { date: string; type: TransactionType; amount: number; description: string }): string {
  return `${r.date}|${r.type}|${toPaise(r.amount)}|${r.description.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/** Looser match for saved transactions, whose description the person may have edited. */
function looseFingerprint(r: { date: string; type: TransactionType; amount: number }): string {
  return `${r.date}|${r.type}|${toPaise(r.amount)}`;
}

/**
 * Unticks rows that are already saved, or that appear twice because screenshots overlap
 * while scrolling. Rows stay visible so the person can still add one on purpose.
 */
export function markDuplicates(rows: readonly ImportRow[], existing: readonly Transaction[]): ImportRow[] {
  const saved = new Set(existing.map(looseFingerprint));
  const seen = new Set<string>();
  return rows.map((row) => {
    const key = fingerprint(row);
    if (seen.has(key)) return { ...row, include: false, reason: row.reason ?? 'Appears twice in these screenshots' };
    seen.add(key);
    if (saved.has(looseFingerprint(row))) return { ...row, include: false, reason: row.reason ?? 'Already added' };
    return row;
  });
}

/** Whether a reviewed row can be saved: real date up to today, amount in range, category of its type. */
export function rowProblem(
  row: Pick<ImportRow, 'amount' | 'date' | 'type' | 'categoryId'>,
  today: string,
): string | null {
  if (!Number.isFinite(row.amount) || row.amount <= 0) return 'Enter an amount above 0';
  if (row.amount > MAX_AMOUNT) return 'Amount is too large';
  if (Math.round(row.amount * 100) / 100 !== row.amount) return 'Use at most 2 decimal places';
  if (!isValidIsoDate(row.date) || row.date > today || row.date < MIN_DATE) return 'Pick a date up to today';
  if (findCategory(row.categoryId)?.type !== row.type) return 'Pick a category';
  return null;
}

/** The ticked, valid rows as transactions to save. */
export function rowsToPayloads(rows: readonly ImportRow[], today: string): TransactionPayload[] {
  return rows
    .filter((r) => r.include && rowProblem(r, today) === null)
    .map((r) => ({
      type: r.type,
      amount: r.amount,
      categoryId: r.categoryId,
      description: r.description,
      date: r.date,
    }));
}
