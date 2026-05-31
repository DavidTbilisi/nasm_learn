'use strict';

(function () {

// ── Belt Foreman ────────────────────────────────────────────────────────────
// Conveyor delivers a stream of bytes. Player writes NASM that reads from the
// belt and pushes results into numbered bins. Syscalls live in the 0x100s.
//
//   eax=0x100  belt_read   → eax = next byte, or 0xFFFF if belt empty
//   eax=0x101  belt_peek   → eax = next byte (no advance), or 0xFFFF
//   eax=0x102  bin_push    → ebx = bin id (0..N-1), ecx = value
//   eax=0x103  belt_done   → eax = 1 if belt empty, else 0

const BELT_READ  = 0x100;
const BELT_PEEK  = 0x101;
const BIN_PUSH   = 0x102;
const BELT_DONE  = 0x103;

function makeWorld(belt, binCount) {
  return {
    belt: [...belt],
    cursor: 0,
    bins: Array.from({ length: binCount }, () => []),
  };
}

function installSyscalls(sim, world) {
  sim.syscallTable[BELT_READ] = (s) => {
    if (world.cursor >= world.belt.length) { s.regs.eax = 0xFFFF; return; }
    s.regs.eax = world.belt[world.cursor++] & 0xFF;
  };
  sim.syscallTable[BELT_PEEK] = (s) => {
    if (world.cursor >= world.belt.length) { s.regs.eax = 0xFFFF; return; }
    s.regs.eax = world.belt[world.cursor] & 0xFF;
  };
  sim.syscallTable[BIN_PUSH] = (s) => {
    const id = s.regs.ebx >>> 0;
    if (id >= world.bins.length) return;
    world.bins[id].push(s.regs.ecx & 0xFF);
  };
  sim.syscallTable[BELT_DONE] = (s) => {
    s.regs.eax = world.cursor >= world.belt.length ? 1 : 0;
  };
}

// ── Validators ──────────────────────────────────────────────────────────────
// Each returns { ok, message }. On failure, message names the first bin that
// disagrees so the player can see exactly what went wrong.

function arrEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function checkBins(world, expected) {
  for (let i = 0; i < expected.length; i++) {
    if (!arrEq(world.bins[i], expected[i])) {
      return { ok: false, message:
        `Bin ${i} should be [${expected[i].join(', ')}] but got [${world.bins[i].join(', ')}]` };
    }
  }
  return { ok: true, message: 'Belt cleared, bins match expected output.' };
}

// ── Levels ──────────────────────────────────────────────────────────────────

const LEVELS = [
  // ── Level 1: Drain ──────────────────────────────────────────────────────
  {
    id: 'drain',
    title: '1 · Drain the belt',
    teaches: ['L1 registers', 'L3 control flow', 'L5 loops'],
    intro: 'A short belt carries five bytes. Read each one and push it into bin 0, in order. Stop with sys_exit when the belt is empty.',
    hint: 'belt_read returns 0xFFFF when the belt is empty — compare EAX to 0xFFFF and jump to your exit when matched.',
    par: 55,
    binCount: 2,
    makeWorld: () => makeWorld([10, 20, 30, 40, 50], 2),
    expected:  [[10, 20, 30, 40, 50], []],
    validate(world) { return checkBins(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; Read bytes from the belt and push each one to bin 0.
  ; belt_read  : eax=0x100  → eax = byte or 0xFFFF
  ; bin_push   : eax=0x102, ebx=bin, ecx=value

  ; your code here

  mov eax, 1
  xor ebx, ebx
  int 0x80          ; sys_exit
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x100    ; belt_read
  int 0x80
  cmp eax, 0xFFFF
  je  done
  mov ecx, eax      ; value to push
  xor ebx, ebx      ; bin 0
  mov eax, 0x102    ; bin_push
  int 0x80
  jmp loop_top
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 2: Even / Odd split ───────────────────────────────────────────
  {
    id: 'split',
    title: '2 · Even and odd piles',
    teaches: ['L2 flags', 'L3 control flow', 'L8 bitwise'],
    intro: 'Bytes 1 through 10 are coming. Push evens to bin 0 and odds to bin 1.',
    hint: 'TEST AL, 1 sets ZF=1 when the low bit is zero (even). JZ takes the branch when ZF=1.',
    par: 130,
    binCount: 2,
    makeWorld: () => makeWorld([1,2,3,4,5,6,7,8,9,10], 2),
    expected:  [[2,4,6,8,10], [1,3,5,7,9]],
    validate(world) { return checkBins(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; Push even bytes to bin 0, odd bytes to bin 1.

  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x100
  int 0x80
  cmp eax, 0xFFFF
  je  done
  mov ecx, eax
  test cl, 1
  jz  even
  mov ebx, 1
  jmp push
even:
  xor ebx, ebx
push:
  mov eax, 0x102
  int 0x80
  jmp loop_top
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 3: Sum ────────────────────────────────────────────────────────
  {
    id: 'sum',
    title: '3 · Sum it up',
    teaches: ['L1 registers', 'L2 arithmetic', 'L5 loops'],
    intro: 'Five bytes arrive. Add them all together and push the single total into bin 0.',
    hint: 'Zero a register (e.g. EDX) before the loop to use as your accumulator. ADD EDX, EAX once per byte.',
    par: 50,
    binCount: 1,
    makeWorld: () => makeWorld([3, 7, 12, 5, 8], 1),
    expected:  [[35]],
    validate(world) { return checkBins(world, this.expected); },
    starter:
`section .text
global _start
_start:
  xor edx, edx       ; accumulator
  ; loop: read, add to EDX, repeat until 0xFFFF

  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
  xor edx, edx
loop_top:
  mov eax, 0x100
  int 0x80
  cmp eax, 0xFFFF
  je  done
  add edx, eax
  jmp loop_top
done:
  mov ecx, edx
  xor ebx, ebx
  mov eax, 0x102
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 4: Max ────────────────────────────────────────────────────────
  {
    id: 'max',
    title: '4 · Find the largest',
    teaches: ['L2 flags', 'L3 control flow (CMP/JA)'],
    intro: 'Six bytes arrive. Find the largest one and push only that single value into bin 0.',
    hint: 'Track the running max in a register. On each read, CMP eax, running_max — if EAX is larger (JA), update.',
    par: 65,
    binCount: 1,
    makeWorld: () => makeWorld([7, 2, 19, 6, 11, 3], 1),
    expected:  [[19]],
    validate(world) { return checkBins(world, this.expected); },
    starter:
`section .text
global _start
_start:
  xor edx, edx       ; running max
  ; loop, update EDX when EAX > EDX

  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
  xor edx, edx
loop_top:
  mov eax, 0x100
  int 0x80
  cmp eax, 0xFFFF
  je  done
  cmp eax, edx
  jbe skip
  mov edx, eax
skip:
  jmp loop_top
done:
  mov ecx, edx
  xor ebx, ebx
  mov eax, 0x102
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 5: Running average ────────────────────────────────────────────
  {
    id: 'avg',
    title: '5 · Running average',
    teaches: ['L2 arithmetic', 'L10 division', 'L5 loops'],
    intro: 'Four bytes arrive. After each read, push the integer average of bytes seen so far into bin 0. Expected: 10, 20, 33, 50.',
    hint: 'Keep a running sum in one register and a count in another. To divide: zero EDX, put sum in EAX, count in (say) ECX, then DIV ECX.',
    par: 80,
    binCount: 1,
    makeWorld: () => makeWorld([10, 30, 60, 100], 1),
    expected:  [[10, 20, 33, 50]],
    validate(world) { return checkBins(world, this.expected); },
    starter:
`section .text
global _start
_start:
  xor esi, esi       ; running sum
  xor edi, edi       ; count
  ; loop: read, add to sum, inc count, push (sum / count)

  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
  xor esi, esi
  xor edi, edi
loop_top:
  mov eax, 0x100
  int 0x80
  cmp eax, 0xFFFF
  je  done
  add esi, eax
  inc edi
  mov eax, esi
  xor edx, edx
  mov ecx, edi
  div ecx           ; eax = sum / count
  mov ecx, eax
  xor ebx, ebx
  mov eax, 0x102
  int 0x80
  jmp loop_top
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 6: Tagged routing via lookup table ───────────────────────────
  {
    id: 'route',
    title: '6 · Tagged routing',
    teaches: ['L7 data section', 'L9 addressing modes', 'L12 arrays'],
    intro: 'Bytes come in (tag, payload) pairs. Route each payload into the bin given by the lookup table bin_map: tag 0 → bin 2, tag 1 → bin 0, tag 2 → bin 1.',
    hint: 'After reading the tag, fetch the destination with movzx-style byte load: mov bl, [bin_map + eax]. Then read the payload and push.',
    par: 100,
    binCount: 3,
    makeWorld: () => makeWorld([0,100, 1,200, 0,150, 2,30, 1,250, 2,90], 3),
    expected:  [[200, 250], [30, 90], [100, 150]],
    validate(world) { return checkBins(world, this.expected); },
    starter:
`section .data
bin_map db 2, 0, 1     ; tag → bin

section .text
global _start
_start:
  ; loop: read tag → look up bin → read payload → push

  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .data
bin_map db 2, 0, 1

section .text
global _start
_start:
loop_top:
  mov eax, 0x100      ; read tag
  int 0x80
  cmp eax, 0xFFFF
  je  done
  mov esi, eax        ; tag in esi
  xor ebx, ebx
  mov bl, byte [bin_map + esi]
  mov eax, 0x100      ; read payload
  int 0x80
  mov ecx, eax
  mov eax, 0x102
  int 0x80
  jmp loop_top
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },
];

// ── Renderer ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Crate sprite ────────────────────────────────────────────────────────────
// Each value gets a colored crate. Hue is `value mod 360` so similar bytes
// share a family of colors — visually noticeable that 1 and 11 differ, that
// even/odd splits map cleanly, etc.

function crateSvg(value, kind /* 'belt' | 'bin' */) {
  const v = value & 0xFF;
  const hue = (v * 37) % 360;
  const consumed = kind === 'consumed';
  const fill   = consumed ? `hsl(${hue},25%,28%)` : `hsl(${hue},65%,48%)`;
  const stroke = consumed ? `hsl(${hue},25%,18%)` : `hsl(${hue},75%,28%)`;
  const text   = consumed ? `hsl(${hue},20%,55%)` : `hsl(${hue},90%,92%)`;
  return `<svg class="crate ${kind}" viewBox="0 0 40 40" width="40" height="40">
    <polygon points="4,12 20,4 36,12 36,32 20,40 4,32" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <polyline points="4,12 20,20 36,12" fill="none" stroke="${stroke}" stroke-width="1.5"/>
    <line x1="20" y1="20" x2="20" y2="40" stroke="${stroke}" stroke-width="1.5"/>
    <text x="20" y="30" text-anchor="middle" font-family="ui-monospace,monospace"
          font-size="11" font-weight="700" fill="${text}">${v}</text>
  </svg>`;
}

function beltSvg(consumed, remaining) {
  const slotW = 48;
  const slots = consumed.length + remaining.length;
  const width = Math.max(8, slots) * slotW + 80;
  const headX = consumed.length * slotW + 40;
  const tread = [];
  for (let x = 0; x < width; x += 12) {
    tread.push(`<rect x="${x}" y="62" width="8" height="6" fill="var(--surface3)" stroke="var(--border)"/>`);
  }
  const cratesC = consumed.map((v, i) =>
    `<g transform="translate(${i * slotW + 24}, 16)">${crateSvg(v, 'consumed')}</g>`
  ).join('');
  const cratesR = remaining.map((v, i) =>
    `<g transform="translate(${(consumed.length + i) * slotW + 24}, 16)">${crateSvg(v, 'belt')}</g>`
  ).join('');

  return `<svg class="belt-svg" viewBox="0 0 ${width} 110" width="100%" height="120" preserveAspectRatio="xMinYMid meet">
    <rect x="0" y="56" width="${width}" height="18" fill="var(--surface)" stroke="var(--border)"/>
    ${tread.join('')}
    ${cratesC}${cratesR}
    <g transform="translate(${headX}, 0)">
      <rect x="-22" y="0" width="44" height="14" fill="var(--surface3)" stroke="var(--amber)" stroke-width="1.5"/>
      <text x="0" y="11" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace"
            fill="var(--amber)">SCAN</text>
      <line x1="0" y1="14" x2="0" y2="56" stroke="var(--amber)" stroke-width="1" stroke-dasharray="3 2"/>
      <polygon points="0,56 -6,46 6,46" fill="var(--amber)"/>
    </g>
    ${remaining.length === 0
      ? `<text x="${width - 60}" y="42" font-size="11" fill="var(--p-dim)" font-style="italic">∅ empty</text>`
      : ''}
  </svg>`;
}

function binSvg(items, idx) {
  const w = 140, h = 160;
  const crateH = 32;
  const maxRows = Math.floor((h - 50) / crateH);
  const visible = items.slice(-maxRows * 2);
  const stacked = visible.map((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 22 + col * 48;
    const y = h - 20 - (row + 1) * crateH;
    return `<g transform="translate(${x},${y})">${crateSvg(v, 'bin')}</g>`;
  }).join('');
  const overflow = items.length > visible.length
    ? `<text x="${w/2}" y="42" text-anchor="middle" font-size="10"
         fill="var(--p-dim)">+${items.length - visible.length} more below</text>`
    : '';
  return `<div class="bin-svg-wrap">
    <div class="bin-label">bin ${idx} · ${items.length}</div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
      <polygon points="10,10 ${w-10},10 ${w-22},34 22,34" fill="var(--surface3)" stroke="var(--border)" stroke-width="1.5"/>
      <rect x="18" y="34" width="${w-36}" height="${h-44}" fill="none" stroke="var(--border)" stroke-width="1.5"/>
      <rect x="18" y="${h-12}" width="${w-36}" height="2" fill="var(--p-dim)"/>
      ${overflow}
      ${stacked}
      ${items.length === 0
        ? `<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="11" font-style="italic"
            fill="var(--p-dim)">— empty —</text>`
        : ''}
    </svg>
  </div>`;
}

function render(world, root) {
  if (!world) { root.innerHTML = ''; return; }
  const remaining = world.belt.slice(world.cursor);
  const consumed  = world.belt.slice(0, world.cursor);

  const binsHtml = world.bins.map((bin, i) => binSvg(bin, i)).join('');

  root.innerHTML = `
    <div class="belt-section">
      <div class="belt-label">Conveyor · ${consumed.length}/${world.belt.length} scanned</div>
      <div class="belt-svg-wrap">${beltSvg(consumed, remaining)}</div>
    </div>
    <div class="bins-section bins-svg">${binsHtml}</div>
  `;
}

// ── Module export ───────────────────────────────────────────────────────────

const BeltGame = {
  id: 'belt',
  name: 'Belt Foreman',
  blurb: 'Conveyor sorting — registers, branches, loops.',
  levels: LEVELS,
  installSyscalls,
  render,
};

if (typeof window !== 'undefined') window.BeltGame = BeltGame;
if (typeof module !== 'undefined' && module.exports) module.exports = BeltGame;

})();
