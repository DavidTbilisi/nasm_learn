'use strict';

// Each case:
//   id:     stable identifier
//   code:   x86-32 source (Intel syntax, no directives) — single block
//   regs:   initial register values (defaults to 0)
//   compare: { regs: [...], flags: [...] } — which fields to diff
//
// Cases are grouped by the bug they exercise. Add cases here when a new
// drill template is introduced or a new instruction is suspected.

module.exports = [
  // ── INC: must not touch CF ─────────────────────────────────────────────
  {
    id: 'inc-no-cf-on-wrap',
    code: 'mov eax, 0xFFFFFFFF\ninc eax',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'inc-signed-overflow-sets-of',
    code: 'mov eax, 0x7FFFFFFF\ninc eax',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'inc-preserves-cf-when-set',
    // Force CF=1 via stc, then INC. Real INC must leave CF=1.
    code: 'stc\nmov eax, 5\ninc eax',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },

  // ── DEC: must not touch CF ─────────────────────────────────────────────
  {
    id: 'dec-preserves-cf-when-set',
    code: 'stc\nmov eax, 1\ndec eax',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'dec-signed-overflow-sets-of',
    code: 'mov eax, 0x80000000\ndec eax',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },

  // ── IMUL: must update CF/OF on signed overflow ─────────────────────────
  {
    id: 'imul-no-overflow',
    code: 'mov eax, 7\nmov ecx, 6\nimul eax, ecx',
    compare: { regs: ['eax'], flags: ['cf', 'of'] },
  },
  {
    id: 'imul-signed-overflow',
    // 0x40000000 * 4 = 0x100000000, truncated to 0 — signed overflow.
    code: 'mov eax, 0x40000000\nmov ecx, 4\nimul eax, ecx',
    compare: { regs: ['eax'], flags: ['cf', 'of'] },
  },

  // ── Sanity: MOV, ADD, SUB, XOR ─────────────────────────────────────────
  {
    id: 'mov-add-basic',
    code: 'mov eax, 10\nadd eax, 32',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'xor-clears-cf-of',
    code: 'stc\nmov eax, 0xFF\nxor eax, eax',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },

  // ── Spot-the-Bug: sub-register width ───────────────────────────────────
  {
    id: 'mov-al-leaves-upper-bytes',
    code: 'mov eax, 0xDEADBEEF\nmov al, 0x42',
    compare: { regs: ['eax'] },
  },

  // ── Spot-the-Bug: push/pop order, endianness ───────────────────────────
  {
    id: 'push-pop-swap',
    code: 'mov eax, 100\nmov ebx, 200\npush eax\npush ebx\npop eax\npop ebx',
    compare: { regs: ['eax', 'ebx'] },
  },
  {
    id: 'push-then-load-low-byte',
    code: 'push 0x11223344\nxor eax, eax\nmov al, [esp]',
    compare: { regs: ['eax'] },
  },

  // ── Spot-the-Bug: SAR preserves sign ───────────────────────────────────
  {
    id: 'sar-negative',
    code: 'mov eax, 0xFFFFFFE0\nsar eax, 2',  // -32 >> 2 = -8 = 0xFFFFFFF8
    compare: { regs: ['eax'] },
  },
];
