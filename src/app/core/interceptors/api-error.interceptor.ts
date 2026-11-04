import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/** A normalised failure with a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const MESSAGES: Record<number, string> = {
  0: 'Cannot reach the server. Check your internet connection and try again.',
  400: 'The request was not accepted. Check the values and try again.',
  404: 'Not found. Check that the MockAPI resources are named "transactions" and "budgets".',
  429: 'Too many requests in a short time. Wait a moment and try again.',
  500: 'The data service had a problem. Try again in a moment.',
};

/** A request to this app's own server functions (api/…). MockAPI's address also contains /api/, so the origin is checked too. */
function isOwnFunction(url: string | null): boolean {
  if (!url) return false;
  try {
    const { origin, pathname } = new URL(url, location.href);
    return origin === location.origin && pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * The app's own functions answer with a message written for people. When there is none and
 * the request failed like a missing server, say so: locally that means the API server
 * (npm run dev:api) is not running.
 */
function ownFunctionError(error: HttpErrorResponse): ApiError | null {
  const own = (error.error as { error?: unknown } | null)?.error;
  if (typeof own === 'string' && own) return new ApiError(error.status, own);
  if (![404, 500, 502, 503, 504].includes(error.status)) return null;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return new ApiError(
    error.status,
    local
      ? 'Screenshot import needs its local server. In a second Terminal window, run: npm run dev:api'
      : 'Screenshot import is not available on this server.',
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!(error instanceof HttpErrorResponse)) return new ApiError(-1, 'Something unexpected happened. Try again.');
  if (isOwnFunction(error.url)) {
    const own = ownFunctionError(error);
    if (own) return own;
  }
  const message = MESSAGES[error.status] ?? (error.status >= 500 ? MESSAGES[500] : MESSAGES[400]);
  return new ApiError(error.status, message);
}

/** Every HTTP failure becomes an ApiError, so components only handle one error type. */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(catchError((error: unknown) => throwError(() => toApiError(error))));

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  return error instanceof ApiError ? error.message : fallback;
}
