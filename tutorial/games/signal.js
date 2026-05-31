'use strict';

(function () {

// ── Signal Tower ────────────────────────────────────────────────────────────
// A stream of 32-bit RF frames flows in. Player writes NASM that selectively
// transforms and emits frames to the output stream. Syscalls live in 0x300s.
//
//   eax=0x300  rf_next  → eax = next 32-bit frame (call rf_done first)
//   eax=0x301  rf_done  → eax = 1 if no more frames, else 0
//   eax=0x302  rf_emit  → ebx = 32-bit value to emit to output stream

const RF_NEXT = 0x300;
const RF_DONE = 0x301;
const RF_EMIT = 0x302;

function makeWorld(frames) {
  return {
    frames: [...frames],
    cursor: 0,
    output: [],
  };
}

function installSyscalls(sim, world) {
  sim.syscallTable[RF_NEXT] = (s) => {
    if (world.cursor >= world.frames.length) { s.regs.eax = 0; return; }
    s.regs.eax = (world.frames[world.cursor++] >>> 0);
  };
  sim.syscallTable[RF_DONE] = (s) => {
    s.regs.eax = world.cursor >= world.frames.length ? 1 : 0;
  };
  sim.syscallTable[RF_EMIT] = (s) => {
    world.output.push(s.regs.ebx >>> 0);
  };
}

// ── Validators ──────────────────────────────────────────────────────────────

function arrEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] >>> 0) !== (b[i] >>> 0)) return false;
  return true;
}

function checkOutput(world, expected) {
  if (!arrEq(world.output, expected)) {
    const fmt = arr => '[' + arr.map(v => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8,'0')).join(', ') + ']';
    return { ok: false, message: `Output stream should be ${fmt(expected)} but got ${fmt(world.output)}` };
  }
  return { ok: true, message: 'All frames processed, output matches.' };
}

// ── Levels ──────────────────────────────────────────────────────────────────

const LEVELS = [

  // ── Level 1: Bit gate ──────────────────────────────────────────────────
  {
    id: 'bitgate',
    title: '1 · Bit gate',
    teaches: ['L8 bitwise', 'L2 flags (TEST)'],
    intro: 'Frames stream in. Forward only those where bit 7 of the low byte is set; drop the rest.',
    hint: 'TEST EAX, 0x80 sets ZF=1 when bit 7 is clear. JNZ takes the branch when ZF=0 (bit was set).',
    par: 70,
    makeWorld: () => makeWorld([0xDEAD0000, 0xCAFE0080, 0xBEEF0040, 0xFEED00C0, 0x12340001]),
    expected:  [0xCAFE0080, 0xFEED00C0],
    validate(world) { return checkOutput(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; rf_done : eax=0x301 → eax = 1 if no more frames
  ; rf_next : eax=0x300 → eax = next frame
  ; rf_emit : eax=0x302, ebx = value to emit

  mov eax, 1
  xor ebx, ebx
  int 0x80          ; sys_exit
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x301    ; rf_done?
  int 0x80
  test eax, eax
  jnz exit
  mov eax, 0x300    ; rf_next
  int 0x80
  test eax, 0x80
  jz  loop_top
  mov ebx, eax
  mov eax, 0x302    ; rf_emit
  int 0x80
  jmp loop_top
exit:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 2: Header strip ──────────────────────────────────────────────
  {
    id: 'header',
    title: '2 · Strip the header',
    teaches: ['L8 shifts', 'L13 byte fields'],
    intro: 'Each frame packs an 8-bit header in the low byte and a 24-bit payload above. Emit only the payload.',
    hint: 'SHR EAX, 8 shifts right by 8 bits; the top 24 bits drop into the low 24 and the low byte falls off.',
    par: 45,
    makeWorld: () => makeWorld([0xAA112201, 0xBB334402, 0xCC556603]),
    expected:  [0x00AA1122, 0x00BB3344, 0x00CC5566],
    validate(world) { return checkOutput(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; for each frame: shift right by 8, emit
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x301
  int 0x80
  test eax, eax
  jnz exit
  mov eax, 0x300
  int 0x80
  shr eax, 8
  mov ebx, eax
  mov eax, 0x302
  int 0x80
  jmp loop_top
exit:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 3: Parity gate ───────────────────────────────────────────────
  {
    id: 'parity',
    title: '3 · Parity gate',
    teaches: ['L8 XOR-fold', 'L2 flags'],
    intro: 'Forward only frames whose popcount (number of 1 bits) is odd. The XOR-fold pattern collapses 32 bits down to 1 in five steps.',
    hint: 'XOR each frame against itself shifted right by 16, then 8, 4, 2, 1. The low bit of the result is the parity bit. AND with 1 isolates it.',
    par: 200,
    makeWorld: () => makeWorld([0x00000001, 0x00000003, 0x000000FF, 0x80000000, 0x12345678, 0xFFFFFFFF]),
    expected:  [0x00000001, 0x80000000, 0x12345678],
    validate(world) { return checkOutput(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; XOR-fold to compute parity. Keep frames with odd popcount.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x301
  int 0x80
  test eax, eax
  jnz exit
  mov eax, 0x300
  int 0x80
  mov esi, eax          ; preserve the frame for emit
  mov ebx, eax
  shr ebx, 16
  xor eax, ebx
  mov ebx, eax
  shr ebx, 8
  xor eax, ebx
  mov ebx, eax
  shr ebx, 4
  xor eax, ebx
  mov ebx, eax
  shr ebx, 2
  xor eax, ebx
  mov ebx, eax
  shr ebx, 1
  xor eax, ebx
  and eax, 1
  jz  loop_top
  mov ebx, esi
  mov eax, 0x302
  int 0x80
  jmp loop_top
exit:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 4: Byte swap ─────────────────────────────────────────────────
  {
    id: 'bswap',
    title: '4 · Endianness flip',
    teaches: ['L13 endianness', 'L8 shifts + masks'],
    intro: 'Each frame arrived big-endian but the receiver expects little-endian. Reverse the byte order before emitting. 0x11223344 becomes 0x44332211.',
    hint: 'Extract each byte with AND + mask, shift it into its new position with SHL or SHR, and OR the four pieces together.',
    par: 130,
    makeWorld: () => makeWorld([0x11223344, 0xDEADBEEF, 0x000000FF, 0xFF000000]),
    expected:  [0x44332211, 0xEFBEADDE, 0xFF000000, 0x000000FF],
    validate(world) { return checkOutput(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; for each frame: byte-reverse (b0b1b2b3 → b3b2b1b0), emit
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x301
  int 0x80
  test eax, eax
  jnz exit
  mov eax, 0x300
  int 0x80
  mov ebx, eax
  and ebx, 0x000000FF
  shl ebx, 24           ; b0 → top byte
  mov ecx, eax
  and ecx, 0x0000FF00
  shl ecx, 8            ; b1 → next byte
  or  ebx, ecx
  mov ecx, eax
  and ecx, 0x00FF0000
  shr ecx, 8            ; b2 → next byte
  or  ebx, ecx
  shr eax, 24           ; b3 → low byte
  or  ebx, eax
  mov eax, 0x302
  int 0x80
  jmp loop_top
exit:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 5: Signed clamp ──────────────────────────────────────────────
  {
    id: 'clamp',
    title: '5 · Signed clamp',
    teaches: ['L10 signed', 'L2 signed compares (JLE/JGE)'],
    intro: 'Each frame is a signed 32-bit value (already sign-extended). Clamp to the range [-100, 100] before emitting. Values above 100 become 100; below -100 become -100.',
    hint: 'Use signed compares: CMP EAX, 100 then JLE skips when EAX is within range. Same idea for the lower bound with JGE.',
    par: 100,
    makeWorld: () => makeWorld([50, 200, 0xFFFFFFCE >>> 0, 0xFFFFFED4 >>> 0, 100, 0xFFFFFF9C >>> 0]),
    expected:  [50, 100, 0xFFFFFFCE, 0xFFFFFF9C, 100, 0xFFFFFF9C],
    validate(world) { return checkOutput(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; clamp signed value in EAX to [-100, 100], emit
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x301
  int 0x80
  test eax, eax
  jnz exit
  mov eax, 0x300
  int 0x80
  cmp eax, 100
  jle check_low
  mov eax, 100
  jmp emit
check_low:
  cmp eax, -100
  jge emit
  mov eax, -100
emit:
  mov ebx, eax
  mov eax, 0x302
  int 0x80
  jmp loop_top
exit:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },

  // ── Level 6: Channel diff (|L - R|) ────────────────────────────────────
  {
    id: 'chdiff',
    title: '6 · Channel diff',
    teaches: ['L8 mask + shift', 'L10 signed', 'L13 packed fields'],
    intro: 'Frames pack two signed 16-bit channels: L in the low 16 bits, R in the high 16. Emit |L - R| as a 32-bit value. Hint: SAR sign-extends when shifting right.',
    hint: 'SHL eax, 16 then SAR eax, 16 leaves the low 16 bits sign-extended into a 32-bit signed value. SAR by 16 directly extracts the high 16 sign-extended.',
    par: 140,
    makeWorld: () => makeWorld([
      ((20  & 0xFFFF) << 16) | (10  & 0xFFFF),                  // L=10, R=20
      ((50  & 0xFFFF) << 16) | (100 & 0xFFFF),                  // L=100, R=50
      ((20  & 0xFFFF) << 16) | ((-30 & 0xFFFF)),                // L=-30, R=20
      ((-50 & 0xFFFF) << 16) | ((-100 & 0xFFFF)),               // L=-100, R=-50
      0,                                                         // L=0, R=0
    ].map(v => v >>> 0)),
    expected: [10, 50, 50, 50, 0],
    validate(world) { return checkOutput(world, this.expected); },
    starter:
`section .text
global _start
_start:
  ; extract L (low 16, signed) and R (high 16, signed); emit |L - R|
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .text
global _start
_start:
loop_top:
  mov eax, 0x301
  int 0x80
  test eax, eax
  jnz exit
  mov eax, 0x300
  int 0x80
  mov ebx, eax
  shl ebx, 16
  sar ebx, 16           ; ebx = L sign-extended
  mov ecx, eax
  sar ecx, 16           ; ecx = R sign-extended
  sub ebx, ecx          ; ebx = L - R
  mov ecx, ebx
  sar ecx, 31           ; ecx = sign mask (-1 if negative else 0)
  xor ebx, ecx
  sub ebx, ecx          ; ebx = |L - R|
  mov eax, 0x302
  int 0x80
  jmp loop_top
exit:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`
  },
];

// ── Renderer ────────────────────────────────────────────────────────────────

function hexFrame(v) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// ── Bit grid sprite ─────────────────────────────────────────────────────────
// A 32-bit frame as 4 byte-groups × 8 bit-cells. Each byte gets its own hue so
// the eye can track byte boundaries (load: header strip vs payload bytes,
// bswap: which byte moved where, parity: counting lit cells).

function bitGridSvg(value, kind /* 'in' | 'out' | 'consumed' */) {
  const v = value >>> 0;
  const cell = 11, gap = 2, byteGap = 6;
  const w = 8 * cell + 7 * gap;
  const totalW = 4 * w + 3 * byteGap + 8;
  const h = cell + 18;
  const dimmed = kind === 'consumed';
  const hues = [205, 160, 35, 350]; // 4 bytes: blue → green → amber → red
  let svg = `<svg class="bits ${kind}" viewBox="0 0 ${totalW} ${h}" width="${totalW}" height="${h}">`;
  for (let b = 0; b < 4; b++) {
    const byteX = 4 + b * (w + byteGap);
    const byte  = (v >>> ((3 - b) * 8)) & 0xFF;
    const hue   = hues[b];
    const lit   = dimmed ? `hsl(${hue},30%,40%)` : `hsl(${hue},75%,55%)`;
    const off   = dimmed ? `hsl(${hue},10%,16%)` : `hsl(${hue},25%,20%)`;
    const stroke= dimmed ? `hsl(${hue},20%,28%)` : `hsl(${hue},45%,32%)`;
    for (let i = 0; i < 8; i++) {
      const bit = (byte >>> (7 - i)) & 1;
      const x = byteX + i * (cell + gap);
      svg += `<rect x="${x}" y="2" width="${cell}" height="${cell}" rx="1.5"
        fill="${bit ? lit : off}" stroke="${stroke}" stroke-width="0.5"/>`;
    }
    const labelColor = dimmed ? 'var(--p-dim)' : `hsl(${hue},60%,68%)`;
    svg += `<text x="${byteX + w/2}" y="${cell + 12}" text-anchor="middle"
      font-size="8.5" font-family="ui-monospace,monospace" fill="${labelColor}">
      ${byte.toString(16).toUpperCase().padStart(2,'0')}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function frameRow(value, kind) {
  return `<div class="frame-row ${kind}">
    ${bitGridSvg(value, kind)}
    <span class="frame-hex ${kind}">${hexFrame(value)}</span>
  </div>`;
}

function towerSvg(active) {
  const armColor = active ? 'var(--amber)' : 'var(--p-dim)';
  const waveOpacity = active ? '1' : '0.25';
  return `<svg viewBox="0 0 100 120" width="80" height="96" class="tower-svg">
    <polygon points="50,6 56,12 56,40 50,46 44,40 44,12" fill="${armColor}" stroke="var(--border-hi)"/>
    <line x1="50" y1="46" x2="50" y2="100" stroke="var(--p-dim)" stroke-width="2"/>
    <polygon points="30,100 70,100 60,114 40,114" fill="var(--surface3)" stroke="var(--border)"/>
    <line x1="35" y1="56" x2="50" y2="68" stroke="var(--p-dim)" stroke-width="1"/>
    <line x1="65" y1="56" x2="50" y2="68" stroke="var(--p-dim)" stroke-width="1"/>
    <line x1="35" y1="76" x2="50" y2="88" stroke="var(--p-dim)" stroke-width="1"/>
    <line x1="65" y1="76" x2="50" y2="88" stroke="var(--p-dim)" stroke-width="1"/>
    <g stroke="${armColor}" fill="none" stroke-width="1.3" opacity="${waveOpacity}">
      <path d="M 56 22 Q 68 14 78 22"/>
      <path d="M 56 22 Q 72 8 86 22"/>
      <path d="M 44 22 Q 32 14 22 22"/>
      <path d="M 44 22 Q 28 8 14 22"/>
    </g>
  </svg>`;
}

function render(world, root) {
  if (!world) { root.innerHTML = ''; return; }
  const remaining = world.frames.slice(world.cursor);
  const consumed  = world.frames.slice(0, world.cursor);
  const stillIncoming = remaining.length > 0;

  const inRows = consumed.map(v => frameRow(v, 'consumed')).join('')
               + remaining.map(v => frameRow(v, 'in')).join('');

  const outRows = world.output.length
    ? world.output.map(v => frameRow(v, 'out')).join('')
    : '<div class="bin-empty">— no frames emitted —</div>';

  root.innerHTML = `
    <div class="signal-grid">
      <div class="signal-tower">
        ${towerSvg(stillIncoming)}
        <div class="tower-label">${consumed.length}/${world.frames.length}</div>
      </div>
      <div class="belt-section">
        <div class="belt-label">Inbound · MSB ← bit order → LSB</div>
        <div class="frame-stack inbound">
          ${inRows || '<div class="bin-empty">— no frames —</div>'}
          ${!stillIncoming ? '<div class="bin-empty">∅ stream drained</div>' : ''}
        </div>
      </div>
      <div class="belt-section">
        <div class="belt-label">Emitted</div>
        <div class="frame-stack outbound">${outRows}</div>
      </div>
    </div>
  `;
}

// ── Module export ───────────────────────────────────────────────────────────

const SignalGame = {
  id: 'signal',
  name: 'Signal Tower',
  blurb: 'Decode RF frames — bitwise, shifts, signed math, endianness.',
  levels: LEVELS,
  installSyscalls,
  render,
};

if (typeof window !== 'undefined') window.SignalGame = SignalGame;
if (typeof module !== 'undefined' && module.exports) module.exports = SignalGame;

})();
