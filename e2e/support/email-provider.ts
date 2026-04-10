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
  cleanup?(emails: string[]): Promise<void>;
}

export function getEmailProvider(): EmailProvider {
  return require('./mailslurp-provider').mailslurpProvider;
}
