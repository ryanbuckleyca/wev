/**
 * Shared date utilities.
 * Centralises the UTC-normalisation pattern that was previously duplicated
 * across job-query.ts, client-data.ts, and JobCard.tsx.
 */

/**
 * Parse a date string that may or may not carry timezone info.
 * Strings without a timezone suffix are treated as UTC (appends 'Z').
 */
export function parseDateString(raw: string): Date {
  const hasTimezone = raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw);
  return new Date(hasTimezone ? raw : `${raw}Z`);
}

/**
 * Parse a date string to a millisecond timestamp.
 * Returns NaN if the string is unparseable.
 */
export function parseDateMs(raw: string): number {
  return parseDateString(raw).getTime();
}
