/** Parse a numeric organization id from a route param or form value. */
export function parseOrgId(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === '') return null;
  const text = String(raw);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
