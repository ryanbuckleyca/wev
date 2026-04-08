export const PLATFORM_DEFAULT_HOURS_PER_WEEK = 40;

export type CompensationUnit = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export const ANNUAL_MULTIPLIER: Record<Exclude<CompensationUnit, 'HOUR'>, number> = {
  DAY: 260,
  WEEK: 52,
  MONTH: 12,
  YEAR: 1,
};
