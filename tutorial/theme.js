'use strict';

const THEME_KEY = 'nasm-theme';
const THEMES    = ['retro', 'cyberpunk', 'academic'];

const NEXT_LABEL = {
  retro:     'CYBER ◈',
  cyberpunk: 'ACAD ▣',
  academic:  'RETRO ◉',
};
const NEXT_TITLE = {
  retro:     'Switch to cyberpunk theme',
  cyberpunk: 'Switch to academic theme',
  academic:  'Switch to retro theme',
};

function applyTheme(name) {
  document.body.dataset.theme = name;
  localStorage.setItem(THEME_KEY, name);
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  btn.textContent = NEXT_LABEL[name];
  btn.title       = NEXT_TITLE[name];
}

const saved = localStorage.getItem(THEME_KEY);
applyTheme(THEMES.includes(saved) ? saved : 'retro');

document.getElementById('theme-btn')?.addEventListener('click', () => {
  const cur = document.body.dataset.theme;
  const idx  = THEMES.indexOf(cur);
  applyTheme(THEMES[(idx + 1) % THEMES.length]);
});
