'use strict';

// ── Persisted layout sizes ────────────────────────────────────────────────────
const SIZE_KEY = 'nasm-layout-v2';
const DEFAULTS  = { lessonW: 340, editorH: 270, regW: 260, flagsW: 200 };

const sizes = Object.assign({}, DEFAULTS,
  JSON.parse(localStorage.getItem(SIZE_KEY) || '{}'));

const root        = document.documentElement;
const mainGrid  = document.getElementById('main-layout');
const rightPanel  = document.getElementById('right-panel');
const editorArea  = document.getElementById('editor-area');
const stateArea   = document.getElementById('state-area');

// ── Apply sizes to DOM ────────────────────────────────────────────────────────
function apply() {
  // Lesson sidebar width
  mainGrid.style.gridTemplateColumns =
    `${sizes.lessonW}px 8px 1fr`;

  // Editor / state vertical split (right panel is flex-col)
  editorArea.style.height = sizes.editorH + 'px';

  // State-area column widths
  stateArea.style.gridTemplateColumns =
    `${sizes.regW}px 8px ${sizes.flagsW}px 8px 1fr`;

  // Keep CodeMirror in sync
  if (window.cmEditor) {
    const toolbar = document.getElementById('editor-toolbar');
    const err     = document.getElementById('error-banner');
    const taken   = toolbar.offsetHeight
                  + (err.style.display !== 'none' ? err.offsetHeight : 0);
    window.cmEditor.setSize(null, Math.max(60, sizes.editorH - taken));
  }
}

function save() {
  localStorage.setItem(SIZE_KEY, JSON.stringify(sizes));
}

// ── Generic drag helper ───────────────────────────────────────────────────────
// axis   : 'x' | 'y'
// key    : keyof sizes
// min/max: pixel limits
// sign   : +1 or -1  (positive = right/down grows value)
function startDrag(downEvent, axis, key, min, max, sign = 1) {
  downEvent.preventDefault();
  const startCoord = axis === 'x' ? downEvent.clientX : downEvent.clientY;
  const startVal   = sizes[key];

  // Visual feedback
  const handle = downEvent.currentTarget;
  handle.classList.add('dragging');
  document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';

  function onMove(e) {
    const delta = ((axis === 'x' ? e.clientX : e.clientY) - startCoord) * sign;
    sizes[key] = Math.round(Math.max(min, Math.min(max, startVal + delta)));
    apply();
  }

  function onUp() {
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    save();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Wire up handles ───────────────────────────────────────────────────────────
document.getElementById('h-lesson')
  .addEventListener('mousedown', e => startDrag(e, 'x', 'lessonW', 180, 560));

document.getElementById('h-editor')
  .addEventListener('mousedown', e => startDrag(e, 'y', 'editorH', 120, 520));

document.getElementById('h-reg')
  .addEventListener('mousedown', e => startDrag(e, 'x', 'regW', 140, 400));

document.getElementById('h-flags')
  .addEventListener('mousedown', e => startDrag(e, 'x', 'flagsW', 100, 340));

// Double-click any handle to reset all sizes to defaults
document.querySelectorAll('.resize-h, .resize-v').forEach(h => {
  h.addEventListener('dblclick', () => {
    Object.assign(sizes, DEFAULTS);
    apply();
    save();
  });
});

// ── Expose helpers ────────────────────────────────────────────────────────────
window.refreshLayout = apply;
window.resetLayout = () => { Object.assign(sizes, DEFAULTS); apply(); save(); };

// ── Initial paint ─────────────────────────────────────────────────────────────
apply();
