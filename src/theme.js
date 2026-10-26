const THEME_KEY = 'fotc-theme-v1';

/** @returns {'light' | 'dark'} */
export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** @param {'light' | 'dark'} theme */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const dark = theme === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.querySelector('.theme-toggle-icon').textContent = dark ? '☀' : '☾';
    btn.querySelector('.theme-toggle-label').textContent = dark ? 'Light' : 'Dark';
  }
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initThemeToggle() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
  });
}

initThemeToggle();
