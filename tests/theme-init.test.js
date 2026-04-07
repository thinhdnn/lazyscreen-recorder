/**
 * @jest-environment jsdom
 */

function loadThemeScript() {
  jest.isolateModules(() => {
    require('../src/renderer/theme-init');
  });
}

describe('theme-init', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = '';
    window.__initialUiTheme = 'dark';
  });

  test('applies light class when initial theme is light', () => {
    window.__initialUiTheme = 'light';
    loadThemeScript();
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  test('updates theme button title and aria-label', () => {
    document.body.innerHTML = '<button id="btn-theme"></button>';
    window.__initialUiTheme = 'light';
    loadThemeScript();

    const btn = document.getElementById('btn-theme');
    expect(btn.title).toBe('Switch to dark mode');
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark mode');
  });
});
