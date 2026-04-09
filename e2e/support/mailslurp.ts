import { MailSlurp } from 'mailslurp-client';

export type InboxRef = {
  id: string;
  emailAddress: string;
};

const E2E_INBOX_TAG = 'wev-e2e-auth';
let pooledInboxIndex = 0;
let discoveredInboxIds: string[] | null = null;

function getMailSlurpApiKey(): string {
  const key = process.env.MAILSLURP_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing required e2e environment variable: MAILSLURP_API_KEY');
  }
  return key;
}

function normalizeEmailText(text: string): string {
  // Quoted-printable emails may soft-wrap long links as `=\n`.
  return text.replace(/=\r?\n/g, '');
}

function normalizeExtractedUrl(url: string): string {
  return url
    .replaceAll('&amp;', '&')
    .replaceAll('=\r\n', '')
    .replaceAll('=\n', '')
    .replace(/[.,;!?)]$/, '');
}

function extractMatchingUrl(text: string, linkHint: string): string | null {
  const normalizedText = normalizeEmailText(text);
  const hrefMatches = Array.from(normalizedText.matchAll(/href=(?:"|')([^"']+)(?:"|')/gi)).map(
    (match) => match[1],
  );
  const textMatches = normalizedText.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const matches = [...hrefMatches, ...textMatches].map(normalizeExtractedUrl);
  const normalizedHint = linkHint.toLowerCase();
  const candidates = matches.filter((candidate) => candidate.toLowerCase().includes(normalizedHint));
  if (candidates.length === 0) return null;

  // For auth email confirmation we need the signed verify URL, not a plain callback URL.
  const preferred =
    normalizedHint.includes('/auth/callback')
      ? candidates.find((candidate) => {
          const lower = candidate.toLowerCase();
          return (
            lower.includes('/auth/v1/verify') &&
            lower.includes('token=') &&
            lower.includes('redirect_to=')
          );
        })
      : null;

  const hit = preferred ?? [...candidates].sort((a, b) => b.length - a.length)[0];
  if (!hit) return null;
  return hit;
}

function buildMailSlurpClient(): MailSlurp {
  return new MailSlurp({ apiKey: getMailSlurpApiKey() });
}

async function loadDiscoveredInboxIds(mailslurp: MailSlurp): Promise<string[]> {
  if (discoveredInboxIds) return discoveredInboxIds;

  const now = Date.now();
  const inboxes = await mailslurp.getInboxes();
  const tagged = inboxes
    .filter((inbox) => {
      const expiresAtMs = inbox.expiresAt ? new Date(inbox.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return expiresAtMs > now && (inbox.tags ?? []).includes(E2E_INBOX_TAG);
    })
    .map((inbox) => inbox.id);

  discoveredInboxIds = tagged;
  return discoveredInboxIds;
}

async function getInboxRefById(mailslurp: MailSlurp, inboxId: string): Promise<InboxRef> {
  await mailslurp.emptyInbox(inboxId);
  const inbox = await mailslurp.getInbox(inboxId);

  if (!inbox.id || !inbox.emailAddress) {
    throw new Error(`MailSlurp inbox "${inboxId}" is missing id or emailAddress`);
  }
  return { id: inbox.id, emailAddress: inbox.emailAddress };
}

async function buildTimeoutError(inboxId: string, since?: Date): Promise<Error> {
  // Check for missed emails — MailSlurp creates these when the account has
  // exceeded its daily receive quota and cannot persist incoming emails.
  try {
    const apiKey = getMailSlurpApiKey();
    // Only check for missed emails since the test started, not the full 24h window
    const quotaSince = since ?? new Date(Date.now() - 60 * 60 * 1000); // Default to 1 hour
    const res = await fetch(
      `https://javascript.api.mailslurp.com/missed-emails?inboxId=${inboxId}&page=0&size=10`,
      { headers: { 'x-api-key': apiKey } },
    );
    if (res.ok) {
      const data = await res.json() as { content?: { subject?: string; createdAt?: string }[]; numberOfElements?: number };
      const missed = (data.content ?? []).filter((m) => {
        if (!m.createdAt) return true;
        return new Date(m.createdAt) >= quotaSince;
      });
      if (missed.length > 0) {
        const subjects = missed.map((m) => `"${m.subject ?? '(no subject)'}" at ${m.createdAt}`).join(', ');
        return new Error(
          `MailSlurp daily receive quota exceeded — emails arrived but were not stored.\n` +
          `Missed emails since test started: ${subjects}\n` +
          `Fix: renew your daily receive credits at app.mailslurp.com or switch to a different MAILSLURP_API_KEY.`,
        );
      }
    }
  } catch {
    // ignore probe failures, fall through to generic error
  }

  return new Error(
    `MailSlurp waitForLatestEmail timed out — no email arrived in the inbox.\n` +
    `Check: (1) your app actually sent the email, (2) your MailSlurp daily receive limit (app.mailslurp.com/usage), (3) the inbox ID is correct.`,
  );
}

function isMailWaitTimeout(error: unknown): boolean {
  if (error instanceof Response) return error.status === 408;
  if (typeof error !== 'object' || error === null) return false;
  const maybeStatus = (error as { status?: unknown }).status;
  return maybeStatus === 408;
}

async function extractLinkFromRecentEmails(
  mailslurp: MailSlurp,
  inboxId: string,
  linkHint: string,
  since: Date,
): Promise<string | null> {
  const previews = await mailslurp.getEmails(inboxId, {
    limit: 20,
    since,
    sort: 'DESC',
  });

  for (const preview of previews) {
    if (!preview.id) continue;
    const email = await mailslurp.getEmail(preview.id);
    const candidates = [email.body ?? '', email.bodyExcerpt ?? '', email.subject ?? ''];
    for (const candidate of candidates) {
      const hit = extractMatchingUrl(candidate, linkHint);
      if (hit) return hit;
    }
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createEphemeralInbox(): Promise<InboxRef> {
  const mailslurp = buildMailSlurpClient();

  const discoveredIds = await loadDiscoveredInboxIds(mailslurp);
  if (discoveredIds.length > 0) {
    const inboxId = discoveredIds[pooledInboxIndex % discoveredIds.length];
    pooledInboxIndex += 1;
    return getInboxRefById(mailslurp, inboxId);
  }

  let inbox;
  try {
    inbox = await mailslurp.createInboxWithOptions({
      name: E2E_INBOX_TAG,
      tags: [E2E_INBOX_TAG],
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'errorCode' in error &&
      (error as { errorCode?: string }).errorCode === 'W_429_SUBSCRIPTION_FREE_LIMIT'
    ) {
      const fallbackIds = (await mailslurp.getInboxes())
        .filter((candidate) => !!candidate.id)
        .map((candidate) => candidate.id);
      if (fallbackIds.length > 0) {
        const inboxId = fallbackIds[pooledInboxIndex % fallbackIds.length];
        pooledInboxIndex += 1;
        return getInboxRefById(mailslurp, inboxId);
      }
      throw new Error(
        'MailSlurp create inbox quota exceeded and no existing inboxes were found. Create at least one inbox tagged "wev-e2e-auth" in app.mailslurp.com.',
      );
    }
    throw error;
  }

  if (!inbox.id || !inbox.emailAddress) {
    throw new Error('MailSlurp returned an inbox without id or emailAddress');
  }

  return { id: inbox.id, emailAddress: inbox.emailAddress };
}

export async function waitForInboxLink(
  inboxId: string,
  linkHint: string,
  timeoutMs = 120_000,
  sinceOverride?: Date,
): Promise<string> {
  const mailslurp = buildMailSlurpClient();
  const since = sinceOverride ?? new Date(Date.now() - 120_000);
  const deadline = Date.now() + timeoutMs;
  let lastTimeoutError: unknown = null;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const waitWindowMs = Math.min(remaining, 45_000);
    let email;
    try {
      email = await mailslurp.waitController.waitForLatestEmail({
        inboxId,
        timeout: waitWindowMs,
        unreadOnly: false,
        since,
      });
    } catch (error) {
      if (!isMailWaitTimeout(error)) throw error;
      lastTimeoutError = error;
      const recovered = await extractLinkFromRecentEmails(mailslurp, inboxId, linkHint, since);
      if (recovered) return recovered;
      if (deadline - Date.now() > 0) {
        await delay(Math.min(5_000, deadline - Date.now()));
      }
      continue;
    }

    const candidates = [email.body ?? '', email.bodyExcerpt ?? '', email.subject ?? ''];
    for (const candidate of candidates) {
      const hit = extractMatchingUrl(candidate, linkHint);
      if (hit) return hit;
    }

    const recovered = await extractLinkFromRecentEmails(mailslurp, inboxId, linkHint, since);
    if (recovered) return recovered;
  }

  const recovered = await extractLinkFromRecentEmails(mailslurp, inboxId, linkHint, since);
  if (recovered) return recovered;
  if (lastTimeoutError) {
    throw await buildTimeoutError(inboxId, since);
  }
  throw new Error(`No link containing "${linkHint}" found in MailSlurp messages`);
}
