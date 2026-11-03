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

  it('refuses new budgets once the free-plan limit is reached', () => {
    // 100 budgets spread over 100 different months, so none is a duplicate of the new one.
    const full = Array.from({ length: 100 }, (_, i) => ({
      ...foodBudget,
      id: String(i),
      year: 2000 + Math.floor(i / 12),
      month: (i % 12) + 1,
    }));
    loadWith([], full);
    let error: unknown;

    store.createBudget({ categoryId: 'bills', month: 9, year: 2026, limit: 5000 }).subscribe({
      error: (e) => (error = e),
    });

    expect((error as ApiError).status).toBe(422);
    http.expectNone(BUDGET_URL);
  });

  it('copies last month’s budgets one at a time, skipping ones already set, then reloads', () => {
    const billsBudget = { ...foodBudget, id: '11', categoryId: 'bills', limit: 7000 };
    const octoberFood = { ...foodBudget, id: '12', month: 10, limit: 12000 };
    loadWith([], [foodBudget, billsBudget, octoberFood]);
    const progress: number[] = [];

    expect(store.budgetsToCopy({ year: 2026, month: 9 }, { year: 2026, month: 10 })).toEqual([
      { categoryId: 'bills', limit: 7000, year: 2026, month: 10 },
    ]);
    store.copyBudgets({ year: 2026, month: 9 }, { year: 2026, month: 10 }).subscribe((n) => progress.push(n));

    const request = http.expectOne({ url: BUDGET_URL, method: 'POST' });
    expect(request.request.body).toMatchObject({ categoryId: 'bills', limit: 7000, month: 10, year: 2026 });
    request.flush({ ...request.request.body, id: '13' });

    expect(progress).toEqual([1]);
    // Reload after the bulk write, so the UI matches what the server actually stored.
    http.expectOne(TX_URL).flush([]);
    http.expectOne(BUDGET_URL).flush([foodBudget, billsBudget, octoberFood, { ...billsBudget, id: '13', month: 10 }]);
    expect(
      store
        .budgetViews()
        .filter((b) => b.month === 10)
        .map((b) => b.categoryId),
    ).toEqual(['food', 'bills']);
  });

  describe('recurring transactions', () => {
    const ruleRow = {
      id: '50',
      kind: 'RULE',
      type: 'EXPENSE',
      amount: 649,
      categoryId: 'subscriptions',
      description: 'Netflix',
      date: '2026-09-05',
      repeatDay: 5,
      repeatUntil: '',
      repeatSkip: '',
      createdAt: 'r',
      updatedAt: 'r',
    };
    const occurrence = (id: string, date: string) => ({
      id,
      type: 'EXPENSE',
      amount: 649,
      categoryId: 'subscriptions',
      description: 'Netflix',
      date,
      ruleId: '50',
      createdAt: date,
      updatedAt: date,
    });

    function flushCreate(date: string, id: string) {
      const request = http.expectOne({ url: TX_URL, method: 'POST' });
      expect(request.request.body).toMatchObject({ date, ruleId: '50', amount: 649 });
      request.flush({ ...request.request.body, id });
    }

    it('keeps rule rows out of transactions and marks what they created', () => {
      loadWith([ruleRow, occurrence('60', '2026-09-05'), food], []);
      expect(store.rules().map((r) => r.id)).toEqual(['50']);
      expect(store.transactions().map((t) => t.id)).toEqual(['60', '1']);
      expect(store.transactionViews().find((t) => t.id === '60')?.recurring).toBe(true);
      expect(store.transactionViews().find((t) => t.id === '1')?.recurring).toBe(false);
      expect(store.transactionRecordCount()).toBe(3);
    });

    it('adds the months a rule owes, one at a time, and nothing the second time', () => {
      loadWith([ruleRow, occurrence('60', '2026-09-05')], []);
      const added: number[] = [];

      store.generateDue('2026-11-12').subscribe((n) => added.push(n));
      flushCreate('2026-10-05', '61');
      flushCreate('2026-11-05', '62');
      expect(added).toEqual([2]);

      store.generateDue('2026-11-12').subscribe((n) => added.push(n));
      http.expectNone(TX_URL);
      expect(added).toEqual([2, 0]);
    });

    it('creates a rule and fills in past months straight away', () => {
      loadWith([], []);
      let created: unknown;

      store
        .createRecurring(
          { type: 'EXPENSE', amount: 649, categoryId: 'subscriptions', description: 'Netflix', date: '2026-10-05' },
          '2026-11-12',
        )
        .subscribe((rule) => (created = rule));

      const ruleRequest = http.expectOne({ url: TX_URL, method: 'POST' });
      expect(ruleRequest.request.body).toMatchObject({ kind: 'RULE', date: '2026-10-05', repeatDay: 5 });
      ruleRequest.flush({ ...ruleRequest.request.body, id: '50' });
      flushCreate('2026-10-05', '61');
      flushCreate('2026-11-05', '62');

      expect(created).toMatchObject({ id: '50', day: 5, until: null });
      expect(store.transactions().map((t) => t.date)).toEqual(['2026-10-05', '2026-11-05']);
    });

    it('deletes one month and remembers it so it is not added again', () => {
      loadWith([ruleRow, occurrence('60', '2026-09-05'), occurrence('61', '2026-10-05')], []);

      store.deleteOccurrence('61', 'one').subscribe();
      const put = http.expectOne({ url: `${TX_URL}/50`, method: 'PUT' });
      expect(put.request.body).toMatchObject({ kind: 'RULE', repeatSkip: '2026-10' });
      put.flush({ ...put.request.body, id: '50' });
      http.expectOne({ url: `${TX_URL}/61`, method: 'DELETE' }).flush({});

      expect(store.transactions().map((t) => t.id)).toEqual(['60']);
      store.generateDue('2026-10-20').subscribe();
      http.expectNone(TX_URL);
    });

    it('ends the rule before a month when deleting that month and later ones', () => {
      loadWith(
        [ruleRow, occurrence('60', '2026-09-05'), occurrence('61', '2026-10-05'), occurrence('62', '2026-11-05')],
        [],
      );
      const deleted: number[] = [];

      store.deleteOccurrence('61', 'future').subscribe((n) => deleted.push(n));
      const put = http.expectOne({ url: `${TX_URL}/50`, method: 'PUT' });
      expect(put.request.body).toMatchObject({ repeatUntil: '2026-09' });
      put.flush({ ...put.request.body, id: '50' });
      http.expectOne({ url: `${TX_URL}/61`, method: 'DELETE' }).flush({});
      http.expectOne({ url: `${TX_URL}/62`, method: 'DELETE' }).flush({});

      expect(deleted).toEqual([2]);
      expect(store.transactions().map((t) => t.id)).toEqual(['60']);
    });

    it('removes the rule when deleting from its first month onwards', () => {
      loadWith([ruleRow, occurrence('60', '2026-09-05')], []);
      store.deleteOccurrence('60', 'future').subscribe();
      http.expectOne({ url: `${TX_URL}/50`, method: 'DELETE' }).flush({});
      http.expectOne({ url: `${TX_URL}/60`, method: 'DELETE' }).flush({});
      expect(store.rules()).toEqual([]);
    });

    it('applies an edit to the rule and later months, keeping their dates', () => {
      loadWith(
        [ruleRow, occurrence('60', '2026-09-05'), occurrence('61', '2026-10-05'), occurrence('62', '2026-11-05')],
        [],
      );

      store
        .updateOccurrence(
          '61',
          { type: 'EXPENSE', amount: 799, categoryId: 'subscriptions', description: 'Netflix', date: '2026-10-07' },
          'future',
        )
        .subscribe();

      const rulePut = http.expectOne({ url: `${TX_URL}/50`, method: 'PUT' });
      expect(rulePut.request.body).toMatchObject({ amount: 799, repeatDay: 7, date: '2026-09-05' });
      rulePut.flush({ ...rulePut.request.body, id: '50' });
      const laterPut = http.expectOne({ url: `${TX_URL}/62`, method: 'PUT' });
      expect(laterPut.request.body).toMatchObject({ amount: 799, date: '2026-11-05', ruleId: '50' });
      laterPut.flush({ ...laterPut.request.body, id: '62' });
      const thisPut = http.expectOne({ url: `${TX_URL}/61`, method: 'PUT' });
      expect(thisPut.request.body).toMatchObject({ amount: 799, date: '2026-10-07', ruleId: '50' });
      thisPut.flush({ ...thisPut.request.body, id: '61' });

      expect(store.transactions().map((t) => t.amount)).toEqual([649, 799, 799]);
    });

    it('keeps the rule link when only one month is edited', () => {
      loadWith([ruleRow, occurrence('60', '2026-09-05')], []);
      store
        .updateOccurrence(
          '60',
          { type: 'EXPENSE', amount: 700, categoryId: 'subscriptions', description: 'Netflix', date: '2026-09-05' },
          'one',
        )
        .subscribe();
      const put = http.expectOne({ url: `${TX_URL}/60`, method: 'PUT' });
      expect(put.request.body).toMatchObject({ amount: 700, ruleId: '50' });
    });

    it('refuses a rule whose back-filled months would pass the record limit', () => {
      const almostFull = Array.from({ length: 98 }, (_, i) => ({ ...food, id: String(i) }));
      loadWith(almostFull, []);
      let error: unknown;
      store
        .createRecurring(
          { type: 'EXPENSE', amount: 1, categoryId: 'food', description: '', date: '2026-09-01' },
          '2026-11-12',
        )
        .subscribe({ error: (e) => (error = e) });
      expect((error as ApiError).status).toBe(422);
      http.expectNone(TX_URL);
    });
  });
});
