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

  // ── MOVZX / MOVSX: zero- vs sign-extension from 8 and 16 bits ──────────
  {
    id: 'movzx-movsx-byte',
    code: 'mov eax, 0x1234F0\nmovzx ebx, al\nmovsx ecx, al\nmovsx edx, ah',
    compare: { regs: ['ebx', 'ecx', 'edx'] },
  },
  {
    id: 'movzx-movsx-word-mem',
    code: 'push 0x0000ABCD\nmovzx eax, word [esp]\nmovsx ebx, word [esp]\nmovsx ecx, byte [esp+1]\npop edx',
    compare: { regs: ['eax', 'ebx', 'ecx'] },
  },
  {
    id: 'word-store-touches-two-bytes',
    code: 'push 0xFFFFFFFF\nmov word [esp], 0x1234\npop eax',
    compare: { regs: ['eax'] },
  },

  // ── ADC / SBB: 64-bit add and subtract across EDX:EAX ──────────────────
  {
    id: 'adc-64bit-add',
    code: 'mov eax, 0xFFFFFFFF\nmov edx, 1\nadd eax, 1\nadc edx, 0',
    compare: { regs: ['eax', 'edx'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'adc-carry-in-wraps',
    // b + CF wraps to 0: CF must still be 1.
    code: 'stc\nmov eax, 5\nmov ebx, 0xFFFFFFFF\nadc eax, ebx',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'sbb-64bit-sub',
    code: 'mov eax, 0\nmov edx, 1\nsub eax, 1\nsbb edx, 0',
    compare: { regs: ['eax', 'edx'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'sbb-borrow-in-overflow',
    code: 'stc\nmov eax, 0x80000000\nsbb eax, 0',
    compare: { regs: ['eax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },

  // ── ENTER / LEAVE: frame setup and teardown balance the stack ──────────
  {
    id: 'enter-leave-balance',
    code: 'mov esi, esp\nenter 8, 0\nmov edi, ebp\nsub edi, esp\nmov dword [ebp-4], 77\nmov eax, [ebp-4]\nleave\nsub esi, esp',
    compare: { regs: ['eax', 'esi', 'edi'] },
  },

  // ── SETcc / CMOVcc / JECXZ / JC / JO ───────────────────────────────────
  {
    id: 'setcc-signed-vs-unsigned',
    code: 'mov eax, -1\ncmp eax, 1\nsetl bl\nsetb cl\nseta dl\nsetge bh',
    compare: { regs: ['ebx', 'ecx', 'edx'] },
  },
  {
    id: 'cmovcc-min-max',
    code: 'mov eax, 9\nmov ebx, 4\nmov ecx, eax\ncmp ebx, eax\ncmovl ecx, ebx\nmov edx, eax\ncmovge edx, ebx',
    compare: { regs: ['ecx', 'edx'] },
  },
  {
    id: 'jecxz-jc-jo',
    code: 'xor ecx, ecx\nxor eax, eax\njecxz z\nmov eax, 1\nz:\nstc\njc c\nmov ebx, 1\nc:\nmov edx, 0x7FFFFFFF\nadd edx, 1\njo o\nmov esi, 1\no:\nnop',
    compare: { regs: ['eax', 'ebx', 'esi'] },
  },

  // ── 64-bit mode (bits: 64) ─────────────────────────────────────────────
  {
    id: 'x64-32bit-write-zero-extends',
    bits: 64,
    code: 'mov rax, -1\nmov eax, 1\nmov rbx, -1\nmov bx, 2\nmov rcx, -1\nmov cl, 5\nmov rdx, -1\nmov dh, 7',
    compare: { regs: ['rax', 'rbx', 'rcx', 'rdx'] },
  },
  {
    id: 'x64-add-carry-out-of-bit-63',
    bits: 64,
    code: 'mov rax, 0xFFFFFFFFFFFFFFFF\nadd rax, 1',
    compare: { regs: ['rax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'x64-32bit-add-flags-at-32-bits',
    bits: 64,
    code: 'mov rax, 0x1FFFFFFFF\nadd eax, 1',
    compare: { regs: ['rax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'x64-sub-signed-overflow',
    bits: 64,
    code: 'mov rax, 0x8000000000000000\nsub rax, 1',
    compare: { regs: ['rax'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'x64-inc-neg',
    bits: 64,
    code: 'mov rax, 0x7FFFFFFFFFFFFFFF\ninc rax\nmov rbx, 5\nneg rbx',
    compare: { regs: ['rax', 'rbx'], flags: ['cf', 'zf', 'sf', 'of'] },
  },
  {
    id: 'x64-imul-overflow',
    bits: 64,
    code: 'mov rax, 0x4000000000000000\nmov rcx, 4\nimul rax, rcx',
    compare: { regs: ['rax'], flags: ['cf', 'of'] },
  },
  {
    id: 'x64-shifts',
    bits: 64,
    code: 'mov rax, -64\nsar rax, 3\nmov rbx, 1\nshl rbx, 63\nmov rcx, rbx\nshr rcx, 62',
    compare: { regs: ['rax', 'rbx', 'rcx'], flags: ['cf', 'zf', 'sf'] },
  },
  {
    id: 'x64-movzx-movsx-movsxd',
    bits: 64,
    code: 'mov eax, 0x80\nmovsx rbx, al\nmovzx rcx, al\nmov edx, -2\nmovsxd rsi, edx',
    compare: { regs: ['rbx', 'rcx', 'rsi'] },
  },
  {
    id: 'x64-push-pop-qword-lea',
    bits: 64,
    code: 'mov rax, 0x1122334455667788\npush rax\nmov ebx, [rsp]\nmov rcx, [rsp]\npop rdx\nlea rsi, [rdx+rdx*2+8]',
    compare: { regs: ['rbx', 'rcx', 'rdx', 'rsi'] },
  },
  {
    id: 'x64-setcc-cmovcc',
    bits: 64,
    code: 'mov rax, -1\ncmp rax, 1\nsetl bl\nsetb cl\nmov rdx, 5\ncmovl rdx, rax',
    compare: { regs: ['rbx', 'rcx', 'rdx'] },
  },
  {
    id: 'x64-loop-uses-rcx',
    bits: 64,
    code: 'mov rcx, 3\nxor eax, eax\nl: add rax, 2\nloop l',
    compare: { regs: ['rax', 'rcx'] },
  },
];
