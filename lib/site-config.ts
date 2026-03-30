/**
 * Static site-wide configuration constants.
 * Keep asset URLs and other non-secret config here rather than inlining them in components.
 */

export const SITE_CONFIG = {
  /** Public CDN URL for the wev logotype image. */
  logotypeUrl:
    process.env.NEXT_PUBLIC_LOGOTYPE_URL ??
    'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png',
} as const;
