function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function buildStrongPassword(prefix = "WevE2E!"): string {
  return `${prefix}${Date.now()}${randomSuffix()}A1`;
}
