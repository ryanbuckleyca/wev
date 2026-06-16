/** SSR default when no theme cookie is set — must match ThemeScript fallback. */
export const DEFAULT_THEME = 'dark' as const;

export type Theme = 'light' | 'dark';

/** Resolve theme from the `theme` cookie value (server-side). */
export function resolveThemeFromCookie(cookieValue: string | undefined): Theme {
  if (cookieValue === 'light') return 'light';
  if (cookieValue === 'dark') return 'dark';
  return DEFAULT_THEME;
}
