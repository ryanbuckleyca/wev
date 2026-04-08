/**
 * Shared date utilities.
 * Centralises the UTC-normalisation pattern that was previously duplicated
 * across job-query.ts, client-data.ts, and JobCard.tsx.
 */

/**
 * Parse a date string that may or may not carry timezone info.
 * Strings without a timezone suffix are treated as UTC (appends 'Z').
 *
 * Handles:
 *   - ISO 8601 with Z suffix:        "2026-03-20T00:00:00Z"
 *   - ISO 8601 with ±HH:MM offset:   "2026-03-20T00:00:00+05:30"
 *   - ISO 8601 with ±HHMM offset:    "2026-03-20T00:00:00+0530"
 *   - Bare datetime (no timezone):   "2026-03-20T00:00:00" → treated as UTC
 */
export function parseDateString(raw: string): Date {
  const hasTimezone = raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw) || /[+-]\d{4}$/.test(raw);
  return new Date(hasTimezone ? raw : `${raw}Z`);
}

/**
 * Parse a date string to a millisecond timestamp.
 * Returns NaN if the string is unparseable — callers in sort comparisons
 * should guard against NaN to avoid unpredictable ordering.
 */
export function parseDateMs(raw: string): number {
  return parseDateString(raw).getTime();
}
