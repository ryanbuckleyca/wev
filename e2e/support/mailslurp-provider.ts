/**
 * MailSlurp email provider for staging E2E testing
 * Wraps the existing mailslurp.ts implementation
 */

import type { EmailProvider, InboxRef } from './email-provider';
import { createEphemeralInbox, waitForInboxLink } from './mailslurp';

class MailSlurpProvider implements EmailProvider {
  async createInbox(): Promise<InboxRef> {
    return createEphemeralInbox();
  }

  async waitForEmail(
    inboxId: string,
    linkHint: string,
    timeoutMs: number,
    since?: Date,
  ): Promise<string> {
    return waitForInboxLink(inboxId, linkHint, timeoutMs, since);
  }
}

export const mailslurpProvider = new MailSlurpProvider();
