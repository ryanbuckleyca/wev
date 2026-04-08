const MAILINATOR_PUBLIC_DOMAIN = 'mailinator.com';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function buildUniqueMailinatorAddress(prefix = 'wev-e2e-auth'): {
  email: string;
  inbox: string;
} {
  const inbox = `${prefix}-${Date.now()}-${randomSuffix()}`.toLowerCase();
  return {
    inbox,
    email: `${inbox}@${MAILINATOR_PUBLIC_DOMAIN}`,
  };
}

export function buildStrongPassword(prefix = 'WevE2E!'): string {
  return `${prefix}${Date.now()}${randomSuffix()}A1`;
}
