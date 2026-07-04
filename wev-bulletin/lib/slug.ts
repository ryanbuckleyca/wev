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
  let slug = name.normalize('NFKD');
  
  // Strip non-ASCII (this removes the combining diacritical marks from NFKD)
  slug = slug.replace(/[^\x00-\x7F]/g, '');
  
  slug = slug.toLowerCase();
  
  // Remove anything that isn't a-z, 0-9, or space
  slug = slug.replace(/[^a-z0-9 ]/g, '');
  
  // Replace spaces with hyphens
  slug = slug.replace(/\s+/g, '-');
  
  // Collapse multiple hyphens
  slug = slug.replace(/-+/g, '-');
  
  // Strip leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');
  
  return slug;
}
