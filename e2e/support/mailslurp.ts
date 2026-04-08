import { MailSlurp } from 'mailslurp-client';

type InboxRef = {
  id: string;
  emailAddress: string;
};

function getMailSlurpApiKey(): string {
  const key = process.env.MAILSLURP_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing required e2e environment variable: MAILSLURP_API_KEY');
  }
  return key;
}

function extractMatchingUrl(text: string, linkHint: string): string | null {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const normalizedHint = linkHint.toLowerCase();
  const hit = matches.find((candidate) => candidate.toLowerCase().includes(normalizedHint));
  if (!hit) return null;
  // HTML email bodies often encode query separators as `&amp;`.
  return hit.replaceAll('&amp;', '&');
}

function buildMailSlurpClient(): MailSlurp {
  return new MailSlurp({ apiKey: getMailSlurpApiKey() });
}

export async function createEphemeralInbox(): Promise<InboxRef> {
  const mailslurp = buildMailSlurpClient();
  const inbox = await mailslurp.createInbox();

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
  const email = await mailslurp.waitController.waitForLatestEmail({
    inboxId,
    timeout: timeoutMs,
    unreadOnly: true,
  });

  const candidates = [email.body ?? '', email.bodyExcerpt ?? '', email.subject ?? ''];
  for (const candidate of candidates) {
    const hit = extractMatchingUrl(candidate, linkHint);
    if (hit) return hit;
  }

  throw new Error(`No link containing "${linkHint}" found in latest MailSlurp message`);
}
