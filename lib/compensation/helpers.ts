import { PLATFORM_DEFAULT_HOURS_PER_WEEK, ANNUAL_MULTIPLIER, CompensationUnit } from './constants'
import type { JobPosting } from '@/lib/supabase'

export function toAnnual(
  amountCents: bigint | null,
  unit: CompensationUnit | null,
  hoursPerWeek?: number | null
): bigint | null {
  if (amountCents === null || unit === null) {
    return null
  }

  if (unit === 'HOUR') {
    const hours = hoursPerWeek ?? PLATFORM_DEFAULT_HOURS_PER_WEEK
    return amountCents * BigInt(hours) * 52n
  }

  return amountCents * BigInt(ANNUAL_MULTIPLIER[unit])
}

// ---------------------------------------------------------------------------
// formatCompensation
// ---------------------------------------------------------------------------

/**
 * Minimal job shape needed by formatCompensation.
 * @deprecated Use JobPosting from @/lib/supabase instead.
 */
export type CompensationJobPosting = JobPosting

export type CompensationDisplay = {
  /** Main display string shown in JobCard */
  primary: string
  /** Supplementary rate (shown when hours_per_week is stated and ≠ 40) */
  secondary?: string
  /** true when hours_per_week was null and unit is HOUR */
  isInferred: boolean
  /** false for non-CAD / vague (structured fields absent) */
  isStructured: boolean
}

function formatCurrency(amountCents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amountCents / 100)
}

function formatCurrencyRange(minCents: bigint, maxCents: bigint | null, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  })
  const minStr = formatter.format(Number(minCents) / 100)
  if (maxCents === null) return minStr
  const maxStr = formatter.format(Number(maxCents) / 100)
  return `${minStr} – ${maxStr}`
}

/**
 * Formats a job's compensation for display in JobCard.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
export type CompensationTranslations = {
  perYear: string
  perHour: string
  statedHoursPerWeek: (hours: number) => string
}

export function formatCompensation(
  job: JobPosting,
  locale: string,
  t?: CompensationTranslations
): CompensationDisplay {
  const perYear = t?.perYear ?? '/ year'
  const perHour = t?.perHour ?? '/ hour'
  const statedHours = (h: number) => t?.statedHoursPerWeek(h) ?? `(stated ${h}h/week)`
  // Fallback: unstructured data
  if (job.min_value == null || job.unit_text == null) {
    return {
      primary: job.wage ?? 'N/A',
      isInferred: false,
      isStructured: false,
    }
  }

  const isInferred = job.hours_per_week == null && job.unit_text === 'HOUR'

  const annualMin = toAnnual(BigInt(job.min_value), job.unit_text, job.hours_per_week)!
  const annualMax =
    job.max_value != null
      ? toAnnual(BigInt(job.max_value), job.unit_text, job.hours_per_week)
      : null

  const prefix = isInferred ? '~' : ''

  // When hours are inferred (no unit keyword in original), show the hourly rate
  // directly rather than a computed annual — "~$21/hr" is more honest than "~$43,680 / year"
  let primary: string
  if (isInferred) {
    const hourlyMin = formatCurrency(job.min_value, locale)
    const hourlyMax = job.max_value != null ? formatCurrency(job.max_value, locale) : null
    primary = hourlyMax
      ? `~${hourlyMin} – ${hourlyMax} ${perHour}`
      : `~${hourlyMin} ${perHour}`
  } else {
    primary = `${prefix}${formatCurrencyRange(annualMin, annualMax, locale)} ${perYear}`
  }

  let secondary: string | undefined
  if (job.unit_text === 'HOUR' && job.hours_per_week != null && job.hours_per_week !== 40) {
    const hourlyMin = formatCurrency(job.min_value, locale)
    secondary = `${hourlyMin} ${perHour} ${statedHours(job.hours_per_week)}`
  }

  return { primary, secondary, isInferred, isStructured: true }
}
