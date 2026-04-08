import { MailSlurp } from 'mailslurp-client';

export type InboxRef = {
  id: string;
  emailAddress: string;
};

const pooledInboxIds = (process.env.MAILSLURP_INBOX_IDS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
let pooledInboxIndex = 0;

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

  if (pooledInboxIds.length > 0) {
    const inboxId = pooledInboxIds[pooledInboxIndex % pooledInboxIds.length];
    pooledInboxIndex += 1;
    await mailslurp.emptyInbox(inboxId);
    const inbox = await mailslurp.getInbox(inboxId);

    if (!inbox.id || !inbox.emailAddress) {
      throw new Error(`MailSlurp inbox "${inboxId}" is missing id or emailAddress`);
    }

    return { id: inbox.id, emailAddress: inbox.emailAddress };
  }

  let inbox;
  try {
    inbox = await mailslurp.createInbox();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'errorCode' in error &&
      (error as { errorCode?: string }).errorCode === 'W_429_SUBSCRIPTION_FREE_LIMIT'
    ) {
      throw new Error(
        'MailSlurp create inbox quota exceeded. Set MAILSLURP_INBOX_IDS to comma-separated reusable inbox IDs.',
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
): Promise<string> {
  const mailslurp = buildMailSlurpClient();
  const since = new Date(Date.now() - 60_000);
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
  if (lastTimeoutError) throw lastTimeoutError;
  throw new Error(`No link containing "${linkHint}" found in MailSlurp messages`);
}
