import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { MOCKAPI_BASE_URL } from '../config';
import { ApiError } from '../interceptors/api-error.interceptor';
import { RecurringRule, RecurringRulePayload, Transaction, TransactionPayload } from '../models';
import { normalizeList, ruleToRow, toRecurringRule, toTransaction } from './normalize';

export interface TransactionRows {
  transactions: Transaction[];
  rules: RecurringRule[];
}

/**
 * REST client for the MockAPI `transactions` resource. The resource holds both ordinary
 * transactions and recurring rules (rows with kind "RULE"), because the free plan only
 * allows two resources; they are separated here so nothing else has to know.
 */
@Injectable({ providedIn: 'root' })
export class TransactionApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${MOCKAPI_BASE_URL}/transactions`;

  list(): Observable<TransactionRows> {
    return this.http.get<unknown>(this.url).pipe(
      map((rows) => ({
        transactions: normalizeList(rows, toTransaction),
        rules: normalizeList(rows, toRecurringRule),
      })),
      // MockAPI answers 404 instead of [] for an empty resource.
      catchError((error: unknown) =>
        error instanceof ApiError && error.status === 404
          ? of({ transactions: [], rules: [] })
          : throwError(() => error),
      ),
    );
  }

  create(payload: TransactionPayload): Observable<Transaction> {
    const now = new Date().toISOString();
    return this.http
      .post<Record<string, unknown>>(this.url, { ...payload, createdAt: now, updatedAt: now })
      .pipe(map(strict));
  }

  /** MockAPI supports PUT (full replace), so the whole record is sent, including its rule link. */
  update(existing: Transaction, payload: TransactionPayload): Observable<Transaction> {
    const ruleId = payload.ruleId ?? existing.ruleId;
    const body = {
      ...payload,
      ...(ruleId ? { ruleId } : {}),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
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

  // ---------- Recurring rules (same resource) ----------

  createRule(payload: RecurringRulePayload): Observable<RecurringRule> {
    const now = new Date().toISOString();
    return this.http
      .post<Record<string, unknown>>(this.url, { ...ruleToRow(payload), createdAt: now, updatedAt: now })
      .pipe(map(strictRule));
  }

  updateRule(existing: RecurringRule, payload: RecurringRulePayload): Observable<RecurringRule> {
    const body = { ...ruleToRow(payload), createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    return this.http.put<Record<string, unknown>>(`${this.url}/${existing.id}`, body).pipe(map(strictRule));
  }

  deleteRule(id: string): Observable<void> {
    return this.delete(id);
  }
}

function strict(raw: Record<string, unknown>): Transaction {
  const transaction = toTransaction(raw);
  if (!transaction) throw new ApiError(500, 'The server returned an unexpected transaction.');
  return transaction;
}

function strictRule(raw: Record<string, unknown>): RecurringRule {
  const rule = toRecurringRule(raw);
  if (!rule) throw new ApiError(500, 'The server returned an unexpected recurring rule.');
  return rule;
}
