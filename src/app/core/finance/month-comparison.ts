/** Period-over-period changes, used by Analytics. Pure functions, so they are easy to test. */

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface MonthChange {
  direction: ChangeDirection;
  text: string;
}

function directionOf(diff: number): ChangeDirection {
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
}

/**
 * Percentage change from `previous` to `current`, rounded to a whole number.
 * Returns null when there is nothing to compare against (previous is 0).
 * Uses |previous| so the direction stays right when the previous value was negative.
 */
export function percentChange(current: number, previous: number): MonthChange | null {
  if (previous === 0) return null;
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return { direction: directionOf(percent), text: `${Math.abs(percent)}%` };
}

/** A change plus whether it is good news (lower spending is good, lower income is not). */
export interface ToneChange extends MonthChange {
  tone: 'good' | 'bad' | 'neutral';
}

export function withTone(change: MonthChange | null, upIsGood: boolean): ToneChange | null {
  if (!change) return null;
  const tone = change.direction === 'flat' ? 'neutral' : (change.direction === 'up') === upIsGood ? 'good' : 'bad';
  return { ...change, tone };
}
