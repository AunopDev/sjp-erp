// Resolve theme + density before Angular boots so there is no flash of the wrong palette.
// Keys and values mirror web/src/app/core/storage.ts — keep them in sync.
(function () {
  try {
    var pref = localStorage.getItem('sjp-theme');
    if (pref !== 'light' && pref !== 'dark') pref = 'system';

    var dark =
      pref === 'system'
        ? !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        : pref === 'dark';
    var theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;

    var colors = { light: '#f6f7f9', dark: '#0d1117' };
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', colors[theme]);

    // Keep native controls, scrollbars and form widgets in the same scheme.
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (!scheme) {
      scheme = document.createElement('meta');
      scheme.setAttribute('name', 'color-scheme');
      document.head.appendChild(scheme);
    }
    scheme.setAttribute('content', theme === 'light' ? 'only light' : 'dark');

    var density = localStorage.getItem('sjp-density');
    document.documentElement.dataset.density = density === 'comfy' ? 'comfy' : 'compact';
  } catch (e) {
    /* private mode: fall back to the CSS default */
  }
})();
