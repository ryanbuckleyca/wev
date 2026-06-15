/**
 * Static site-wide configuration constants.
 * Keep asset URLs and other non-secret config here rather than inlining them in components.
 */

export const SITE_CONFIG = {
  /**
   * Public CDN URL for the wev logotype image.
   * Override with NEXT_PUBLIC_LOGOTYPE_URL if the asset moves.
   */
  logotypeUrl:
    process.env.NEXT_PUBLIC_LOGOTYPE_URL ?? '/wev-logotype.svg',
} as const;
