import { MailSlurp } from 'mailslurp-client';
import { InboxManager, type InboxRef } from './inbox-manager';
import { EmailWaiter } from './email-waiter';

/**
 * Factory for creating MailSlurp client.
 */
function createMailSlurpClient(): MailSlurp {
  const apiKey = process.env.MAILSLURP_API_KEY?.trim();
  
  if (!apiKey) {
    throw new Error('Missing required e2e environment variable: MAILSLURP_API_KEY');
  }

  return new MailSlurp({ apiKey });
}

// Singleton instances
let inboxManager: InboxManager | null = null;
let emailWaiter: EmailWaiter | null = null;

/**
 * Get or create the inbox manager instance.
 */
function getInboxManager(): InboxManager {
  if (!inboxManager) {
    const client = createMailSlurpClient();
    inboxManager = new InboxManager(client);
  }
  return inboxManager;
}

/**
 * Get or create the email waiter instance.
 */
function getEmailWaiter(): EmailWaiter {
  if (!emailWaiter) {
    const client = createMailSlurpClient();
    emailWaiter = new EmailWaiter(client);
  }
  return emailWaiter;
}

/**
 * Create an ephemeral inbox for testing.
 * Uses pooled inboxes when available to avoid quota limits.
 */
export async function createEphemeralInbox(): Promise<InboxRef> {
  const manager = getInboxManager();
  return manager.getOrCreateInbox();
}

/**
 * Wait for an email containing a link that matches the hint.
 * 
 * @param inboxId - The inbox ID to monitor
 * @param linkHint - A substring to search for in URLs (e.g., '/auth/callback')
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 120000)
 * @param sinceOverride - Only check emails received after this date
 * @returns The matching URL
 */
export async function waitForInboxLink(
  inboxId: string,
  linkHint: string,
  timeoutMs = 120_000,
  sinceOverride?: Date
): Promise<string> {
  const waiter = getEmailWaiter();
  return waiter.waitForLink(inboxId, linkHint, {
    timeoutMs,
    since: sinceOverride,
  });
}
