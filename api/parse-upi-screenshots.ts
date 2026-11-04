/**
 * /api/parse-upi-screenshots
 *
 * Reads screenshots of a UPI app's payment history (GPay, PhonePe, Paytm, a bank app)
 * with an AI vision model and returns the rows it finds. The browser never sees the API
 * key, and nothing is stored: images are read once and dropped. The app shows every row
 * for review before anything is saved, and re-validates them all
 * (src/app/core/finance/screenshot-import.ts).
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

const SYSTEM_PROMPT = `You read screenshots of payment history lists from Indian UPI apps (Google Pay, PhonePe, Paytm, BHIM, bank apps) and record every payment row with the record_transactions tool.

Rules:
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
          required: ['image', 'name', 'amount', 'direction', 'status', 'dateText', 'date', 'partial', 'categoryHint'],
        },
      },
    },
    required: ['rows'],
  },
};

/** Reads an environment variable without depending on Node's type definitions. */
function env(name: string): string | undefined {
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[name];
}

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
        required: ['image', 'name', 'amount', 'direction', 'status', 'dateText', 'date', 'partial', 'categoryHint'],
      },
    },
  },
  required: ['rows'],
};

type Provider = 'gemini' | 'anthropic';

function provider(): Provider | null {
  if (env('GEMINI_API_KEY')) return 'gemini';
  if (env('ANTHROPIC_API_KEY')) return 'anthropic';
  return null;
}

interface ImageInput {
  mediaType: string;
  data: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Only the app's own pages may call this, so the endpoint cannot be used from other sites. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches from some browsers omit Origin on POST
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function readBody(raw: unknown): { today: string; images: ImageInput[] } | string {
  if (!raw || typeof raw !== 'object') return 'Send JSON with today and images.';
  const body = raw as Record<string, unknown>;
  const today = typeof body['today'] === 'string' ? body['today'] : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'today must be a YYYY-MM-DD date.';
  const images = Array.isArray(body['images']) ? body['images'] : [];
  if (images.length === 0) return 'Add at least one screenshot.';
  if (images.length > MAX_IMAGES) return `Send at most ${MAX_IMAGES} screenshots at a time.`;
  let total = 0;
  const clean: ImageInput[] = [];
  for (const image of images) {
    const item = image && typeof image === 'object' ? (image as Record<string, unknown>) : {};
    const mediaType = String(item['mediaType'] ?? '');
    const data = String(item['data'] ?? '');
    if (!MEDIA_TYPES.includes(mediaType) || !/^[A-Za-z0-9+/=]+$/.test(data))
      return 'Each screenshot must be a JPEG, PNG or WebP image.';
    total += data.length;
    clean.push({ mediaType, data });
  }
  if (total > MAX_TOTAL_BASE64) return 'The screenshots are too large. Try fewer at a time.';
  return { today, images: clean };
}

/** Which provider is set up, so the app can tell people where their screenshots go. */
export function GET(): Response {
  return json({ provider: provider() });
}

export async function POST(request: Request): Promise<Response> {
  const chosen = provider();
  if (!chosen) return json({ error: 'Screenshot import is not set up on this deployment.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Not allowed.' }, 403);

  const accessCode = env('IMPORT_ACCESS_CODE');
  if (accessCode && request.headers.get('x-import-code') !== accessCode) {
    return json({ error: 'Enter the import access code in Settings to use screenshot import.' }, 401);
  }

  let parsed: ReturnType<typeof readBody>;
  try {
    parsed = readBody(await request.json());
  } catch {
    parsed = 'Send JSON with today and images.';
  }
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  try {
    const rows = chosen === 'gemini' ? await readWithGemini(parsed) : await readWithClaude(parsed);
    return json({ rows });
  } catch (error) {
    if (error instanceof ProviderError) return json({ error: error.message }, error.status);
    return json({ error: 'Could not reach the screenshot reader. Try again in a moment.' }, 502);
  }
}

/** A provider failure with a message written for people. */
class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function failure(status: number, quotaMessage: string): ProviderError {
  if (status === 429) return new ProviderError(429, quotaMessage);
  if (status === 401 || status === 403)
    return new ProviderError(502, 'The AI service rejected the API key. Check it in Vercel.');
  if (status === 404)
    return new ProviderError(502, 'The AI model is not available to this key. Check the model setting.');
  return new ProviderError(502, 'The screenshots could not be read. Try again in a moment.');
}

async function readWithClaude({ today, images }: { today: string; images: ImageInput[] }): Promise<unknown[]> {
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
      'x-api-key': env('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env('ANTHROPIC_MODEL') || DEFAULT_CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!response.ok)
    throw failure(response.status, 'Too many screenshots in a short time. Wait a minute and try again.');
  const data = (await response.json()) as { content?: { type: string; name?: string; input?: { rows?: unknown } }[] };
  const block = data.content?.find((c) => c.type === 'tool_use' && c.name === TOOL.name);
  return Array.isArray(block?.input?.rows) ? block.input.rows : [];
}

async function readWithGemini({ today, images }: { today: string; images: ImageInput[] }): Promise<unknown[]> {
  const model = env('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
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
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') ?? '' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT.replace(' with the record_transactions tool', '') }] },
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
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    const rows = (JSON.parse(text) as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
