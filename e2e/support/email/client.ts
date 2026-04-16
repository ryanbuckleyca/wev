import type { InboxRef } from './inbox-manager';
import {
  createEphemeralInbox as createMailSlurpInbox,
  waitForInboxLink as waitForMailSlurpLink,
} from './mailslurp-client';
import {
  createEphemeralInbox as createMailpitInbox,
  waitForInboxLink as waitForMailpitLink,
} from './mailpit-client';

type EmailProvider = 'mailpit' | 'mailslurp';

function resolveEmailProvider(): EmailProvider {
  const explicit = process.env.E2E_EMAIL_PROVIDER?.trim().toLowerCase();

  if (explicit === 'mailslurp') return 'mailslurp';
  if (explicit === 'mailpit') return 'mailpit';

  return process.env.MAILSLURP_API_KEY?.trim() ? 'mailslurp' : 'mailpit';
}

export async function createEphemeralInbox(): Promise<InboxRef> {
  const provider = resolveEmailProvider();
  return provider === 'mailslurp' ? createMailSlurpInbox() : createMailpitInbox();
}

export async function waitForInboxLink(
  inboxId: string,
  linkHint: string,
  timeoutMs = 120_000,
  sinceOverride?: Date
): Promise<string> {
  const provider = resolveEmailProvider();

  return provider === 'mailslurp'
    ? waitForMailSlurpLink(inboxId, linkHint, timeoutMs, sinceOverride)
    : waitForMailpitLink(inboxId, linkHint, timeoutMs, sinceOverride);
}
