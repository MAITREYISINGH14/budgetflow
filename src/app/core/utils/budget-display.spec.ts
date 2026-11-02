import { progressWidth } from './budget-display';

describe('progressWidth', () => {
  it('clamps the bar to 0-100', () => {
    expect(progressWidth(82)).toBe(82);
    expect(progressWidth(140)).toBe(100);
    expect(progressWidth(-5)).toBe(0);
    expect(progressWidth(Number.NaN)).toBe(0);
  });
});
