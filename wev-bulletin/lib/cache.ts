/**
 * Shared Data Cache window (seconds) for anonymous public payloads
 * (`unstable_cache({ revalidate })`).
 *
 * Page segment config must use the same numeric literal
 * (`export const revalidate = 60`) — Next.js rejects imported values there.
 * Keep those page literals equal to this constant (enforced by cache.test.ts).
 */
export const PUBLIC_REVALIDATE_SECONDS = 60;
