(function () {
  var theme;
  try {
    theme = JSON.parse(localStorage.getItem('budgetflow.settings.v1') || '{}').theme;
  } catch (e) {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
