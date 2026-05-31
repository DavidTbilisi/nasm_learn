'use strict';

// ── Arcade host ─────────────────────────────────────────────────────────────
// Manages the Arcade tab: game picker → level picker → level workspace.
// Each game module supplies levels + a syscall installer + a renderer. The
// host runs the player's code on a fresh NASMSimulator instance per attempt,
// validates the resulting world, and shows pass/fail with cycle count vs par.

const arcadeSim = new NASMSimulator();

let arcadeView      = 'picker';     // 'picker' | 'levels' | 'level'
let activeGame      = null;
let activeLevel     = null;
let activeWorld     = null;
let arcadeCm        = null;          // lazy CodeMirror
let lastResult      = null;          // { ok, message, steps, par }
let arcadeStepIdx   = 0;            // 0 = not started; N = ran N instructions
let arcadeActiveLine= -1;
let prevSnapshot    = null;          // last sim snapshot for HUD change-flash

// HUD constants — universal memory windows shown next to the game world.
const HUD_DATA_BASE   = 0x4000;
const HUD_INITIAL_ESP = 0x2000;
const HUD_STACK_BYTES = 16;
const HUD_DATA_BYTES  = 16;
const HUD_REG_ORDER   = ['eax','ebx','ecx','edx','esi','edi','ebp','esp'];
const HUD_FLAG_ORDER  = ['zf','cf','sf','of','df'];

const LS_KEY = 'nasm-arcade-progress';

// ── localStorage: per-level best step count ─────────────────────────────────

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch (_) { return {}; }
}
function saveBest(gameId, levelId, steps) {
  const p = loadProgress();
  const key = `${gameId}.${levelId}`;
  if (p[key] === undefined || steps < p[key]) {
    p[key] = steps;
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (_) {}
  }
}
function getBest(gameId, levelId) {
  return loadProgress()[`${gameId}.${levelId}`];
}

// ── DOM refs (resolved on first show) ───────────────────────────────────────

let arcadeWrap, arcadePicker, arcadeLevels, arcadeWorkspace;
let arcadeBackBtn, arcadeBreadcrumb, arcadeWorldPanel, arcadeHud;
let arcadeIntro, arcadeHint, arcadeHintBtn, arcadeSolutionBox, arcadeSolutionBtn;
let arcadeRunBtn, arcadeResetBtn, arcadeStatus, arcadeStepCounter, arcadeErrorBanner;
let arcadeEditorHost, arcadeStepBtn, arcadeBackStepBtn;

function resolveDom() {
  arcadeWrap        = document.getElementById('arcade-wrap');
  arcadePicker      = document.getElementById('arcade-picker');
  arcadeLevels      = document.getElementById('arcade-levels');
  arcadeWorkspace   = document.getElementById('arcade-workspace');
  arcadeBackBtn     = document.getElementById('arcade-back');
  arcadeBreadcrumb  = document.getElementById('arcade-breadcrumb');
  arcadeWorldPanel  = document.getElementById('arcade-world');
  arcadeHud         = document.getElementById('arcade-hud');
  arcadeIntro       = document.getElementById('arcade-intro');
  arcadeHint        = document.getElementById('arcade-hint');
  arcadeHintBtn     = document.getElementById('arcade-hint-btn');
  arcadeSolutionBox = document.getElementById('arcade-solution');
  arcadeSolutionBtn = document.getElementById('arcade-solution-btn');
  arcadeRunBtn      = document.getElementById('arcade-run');
  arcadeStepBtn     = document.getElementById('arcade-step');
  arcadeBackStepBtn = document.getElementById('arcade-back-step');
  arcadeResetBtn    = document.getElementById('arcade-reset');
  arcadeStatus      = document.getElementById('arcade-status');
  arcadeStepCounter = document.getElementById('arcade-step-counter');
  arcadeErrorBanner = document.getElementById('arcade-error');
  arcadeEditorHost  = document.getElementById('arcade-editor-host');
}

// ── Views ───────────────────────────────────────────────────────────────────

function renderPicker() {
  arcadeView = 'picker';
  arcadePicker.style.display    = '';
  arcadeLevels.style.display    = 'none';
  arcadeWorkspace.style.display = 'none';
  arcadeBackBtn.style.display   = 'none';
  arcadeBreadcrumb.textContent  = '🎮 Arcade';

  const games = window.ARCADE_GAMES || [];
  arcadePicker.innerHTML = games.map(g => {
    const progress = loadProgress();
    const done = g.levels.filter(l => progress[`${g.id}.${l.id}`] !== undefined).length;
    return `
      <button class="arcade-card" data-game="${g.id}">
        <div class="arcade-card-name">${g.name}</div>
        <div class="arcade-card-blurb">${g.blurb}</div>
        <div class="arcade-card-progress">${done} / ${g.levels.length} solved</div>
      </button>`;
  }).join('') || '<div class="arcade-empty">No games loaded.</div>';

  arcadePicker.querySelectorAll('.arcade-card').forEach(b => {
    b.addEventListener('click', () => openGame(b.dataset.game));
  });
}

function openGame(gameId) {
  activeGame = (window.ARCADE_GAMES || []).find(g => g.id === gameId);
  if (!activeGame) return;
  arcadeView = 'levels';
  arcadePicker.style.display    = 'none';
  arcadeLevels.style.display    = '';
  arcadeWorkspace.style.display = 'none';
  arcadeBackBtn.style.display   = '';
  arcadeBackBtn.textContent     = '← All games';
  arcadeBreadcrumb.textContent  = `🎮 Arcade › ${activeGame.name}`;

  const progress = loadProgress();
  arcadeLevels.innerHTML = activeGame.levels.map((l, idx) => {
    const best = progress[`${activeGame.id}.${l.id}`];
    const solved = best !== undefined;
    const status = solved
      ? `<span class="lvl-best">best ${best} steps · par ${l.par}</span>`
      : `<span class="lvl-par">par ${l.par}</span>`;
    return `
      <button class="arcade-level" data-idx="${idx}">
        <div class="lvl-title">${solved ? '✓ ' : ''}${l.title}</div>
        <div class="lvl-teaches">${(l.teaches || []).join(' · ')}</div>
        ${status}
      </button>`;
  }).join('');

  arcadeLevels.querySelectorAll('.arcade-level').forEach(b => {
    b.addEventListener('click', () => openLevel(+b.dataset.idx));
  });
}

function openLevel(idx) {
  activeLevel = activeGame.levels[idx];
  if (!activeLevel) return;
  arcadeView = 'level';
  arcadePicker.style.display    = 'none';
  arcadeLevels.style.display    = 'none';
  arcadeWorkspace.style.display = '';
  arcadeBackBtn.style.display   = '';
  arcadeBackBtn.textContent     = `← ${activeGame.name} levels`;
  arcadeBreadcrumb.textContent  = `🎮 Arcade › ${activeGame.name} › ${activeLevel.title}`;

  arcadeIntro.textContent       = activeLevel.intro;
  arcadeHint.textContent        = activeLevel.hint || '';
  arcadeHint.style.display      = 'none';
  arcadeHintBtn.textContent     = 'Show hint';
  arcadeSolutionBox.textContent = activeLevel.solution || '';
  arcadeSolutionBox.style.display = 'none';
  arcadeSolutionBtn.textContent = 'Show solution';
  arcadeSolutionBtn.disabled    = !activeLevel.solution;

  ensureEditor();
  clearActiveLine();
  arcadeCm.setValue(activeLevel.starter || '');
  arcadeCm.clearHistory();

  resetWorld();
  clearStatus();
}

function resetWorld() {
  activeWorld = activeLevel.makeWorld();
  arcadeSim.reset();
  prevSnapshot = null;
  activeGame.render(activeWorld, arcadeWorldPanel);
  renderHud(arcadeSim);
}

// ── Universal HUD ──────────────────────────────────────────────────────────
// Renders register/flag panel + stack/data byte ribbon below every game.
// Cells whose values changed since the previous render get .changed for the
// CSS flash animation. Lives at the host level so every game gets it for free.

function snapshotSim(sim) {
  const regs = {};
  for (const r of HUD_REG_ORDER) regs[r] = (sim.regs[r] >>> 0);
  const flags = {};
  for (const f of HUD_FLAG_ORDER) flags[f] = sim.flags[f] | 0;
  const stack = [];
  const sp = sim.regs.esp >>> 0;
  for (let i = 0; i < HUD_STACK_BYTES && sp + i < HUD_INITIAL_ESP; i++) {
    stack.push({ addr: sp + i, byte: sim.readByte(sp + i) });
  }
  const data = [];
  for (let i = 0; i < HUD_DATA_BYTES; i++) {
    data.push({ addr: HUD_DATA_BASE + i, byte: sim.readByte(HUD_DATA_BASE + i) });
  }
  return { regs, flags, stack, data };
}

function _hudHex(v, w=8) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}
function _hudByte(b) { return (b & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }

function renderHud(sim, targetEl, prev) {
  // Pure-ish: caller supplies target + prev snapshot, we return the new one.
  // Arcade callers below pass targetEl=undefined to use arcadeHud and pass
  // the module-global prevSnapshot. Foundry tracks one prevSnapshot per
  // machine in its own state.
  targetEl = targetEl || arcadeHud;
  if (!targetEl) return null;
  const cur = snapshotSim(sim);
  if (prev === undefined) prev = prevSnapshot;

  const regsHtml = HUD_REG_ORDER.map(r => {
    const v = cur.regs[r];
    const changed = prev && prev.regs[r] !== v ? ' changed' : '';
    return `<div class="reg-cell${changed}">
      <span class="reg-name">${r}</span>
      <span class="reg-val">${_hudHex(v)}</span>
    </div>`;
  }).join('');

  const flagsHtml = HUD_FLAG_ORDER.map(f => {
    const on = cur.flags[f] ? 'on' : 'off';
    const changed = prev && (prev.flags[f] | 0) !== (cur.flags[f] | 0) ? ' changed' : '';
    return `<span class="flag-led ${on}${changed}">${f.toUpperCase()}</span>`;
  }).join('');

  const stackHtml = cur.stack.length
    ? cur.stack.map((c, i) => {
        const pb = prev && prev.stack[i] && prev.stack[i].addr === c.addr ? prev.stack[i].byte : null;
        const changed = pb !== null && pb !== c.byte ? ' changed' : '';
        const zero = c.byte === 0 ? ' zero' : '';
        return `<span class="mem-byte${zero}${changed}" title="${_hudHex(c.addr,4)}">${_hudByte(c.byte)}</span>`;
      }).join('')
    : '<span class="mem-empty">— stack empty —</span>';

  const dataNonZero = cur.data.some(c => c.byte !== 0);
  const dataHtml = cur.data.map((c, i) => {
    const pb = prev && prev.data[i] && prev.data[i].addr === c.addr ? prev.data[i].byte : null;
    const changed = pb !== null && pb !== c.byte ? ' changed' : '';
    const zero = c.byte === 0 ? ' zero' : '';
    return `<span class="mem-byte${zero}${changed}" title="${_hudHex(c.addr,4)}">${_hudByte(c.byte)}</span>`;
  }).join('');

  targetEl.innerHTML = `
    <div class="hud-section hud-regs">
      <div class="hud-label">Registers</div>
      <div class="reg-grid">${regsHtml}</div>
      <div class="flag-row">${flagsHtml}</div>
    </div>
    <div class="hud-section hud-mem">
      <div class="mem-strip">
        <span class="mem-region-label">stack ↑esp @${_hudHex(cur.regs.esp,4)}</span>
        <span class="mem-bytes">${stackHtml}</span>
      </div>
      <div class="mem-strip${dataNonZero ? '' : ' dim'}">
        <span class="mem-region-label">data @${_hudHex(HUD_DATA_BASE,4)}</span>
        <span class="mem-bytes">${dataHtml}</span>
      </div>
    </div>
  `;

  if (targetEl === arcadeHud) prevSnapshot = cur;
  return cur;
}

// Expose for Foundry.
window.NASMHud = { renderHud, snapshotSim };

function clearStatus() {
  lastResult = null;
  arcadeStepIdx = 0;
  arcadeStatus.className = 'arcade-status';
  arcadeStatus.textContent = '';
  arcadeStepCounter.textContent = '';
  arcadeErrorBanner.style.display = 'none';
  arcadeErrorBanner.textContent = '';
  clearActiveLine();
  if (arcadeBackStepBtn) arcadeBackStepBtn.disabled = true;
}

// ── Editor line highlight ──────────────────────────────────────────────────

function clearActiveLine() {
  if (!arcadeCm || arcadeActiveLine < 0) return;
  arcadeCm.removeLineClass(arcadeActiveLine, 'background', 'cm-active-step');
  arcadeActiveLine = -1;
}

function highlightInstruction(instr) {
  clearActiveLine();
  if (!arcadeCm || !instr) return;
  const target = instr.raw.trim().toLowerCase();
  const lineCount = arcadeCm.lineCount();
  for (let i = 0; i < lineCount; i++) {
    let line = arcadeCm.getLine(i);
    const ci = line.indexOf(';');
    if (ci !== -1) line = line.slice(0, ci);
    line = line.trim();
    if (!line) continue;
    if (line.includes(':')) line = line.slice(line.indexOf(':') + 1).trim();
    if (!line) continue;
    if (line.toLowerCase() === target) {
      arcadeCm.addLineClass(i, 'background', 'cm-active-step');
      arcadeCm.scrollIntoView({ line: i, ch: 0 }, 60);
      arcadeActiveLine = i;
      return;
    }
  }
}

// ── Editor ──────────────────────────────────────────────────────────────────

function ensureEditor() {
  if (arcadeCm) return;
  arcadeCm = CodeMirror(arcadeEditorHost, {
    mode:  'nasm',
    theme: 'nasm-dark',
    lineNumbers:    true,
    tabSize:        4,
    indentWithTabs: false,
    lineWrapping:   false,
    extraKeys: { 'Ctrl-Enter': runCode, Tab: cm => cm.replaceSelection('    ') },
  });
}

// ── Run ─────────────────────────────────────────────────────────────────────

// Run from a fresh world up to `maxSteps` instructions (or to halt). Used by
// both Run (maxSteps undefined → 500) and Step (maxSteps = arcadeStepIdx).
function executeUpTo(maxSteps) {
  activeWorld = activeLevel.makeWorld();
  arcadeSim.syscallTable = {};
  activeGame.installSyscalls(arcadeSim, activeWorld);
  const opts = maxSteps != null ? { maxSteps } : undefined;
  const result = arcadeSim.runAll(arcadeCm.getValue(), opts);
  activeGame.render(activeWorld, arcadeWorldPanel, arcadeSim);
  renderHud(arcadeSim);
  return result;
}

function runCode() {
  if (!activeLevel || !activeGame) return;
  arcadeErrorBanner.style.display = 'none';
  arcadeErrorBanner.textContent = '';
  clearActiveLine();

  const result = executeUpTo();
  arcadeStepIdx = result.steps || 0;
  arcadeBackStepBtn.disabled = arcadeStepIdx === 0;

  if (result.error) {
    arcadeErrorBanner.style.display = 'block';
    arcadeErrorBanner.textContent = `Parse error: ${result.error}`;
    return;
  }
  const lastStep = result.history[result.history.length - 1];
  if (lastStep && lastStep.error) {
    arcadeErrorBanner.style.display = 'block';
    arcadeErrorBanner.textContent = `Runtime error at "${lastStep.instr.raw}": ${lastStep.error}`;
    return;
  }

  const v = activeLevel.validate(activeWorld, arcadeSim);
  lastResult = { ok: v.ok, message: v.message, steps: result.steps, par: activeLevel.par };
  arcadeStepCounter.textContent = `${result.steps} steps · par ${activeLevel.par}`;

  if (v.ok) {
    saveBest(activeGame.id, activeLevel.id, result.steps);
    const underPar = result.steps <= activeLevel.par;
    arcadeStatus.className = 'arcade-status pass' + (underPar ? ' under-par' : '');
    arcadeStatus.textContent = underPar
      ? `✓ Level complete — under par (${result.steps} ≤ ${activeLevel.par})`
      : `✓ Level complete (${result.steps} steps; par ${activeLevel.par} — try to shorten it)`;
  } else {
    arcadeStatus.className = 'arcade-status fail';
    arcadeStatus.textContent = `✗ ${v.message}`;
  }

  if (result.hitLimit) {
    arcadeErrorBanner.style.display = 'block';
    arcadeErrorBanner.textContent = 'Step limit reached — likely infinite loop.';
  }
}

// Step: re-run program from scratch with one more instruction allowed than
// before. World resets each press, then advances to the new step boundary.
function stepOne() {
  if (!activeLevel || !activeGame) return;
  arcadeErrorBanner.style.display = 'none';
  arcadeErrorBanner.textContent = '';

  const target = arcadeStepIdx + 1;
  const result = executeUpTo(target);

  if (result.error) {
    arcadeErrorBanner.style.display = 'block';
    arcadeErrorBanner.textContent = `Parse error: ${result.error}`;
    clearActiveLine();
    return;
  }
  arcadeStepIdx = result.steps;
  arcadeBackStepBtn.disabled = arcadeStepIdx === 0;

  const last = result.history[result.history.length - 1];
  if (last && last.error) {
    arcadeErrorBanner.style.display = 'block';
    arcadeErrorBanner.textContent = `Runtime error at "${last.instr.raw}": ${last.error}`;
    highlightInstruction(last.instr);
    arcadeStatus.className = 'arcade-status';
    arcadeStatus.textContent = '';
    arcadeStepCounter.textContent = `step ${arcadeStepIdx} · halted`;
    return;
  }

  // Program halted on its own (last instr was sys_exit etc.)
  if (last) highlightInstruction(last.instr);

  // If we asked for N steps and got fewer, program ended → validate now.
  const halted = result.steps < target;
  if (halted) {
    const v = activeLevel.validate(activeWorld, arcadeSim);
    lastResult = { ok: v.ok, message: v.message, steps: result.steps, par: activeLevel.par };
    arcadeStepCounter.textContent = `step ${arcadeStepIdx} (halted) · par ${activeLevel.par}`;
    if (v.ok) {
      saveBest(activeGame.id, activeLevel.id, result.steps);
      const underPar = result.steps <= activeLevel.par;
      arcadeStatus.className = 'arcade-status pass' + (underPar ? ' under-par' : '');
      arcadeStatus.textContent = underPar
        ? `✓ Level complete — under par (${result.steps} ≤ ${activeLevel.par})`
        : `✓ Level complete (${result.steps} steps; par ${activeLevel.par})`;
    } else {
      arcadeStatus.className = 'arcade-status fail';
      arcadeStatus.textContent = `✗ ${v.message}`;
    }
  } else {
    arcadeStatus.className = 'arcade-status';
    arcadeStatus.textContent = '';
    arcadeStepCounter.textContent = `step ${arcadeStepIdx}` +
      (last ? ` · ${last.instr.raw}` : '');
  }
}

function stepBack() {
  if (!activeLevel || !activeGame || arcadeStepIdx <= 0) return;
  arcadeErrorBanner.style.display = 'none';
  arcadeErrorBanner.textContent = '';
  arcadeStepIdx--;

  if (arcadeStepIdx === 0) {
    resetWorld();
    clearActiveLine();
    arcadeStatus.className = 'arcade-status';
    arcadeStatus.textContent = '';
    arcadeStepCounter.textContent = '';
    arcadeBackStepBtn.disabled = true;
    return;
  }
  const result = executeUpTo(arcadeStepIdx);
  const last = result.history[result.history.length - 1];
  if (last) highlightInstruction(last.instr);
  arcadeStatus.className = 'arcade-status';
  arcadeStatus.textContent = '';
  arcadeStepCounter.textContent = `step ${arcadeStepIdx}` +
    (last ? ` · ${last.instr.raw}` : '');
}

// ── Wiring ──────────────────────────────────────────────────────────────────

let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  arcadeBackBtn.addEventListener('click', () => {
    if (arcadeView === 'level')      openGame(activeGame.id);
    else if (arcadeView === 'levels') renderPicker();
  });
  arcadeRunBtn.addEventListener('click', runCode);
  arcadeStepBtn.addEventListener('click', stepOne);
  arcadeBackStepBtn.addEventListener('click', stepBack);
  arcadeResetBtn.addEventListener('click', () => {
    if (activeLevel) arcadeCm.setValue(activeLevel.starter || '');
    resetWorld();
    clearStatus();
  });
  arcadeSolutionBtn.addEventListener('click', () => {
    if (arcadeSolutionBtn.disabled) return;
    const open = arcadeSolutionBox.style.display === 'block';
    arcadeSolutionBox.style.display = open ? 'none' : 'block';
    arcadeSolutionBtn.textContent = open ? 'Show solution' : 'Hide solution';
    if (!open) arcadeSolutionBox.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  arcadeHintBtn.addEventListener('click', () => {
    const open = arcadeHint.style.display === 'block';
    arcadeHint.style.display = open ? 'none' : 'block';
    arcadeHintBtn.textContent = open ? 'Show hint' : 'Hide hint';
    if (!open) arcadeHint.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// ── Public show / hide ──────────────────────────────────────────────────────

window.showArcade = function () {
  if (!arcadeWrap) resolveDom();
  wireOnce();
  arcadeWrap.style.display = '';
  document.getElementById('main-layout').style.display = 'none';
  renderPicker();
};

window.hideArcade = function () {
  if (!arcadeWrap) resolveDom();
  if (arcadeWrap) arcadeWrap.style.display = 'none';
  const main = document.getElementById('main-layout');
  if (main) main.style.display = '';
};
