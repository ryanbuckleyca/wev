/**
 * A blocking script that applies the theme as early as possible to prevent flashes.
 * Logic:
 * 1. User choice (localStorage)
 * 2. Shared choice (cookie from wev/bulletin)
 * 3. System setting (matchMedia)
 * 4. Default: dark
 *
 * This is intentionally a Server Component — rendering a <script> tag from a
 * client component triggers a React warning (scripts are never re-executed on
 * the client during navigation). As a server component the tag is emitted once
 * into the HTML stream and runs during initial page parse, which is exactly
 * what a FOUC-prevention script needs.
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
