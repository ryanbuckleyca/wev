import { defineRouting } from 'next-intl/routing';

export const pathnames = {
  '/': '/',
  '/account-settings': '/account-settings',
  '/bookmarks': '/bookmarks',
  '/forgot-password': '/forgot-password',
  '/jobs': {
    en: '/jobs',
    fr: '/emplois',
  },
  '/login': '/login',
  '/profile': '/profile',
  '/reset-password': '/reset-password',
  '/signup': '/signup',
  '/style-guide': '/style-guide',
  '/organizations': '/organizations',
} as const;

export const routing = defineRouting({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  localePrefix: 'always',
  pathnames,
});

export type AppLocale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof pathnames;

export function getLocalizedPathname(pathname: AppPathname, locale: AppLocale): string {
  const localizedPathname = pathnames[pathname];
  return typeof localizedPathname === 'string' ? localizedPathname : localizedPathname[locale];
}
