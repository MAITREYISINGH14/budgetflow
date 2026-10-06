/** Month-over-month changes for the dashboard. Pure functions, so they are easy to test. */

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

/** "Good morning" / "Good afternoon" / "Good evening" for an hour from 0 to 23. */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
