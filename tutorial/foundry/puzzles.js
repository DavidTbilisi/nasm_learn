'use strict';

// Foundry — Black Box puzzle library.
//
// Each puzzle is a tiny hidden NASM program that reads bytes from port 0 and
// writes transformed bytes back to port 0. The player drops a BlackBox machine,
// picks a puzzle, observes its I/O behavior, and writes their own Processor
// that reproduces the same transformation. A built-in verifier feeds both
// programs the same deterministic byte sequence and compares outputs.
//
// All v1 puzzles are 1-in / 1-out, share the same echo-loop scaffold, and
// yield (sys 0x604) when input is empty so the verifier knows when to stop.

function _wrapEcho(transform) {
  return `_start:
  mov eax, 0x600
  xor ebx, ebx
  int 0x80
  cmp eax, 0xFFFF
  je  bb_idle
${transform}
  mov ecx, eax
  mov eax, 0x601
  xor ebx, ebx
  int 0x80
  jmp _start
bb_idle:
  mov eax, 0x604
  int 0x80
  jmp _start
`;
}

const FOUNDRY_PUZZLES = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'Reads a byte from port 0 and writes the same byte to port 0. Warm-up — confirm you understand the I/O protocol before tackling the rest.',
    code: _wrapEcho('  ; (no transform)')
  },
  {
    id: 'inverter',
    title: 'Inverter',
    description: 'Reads a byte b from port 0 and writes ~b (bitwise complement) to port 0. Look at how every bit flips.',
    code: _wrapEcho('  xor al, 0xFF')
  },
  {
    id: 'caesar3',
    title: 'Caesar +3',
    description: 'Reads a byte b and writes (b + 3) mod 256. Arithmetic, with wrap-around at 0xFF.',
    code: _wrapEcho('  add al, 3')
  },
  {
    id: 'doubler',
    title: 'Doubler',
    description: 'Reads a byte b and writes (b << 1) mod 256. Each input is doubled; the high bit falls off.',
    code: _wrapEcho('  shl al, 1')
  },
  {
    id: 'lownibble',
    title: 'Low nibble',
    description: 'Reads a byte b and writes b & 0x0F (the low 4 bits). Masking — common in protocol parsers.',
    code: _wrapEcho('  and al, 0x0F')
  },
  {
    id: 'swapnibbles',
    title: 'Swap nibbles',
    description: 'Reads a byte b and writes the byte with its two nibbles (4-bit halves) swapped. e.g. 0xAB → 0xBA. Rotation.',
    code: _wrapEcho('  rol al, 4')
  },
  {
    id: 'parity',
    title: 'Parity bit',
    description: 'Reads a byte b and writes 0 if b has an even number of 1-bits, 1 if odd. The XOR-fold of all 8 bits.',
    code: `_start:
  mov eax, 0x600
  xor ebx, ebx
  int 0x80
  cmp eax, 0xFFFF
  je  bb_idle
  and eax, 0xFF
  mov edx, eax
  xor ecx, ecx
  mov esi, 8
pbloop:
  mov edi, edx
  and edi, 1
  xor ecx, edi
  shr edx, 1
  dec esi
  jnz pbloop
  mov eax, 0x601
  xor ebx, ebx
  int 0x80
  jmp _start
bb_idle:
  mov eax, 0x604
  int 0x80
  jmp _start
`
  }
];

if (typeof module !== 'undefined' && module.exports) module.exports = { FOUNDRY_PUZZLES };
if (typeof window !== 'undefined') window.FOUNDRY_PUZZLES = FOUNDRY_PUZZLES;
