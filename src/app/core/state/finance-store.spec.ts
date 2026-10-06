import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MOCKAPI_BASE_URL } from '../config';
import { ApiError, apiErrorInterceptor } from '../interceptors/api-error.interceptor';
import { FinanceStore } from './finance-store';

const TX_URL = `${MOCKAPI_BASE_URL}/transactions`;
const BUDGET_URL = `${MOCKAPI_BASE_URL}/budgets`;

const food = {
  id: '1',
  type: 'EXPENSE',
  amount: 8200,
  categoryId: 'food',
  description: 'Groceries',
  date: '2026-09-10',
  createdAt: 'a',
  updatedAt: 'a',
};
const salary = {
  id: '2',
  type: 'INCOME',
  amount: 80000,
  categoryId: 'salary',
  description: '',
  date: '2026-09-01',
  createdAt: 'b',
  updatedAt: 'b',
};
const foodBudget = { id: '10', categoryId: 'food', month: 9, year: 2026, limit: 10000, createdAt: 'c', updatedAt: 'c' };

describe('FinanceStore', () => {
  let store: FinanceStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(FinanceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadWith(transactions: unknown[], budgets: unknown[]) {
    store.load();
    http.expectOne(TX_URL).flush(transactions);
    http.expectOne(BUDGET_URL).flush(budgets);
  }

  it('loads both resources once and derives budget usage', () => {
    loadWith([food, salary], [foodBudget]);

    expect(store.status()).toBe('ready');
    expect(store.transactionViews().map((t) => t.category.name)).toEqual(['Food', 'Salary']);
    expect(store.budgetViews()[0]).toMatchObject({
      spent: 8200,
      remaining: 1800,
      percentageUsed: 82,
      status: 'NEAR_LIMIT',
    });

    store.load(); // already loaded: no new requests
  });

  it('treats a 404 from an empty MockAPI resource as an empty list', () => {
    store.load();
    http.expectOne(TX_URL).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    http.expectOne(BUDGET_URL).flush([]);
    expect(store.status()).toBe('ready');
    expect(store.transactions()).toEqual([]);
  });

  it('reports a load error with a readable message', () => {
    store.load();
    http.expectOne(BUDGET_URL).flush([]);
    http.expectOne(TX_URL).flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('error');
    expect(store.error()).toContain('problem');
  });

  it('updates budget usage as soon as a transaction is deleted', () => {
    loadWith([food, salary], [foodBudget]);

    store.deleteTransaction('1').subscribe();
    http.expectOne({ url: `${TX_URL}/1`, method: 'DELETE' }).flush(food);

    expect(store.transactions().map((t) => t.id)).toEqual(['2']);
    expect(store.budgetViews()[0]).toMatchObject({ spent: 0, status: 'HEALTHY' });
  });

  it('adds a created transaction only after the server confirms', () => {
    loadWith([], []);

    store
      .createTransaction({ type: 'EXPENSE', amount: 500, categoryId: 'food', description: 'Lunch', date: '2026-09-12' })
      .subscribe();
    const request = http.expectOne({ url: TX_URL, method: 'POST' });
    expect(store.transactions()).toEqual([]);
    expect(request.request.body).toMatchObject({ amount: 500, categoryId: 'food' });

    request.flush({ ...request.request.body, id: '42' });
    expect(store.transactions().map((t) => t.id)).toEqual(['42']);
  });

  it('rejects a duplicate budget without calling the API', () => {
    loadWith([], [foodBudget]);
    let error: unknown;

    store
      .createBudget({ categoryId: 'food', month: 9, year: 2026, limit: 5000 })
      .subscribe({ error: (e) => (error = e) });

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe('A Food budget for September 2026 already exists.');
    http.expectNone(BUDGET_URL);
  });

  it('refuses new transactions once the free-plan limit is reached', () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ ...food, id: String(i) }));
    loadWith(full, []);
    let error: unknown;

    store
      .createTransaction({ type: 'EXPENSE', amount: 1, categoryId: 'food', description: '', date: '2026-09-12' })
      .subscribe({
        error: (e) => (error = e),
      });

    expect((error as ApiError).status).toBe(422);
    http.expectNone(TX_URL);
  });
});
