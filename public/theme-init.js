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
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b111c' : '#f4f6fa');
})();
