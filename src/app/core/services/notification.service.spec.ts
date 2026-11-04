import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MOCKAPI_BASE_URL } from '../config';
import { apiErrorInterceptor } from '../interceptors/api-error.interceptor';
import { FinanceStore } from '../state/finance-store';
import { todayIso } from '../utils/dates';
import { NotificationService } from './notification.service';

const month = todayIso().slice(0, 7);
const [year, m] = month.split('-').map(Number);

describe('NotificationService', () => {
  let service: NotificationService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(NotificationService);
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(FinanceStore);
    store.load();
    http
      .expectOne(`${MOCKAPI_BASE_URL}/transactions`)
      .flush([{ id: '1', type: 'EXPENSE', amount: 9000, categoryId: 'shopping', description: '', date: todayIso() }]);
    http
      .expectOne(`${MOCKAPI_BASE_URL}/budgets`)
      .flush([{ id: 'b1', categoryId: 'shopping', month: m, year, limit: 6000 }]);
  });

  afterEach(() => http.verify());

  it('lists current notifications and counts the unread ones', () => {
    expect(service.notifications().map((n) => n.id)).toContain('budget-over:b1');
    expect(service.unreadCount()).toBe(service.notifications().length);
  });

  it('marks everything read, and remembers it across reloads', () => {
    service.markAllRead();
    expect(service.unreadCount()).toBe(0);
    TestBed.tick();
    expect(localStorage.getItem('budgetflow.notifications.v1')).toContain('budget-over:b1');
  });

  it('removes a dismissed notification and keeps it gone', () => {
    service.dismiss('budget-over:b1');
    expect(service.notifications().map((n) => n.id)).not.toContain('budget-over:b1');
  });

  it('hides kinds that are switched off', () => {
    service.setEnabled('BUDGET_OVER', false);
    expect(service.notifications().some((n) => n.kind === 'BUDGET_OVER')).toBe(false);
    expect(service.enabled().BUDGET_OVER).toBe(false);
    expect(service.enabled().LOGGING_NUDGE).toBe(false);
  });
});
