import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { categoriesFor } from '../../core/categories';
import { MAX_SCREENSHOTS, ScreenshotImportApi } from '../../core/data/screenshot-import-api';
import {
  ImportRow,
  markDuplicates,
  rowProblem,
  rowsToPayloads,
  toImportRows,
} from '../../core/finance/screenshot-import';
import { categorize, CategorySource, LearnedCategories, learnCategories } from '../../core/finance/merchant';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { TransactionType } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { FinanceStore } from '../../core/state/finance-store';
import { MIN_DATE } from '../../core/utils/dates';
import { DESCRIPTION_MAX } from '../../core/utils/form-validators';
import { shrinkImage } from '../../core/utils/image';

type Step = 'pick' | 'reading' | 'review' | 'saving';

/** Largest screenshot accepted before shrinking; anything bigger is unlikely to be a phone screenshot. */
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Import from UPI history screenshots: pick up to five, the server reads them, and every
 * row found is shown for review. Nothing is saved until the person confirms, and doubtful
 * rows (failed, pending, cut off, duplicates) start unticked. Closes with the number added.
 */
@Component({
  selector: 'bf-screenshot-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './screenshot-import-dialog.html',
  styleUrl: './screenshot-import-dialog.scss',
})
export class ScreenshotImportDialog {
  protected readonly ref = inject<DialogRef<number>>(DialogRef);
  private readonly api = inject(ScreenshotImportApi);
  private readonly store = inject(FinanceStore);
  protected readonly today = inject(ClockService).today;

  protected readonly maxScreenshots = MAX_SCREENSHOTS;
  protected readonly minDate = MIN_DATE;
  protected readonly descriptionMax = DESCRIPTION_MAX;

  /** Where the screenshots will be sent, for the privacy note; undefined while asking. */
  protected readonly provider = toSignal(this.api.provider());

  protected readonly step = signal<Step>('pick');
  protected readonly files = signal<File[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly saved = signal(0);

  /** Your past category for each merchant, from saved transactions; refreshed on each read. */
  private learned: LearnedCategories = new Map();

  protected readonly sourceLabel: Record<CategorySource, string> = {
    history: 'From your history',
    merchant: 'Known merchant',
    ai: 'AI suggestion',
    default: 'No match: check this',
    you: 'Your choice',
  };

  /** Ticked rows that fell back to Other, so the summary can say how many need a look. */
  protected readonly unmatched = computed(
    () => this.rows().filter((r) => r.include && r.categorySource === 'default').length,
  );

  /** Rows with what the table needs: their categories and any problem stopping them being saved. */
  protected readonly reviewRows = computed(() =>
    this.rows().map((row) => ({
      row,
      categories: categoriesFor(row.type),
      problem: rowProblem(row, this.today()),
    })),
  );
  protected readonly toAdd = computed(() => rowsToPayloads(this.rows(), this.today()));
  protected readonly ticked = computed(() => this.rows().filter((r) => r.include).length);

  protected pickFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    this.error.set(null);
    const usable = picked.filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_FILE_BYTES);
    if (usable.length < picked.length) this.error.set('Only PNG, JPEG or WebP screenshots up to 15 MB can be read.');
    const all = [...this.files(), ...usable];
    if (all.length > MAX_SCREENSHOTS) this.error.set(`Choose up to ${MAX_SCREENSHOTS} screenshots at a time.`);
    this.files.set(all.slice(0, MAX_SCREENSHOTS));
  }

  protected removeFile(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  protected async read(): Promise<void> {
    if (this.files().length === 0 || this.step() === 'reading') return;
    this.error.set(null);
    this.step.set('reading');
    let images;
    try {
      images = await Promise.all(this.files().map((f) => shrinkImage(f)));
    } catch {
      this.error.set('A screenshot could not be opened. Try a different image.');
      this.step.set('pick');
      return;
    }
    const today = this.today();
    this.api.read(images, today).subscribe({
      next: (raw) => {
        this.learned = learnCategories(this.store.transactions());
        const rows = markDuplicates(toImportRows(raw, today, this.learned), this.store.transactions());
        if (rows.length === 0) {
          this.error.set('No payments were found. Use screenshots of the payment history list in your UPI app.');
          this.step.set('pick');
          return;
        }
        this.rows.set(rows);
        this.step.set('review');
      },
      error: (error: unknown) => {
        this.error.set(errorMessage(error, 'The screenshots could not be read. Try again.'));
        this.step.set('pick');
      },
    });
  }

  protected backToPick(): void {
    this.rows.set([]);
    this.step.set('pick');
  }

  // ---------- Review table edits ----------

  private patch(key: string, changes: Partial<ImportRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }

  protected toggle(key: string, event: Event): void {
    this.patch(key, { include: (event.target as HTMLInputElement).checked });
  }

  protected setDate(key: string, event: Event): void {
    this.patch(key, { date: (event.target as HTMLInputElement).value });
  }

  protected setDescription(row: ImportRow, event: Event): void {
    const description = (event.target as HTMLInputElement).value.slice(0, DESCRIPTION_MAX);
    // A renamed row picks up a stronger match (your history, a known merchant) unless you chose its category.
    const next = categorize(description, row.type, null, this.learned);
    const better = row.categorySource !== 'you' && (next.source === 'history' || next.source === 'merchant');
    this.patch(
      row.key,
      better ? { description, categoryId: next.categoryId, categorySource: next.source } : { description },
    );
  }

  protected setAmount(key: string, event: Event): void {
    this.patch(key, { amount: Number((event.target as HTMLInputElement).value) });
  }

  protected setType(row: ImportRow, event: Event): void {
    const type = (event.target as HTMLSelectElement).value as TransactionType;
    const keep = row.categorySource === 'you' && categoriesFor(type).some((c) => c.id === row.categoryId);
    if (keep) {
      this.patch(row.key, { type });
      return;
    }
    const next = categorize(row.description, type, null, this.learned);
    this.patch(row.key, { type, categoryId: next.categoryId, categorySource: next.source });
  }

  protected setCategory(key: string, event: Event): void {
    this.patch(key, { categoryId: (event.target as HTMLSelectElement).value, categorySource: 'you' });
  }

  protected save(): void {
    const payloads = this.toAdd();
    if (payloads.length === 0 || this.step() === 'saving') return;
    this.error.set(null);
    this.saved.set(0);
    this.step.set('saving');
    this.store
      .importTransactions(payloads)
      .pipe(finalize(() => this.step() === 'saving' && this.step.set('review')))
      .subscribe({
        next: (done) => this.saved.set(done),
        complete: () => this.ref.close(this.saved()),
        error: (error: unknown) =>
          this.error.set(
            `${errorMessage(error, 'Saving stopped.')}${this.saved() ? ` ${this.saved()} were added before it stopped.` : ''}`,
          ),
      });
  }
}
