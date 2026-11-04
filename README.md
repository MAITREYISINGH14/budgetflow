# BudgetFlow

A personal finance and budget manager built with Angular 21.

You can record income and expenses, set monthly budgets for each category, and see where your money goes on a dashboard with charts and simple insights.

**Live demo:** https://budgetflow-maitreyi.vercel.app/dashboard

## What it does

- **Transactions:** add, edit and delete income and expenses. Search, filter (type, category, date range, amount), sort and paginate. Filters are kept in the URL, so refreshing the page or sharing the link keeps the same view. Active filters show as removable chips, and the list shows the total of every matching row.
- **Recurring transactions:** tick "Repeat every month" when adding salary, rent or a subscription and it is added on the same day every month (shorter months use their last day). Past months back to its date are filled in straight away. Repeating rows show a Monthly badge; editing or deleting one asks whether it's for that month only or that month and every later one. Settings lists every recurring transaction with its next date, and lets you edit or stop it. The dashboard's daily allowance leaves room for bills still due this month.
- **Import from screenshots:** choose up to five screenshots of the payment history list in a UPI app (Google Pay, PhonePe, Paytm, a bank app). an AI vision model (Google Gemini's free tier, or Anthropic Claude) reads them on the server and every payment found is shown in an editable review table; failed, pending, refunded, cut-off and duplicate rows start unticked. Nothing is saved until you confirm, screenshots are not stored, and UPI IDs and phone numbers are removed.
- **Notifications:** a bell in the top bar lists bills coming up, budgets over or near their limit, unusual payments, new-month set-up, a month recap and recurring transactions added, each once and with a link to act on it. Each kind can be switched off in Settings, and bills, budgets and unusual payments can also show as browser notifications while the app is open.
- **CSV export:** downloads every transaction that matches the current filters, not just the page you're looking at.
- **Budgets:** set a monthly limit per expense category and track spent, remaining and status (on track, near limit at 75%, over budget). Copy last month's budgets in one click, add a budget for an unbudgeted category with one tap, and see how much you can spend per day for the rest of the month.
- **Dashboard:** answers "how is this month going?" in four blocks: what's left to spend (with a daily allowance and a pace bar comparing spending with the calendar), up to three items that need attention (each linking to the transactions behind it), spending and budgets by category, and this month's recent transactions.
- **Analytics:** 1, 3, 6, 12 month or custom date ranges compared with the period before, income vs expenses by month, a category table with each category's change, and a review of any past month.
- **Insights:** rule-based messages like "Food spending is up 24% on last month", ranked together with budget alerts so nothing is said twice.
- **Currency display:** amounts are recorded in rupees and can be shown in USD, EUR or GBP using live exchange rates.
- **Light and dark themes:** follows the device setting on first visit, remembers your choice, and applies it before the page draws, so there is no flash.
- Works on desktop and mobile (floating navigation and bottom-sheet dialogs on phones), can be used with a keyboard, and respects the "reduce motion" setting.

## Tech stack

- **Angular 21:** standalone components, signals, zoneless change detection, new control flow (`@if`, `@for`)
- **RxJS** for HTTP calls, debounced inputs and bulk requests
- **Reactive Forms** with custom validators
- **Angular CDK** for accessible dialogs
- No charting library: every chart, progress bar and the pace bar is plain HTML, CSS and signals, which keeps the bundle small and theming automatic
- **Vercel** hosting with security headers (Content Security Policy, HSTS, no framing) and Vercel Web Analytics
- **ESLint** (including Angular accessibility rules), **Prettier**, **Vitest**, and **GitHub Actions** CI that lints, checks formatting, tests and builds every push
- **SCSS** for styling
- **[MockAPI](https://mockapi.io)** to store transactions and budgets (REST)
- **[Frankfurter](https://frankfurter.dev)** for exchange rates (free, no API key)

## How it's structured

```
src/app/
├── core/
│   ├── config.ts          API URLs and limits
│   ├── categories.ts      fixed list of categories
│   ├── models.ts          TypeScript types
│   ├── data/              HTTP clients for MockAPI and Frankfurter
│   ├── state/             FinanceStore, the single source of data
│   ├── finance/           calculations: totals, budgets, month pace, attention list, trends, insights, filters, CSV
│   ├── services/          settings, currency conversion, notifications, today's date
│   ├── interceptors/      turns HTTP errors into readable messages
│   └── utils/             dates, money formatting, URL filters, form validators
├── shared/                table, budget bar, change pill, dialogs, pipes
├── layout/                app shell and navigation
└── features/              dashboard, transactions, budgets, analytics, settings
```

`FinanceStore` loads all transactions and budgets once and keeps them in signals. Every number on screen is calculated from those two lists with `computed()`, so all the pages always show the same figures.

A budget only stores its limit. How much has been spent is always calculated from the transactions, so editing or deleting a transaction updates the budgets, dashboard and charts straight away.

## Running it locally

You need Node.js 20.19 or newer.

```bash
npm install
npm start
```

Then open http://localhost:4200.

### Using your own MockAPI project

The app is already connected to a demo MockAPI project. To use your own:

1. Create a free project at [mockapi.io](https://mockapi.io) with the API prefix `/api/v1`.
2. Add a resource called `transactions` with these fields: `type` (String), `amount` (Number), `categoryId` (String), `description` (String), `date` (String), `createdAt` (String), `updatedAt` (String).
   Optionally also add `kind`, `ruleId`, `repeatUntil` and `repeatSkip` (String) and `repeatDay` (Number), used by recurring transactions.
3. Add a resource called `budgets` with: `categoryId` (String), `month` (Number), `year` (Number), `limit` (Number), `createdAt` (String), `updatedAt` (String).
4. Put your project URL (for example `https://abc123.mockapi.io/api/v1`) into `MOCKAPI_BASE_URL` in `src/app/core/config.ts`.
5. Start the app and go to **Settings → Load demo data**.

The demo data adds 72 transactions and 19 budgets over the last six months, based on today's date. **Settings → Delete all data** removes everything again.

## Screenshot import setup

Screenshot import runs in a Vercel serverless function (`api/parse-upi-screenshots.js`), so the API key never reaches the browser. It works with either of two AI services; set the key for one of them.

**Free: Google Gemini** (no billing account needed)

1. Go to [aistudio.google.com](https://aistudio.google.com), sign in with a Google account and choose Get API key → Create API key.
2. In Vercel, open the project → Settings → Environment Variables, and add `GEMINI_API_KEY`.
3. Optional: `GEMINI_MODEL` to use a different model than the default `gemini-3.5-flash-lite` (for example if Google renames it; AI Studio lists the models your key can use).

The free tier has daily and per-minute limits; when they are reached, imports show "The free AI quota is used up for now" until they reset. On the free tier Google may use what is sent to improve its products and people may review it, and the import dialog says so before anything is uploaded.

**Paid: Anthropic Claude** (billed per use)

1. Create an API key at [platform.claude.com](https://platform.claude.com) and add billing.
2. Add `ANTHROPIC_API_KEY` in Vercel. Optional: `ANTHROPIC_MODEL` (default `claude-haiku-5-5`).

If both keys are set, Gemini is used.

**For either:** also add `IMPORT_ACCESS_CODE` with any secret phrase, and enter the same phrase in the app under Settings → Screenshot import access code, so strangers who find the deployment cannot use your quota or credits. Redeploy after changing variables.

### Keeping the cost safe (Claude only)

With Gemini's free tier there is no bill. With Claude, reading screenshots costs very little: with the default `claude-haiku-5-5`, roughly ₹0.04 to ₹0.15 per import, or a few rupees a month for one person. The real risk isn't your own usage, it's strangers using your deployment. That's what `IMPORT_ACCESS_CODE` is for: without the code, the function refuses the request before it reaches the AI service. Also set a monthly spend limit of $1 in the Anthropic console, so the bill can never surprise you. When the limit is reached, imports fail with an error until the next month; nothing else in the app is affected.

### Trying screenshot import locally

`npm start` (ng serve) only serves the pages; on Vercel the files in `api/` run as server functions. Locally, a small server runs the same function code and `npm start` forwards `/api` to it (`proxy.conf.json`).

1. Put your key in a `.env.local` file next to `package.json` (already in `.gitignore`), for example `GEMINI_API_KEY=your-key`.
2. In one Terminal window: `npm run dev:api`
3. In a second Terminal window: `npm start`, then open http://localhost:4200

The API server only accepts connections from your own computer. Restart it after editing `.env.local`. If the import says it needs its local server, `npm run dev:api` isn't running.

## Tests

```bash
npm test
```

The tests focus on the logic where a mistake would show wrong numbers:

- budget status thresholds and money calculations
- left to spend, the daily allowance and month pace
- the attention list's ranking, de-duplication and links
- copying budgets between months
- recurring rules: filling in months, short months, skipped months, end dates, and editing or deleting one month or later months
- screenshot import: validation, dates without a year, removing personal details, category guesses and duplicates
- notifications: each rule, de-duplication, switching kinds off, and read/dismissed state
- savings rate, monthly trends and insights
- filtering, sorting, pagination, filter chips and CSV export
- the data store (loading, adding, deleting, duplicate budgets) using a fake HTTP backend
- currency conversion
- the transaction form, the transaction table, and loading, error and empty states

## Deployment

The app is deployed on Vercel. Build it locally with:

```bash
npm run build
```

The output goes to `dist/budgetflow`. `vercel.json` sends all routes to `index.html`, so refreshing a page like `/transactions` doesn't give a 404.

## Quality checks

The same checks run locally and in CI:

```bash
npm run lint          # ESLint, including accessibility rules for templates
npm run format:check  # Prettier
npm run test:ci       # unit and component tests, once
npm run build         # production build with size budgets
```

## Some decisions I made

- **Money in paise.** JavaScript can't add decimals exactly (`0.1 + 0.2` isn't `0.3`), so all sums are done in whole paise and converted back to rupees at the end.
- **Dates as `YYYY-MM-DD` strings.** A transaction happens on a day, not at a specific time. Keeping dates as strings avoids them shifting by a day in different timezones.
- **Categories in code.** MockAPI's free plan only allows two resources, and categories don't change, so they're a fixed list with ids like `food` and `salary`.
- **Validation in the app.** MockAPI accepts any data, so the app checks amounts, dates and categories, allows only one budget per category per month, and ignores invalid records it gets back.
- **One accent colour.** Each page has a single bright card (Balance, Left to spend, Net); everything else stays quiet, so the most important number is obvious. All colours are CSS variables, so the light and dark themes are two sets of the same variables.
- **One question per page.** The dashboard only shows the current month and answers "am I okay, and is anything wrong?". Looking back (past months, trends, period comparisons) lives on Analytics.
- **"Left to spend" measures against budgets first.** It uses the month's budgets with a limit above 0; with none, it falls back to the month's income. The daily allowance divides what's left by the days remaining, today included.
- **Today is a signal.** `ClockService` re-checks the date every minute and when the tab becomes visible, so a tab left open overnight moves on to the new day or month by itself.
- **Recurring rules live in the transactions resource.** MockAPI's free plan allows two resources, so a rule is a row in `transactions` with `kind: "RULE"`. The app never counts those rows as money; each month a rule adds an ordinary transaction that carries its `ruleId`, so totals, budgets, filters and CSV work unchanged. The rule holds the values for months not added yet; deleting one month records that month on the rule so it is never added again.
- **Screenshots are read on the server, checked in the browser.** The function only reads images and returns rows; the app re-validates every row (dates, amounts, categories), resolves dates shown without a year, strips personal details, flags duplicates against saved transactions and across overlapping screenshots, and requires a review before saving.
- **Notifications are computed, not stored.** Like everything else they are derived from transactions, rules and budgets, with a stable id per event (one bill on one date, one budget per month), so each appears once. Only read, dismissed and announced ids live in the browser.
- **Bulk operations one at a time.** MockAPI can lose changes when several requests arrive at once, so loading or deleting demo data sends requests one by one and reloads the data afterwards.

## Limitations

- There's no login. Anyone with the MockAPI URL can see and change the data, so only use demo data.
- Validation only happens in the browser.
- MockAPI's free plan stores up to 100 records per resource.
- Recurring transactions are added by the browser when the app loads or the date changes, not by a server. Two tabs opening at the same moment could each add the same month once.
- Notifications appear while the app is open; there are no notifications when it is closed, which needs a server (see Ideas for later).
- All transactions are loaded at once. That's fine for a few hundred, but a large dataset would need a real backend.

## Ideas for later

- A real backend with login (for example NestJS and PostgreSQL), which would also allow push notifications when the app is closed and a weekly email summary
- Importing bank statements (CSV or PDF) to capture every transaction at once
- Adding and editing categories
- Moving the forms to Angular Signal Forms
- End-to-end tests with Playwright
