export const WORK_TYPES = ['remote', 'hybrid', 'office'] as const
export type WorkType = (typeof WORK_TYPES)[number]

export function isWorkType(value: string): value is WorkType {
  return (WORK_TYPES as readonly string[]).includes(value)
}

export function normalizeWorkTypes(
  values?: Array<string | null | undefined> | null
): WorkType[] {
  const unique = new Set<WorkType>()
  for (const value of values ?? []) {
    if (!value) continue
    if (isWorkType(value)) unique.add(value)
  }
  return Array.from(unique)
}
