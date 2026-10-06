BudgetFlow

A personal finance and budget manager built with Angular 21.

You can record income and expenses, set monthly budgets for each category, and see where your money goes on a dashboard with charts and simple insights.

**Live demo:** https://budgetflow-maitreyi.vercel.app/dashboard

## What it does

- **Transactions:** add, edit and delete income and expenses. Search, filter (type, category, date range, amount), sort and paginate. Filters are kept in the URL, so refreshing the page or sharing the link keeps the same view.
- **CSV export:** downloads every transaction that matches the current filters, not just the page you're looking at.
- **Budgets:** set a monthly limit per expense category and track spent, remaining and status (on track, near limit at 75%, over budget).
- **Dashboard:** balance, income, expenses and savings rate for the month, spending by category, six-month trends, budget progress and recent transactions.
- **Analytics:** 1, 3, 6, 12 month or custom date ranges, with top categories and income vs expenses.
- **Insights:** rule-based messages like "Food spending increased by 24% compared with the previous month".
- **Currency display:** amounts are recorded in rupees and can be shown in USD, EUR or GBP using live exchange rates.
- Works on desktop and mobile, and can be used with a keyboard.

## Tech stack

- **Angular 21:** standalone components, signals, zoneless change detection, new control flow (`@if`, `@for`)
- **RxJS** for HTTP calls, debounced inputs and bulk requests
- **Reactive Forms** with custom validators
- **Angular CDK** for accessible dialogs
- **Chart.js** for charts
- **SCSS** for styling
- **Vitest** for tests
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
│   ├── finance/           calculations: totals, budgets, trends, insights, filters, CSV
│   ├── services/          settings, currency conversion, notifications
│   ├── interceptors/      turns HTTP errors into readable messages
│   └── utils/             dates, money formatting, URL filters, form validators
├── shared/                table, budget bar, charts, dialogs, pipes
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
3. Add a resource called `budgets` with: `categoryId` (String), `month` (Number), `year` (Number), `limit` (Number), `createdAt` (String), `updatedAt` (String).
4. Put your project URL (for example `https://abc123.mockapi.io/api/v1`) into `MOCKAPI_BASE_URL` in `src/app/core/config.ts`.
5. Start the app and go to **Settings → Load demo data**.

The demo data adds 72 transactions and 19 budgets over the last six months, based on today's date. **Settings → Delete all data** removes everything again.

## Tests

```bash
npm test
```

The tests focus on the logic where a mistake would show wrong numbers:

- budget status thresholds and money calculations
- savings rate, monthly trends and insights
- filtering, sorting, pagination and CSV export
- the data store (loading, adding, deleting, duplicate budgets) using a fake HTTP backend
- currency conversion
- the transaction form, the transaction table, and loading, error and empty states

## Deployment

The app is deployed on Vercel. Build it locally with:

```bash
npm run build
```

The output goes to `dist/budgetflow/browser`. `vercel.json` sends all routes to `index.html`, so refreshing a page like `/transactions` doesn't give a 404.

## Some decisions I made

- **Money in paise.** JavaScript can't add decimals exactly (`0.1 + 0.2` isn't `0.3`), so all sums are done in whole paise and converted back to rupees at the end.
- **Dates as `YYYY-MM-DD` strings.** A transaction happens on a day, not at a specific time. Keeping dates as strings avoids them shifting by a day in different timezones.
- **Categories in code.** MockAPI's free plan only allows two resources, and categories don't change, so they're a fixed list with ids like `food` and `salary`.
- **Validation in the app.** MockAPI accepts any data, so the app checks amounts, dates and categories, allows only one budget per category per month, and ignores invalid records it gets back.
- **Bulk operations one at a time.** MockAPI can lose changes when several requests arrive at once, so loading or deleting demo data sends requests one by one and reloads the data afterwards.

## Limitations

- There's no login. Anyone with the MockAPI URL can see and change the data, so only use demo data.
- Validation only happens in the browser.
- MockAPI's free plan stores up to 100 records per resource.
- All transactions are loaded at once. That's fine for a few hundred, but a large dataset would need a real backend.

## Ideas for later

- A real backend with login (for example NestJS and PostgreSQL)
- Recurring transactions
- Copying last month's budgets in one click
- Adding and editing categories
- Moving the forms to Angular Signal Forms
- End-to-end tests with Playwright
