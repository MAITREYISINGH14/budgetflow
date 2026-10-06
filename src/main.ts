import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { inject as injectAnalytics } from '@vercel/analytics';
import { App } from './app/app';
import { appConfig } from './app/app.config';

injectAnalytics({ mode: isDevMode() ? 'development' : 'production' });

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
