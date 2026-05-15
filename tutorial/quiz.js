'use strict';

// ── Questions ─────────────────────────────────────────────────────────────────
// type 'mc'   : multiple-choice, answer = index into opts[]
// type 'code' : run code in simulator, answer = final decimal value of `reg`

const QUIZ_QUESTIONS = [
  // ── Lesson 1: Registers ───────────────────────────────────────────────────
  {
    lesson: 'Registers & Data Types',
    type: 'mc',
    q: 'Which register holds the lower 8 bits of EAX?',
    opts: ['AX', 'AL', 'AH', 'EBX'],
    answer: 1,
    explain: 'AL (Accumulator Low) is bits 0–7 of EAX. AX is bits 0–15, AH is bits 8–15. EBX is a completely separate register.',
  },
  {
    lesson: 'Registers & Data Types',
    type: 'code',
    q: 'What decimal value is in EAX after this code executes?',
    code: 'mov eax, 0\nmov ah, 5\nmov al, 3',
    reg: 'eax',
    answer: 0x0503,
    explain: 'MOV AH, 5 sets bits 8–15 → EAX = 0x0500. MOV AL, 3 sets bits 0–7 → EAX = 0x0503 = 1283.',
  },

  // ── Lesson 2: Arithmetic & Flags ─────────────────────────────────────────
  {
    lesson: 'Arithmetic & Flags',
    type: 'mc',
    q: 'Which flag is set when the result of an arithmetic operation is exactly zero?',
    opts: ['CF (Carry Flag)', 'SF (Sign Flag)', 'ZF (Zero Flag)', 'OF (Overflow Flag)'],
    answer: 2,
    explain: 'ZF is set to 1 whenever the result of the last arithmetic or logical instruction equals zero. It is the flag read by JE (Jump if Equal) and JZ (Jump if Zero).',
  },
  {
    lesson: 'Arithmetic & Flags',
    type: 'code',
    q: 'What decimal value is in EAX after this code?',
    code: 'mov eax, 100\nmov ebx, 37\nsub eax, ebx',
    reg: 'eax',
    answer: 63,
    explain: 'SUB computes EAX = EAX − EBX = 100 − 37 = 63.',
  },
  {
    lesson: 'Arithmetic & Flags',
    type: 'mc',
    q: 'How does INC differ from ADD reg, 1 with respect to CPU flags?',
    opts: [
      'INC is slower than ADD',
      'INC does not update CF (Carry Flag)',
      'INC does not update ZF (Zero Flag)',
      'INC always sets OF',
    ],
    answer: 1,
    explain: 'INC updates ZF, SF, and OF but intentionally leaves CF unchanged. ADD reg, 1 updates all four flags including CF. This distinction matters in multi-precision arithmetic.',
  },

  // ── Lesson 3: Control Flow ────────────────────────────────────────────────
  {
    lesson: 'Control Flow',
    type: 'mc',
    q: 'Which conditional jump fires when the two values compared by CMP were equal?',
    opts: ['JNE', 'JG', 'JE', 'JC'],
    answer: 2,
    explain: 'JE (Jump if Equal) jumps when ZF=1, which is set when CMP a,b computes a−b = 0, i.e., a equals b. JE and JZ are the same instruction.',
  },
  {
    lesson: 'Control Flow',
    type: 'code',
    q: 'What is EAX after this counted loop finishes? (It adds ECX to EAX each iteration)',
    code: 'mov ecx, 5\nmov eax, 0\nsum_loop:\nadd eax, ecx\nloop sum_loop',
    reg: 'eax',
    answer: 15,
    explain: 'LOOP decrements ECX and jumps while ECX≠0, so the loop runs for ECX = 5,4,3,2,1. EAX accumulates 5+4+3+2+1 = 15.',
  },

  // ── Lesson 4: Stack & Calling Conventions ────────────────────────────────
  {
    lesson: 'Stack & Calling Conventions',
    type: 'mc',
    q: 'When you PUSH a 32-bit (dword) value onto the stack, how does ESP change?',
    opts: ['ESP increases by 4', 'ESP decreases by 4', 'ESP increases by 1', 'ESP is unchanged'],
    answer: 1,
    explain: 'The x86 stack grows downward. PUSH subtracts 4 from ESP (making room) then writes the value at the new ESP. POP reads the value and adds 4.',
  },
  {
    lesson: 'Stack & Calling Conventions',
    type: 'mc',
    q: 'In a cdecl stack frame (after PUSH EBP / MOV EBP, ESP), where is the first argument?',
    opts: ['[EBP]', '[EBP+4]', '[EBP+8]', '[EBP-4]'],
    answer: 2,
    explain: '[EBP] = saved EBP value. [EBP+4] = saved return address (pushed by CALL). [EBP+8] = first argument. Locals live at [EBP-4], [EBP-8], …',
  },

  // ── Lesson 5: Loops ───────────────────────────────────────────────────────
  {
    lesson: 'Loop Patterns',
    type: 'mc',
    q: 'What happens when LOOP executes and ECX has just reached zero?',
    opts: [
      'It jumps back to the label one final time',
      'It falls through to the instruction after LOOP',
      'It raises a divide-by-zero fault',
      'ECX wraps around to 0xFFFFFFFF',
    ],
    answer: 1,
    explain: 'LOOP first decrements ECX, then jumps only if ECX ≠ 0. When ECX reaches 0 after the decrement the branch is not taken and execution continues with the next instruction.',
  },
  {
    lesson: 'Loop Patterns',
    type: 'code',
    q: 'This loop doubles EAX four times starting from 1. What is the final value of EAX?',
    code: 'mov eax, 1\nmov ecx, 4\ndouble_loop:\nadd eax, eax\nloop double_loop',
    reg: 'eax',
    answer: 16,
    explain: 'Each iteration doubles EAX: 1→2→4→8→16. After 4 iterations (ECX goes 4,3,2,1→0) EAX = 16 = 2⁴.',
  },

  // ── Lesson 6: Syscalls ────────────────────────────────────────────────────
  {
    lesson: 'Data Sections & Syscalls',
    type: 'mc',
    q: 'When making a Linux x86 syscall with int 0x80, which register holds the syscall number?',
    opts: ['EBX', 'ECX', 'EAX', 'EDX'],
    answer: 2,
    explain: 'EAX holds the syscall number. EBX = first argument (e.g. file descriptor), ECX = second (e.g. buffer pointer), EDX = third (e.g. byte count). The return value comes back in EAX.',
  },
  {
    lesson: 'Data Sections & Syscalls',
    type: 'mc',
    q: 'What is the Linux x86 syscall number for sys_write?',
    opts: ['1', '3', '4', '5'],
    answer: 2,
    explain: 'sys_write = 4. sys_exit = 1, sys_read = 3. These are fixed by the kernel ABI and do not change between programs.',
  },

  // ── Lesson 7: Strings ─────────────────────────────────────────────────────
  {
    lesson: 'String Instructions',
    type: 'mc',
    q: 'After REPNE SCASB finds the byte it was searching for, where does EDI point?',
    opts: [
      'Exactly at the matching byte',
      'One byte past the matching byte',
      'Back at the start of the string',
      'EDI is unchanged',
    ],
    answer: 1,
    explain: 'Each SCASB iteration: compare then advance EDI. When the match is found, the advance already happened — so EDI points one byte past the matched byte. Subtract 1 from EDI (or 1 from the count math) to get the exact position.',
  },
  {
    lesson: 'String Instructions',
    type: 'mc',
    q: 'What does the CLD instruction do?',
    opts: [
      'Clears CF (Carry Flag)',
      'Sets DF to 0 so ESI/EDI increment after each string op',
      'Sets DF to 1 so ESI/EDI decrement after each string op',
      'Zeros the ECX counter register',
    ],
    answer: 1,
    explain: 'CLD clears the Direction Flag (DF=0). With DF=0, MOVS/STOS/SCAS/CMPS advance ESI and EDI upward (increment). STD sets DF=1 and reverses the direction.',
  },

  // ── Lesson 8: Bitwise ─────────────────────────────────────────────────────
  {
    lesson: 'Bitwise Operations',
    type: 'code',
    q: 'What decimal value is in EAX after masking with AND?',
    code: 'mov eax, 0xFF\nand eax, 0x0F',
    reg: 'eax',
    answer: 15,
    explain: '0xFF = 1111 1111. AND 0x0F = 0000 1111. Result = 0000 1111 = 0x0F = 15. The AND mask keeps only the low nibble.',
  },
  {
    lesson: 'Bitwise Operations',
    type: 'mc',
    q: 'SHL EAX, 3 is equivalent to which arithmetic operation?',
    opts: ['EAX + 3', 'EAX × 3', 'EAX × 8', 'EAX ÷ 8'],
    answer: 2,
    explain: 'Shifting left by N bits multiplies by 2ᴺ. SHL EAX, 3 = EAX × 2³ = EAX × 8. This is faster than IMUL for powers of two.',
  },
  {
    lesson: 'Bitwise Operations',
    type: 'mc',
    q: 'Which instruction tests a single bit of a register and stores the result in CF, without modifying the register?',
    opts: ['AND eax, 1', 'TEST eax, 1', 'BT eax, 0', 'SHR eax, 1'],
    answer: 2,
    explain: 'BT (Bit Test) copies the specified bit into CF and leaves the destination unchanged. AND and TEST modify the destination (or flags but also affect the register for AND). SHR shifts the whole register.',
  },

  // ── Spot the Bug — silent-corruption traps ───────────────────────────────
  // Code that assembles and runs but produces wrong state. These are the
  // most-failed concepts in introductory x86 — they only surface as bugs
  // hundreds of instructions later.
  {
    lesson: 'Spot the Bug',
    type: 'mc',
    q: 'Memory at address A holds the bytes 0x44, 0x33, 0x22, 0x11 (in order A, A+1, A+2, A+3). On x86 (little-endian), what 32-bit value does `MOV EAX, [A]` load into EAX?',
    opts: ['0x11223344', '0x44332211', '0x33221144', '0x44112233'],
    answer: 0,
    explain: 'x86 is little-endian: the byte at the lowest address is the least-significant byte. The dword is reassembled MSB-first as 0x11_22_33_44. This is the canonical endianness trap in shellcode and binary-file parsers — bytes are written in memory order but interpreted in reverse.',
  },
  {
    lesson: 'Spot the Bug',
    type: 'code',
    q: 'EAX starts as 0xFFFFFFFF. After `MOV AL, 1`, what is EAX? (Hint: writing the low 8 bits does NOT zero the upper bits.)',
    code: 'mov eax, 0xFFFFFFFF\nmov al, 1',
    reg: 'eax',
    answer: 0xFFFFFF01,
    explain: 'MOV to a sub-register only modifies the bits it names. AL = bits 0-7, so EAX becomes 0xFFFFFF01, NOT 0x00000001. On x86-64 this trap also has the opposite version: writing a 32-bit register (MOV EAX, 1) DOES zero the upper 32 of RAX. The asymmetry surprises everyone the first time.',
  },
  {
    lesson: 'Spot the Bug',
    type: 'code',
    q: 'You wanted to save EAX and EBX across a call. Code: push eax; push ebx; (call happens); pop eax; pop ebx. With EAX=1 and EBX=2 before, what is EAX after the pops?',
    code: 'mov eax, 1\nmov ebx, 2\npush eax\npush ebx\npop eax\npop ebx',
    reg: 'eax',
    answer: 2,
    explain: 'Stack is LIFO. PUSH EAX then PUSH EBX means EBX is on top. The first POP retrieves EBX\'s value (2) into EAX. EAX and EBX end up SWAPPED — both registers still hold "saved" values, just the wrong ones. Correct pattern: pops in REVERSE order of pushes (pop ebx first, then pop eax).',
  },
  {
    lesson: 'Spot the Bug',
    type: 'mc',
    q: 'A function does `push ebx` and `push esi` in its prologue, but only `pop esi` before `ret`. What happens when `ret` executes?',
    opts: [
      'Returns normally — the extra value on the stack is ignored',
      'Returns to a garbage address because RET pops whatever ESP points at',
      'Generates a stack-overflow exception',
      'Returns to the caller plus 4 bytes',
    ],
    answer: 1,
    explain: 'RET pops the value at [ESP] into EIP and jumps. After the missing POP, ESP is 4 bytes too low — it points at the saved EBX, not the return address. The CPU happily jumps to whatever EBX was. Push/pop count mismatches always corrupt control flow this way, and the crash site is far from the cause.',
  },
  {
    lesson: 'Spot the Bug',
    type: 'mc',
    q: 'You compute `MOV EAX, 42` and need to keep that value alive. Then you call `MOV EAX, 4 / MOV EBX, 1 / MOV ECX, msg / MOV EDX, len / INT 0x80` to print a string. After the syscall, what is in EAX?',
    opts: [
      'Still 42',
      'The number of bytes written by sys_write (the return value)',
      'Always 0 on success',
      '4, the syscall number',
    ],
    answer: 1,
    explain: 'Every Linux syscall returns its result in EAX (or RAX on x86-64), overwriting whatever was there. Your 42 was clobbered twice — first by `MOV EAX, 4` to set the syscall number, then by the kernel writing the return value. To preserve a value across a syscall, push it first or move it to a callee-saved register (EBX/ESI/EDI/EBP) that the kernel does not touch.',
  },
  {
    lesson: 'Spot the Bug',
    type: 'mc',
    q: 'Your binary prints the address of a local buffer. Each time you run it (on a modern Linux distro), the printed address is different. Why?',
    opts: [
      'gcc randomizes initializer order between builds',
      'The OS rewrites pointer values when a process forks',
      'Position-Independent Executable (PIE) base + ASLR randomize the load address every run',
      'The CPU relocates instructions for cache efficiency',
    ],
    answer: 2,
    explain: 'Modern distros build with -fPIE and the kernel uses ASLR (Address Space Layout Randomization). The executable, libraries, stack, and heap all get a random base address at each exec(). RIP-relative addressing means the code still works, but absolute pointer values change per run. To debug deterministically, disable ASLR (`setarch -R ./prog` or `echo 0 | sudo tee /proc/sys/kernel/randomize_va_space`).',
  },
];

// ── State ─────────────────────────────────────────────────────────────────────
const quizSim = new NASMSimulator();
let qIdx     = 0;
let score    = 0;
let results  = [];   // {correct: bool} per question

// ── DOM ───────────────────────────────────────────────────────────────────────
const quizWrap      = document.getElementById('quiz-wrap');
const mainLayout    = document.getElementById('main-layout');
const quizProgress  = document.getElementById('quiz-progress');
const quizProgressN = document.getElementById('quiz-progress-n');
const quizLesson    = document.getElementById('quiz-lesson-tag');
const quizScoreLive = document.getElementById('quiz-score-live');
const quizQ         = document.getElementById('quiz-q');
const quizCodeBlock = document.getElementById('quiz-code');
const quizOpts      = document.getElementById('quiz-opts');
const quizInput     = document.getElementById('quiz-input');
const quizFeedback  = document.getElementById('quiz-feedback');
const quizCheckBtn  = document.getElementById('quiz-check');
const quizNextBtn   = document.getElementById('quiz-next');
const quizResults   = document.getElementById('quiz-results');
const quizCard      = document.getElementById('quiz-card');
const quizTabBtn    = document.querySelector('.tab-btn.quiz-tab');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUserNum(s) {
  s = s.trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0b[01]+$/i.test(s))     return parseInt(s.slice(2), 2);
  if (/^-?\d+$/.test(s))        return parseInt(s, 10);
  return NaN;
}

function runCode(code) {
  const wrapped = `section .text\nglobal _start\n_start:\n${code}\nhlt`;
  return quizSim.runAll(wrapped);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderQuestion() {
  const q = QUIZ_QUESTIONS[qIdx];
  const total = QUIZ_QUESTIONS.length;

  quizFeedback.className = 'quiz-feedback hidden';
  quizNextBtn.style.display  = 'none';
  quizCheckBtn.disabled      = false;

  // Progress
  const pct = Math.round((qIdx / total) * 100);
  quizProgress.style.width = pct + '%';
  quizProgressN.textContent = `${qIdx + 1} / ${total}`;
  quizScoreLive.textContent = qIdx > 0 ? `${score} correct so far` : '';
  quizLesson.textContent = q.lesson;
  quizQ.textContent = q.q;

  // Code block
  quizCodeBlock.style.display = q.type === 'code' ? 'block' : 'none';
  if (q.type === 'code') quizCodeBlock.textContent = q.code;

  // Options or input
  quizOpts.innerHTML = '';
  quizOpts.style.display  = 'none';
  quizInput.style.display = 'none';

  if (q.type === 'mc') {
    quizOpts.style.display = 'flex';
    q.opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt';
      btn.textContent = opt;
      btn.addEventListener('click', () => checkMC(i));
      quizOpts.appendChild(btn);
    });
  } else {
    quizInput.style.display = 'flex';
    const inp = quizInput.querySelector('input');
    inp.value = '';
    inp.disabled = false;
    inp.classList.remove('input-error');
    inp.placeholder = 'decimal or 0x hex';
    setTimeout(() => inp.focus(), 50);
  }
}

// ── Answer checking ───────────────────────────────────────────────────────────

function showFeedback(correct, explain) {
  results.push({ correct });
  if (correct) score++;

  quizFeedback.className = 'quiz-feedback ' + (correct ? 'correct' : 'wrong');
  quizFeedback.querySelector('.fb-icon').textContent    = correct ? '✓' : '✗';
  quizFeedback.querySelector('.fb-label').textContent   = correct ? 'Correct!' : 'Not quite.';
  quizFeedback.querySelector('.fb-explain').textContent = explain;

  quizNextBtn.style.display = 'inline-flex';
  quizOpts.querySelectorAll('.quiz-opt').forEach(b => b.disabled = true);
  quizInput.querySelector('input').disabled = true;
  quizCheckBtn.disabled = true;
  quizScoreLive.textContent = `${score} / ${results.length} correct`;
}

function checkMC(chosen) {
  const q = QUIZ_QUESTIONS[qIdx];
  const correct = chosen === q.answer;

  quizOpts.querySelectorAll('.quiz-opt').forEach((b, i) => {
    if (i === q.answer) b.classList.add('opt-correct');
    else if (i === chosen && !correct) b.classList.add('opt-wrong');
  });

  showFeedback(correct, q.explain);
}

function checkCode() {
  if (quizCheckBtn.disabled) return;
  const q   = QUIZ_QUESTIONS[qIdx];
  const inp = quizInput.querySelector('input');
  const val = parseUserNum(inp.value);

  if (isNaN(val)) {
    inp.classList.add('input-error');
    inp.placeholder = 'Enter a number (decimal or 0x hex)';
    return;
  }

  inp.classList.remove('input-error');
  const result = runCode(q.code);
  const actual = result.finalState?.regs?.[q.reg] ?? 0;
  const correct = (val >>> 0) === (actual >>> 0);

  showFeedback(correct,
    correct
      ? q.explain
      : `The correct answer is ${actual >>> 0} (0x${(actual>>>0).toString(16).toUpperCase()}). ${q.explain}`
  );
}

quizCheckBtn.addEventListener('click', checkCode);
quizInput.querySelector('input').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkCode();
});

// ── Navigation ────────────────────────────────────────────────────────────────

function nextQuestion() {
  qIdx++;
  if (qIdx >= QUIZ_QUESTIONS.length) { showResults(); return; }
  renderQuestion();
  quizCard.scrollTo(0, 0);
}

quizNextBtn.addEventListener('click', nextQuestion);

function showResults() {
  const total = QUIZ_QUESTIONS.length;
  quizCard.style.display = 'none';
  quizResults.style.display = 'flex';

  const pct = Math.round((score / total) * 100);
  quizProgress.style.width = '100%';
  quizProgressN.textContent = `${total} / ${total}`;

  const grade = pct >= 90 ? 'Excellent!' : pct >= 70 ? 'Good work.' : pct >= 50 ? 'Keep practising.' : 'Review the lessons and try again.';

  quizResults.innerHTML = `
    <div class="result-score">${score}<span>/${total}</span></div>
    <div class="result-pct">${pct}% correct</div>
    <div class="result-grade">${grade}</div>
    <div class="result-breakdown">
      ${QUIZ_QUESTIONS.map((q, i) => `
        <div class="result-row ${results[i].correct ? 'row-ok' : 'row-bad'}">
          <span class="row-icon">${results[i].correct ? '✓' : '✗'}</span>
          <span class="row-text">${q.q}</span>
          <span class="row-lesson">${q.lesson}</span>
        </div>`).join('')}
    </div>
    <button class="btn btn-primary" id="quiz-retry">Try again</button>
  `;

  document.getElementById('quiz-retry').addEventListener('click', startQuiz);
}

// ── Entry / exit ──────────────────────────────────────────────────────────────

function startQuiz() {
  qIdx = 0; score = 0; results = [];
  quizCard.style.display = 'flex';
  quizResults.style.display = 'none';
  renderQuestion();
}

window.showQuiz = function () {
  mainLayout.style.display = 'none';
  const rankWrap = document.getElementById('rank-wrap');
  if (rankWrap) rankWrap.style.display = 'none';
  quizWrap.style.display   = 'flex';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  quizTabBtn.classList.add('active');
  startQuiz();
};

window.hideQuiz = function () {
  quizWrap.style.display   = 'none';
  mainLayout.style.display = 'grid';
};

// Reset check button state at start of each question
const _origRender = renderQuestion;
// (already resets state inline via quizCheckBtn.disabled = true in showFeedback;
//  re-enable it at render time)
quizCheckBtn.disabled = false;
