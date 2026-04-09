/**
 * Email provider abstraction for E2E tests
 * Supports both MailSlurp (for staging) and Mailpit (for local development)
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
  const provider = process.env.E2E_EMAIL_PROVIDER?.toLowerCase() || 'mailpit';
  
  switch (provider) {
    case 'mailslurp':
      return require('./mailslurp-provider').mailslurpProvider;
    case 'mailpit':
      return require('./mailpit-provider').mailpitProvider;
    default:
      throw new Error(`Unknown email provider: ${provider}. Use 'mailslurp' or 'mailpit'`);
  }
}
