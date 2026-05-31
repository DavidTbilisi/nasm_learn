'use strict';

(function () {

// ── Heap Heist ──────────────────────────────────────────────────────────────
// Stack-frame puzzles. No game-specific syscalls — all challenges revolve
// around CALL/RET, push/pop, [ebp+N] locals, and rewriting the saved return
// address. Validators inspect sim.exitCode / sim.regs.esp at halt.

const INITIAL_ESP = 0x2000;

function makeWorld(spec) {
  return { spec, lastSnapshot: null };
}

function installSyscalls(/* sim, world */) {
  // Heist relies only on built-in sys_exit (eax=1) and the call/ret machinery.
}

// ── Validators ──────────────────────────────────────────────────────────────

function _hx(v) { return '0x' + ((v >>> 0).toString(16).toUpperCase()); }

function checkExit(expected, label) {
  return function (world, sim) {
    if (!sim || !sim.halted)
      return { ok: false, message: 'Program did not halt with sys_exit (int 0x80, eax=1).' };
    const got = sim.exitCode >>> 0;
    const exp = expected >>> 0;
    if (got === exp)
      return { ok: true, message: `${label}: exit ${expected} (${_hx(expected)}).` };
    return { ok: false, message: `exit ${got} (${_hx(got)}); expected ${exp} (${_hx(exp)}).` };
  };
}

function checkExitAndEsp(expected, label) {
  const base = checkExit(expected, label);
  return function (world, sim) {
    const b = base(world, sim);
    if (!b.ok) return b;
    if (sim.regs.esp !== INITIAL_ESP) {
      const d = sim.regs.esp - INITIAL_ESP;
      return { ok: false, message:
        `Stack imbalance — esp=${_hx(sim.regs.esp)} (Δ${d > 0 ? '+' : ''}${d}); should be ${_hx(INITIAL_ESP)}.` };
    }
    return { ok: true, message: `${label}: exit ${expected}, esp balanced at ${_hx(INITIAL_ESP)}.` };
  };
}

// ── Levels ──────────────────────────────────────────────────────────────────

const LEVELS = [
  {
    id: 'call',
    title: '1 · CALL and RET',
    teaches: ['L4 stack', 'L11 procedures'],
    intro: 'Define a procedure that returns 42 in eax. Call it from _start, then exit with that value as the process exit code (ebx of int 0x80).',
    hint: 'CALL pushes the return address and jumps. RET pops it and resumes. Inside get_answer: mov eax, 42 / ret. In _start: call get_answer / mov ebx, eax / mov eax, 1 / int 0x80.',
    par: 25,
    starter:
`_start:
  ; TODO: call get_answer, then exit with eax in ebx.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  call get_answer
  mov ebx, eax
  mov eax, 1
  int 0x80
get_answer:
  mov eax, 42
  ret
`,
    makeWorld: () => makeWorld({ expected: 42 }),
    validate: checkExit(42, 'answer'),
  },

  {
    id: 'cdecl',
    title: '2 · Three args, cdecl',
    teaches: ['L4 stack', 'L11 procedures'],
    intro: 'Push three values (30, 20, 10) right-to-left, call sum3, clean caller args (cdecl), exit with the sum (60) as exit code. sum3 reads args via [ebp+8], [ebp+12], [ebp+16].',
    hint: 'cdecl: caller pushes right-to-left, callee returns in eax, caller cleans (add esp, 12 for 3 dwords). Standard prologue: push ebp / mov ebp, esp. Epilogue: pop ebp / ret.',
    par: 60,
    starter:
`_start:
  ; TODO: push 30, 20, 10; call sum3; clean stack; exit with sum.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  push dword 30
  push dword 20
  push dword 10
  call sum3
  add esp, 12              ; cdecl: caller cleans 3 dwords
  mov ebx, eax
  mov eax, 1
  int 0x80
sum3:
  push ebp
  mov ebp, esp
  mov eax, [ebp+8]
  add eax, [ebp+12]
  add eax, [ebp+16]
  pop ebp
  ret
`,
    makeWorld: () => makeWorld({ expected: 60 }),
    validate: checkExitAndEsp(60, 'sum'),
  },

  {
    id: 'chain',
    title: '3 · Nested calls',
    teaches: ['L4 stack', 'L11 procedures'],
    intro: 'Define square(x) = x*x and quad(x) = square(x) + square(x). Exit with quad(3) = 18.',
    hint: 'square: push ebp / mov ebp,esp / mov eax,[ebp+8] / imul eax,eax / pop ebp / ret. quad: call square twice with the same arg; stash the first result on the stack (push eax) before the second call, then pop + add.',
    par: 110,
    starter:
`_start:
  ; TODO: push 3; call quad; exit with eax in ebx.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  push dword 3
  call quad
  add esp, 4
  mov ebx, eax
  mov eax, 1
  int 0x80

quad:
  push ebp
  mov ebp, esp
  push dword [ebp+8]
  call square
  add esp, 4
  push eax                 ; stash first square
  push dword [ebp+8]
  call square
  add esp, 4
  pop ecx                  ; pop first square
  add eax, ecx
  pop ebp
  ret

square:
  push ebp
  mov ebp, esp
  mov eax, [ebp+8]
  imul eax, eax
  pop ebp
  ret
`,
    makeWorld: () => makeWorld({ expected: 18 }),
    validate: checkExitAndEsp(18, 'quad(3)'),
  },

  {
    id: 'rewrite',
    title: '4 · Rewrite the return',
    teaches: ['L4 stack', 'L14 buffer overflow'],
    intro: 'Inside a function, the saved return address sits at [esp]. Overwrite it with the label `bypass` before RET — execution lands at bypass instead of the original caller. Exit with 0xDEAD.',
    hint: 'In hijack: `mov dword [esp], bypass` then `ret`. The first int 0x80 in _start should never run because hijack redirects RET to bypass.',
    par: 40,
    starter:
`_start:
  ; TODO: call a proc that rewrites its own return to land at 'bypass'.
  mov eax, 1
  xor ebx, ebx
  int 0x80
bypass:
  mov ebx, 0xDEAD
  mov eax, 1
  int 0x80
`,
    solution:
`_start:
  call hijack
  ; never reached — hijack redirects RET to bypass
  mov eax, 1
  xor ebx, ebx
  int 0x80
bypass:
  mov ebx, 0xDEAD
  mov eax, 1
  int 0x80
hijack:
  mov dword [esp], bypass
  ret
`,
    makeWorld: () => makeWorld({ expected: 0xDEAD }),
    validate: checkExit(0xDEAD, 'redirect'),
  },

  {
    id: 'fact',
    title: '5 · Recursive factorial',
    teaches: ['L4 stack', 'L11 procedures'],
    intro: 'Compute 5! = 120 via a recursive fact(n). fact(1)=1; fact(n)=n*fact(n-1). Exit with 120 AND a balanced stack at halt.',
    hint: 'Prologue: push ebp / mov ebp,esp. Base: cmp [ebp+8],1 / jle base. Recurse: mov eax,[ebp+8] / dec eax / push eax / call fact / add esp,4 / imul eax,[ebp+8]. Epilogue: pop ebp / ret.',
    par: 250,
    starter:
`_start:
  ; TODO: push 5; call fact; exit with eax in ebx.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  push dword 5
  call fact
  add esp, 4
  mov ebx, eax
  mov eax, 1
  int 0x80
fact:
  push ebp
  mov ebp, esp
  mov eax, [ebp+8]
  cmp eax, 1
  jle base
  dec eax
  push eax
  call fact
  add esp, 4
  imul eax, [ebp+8]
  jmp done
base:
  mov eax, 1
done:
  pop ebp
  ret
`,
    makeWorld: () => makeWorld({ expected: 120 }),
    validate: checkExitAndEsp(120, '5!'),
  },
];

// ── Renderer ────────────────────────────────────────────────────────────────

function hex(v, w=8) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }

function stackSvg(sim) {
  const esp = sim.regs.esp >>> 0;
  const ebp = sim.regs.ebp >>> 0;
  // Span: from a couple words above esp/ebp down to initial esp.
  const lowest  = Math.min(esp, ebp, INITIAL_ESP) - 8;
  const highest = INITIAL_ESP + 4;
  const slots = [];
  for (let a = lowest; a <= highest; a += 4) slots.push(a >>> 0);

  const rowH = 16;
  const W = 280, H = slots.length * rowH + 22;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="heist-stack">`;
  svg += `<text x="6" y="12" font-size="9" font-family="ui-monospace,monospace" fill="var(--p-dim)">addr</text>`;
  svg += `<text x="${W-6}" y="12" text-anchor="end" font-size="9" font-family="ui-monospace,monospace" fill="var(--p-dim)">value · low addr (top) ↓</text>`;
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    const y = 18 + i * rowH;
    const v = sim.readDword(a) >>> 0;
    const isEsp = a === esp;
    const isEbp = a === ebp;
    const inFrame = a >= esp && a < INITIAL_ESP;
    const fill = inFrame ? 'var(--surface3)' : 'var(--surface)';
    const stroke = isEsp ? 'var(--amber)' : isEbp ? 'var(--p-hi)' : 'var(--border)';
    const sw = (isEsp || isEbp) ? 1.5 : 0.5;
    svg += `<rect x="46" y="${y}" width="170" height="${rowH-2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    svg += `<text x="42" y="${y+11}" font-size="9" text-anchor="end" font-family="ui-monospace,monospace" fill="var(--p-dim)">${hex(a,4)}</text>`;
    svg += `<text x="131" y="${y+11}" font-size="9.5" text-anchor="middle" font-family="ui-monospace,monospace" fill="var(--p)">${hex(v)}</text>`;
    if (isEsp) svg += `<text x="222" y="${y+11}" font-size="9.5" font-family="ui-monospace,monospace" fill="var(--amber)">← esp</text>`;
    if (isEbp) svg += `<text x="222" y="${y+11}" font-size="9.5" font-family="ui-monospace,monospace" fill="var(--p-hi)">← ebp</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function render(world, root, sim) {
  if (!world) { root.innerHTML = ''; return; }
  const target = world.spec.expected;
  if (!sim || !sim.halted) {
    root.innerHTML = `
      <div class="heist-wrap">
        <div class="heist-label">Vault</div>
        <div class="heist-msg">Locked. Run your program to inspect the stack at halt.</div>
        <div class="heist-readout">
          <div><span class="ro-label">target exit</span> ${target} (${_hx(target)})</div>
        </div>
      </div>`;
    return;
  }
  const espDelta = sim.regs.esp - INITIAL_ESP;
  root.innerHTML = `
    <div class="heist-wrap">
      <div class="heist-label">Vault state at halt</div>
      <div class="heist-readout">
        <div><span class="ro-label">exit</span> ${sim.exitCode} (${_hx(sim.exitCode)})</div>
        <div><span class="ro-label">esp</span> ${hex(sim.regs.esp)} ${
          espDelta ? `<span class="warn">Δ${espDelta > 0 ? '+' : ''}${espDelta}</span>`
                   : `<span class="ok">balanced</span>`
        }</div>
        <div><span class="ro-label">ebp</span> ${hex(sim.regs.ebp)}</div>
        <div><span class="ro-label">eax</span> ${hex(sim.regs.eax)}</div>
        <div><span class="ro-label">target</span> exit ${target} (${_hx(target)})</div>
      </div>
      <div class="heist-stack-wrap">${stackSvg(sim)}</div>
    </div>
  `;
}

// ── Module export ───────────────────────────────────────────────────────────

const HeistGame = {
  id: 'heist',
  name: 'Heap Heist',
  blurb: 'Stack frames, calls, and return-address rewrites.',
  levels: LEVELS,
  installSyscalls,
  render,
};

if (typeof window !== 'undefined') window.HeistGame = HeistGame;
if (typeof module !== 'undefined' && module.exports) module.exports = HeistGame;

})();
