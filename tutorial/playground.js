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

const pgSim = new NASMSimulator();
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
const pgStepLog    = document.getElementById('pg-step-log');
const pgSnippets   = document.getElementById('pg-snippets');

// ── Helpers ───────────────────────────────────────────────────────────────────

function pgHex(n)      { return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8,'0'); }
function pgHexShort(n) { return '0x' + (n >>> 0).toString(16).toUpperCase(); }

function pgRenderRegs(state, prev) {
  const NAMES = ['eax','ebx','ecx','edx','esi','edi','esp','ebp'];
  pgRegTable.innerHTML = NAMES.map(r => {
    const val     = state.regs[r];
    const changed = prev && prev.regs[r] !== val;
    return `<tr class="${changed ? 'changed' : ''}">
      <td class="reg-name">${r.toUpperCase()}</td>
      <td class="reg-hex">${pgHex(val)}</td>
      <td class="reg-dec">${val >>> 0}</td>
    </tr>`;
  }).join('');
}

function pgRenderFlags(state, prev) {
  pgFlagBar.innerHTML = ['zf','cf','sf','of','df'].map(f => {
    const val     = state.flags[f];
    const changed = prev && prev.flags[f] !== val;
    return `<span class="flag ${val ? 'flag-set' : 'flag-clear'} ${changed ? 'changed' : ''}">
      <span class="flag-name">${f.toUpperCase()}</span><span class="flag-val">${val}</span>
    </span>`;
  }).join('');
}

function pgRenderStack(state) {
  const entries = [];
  for (let a = 0x2000 - 4; a >= state.regs.esp && a >= 0; a -= 4) {
    const v = (state.mem[a]??0) | ((state.mem[a+1]??0)<<8) |
              ((state.mem[a+2]??0)<<16) | ((state.mem[a+3]??0)<<24);
    if (v !== 0 || a === state.regs.esp) entries.push([a, v>>>0]);
  }

  const stdout = state.stdout ?? [];
  let html = '';
  if (stdout.length) {
    html += `<div class="stdout-label">stdout</div>`;
    html += stdout.map(l =>
      `<div class="stdout-line">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'↵')}</div>`
    ).join('');
    if (state.exitCode !== null && state.exitCode !== undefined)
      html += `<div class="stdout-exit">exit code: ${state.exitCode}</div>`;
    html += '<hr class="stack-sep">';
  }
  if (!entries.length) {
    html += '<span class="empty-note">Stack is empty</span>';
  } else {
    html += entries.map(([addr, val]) => {
      const isEsp = addr === state.regs.esp;
      const isEbp = addr === state.regs.ebp;
      const label = isEsp ? ' ← ESP' : (isEbp ? ' ← EBP' : '');
      return `<div class="stack-row${isEsp ? ' stack-top' : ''}">
        <span class="stack-addr">${pgHexShort(addr)}</span>
        <span class="stack-val">${pgHex(val)}</span>
        <span class="stack-label">${label}</span>
      </div>`;
    }).join('');
  }
  pgStackPanel.innerHTML = html;
}

function pgRenderState(state, prev) {
  pgRenderRegs(state, prev);
  pgRenderFlags(state, prev);
  pgRenderStack(state);
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

// ── Blank state ───────────────────────────────────────────────────────────────

function pgBlank() {
  return {
    regs:  { eax:0,ebx:0,ecx:0,edx:0,esi:0,edi:0,esp:0x2000,ebp:0x2000 },
    flags: { zf:0, cf:0, sf:0, of:0, df:0 },
    mem:   {}, stdout: [], exitCode: null,
  };
}

// ── Controls ──────────────────────────────────────────────────────────────────

function pgDoReset() {
  pgResult  = null;
  pgStepIdx = -1;
  pgHideError();
  pgStepLog.innerHTML = '';
  pgClearHighlight();
  pgStepCtr.textContent = '';
  pgRenderState(pgBlank(), null);
  pgBtnPrev.disabled = true;
  pgBtnStep.textContent = 'Step ▶';
}

function pgDoRun() {
  pgHideError();
  pgStepLog.innerHTML = '';
  pgResult = pgSim.runAll(pgCm.getValue());

  if (pgResult.error) { pgShowError(pgResult.error); return; }
  if (!pgResult.history.length) { pgAppendLog('No instructions executed.', 'log-warn'); return; }
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
    pgResult = pgSim.runAll(pgCm.getValue());
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
  pgStepIdx--;
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
