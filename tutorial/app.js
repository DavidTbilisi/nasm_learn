'use strict';

const sim = new NASMSimulator();
let currentLesson = 0;
let runResult = null;    // { history, instructions, finalState, ... }
let stepIndex  = -1;     // -1 = before run, 0..n = history index
let activeStepLine = -1; // CodeMirror line currently highlighted

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cm           = window.cmEditor;   // CodeMirror instance from nasm-mode.js
const btnRun       = document.getElementById('btn-run');
const btnStep      = document.getElementById('btn-step');
const btnPrev      = document.getElementById('btn-prev');
const btnReset     = document.getElementById('btn-reset');
const regTable     = document.getElementById('reg-table');
const flagBar      = document.getElementById('flag-bar');
const stackPanel   = document.getElementById('stack-panel');
const stepLog      = document.getElementById('step-log');
const lessonTitle  = document.getElementById('lesson-title');
const lessonIntro  = document.getElementById('lesson-intro');
const lessonWidget = document.getElementById('lesson-widget');
const conceptsList = document.getElementById('concepts-list');
const diagramPre   = document.getElementById('diagram-pre');
const exerciseBox  = document.getElementById('exercise-box');
const hintBox      = document.getElementById('hint-box');
const hintBtn      = document.getElementById('hint-btn');
const solutionBox  = document.getElementById('solution-box');
const solutionBtn  = document.getElementById('solution-btn');
const tabBtns      = document.querySelectorAll('.tab-btn');
const stepCounter  = document.getElementById('step-counter');
const errorBanner  = document.getElementById('error-banner');

// ── Utilities ─────────────────────────────────────────────────────────────────

function hex(n) { return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8,'0'); }
function hexShort(n) { return '0x' + (n >>> 0).toString(16).toUpperCase(); }

function renderRegs(state, prevState) {
  const REG_NAMES = ['eax','ebx','ecx','edx','esi','edi','esp','ebp'];
  regTable.innerHTML = REG_NAMES.map(r => {
    const val = state.regs[r];
    const changed = prevState && prevState.regs[r] !== val;
    return `<tr class="${changed ? 'changed' : ''}">
      <td class="reg-name">${r.toUpperCase()}</td>
      <td class="reg-hex">${hex(val)}</td>
      <td class="reg-dec">${val >>> 0}</td>
    </tr>`;
  }).join('');
}

function renderFlags(state, prevState) {
  flagBar.innerHTML = ['zf','cf','sf','of','df'].map(f => {
    const val = state.flags[f];
    const changed = prevState && prevState.flags[f] !== val;
    return `<span class="flag ${val ? 'flag-set' : 'flag-clear'} ${changed ? 'changed' : ''}" data-flag="${f}">
      <span class="flag-name">${f.toUpperCase()}</span><span class="flag-val">${val}</span>
    </span>`;
  }).join('');
}

function renderStack(state) {
  const stackEntries = [];
  for (let a = 0x2000 - 4; a >= state.regs.esp && a >= 0; a -= 4) {
    const v = (state.mem[a]??0) | ((state.mem[a+1]??0)<<8) |
              ((state.mem[a+2]??0)<<16) | ((state.mem[a+3]??0)<<24);
    if (v !== 0 || a === state.regs.esp) stackEntries.push([a, v>>>0]);
  }

  const stdoutLines = state.stdout ?? [];
  let html = '';

  if (stdoutLines.length) {
    html += `<div class="stdout-label">stdout</div>`;
    html += stdoutLines.map(l =>
      `<div class="stdout-line">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'↵')}</div>`
    ).join('');
    if (state.exitCode !== null && state.exitCode !== undefined)
      html += `<div class="stdout-exit">exit code: ${state.exitCode}</div>`;
    html += '<hr class="stack-sep">';
  }

  if (!stackEntries.length) {
    html += '<span class="empty-note">Stack is empty</span>';
  } else {
    html += stackEntries.map(([addr, val]) => {
      const isEsp = addr === state.regs.esp;
      const isEbp = addr === state.regs.ebp;
      const label = isEsp ? ' ← ESP' : (isEbp ? ' ← EBP' : '');
      return `<div class="stack-row${isEsp ? ' stack-top' : ''}">
        <span class="stack-addr">${hexShort(addr)}</span>
        <span class="stack-val">${hex(val)}</span>
        <span class="stack-label">${label}</span>
      </div>`;
    }).join('');
  }

  stackPanel.innerHTML = html;
}

function renderState(state, prevState) {
  renderRegs(state, prevState);
  renderFlags(state, prevState);
  renderStack(state);
}

// ── Line highlighting via CodeMirror API ──────────────────────────────────────

function clearStepHighlight() {
  if (activeStepLine >= 0) {
    cm.removeLineClass(activeStepLine, 'background', 'cm-active-step');
    activeStepLine = -1;
  }
}

function highlightLine(ip, instructions) {
  clearStepHighlight();
  if (ip < 0 || !instructions || ip >= instructions.length) return;

  const targetRaw = instructions[ip].raw.trim().toLowerCase();
  const lineCount  = cm.lineCount();

  for (let i = 0; i < lineCount; i++) {
    let line = cm.getLine(i);
    const ci = line.indexOf(';');
    if (ci !== -1) line = line.slice(0, ci);
    line = line.trim();
    if (!line) continue;
    if (line.includes(':')) line = line.slice(line.indexOf(':') + 1).trim();
    if (!line) continue;
    if (line.toLowerCase() === targetRaw) {
      cm.addLineClass(i, 'background', 'cm-active-step');
      cm.scrollIntoView({ line: i, ch: 0 }, 60);
      activeStepLine = i;
      return;
    }
  }
}

// ── Log helpers ───────────────────────────────────────────────────────────────

function appendLog(msg, cls='') {
  const div = document.createElement('div');
  div.className = 'log-entry ' + cls;
  div.textContent = msg;
  stepLog.appendChild(div);
  stepLog.scrollTop = stepLog.scrollHeight;
}

function clearLog() { stepLog.innerHTML = ''; }
function showError(msg) { errorBanner.textContent = msg; errorBanner.style.display = 'block'; }
function hideError()     { errorBanner.style.display = 'none'; }

function updateStepCounter() {
  if (!runResult) { stepCounter.textContent = ''; return; }
  const cur = stepIndex < 0 ? 0 : stepIndex + 1;
  stepCounter.textContent = `Step ${cur} / ${runResult.history.length}`;
}

// ── Controls ──────────────────────────────────────────────────────────────────

function doReset() {
  runResult = null;
  stepIndex = -1;
  hideError();
  clearLog();
  clearStepHighlight();
  stepCounter.textContent = '';
  const blank = {
    regs:  { eax:0,ebx:0,ecx:0,edx:0,esi:0,edi:0,esp:0x2000,ebp:0x2000 },
    flags: { zf:0, cf:0, sf:0, of:0, df:0 },
    mem:   {}, stdout: [], exitCode: null,
  };
  renderState(blank, null);
  btnPrev.disabled = true;
  btnStep.textContent = 'Step ▶';
}

function doRun() {
  hideError();
  clearLog();
  runResult = sim.runAll(cm.getValue());

  if (runResult.error) { showError(runResult.error); return; }
  if (!runResult.history.length) { appendLog('No instructions executed.', 'log-warn'); return; }
  if (runResult.hitLimit) appendLog('⚠ Execution stopped: step limit reached (possible infinite loop).', 'log-warn');

  const lastStep = runResult.history[runResult.history.length - 1];
  if (lastStep?.error) showError(`Error at "${lastStep.instr.raw}": ${lastStep.error}`);

  const prev = runResult.history.length > 1 ? runResult.history[runResult.history.length-2].before : null;
  renderState(runResult.finalState, prev);

  appendLog(`Executed ${runResult.steps} instruction(s).`, 'log-info');
  stepIndex = runResult.history.length - 1;
  updateStepCounter();
  clearStepHighlight();
  btnPrev.disabled = false;
  btnStep.textContent = 'Restart ↺';
}

function doStep() {
  if (!runResult || stepIndex >= runResult.history.length - 1) {
    hideError();
    clearLog();
    runResult = sim.runAll(cm.getValue());
    if (runResult.error) { showError(runResult.error); runResult = null; return; }
    if (!runResult.history.length) { appendLog('No instructions.', 'log-warn'); return; }
    stepIndex = 0;
  } else {
    stepIndex++;
  }

  const entry    = runResult.history[stepIndex];
  const prevEntry= stepIndex > 0 ? runResult.history[stepIndex-1] : null;
  const dispState= stepIndex < runResult.history.length - 1 ? entry.before : runResult.finalState;

  renderState(dispState, prevEntry ? prevEntry.before : null);
  highlightLine(entry.before.ip, runResult.instructions);

  let msg = `[${stepIndex+1}] ${entry.instr.raw}`;
  if (entry.branch) msg += entry.branch.taken ? ` → taken (${entry.branch.target})` : ' → not taken';
  if (entry.error)  msg += ` ✗ ${entry.error}`;
  appendLog(msg, entry.error ? 'log-error' : '');

  updateStepCounter();
  btnPrev.disabled = stepIndex <= 0;
  btnStep.textContent = stepIndex >= runResult.history.length - 1 ? 'Restart ↺' : 'Step ▶';

  if (stepIndex >= runResult.history.length - 1) {
    appendLog('— end of program —', 'log-info');
    renderState(runResult.finalState, entry.before);
    clearStepHighlight();
  }
}

function doPrev() {
  if (!runResult || stepIndex <= 0) return;
  stepIndex--;
  const entry    = runResult.history[stepIndex];
  const prevEntry= stepIndex > 0 ? runResult.history[stepIndex-1] : null;
  renderState(entry.before, prevEntry ? prevEntry.before : null);
  highlightLine(entry.before.ip, runResult.instructions);
  updateStepCounter();
  btnPrev.disabled = stepIndex <= 0;
  btnStep.textContent = 'Step ▶';
  clearLog();
  for (let i = 0; i <= stepIndex; i++) {
    const e = runResult.history[i];
    let msg = `[${i+1}] ${e.instr.raw}`;
    if (e.branch) msg += e.branch.taken ? ` → taken (${e.branch.target})` : ' → not taken';
    appendLog(msg, e.error ? 'log-error' : '');
  }
}

btnRun.addEventListener('click', doRun);
btnStep.addEventListener('click', () => {
  if (runResult && stepIndex >= runResult.history.length - 1) doReset();
  else doStep();
});
btnPrev.addEventListener('click', doPrev);
btnReset.addEventListener('click', doReset);

cm.on('change', () => {
  runResult = null; stepIndex = -1;
  clearStepHighlight();
  stepCounter.textContent = '';
  btnStep.textContent = 'Step ▶';
});

// ── Lesson rendering ──────────────────────────────────────────────────────────

function loadLesson(idx) {
  currentLesson = idx;
  const lesson = LESSONS[idx];

  tabBtns.forEach((b,i) => b.classList.toggle('active', i === idx));

  lessonTitle.innerHTML = `<span class="lesson-num">${lesson.id}</span> ${lesson.title}`;
  lessonIntro.textContent = lesson.intro;

  conceptsList.innerHTML = lesson.concepts.map(c =>
    `<li><strong>${c.name}</strong><span class="concept-desc">${c.desc}</span></li>`
  ).join('');

  diagramPre.textContent = lesson.diagram || '';
  diagramPre.style.display = lesson.diagram ? 'block' : 'none';

  if (lesson.widget) {
    lessonWidget.innerHTML  = lesson.widget;
    lessonWidget.style.display = 'block';
    if (lesson.setupWidget === 'endian') setupEndianWidget();
  } else {
    lessonWidget.innerHTML  = '';
    lessonWidget.style.display = 'none';
  }

  exerciseBox.textContent = lesson.exercise.prompt;
  hintBox.textContent     = lesson.exercise.hint;
  hintBox.style.display   = 'none';
  hintBtn.textContent     = 'Show hint';

  solutionBox.textContent = lesson.exercise.solution ?? '';
  solutionBox.style.display = 'none';
  solutionBtn.textContent = 'Show solution';
  solutionBtn.disabled = !lesson.exercise.solution;
  solutionBtn.style.opacity = lesson.exercise.solution ? '' : '0.45';

  cm.setValue(lesson.code.trim());
  cm.clearHistory();
  doReset();
}

tabBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('gym-tab')) {
      window.hideQuiz?.();
      window.hidePlayground?.();
      window.hideRank?.();
      window.showGym?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('quiz-tab')) {
      window.hideGym?.();
      window.hidePlayground?.();
      window.hideRank?.();
      window.showQuiz?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('playground-tab')) {
      window.hideGym?.();
      window.hideQuiz?.();
      window.hideRank?.();
      window.showPlayground?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('rank-tab')) {
      window.hideGym?.();
      window.hideQuiz?.();
      window.hidePlayground?.();
      window.showRank?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    window.hideGym?.();
    window.hideQuiz?.();
    window.hidePlayground?.();
    window.hideRank?.();
    loadLesson(i);
  });
});

/** Jump to a main lesson tab (0–14) from Rank recommendations. */
window.goToLessonTab = lessonIdx => {
  if (lessonIdx < 0 || lessonIdx > 14) return;
  window.hideRank?.();
  window.hideGym?.();
  window.hideQuiz?.();
  window.hidePlayground?.();
  const tabs = document.querySelectorAll('.tab-btn');
  const btn = tabs[lessonIdx];
  if (btn) btn.click();
};

hintBtn.addEventListener('click', () => {
  const visible = hintBox.style.display === 'block';
  hintBox.style.display = visible ? 'none' : 'block';
  hintBtn.textContent = visible ? 'Show hint' : 'Hide hint';
});

// ── Flag bar: delayed tooltips (x86 EFLAGS subset) ─────────────────────────────
const FLAG_TOOLTIP_DELAY_MS = 5000;
const FLAG_HELP = {
  zf: 'Zero flag (ZF): 1 if the last arithmetic or logical result was zero; 0 otherwise. Conditional jumps like JE/JNE test this.',
  cf: 'Carry flag (CF): 1 if unsigned addition carried out of bit 31, or subtraction needed a borrow. Used by JC/JNC and unsigned high/low comparisons (JA/JB).',
  sf: 'Sign flag (SF): 1 if bit 31 of the result is set — the value is negative in signed (two\'s complement) interpretation.',
  of: 'Overflow flag (OF): 1 if a signed operation produced a result too large or too small for 32-bit two\'s complement. Distinct from CF (unsigned overflow).',
  df: 'Direction flag (DF): Controls string instructions (MOVS/CMPS/SCAS/STOS). CLD clears DF (forward, low→high addresses); STD sets DF (backward).',
};

(function setupFlagBarTooltips() {
  let timer = null;
  let hoverFlagEl = null;
  const tip = document.createElement('div');
  tip.id = 'flag-tooltip';
  tip.className = 'flag-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);

  function hideFlagTooltip() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    hoverFlagEl = null;
    tip.hidden = true;
    tip.textContent = '';
  }

  function positionTip(anchor) {
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.bottom + gap;
    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
    if (top + th > window.innerHeight - margin) top = r.top - th - gap;
    top = Math.max(margin, top);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  flagBar.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.flag');
    if (!el || !flagBar.contains(el)) return;
    if (hoverFlagEl === el) return;
    hideFlagTooltip();
    const key = el.dataset.flag;
    if (!key || !FLAG_HELP[key]) return;
    hoverFlagEl = el;
    timer = setTimeout(() => {
      timer = null;
      if (hoverFlagEl !== el) return;
      tip.textContent = FLAG_HELP[key];
      requestAnimationFrame(() => positionTip(el));
    }, FLAG_TOOLTIP_DELAY_MS);
  });

  flagBar.addEventListener('mouseout', (e) => {
    const el = e.target.closest('.flag');
    if (!el || !flagBar.contains(el)) return;
    const next = e.relatedTarget;
    if (next && (el === next || el.contains(next))) return;
    hideFlagTooltip();
  });

  window.addEventListener('scroll', hideFlagTooltip, true);
  window.addEventListener('resize', hideFlagTooltip);
})();

solutionBtn.addEventListener('click', () => {
  if (solutionBtn.disabled) return;
  const visible = solutionBox.style.display === 'block';
  solutionBox.style.display = visible ? 'none' : 'block';
  solutionBtn.textContent = visible ? 'Show solution' : 'Hide solution';
});

// ── Widget: byte-order explorer (lesson 13) ───────────────────────────────────

function setupEndianWidget() {
  const inp = document.getElementById('endian-input');
  const err = document.getElementById('endian-error');
  const le  = document.getElementById('endian-le');
  const be  = document.getElementById('endian-be');
  if (!inp || !le || !be) return;

  function parseInput(s) {
    s = s.trim().toLowerCase();
    if (s === '') return NaN;
    if (s.startsWith('0x'))  return parseInt(s.slice(2), 16);
    if (s.startsWith('0b'))  return parseInt(s.slice(2), 2);
    if (/^[0-9]+$/.test(s))  return parseInt(s, 10);
    if (/^[0-9a-f]+$/.test(s)) return parseInt(s, 16);
    return NaN;
  }

  function byteCell(addr, byte) {
    const ascii = (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '·';
    return `<div class="endian-cell">
      <div class="endian-addr">A+${addr}</div>
      <div class="endian-byte">${byte.toString(16).toUpperCase().padStart(2,'0')}</div>
      <div class="endian-ascii">'${ascii}'</div>
    </div>`;
  }

  function update() {
    const v = parseInput(inp.value);
    if (isNaN(v) || v < 0 || v > 0xFFFFFFFF) {
      err.textContent = 'Enter a 32-bit value: 0x… hex, 0b… binary, or decimal.';
      le.innerHTML = '';
      be.innerHTML = '';
      return;
    }
    err.textContent = '';
    const u = v >>> 0;
    const b0 =  u        & 0xFF;
    const b1 = (u >>> 8) & 0xFF;
    const b2 = (u >>> 16) & 0xFF;
    const b3 = (u >>> 24) & 0xFF;
    le.innerHTML = byteCell(0, b0) + byteCell(1, b1) + byteCell(2, b2) + byteCell(3, b3);
    be.innerHTML = byteCell(0, b3) + byteCell(1, b2) + byteCell(2, b1) + byteCell(3, b0);
  }

  inp.addEventListener('input', update);
  update();
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadLesson(0);
doReset();
