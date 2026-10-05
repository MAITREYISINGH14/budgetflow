import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { MOCKAPI_BASE_URL } from '../config';
import { ApiError } from '../interceptors/api-error.interceptor';
import { Transaction, TransactionPayload } from '../models';
import { normalizeList, toTransaction } from './normalize';

/** REST client for the MockAPI `transactions` resource. */
@Injectable({ providedIn: 'root' })
export class TransactionApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${MOCKAPI_BASE_URL}/transactions`;

  list(): Observable<Transaction[]> {
    return this.http.get<unknown>(this.url).pipe(
      map((rows) => normalizeList(rows, toTransaction)),
      // MockAPI answers 404 instead of [] for an empty resource.
      catchError((error: unknown) => (error instanceof ApiError && error.status === 404 ? of([]) : throwError(() => error))),
    );
  }

  create(payload: TransactionPayload): Observable<Transaction> {
    const now = new Date().toISOString();
    return this.http.post<Record<string, unknown>>(this.url, { ...payload, createdAt: now, updatedAt: now }).pipe(map(strict));
  }

  /** MockAPI supports PUT (full replace), so the whole record is sent. */
  update(existing: Transaction, payload: TransactionPayload): Observable<Transaction> {
    const body = { ...payload, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
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

function strict(raw: Record<string, unknown>): Transaction {
  const transaction = toTransaction(raw);
  if (!transaction) throw new ApiError(500, 'The server returned an unexpected transaction.');
  return transaction;
}
