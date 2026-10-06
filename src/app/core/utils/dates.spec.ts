import {
  formatDisplayDate,
  formatMonth,
  isValidIsoDate,
  monthBounds,
  parseIsoMonth,
  resolveDateRange,
  shiftYearMonth,
  toIsoDate,
} from './dates';

describe('date helpers', () => {
  it('formats local dates without shifting to UTC', () => {
    expect(toIsoDate(new Date(2026, 8, 1, 23, 30))).toBe('2026-09-01');
  });

  it('validates real calendar dates', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('01/09/2026')).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });

  it('shifts months across year boundaries', () => {
    expect(shiftYearMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftYearMonth({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
  });

  it('returns month bounds, including leap years', () => {
    expect(monthBounds({ year: 2028, month: 2 })).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });

  it('parses YYYY-MM values', () => {
    expect(parseIsoMonth('2026-09')).toEqual({ year: 2026, month: 9 });
    expect(parseIsoMonth('2026-13')).toBeNull();
  });

  it.each([
    ['all', {}],
    ['this-month', { startDate: '2026-10-01', endDate: '2026-10-05' }],
    ['last-month', { startDate: '2026-09-01', endDate: '2026-09-30' }],
    ['last-3-months', { startDate: '2026-08-01', endDate: '2026-10-05' }],
    ['last-6-months', { startDate: '2026-05-01', endDate: '2026-10-05' }],
  ] as const)('resolves the %s preset', (preset, expected) => {
    expect(resolveDateRange(preset, '2026-10-05')).toEqual(expected);
  });

  it('allows an open-ended custom range', () => {
    expect(resolveDateRange('custom', '2026-10-05', { from: '2026-01-01', to: null })).toEqual({
      startDate: '2026-01-01',
    });
  });

  it('formats display dates and month labels', () => {
    expect(formatDisplayDate('2026-09-01')).toMatch(/^01 Sep\w* 2026$/);
    expect(formatMonth('2026-05')).toBe('May 2026');
  });
});
