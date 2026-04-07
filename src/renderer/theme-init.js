(function () {
  try {
    if (window.__initialUiTheme === 'light') {
      document.documentElement.classList.add('theme-light');
    }
  } catch (e) {}

  function syncThemeButton() {
    var btn = document.getElementById('btn-theme');
    if (!btn) return;
    var light = document.documentElement.classList.contains('theme-light');
    var label = light ? 'Switch to dark mode' : 'Switch to light mode';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncThemeButton);
  } else {
    syncThemeButton();
  }
})();
