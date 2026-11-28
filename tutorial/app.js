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
const memPanel     = document.getElementById('mem-panel');
const outputPanel  = document.getElementById('output-panel');
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
const checkBtn     = document.getElementById('check-btn');
const answerWrap   = document.getElementById('answer-wrap');
const answerInput  = document.getElementById('answer-input');
const exResult     = document.getElementById('exercise-result');
const stepCounter  = document.getElementById('step-counter');

// ── ASM / C view toggle ───────────────────────────────────────────────────────
// The C pane shows each lesson's hand-written C version (lesson.c), read-only.
const VIEW_KEY   = 'nasm-code-view';
const codePanes  = document.getElementById('code-panes');
const cView      = CodeMirror(document.getElementById('c-host'), {
  mode: 'text/x-csrc', theme: 'nasm-dark', lineNumbers: true, readOnly: true, viewportMargin: Infinity,
});
// In 3D view the editor highlight follows the animation: the instruction being replayed.
const cpu3d = Cpu3D.mount(document.getElementById('cpu-pane'), {
  onInstr: k => {
    if (codePanes.dataset.view === 'cpu' && runResult) highlightLine(runResult.history[k].before.ip, runResult.instructions);
  },
});

function setCodeView(view) {
  if (!['asm', 'split', 'c', 'cpu'].includes(view)) view = 'asm';
  codePanes.dataset.view = view;
  document.querySelectorAll('#code-view [data-view]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  try { localStorage.setItem(VIEW_KEY, view); } catch (_) {}
  window.refreshLayout?.();   // 3D view has its own editor height
  if (runResult && stepIndex >= 0) {
    if (view === 'cpu') cpu3d.update(runResult, stepIndex, false);
    else if (stepIndex < runResult.history.length - 1) highlightLine(runResult.history[stepIndex].before.ip, runResult.instructions);
    else clearStepHighlight();
  }
  cm.refresh();      // CodeMirror mis-measures after display:none, so re-measure both
  cView.refresh();
}
document.querySelectorAll('#code-view [data-view]').forEach(b =>
  b.addEventListener('click', () => setCodeView(b.dataset.view)));
setCodeView((() => { try { return localStorage.getItem(VIEW_KEY); } catch (_) { return null; } })());
const errorBanner  = document.getElementById('error-banner');

// ── Utilities ─────────────────────────────────────────────────────────────────

function hex(n, digits = 8) { return '0x' + BigInt.asUintN(digits * 4, BigInt(n)).toString(16).toUpperCase().padStart(digits, '0'); }
function hexShort(n) { return '0x' + (n >>> 0).toString(16).toUpperCase(); }

// Fresh machine state for this source: 16 x 64-bit registers under `bits 64`, else 8 x 32-bit.
function blankState(code) {
  const s = NASMSimulator.create(code);
  return { regs: { ...s.regs }, flags: { ...s.flags }, mem: {}, stdout: [], exitCode: null };
}

// Register table, shared with the Playground. 64-bit runs hold BigInt registers.
function renderRegs(el, state, prevState) {
  const wide = 'rax' in state.regs;
  const names = wide ? NASMSimulator64.GPR : NASMSimulator.REG32;
  el.innerHTML = names.map(r => {
    const val = state.regs[r];
    const changed = prevState && prevState.regs[r] !== val;
    return `<tr class="${changed ? 'changed' : ''}">
      <td class="reg-name">${r.toUpperCase()}</td>
      <td class="reg-hex">${hex(val, wide ? 16 : 8)}</td>
      <td class="reg-dec">${val}</td>
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

// Stack window, shared with the Playground: 4-byte slots, or 8-byte slots in 64-bit mode.
function renderStack(el, state) {
  const wide = 'rsp' in state.regs, w = wide ? 8 : 4;
  const sp = Number(wide ? state.regs.rsp : state.regs.esp), bp = Number(wide ? state.regs.rbp : state.regs.ebp);
  const entries = [];
  for (let a = 0x2000 - w; a >= sp && a >= 0; a -= w) {
    let v = 0n;
    for (let i = w - 1; i >= 0; i--) v = (v << 8n) | BigInt(state.mem[a + i] ?? 0);
    if (v !== 0n || a === sp) entries.push([a, v]);
  }
  el.innerHTML = !entries.length ? '<span class="empty-note">Stack is empty</span>' : entries.map(([addr, val]) => {
    const label = addr === sp ? (wide ? ' ← RSP' : ' ← ESP') : addr === bp ? (wide ? ' ← RBP' : ' ← EBP') : '';
    return `<div class="stack-row${addr === sp ? ' stack-top' : ''}">
        <span class="stack-addr">${hexShort(addr)}</span>
        <span class="stack-val">${hex(val, w * 2)}</span>
        <span class="stack-label">${label}</span>
      </div>`;
  }).join('');
}

function renderState(state, prevState) {
  renderRegs(regTable, state, prevState);
  renderFlags(state, prevState);
  renderStack(stackPanel, state);
  renderMemory(memPanel, state, prevState, runResult?.dataLabels);
  renderOutput(outputPanel, state);
}

// Memory window: hex + ASCII dump of .data/.bss, 8 bytes a row, bytes the last step
// changed highlighted. Shared with the Playground.
function renderMemory(el, state, prev, dataLabels = {}) {
  const base = NASMSimulator.DATA_BASE;
  const addrs = Object.keys(state.mem).map(Number).filter(a => a >= base);
  if (!addrs.length) {
    el.innerHTML = '<span class="empty-note">No .data / .bss bytes yet. Declare some data, then Run or Step.</span>';
    return;
  }
  const end = Math.min(Math.max(...addrs) + 1, base + 512);  // shortcut: first 512 bytes only, raise if lessons outgrow it
  const names = {};
  for (const [n, a] of Object.entries(dataLabels)) (names[a & ~7] ??= []).push(n);
  const esc = c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c);
  let html = '';
  for (let row = base; row < end; row += 8) {
    let bytes = '', ascii = '';
    for (let a = row; a < row + 8; a++) {
      const b = state.mem[a] ?? 0;
      const changed = prev && (prev.mem[a] ?? 0) !== b ? ' changed' : '';
      bytes += `<span class="mem-byte${changed}">${b.toString(16).toUpperCase().padStart(2, '0')}</span>`;
      ascii += b >= 0x20 && b < 0x7f ? esc(String.fromCharCode(b)) : '·';
    }
    html += `<div class="mem-row"><span class="mem-addr">${hexShort(row)}</span>${bytes}` +
            `<span class="mem-ascii">${ascii}</span><span class="mem-label">${(names[row] ?? []).join(' ')}</span></div>`;
  }
  el.innerHTML = html;
}

// Breakpoints: click the gutter left of the line numbers. Run stops *before* a marked
// line executes; Run again continues to the next one. Shared with the Playground.
function enableBreakpoints(editor) {
  editor.setOption('gutters', ['cm-breakpoints', 'CodeMirror-linenumbers']);
  editor.on('gutterClick', (ed, line) => {
    let mark = null;
    if (!ed.lineInfo(line).gutterMarkers?.['cm-breakpoints']) {
      mark = document.createElement('span');
      mark.className = 'bp-marker';
      mark.textContent = '●';
    }
    ed.setGutterMarker(line, 'cm-breakpoints', mark);
  });
}

// First history index after `from` whose instruction sits on a breakpoint line, else -1.
function nextBreakpoint(editor, run, from) {
  for (let i = from + 1; i < run.history.length; i++) {
    if (editor.lineInfo(run.history[i].instr.line)?.gutterMarkers?.['cm-breakpoints']) return i;
  }
  return -1;
}

// Output window: everything the program wrote, joined the way a terminal shows it
// (two writes without a newline land on one line). Shared with the Playground.
function renderOutput(el, state) {
  const out = (state.stdout ?? []).join('');
  const exited = state.exitCode !== null && state.exitCode !== undefined;
  if (!out && !exited) {
    el.innerHTML = '<span class="empty-note">No output yet. Print with sys_write: eax = 4, ebx = 1, ecx = buffer, edx = length, int 0x80.</span>';
    return;
  }
  el.textContent = out;
  if (exited) {
    const x = document.createElement('div');
    x.className = 'output-exit';
    x.textContent = `[process exited with code ${state.exitCode}]`;
    el.append(x);
  }
}

// ── Line highlighting via CodeMirror API ──────────────────────────────────────

let activeCLine = -1; // C-pane line currently highlighted

function clearStepHighlight() {
  if (activeStepLine >= 0) {
    cm.removeLineClass(activeStepLine, 'background', 'cm-active-step');
    activeStepLine = -1;
  }
  if (activeCLine >= 0) {
    cView.removeLineClass(activeCLine, 'background', 'cm-active-step');
    activeCLine = -1;
  }
}

// C line for instruction ip: each C line's `// ...` comment names the asm it stands for.
// Walk the instructions in order, searching forward from the last hit, so a repeated
// instruction (two `mov eax, -32`) maps to its own copy. -1 = no C line names it.
function cLineFor(instructions, ip) {
  const norm = t => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const comments = cView.getValue().split('\n').map(l => {
    const i = l.indexOf('//');
    return i < 0 ? '' : norm(l.slice(i + 2));
  });
  let from = 0, hit = -1;
  for (let n = 0; n <= ip; n++) {
    const ins = norm(instructions[n].raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|\\W)' + ins + '(?!\\w)');
    hit = -1;
    for (let k = 0; k < comments.length; k++) {
      const j = (from + k) % comments.length;
      if (re.test(comments[j])) { hit = from = j; break; }
    }
  }
  return hit;
}

function highlightLine(ip, instructions) {
  clearStepHighlight();
  if (ip < 0 || !instructions || ip >= instructions.length) return;

  activeStepLine = instructions[ip].line;
  cm.addLineClass(activeStepLine, 'background', 'cm-active-step');
  cm.scrollIntoView({ line: activeStepLine, ch: 0 }, 60);

  activeCLine = cLineFor(instructions, ip);
  if (activeCLine >= 0) {
    cView.addLineClass(activeCLine, 'background', 'cm-active-step');
    cView.scrollIntoView({ line: activeCLine, ch: 0 }, 60);
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
  renderState(blankState(cm.getValue()), null);
  cpu3d.update(null, -1, false);
  btnPrev.disabled = true;
  btnStep.textContent = 'Step ▶';
}

function doRun() {
  // Mid-run (stepping or paused at a breakpoint), Run continues from the current step.
  if (!runResult || stepIndex >= runResult.history.length - 1) {
    hideError();
    clearLog();
    runResult = NASMSimulator.create(cm.getValue()).runAll(cm.getValue());
    stepIndex = -1;
    if (runResult.error) { showError(runResult.error); runResult = null; return; }
    if (!runResult.history.length) { appendLog('No instructions executed.', 'log-warn'); runResult = null; return; }
  }
  const bp = nextBreakpoint(cm, runResult, stepIndex);
  if (bp >= 0) {
    gotoStep(bp);
    appendLog(`● breakpoint, line ${runResult.history[bp].instr.line + 1}. Run again to continue.`, 'log-info');
    return;
  }
  clearLog();
  if (runResult.hitLimit) appendLog('⚠ Execution stopped: step limit reached (possible infinite loop).', 'log-warn');

  const lastStep = runResult.history[runResult.history.length - 1];
  if (lastStep?.error) showError(`Error at "${lastStep.instr.raw}": ${lastStep.error}`);

  const prev = runResult.history.length > 1 ? runResult.history[runResult.history.length-2].before : null;
  renderState(runResult.finalState, prev);

  appendLog(`Executed ${runResult.steps} instruction(s).`, 'log-info');
  stepIndex = runResult.history.length - 1;
  updateStepCounter();
  clearStepHighlight();
  cpu3d.update(runResult, stepIndex, false);
  btnPrev.disabled = false;
  btnStep.textContent = 'Restart ↺';
}

function doStep() {
  if (!runResult || stepIndex >= runResult.history.length - 1) {
    hideError();
    clearLog();
    runResult = NASMSimulator.create(cm.getValue()).runAll(cm.getValue());
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
  cpu3d.update(runResult, stepIndex, true);
}

function doPrev() {
  if (!runResult || stepIndex <= 0) return;
  gotoStep(stepIndex - 1);
}

// Show the state just before history[i] runs, with its line highlighted and the log rebuilt.
function gotoStep(i) {
  stepIndex = i;
  const entry    = runResult.history[stepIndex];
  const prevEntry= stepIndex > 0 ? runResult.history[stepIndex-1] : null;
  renderState(entry.before, prevEntry ? prevEntry.before : null);
  highlightLine(entry.before.ip, runResult.instructions);
  cpu3d.update(runResult, stepIndex, false);
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
enableBreakpoints(cm);

cm.on('change', () => {
  runResult = null; stepIndex = -1;
  clearStepHighlight();
  stepCounter.textContent = '';
  btnStep.textContent = 'Step ▶';
});

// ── Progress: passed exercises + last lesson opened ──────────────────────────
const PROGRESS_KEY = 'nasm-progress';
const progress = (() => {
  try { const p = JSON.parse(localStorage.getItem(PROGRESS_KEY)); if (p && Array.isArray(p.done)) return p; } catch (_) {}
  return { done: [], last: 0 };
})();
function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {} }
function renderProgress() {
  LESSONS.forEach((l, i) => tabBtns[i]?.classList.toggle('done', progress.done.includes(l.id)));
}

function showResult(res) {
  exResult.hidden = false;
  exResult.className = res.pass ? 'pass' : 'fail';
  exResult.textContent = (res.pass ? '✓ Passed. ' : '✗ ') + res.msg;
}

checkBtn.addEventListener('click', () => {
  const lesson = LESSONS[currentLesson];
  const res = gradeExercise(lesson.exercise, { code: cm.getValue(), answer: answerInput.value });
  if (!res) return;
  showResult(res);
  if (res.pass && !progress.done.includes(lesson.id)) {
    progress.done.push(lesson.id);
    saveProgress();
    renderProgress();
    lessonTitle.querySelector('.lesson-progress').textContent = `${progress.done.length}/${LESSONS.length} done`;
  }
});
answerInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkBtn.click(); });

// ── Lesson rendering ──────────────────────────────────────────────────────────

function loadLesson(idx) {
  currentLesson = idx;
  const lesson = LESSONS[idx];

  tabBtns.forEach((b,i) => b.classList.toggle('active', i === idx));

  lessonTitle.innerHTML = `<span class="lesson-num">${lesson.id}</span> ${lesson.title}` +
    ` <span class="lesson-progress">${progress.done.length}/${LESSONS.length} done</span>`;
  progress.last = idx;
  saveProgress();
  lessonIntro.textContent = lesson.intro;

  conceptsList.innerHTML = lesson.concepts.map(c =>
    `<li><strong>${c.name}</strong><span class="concept-desc">${c.desc}</span></li>`
  ).join('');

  window.renderExplainer?.(document.getElementById('lesson-explainer'), lesson.id);

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
  const ex = lesson.exercise;
  answerWrap.hidden = ex.answer === undefined;
  document.getElementById('answer-label').textContent = ex.answerLabel ?? 'Answer:';
  answerInput.value = '';
  exResult.hidden = true;
  checkBtn.disabled = !ex.expect && ex.answer === undefined;
  hintBox.style.display   = 'none';
  hintBtn.textContent     = 'Show hint';

  solutionBox.textContent = lesson.exercise.solution ?? '';
  solutionBox.style.display = 'none';
  solutionBtn.textContent = 'Show solution';
  solutionBtn.disabled = !lesson.exercise.solution;
  solutionBtn.style.opacity = lesson.exercise.solution ? '' : '0.45';

  cm.setValue(lesson.code.trim());
  cView.setValue(lesson.c ?? '// No C version for this lesson yet.');
  cm.clearHistory();
  doReset();
}

tabBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('gym-tab')) {
      window.hideQuiz?.();
      window.hidePlayground?.();
      window.hideRank?.();
      window.hideArcade?.();
      window.hideFoundry?.();
      window.showGym?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('quiz-tab')) {
      window.hideGym?.();
      window.hidePlayground?.();
      window.hideRank?.();
      window.hideArcade?.();
      window.hideFoundry?.();
      window.showQuiz?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('playground-tab')) {
      window.hideGym?.();
      window.hideQuiz?.();
      window.hideRank?.();
      window.hideArcade?.();
      window.hideFoundry?.();
      window.showPlayground?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('rank-tab')) {
      window.hideGym?.();
      window.hideQuiz?.();
      window.hidePlayground?.();
      window.hideArcade?.();
      window.hideFoundry?.();
      window.showRank?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('arcade-tab')) {
      window.hideGym?.();
      window.hideQuiz?.();
      window.hidePlayground?.();
      window.hideRank?.();
      window.hideFoundry?.();
      window.showArcade?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    if (btn.classList.contains('foundry-tab')) {
      window.hideGym?.();
      window.hideQuiz?.();
      window.hidePlayground?.();
      window.hideRank?.();
      window.hideArcade?.();
      window.showFoundry?.();
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      return;
    }
    window.hideGym?.();
    window.hideQuiz?.();
    window.hidePlayground?.();
    window.hideRank?.();
    window.hideArcade?.();
    window.hideFoundry?.();
    loadLesson(i);
  });
});

/** Jump to a main lesson tab (0-based) from Rank recommendations. */
window.goToLessonTab = lessonIdx => {
  if (lessonIdx < 0 || lessonIdx >= LESSONS.length) return;
  window.hideRank?.();
  window.hideGym?.();
  window.hideQuiz?.();
  window.hidePlayground?.();
  window.hideArcade?.();
  window.hideFoundry?.();
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
renderProgress();
loadLesson(Math.min(Math.max(progress.last | 0, 0), LESSONS.length - 1));
doReset();
