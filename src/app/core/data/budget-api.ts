import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { MOCKAPI_BASE_URL } from '../config';
import { ApiError } from '../interceptors/api-error.interceptor';
import { Budget, BudgetPayload } from '../models';
import { normalizeList, toBudget } from './normalize';

/** REST client for the MockAPI `budgets` resource. */
@Injectable({ providedIn: 'root' })
export class BudgetApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${MOCKAPI_BASE_URL}/budgets`;

  list(): Observable<Budget[]> {
    return this.http.get<unknown>(this.url).pipe(
      map((rows) => normalizeList(rows, toBudget)),
      catchError((error: unknown) =>
        error instanceof ApiError && error.status === 404 ? of([]) : throwError(() => error),
      ),
    );
  }

  create(payload: BudgetPayload): Observable<Budget> {
    const now = new Date().toISOString();
    return this.http
      .post<Record<string, unknown>>(this.url, { ...payload, createdAt: now, updatedAt: now })
      .pipe(map(strict));
  }

  updateLimit(existing: Budget, limit: number): Observable<Budget> {
    const body = { ...existing, limit, updatedAt: new Date().toISOString() };
    return this.http.put<Record<string, unknown>>(`${this.url}/${existing.id}`, body).pipe(map(strict));
  }

  delete(id: string): Observable<void> {
    return this.http.delete(`${this.url}/${id}`).pipe(
      map(() => undefined),
      catchError((error: unknown) =>
        error instanceof ApiError && error.status === 404 ? of(undefined) : throwError(() => error),
      ),
    );
  }
}

function strict(raw: Record<string, unknown>): Budget {
  const budget = toBudget(raw);
  if (!budget) throw new ApiError(500, 'The server returned an unexpected budget.');
  return budget;
}
