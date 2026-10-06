import { greetingFor, percentChange } from './month-comparison';

describe('percentChange', () => {
  it('reports an increase as a rounded percentage', () => {
    expect(percentChange(112, 100)).toEqual({ direction: 'up', text: '12%' });
  });

  it('reports a decrease without a minus sign', () => {
    expect(percentChange(75, 100)).toEqual({ direction: 'down', text: '25%' });
  });

  it('reports no change as flat', () => {
    expect(percentChange(100, 100)).toEqual({ direction: 'flat', text: '0%' });
  });

  it('returns null when there is no previous value to compare with', () => {
    expect(percentChange(500, 0)).toBeNull();
  });

  it('keeps the direction right when the previous value was negative', () => {
    expect(percentChange(500, -1000)?.direction).toBe('up');
  });
});

describe('greetingFor', () => {
  it('picks the greeting for the time of day', () => {
    expect(greetingFor(8)).toBe('Good morning');
    expect(greetingFor(13)).toBe('Good afternoon');
    expect(greetingFor(20)).toBe('Good evening');
  });
});
