import { percentChange, withTone } from './month-comparison';

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

describe('withTone', () => {
  it('calls a rise good or bad depending on what is measured', () => {
    expect(withTone({ direction: 'up', text: '12%' }, true)?.tone).toBe('good');
    expect(withTone({ direction: 'up', text: '12%' }, false)?.tone).toBe('bad');
    expect(withTone({ direction: 'down', text: '8%' }, false)?.tone).toBe('good');
    expect(withTone({ direction: 'flat', text: '0%' }, true)?.tone).toBe('neutral');
    expect(withTone(null, true)).toBeNull();
  });
});
