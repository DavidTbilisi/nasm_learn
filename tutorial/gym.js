'use strict';

// ── Assembly Gym — timed reflex drills ────────────────────────────────────────
const gymSim = new NASMSimulator();

// Run a short snippet, return final register/flag state
function gymRun(lines) {
  const code = `section .text\nglobal _start\n_start:\n${lines}\nhlt`;
  return gymSim.runAll(code).finalState;
}

const rnd  = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuf = arr => [...arr].sort(() => Math.random() - .5);

// Build plausible wrong answers for a numeric correct value
function wrongs(correct, n = 3) {
  const c = correct >>> 0;
  const cands = shuf([
    c+1, c-1, c+2, c-2, c*2, c+4, c-4, c<<1, c>>>1,
    c^0xFF, c+8, c-8, c*3, c*4, rnd(1,100), rnd(1,200),
  ].filter(v => v !== c && v >= 0 && v < 0x100000000));
  const ws = new Set();
  for (const v of cands) { if (ws.size >= n) break; ws.add(v >>> 0); }
  while (ws.size < n) ws.add(rnd(1, 200));
  return [...ws];
}

function mcOpts(correct, labels) {
  // labels: array of strings; first must equal correct
  const ws = wrongs(typeof correct === 'number' ? correct : 0, 3);
  const opts = typeof correct === 'string'
    ? shuf(labels.map(l => ({ label: l, correct: l === correct })))
    : shuf([
        { label: String(correct >>> 0), correct: true },
        ...ws.map(w => ({ label: String(w), correct: false })),
      ]);
  return opts;
}

// ── Drill templates ───────────────────────────────────────────────────────────
const DRILLS = {

  // ── Registers ───────────────────────────────────────────────────────────────
  registers: [
    () => {
      const v = rnd(1, 255);
      const s = gymRun(`mov eax, ${v}`);
      return { cat:'Registers', diff:1, q:`What is <code>EAX</code>?`,
        code:`mov eax, ${v}`, answer: s.regs.eax>>>0, type:'type',
        explain: `MOV copies the source. EAX = ${v}.` };
    },
    () => {
      const v = rnd(1, 127);
      const s = gymRun(`xor eax, eax\nmov al, ${v}`);
      return { cat:'Registers', diff:1,
        q:`EAX starts at 0. After <code>mov al, ${v}</code>, what is <code>EAX</code>?`,
        code:`xor eax, eax\nmov al, ${v}`, answer: s.regs.eax>>>0, type:'type',
        explain:`AL is the low byte of EAX. Setting AL=${v} on a zeroed EAX gives EAX=${v}.` };
    },
    () => {
      const v = rnd(0x1200, 0xABCD);
      const s = gymRun(`mov eax, 0x${v.toString(16).toUpperCase()}`);
      const ax = s.regs.eax & 0xFFFF;
      return { cat:'Registers', diff:2,
        q:`After <code>mov eax, 0x${v.toString(16).toUpperCase()}</code> — what is <code>AX</code> (lower 16 bits)?`,
        code:`mov eax, 0x${v.toString(16).toUpperCase()}`,
        answer: ax, type:'type',
        explain:`AX = lower 16 bits of EAX = 0x${ax.toString(16).toUpperCase()} = ${ax}.` };
    },
    () => {
      const q = pick([
        { q:'Which register is the <em>low byte</em> of EBX?', a:'BL', opts:['BL','BH','BX','EBX'] },
        { q:'Which is the <em>high byte</em> of AX?', a:'AH', opts:['AH','AL','AX','EAX'] },
        { q:'How many bits does <code>AX</code> hold?', a:'16', opts:['16','8','32','4'] },
        { q:'What does <code>xor eax, eax</code> always produce?', a:'0', opts:['0','1','EAX','undefined'] },
        { q:'ESI stands for:', a:'Source Index', opts:['Source Index','Stack Index','Segment Index','Sign Index'] },
        { q:'Which register is callee-saved (must be preserved)?', a:'EBX', opts:['EBX','EAX','ECX','EDX'] },
      ]);
      return { cat:'Registers', diff:1, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer: q.a, explain:`${q.a}.` };
    },
  ],

  // ── Arithmetic ──────────────────────────────────────────────────────────────
  arithmetic: [
    () => {
      const a = rnd(1,100), b = rnd(1,100);
      const s = gymRun(`mov eax, ${a}\nadd eax, ${b}`);
      return { cat:'Arithmetic', diff:1,
        q:`What is <code>EAX</code> after <code>add eax, ${b}</code>?`,
        code:`mov eax, ${a}\nadd eax, ${b}`, answer: s.regs.eax>>>0, type:'type',
        explain:`${a} + ${b} = ${s.regs.eax}.` };
    },
    () => {
      const a = rnd(10,200), b = rnd(1, a-1);
      const s = gymRun(`mov eax, ${a}\nsub eax, ${b}`);
      return { cat:'Arithmetic', diff:1, q:`What is <code>EAX</code>?`,
        code:`mov eax, ${a}\nsub eax, ${b}`, answer: s.regs.eax>>>0, type:'type',
        explain:`${a} − ${b} = ${s.regs.eax}.` };
    },
    () => {
      const v = rnd(1, 30), sh = rnd(1, 4);
      const s = gymRun(`mov eax, ${v}\nshl eax, ${sh}`);
      return { cat:'Arithmetic', diff:2,
        q:`SHL multiplies by 2<sup>${sh}</sup>. What is <code>EAX</code>?`,
        code:`mov eax, ${v}\nshl eax, ${sh}`, answer: s.regs.eax>>>0, type:'type',
        explain:`${v} × 2^${sh} = ${v} × ${1<<sh} = ${s.regs.eax}.` };
    },
    () => {
      const a = rnd(2, 20), b = rnd(2, 8);
      const s = gymRun(`mov eax, ${a}\nmov ecx, ${b}\nimul eax, ecx`);
      return { cat:'Arithmetic', diff:2,
        q:`Signed multiply. What is <code>EAX</code>?`,
        code:`mov eax, ${a}\nmov ecx, ${b}\nimul eax, ecx`, answer: s.regs.eax>>>0, type:'type',
        explain:`IMUL: ${a} × ${b} = ${s.regs.eax}.` };
    },
    () => {
      const q = pick([
        { q:'INC updates ZF/SF/OF — which flag does it <em>NOT</em> update?', a:'CF', opts:['CF','ZF','SF','OF'] },
        { q:'MUL ecx result — where does the high 32 bits go?', a:'EDX', opts:['EDX','ECX','EBX','Flags'] },
        { q:'NEG eax computes:', a:'0 − EAX', opts:['0 − EAX','~EAX','EAX−1','EAX XOR 0xFF'] },
        { q:'Which has a smaller encoding: <code>xor eax,eax</code> or <code>mov eax,0</code>?', a:'xor eax, eax', opts:['xor eax, eax','mov eax, 0','They are equal','Depends on CPU'] },
        { q:'SAR differs from SHR in that SAR:', a:'Copies the sign bit', opts:['Copies the sign bit','Ignores the sign bit','Sets CF','Clears OF'] },
      ]);
      return { cat:'Arithmetic', diff:1, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
  ],

  // ── Flags ────────────────────────────────────────────────────────────────────
  flags: [
    () => {
      const a = rnd(1, 80);
      return { cat:'Flags', diff:1,
        q:`After <code>mov eax, ${a}</code> then <code>sub eax, ${a}</code> — what is ZF?`,
        code:`mov eax, ${a}\nsub eax, ${a}`, type:'mc', answer:'1',
        opts:[ {label:'ZF = 1 (set)',correct:true},{label:'ZF = 0 (clear)',correct:false},
               {label:'CF = 1',correct:false},{label:'SF = 1',correct:false} ],
        explain:`${a} − ${a} = 0 → ZF = 1.` };
    },
    () => {
      const a = rnd(1, 10), b = rnd(a+1, 50);
      return { cat:'Flags', diff:2,
        q:`<code>cmp ${a}, ${b}</code> — unsigned ${a} &lt; ${b}, so CF = ?`,
        code:`mov eax, ${a}\ncmp eax, ${b}`, type:'mc', answer:'CF = 1',
        opts:[ {label:'CF = 1',correct:true},{label:'CF = 0',correct:false},
               {label:'ZF = 1',correct:false},{label:'OF = 1',correct:false} ],
        explain:`CMP computes ${a}−${b}. ${a} < ${b} unsigned → borrow → CF = 1.` };
    },
    () => {
      const q = pick([
        { q:'Which flag is set when the result is exactly zero?', a:'ZF', opts:['ZF','CF','SF','OF'] },
        { q:'Which flag shows <em>unsigned</em> overflow from addition?', a:'CF', opts:['CF','OF','ZF','SF'] },
        { q:'Which flag shows <em>signed</em> overflow?', a:'OF', opts:['OF','CF','ZF','SF'] },
        { q:'SF (Sign Flag) copies which bit of the result?', a:'Bit 31 (MSB)', opts:['Bit 31 (MSB)','Bit 0 (LSB)','Bit 15','CF'] },
        { q:'After <code>xor eax, eax</code> — ZF is:', a:'1', opts:['1','0','Unchanged','Undefined'] },
        { q:'Signed less-than: which jump reads SF and OF?', a:'JL', opts:['JL','JB','JS','JC'] },
        { q:'Unsigned below: which jump reads CF only?', a:'JB', opts:['JB','JL','JS','JG'] },
        { q:'TEST eax, eax is equivalent to:', a:'CMP eax, 0 (without storing result)', opts:['CMP eax, 0 (without storing result)','AND eax, 0','OR eax, 0','MOV eax, eax'] },
      ]);
      return { cat:'Flags', diff:1, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
  ],

  // ── Mental Trace ─────────────────────────────────────────────────────────────
  trace: [
    () => {
      const a = rnd(1,50), b = rnd(1,50), c = rnd(1,30);
      const s = gymRun(`mov eax, ${a}\nmov ebx, ${b}\nadd eax, ebx\nsub eax, ${c}`);
      return { cat:'Mental Trace', diff:2,
        q:`Run mentally. What is <code>EAX</code>?`,
        code:`mov eax, ${a}\nmov ebx, ${b}\nadd eax, ebx\nsub eax, ${c}`,
        answer: s.regs.eax>>>0, type:'type',
        explain:`${a} + ${b} − ${c} = ${s.regs.eax}.` };
    },
    () => {
      const a = rnd(1,50), b = rnd(1,50);
      const s = gymRun(`mov eax, ${a}\nmov ebx, ${b}\nxchg eax, ebx`);
      return { cat:'Mental Trace', diff:2,
        q:`After XCHG, what is <code>EBX</code>?`,
        code:`mov eax, ${a}\nmov ebx, ${b}\nxchg eax, ebx`,
        answer: s.regs.ebx>>>0, type:'type',
        explain:`XCHG swaps EAX↔EBX. EBX was ${b}, now holds the original EAX = ${a}.` };
    },
    () => {
      const v = rnd(2, 12), mult = pick([2, 3, 4, 5]);
      const s = gymRun(`mov eax, ${v}\nlea eax, [eax+eax*${mult-1}]`);
      return { cat:'Mental Trace', diff:3,
        q:`LEA computes an address with no memory read. What is <code>EAX</code>?`,
        code:`mov eax, ${v}\nlea eax, [eax+eax*${mult-1}]`,
        answer: s.regs.eax>>>0, type:'type',
        explain:`[eax + eax×${mult-1}] = eax × ${mult} = ${v} × ${mult} = ${s.regs.eax}.` };
    },
    () => {
      const v = rnd(0, 0xFF), mask = pick([0x0F, 0xF0, 0x55, 0xAA, 0x3F]);
      const s = gymRun(`mov eax, 0x${v.toString(16).toUpperCase().padStart(2,'0')}\nand eax, 0x${mask.toString(16).toUpperCase()}`);
      return { cat:'Mental Trace', diff:2,
        q:`AND with mask 0x${mask.toString(16).toUpperCase()}. What is <code>EAX</code>?`,
        code:`mov eax, 0x${v.toString(16).toUpperCase().padStart(2,'0')}\nand eax, 0x${mask.toString(16).toUpperCase()}`,
        answer: s.regs.eax>>>0, type:'type',
        explain:`0x${v.toString(16).toUpperCase()} & 0x${mask.toString(16).toUpperCase()} = 0x${(v&mask).toString(16).toUpperCase()} = ${v&mask}.` };
    },
    () => {
      const a = rnd(4, 30), b = rnd(2, a);
      const s = gymRun(`mov eax, ${a}\nmov ecx, ${b}\nxor edx, edx\ndiv ecx`);
      return { cat:'Mental Trace', diff:3,
        q:`After unsigned DIV: <code>edx=0 / eax=${a} / div by ${b}</code> — what is <code>EAX</code> (quotient)?`,
        code:`mov eax, ${a}\nmov ecx, ${b}\nxor edx, edx\ndiv ecx`,
        answer: s.regs.eax>>>0, type:'type',
        explain:`${a} ÷ ${b} = ${Math.floor(a/b)} remainder ${a%b}. EAX = ${Math.floor(a/b)}.` };
    },
    () => {
      const n = rnd(1, 8);
      const s = gymRun(`mov ecx, ${n}\nmov eax, 1\nshift_loop:\nadd eax, eax\nloop shift_loop`);
      return { cat:'Mental Trace', diff:2,
        q:`This loop doubles EAX ${n} times starting from 1. What is <code>EAX</code>?`,
        code:`mov ecx, ${n}\nmov eax, 1\nshift_loop:\n  add eax, eax\n  loop shift_loop`,
        answer: s.regs.eax>>>0, type:'type',
        explain:`1 doubled ${n} time(s) = 2^${n} = ${s.regs.eax}.` };
    },
  ],

  // ── Addressing ───────────────────────────────────────────────────────────────
  addressing: [
    () => {
      const q = pick([
        { q:'In cdecl, where is <em>arg1</em> after the function prologue?', a:'[EBP+8]', opts:['[EBP+8]','[EBP+4]','[EBP+12]','[EBP-4]'] },
        { q:'What is at <code>[EBP+4]</code> in a cdecl stack frame?', a:'Return address', opts:['Return address','Arg 1','Saved EBP','Local var'] },
        { q:'<code>sub esp, 8</code> in a prologue reserves space for:', a:'2 local dwords', opts:['2 local dwords','8 locals','8 args','EBP backup'] },
        { q:'First local variable after prologue lives at:', a:'[EBP-4]', opts:['[EBP-4]','[EBP+4]','[EBP-8]','[ESP]'] },
      ]);
      return { cat:'Addressing', diff:2, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
    () => {
      const q = pick([
        { q:'For a <code>dd</code> (dword) array, element 3 is at byte offset:', a:'12', opts:['12','3','4','8'] },
        { q:'<code>[arr+ecx*4]</code> — the ×4 is the:', a:'Element size in bytes', opts:['Element size in bytes','ECX value','Array length','Index multiplier'] },
        { q:'Does <code>LEA</code> read from memory?', a:'No — it only computes the address', opts:['No — it only computes the address','Yes, always','Only for dword','Only if base is a label'] },
        { q:'<code>lea eax, [eax+eax*2]</code> computes:', a:'EAX × 3', opts:['EAX × 3','EAX + 2','EAX × 2','EAX × 4'] },
        { q:'Byte array element i is at offset:', a:'i × 1', opts:['i × 1','i × 2','i × 4','i × 8'] },
        { q:'The cdecl calling convention — who cleans up pushed arguments?', a:'Caller (ADD ESP after call)', opts:['Caller (ADD ESP after call)','Callee (RET N)','Neither','OS'] },
      ]);
      return { cat:'Addressing', diff:2, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
    () => {
      const n = rnd(0, 4);
      const offset = n * 4;
      return { cat:'Addressing', diff:2,
        q:`A dword array starts at address 0x4000. What is the address of element ${n}?`,
        code:null, type:'mc', answer:`0x${(0x4000 + offset).toString(16).toUpperCase()}`,
        opts: shuf([0, 4, 8, 12].map(o => {
          const a = `0x${(0x4000+o).toString(16).toUpperCase()}`;
          return { label: a, correct: o === offset };
        })),
        explain:`Element ${n} is at base + ${n}×4 = 0x4000 + ${offset} = 0x${(0x4000+offset).toString(16).toUpperCase()}.` };
    },
  ],

  // ── Idioms ────────────────────────────────────────────────────────────────────
  idioms: [
    () => {
      const q = pick([
        { q:'Fastest way to zero EAX:', a:'xor eax, eax', opts:['xor eax, eax','mov eax, 0','sub eax, eax','and eax, 0'] },
        { q:'Check if EAX is zero <em>without modifying it</em>:', a:'test eax, eax', opts:['test eax, eax','cmp eax, 0','and eax, eax','or eax, eax'] },
        { q:'Multiply EAX by 8 using a shift:', a:'shl eax, 3', opts:['shl eax, 3','shl eax, 8','shr eax, 3','mul eax, 8'] },
        { q:'Swap EAX and EBX in one instruction:', a:'xchg eax, ebx', opts:['xchg eax, ebx','push eax / pop ebx','mov eax, ebx','xor eax, ebx'] },
      ]);
      return { cat:'Idioms', diff:2, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`Idiomatic: ${q.a}.` };
    },
    () => {
      const q = pick([
        { q:'Sign-extend EAX into EDX before IDIV:', a:'cdq', opts:['cdq','mov edx, 0','xor edx, edx','sar edx, 31'] },
        { q:'EAX × 3 in one LEA instruction:', a:'lea eax, [eax+eax*2]', opts:['lea eax, [eax+eax*2]','lea eax, [eax*3]','imul eax, 3','lea eax, [eax+eax+eax]'] },
        { q:'Negate EAX (two\'s complement):', a:'neg eax', opts:['neg eax','not eax','xor eax, 0xFFFFFFFF','sub eax, eax'] },
        { q:'Absolute value of EAX — after SAR eax,31 you get:', a:'All 1s if negative, 0 if positive', opts:['All 1s if negative, 0 if positive','EAX unchanged','EAX divided by 2','The sign bit repeated'] },
        { q:'PUSH is equivalent to:', a:'ESP−=4; [ESP]=val', opts:['ESP−=4; [ESP]=val','[ESP]=val; ESP−=4','ESP+=4; [ESP]=val','[ESP+4]=val'] },
        { q:'POP is equivalent to:', a:'val=[ESP]; ESP+=4', opts:['val=[ESP]; ESP+=4','ESP−=4; val=[ESP]','val=[ESP+4]; ESP+=4','[ESP]=val; ESP+=4'] },
      ]);
      return { cat:'Idioms', diff:2, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
    () => {
      const q = pick([
        { q:'CALL pushes the return address, then jumps. The return address is:', a:'Address of the next instruction', opts:['Address of the next instruction','Address of CALL itself','Address of the function','Top of stack'] },
        { q:'LOOP decrements ECX, then:', a:'Jumps if ECX ≠ 0', opts:['Jumps if ECX ≠ 0','Jumps if ECX = 0','Always jumps','Jumps if ZF = 1'] },
        { q:'REP MOVSB copies ECX bytes. After it completes, ECX = ?', a:'0', opts:['0','Original ECX','1','ECX − 1'] },
        { q:'REPNE SCASB stops when:', a:'mem[EDI] = AL, or ECX = 0', opts:['mem[EDI] = AL, or ECX = 0','ECX = 0 only','ZF = 0','EDI = ESI'] },
        { q:'Stack grows toward:', a:'Lower addresses', opts:['Lower addresses','Higher addresses','Either direction','Fixed address'] },
      ]);
      return { cat:'Idioms', diff:1, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
  ],

  // ── Spot the Bug — silent-corruption traps ─────────────────────────────────
  spotbug: [
    // Sub-register width — mov al only touches bits 0-7
    () => {
      const lo  = rnd(0x10, 0xFF);
      const hex = lo.toString(16).padStart(2,'0').toUpperCase();
      const code = `mov eax, 0xDEADBEEF\nmov al, 0x${hex}`;
      const s = gymRun(code);
      return { cat:'Spot the Bug', diff:2,
        q:`EAX = 0xDEADBEEF. After <code>mov al, 0x${hex}</code> what is EAX? <em>(MOV AL only writes bits 0-7.)</em>`,
        code, answer:s.regs.eax>>>0, type:'type',
        explain:`Writing AL leaves the upper 24 bits alone. EAX = 0xDEADBE${hex} = ${s.regs.eax>>>0}. The same write to a 32-bit reg on x86-64 (<code>mov eax, X</code>) WOULD zero the upper 32 of RAX — that asymmetry is the trap.` };
    },

    // Pop in wrong order — silently swaps registers
    () => {
      const a = rnd(10,250);
      let   b = rnd(10,250); while (b === a) b = rnd(10,250);
      const code = `mov eax, ${a}\nmov ebx, ${b}\npush eax\npush ebx\npop eax\npop ebx`;
      const s = gymRun(code);
      return { cat:'Spot the Bug', diff:2,
        q:`EAX=${a}, EBX=${b}. After <code>push eax; push ebx; pop eax; pop ebx</code>, what is EAX?`,
        code, answer:s.regs.eax>>>0, type:'type',
        explain:`Stack is LIFO. The last push (EBX=${b}) is on top, so the first POP puts ${b} into EAX. Registers ended SWAPPED. Correct pattern: pop in REVERSE order of the pushes.` };
    },

    // Endianness — byte at top of pushed dword
    () => {
      const bytes = [rnd(1,255), rnd(1,255), rnd(1,255), rnd(1,255)];
      const dword = ((bytes[3]<<24)|(bytes[2]<<16)|(bytes[1]<<8)|bytes[0]) >>> 0;
      const hex   = dword.toString(16).padStart(8,'0').toUpperCase();
      const code  = `push 0x${hex}\nxor eax, eax\nmov al, [esp]`;
      const s = gymRun(code);
      return { cat:'Spot the Bug', diff:2,
        q:`After <code>push 0x${hex}</code>, you do <code>mov al, [esp]</code>. What is AL? <em>(x86 is little-endian.)</em>`,
        code, answer:s.regs.eax>>>0, type:'type',
        explain:`Little-endian stores the low byte at the low address. The byte at [ESP] = low byte of the dword = 0x${bytes[0].toString(16).padStart(2,'0').toUpperCase()} = ${bytes[0]}.` };
    },

    // Syscall clobbers EAX with the return value
    () => {
      const len = rnd(3, 16);
      const code = `mov eax, 0xCAFE\nmov ebx, 1\nmov ecx, 0x4000\nmov edx, ${len}\nmov eax, 4\nint 0x80`;
      const s = gymRun(code);
      return { cat:'Spot the Bug', diff:2,
        q:`Right before <code>int 0x80</code>, EAX = 4 (sys_write) and EDX = ${len}. After the syscall returns, what is EAX?`,
        code, answer:s.regs.eax>>>0, type:'type',
        explain:`Every Linux syscall returns its result in EAX, overwriting the syscall number you put there. sys_write returns bytes-written = ${len}. To preserve a value across a syscall, PUSH it first or stash it in a callee-saved register.` };
    },

    // SAR vs SHR on a negative value — signed division must use SAR
    () => {
      const mag   = pick([8, 16, 32, 64, 100]);
      const shift = pick([1, 2]);
      const neg   = ((-mag) >>> 0);
      const code  = `mov eax, 0x${neg.toString(16).toUpperCase()}\nsar eax, ${shift}`;
      const s = gymRun(code);
      const signed = s.regs.eax | 0;
      return { cat:'Spot the Bug', diff:3,
        q:`EAX = -${mag} (stored as 0x${neg.toString(16).toUpperCase()}). After <code>sar eax, ${shift}</code>, what is EAX as an UNSIGNED 32-bit value? <em>(SAR preserves the sign bit; SHR would not.)</em>`,
        code, answer:s.regs.eax>>>0, type:'type',
        explain:`SAR (arithmetic shift right) copies the sign bit into vacated bits → signed division by 2^${shift}. As signed: ${signed}. As unsigned: ${s.regs.eax>>>0} (= 0x${(s.regs.eax>>>0).toString(16).toUpperCase()}). SHR would have given the wrong answer 0x${((neg>>>0) >>> shift).toString(16).toUpperCase()} — losing the sign.` };
    },

    // INC does not update CF (vs ADD reg, 1)
    () => {
      const q = pick([
        { q:'EAX = 0xFFFFFFFF. After <code>inc eax</code>, what is the state of <strong>CF</strong>?',
          a:'CF is UNCHANGED (INC does not touch CF)',
          opts:['CF is UNCHANGED (INC does not touch CF)','CF = 1 (the result wrapped)','CF = 0 (because the result is zero)','CF mirrors ZF'] },
        { q:'You want to detect an unsigned wrap on an increment. <code>inc eax</code> or <code>add eax, 1</code>?',
          a:'add eax, 1 — only ADD updates CF',
          opts:['add eax, 1 — only ADD updates CF','inc eax — INC always sets CF on wrap','Either works','Neither — you need ADC'] },
        { q:'Why is <code>xor eax, eax</code> often preferred to <code>mov eax, 0</code>?',
          a:'Smaller encoding (2 bytes vs 5) and faster on most uarches',
          opts:['Smaller encoding (2 bytes vs 5) and faster on most uarches','XOR is the only way to clear a register','XOR preserves flags; MOV trashes them','XOR atomically resets all eight GPRs'] },
        { q:'sys_write returns its result in which register?',
          a:'EAX (overwriting the syscall number)',
          opts:['EAX (overwriting the syscall number)','EBX','EDX','None — syscalls have no return'] },
      ]);
      return { cat:'Spot the Bug', diff:2, q:q.q, code:null, type:'mc',
        opts: shuf(q.opts).map(o => ({ label:o, correct: o===q.a })),
        answer:q.a, explain:`${q.a}.` };
    },
  ],
};

// ── Workout definitions ───────────────────────────────────────────────────────
const WORKOUTS = [
  { id:'registers',  icon:'📦', name:'Registers',    desc:'Names, sub-registers, and MOV.',           cats:['registers'],                                    reps:8,  secs:12 },
  { id:'arithmetic', icon:'➕', name:'Arithmetic',   desc:'ADD, SUB, IMUL, shifts — build intuition.', cats:['arithmetic'],                                   reps:8,  secs:15 },
  { id:'flags',      icon:'🚩', name:'Flags',        desc:'ZF, CF, SF, OF — instant recognition.',     cats:['flags'],                                        reps:8,  secs:12 },
  { id:'trace',      icon:'🧠', name:'Mental Trace', desc:'Run 4-6 instructions in your head.',        cats:['trace'],                                        reps:6,  secs:25 },
  { id:'addressing', icon:'📍', name:'Addressing',   desc:'[ebp+8], [arr+ecx*4], LEA.',                cats:['addressing'],                                   reps:8,  secs:15 },
  { id:'idioms',     icon:'⚡', name:'Idioms',       desc:'Fastest, most idiomatic assembly patterns.', cats:['idioms'],                                       reps:8,  secs:15 },
  { id:'spotbug',    icon:'🐛', name:'Spot the Bug', desc:'Silent-corruption traps: endianness, sub-registers, pop order.', cats:['spotbug'],                                      reps:6,  secs:25 },
  { id:'fullbody',   icon:'💪', name:'Full Body',    desc:'All categories. The real workout.',          cats:['registers','arithmetic','flags','trace','addressing','idioms','spotbug'], reps:14, secs:20 },
];

// ── Session state ─────────────────────────────────────────────────────────────
let gymState  = null;
let gymTimer  = null;
let gymActive = false;

function buildPool(cats) {
  const pool = [];
  for (const cat of cats) {
    const tmpls = DRILLS[cat] || [];
    // Pad so each category contributes roughly equally
    const copies = Math.max(1, Math.ceil(4 / tmpls.length));
    for (let i = 0; i < copies; i++)
      for (const t of tmpls) pool.push({ cat, t });
  }
  return pool;
}

// ── Start / next ──────────────────────────────────────────────────────────────
function gymStart(workoutId) {
  const w = WORKOUTS.find(w => w.id === workoutId);
  if (!w) return;
  gymState = { w, pool: buildPool(w.cats), done:0, correct:0, streak:0, maxStreak:0, times:[], repStart:0, answered:false, drill:null };
  document.getElementById('gym-sidebar-workout').textContent = w.name;
  showGymDrill();
  gymNextRep();
}

function gymNextRep() {
  if (!gymState) return;
  if (gymState.done >= gymState.w.reps) { gymResults(); return; }

  let drill;
  try { drill = pick(gymState.pool).t(); } catch(e) { drill = pick(gymState.pool).t(); }
  gymState.drill    = drill;
  gymState.answered = false;
  gymState.repStart = Date.now();

  renderDrill(drill);
  timerStart(gymState.w.secs);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function timerStart(secs) {
  timerClear();
  const bar   = document.getElementById('gym-timer-fill');
  const label = document.getElementById('gym-timer-label');
  if (!bar) return;

  bar.style.animation  = 'none';
  bar.style.width      = '100%';
  void bar.offsetWidth; // force reflow
  bar.style.animation  = `gym-shrink ${secs}s linear forwards, gym-heat ${secs}s linear forwards`;

  let ms = secs * 1000;
  if (label) label.textContent = secs + 's';
  gymTimer = setInterval(() => {
    ms -= 200;
    if (label) label.textContent = Math.max(0, Math.ceil(ms/1000)) + 's';
    if (ms <= 0) { timerClear(); if (!gymState.answered) gymTimeUp(); }
  }, 200);
}

function timerClear() {
  if (gymTimer) { clearInterval(gymTimer); gymTimer = null; }
  const bar = document.getElementById('gym-timer-fill');
  if (bar) { bar.style.animation = 'none'; bar.style.width = '0%'; }
}

function gymTimeUp() {
  gymState.answered = true;
  gymState.streak   = 0;
  gymState.times.push(gymState.w.secs * 1000);
  gymState.done++;
  gymFeedback(false, gymState.drill.explain, gymState.drill.answer);
}

// ── Render question ───────────────────────────────────────────────────────────
function renderDrill(d) {
  const get = id => document.getElementById(id);
  get('gym-question').innerHTML  = d.q;
  get('gym-category-tag').textContent = d.cat;
  get('gym-rep-counter').textContent = `${gymState.done + 1} / ${gymState.w.reps}`;
  updateStreak();

  const codeEl = get('gym-drill-code');
  codeEl.textContent = d.code || '';
  codeEl.style.display = d.code ? 'block' : 'none';

  get('gym-feedback').className = 'gym-feedback hidden';
  get('gym-next-btn').style.display = 'none';

  const mcEl   = get('gym-mc-area');
  const typeEl = get('gym-type-area');
  mcEl.innerHTML = typeEl.innerHTML = '';

  if (d.type === 'mc') {
    mcEl.style.display  = 'grid';
    typeEl.style.display = 'none';
    d.opts.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'gym-opt';
      b.innerHTML = `<span class="gym-key">${String.fromCharCode(65+i)}</span>${opt.label}`;
      b.addEventListener('click', () => gymSubmitMC(i));
      mcEl.appendChild(b);
    });
  } else {
    mcEl.style.display  = 'none';
    typeEl.style.display = 'flex';
    typeEl.innerHTML = `
      <span class="gym-type-label">= ?</span>
      <input id="gym-type-inp" class="gym-type-inp" type="text" placeholder="e.g. 42" autocomplete="off" spellcheck="false">
      <button id="gym-type-sub" class="btn btn-primary">Check</button>`;
    const inp = document.getElementById('gym-type-inp');
    document.getElementById('gym-type-sub').addEventListener('click', gymSubmitType);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') gymSubmitType(); });
    inp.focus();
  }
}

function updateStreak() {
  const el = document.getElementById('gym-streak-display');
  if (!el) return;
  const s = gymState.streak;
  el.textContent = s;
  el.className = 'gym-streak-val' + (s >= 5 ? ' on-fire' : s >= 3 ? ' heating' : '');
}

// ── Answer submission ─────────────────────────────────────────────────────────
function gymSubmitMC(idx) {
  if (!gymState || gymState.answered) return;
  gymState.answered = true;
  timerClear();
  const d = gymState.drill;
  document.querySelectorAll('.gym-opt').forEach((b, i) => {
    b.disabled = true;
    if (d.opts[i].correct) b.classList.add('gym-opt-correct');
    else if (i === idx && !d.opts[idx].correct) b.classList.add('gym-opt-wrong');
  });
  gymFinishRep(d.opts[idx].correct, d.explain, d.answer);
}

function gymSubmitType() {
  if (!gymState || gymState.answered) return;
  const inp = document.getElementById('gym-type-inp');
  if (!inp) return;
  const raw = inp.value.trim();
  let val = /^0x[0-9a-f]+$/i.test(raw) ? parseInt(raw, 16)
          : /^-?\d+$/.test(raw)         ? parseInt(raw, 10)
          : null;
  if (val === null) { inp.classList.add('gym-inp-error'); return; }

  const d = gymState.drill;
  const ok = ((val >>> 0) === (d.answer >>> 0));
  inp.disabled = true;
  document.getElementById('gym-type-sub').disabled = true;
  inp.classList.add(ok ? 'gym-inp-correct' : 'gym-inp-wrong');
  gymState.answered = true;
  timerClear();
  gymFinishRep(ok, d.explain, d.answer);
}

function gymFinishRep(ok, explain, answer) {
  gymState.times.push(Date.now() - gymState.repStart);
  gymState.done++;
  if (ok) { gymState.correct++; gymState.streak++; gymState.maxStreak = Math.max(gymState.maxStreak, gymState.streak); }
  else    { gymState.streak = 0; }
  updateStreak();
  gymFeedback(ok, explain, answer);
}

function gymFeedback(ok, explain, answer) {
  const fb   = document.getElementById('gym-feedback');
  const next = document.getElementById('gym-next-btn');
  fb.className = 'gym-feedback ' + (ok ? 'correct' : 'wrong');
  fb.innerHTML = ok
    ? `<span class="fb-icon">✓</span><strong>Correct!</strong><span class="fb-explain">${explain}</span>`
    : `<span class="fb-icon">✗</span><strong>Wrong.</strong> Answer: <code>${answer}</code><span class="fb-explain">${explain}</span>`;
  next.style.display = 'inline-flex';
  next.focus();
}

// ── Results ───────────────────────────────────────────────────────────────────
function gymResults() {
  timerClear();
  const s   = gymState;
  const pct = Math.round(s.correct / s.w.reps * 100);
  const avg = s.times.length ? (s.times.reduce((a,b)=>a+b,0)/s.times.length/1000).toFixed(1) : '—';
  const grade = pct >= 90 ? '🏆 Elite' : pct >= 75 ? '💪 Strong' : pct >= 50 ? '📈 Getting there' : '🔄 Keep drilling';

  document.getElementById('gym-drill-area').style.display = 'none';
  const res = document.getElementById('gym-results');
  res.style.display = 'flex';
  res.innerHTML = `
    <div class="gym-res-score">${s.correct}<span>/${s.w.reps}</span></div>
    <div class="gym-res-pct">${pct}% accuracy</div>
    <div class="gym-res-grade">${grade}</div>
    <div class="gym-res-stats">
      <div class="gym-stat"><span>${avg}s</span>avg</div>
      <div class="gym-stat"><span>${s.maxStreak}${s.maxStreak>=3?'🔥':''}</span>streak</div>
      <div class="gym-stat"><span>${s.correct}</span>correct</div>
    </div>
    <div class="gym-res-actions">
      <button class="btn btn-primary" onclick="gymStart('${s.w.id}')">Again ↺</button>
      <button class="btn btn-secondary" onclick="gymMenu()">Workouts</button>
    </div>`;
}

// ── Layout helpers ────────────────────────────────────────────────────────────
function gymMenu() {
  timerClear();
  document.getElementById('gym-menu').style.display        = 'grid';
  document.getElementById('gym-drill-area').style.display  = 'none';
  document.getElementById('gym-results').style.display     = 'none';
  document.getElementById('gym-sidebar').style.visibility  = 'hidden';
}

function showGymDrill() {
  document.getElementById('gym-menu').style.display        = 'none';
  document.getElementById('gym-drill-area').style.display  = 'flex';
  document.getElementById('gym-results').style.display     = 'none';
  document.getElementById('gym-sidebar').style.visibility  = 'visible';
}

// ── Keyboard shortcuts (MC: A-D) ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!gymActive || !gymState || gymState.answered) return;
  const d = gymState.drill;
  if (!d || d.type !== 'mc') return;
  const i = e.key.toUpperCase().charCodeAt(0) - 65;
  if (i >= 0 && i < d.opts.length) gymSubmitMC(i);
});

// ── Initialise menu ───────────────────────────────────────────────────────────
(function initGym() {
  const menu = document.getElementById('gym-menu');
  if (!menu) return;
  menu.innerHTML = WORKOUTS.map(w => `
    <button class="gym-card" onclick="gymStart('${w.id}')">
      <span class="gym-card-icon">${w.icon}</span>
      <span class="gym-card-name">${w.name}</span>
      <span class="gym-card-desc">${w.desc}</span>
      <span class="gym-card-meta">${w.reps} reps · ≤${w.secs}s each</span>
    </button>`).join('');

  document.getElementById('gym-next-btn')
    ?.addEventListener('click', gymNextRep);
  document.getElementById('gym-back-btn')
    ?.addEventListener('click', gymMenu);
})();

// ── Public API ────────────────────────────────────────────────────────────────
window.showGym = () => {
  gymActive = true;
  document.getElementById('gym-wrap').style.display   = 'flex';
  document.getElementById('main-layout').style.display = 'none';
  document.getElementById('quiz-wrap').style.display  = 'none';
  gymMenu();
};
window.hideGym = () => {
  gymActive = false;
  timerClear();
  gymState = null;
  document.getElementById('gym-wrap').style.display   = 'none';
  document.getElementById('main-layout').style.display = 'grid';
};
