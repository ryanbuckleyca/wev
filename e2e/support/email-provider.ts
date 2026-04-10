/**
 * Email provider abstraction for E2E tests
 * Uses MailSlurp for email testing
 */

export type InboxRef = {
  id: string;
  emailAddress: string;
};

export interface EmailProvider {
  createInbox(): Promise<InboxRef>;
  waitForEmail(inboxId: string, linkHint: string, timeoutMs: number, since?: Date): Promise<string>;
}

export function getEmailProvider(): EmailProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./mailslurp-provider').mailslurpProvider;
}
