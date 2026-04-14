/**
 * Email testing utilities for E2E tests.
 * Provides inbox management and email link extraction.
 */

export { createEphemeralInbox, waitForInboxLink } from './mailslurp-client';
export type { InboxRef } from './inbox-manager';
export { EmailUrlExtractor } from './url-extractor';
export { EmailWaiter } from './email-waiter';
export { InboxManager } from './inbox-manager';
