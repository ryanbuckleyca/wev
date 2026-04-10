import { MailSlurp } from 'mailslurp-client';

export interface InboxRef {
  id: string;
  emailAddress: string;
}

const E2E_INBOX_TAG = 'wev-e2e-auth';
const INBOX_QUOTA_ERROR_CODE = 'W_429_SUBSCRIPTION_FREE_LIMIT';

/**
 * Manages MailSlurp inbox lifecycle with pooling and quota handling.
 */
export class InboxManager {
  private pooledInboxIndex = 0;
  private discoveredInboxIds: string[] | null = null;

  constructor(private readonly mailslurp: MailSlurp) {}

  /**
   * Get or create an inbox for testing.
   * Uses pooled inboxes when available to avoid quota limits.
   */
  async getOrCreateInbox(): Promise<InboxRef> {
    const pooledInboxes = await this.loadPooledInboxes();
    
    if (pooledInboxes.length > 0) {
      return this.getPooledInbox(pooledInboxes);
    }

    return this.createNewInbox();
  }

  /**
   * Load existing inboxes tagged for E2E testing.
   */
  private async loadPooledInboxes(): Promise<string[]> {
    if (this.discoveredInboxIds) {
      return this.discoveredInboxIds;
    }

    const now = Date.now();
    const allInboxes = await this.mailslurp.getInboxes();
    
    const validInboxes = allInboxes
      .filter(inbox => this.isValidE2EInbox(inbox, now))
      .map(inbox => inbox.id);

    this.discoveredInboxIds = validInboxes;
    return validInboxes;
  }

  /**
   * Check if inbox is valid for E2E testing (not expired, has correct tag).
   */
  private isValidE2EInbox(inbox: { expiresAt?: string; tags?: string[] }, now: number): boolean {
    const expiresAtMs = inbox.expiresAt 
      ? new Date(inbox.expiresAt).getTime() 
      : Number.POSITIVE_INFINITY;
    
    return expiresAtMs > now && (inbox.tags ?? []).includes(E2E_INBOX_TAG);
  }

  /**
   * Get a pooled inbox using round-robin selection.
   */
  private async getPooledInbox(pooledInboxIds: string[]): Promise<InboxRef> {
    const inboxId = pooledInboxIds[this.pooledInboxIndex % pooledInboxIds.length];
    this.pooledInboxIndex += 1;
    
    return this.prepareInbox(inboxId);
  }

  /**
   * Prepare an inbox for use by emptying it.
   */
  private async prepareInbox(inboxId: string): Promise<InboxRef> {
    await this.mailslurp.emptyInbox(inboxId);
    const inbox = await this.mailslurp.getInbox(inboxId);

    if (!inbox.id || !inbox.emailAddress) {
      throw new Error(`MailSlurp inbox "${inboxId}" is missing id or emailAddress`);
    }

    return { id: inbox.id, emailAddress: inbox.emailAddress };
  }

  /**
   * Create a new inbox when pooled inboxes are unavailable.
   */
  private async createNewInbox(): Promise<InboxRef> {
    try {
      const inbox = await this.mailslurp.createInboxWithOptions({
        name: E2E_INBOX_TAG,
        tags: [E2E_INBOX_TAG],
      });

      if (!inbox.id || !inbox.emailAddress) {
        throw new Error('MailSlurp returned an inbox without id or emailAddress');
      }

      return { id: inbox.id, emailAddress: inbox.emailAddress };
    } catch (error) {
      return this.handleInboxCreationError(error);
    }
  }

  /**
   * Handle inbox creation errors, with fallback to existing inboxes.
   */
  private async handleInboxCreationError(error: unknown): Promise<InboxRef> {
    if (!this.isQuotaExceededError(error)) {
      throw error;
    }

    // Quota exceeded - try to use any existing inbox
    const fallbackInboxes = await this.mailslurp.getInboxes();
    const fallbackIds = fallbackInboxes
      .filter(inbox => !!inbox.id)
      .map(inbox => inbox.id);

    if (fallbackIds.length > 0) {
      return this.getPooledInbox(fallbackIds);
    }

    throw new Error(
      `MailSlurp create inbox quota exceeded and no existing inboxes were found. ` +
      `Create at least one inbox tagged "${E2E_INBOX_TAG}" in app.mailslurp.com.`
    );
  }

  /**
   * Check if error is due to inbox creation quota being exceeded.
   */
  private isQuotaExceededError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'errorCode' in error &&
      (error as { errorCode?: string }).errorCode === INBOX_QUOTA_ERROR_CODE
    );
  }
}
