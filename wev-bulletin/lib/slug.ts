/**
 * Generates a URL-safe slug from an organization name.
 *
 * Mirrors the Python `generate_slug` logic exactly:
 * - NFKD normalize (handles accents like é -> e)
 * - strip non-ASCII
 * - lowercase
 * - remove characters other than a-z, 0-9, and space
 * - replace spaces with hyphens
 * - collapse multiple hyphens
 * - strip leading/trailing hyphens
 */
export function generateSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 \-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
