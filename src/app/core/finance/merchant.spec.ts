import { Transaction } from '../models';
import { categorize, cleanMerchantName, learnCategories, merchantKey, stripPersonalInfo } from './merchant';
import { toImportRows } from './screenshot-import';

let nextId = 1;
function tx(
  description: string,
  categoryId: string,
  date = '2026-10-01',
  type: Transaction['type'] = 'EXPENSE',
): Transaction {
  return { id: String(nextId++), type, amount: 100, categoryId, description, date, createdAt: '', updatedAt: '' };
}

describe('stripPersonalInfo', () => {
  it('removes UPI IDs, phone numbers and masked account numbers', () => {
    expect(stripPersonalInfo('Rahul Sharma rahul.s@okaxis')).toBe('Rahul Sharma');
    expect(stripPersonalInfo('Paid to +91 98765 43210')).toBe('Paid to');
    expect(stripPersonalInfo('HDFC XXXX1234 transfer')).toBe('HDFC transfer');
    expect(stripPersonalInfo('Amazon Pay')).toBe('Amazon Pay');
  });
});

describe('cleanMerchantName', () => {
  it.each([
    ['PAID TO SWIGGY LIMITED', 'Swiggy'],
    ['Bundl Technologies Pvt Ltd', 'Swiggy'],
    ['UPI-ZEPTO MARKETPLACE PVT LTD', 'Zepto'],
    ['swiggy instamart', 'Swiggy Instamart'],
    ['Amazon Pay India Private Limited', 'Amazon Pay'],
    ['IRCTC E-TICKETING', 'IRCTC'],
    ['RAJESH KUMAR', 'Rajesh Kumar'],
    ['Sent to rahul.s@okaxis Rahul Sharma', 'Rahul Sharma'],
    ['HDFC BANK CREDIT CARD', 'HDFC Bank Credit Card'],
    ['AIR INDIA LIMITED', 'Air India'],
    ['BookMyShow', 'BookMyShow'],
    ['Received from Priya', 'Priya'],
    ['  ', ''],
  ])('%s → %s', (raw, clean) => {
    expect(cleanMerchantName(raw as string)).toBe(clean);
  });

  it('keeps words like India that are part of a real name', () => {
    expect(cleanMerchantName('Air India')).toBe('Air India');
  });
});

describe('merchantKey', () => {
  it('matches the same merchant however it is written', () => {
    expect(merchantKey('Swiggy Instamart')).toBe(merchantKey('SWIGGY-INSTAMART'));
  });
});

describe('learnCategories', () => {
  it('uses the category you picked most often for a merchant', () => {
    const learned = learnCategories([
      tx('Blinkit', 'food'),
      tx('BLINKIT', 'food'),
      tx('Blinkit groceries', 'shopping'),
      tx('blinkit', 'shopping', '2026-09-01'),
      tx('Blinkit', 'food', '2026-08-01'),
    ]);
    expect(learned.get('EXPENSE|blinkit')).toBe('food');
  });

  it('breaks a tie with the most recent choice', () => {
    const learned = learnCategories([
      tx('Rajesh Kumar', 'other-expense', '2026-09-01'),
      tx('RAJESH KUMAR', 'bills', '2026-10-01'),
    ]);
    expect(learned.get('EXPENSE|rajeshkumar')).toBe('bills');
  });

  it('keeps income and expenses apart, and skips blank or mismatched rows', () => {
    const learned = learnCategories([
      tx('Rahul', 'other-income', '2026-10-01', 'INCOME'),
      tx('Rahul', 'food'),
      tx('', 'food'),
      tx('Odd', 'salary'),
    ]);
    expect(learned.get('INCOME|rahul')).toBe('other-income');
    expect(learned.get('EXPENSE|rahul')).toBe('food');
    expect(learned.has('EXPENSE|odd')).toBe(false);
    expect(learned.size).toBe(2);
  });
});

describe('categorize', () => {
  const learned = new Map([['EXPENSE|swiggy', 'entertainment']]);

  it('prefers your history, then known merchants, then the AI suggestion', () => {
    expect(categorize('Swiggy', 'EXPENSE', 'food', learned)).toEqual({
      categoryId: 'entertainment',
      source: 'history',
    });
    expect(categorize('Zomato Ltd', 'EXPENSE', 'shopping', learned)).toEqual({
      categoryId: 'food',
      source: 'merchant',
    });
    expect(categorize('Sharma General', 'EXPENSE', 'healthcare')).toEqual({ categoryId: 'healthcare', source: 'ai' });
  });

  it('only takes a suggestion that fits the type and is not just Other', () => {
    expect(categorize('Sharma General', 'EXPENSE', 'salary')).toEqual({
      categoryId: 'other-expense',
      source: 'default',
    });
    expect(categorize('Sharma General', 'EXPENSE', 'other-expense')).toEqual({
      categoryId: 'other-expense',
      source: 'default',
    });
    expect(categorize('Priya', 'INCOME', 'food')).toEqual({ categoryId: 'other-income', source: 'default' });
    expect(categorize('ACME PAYROLL', 'INCOME', 'other-income')).toEqual({ categoryId: 'salary', source: 'merchant' });
  });

  it('knows common merchants by category', () => {
    expect(categorize('Uber India', 'EXPENSE', null).categoryId).toBe('transport');
    expect(categorize('Airtel Prepaid', 'EXPENSE', null).categoryId).toBe('bills');
    expect(categorize('Netflix', 'EXPENSE', 'entertainment').categoryId).toBe('subscriptions');
  });
});

describe('import with history', () => {
  it('cleans the name and files it the way you did before', () => {
    const learned = learnCategories([tx('Rajesh Kumar', 'bills'), tx('Rajesh Kumar', 'bills')]);
    const [row] = toImportRows(
      [
        {
          name: 'PAID TO RAJESH KUMAR',
          amount: 18000,
          direction: 'debit',
          status: 'success',
          date: '2026-11-01',
          partial: false,
          categoryHint: 'other-expense',
        },
      ],
      '2026-11-12',
      learned,
    );
    expect(row).toMatchObject({ description: 'Rajesh Kumar', categoryId: 'bills', categorySource: 'history' });
  });
});
