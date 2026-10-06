// Applies the saved light/dark theme before Angular starts, so the page never flashes the wrong one.
// Keep the colours in sync with applyTheme() in settings.service.ts.
(function () {
  var theme;
  try {
    theme = JSON.parse(localStorage.getItem('budgetflow.settings.v1') || '{}').theme;
  } catch (e) {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0c12' : '#f3f4f8');
})();
