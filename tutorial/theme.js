'use strict';

const THEME_KEY = 'nasm-theme';
const THEMES    = ['retro', 'cyberpunk'];

function applyTheme(name) {
  document.body.dataset.theme = name;
  localStorage.setItem(THEME_KEY, name);
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  if (name === 'retro') {
    btn.textContent = 'CYBER ◈';
    btn.title = 'Switch to cyberpunk theme';
  } else {
    btn.textContent = 'RETRO ◉';
    btn.title = 'Switch to retro theme';
  }
}

const saved = localStorage.getItem(THEME_KEY);
applyTheme(THEMES.includes(saved) ? saved : 'retro');

document.getElementById('theme-btn')
  ?.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'retro' ? 'cyberpunk' : 'retro');
  });
