import { EmailUrlExtractor } from './url-extractor';
import type { InboxRef } from './inbox-manager';

const DEFAULT_MAILPIT_BASE_URL = 'http://127.0.0.1:54324';

const createdAtByInboxId = new Map<string, Date>();

class NotSupportedEmailApiError extends Error {
  override name = 'NotSupportedEmailApiError';
}

function resolveMailServerBaseUrl(): URL {
  const raw =
    process.env.MAILPIT_BASE_URL?.trim() ||
    process.env.E2E_MAILPIT_BASE_URL?.trim() ||
    DEFAULT_MAILPIT_BASE_URL;

  const url = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);

  // Safety: E2E should only ever hit a local email capture service.
  const host = url.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    throw new Error(
      `Refusing to query non-local email server (${url.hostname}). ` +
        `Set MAILPIT_BASE_URL to a localhost URL or run tests with a local Supabase stack.`
    );
  }

  return url;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function extractMessageId(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const record = message as Record<string, unknown>;

  const id = record.ID ?? record.Id ?? record.id;
  if (typeof id === 'string' && id.trim()) return id.trim();

  return null;
}

function extractMessageTimestampMs(message: unknown): number {
  if (!message || typeof message !== 'object') return 0;
  const record = message as Record<string, unknown>;

  const candidates = [
    record.Created,
    record.created,
    record.CreatedAt,
    record.createdAt,
    record.Date,
    record.date,
    record.Received,
    record.received,
  ];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      // Mailpit may return unix seconds or unix ms. If it's too small, assume seconds.
      return value < 10_000_000_000 ? value * 1000 : value;
    }

    if (typeof value === 'string') {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) return ms;
    }
  }

  return 0;
}

function extractRecipients(message: unknown): string[] {
  if (!message || typeof message !== 'object') return [];
  const record = message as Record<string, unknown>;

  const to = record.To ?? record.to;
  if (typeof to === 'string') {
    return [to];
  }

  if (Array.isArray(to)) {
    const emails: string[] = [];

    for (const entry of to) {
      if (typeof entry === 'string') {
        emails.push(entry);
        continue;
      }

      if (entry && typeof entry === 'object') {
        const r = entry as Record<string, unknown>;
        const address = r.Address ?? r.address ?? r.Email ?? r.email;
        if (typeof address === 'string') emails.push(address);

        const nameAndAddress = r.Name ?? r.name;
        if (typeof nameAndAddress === 'string') emails.push(nameAndAddress);
      }
    }

    return emails;
  }

  return [];
}

function messageMatchesRecipient(message: unknown, emailAddress: string): boolean {
  const target = normalizeEmail(emailAddress);
  return extractRecipients(message)
    .map(normalizeEmail)
    .some((candidate) => candidate.includes(target));
}

async function fetchJson(url: URL): Promise<unknown> {
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Email API request failed (${res.status}) at ${url.pathname}`);
  }
  return res.json();
}

async function fetchText(url: URL): Promise<string> {
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Email API request failed (${res.status}) at ${url.pathname}`);
  }
  return res.text();
}

async function listMailpitMessages(baseUrl: URL): Promise<unknown[]> {
  const url = new URL('/api/v1/messages', baseUrl);
  url.searchParams.set('limit', '50');

  const res = await fetch(url.toString(), { method: 'GET' });

  if (res.status === 404) {
    throw new NotSupportedEmailApiError('Not a Mailpit API');
  }

  if (!res.ok) {
    throw new Error(`Mailpit list messages failed (${res.status})`);
  }

  const json: unknown = await res.json();

  if (Array.isArray(json)) return json;

  if (json && typeof json === 'object') {
    const record = json as Record<string, unknown>;

    const messages = record.messages ?? record.Messages;
    if (Array.isArray(messages)) return messages;
  }

  return [];
}

async function listInbucketMailboxMessages(baseUrl: URL, emailAddress: string): Promise<unknown[]> {
  const localPart = normalizeEmail(emailAddress).split('@')[0];
  const url = new URL(`/api/v1/mailbox/${encodeURIComponent(localPart)}`, baseUrl);

  const res = await fetch(url.toString(), { method: 'GET' });

  if (res.status === 404) {
    throw new NotSupportedEmailApiError('Not an Inbucket API');
  }

  if (!res.ok) {
    throw new Error(`Inbucket list mailbox failed (${res.status})`);
  }

  const json: unknown = await res.json();
  return Array.isArray(json) ? json : [];
}

function extractEmailContentFromJson(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const record = json as Record<string, unknown>;

  const stringKeys = [
    'HTML',
    'Html',
    'html',
    'Text',
    'text',
    'Body',
    'body',
    'Raw',
    'raw',
    'Snippet',
    'snippet',
    'content',
    'Content',
    'message',
    'Message',
  ];

  const parts: string[] = [];

  for (const key of stringKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(value);
    }
  }

  // Some APIs nest bodies under common names.
  const nestedCandidates = [record.data, record.Data, record.email, record.Email];
  for (const nested of nestedCandidates) {
    if (!nested || typeof nested !== 'object') continue;
    const nestedRecord = nested as Record<string, unknown>;
    for (const key of stringKeys) {
      const value = nestedRecord[key];
      if (typeof value === 'string' && value.trim()) {
        parts.push(value);
      }
    }
  }

  return parts.join('\n\n');
}

async function getMailpitMessageContent(baseUrl: URL, messageId: string): Promise<string> {
  const jsonUrl = new URL(`/api/v1/message/${encodeURIComponent(messageId)}`, baseUrl);

  const res = await fetch(jsonUrl.toString(), { method: 'GET' });
  if (res.status === 404) {
    throw new NotSupportedEmailApiError('Mailpit message endpoint missing');
  }

  if (!res.ok) {
    throw new Error(`Mailpit get message failed (${res.status})`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json: unknown = await res.json();
    const content = extractEmailContentFromJson(json);
    if (content.trim()) return content;
  } else {
    const text = await res.text();
    if (text.trim()) return text;
  }

  // Fallback endpoints commonly exposed by Mailpit.
  const htmlUrl = new URL(`/api/v1/message/${encodeURIComponent(messageId)}/html`, baseUrl);
  try {
    const html = await fetchText(htmlUrl);
    if (html.trim()) return html;
  } catch {
    // ignore
  }

  const textUrl = new URL(`/api/v1/message/${encodeURIComponent(messageId)}/text`, baseUrl);
  try {
    const text = await fetchText(textUrl);
    if (text.trim()) return text;
  } catch {
    // ignore
  }

  return '';
}

async function getInbucketMessageContent(
  baseUrl: URL,
  emailAddress: string,
  messageId: string
): Promise<string> {
  const localPart = normalizeEmail(emailAddress).split('@')[0];

  const mailboxUrl = new URL(
    `/api/v1/mailbox/${encodeURIComponent(localPart)}/${encodeURIComponent(messageId)}`,
    baseUrl
  );

  try {
    const json = await fetchJson(mailboxUrl);
    const content = extractEmailContentFromJson(json);
    if (content.trim()) return content;
  } catch {
    // ignore
  }

  const messageUrl = new URL(`/api/v1/message/${encodeURIComponent(messageId)}`, baseUrl);
  try {
    const res = await fetch(messageUrl.toString(), { method: 'GET' });
    if (!res.ok) return '';

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json: unknown = await res.json();
      return extractEmailContentFromJson(json);
    }

    return await res.text();
  } catch {
    return '';
  }
}

export async function createEphemeralInbox(): Promise<InboxRef> {
  const random = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const emailAddress = `wev-e2e-${random}@example.com`;

  createdAtByInboxId.set(emailAddress, new Date());
  return { id: emailAddress, emailAddress };
}

export async function waitForInboxLink(
  inboxId: string,
  linkHint: string,
  timeoutMs = 120_000,
  sinceOverride?: Date
): Promise<string> {
  const baseUrl = resolveMailServerBaseUrl();
  const extractor = new EmailUrlExtractor();

  // For Mailpit/Inbucket, we use the inbox id as an email address.
  const emailAddress = inboxId;

  const since =
    sinceOverride ?? createdAtByInboxId.get(inboxId) ?? new Date(Date.now() - 60_000);
  const deadline = Date.now() + timeoutMs;

  let apiMode: 'mailpit' | 'inbucket' | null = null;

  while (Date.now() < deadline) {
    // Detect API mode once.
    if (!apiMode) {
      try {
        await listMailpitMessages(baseUrl);
        apiMode = 'mailpit';
      } catch (err) {
        if (err instanceof NotSupportedEmailApiError) {
          apiMode = 'inbucket';
        } else {
          throw err;
        }
      }
    }

    let messages: unknown[] = [];

    try {
      if (apiMode === 'mailpit') {
        messages = await listMailpitMessages(baseUrl);
        messages = messages.filter((m) => messageMatchesRecipient(m, emailAddress));
      } else {
        messages = await listInbucketMailboxMessages(baseUrl, emailAddress);
      }
    } catch (err) {
      // If our detection guessed wrong, retry with the other mode.
      if (err instanceof NotSupportedEmailApiError) {
        apiMode = apiMode === 'mailpit' ? 'inbucket' : 'mailpit';
      } else {
        throw err;
      }
    }

    const candidates = messages
      .map((m) => ({
        message: m,
        id: extractMessageId(m),
        createdAtMs: extractMessageTimestampMs(m),
      }))
      .filter((m) => !!m.id)
      .filter((m) => (m.createdAtMs ? m.createdAtMs >= since.getTime() : true))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    for (const candidate of candidates) {
      const messageId = candidate.id!;
      const content =
        apiMode === 'mailpit'
          ? await getMailpitMessageContent(baseUrl, messageId)
          : await getInbucketMessageContent(baseUrl, emailAddress, messageId);

      const link = extractor.extractMatchingUrl(content, linkHint);
      if (link) return link;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(
    `Timed out waiting for an email link containing "${linkHint}" for ${emailAddress}. ` +
      `Is the local Supabase email capture service running at ${baseUrl.origin}?`
  );
}
