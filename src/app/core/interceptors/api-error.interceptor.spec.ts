import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, toApiError } from './api-error.interceptor';

const MOCKAPI_URL = 'https://abc123.mockapi.io/api/v1/transactions/7';
const OWN_URL = () => `${location.origin}/api/parse-upi-screenshots`;

function failure(url: string, status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ url, status, error });
}

describe('toApiError', () => {
  it('keeps MockAPI messages even though its address contains /api/', () => {
    const notFound = toApiError(failure(MOCKAPI_URL, 404, 'Not found'));
    expect(notFound.status).toBe(404);
    expect(notFound.message).toContain('MockAPI resources');
    expect(toApiError(failure(MOCKAPI_URL, 500)).message).toBe(
      'The data service had a problem. Try again in a moment.',
    );
    expect(toApiError(failure(MOCKAPI_URL, 0)).message).toContain('Cannot reach the server');
  });

  it('shows the message the app’s own function wrote for people', () => {
    const error = toApiError(failure(OWN_URL(), 401, { error: 'Enter the import access code in Settings.' }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Enter the import access code in Settings.');
  });

  it('says the local API server is not running when /api has nothing behind it', () => {
    // jsdom runs on localhost, so this is the local-development wording.
    for (const status of [404, 500, 502, 504]) {
      expect(toApiError(failure(OWN_URL(), status, '<pre>Cannot POST</pre>')).message).toContain('npm run dev:api');
    }
  });

  it('falls back to the generic messages for other own-function failures', () => {
    expect(toApiError(failure(OWN_URL(), 429)).message).toBe(
      'Too many requests in a short time. Wait a moment and try again.',
    );
  });

  it('passes ApiErrors through and wraps anything else', () => {
    const existing = new ApiError(422, 'Too many records.');
    expect(toApiError(existing)).toBe(existing);
    expect(toApiError(new Error('boom')).message).toBe('Something unexpected happened. Try again.');
  });
});
