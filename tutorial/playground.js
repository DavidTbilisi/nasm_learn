'use strict';

const PG_KEY = 'nasm-playground-code';

const PG_SNIPPETS = {
  arithmetic: `; Arithmetic demo
section .data
section .text
global _start
_start:
  mov eax, 10
  mov ebx, 3
  add eax, ebx   ; eax = 13
  sub eax, 2     ; eax = 11
  imul eax, ebx  ; eax = 33
  mov ecx, eax   ; save result`,

  loop: `; Counted loop: sum 1..5
section .text
global _start
_start:
  mov ecx, 5    ; loop counter
  mov eax, 0   ; accumulator
loop_top:
  add eax, ecx
  dec ecx
  jnz loop_top  ; eax = 15`,

  stack: `; Stack frame demo
section .text
global _start
_start:
  push 7        ; arg
  call square
  add esp, 4    ; caller clean-up
  ; eax = 49
  jmp done

square:
  push ebp
  mov  ebp, esp
  mov  eax, [ebp+8]
  imul eax, eax
  pop  ebp
  ret

done:`,

  fibonacci: `; Fibonacci: F(8) = 21
section .text
global _start
_start:
  mov ecx, 8    ; compute F(n)
  mov eax, 0   ; F(0)
  mov ebx, 1   ; F(1)
fib_loop:
  cmp ecx, 0
  je  fib_done
  mov edx, ebx
  add edx, eax
  mov eax, ebx
  mov ebx, edx
  dec ecx
  jmp fib_loop
fib_done:
  ; eax holds F(8) = 21`,

  bitwise: `; Bitwise operations
section .text
global _start
_start:
  mov eax, 0b11001010   ; 0xCA = 202
  mov ebx, 0b10110101   ; 0xB5 = 181
  and ecx, 0            ; clear
  or  ecx, eax
  and ecx, ebx          ; AND
  xor edx, edx          ; clear
  or  edx, eax
  or  edx, ebx          ; OR
  mov esi, eax
  xor esi, ebx          ; XOR
  shl eax, 2            ; left shift
  shr ebx, 1            ; right shift`,

  compare: `; Compare and branch
section .text
global _start
_start:
  mov eax, 42
  mov ebx, 17
  cmp eax, ebx
  jg  bigger       ; eax > ebx
  mov ecx, 0
  jmp done
bigger:
  mov ecx, 1      ; ecx = 1 (true)
done:
  ; ZF=0, SF=0 after cmp 42,17`,
};

// ── Playground state ──────────────────────────────────────────────────────────

let pgCm        = null;   // lazy-init CodeMirror
let pgResult    = null;
let pgStepIdx   = -1;
let pgActiveLine = -1;

// ── DOM refs (accessed after DOMContentLoaded) ────────────────────────────────

const pgWrap       = document.getElementById('playground-wrap');
const pgBtnRun     = document.getElementById('pg-btn-run');
const pgBtnStep    = document.getElementById('pg-btn-step');
const pgBtnPrev    = document.getElementById('pg-btn-prev');
const pgBtnReset   = document.getElementById('pg-btn-reset');
const pgStepCtr    = document.getElementById('pg-step-counter');
const pgErrorBanner= document.getElementById('pg-error-banner');
const pgRegTable   = document.getElementById('pg-reg-table');
const pgFlagBar    = document.getElementById('pg-flag-bar');
const pgStackPanel = document.getElementById('pg-stack-panel');
const pgMemPanel   = document.getElementById('pg-mem-panel');
const pgOutputPanel = document.getElementById('pg-output-panel');
const pgStepLog    = document.getElementById('pg-step-log');
const pgSnippets   = document.getElementById('pg-snippets');

// ── Helpers ───────────────────────────────────────────────────────────────────

function pgRenderFlags(state, prev) {
  pgFlagBar.innerHTML = ['zf','cf','sf','of','df'].map(f => {
    const val     = state.flags[f];
    const changed = prev && prev.flags[f] !== val;
    return `<span class="flag ${val ? 'flag-set' : 'flag-clear'} ${changed ? 'changed' : ''}">
      <span class="flag-name">${f.toUpperCase()}</span><span class="flag-val">${val}</span>
    </span>`;
  }).join('');
}

function pgRenderState(state, prev) {
  renderRegs(pgRegTable, state, prev);
  pgRenderFlags(state, prev);
  renderStack(pgStackPanel, state);
  renderMemory(pgMemPanel, state, prev, pgResult?.dataLabels);
  renderOutput(pgOutputPanel, state);
}

function pgClearHighlight() {
  if (pgActiveLine >= 0) {
    pgCm.removeLineClass(pgActiveLine, 'background', 'cm-active-step');
    pgActiveLine = -1;
  }
}

function pgHighlight(ip, instructions) {
  pgClearHighlight();
  if (ip < 0 || !instructions || ip >= instructions.length) return;
  const target = instructions[ip].raw.trim().toLowerCase();
  for (let i = 0; i < pgCm.lineCount(); i++) {
    let line = pgCm.getLine(i);
    const ci = line.indexOf(';');
    if (ci !== -1) line = line.slice(0, ci);
    line = line.trim();
    if (!line) continue;
    if (line.includes(':')) line = line.slice(line.indexOf(':') + 1).trim();
    if (!line) continue;
    if (line.toLowerCase() === target) {
      pgCm.addLineClass(i, 'background', 'cm-active-step');
      pgCm.scrollIntoView({ line: i, ch: 0 }, 60);
      pgActiveLine = i;
      return;
    }
  }
}

function pgAppendLog(msg, cls='') {
  const div = document.createElement('div');
  div.className = 'log-entry ' + cls;
  div.textContent = msg;
  pgStepLog.appendChild(div);
  pgStepLog.scrollTop = pgStepLog.scrollHeight;
}

function pgShowError(msg) { pgErrorBanner.textContent = msg; pgErrorBanner.style.display = 'block'; }
function pgHideError()    { pgErrorBanner.style.display = 'none'; }

function pgUpdateCounter() {
  if (!pgResult) { pgStepCtr.textContent = ''; return; }
  const cur = pgStepIdx < 0 ? 0 : pgStepIdx + 1;
  pgStepCtr.textContent = `Step ${cur} / ${pgResult.history.length}`;
}

// ── Controls ──────────────────────────────────────────────────────────────────

function pgDoReset() {
  pgResult  = null;
  pgStepIdx = -1;
  pgHideError();
  pgStepLog.innerHTML = '';
  pgClearHighlight();
  pgStepCtr.textContent = '';
  pgRenderState(blankState(pgCm.getValue()), null);
  pgBtnPrev.disabled = true;
  pgBtnStep.textContent = 'Step ▶';
}

function pgDoRun() {
  // Mid-run (stepping or paused at a breakpoint), Run continues from the current step.
  if (!pgResult || pgStepIdx >= pgResult.history.length - 1) {
    pgHideError();
    pgStepLog.innerHTML = '';
    pgResult = NASMSimulator.create(pgCm.getValue()).runAll(pgCm.getValue());
    pgStepIdx = -1;
    if (pgResult.error) { pgShowError(pgResult.error); pgResult = null; return; }
    if (!pgResult.history.length) { pgAppendLog('No instructions executed.', 'log-warn'); pgResult = null; return; }
  }
  const bp = nextBreakpoint(pgCm, pgResult, pgStepIdx);
  if (bp >= 0) {
    pgGotoStep(bp);
    pgAppendLog(`● breakpoint, line ${pgResult.history[bp].instr.line + 1}. Run again to continue.`, 'log-info');
    return;
  }
  pgStepLog.innerHTML = '';
  if (pgResult.hitLimit) pgAppendLog('⚠ Step limit reached (possible infinite loop).', 'log-warn');

  const last = pgResult.history[pgResult.history.length - 1];
  if (last?.error) pgShowError(`Error at "${last.instr.raw}": ${last.error}`);

  const prev = pgResult.history.length > 1 ? pgResult.history[pgResult.history.length - 2].before : null;
  pgRenderState(pgResult.finalState, prev);

  pgAppendLog(`Executed ${pgResult.steps} instruction(s).`, 'log-info');
  pgStepIdx = pgResult.history.length - 1;
  pgUpdateCounter();
  pgClearHighlight();
  pgBtnPrev.disabled = false;
  pgBtnStep.textContent = 'Restart ↺';
}

function pgDoStep() {
  if (!pgResult || pgStepIdx >= pgResult.history.length - 1) {
    pgHideError();
    pgStepLog.innerHTML = '';
    pgResult = NASMSimulator.create(pgCm.getValue()).runAll(pgCm.getValue());
    if (pgResult.error) { pgShowError(pgResult.error); pgResult = null; return; }
    if (!pgResult.history.length) { pgAppendLog('No instructions.', 'log-warn'); return; }
    pgStepIdx = 0;
  } else {
    pgStepIdx++;
  }

  const entry   = pgResult.history[pgStepIdx];
  const prevEnt = pgStepIdx > 0 ? pgResult.history[pgStepIdx - 1] : null;
  const disp    = pgStepIdx < pgResult.history.length - 1 ? entry.before : pgResult.finalState;

  pgRenderState(disp, prevEnt ? prevEnt.before : null);
  pgHighlight(entry.before.ip, pgResult.instructions);

  let msg = `[${pgStepIdx + 1}] ${entry.instr.raw}`;
  if (entry.branch) msg += entry.branch.taken ? ` → taken (${entry.branch.target})` : ' → not taken';
  if (entry.error)  msg += ` ✗ ${entry.error}`;
  pgAppendLog(msg, entry.error ? 'log-error' : '');

  pgUpdateCounter();
  pgBtnPrev.disabled = pgStepIdx <= 0;
  pgBtnStep.textContent = pgStepIdx >= pgResult.history.length - 1 ? 'Restart ↺' : 'Step ▶';

  if (pgStepIdx >= pgResult.history.length - 1) {
    pgAppendLog('— end of program —', 'log-info');
    pgRenderState(pgResult.finalState, entry.before);
    pgClearHighlight();
  }
}

function pgDoPrev() {
  if (!pgResult || pgStepIdx <= 0) return;
  pgGotoStep(pgStepIdx - 1);
}

function pgGotoStep(i) {
  pgStepIdx = i;
  const entry   = pgResult.history[pgStepIdx];
  const prevEnt = pgStepIdx > 0 ? pgResult.history[pgStepIdx - 1] : null;
  pgRenderState(entry.before, prevEnt ? prevEnt.before : null);
  pgHighlight(entry.before.ip, pgResult.instructions);
  pgUpdateCounter();
  pgBtnPrev.disabled = pgStepIdx <= 0;
  pgBtnStep.textContent = 'Step ▶';
  pgStepLog.innerHTML = '';
  for (let i = 0; i <= pgStepIdx; i++) {
    const e = pgResult.history[i];
    let msg = `[${i + 1}] ${e.instr.raw}`;
    if (e.branch) msg += e.branch.taken ? ` → taken (${e.branch.target})` : ' → not taken';
    pgAppendLog(msg, e.error ? 'log-error' : '');
  }
}

// ── Auto-save (debounced) ─────────────────────────────────────────────────────

let pgSaveTimer = null;
function pgScheduleSave() {
  clearTimeout(pgSaveTimer);
  pgSaveTimer = setTimeout(() => {
    try { localStorage.setItem(PG_KEY, pgCm.getValue()); } catch (_) {}
  }, 800);
}

// ── Init CodeMirror (lazy — called on first showPlayground) ───────────────────

function pgInitEditor() {
  if (pgCm) return;

  const saved = (() => { try { return localStorage.getItem(PG_KEY); } catch (_) { return null; } })();

  pgCm = CodeMirror(document.getElementById('pg-editor-host'), {
    value: saved || PG_SNIPPETS.arithmetic,
    mode:  'nasm',
    theme: 'default',
    lineNumbers:     true,
    matchBrackets:   true,
    indentWithTabs:  true,
    tabSize:         8,
    extraKeys: { 'Ctrl-Enter': pgDoRun },
  });

  pgCm.on('change', () => {
    pgResult  = null;
    pgStepIdx = -1;
    pgClearHighlight();
    pgStepCtr.textContent = '';
    pgBtnStep.textContent = 'Step ▶';
    pgScheduleSave();
  });

  pgBtnRun.addEventListener('click', pgDoRun);
  enableBreakpoints(pgCm);
  pgBtnStep.addEventListener('click', () => {
    if (pgResult && pgStepIdx >= pgResult.history.length - 1) pgDoReset();
    else pgDoStep();
  });
  pgBtnPrev.addEventListener('click', pgDoPrev);
  pgBtnReset.addEventListener('click', pgDoReset);
  pgSnippets.addEventListener('change', () => {
    const key = pgSnippets.value;
    if (key && PG_SNIPPETS[key]) {
      pgCm.setValue(PG_SNIPPETS[key]);
      pgDoReset();
    }
    pgSnippets.value = '';
  });

  pgDoReset();
}

// ── Public API ────────────────────────────────────────────────────────────────

window.showPlayground = function () {
  document.getElementById('main-layout').style.display = 'none';
  document.getElementById('gym-wrap').style.display    = 'none';
  document.getElementById('quiz-wrap').style.display   = 'none';
  const rankWrap = document.getElementById('rank-wrap');
  if (rankWrap) rankWrap.style.display = 'none';
  pgWrap.style.display = 'grid';
  pgInitEditor();
  setTimeout(() => pgCm?.refresh(), 0);
};

window.hidePlayground = function () {
  pgWrap.style.display = 'none';
};
