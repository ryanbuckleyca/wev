/**
 * Blocking theme bootstrap in <head> to prevent FOUC / theme flicker.
 * Logic:
 * 1. User choice (localStorage)
 * 2. Shared choice (cookie from wev/bulletin)
 * 3. System setting (matchMedia)
 * 4. Default: dark
 *
 * Must live in the root layout (`app/layout.tsx`) <head>, not `[locale]/layout`
 * and not after <body> content — otherwise the server-default `data-theme` can
 * paint first. Locale soft-navigation remounts the locale layout on the client;
 * a raw <script> there triggers React's "script tag while rendering" warning.
 * Root layout persists across locale switches, so this runs only on full loads.
 *
 * Intentionally client-side (no cookies() in the layout) so the root shell stays
 * CDN-cacheable; the cookie is still read here before first paint.
 */
export default function ThemeScript() {
  const script = `
    (function() {
      try {
        var theme = localStorage.getItem('theme');
        if (!theme) {
          var cookies = document.cookie.split('; ');
          var themeCookie = cookies.find(function(c) { return c.startsWith('theme='); });
          if (themeCookie) {
            theme = themeCookie.split('=')[1];
          }
        }

        if (!theme) {
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
          } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            theme = 'light';
          } else {
            theme = 'dark';
          }
        }

        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
