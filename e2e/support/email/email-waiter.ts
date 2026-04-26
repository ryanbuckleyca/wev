import { MailSlurp } from "mailslurp-client";
import { EmailUrlExtractor } from "./url-extractor";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_LOOKBACK_MS = 120_000;
const MAX_WAIT_WINDOW_MS = 45_000;
const RETRY_DELAY_MS = 5_000;
const MAX_RECENT_EMAILS = 20;

interface WaitForLinkOptions {
  timeoutMs?: number;
  since?: Date;
}

/**
 * Waits for emails to arrive and extracts links from them.
 */
export class EmailWaiter {
  private readonly urlExtractor = new EmailUrlExtractor();

  constructor(private readonly mailslurp: MailSlurp) {}

  /**
   * Wait for an email containing a link that matches the hint.
   */
  async waitForLink(
    inboxId: string,
    linkHint: string,
    options: WaitForLinkOptions = {},
  ): Promise<string> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const since = options.since ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS);
    const deadline = Date.now() + timeoutMs;

    this.logWaitStart(inboxId, linkHint, since, timeoutMs);

    let lastTimeoutError: unknown = null;

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();

      try {
        const email = await this.waitForNewEmail(inboxId, since, remaining);
        const link = this.extractLinkFromEmail(email, linkHint);

        if (link) {
          console.log(`[MailSlurp] Found matching link in email`);
          return link;
        }
      } catch (error) {
        if (!this.isWaitTimeout(error)) {
          throw error;
        }

        lastTimeoutError = error;
        await this.logTimeoutAndCheckRecent(inboxId, linkHint, since);
      }

      // Check recent emails in case we missed it
      const recovered = await this.searchRecentEmails(inboxId, linkHint, since);
      if (recovered) return recovered;

      // Wait before retrying
      const remainingTime = deadline - Date.now();
      if (remainingTime > 0) {
        await this.delay(Math.min(RETRY_DELAY_MS, remainingTime));
      }
    }

    // Final attempt to find link in recent emails
    const finalRecovered = await this.searchRecentEmails(
      inboxId,
      linkHint,
      since,
    );
    if (finalRecovered) return finalRecovered;

    // All attempts failed
    if (lastTimeoutError) {
      throw await this.createTimeoutError(inboxId, since);
    }

    throw new Error(
      `No link containing "${linkHint}" found in MailSlurp messages`,
    );
  }

  /**
   * Wait for a new email to arrive in the inbox.
   */
  private async waitForNewEmail(
    inboxId: string,
    since: Date,
    remainingMs: number,
  ): Promise<{
    body?: string | null;
    bodyExcerpt?: string | null;
    subject?: string | null;
  }> {
    const waitWindowMs = Math.min(remainingMs, MAX_WAIT_WINDOW_MS);

    return this.mailslurp.waitController.waitForLatestEmail({
      inboxId,
      timeout: waitWindowMs,
      unreadOnly: false,
      since,
    });
  }

  /**
   * Extract link from email content.
   */
  private extractLinkFromEmail(
    email: {
      body?: string | null;
      bodyExcerpt?: string | null;
      subject?: string | null;
    },
    linkHint: string,
  ): string | null {
    const candidates = [
      email.body ?? "",
      email.bodyExcerpt ?? "",
      email.subject ?? "",
    ];

    for (const candidate of candidates) {
      const link = this.urlExtractor.extractMatchingUrl(candidate, linkHint);
      if (link) return link;
    }

    return null;
  }

  /**
   * Search recent emails for a matching link.
   */
  private async searchRecentEmails(
    inboxId: string,
    linkHint: string,
    since: Date,
  ): Promise<string | null> {
    const previews = await this.mailslurp.getEmails(inboxId, {
      limit: MAX_RECENT_EMAILS,
      since,
      sort: "DESC",
    });

    for (const preview of previews) {
      if (!preview.id) continue;

      const email = await this.mailslurp.getEmail(preview.id);
      const link = this.extractLinkFromEmail(email, linkHint);

      if (link) return link;
    }

    return null;
  }

  /**
   * Check if error is a wait timeout (408 status).
   */
  private isWaitTimeout(error: unknown): boolean {
    if (error instanceof Response) {
      return error.status === 408;
    }

    if (typeof error !== "object" || error === null) {
      return false;
    }

    const maybeStatus = (error as { status?: unknown }).status;
    return maybeStatus === 408;
  }

  /**
   * Log timeout and check what emails are in the inbox.
   */
  private async logTimeoutAndCheckRecent(
    inboxId: string,
    linkHint: string,
    since: Date,
  ): Promise<void> {
    const previews = await this.mailslurp.getEmails(inboxId, {
      limit: 10,
      since,
      sort: "DESC",
    });

    console.log(
      `[MailSlurp] Timeout waiting for email. Found ${previews.length} emails since ${since.toISOString()}`,
    );

    previews.forEach((preview, index) => {
      console.log(
        `  ${index + 1}. Subject: "${preview.subject}", To: ${preview.to?.join(", ")}, At: ${preview.createdAt}`,
      );
    });
  }

  /**
   * Create a detailed timeout error with quota information.
   */
  private async createTimeoutError(
    inboxId: string,
    since: Date,
  ): Promise<Error> {
    const quotaError = await this.checkForQuotaExceeded(inboxId, since);
    if (quotaError) return quotaError;

    return new Error(
      `MailSlurp waitForLatestEmail timed out — no email arrived in the inbox.\n` +
        `Check: (1) your app actually sent the email, ` +
        `(2) your MailSlurp daily receive limit (app.mailslurp.com/usage), ` +
        `(3) the inbox ID is correct.`,
    );
  }

  /**
   * Check if MailSlurp quota has been exceeded (emails missed).
   */
  private async checkForQuotaExceeded(
    inboxId: string,
    since: Date,
  ): Promise<Error | null> {
    try {
      const apiKey = this.getApiKey();
      const quotaSince = since;

      const response = await fetch(
        `https://javascript.api.mailslurp.com/missed-emails?inboxId=${inboxId}&page=0&size=10`,
        { headers: { "x-api-key": apiKey } },
      );

      if (!response.ok) return null;

      const data = (await response.json()) as {
        content?: { subject?: string; createdAt?: string }[];
      };

      const missedEmails = (data.content ?? []).filter((email) => {
        if (!email.createdAt) return true;
        return new Date(email.createdAt) >= quotaSince;
      });

      if (missedEmails.length > 0) {
        const subjects = missedEmails
          .map(
            (email) =>
              `"${email.subject ?? "(no subject)"}" at ${email.createdAt}`,
          )
          .join(", ");

        return new Error(
          `MailSlurp daily receive quota exceeded — emails arrived but were not stored.\n` +
            `Missed emails since test started: ${subjects}\n` +
            `Fix: renew your daily receive credits at app.mailslurp.com or switch to a different MAILSLURP_API_KEY.`,
        );
      }

      return null;
    } catch (error) {
      // Ignore probe failures
      console.warn("[MailSlurp] Failed to check for missed emails:", error);
      return null;
    }
  }

  /**
   * Get MailSlurp API key from environment.
   */
  private getApiKey(): string {
    const key = process.env.MAILSLURP_API_KEY?.trim();
    if (!key) {
      throw new Error(
        "Missing required e2e environment variable: MAILSLURP_API_KEY",
      );
    }
    return key;
  }

  /**
   * Log the start of waiting for an email.
   */
  private logWaitStart(
    inboxId: string,
    linkHint: string,
    since: Date,
    timeoutMs: number,
  ): void {
    console.log(
      `[MailSlurp] Waiting for email to inbox ${inboxId} with link hint "${linkHint}"`,
    );
    console.log(
      `[MailSlurp] Since: ${since.toISOString()}, timeout: ${timeoutMs}ms`,
    );
  }

  /**
   * Delay for a specified number of milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
