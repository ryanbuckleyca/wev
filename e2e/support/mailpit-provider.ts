/**
 * Mailpit email provider for local E2E testing
 * Mailpit runs locally and provides an API to fetch emails
 */

import type { EmailProvider, InboxRef } from './email-provider';

const MAILPIT_API_URL = process.env.MAILPIT_API_URL || 'http://localhost:8025';

function normalizeEmailText(text: string): string {
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

async function fetchMailpitMessages(toEmail: string, since?: Date): Promise<any[]> {
  const sinceParam = since ? `&since=${since.toISOString()}` : '';
  const response = await fetch(`${MAILPIT_API_URL}/api/v1/messages?limit=50${sinceParam}`);
  
  if (!response.ok) {
    throw new Error(`Mailpit API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const messages = data.messages || [];
  
  // Filter by recipient
  return messages.filter((msg: any) => {
    const to = msg.To || [];
    return to.some((recipient: any) => recipient.Address === toEmail);
  });
}

async function getMessageContent(messageId: string): Promise<string> {
  const response = await fetch(`${MAILPIT_API_URL}/api/v1/message/${messageId}`);
  
  if (!response.ok) {
    throw new Error(`Mailpit API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.HTML || data.Text || '';
}

class MailpitProvider implements EmailProvider {
  private inboxCounter = 0;

  async createInbox(): Promise<InboxRef> {
    // Mailpit doesn't create inboxes - it captures all emails
    // We generate a unique email address that will be captured
    this.inboxCounter++;
    const timestamp = Date.now();
    const emailAddress = `test-${timestamp}-${this.inboxCounter}@localhost`;
    
    return {
      id: emailAddress, // Use email as ID for Mailpit
      emailAddress,
    };
  }

  async waitForEmail(
    inboxId: string,
    linkHint: string,
    timeoutMs: number,
    since?: Date,
  ): Promise<string> {
    const emailAddress = inboxId; // In Mailpit, ID is the email address
    const deadline = Date.now() + timeoutMs;
    const startTime = since || new Date(Date.now() - 60_000);

    while (Date.now() < deadline) {
      try {
        const messages = await fetchMailpitMessages(emailAddress, startTime);

        for (const message of messages) {
          const content = await getMessageContent(message.ID);
          const link = extractMatchingUrl(content, linkHint);
          if (link) {
            return link;
          }
        }
      } catch (error) {
        console.warn('Mailpit fetch error:', error);
      }

      // Wait 2 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(
      `Mailpit: No email with link containing "${linkHint}" found for ${emailAddress} within ${timeoutMs}ms.\n` +
      `Check: (1) your app sent the email, (2) Mailpit is running at ${MAILPIT_API_URL}, (3) the email address is correct.`,
    );
  }
}

export const mailpitProvider = new MailpitProvider();
