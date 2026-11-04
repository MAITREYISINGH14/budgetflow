'use strict';
/**
 * /api/parse-upi-screenshots
 *
 * Reads screenshots of a UPI app's payment history (GPay, PhonePe, Paytm, a bank app)
 * with an AI vision model and returns the rows it finds. The browser never sees the API
 * key, and nothing is stored: images are read once and dropped. The app shows every row
 * for review before anything is saved, and re-validates them all
 * (src/app/core/finance/screenshot-import.ts).
 *
 * Plain CommonJS JavaScript with the classic (req, res) handler on purpose: Vercel runs it
 * as is, with no TypeScript build that could pick up the Angular project's compiler
 * settings. It needs only Node's built-in fetch (Node 18+).
 *
 * Providers, chosen by which key is set (GEMINI_API_KEY wins if both are):
 *   GEMINI_API_KEY      Google Gemini. Free tier with no billing account; on that tier
 *                       Google may use what is sent to improve its products.
 *   GEMINI_MODEL        optional, defaults to gemini-3.5-flash-lite
 *   ANTHROPIC_API_KEY   Anthropic Claude (paid, per use).
 *   ANTHROPIC_MODEL     optional, defaults to claude-haiku-5-5
 *   IMPORT_ACCESS_CODE  optional; when set, POSTs must send it in x-import-code, so
 *                       strangers cannot use your quota or credits.
 *
 * GET  → { provider: "gemini" | "anthropic" | null }  so the app can say where images go
 * POST { today: "YYYY-MM-DD", images: [{ mediaType: "image/jpeg", data: "<base64>" }] }
 *      → { rows: ParsedRow[] }  or  { error: string } with a 4xx/5xx status
 */

const MAX_IMAGES = 5;
/** Vercel caps request bodies at 4.5 MB; the app shrinks screenshots well below this. */
const MAX_TOTAL_BASE64 = 4_000_000;
const MAX_BODY_BYTES = 4_500_000;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const CATEGORY_HINTS = [
  'food',
  'transport',
  'shopping',
  'bills',
  'entertainment',
  'healthcare',
  'education',
  'travel',
  'subscriptions',
  'other-expense',
  'salary',
  'freelance',
  'bonus',
  'investment',
  'other-income',
];

const RULES = `Rules:
- One entry per payment row. Ignore headers, balances, offers, ads, rewards and buttons.
- Mark a row partial=true if it is cut off at the top or bottom edge of the screenshot, or any of its name, amount or date is not fully readable.
- amount: the rupee amount as a plain number without ₹ or commas (₹1,250.50 → 1250.5).
- direction: "debit" for money paid or sent ("Paid to", "Sent to", a minus sign, a red amount), "credit" for money received ("Received from", "Refund", a plus sign, a green amount).
- status: "success" unless the row says failed, declined, pending, processing, refunded or reversed.
- dateText: the date exactly as shown for that row, or under the day heading it sits beneath ("Today", "Yesterday", "Mon", "12 Oct").
- date: your best ISO date (YYYY-MM-DD) for the row, using today's date given by the user. If no year is shown, use the most recent such date that is not after today. Use null if you cannot tell.
- name: the merchant or person as shown, at most 60 characters. Never include UPI IDs (anything with @), phone numbers, account or card numbers, or transaction IDs.
- categoryHint: the best fit from this list: ${CATEGORY_HINTS.join(', ')}. Use an income category only for credits. Use other-expense or other-income for payments to or from people.
- If a screenshot is not a UPI payment history, record no rows for it.`;

const INTRO =
  'You read screenshots of payment history lists from Indian UPI apps (Google Pay, PhonePe, Paytm, BHIM, bank apps) and record every payment row';
const CLAUDE_PROMPT = `${INTRO} with the record_transactions tool.\n\n${RULES}`;
const GEMINI_PROMPT = `${INTRO}.\n\n${RULES}`;

const ROW_FIELDS = ['image', 'name', 'amount', 'direction', 'status', 'dateText', 'date', 'partial', 'categoryHint'];

const TOOL = {
  name: 'record_transactions',
  description: 'Record every payment row found in the screenshots.',
  input_schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            image: { type: 'integer', description: 'Index of the screenshot (0-based) the row is in.' },
            name: { type: 'string' },
            amount: { type: 'number' },
            direction: { type: 'string', enum: ['debit', 'credit'] },
            status: { type: 'string', enum: ['success', 'failed', 'pending', 'refunded'] },
            dateText: { type: 'string' },
            date: { type: ['string', 'null'] },
            partial: { type: 'boolean' },
            categoryHint: { type: 'string', enum: CATEGORY_HINTS },
          },
          required: ROW_FIELDS,
        },
      },
    },
    required: ['rows'],
  },
};

/** The same rows as TOOL, in the schema format Gemini's structured output takes. */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          image: { type: 'INTEGER' },
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          direction: { type: 'STRING', enum: ['debit', 'credit'] },
          status: { type: 'STRING', enum: ['success', 'failed', 'pending', 'refunded'] },
          dateText: { type: 'STRING' },
          date: { type: 'STRING', nullable: true },
          partial: { type: 'BOOLEAN' },
          categoryHint: { type: 'STRING', enum: CATEGORY_HINTS },
        },
        required: ROW_FIELDS,
      },
    },
  },
  required: ['rows'],
};

function provider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** A request header as one trimmed string ('' when missing). */
function header(req, name) {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.split(',')[0].trim() : '';
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Only the app's own pages may call this, so the endpoint cannot be used from other sites. */
function sameOrigin(req) {
  const origin = header(req, 'origin');
  if (!origin) return true; // same-origin fetches from some browsers omit Origin on POST
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The JSON body: Vercel may have parsed it already (req.body); otherwise read the stream. */
async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** The checked request, or a message saying what is wrong with it. */
function readBody(raw) {
  if (!raw || typeof raw !== 'object') return 'Send JSON with today and images.';
  const today = typeof raw.today === 'string' ? raw.today : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'today must be a YYYY-MM-DD date.';
  const images = Array.isArray(raw.images) ? raw.images : [];
  if (images.length === 0) return 'Add at least one screenshot.';
  if (images.length > MAX_IMAGES) return `Send at most ${MAX_IMAGES} screenshots at a time.`;
  let total = 0;
  const clean = [];
  for (const image of images) {
    const item = image && typeof image === 'object' ? image : {};
    const mediaType = String(item.mediaType ?? '');
    const data = String(item.data ?? '');
    if (!MEDIA_TYPES.includes(mediaType) || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return 'Each screenshot must be a JPEG, PNG or WebP image.';
    }
    total += data.length;
    clean.push({ mediaType, data });
  }
  if (total > MAX_TOTAL_BASE64) return 'The screenshots are too large. Try fewer at a time.';
  return { today, images: clean };
}

/** A provider failure with a message written for people. */
class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function failure(status, quotaMessage) {
  if (status === 429) return new ProviderError(429, quotaMessage);
  if (status === 401 || status === 403) {
    return new ProviderError(502, 'The AI service rejected the API key. Check it in Vercel.');
  }
  if (status === 404) {
    return new ProviderError(502, 'The AI model is not available to this key. Check the model setting.');
  }
  return new ProviderError(502, 'The screenshots could not be read. Try again in a moment.');
}

async function readWithClaude({ today, images }) {
  const content = [
    ...images.flatMap((image, index) => [
      { type: 'text', text: `Screenshot ${index}:` },
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
    ]),
    { type: 'text', text: `Today is ${today}. Record every payment row in these screenshots.` },
  ];
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL,
      max_tokens: 4096,
      system: CLAUDE_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!response.ok)
    throw failure(response.status, 'Too many screenshots in a short time. Wait a minute and try again.');
  const data = await response.json();
  const block = (data.content || []).find((c) => c.type === 'tool_use' && c.name === TOOL.name);
  const rows = block && block.input && block.input.rows;
  return Array.isArray(rows) ? rows : [];
}

async function readWithGemini({ today, images }) {
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const parts = [
    ...images.flatMap((image, index) => [
      { text: `Screenshot ${index}:` },
      { inline_data: { mime_type: image.mediaType, data: image.data } },
    ]),
    { text: `Today is ${today}. Record every payment row in these screenshots.` },
  ];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GEMINI_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 },
      }),
    },
  );
  if (!response.ok) {
    // Gemini answers 400 (not 401) for a bad key.
    if (response.status === 400 && (await response.text()).includes('API key')) throw failure(401, '');
    throw failure(
      response.status,
      'The free AI quota is used up for now. Wait a minute (or until tomorrow) and try again.',
    );
  }
  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  const text = ((candidate && candidate.content && candidate.content.parts) || []).map((p) => p.text || '').join('');
  try {
    const rows = JSON.parse(text).rows;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      send(res, 200, { provider: provider() });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'GET, POST');
      send(res, 405, { error: 'Method not allowed.' });
      return;
    }

    const chosen = provider();
    if (!chosen) return send(res, 503, { error: 'Screenshot import is not set up on this deployment.' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Not allowed.' });
    const accessCode = process.env.IMPORT_ACCESS_CODE;
    if (accessCode && header(req, 'x-import-code') !== accessCode) {
      return send(res, 401, { error: 'Enter the import access code in Settings to use screenshot import.' });
    }

    let parsed;
    try {
      parsed = readBody(await readJson(req));
    } catch {
      parsed = 'Send JSON with today and images.';
    }
    if (typeof parsed === 'string') return send(res, 400, { error: parsed });

    try {
      const rows = chosen === 'gemini' ? await readWithGemini(parsed) : await readWithClaude(parsed);
      send(res, 200, { rows });
    } catch (error) {
      if (error instanceof ProviderError) return send(res, error.status, { error: error.message });
      send(res, 502, { error: 'Could not reach the screenshot reader. Try again in a moment.' });
    }
  } catch (error) {
    // Last resort: never fall through to the platform's blank error page. The details go
    // to the deployment's logs (never the API key, which is not part of any error here).
    console.error('parse-upi-screenshots failed:', error);
    if (!res.headersSent) send(res, 500, { error: 'Screenshot import hit an unexpected error. Try again.' });
  }
}

module.exports = handler;
