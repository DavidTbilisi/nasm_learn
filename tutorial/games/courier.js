'use strict';

(function () {

// ── String Courier ──────────────────────────────────────────────────────────
// Pre-loaded mail buffers in a fixed inbox region. Player reads a mail with
// mail_ptr, optionally transforms it via REP MOVS / CMPS / SCAS or manual
// loops, and dispatches with bin_post.
//
//   eax=0x400  mail_count → eax = N mails
//   eax=0x401  mail_ptr (ebx=idx)   → eax = ptr, edx = length
//                                     (mails are zero-terminated; length
//                                      excludes the terminator)
//   eax=0x402  bin_post (ebx=bin, ecx=src, edx=length)
//                                   → APPENDS len bytes read from sim memory
//                                     at [src] to bin[ebx]. (Replace by
//                                     posting the empty range first.)

const COUNT = 0x400, PTR = 0x401, POST = 0x402;
const INBOX_BASE  = 0x10000;
const MAIL_STRIDE = 64;     // gives every mail a 64-byte cell, plenty of slack
const NUM_BINS    = 4;

function stringBytes(s) {
  const out = [];
  for (const ch of s) out.push(ch.charCodeAt(0) & 0xFF);
  return out;
}

function asBytes(m) {
  if (typeof m === 'string') return stringBytes(m);
  if (Array.isArray(m)) return m.slice();
  if (m && m.bytes) return m.bytes.slice();
  return [];
}

function makeWorld(mailsIn) {
  const mails = mailsIn.map(m => ({ bytes: asBytes(m) }));
  return {
    mails,
    bins: Array.from({ length: NUM_BINS }, () => []),
    seeded: false,
    delivered: [],   // log: { bin, bytes } for renderer animation
  };
}

function ensureSeeded(sim, world) {
  if (world.seeded) return;
  for (let i = 0; i < world.mails.length; i++) {
    const addr = INBOX_BASE + i * MAIL_STRIDE;
    const b = world.mails[i].bytes;
    for (let j = 0; j < b.length; j++) sim.writeByte(addr + j, b[j]);
    sim.writeByte(addr + b.length, 0);   // null terminator
  }
  world.seeded = true;
}

function installSyscalls(sim, world) {
  sim.syscallTable[COUNT] = (s) => {
    ensureSeeded(s, world);
    s.regs.eax = world.mails.length;
  };
  sim.syscallTable[PTR] = (s) => {
    ensureSeeded(s, world);
    const idx = s.regs.ebx >>> 0;
    if (idx >= world.mails.length) { s.regs.eax = 0; s.regs.edx = 0; return; }
    s.regs.eax = INBOX_BASE + idx * MAIL_STRIDE;
    s.regs.edx = world.mails[idx].bytes.length;
  };
  sim.syscallTable[POST] = (s) => {
    ensureSeeded(s, world);
    const bin = s.regs.ebx >>> 0;
    const src = s.regs.ecx >>> 0;
    const len = s.regs.edx >>> 0;
    if (bin >= NUM_BINS) return;
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(s.readByte(src + i));
    world.bins[bin].push(...bytes);
    world.delivered.push({ bin, bytes });
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function showAscii(bytes) {
  let s = '';
  for (const b of bytes) {
    s += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b)
                                  : `\\x${b.toString(16).padStart(2,'0')}`;
  }
  return s;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Build a validator: expected = array of expected bin contents (string or
// byte array). Bins beyond expected.length must be empty.
function makeBinsValidator(expectedSpec) {
  const expected = expectedSpec.map(e => Array.isArray(e) ? e : stringBytes(e));
  return function (world) {
    for (let i = 0; i < expected.length; i++) {
      if (!bytesEqual(world.bins[i], expected[i])) {
        return {
          ok: false,
          message: `bin ${i}: got "${showAscii(world.bins[i])}", expected "${showAscii(expected[i])}"`,
        };
      }
    }
    for (let i = expected.length; i < NUM_BINS; i++) {
      if (world.bins[i].length) {
        return {
          ok: false,
          message: `bin ${i} should be empty, got "${showAscii(world.bins[i])}"`,
        };
      }
    }
    return { ok: true, message: 'All bins match.' };
  };
}

// ── Levels ──────────────────────────────────────────────────────────────────

const LEVELS = [
  {
    id: 'forward',
    title: '1 · Forward each mail',
    teaches: ['L1 registers', 'L3 control flow', 'L5 loops'],
    intro: 'Inbox has N mails. For each i in 0..N-1, post mail i to bin i (mail 0 → bin 0, mail 1 → bin 1, etc.) — body unchanged.',
    hint: 'mail_ptr returns ptr in eax AND length in edx. Save the loop index in a callee-safe register like ebp (or push it across each int 0x80).',
    par: 70,
    starter:
`_start:
  ; TODO: for i in 0..N-1, forward mail i to bin i.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  mov eax, 0x400        ; mail_count
  int 0x80
  mov ebp, eax          ; ebp = total count
  xor esi, esi          ; esi = idx
loop:
  cmp esi, ebp
  jge done
  mov ebx, esi
  mov eax, 0x401        ; mail_ptr → eax=ptr, edx=length
  int 0x80
  mov ecx, eax          ; src
  mov ebx, esi          ; bin = idx
  mov eax, 0x402        ; bin_post
  int 0x80
  inc esi
  jmp loop
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld(['HELO', 'PING', 'ACK', 'BYE']),
    validate: makeBinsValidator(['HELO', 'PING', 'ACK', 'BYE']),
  },

  {
    id: 'route',
    title: '2 · Route by tag byte',
    teaches: ['L3 control flow', 'L9 addressing'],
    intro: 'Each mail starts with a 1-byte bin id (0..3). Strip that byte and post the body to that bin. Multiple mails may target the same bin — they accumulate in order.',
    hint: 'Read the tag with `mov bl, [eax]`. The body sits at eax+1; `lea ecx, [eax+1]` gives src, and `dec edx` shortens length by one.',
    par: 90,
    starter:
`_start:
  ; TODO: peel off first byte as bin id; post the rest.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  mov eax, 0x400
  int 0x80
  mov ebp, eax
  xor esi, esi
loop:
  cmp esi, ebp
  jge done
  mov ebx, esi
  mov eax, 0x401        ; eax=ptr, edx=length
  int 0x80
  xor ebx, ebx
  mov bl, [eax]         ; bl = bin id (first byte)
  lea ecx, [eax+1]      ; src = body start
  dec edx               ; length = body length
  mov eax, 0x402
  int 0x80
  inc esi
  jmp loop
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld([
      [0x01, 0x41, 0x42],    // bin 1 ← "AB"
      [0x00, 0x48, 0x49],    // bin 0 ← "HI"
      [0x02, 0x59, 0x4F],    // bin 2 ← "YO"
      [0x01, 0x43, 0x44],    // bin 1 ← "CD" (appended after "AB")
    ]),
    validate: makeBinsValidator(['HI', 'ABCD', 'YO']),
  },

  {
    id: 'classify',
    title: '3 · URG vs STD',
    teaches: ['L6 strings', 'L8 bitwise', 'L9 addressing'],
    intro: 'Every mail begins with one of two 4-byte tags: "URG:" or "STD:". URG → bin 0, STD → bin 1. Keep the prefix (post the WHOLE mail).',
    hint: '"URG:" little-endian = 0x3A475255 (U=0x55, R=0x52, G=0x47, :=0x3A). Compare the first 4 bytes with `cmp dword [eax], 0x3A475255` and branch with je.',
    par: 110,
    starter:
`_start:
  ; TODO: route URG → bin 0, STD → bin 1.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  mov eax, 0x400
  int 0x80
  mov ebp, eax
  xor esi, esi
loop:
  cmp esi, ebp
  jge done
  mov ebx, esi
  mov eax, 0x401        ; eax=ptr, edx=length
  int 0x80
  cmp dword [eax], 0x3A475255   ; 'URG:' (LE)
  je  is_urg
  mov ecx, eax
  mov ebx, 1
  jmp do_post
is_urg:
  mov ecx, eax
  xor ebx, ebx
do_post:
  mov eax, 0x402
  int 0x80
  inc esi
  jmp loop
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld([
      'URG:fire',
      'STD:news',
      'URG:flood',
      'STD:memo',
    ]),
    validate: makeBinsValidator(['URG:fireURG:flood', 'STD:newsSTD:memo']),
  },

  {
    id: 'reverse',
    title: '4 · Reverse every mail',
    teaches: ['L6 strings', 'L7 memory', 'L9 addressing'],
    intro: 'For each mail, copy its bytes REVERSED into a buffer in .bss, then post the reversed copy to bin 0. Concatenate all reversed bodies in inbox order.',
    hint: 'Setup esi = ptr+length-1, edi = buf, ecx = length. Then a 4-instruction inner loop: `mov al,[esi]; mov [edi],al; dec esi; inc edi`, terminated with `loop revloop`.',
    par: 240,
    starter:
`section .bss
buf resb 64

section .text
_start:
  ; TODO: reverse each mail into buf, post buf to bin 0.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .bss
buf resb 64

section .text
_start:
  mov eax, 0x400
  int 0x80
  mov ebp, eax
  xor esi, esi          ; idx (lives in ebp/esi pair across iterations)
mloop:
  cmp esi, ebp
  jge mdone
  push esi
  mov ebx, esi
  mov eax, 0x401        ; eax=ptr, edx=length
  int 0x80
  push edx              ; remember length for bin_post
  mov esi, eax
  add esi, edx
  dec esi               ; esi = end byte
  mov edi, buf
  mov ecx, edx
rev:
  mov al, [esi]
  mov [edi], al
  dec esi
  inc edi
  loop rev
  pop edx               ; restore length
  mov ecx, buf
  xor ebx, ebx          ; bin 0
  mov eax, 0x402
  int 0x80
  pop esi
  inc esi
  jmp mloop
mdone:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld(['cat', 'echo', 'pad', 'NASM']),
    validate: makeBinsValidator(['tac' + 'ohce' + 'dap' + 'MSAN']),
  },

  {
    id: 'dedupe',
    title: '5 · Dedupe adjacent',
    teaches: ['L6 strings', 'L7 memory', 'L9 addressing'],
    intro: 'Post mails to bin 0 in order, but DROP any mail identical to the immediately preceding one. First mail is always posted.',
    hint: 'Save prev_ptr / prev_len in .data. For each new mail: if lengths differ → not a dup. Else `mov esi,new; mov edi,prev; mov ecx,len; repe cmpsb; je skip`.',
    par: 220,
    starter:
`section .data
prev_ptr dd 0
prev_len dd 0
idx      dd 0

section .text
_start:
  ; TODO: post each mail to bin 0 unless it equals the previous mail.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`section .data
prev_ptr dd 0
prev_len dd 0
idx      dd 0

section .text
_start:
  mov eax, 0x400
  int 0x80
  mov ebp, eax              ; total
mloop:
  mov ebx, [idx]
  cmp ebx, ebp
  jge mdone
  mov eax, 0x401            ; eax=ptr, edx=length
  int 0x80
  mov ebx, [idx]
  cmp ebx, 0
  je  do_post               ; always post first mail
  mov ecx, [prev_len]
  cmp ecx, edx
  jne do_post               ; different lengths → not a duplicate
  push eax
  push edx
  mov esi, eax              ; new mail
  mov edi, [prev_ptr]       ; previous mail
  repe cmpsb                ; equal bytes → loop; differing byte → stop
  pop edx
  pop eax
  je  skip                  ; zf=1 means all bytes matched
do_post:
  mov [prev_ptr], eax
  mov [prev_len], edx
  mov ecx, eax
  xor ebx, ebx
  mov eax, 0x402
  int 0x80
skip:
  inc dword [idx]
  jmp mloop
mdone:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld(['ping', 'ping', 'pong', 'pong', 'ack']),
    validate: makeBinsValidator(['pingpongack']),
  },
];

// ── Renderer ────────────────────────────────────────────────────────────────

function envelopeSvg(label, body, kind /* 'pending' | 'sent' */) {
  const w = 110, h = 38;
  const dim = kind === 'sent';
  const fill   = dim ? 'var(--surface)'  : 'var(--surface2)';
  const stroke = dim ? 'var(--border)'   : 'var(--amber)';
  const text   = dim ? 'var(--p-dim)'    : 'var(--p)';
  const labelText = dim ? 'var(--p-dim)' : 'var(--p-hi)';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="env-svg">
    <rect x="1" y="1" width="${w-2}" height="${h-2}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
    <polyline points="1,1 ${w/2},${h*0.55} ${w-1},1" fill="none" stroke="${stroke}" stroke-width="1"/>
    <text x="6" y="${h-7}" font-size="9.5" font-family="ui-monospace,monospace" fill="${labelText}" font-weight="700">${label}</text>
    <text x="${w-6}" y="${h-7}" font-size="10" font-family="ui-monospace,monospace" fill="${text}" text-anchor="end">${body}</text>
  </svg>`;
}

function previewMail(bytes) {
  // Compact: show ASCII (with escapes) capped at ~14 chars
  let s = showAscii(bytes);
  if (s.length > 14) s = s.slice(0, 13) + '…';
  return s;
}

function binSvg(idx, contents) {
  const w = 150, h = 64;
  const filled = contents.length > 0;
  const stroke = filled ? 'var(--p-hi)' : 'var(--border)';
  const labelColor = `hsl(${[205,160,35,350][idx]},65%,62%)`;
  const ascii = showAscii(contents);
  const preview = ascii.length > 22 ? ascii.slice(0, 21) + '…' : ascii;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="bin-svg">
    <rect x="1" y="14" width="${w-2}" height="${h-15}" rx="3" fill="var(--surface)"
      stroke="${stroke}" stroke-width="1.2"/>
    <rect x="6" y="2" width="${w-12}" height="14" rx="2" fill="var(--surface3)" stroke="${stroke}" stroke-width="1"/>
    <text x="${w/2}" y="12" text-anchor="middle" font-size="9.5"
      font-family="ui-monospace,monospace" fill="${labelColor}" font-weight="700">BIN ${idx}</text>
    <text x="8" y="34" font-size="10.5" font-family="ui-monospace,monospace"
      fill="${filled ? 'var(--p)' : 'var(--p-dim)'}">${preview || '— empty —'}</text>
    <text x="${w-8}" y="${h-6}" text-anchor="end" font-size="9"
      font-family="ui-monospace,monospace" fill="var(--p-dim)">${contents.length}B</text>
  </svg>`;
}

function render(world, root) {
  if (!world) { root.innerHTML = ''; return; }

  // Inbox: each mail is one envelope. "Sent" status is best-effort —
  // mark envelopes as sent if any post recorded reading from their ptr
  // (we treat all mails as 'pending' since we don't track per-mail dispatch;
  // posts may have transformed bytes). Simplest: show inbox as a static
  // list, animate the bins as the side that changes.

  const inboxRows = world.mails.map((m, i) => {
    const lbl = `#${i}`;
    return envelopeSvg(lbl, previewMail(m.bytes), 'pending');
  }).join('');

  const binsRow = [0,1,2,3].map(i => binSvg(i, world.bins[i])).join('');

  const postedCount = world.delivered.length;

  root.innerHTML = `
    <div class="courier-wrap">
      <div class="courier-section">
        <div class="courier-label">Inbox · ${world.mails.length} mails</div>
        <div class="courier-stack">${inboxRows}</div>
      </div>
      <div class="courier-section">
        <div class="courier-label">Bins · ${postedCount} post${postedCount===1?'':'s'} made</div>
        <div class="courier-bins">${binsRow}</div>
      </div>
    </div>
  `;
}

// ── Module export ───────────────────────────────────────────────────────────

const CourierGame = {
  id: 'courier',
  name: 'String Courier',
  blurb: 'Sort mail buffers — MOVSB, CMPSB, SCASB.',
  levels: LEVELS,
  installSyscalls,
  render,
};

if (typeof window !== 'undefined') window.CourierGame = CourierGame;
if (typeof module !== 'undefined' && module.exports) module.exports = CourierGame;

})();
