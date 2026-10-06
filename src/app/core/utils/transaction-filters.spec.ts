import { convertToParamMap } from '@angular/router';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  findFilterProblem,
  parseTransactionFilters,
  toQueryParams,
  TransactionFilters,
} from './transaction-filters';

const params = (query: Record<string, string>) => convertToParamMap(query);

describe('transaction filters <-> URL', () => {
  it('uses defaults for an empty URL', () => {
    expect(parseTransactionFilters(params({}))).toEqual(DEFAULT_FILTERS);
  });

  it('restores every filter from the URL', () => {
    const filters = parseTransactionFilters(
      params({
        search: 'swiggy',
        type: 'EXPENSE',
        category: 'food',
        range: 'custom',
        from: '2026-07-01',
        to: '2026-09-30',
        min: '100',
        max: '2500.5',
        sort: 'highest',
        page: '2',
      }),
    );

    expect(filters).toEqual({
      search: 'swiggy',
      type: 'EXPENSE',
      categoryId: 'food',
      range: 'custom',
      from: '2026-07-01',
      to: '2026-09-30',
      minAmount: 100,
      maxAmount: 2500.5,
      sort: 'highest',
      page: 2,
    });
  });

  it('falls back to defaults for hand-edited garbage', () => {
    const filters = parseTransactionFilters(
      params({
        type: 'TRANSFER',
        category: 'rent',
        range: 'forever',
        from: '2026-02-31',
        min: '-5',
        sort: 'random',
        page: '0',
      }),
    );
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('writes only non-default values to the URL', () => {
    expect(toQueryParams(DEFAULT_FILTERS)).toEqual({});
    expect(toQueryParams({ ...DEFAULT_FILTERS, type: 'EXPENSE', categoryId: 'food', sort: 'oldest', page: 3 })).toEqual(
      {
        type: 'EXPENSE',
        category: 'food',
        sort: 'oldest',
        page: 3,
      },
    );
  });

  it('round-trips through the URL without losing anything', () => {
    const filters: TransactionFilters = {
      ...DEFAULT_FILTERS,
      search: 'rent',
      categoryId: 'bills',
      range: 'last-3-months',
      minAmount: 0,
      maxAmount: 9000,
    };
    const asStrings = Object.fromEntries(Object.entries(toQueryParams(filters)).map(([k, v]) => [k, String(v)]));
    expect(parseTransactionFilters(params(asStrings))).toEqual(filters);
  });

  it('drops custom dates when a preset range is selected', () => {
    expect(toQueryParams({ ...DEFAULT_FILTERS, range: 'this-month', from: '2026-01-01', to: '2026-01-31' })).toEqual({
      range: 'this-month',
    });
  });
});

describe('filter helpers', () => {
  it('counts active filters', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, search: 'x', type: 'INCOME', minAmount: 1, maxAmount: 5 })).toBe(3);
  });

  it('reports impossible combinations', () => {
    expect(findFilterProblem({ ...DEFAULT_FILTERS, minAmount: 500, maxAmount: 100 })).toContain('Minimum');
    expect(findFilterProblem({ ...DEFAULT_FILTERS, range: 'custom', from: '2026-09-10', to: '2026-09-01' })).toContain(
      'start date',
    );
    expect(findFilterProblem({ ...DEFAULT_FILTERS, minAmount: -1 })).toContain('negative');
    expect(findFilterProblem({ ...DEFAULT_FILTERS, minAmount: 100, maxAmount: 100 })).toBeNull();
  });
});
