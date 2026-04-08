import type { Page } from '@playwright/test';

const MAILINATOR_BASE_URL = 'https://www.mailinator.com';

type MailinatorLinkOptions = {
  inbox: string;
  linkHint: string;
  timeoutMs?: number;
  pollEveryMs?: number;
};

function extractMatchingUrl(text: string, linkHint: string): string | null {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const normalizedHint = linkHint.toLowerCase();
  const hit = matches.find((candidate) => candidate.toLowerCase().includes(normalizedHint));
  return hit ?? null;
}

async function extractFromFrames(page: Page, linkHint: string): Promise<string | null> {
  for (const frame of page.frames()) {
    const frameText = await frame.locator('body').textContent().catch(() => null);
    if (!frameText) continue;
    const hit = extractMatchingUrl(frameText, linkHint);
    if (hit) return hit;
  }
  return null;
}

async function extractFromPage(page: Page, linkHint: string): Promise<string | null> {
  const content = await page.content();
  const fromHtml = extractMatchingUrl(content, linkHint);
  if (fromHtml) return fromHtml;

  const bodyText = (await page.locator('body').textContent().catch(() => null)) ?? '';
  return extractMatchingUrl(bodyText, linkHint);
}

/**
 * Polls a free/public Mailinator inbox by UI scraping and returns the first URL
 * that contains `linkHint`.
 */
export async function waitForMailinatorPublicLink(
  page: Page,
  { inbox, linkHint, timeoutMs = 120_000, pollEveryMs = 4_000 }: MailinatorLinkOptions,
): Promise<string> {
  const inboxUrl = `${MAILINATOR_BASE_URL}/v4/public/inboxes.jsp?to=${encodeURIComponent(inbox)}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.goto(inboxUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);

    // If a subject row is visible, open it first.
    const firstSubject = page.locator('tr, .message-list-item').first();
    if (await firstSubject.isVisible().catch(() => false)) {
      await firstSubject.click().catch(() => {});
      await page.waitForTimeout(1_500);
    }

    const fromFrames = await extractFromFrames(page, linkHint);
    if (fromFrames) return fromFrames;

    const fromPage = await extractFromPage(page, linkHint);
    if (fromPage) return fromPage;

    await page.waitForTimeout(pollEveryMs);
  }

  throw new Error(`No Mailinator email link found for inbox "${inbox}" with hint "${linkHint}"`);
}
