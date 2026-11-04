import { findCategory } from '../categories';
import { Transaction, TransactionType } from '../models';
import { DESCRIPTION_MAX } from '../utils/form-validators';

/**
 * Merchant names and categories for imported transactions.
 *
 * A category is chosen in this order, and the review table says which one applied:
 *   history   what you filed this merchant under before (most often, then most recently)
 *   merchant  a well-known Indian merchant (Swiggy is Food, Uber is Transport)
 *   ai        the reader's suggestion, when it fits the type and is not just "Other"
 *   default   nothing matched: Other, flagged so you look at it
 *   you       you picked it in the review table
 */
export type CategorySource = 'history' | 'merchant' | 'ai' | 'default' | 'you';

/** Learned categories: `${type}|${merchantKey}` → category id. */
export type LearnedCategories = ReadonlyMap<string, string>;

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

// How UPI apps label a row ("Paid to …", "UPI-…") rather than part of the name.
const PREFIX =
  /^(?:paid\s+to|sent\s+to|received\s+from|payment\s+(?:to|from)|transfer(?:red)?\s+(?:to|from)|upi\b[\s/:-]*)\s*[:-]?\s*/i;
// Company legal forms. Only these: words like "India" are part of real names (Air India).
const SUFFIX = /[\s,.-]+(?:pvt\.?\s*ltd\.?|private\s+limited|pvt\.?|limited|ltd\.?|llp|inc\.?)$/i;

// The everyday name for merchants whose payment names vary. Most specific first.
const CANONICAL: [RegExp, string][] = [
  [/swiggy\s*instamart/, 'Swiggy Instamart'],
  [/swiggy|bundl\s*technologies/, 'Swiggy'],
  [/zomato/, 'Zomato'],
  [/blinkit|grofers/, 'Blinkit'],
  [/zepto/, 'Zepto'],
  [/big\s*basket/, 'BigBasket'],
  [/amazon\s*pay/, 'Amazon Pay'],
  [/amazon|amzn/, 'Amazon'],
  [/flipkart/, 'Flipkart'],
  [/myntra/, 'Myntra'],
  [/\buber\b/, 'Uber'],
  [/\bola\b|ani\s*technologies/, 'Ola'],
  [/rapido/, 'Rapido'],
  [/irctc/, 'IRCTC'],
  [/netflix/, 'Netflix'],
  [/spotify/, 'Spotify'],
  [/hotstar/, 'Hotstar'],
  [/bookmyshow|big\s*tree\s*entertainment/, 'BookMyShow'],
  [/airtel/, 'Airtel'],
  [/\bjio\b|reliance\s*jio/, 'Jio'],
  [/\bdmart\b|avenue\s*supermarts/, 'DMart'],
];

// Kept in capitals when a shouted name is turned into normal case.
const ACRONYMS = new Set([
  'IRCTC',
  'BSNL',
  'MTNL',
  'HPCL',
  'BPCL',
  'IOCL',
  'KFC',
  'PVR',
  'LIC',
  'SBI',
  'HDFC',
  'ICICI',
  'IDFC',
  'UPI',
  'ATM',
  'EMI',
  'DTH',
  'BESCOM',
  'ACT',
  'LPG',
  'CNG',
  'TV',
  'PG',
]);

function normalCase(name: string): string {
  // Only fix names typed in all capitals or all lower case; mixed case is the merchant's own (BookMyShow).
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name
    .split(' ')
    .map((word) => {
      if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * The name to save: personal details removed, app labels ("Paid to") and legal forms
 * ("Pvt Ltd") dropped, known merchants under their everyday name, shouting turned into
 * normal case. "PAID TO BUNDL TECHNOLOGIES PVT LTD" → "Swiggy".
 */
export function cleanMerchantName(raw: string): string {
  let name = stripPersonalInfo(raw)
    .replace(/[*_|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  for (let previous = ''; previous !== name;) {
    previous = name;
    name = name.replace(PREFIX, '').replace(SUFFIX, '').trim();
  }
  name = name.replace(/^[\s,.:;–-]+|[\s,.:;–-]+$/g, '');
  if (!name) return '';
  const lower = name.toLowerCase();
  const known = CANONICAL.find(([pattern]) => pattern.test(lower));
  return (known ? known[1] : normalCase(name)).slice(0, DESCRIPTION_MAX);
}

/** The same merchant however it is written: lower case, letters and digits only. */
export function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * What you have filed each merchant under, from your saved transactions: the category you
 * used most often for that merchant and type, or the most recent one when tied.
 */
export function learnCategories(transactions: readonly Transaction[]): Map<string, string> {
  const tally = new Map<string, Map<string, { count: number; last: string }>>();
  for (const t of transactions) {
    if (findCategory(t.categoryId)?.type !== t.type) continue;
    const key = merchantKey(cleanMerchantName(t.description));
    if (key.length < 2) continue;
    const slot = `${t.type}|${key}`;
    const byCategory = tally.get(slot) ?? new Map<string, { count: number; last: string }>();
    const entry = byCategory.get(t.categoryId) ?? { count: 0, last: '' };
    byCategory.set(t.categoryId, { count: entry.count + 1, last: t.date > entry.last ? t.date : entry.last });
    tally.set(slot, byCategory);
  }
  const learned = new Map<string, string>();
  for (const [slot, byCategory] of tally) {
    const [best] = [...byCategory].sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last));
    learned.set(slot, best[0]);
  }
  return learned;
}

// Most specific first; matched against the lower-cased name.
const MERCHANT_CATEGORIES: [RegExp, string][] = [
  [/salary|payroll/, 'salary'],
  [/swiggy instamart|blinkit|zepto|bigbasket|dmart|grocer|kirana/, 'food'],
  [/swiggy|zomato|domino|pizza|kfc|mcdonald|starbucks|cafe|restaurant|bakery|chai/, 'food'],
  [/uber|\bola\b|rapido|metro|petrol|fuel|indian oil|hpcl|bpcl|parking|fastag/, 'transport'],
  [/irctc|makemytrip|goibibo|indigo|air india|vistara|akasa|redbus|oyo|airbnb|hotel/, 'travel'],
  [/netflix|spotify|hotstar|prime video|youtube|jiocinema|zee5|sonyliv|apple\.com|google play/, 'subscriptions'],
  [
    /airtel|\bjio\b|vodafone|\bvi\b|bsnl|electricity|bescom|tata power|adani|gas|water|broadband|recharge|bill/,
    'bills',
  ],
  [/apollo|pharm|1mg|netmeds|medplus|hospital|clinic|diagnostic|lab/, 'healthcare'],
  [/bookmyshow|pvr|inox|cinema|steam|playstation/, 'entertainment'],
  [/udemy|coursera|byju|unacademy|school|college|tuition|book/, 'education'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|decathlon|croma|reliance digital|ikea|store|mart/, 'shopping'],
];

/** The category for a cleaned name, and where it came from (see CategorySource). */
export function categorize(
  name: string,
  type: TransactionType,
  hint: unknown,
  learned: LearnedCategories = new Map(),
): { categoryId: string; source: CategorySource } {
  const key = merchantKey(name);
  const remembered = key.length >= 2 ? learned.get(`${type}|${key}`) : undefined;
  if (remembered) return { categoryId: remembered, source: 'history' };

  const lower = name.toLowerCase();
  for (const [pattern, id] of MERCHANT_CATEGORIES) {
    if (pattern.test(lower) && findCategory(id)?.type === type) return { categoryId: id, source: 'merchant' };
  }

  // "Other" from the reader carries no information, so it counts as no match.
  const hinted = findCategory(typeof hint === 'string' ? hint : '');
  if (hinted && hinted.type === type && !hinted.id.startsWith('other')) return { categoryId: hinted.id, source: 'ai' };

  return { categoryId: type === 'INCOME' ? 'other-income' : 'other-expense', source: 'default' };
}
