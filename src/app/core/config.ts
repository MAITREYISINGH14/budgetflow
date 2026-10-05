/**
 * Replace YOUR_PROJECT_ID with the id from your MockAPI project URL, e.g.
 * https://6712ab34cd5e8f9a0b1c2d3e.mockapi.io/api/v1
 * See README → "Set up MockAPI".
 */
export const MOCKAPI_BASE_URL = 'https://6ac369ebae53bf25b80e7dbd.mockapi.io/api/v1';

/** Free, keyless exchange rates from the European Central Bank. */
export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1';

/** MockAPI's free plan stores at most 100 records per resource. */
export const MOCKAPI_RECORD_LIMIT = 100;

export function isApiConfigured(url: string = MOCKAPI_BASE_URL): boolean {
  return /^https:\/\/[a-z0-9]+\.mockapi\.io\//i.test(url) && !url.includes('YOUR_PROJECT_ID');
}
