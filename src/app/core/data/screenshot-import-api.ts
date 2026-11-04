import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { SettingsService } from '../services/settings.service';
import { ShrunkImage } from '../utils/image';

/** The app's own serverless function (api/parse-upi-screenshots.js); same origin, so the CSP allows it. */
export const SCREENSHOT_IMPORT_URL = '/api/parse-upi-screenshots';
export const MAX_SCREENSHOTS = 5;

/** Which AI service reads the screenshots on this deployment; null if none is set up or it cannot be told. */
export type ImportProvider = 'gemini' | 'anthropic' | null;

/** Sends screenshots to the server, which reads them with Claude and returns raw rows. */
@Injectable({ providedIn: 'root' })
export class ScreenshotImportApi {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  /** Asks the server which provider it uses, so the app can say where screenshots go. */
  provider(): Observable<ImportProvider> {
    return this.http.get<{ provider?: unknown }>(SCREENSHOT_IMPORT_URL).pipe(
      map((body) => (body?.provider === 'gemini' || body?.provider === 'anthropic' ? body.provider : null)),
      catchError(() => of(null)),
    );
  }

  /** Raw rows; validate them with toImportRows() before showing or saving anything. */
  read(images: ShrunkImage[], today: string): Observable<unknown> {
    const code = this.settings.settings().importCode;
    const headers = code ? new HttpHeaders({ 'x-import-code': code }) : undefined;
    return this.http
      .post<{ rows?: unknown }>(SCREENSHOT_IMPORT_URL, { today, images }, { headers })
      .pipe(map((body) => body?.rows ?? []));
  }
}
