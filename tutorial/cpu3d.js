'use strict';

// Live 3D CPU. Every Step replays the instruction that just ran in phases:
// fetch → read (values rise out of their sources) → execute (into the ALU) → write back.
// Scenes are built from the simulator's before/after snapshots, so it works for any
// code, not just the lesson examples. Drawing and gliding come from explainer.js (window.Iso).

(function () {
  const { build, stage, DEFS, r, esc, C, T, G, L, SLAB, tiles, labels } = window.Iso;

  // ── Layout (iso grid units) ──────────────────────────────────────────────────
  const REGS = { eax: [0, 0], ebx: [2, 0], ecx: [4, 0], edx: [6, 0], esi: [0, 1.3], edi: [2, 1.3], ebp: [4, 1.3], esp: [6, 1.3] };
  const FLAGS = ['zf', 'sf', 'cf', 'of'];
  const FY = 3.2;                 // flags row
  const ALU = [5, FY];            // ALU block, 3 wide
  const MY = 5.2;                 // memory-operand row
  const SX = 9.4, SY = 0.2;       // stack tower base: pushes stack upward, like the word says
  const SH = 0.5, SLOTS = 8;      // slot height, visible slots
  const STACK_TOP = 0x2000;       // simulator's initial ESP
  const PHASE_MS = 900;      // > the 0.6s glide, so each move finishes before the next

  const probe = new NASMSimulator();
  const load = st => { probe.regs = { ...st.regs }; probe.mem = st.mem; return probe; };

  const hex  = v => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const face = (v, size = 4) => (v >>> 0).toString(16).toUpperCase().padStart(size * 2, '0');
  // Bytes in decimal, mid-size values (often addresses) as hex + decimal, negatives with their signed value.
  const fmt = v => {
    const u = v >>> 0, s = v | 0;
    if (u < 0x100) return String(u);
    if (u < 0x10000) return `0x${u.toString(16).toUpperCase()} (${u})`;
    if (s < 0 && s > -0x10000) return `${hex(u)} (${s})`;
    return hex(u);
  };
  const tokText = v => ((v >>> 0) < 0x1000 ? String(v >>> 0) : ((v | 0) > -0x10000 && (v | 0) < 0 ? String(v | 0) : face(v)));

  const FULL = { ...NASMSimulator.REG16, ...NASMSimulator.REG8L, ...NASMSimulator.REG8H };
  const full32 = n => FULL[n] || n;
  const regSize = n => (NASMSimulator.REG32.includes(n) ? 4 : n in NASMSimulator.REG16 ? 2 : 1);

  const DOC = {
    mov: 'copy the source into the destination. Flags are not touched.',
    movzx: 'copy a small value and fill the upper bits with zeros.',
    movsx: 'copy a small value and fill the upper bits with its sign bit.',
    lea: 'compute the address expression and store the address itself (no memory read).',
    xchg: 'swap the two operands.',
    add: 'destination = destination + source. Sets ZF SF CF OF.',
    sub: 'destination = destination − source. Sets ZF SF CF OF.',
    inc: 'add 1. Sets ZF SF OF, leaves CF alone.',
    dec: 'subtract 1. Sets ZF SF OF, leaves CF alone.',
    neg: 'two\'s-complement negate: 0 − destination.',
    and: 'bitwise AND: a bit survives only if set in both. Clears CF and OF.',
    or: 'bitwise OR: a bit is set if set in either. Clears CF and OF.',
    xor: 'bitwise XOR: a bit is set if the inputs differ. Clears CF and OF.',
    not: 'flip every bit. No flags.',
    shl: 'shift left; each step doubles. The last bit out goes to CF.',
    sal: 'same as SHL.',
    shr: 'shift right, filling with 0 (unsigned halve). Last bit out goes to CF.',
    sar: 'shift right, filling with the sign bit (signed halve).',
    rol: 'rotate left: bits leaving the top re-enter at the bottom.',
    ror: 'rotate right: bits leaving the bottom re-enter at the top.',
    rcl: 'rotate left through CF.', rcr: 'rotate right through CF.',
    bt: 'copy one bit into CF.', bts: 'copy one bit into CF, then set it.',
    btr: 'copy one bit into CF, then clear it.', btc: 'copy one bit into CF, then flip it.',
    bsf: 'index of the lowest set bit.', bsr: 'index of the highest set bit.',
    mul: 'unsigned EAX × source → 64-bit EDX:EAX.',
    imul: 'signed multiply.',
    div: 'unsigned EDX:EAX ÷ source → quotient in EAX, remainder in EDX.',
    idiv: 'signed EDX:EAX ÷ source → quotient in EAX, remainder in EDX.',
    cdq: 'sign-extend EAX into EDX (EDX = all 0s or all 1s).',
    cwde: 'sign-extend AX into EAX.', cbw: 'sign-extend AL into AX.',
    cmp: 'compute destination − source, keep only the flags.',
    test: 'compute destination AND source, keep only the flags.',
    push: 'ESP −= 4, then store the value at [ESP].',
    pop: 'load the value at [ESP], then ESP += 4.',
    pushad: 'push all eight general registers.', popad: 'pop all eight general registers.',
    call: 'push the return address, then jump to the function.',
    ret: 'pop the return address into IP.',
    jmp: 'always jump.',
    loop: 'ECX −= 1, jump if ECX ≠ 0.',
    int: 'hand control to the kernel. EAX picks the system call.',
    cld: 'clear DF: string instructions move forward.', std: 'set DF: string instructions move backward.',
    stc: 'set CF.', clc: 'clear CF.', cmc: 'flip CF.',
    nop: 'do nothing.', hlt: 'stop the CPU.',
  };
  // String ops: the simulator names them movsb, rep_movsb, repne_scasb, movsd_str, ...
  const STR = {
    movs: 'copy [ESI] → [EDI], then advance ESI and EDI', stos: 'store AL/EAX at [EDI], then advance EDI',
    lods: 'load [ESI] into AL/EAX, then advance ESI', scas: 'compare AL/EAX with [EDI], then advance EDI',
    cmps: 'compare [ESI] with [EDI], then advance both',
  };
  const REP = { rep: 'Repeat ECX times: ', repe: 'Repeat while equal and ECX ≠ 0: ', repz: 'Repeat while equal and ECX ≠ 0: ',
    repne: 'Repeat while not equal and ECX ≠ 0: ', repnz: 'Repeat while not equal and ECX ≠ 0: ' };
  function strDoc(op) {
    const [pre, base] = op.includes('_') && !op.endsWith('_str') ? op.split('_') : ['', op.replace('_str', '')];
    const d = STR[base.slice(0, 4)];
    return d && (REP[pre] || '') + d + ` (${{ b: '1 byte', w: '2 bytes', d: '4 bytes' }[base[4]]} each).`;
  }
  const JCC = {
    je: ['zf'], jz: ['zf'], jne: ['zf'], jnz: ['zf'], js: ['sf'], jns: ['sf'], jo: ['of'], jno: ['of'],
    jb: ['cf'], jc: ['cf'], jnae: ['cf'], jae: ['cf'], jnb: ['cf'], jnc: ['cf'], ja: ['cf', 'zf'], jbe: ['cf', 'zf'],
    jl: ['sf', 'of'], jnge: ['sf', 'of'], jge: ['sf', 'of'], jnl: ['sf', 'of'],
    jg: ['zf', 'sf', 'of'], jnle: ['zf', 'sf', 'of'], jle: ['zf', 'sf', 'of'], jng: ['zf', 'sf', 'of'],
  };
  const SYM = { add: '+', sub: '−', cmp: '−', and: '&', test: '&', or: '|', xor: '^', shl: '<<', sal: '<<', shr: '>>', sar: '>>', imul: '×', mul: '×' };
  const SYSCALLS = { 1: 'exit', 3: 'read', 4: 'write', 5: 'open', 6: 'close' };
  const MOVES = new Set(['mov', 'movzx', 'movsx', 'lea', 'xchg', 'push', 'pop']);
  const DEST_NOT_READ = new Set(['mov', 'movzx', 'movsx', 'lea', 'pop', 'bsf', 'bsr']);
  const NO_DEST = new Set(['cmp', 'test', 'bt', 'push']);
  const isBranch = op => op[0] === 'j' || op.startsWith('loop') || op === 'call' || op === 'ret';

  // ── Per-run context: stack window and the label table ─────────────────────────

  function context(run) {
    if (run._cpu3d) return run._cpu3d;
    const states = run.history.map(h => h.before).concat(run.finalState);
    const deepest = Math.max(0, ...states.map(s => (STACK_TOP - s.regs.esp) / 4));
    const lo = Math.max(0, Math.ceil(deepest) - SLOTS);   // first visible slot index
    return (run._cpu3d = { labels: run.labels, lo });
  }
  const slotAddr = (ctx, i) => STACK_TOP - 4 * (ctx.lo + i + 1);
  const slotOf = (ctx, addr) => {
    const i = (STACK_TOP - 4 - (addr & ~3)) / 4 - ctx.lo;
    return i >= 0 && i < SLOTS && addr < STACK_TOP ? i : -1;
  };

  // ── Operands ───────────────────────────────────────────────────────────────────

  function operand(arg, st, ctx, pairSize) {
    const text = arg.trim();
    const bare = text.replace(/^(byte|word|dword)\s+/i, '');
    if (probe.isReg(bare)) {
      const n = bare.toLowerCase();
      return { kind: 'reg', text: n.toUpperCase(), reg: full32(n), size: regSize(n), val: load(st).getReg(n) };
    }
    if (bare.startsWith('[') && bare.endsWith(']')) {
      let addr = 0;
      try { addr = load(st)._resolveAddr(bare.slice(1, -1), ctx.labels); } catch (_) {}
      const size = /^byte/i.test(text) ? 1 : (pairSize || 4);
      return { kind: 'mem', text: bare, addr, size, val: memVal(st, addr, size) };
    }
    let val = 0;
    try { val = load(st).getOperand(text, ctx.labels); } catch (_) {}
    return { kind: 'imm', text, val };
  }
  const memVal = (st, addr, size) => {
    const p = load(st);
    return size === 1 ? p.readByte(addr) : size === 2 ? p.readByte(addr) | p.readByte(addr + 1) << 8 : p.readDword(addr);
  };

  // ── Scene ──────────────────────────────────────────────────────────────────────
  // o.hot: ids to highlight · o.cells: memory cells · o.alu: ALU face text · o.extra: tokens/chips

  function scene(st, ctx, o = {}) {
    const hot = new Set(o.hot || []);
    const tone = id => (hot.has(id) ? 'hot' : '');
    const out = [];

    out.push(SLAB('rs', 0, 0, 8, 2.3));
    for (const [n, [x, y]] of Object.entries(REGS)) {
      out.push(C('r-' + n, x, y, face(st.regs[n]), { w: 1.8, tone: tone('r-' + n) }));
    }

    out.push(SLAB('fs', 0, FY, 4), tiles('ft', 0, FY, 4), labels('fl', 0, FY + 1, FLAGS.map(f => f.toUpperCase())));
    FLAGS.forEach((f, i) => {
      if (st.flags[f]) out.push(C('f-' + f, i, FY, '1', { h: 0.5, tone: tone('f-' + f) }));
      else out.push(T('f0-' + f, i, FY, { text: '0', tone: tone('f-' + f) }));
    });

    out.push(SLAB('as', ALU[0], ALU[1], 3), C('alu', ALU[0], ALU[1], o.alu || 'ALU', { w: 2.8, h: 0.6, tone: o.alu ? 'hot' : '' }));

    out.push(SLAB('ms', 0, MY, 8), L('ml', 4, MY + 1, 'memory operands'));
    (o.cells || []).forEach((c, j) => {
      const v = o.cellsFrom === 'text' ? c.text : face(memVal(st, c.addr, c.size), c.size);
      out.push(C('m' + c.addr + ':' + c.size, 4 * j, MY, v, { w: c.size === 1 ? 0.8 : 3.8, tag: `${c.label} @ ${hex(c.addr)}`, tagBelow: true, tone: tone('m' + c.addr) }));
    });

    // Stack tower: slot 0 (address STACK_TOP-4) at the bottom, ESP's slot on top.
    out.push(SLAB('ss', SX, SY, 2, 1.6), G('sn', SX + 1, SY + 1.6, -0.4, `STACK from ${hex(STACK_TOP)}`, { below: true }));
    for (let i = 0; i < SLOTS; i++) {
      const a = slotAddr(ctx, i);
      if (a >= st.regs.esp) out.push(C('st' + a, SX, SY, face(load(st).readDword(a)), { z: i * SH, w: 1.8, d: 1.4, h: SH - 0.04, tone: tone('st' + a) }));
    }
    const espSlot = Math.min(SLOTS, Math.max(0, (STACK_TOP - st.regs.esp) / 4 - ctx.lo));
    out.push(G('esp-p', SX + 1, SY + 0.7, espSlot * SH, `ESP → ${hex(st.regs.esp)}`, { dx: 0, dy: -30, tone: tone('r-esp') }));
    const ebpSlot = slotOf(ctx, st.regs.ebp);
    if (ebpSlot >= 0) out.push(G('ebp-p', SX + 0.1, SY + 0.8, (ebpSlot + 1) * SH, 'EBP', { dx: -40, dy: -8, tone: tone('r-ebp') }));

    // Register names last, so the front row's chips are not hidden by the flags and ALU.
    for (const [n, [x, y]] of Object.entries(REGS)) {
      out.push(y ? G('n-' + n, x + 1, y + 0.9, 0, n.toUpperCase(), { below: true, dy: 20, tone: tone('r-' + n) })
                 : G('n-' + n, x + 1, y + 0.5, 0.8, n.toUpperCase(), { tone: tone('r-' + n) }));
    }
    if (o.extra) out.push(...o.extra);
    return out.flat(Infinity).filter(Boolean).map(build);
  }

  // Token: a small value cube that flies between places. Same id = it glides.
  const tok = (id, [x, y, z], v) => ({ k: 'cube', id, x, y, z, w: 1.2, d: 0.6, h: 0.45, text: tokText(v), tone: 'hot' });

  // Where an operand sits in the scene (token position) and which cube to highlight.
  function place(opd, ctx, cells) {
    if (opd.kind === 'reg') { const [x, y] = REGS[opd.reg]; return { at: [x + 0.3, y + 0.2, 1.0], id: 'r-' + opd.reg }; }
    if (opd.kind === 'mem') {
      const s = slotOf(ctx, opd.addr);
      if (s >= 0) return { at: [SX + 0.4, SY + 0.5, (s + 1) * SH + 0.1], id: 'st' + (opd.addr & ~3) };
      const j = cells.findIndex(c => c.addr === opd.addr);
      return { at: [4 * j + 0.3, MY + 0.2, 1.0], id: 'm' + opd.addr };
    }
    return null;
  }

  // ── What changed between two snapshots ───────────────────────────────────────

  function diff(a, b, ctx) {
    const regs = Object.keys(REGS).filter(n => a.regs[n] !== b.regs[n]);
    const flags = FLAGS.filter(f => a.flags[f] !== b.flags[f]);
    const bytes = [...new Set([...Object.keys(a.mem), ...Object.keys(b.mem)])].map(Number)
      .filter(k => (a.mem[k] ?? 0) !== (b.mem[k] ?? 0)).sort((x, y) => x - y);
    const stack = [...new Set(bytes.filter(k => slotOf(ctx, k) >= 0).map(k => k & ~3))];
    const data = bytes.filter(k => slotOf(ctx, k) < 0);
    return { regs, flags, stack, data, out: b.stdout.slice(a.stdout.length) };
  }

  // ── Phases for one executed instruction ──────────────────────────────────────

  function phases(run, k) {
    const ctx = context(run);
    const e = run.history[k];
    const from = e.before;
    const to = k + 1 < run.history.length ? run.history[k + 1].before : run.finalState;
    const { op, args, raw } = e.instr;
    const line = (e.instr.line ?? 0) + 1;
    const d = diff(from, to, ctx);

    // Operand sizes: a memory operand paired with AL is a byte access, etc.
    const regArg = args.find(a => probe.isReg(a.trim()));
    const pair = regArg ? regSize(regArg.trim().toLowerCase()) : 0;
    const opsFrom = args.map(a => operand(a, from, ctx, pair));

    // Memory cells: explicit memory operands outside the stack, then other changed data bytes.
    const cells = [];
    opsFrom.forEach(o => {
      if (o.kind === 'mem' && slotOf(ctx, o.addr) < 0 && cells.length < 2) cells.push({ addr: o.addr, size: o.size, label: o.text });
    });
    const covered = k2 => cells.some(c => k2 >= c.addr && k2 < c.addr + c.size);
    const loose = d.data.filter(k2 => !covered(k2));
    if (loose.length && cells.length < 2) {
      const a0 = loose[0], n = Math.min(4, loose.filter(k2 => k2 < a0 + 4).length);
      cells.push({ addr: a0, size: n === 1 ? 1 : 4, label: loose.length > 4 ? `${loose.length} bytes written` : 'written' });
    }

    // Changed things → highlight ids
    const changed = [
      ...d.regs.map(n => 'r-' + n), ...d.flags.map(f => 'f-' + f), ...d.stack.map(a => 'st' + a),
      ...cells.filter(c => d.data.some(k2 => k2 >= c.addr && k2 < c.addr + c.size)).map(c => 'm' + c.addr),
    ];
    const S = (st, o) => scene(st, ctx, { cells, ...o });
    const list = [];
    const head = `<code>${esc(raw)}</code>`;

    // 1. Fetch + decode
    list.push({
      title: `Fetch · line ${line}`,
      text: `${head}: ${DOC[op] || strDoc(op) || (JCC[op] ? `jump if ${JCC[op].map(f => f.toUpperCase()).join('/')} says so.` : 'execute.')}`,
      scene: S(from),
    });

    // Sources: what the instruction reads
    let srcs = [];
    if (op === 'pop' || op === 'ret') {
      srcs = [{ kind: 'mem', text: '[ESP]', addr: from.regs.esp, size: 4, val: memVal(from, from.regs.esp, 4) }];
    } else if (op === 'int') {
      srcs = ['eax', 'ebx', 'ecx', 'edx'].map(n => ({ kind: 'reg', text: n.toUpperCase(), reg: n, val: from.regs[n] }));
    } else if (/^(mul|div|idiv)$/.test(op) || (op === 'imul' && args.length === 1)) {
      srcs = [{ kind: 'reg', text: 'EAX', reg: 'eax', val: from.regs.eax }, ...opsFrom];
      if (op !== 'mul' && op !== 'imul') srcs.unshift({ kind: 'reg', text: 'EDX', reg: 'edx', val: from.regs.edx });
    } else if (op === 'cdq') {
      srcs = [{ kind: 'reg', text: 'EAX', reg: 'eax', val: from.regs.eax }];
    } else if (op === 'loop') {
      srcs = [{ kind: 'reg', text: 'ECX', reg: 'ecx', val: from.regs.ecx }];
    } else if (JCC[op]) {
      srcs = [];
    } else if (!isBranch(op) && args.length) {
      srcs = args.length === 1 ? (op === 'push' || !DEST_NOT_READ.has(op) ? [opsFrom[0]] : [])
        : [...(DEST_NOT_READ.has(op) && op !== 'xchg' ? [] : [opsFrom[0]]), ...opsFrom.slice(1)];
      if (op === 'lea') srcs = [];   // LEA reads no memory: the address itself is the value
    }

    const placed = srcs.map(s => ({ s, p: place(s, ctx, cells) }));
    const tokens = placed.map(({ s, p }, i) => tok('tok' + i, p ? p.at : [ALU[0] + 0.4 + i * 1.3, ALU[1] + 0.1, 2.6], s.val));
    const srcIds = placed.map(({ p }) => p && p.id).filter(Boolean);
    const readText = srcs.map(s => `${s.kind === 'imm' ? 'immediate' : esc(s.text)} = <b>${esc(fmt(s.val))}</b>`).join(', ');

    // Destination of the result
    const destOp = op === 'cdq' ? { kind: 'reg', reg: 'edx', text: 'EDX' }
      : /^(mul|div|idiv)$/.test(op) || (op === 'imul' && args.length === 1) ? { kind: 'reg', reg: 'eax', text: 'EAX' }
      : op === 'push' ? { kind: 'mem', addr: to.regs.esp, text: '[ESP]' }
      : NO_DEST.has(op) || isBranch(op) || op === 'int' || !args.length ? null
      : opsFrom[0];
    const destPlace = destOp && place(destOp, ctx, cells);
    const result = destOp ? (destOp.kind === 'reg' ? to.regs[destOp.reg] : memVal(to, destOp.addr, destOp.size || 4)) : null;

    // Change summary for the write-back card
    const changes = [
      ...d.regs.map(n => `${n.toUpperCase()} ${esc(fmt(from.regs[n]))} → <b>${esc(fmt(to.regs[n]))}</b>`),
      ...d.flags.map(f => `${f.toUpperCase()} ${from.flags[f]} → <b>${to.flags[f]}</b>`),
      ...d.stack.map(a => `[${hex(a)}] ← <b>${esc(fmt(load(to).readDword(a)))}</b>`),
      ...(d.data.length ? [`${d.data.length} byte(s) written at ${hex(d.data[0])}`] : []),
      ...d.out.map(s => `stdout ← "${esc(s)}"`),
    ];
    const summary = changes.length ? changes.join(' · ') : 'Nothing changed: no register, flag or memory write.';

    if (isBranch(op)) {
      const taken = e.nextIp !== from.ip + 1 && e.nextIp !== -1;
      const target = op === 'ret' ? 'the return address' : esc(args[0] || '');
      const flagIds = (JCC[op] || []).map(f => 'f-' + f);
      if (srcs.length || flagIds.length) {
        list.push({
          title: JCC[op] ? 'Check the flags' : 'Read',
          text: JCC[op] ? `${JCC[op].map(f => `${f.toUpperCase()} = <b>${from.flags[f]}</b>`).join(', ')}.` : readText,
          scene: S(from, { hot: [...flagIds, ...srcIds], extra: tokens }),
        });
      }
      list.push({
        title: taken ? 'Jump taken' : 'Not taken',
        text: (taken ? `IP → ${target}` : 'Falls through to the next line.') + (changes.length ? ` · ${summary}` : ''),
        scene: S(to, { hot: changed, extra: [G('ipc', ALU[0] + 1.5, ALU[1] + 0.5, 0.6, taken ? `IP → ${args[0] || 'ret addr'}` : 'IP → next line', { tone: taken ? 'hot' : '', dy: -30 })] }),
      });
      return list;
    }

    if (op === 'int') {
      const no = from.regs.eax, name = SYSCALLS[no] || `#${no}`;
      list.push({
        title: 'Read the syscall registers',
        text: `EAX = ${no} picks <b>${name}</b>. Arguments: EBX = ${esc(fmt(from.regs.ebx))}, ECX = ${esc(fmt(from.regs.ecx))}, EDX = ${esc(fmt(from.regs.edx))}.`,
        scene: S(from, { hot: srcIds, extra: tokens }),
      });
      list.push({
        title: `Kernel runs ${name}`,
        text: summary + (name === 'exit' ? ` · exit code <b>${from.regs.ebx}</b>` : ''),
        scene: S(to, { hot: changed, alu: name + '()' }),
      });
      return list;
    }

    if (srcs.length) {
      list.push({ title: 'Read the operands', text: readText + '.', scene: S(from, { hot: srcIds, extra: tokens }) });
    }

    const viaAlu = !MOVES.has(op) && srcs.length > 0;
    if (viaAlu) {
      const aluAt = i => [ALU[0] + 0.2 + i * 0.9, ALU[1] + 0.1, 0.75];
      const [a, b] = srcs.map(s => s.val);
      let expr;
      if (op === 'cmp') expr = `${fmt(a)} − ${fmt(b)} = ${fmt((a - b) >>> 0)} → flags only`;
      else if (op === 'test') expr = `${fmt(a)} & ${fmt(b)} = ${fmt((a & b) >>> 0)} → flags only`;
      else if (SYM[op] && srcs.length === 2) expr = `${fmt(a)} ${SYM[op]} ${fmt(b)} = ${fmt(result)}`;
      else if (op === 'inc') expr = `${fmt(a)} + 1 = ${fmt(result)}`;
      else if (op === 'dec') expr = `${fmt(a)} − 1 = ${fmt(result)}`;
      else if (op === 'neg') expr = `0 − ${fmt(a)} = ${fmt(result)}`;
      else if (op === 'not') expr = `~${fmt(a)} = ${fmt(result)}`;
      else if (op === 'mul' || op === 'imul') expr = `${fmt(srcs[0].val)} × ${fmt(srcs[1].val)} → EDX:EAX = ${fmt(to.regs.edx)}:${fmt(to.regs.eax)}`;
      else if (op === 'div' || op === 'idiv') expr = `EDX:EAX ÷ ${fmt(srcs[2].val)} → EAX = ${fmt(to.regs.eax)}, EDX = ${fmt(to.regs.edx)}`;
      else expr = `${op.toUpperCase()}(${srcs.map(s => fmt(s.val)).join(', ')})` + (destOp ? ` = ${fmt(result)}` : '');
      list.push({
        title: 'Execute in the ALU',
        text: `<b>${esc(expr)}</b>` + (d.flags.length || ['cmp', 'test'].includes(op) ? ' · flags are computed from this result.' : '.'),
        scene: S(from, { alu: op.toUpperCase(), extra: srcs.map((s, i) => tok('tok' + i, aluAt(i), s.val)) }),
      });
    }

    // Write back: the result token (tok0) glides to the destination.
    const res = destPlace && result != null ? [tok('tok0', destPlace.at, result)] : [];
    list.push({
      title: destOp ? `Write back → ${esc(destOp.text)}` : d.flags.length && !d.regs.length && !d.data.length ? 'Write back → flags' : 'Write back',
      text: summary,
      scene: S(to, { hot: changed, extra: res }),
      settle: S(to, { hot: changed }),
    });
    return list;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────────

  function mount(host) {
    const ctx0 = { labels: {}, lo: 0 };
    const blank = { regs: { eax: 0, ebx: 0, ecx: 0, edx: 0, esi: 0, edi: 0, esp: STACK_TOP - 4 * SLOTS, ebp: STACK_TOP }, flags: { zf: 1, sf: 1, cf: 1, of: 1 }, mem: {}, stdout: [] };
    // Fixed viewBox from the fullest possible scene, so nothing jumps between runs.
    const full = scene(blank, ctx0, {
      cells: [{ addr: 0x4000, size: 4, label: '[arr+ecx*4+8]' }, { addr: 0x4004, size: 4, label: '[arr+ecx*4+8]' }],
      extra: [tok('t', [0.3, 0.2, 2.6], 0), tok('t2', [SX + 0.4, SY + 0.5, SLOTS * SH + 0.1], 0)],
    });
    const xs = [], ys = [];
    full.forEach(o => o.ext.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
    const pad = 10;
    const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad].map(r);

    host.innerHTML = `
      <div class="xp cpu3d">
        <div class="xp-stage cpu3d-stage">
          <svg class="xp-svg" viewBox="${vb.join(' ')}" role="img" aria-label="3D view of the CPU">
            <defs>${DEFS}</defs>
            <rect class="xp-floor" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="url(#xp-grid)"/>
            <g class="xp-layer"></g>
          </svg>
        </div>
        <div class="xp-card cpu3d-card" aria-live="polite">
          <div class="xp-meta"></div>
          <div class="xp-title"></div>
          <p class="xp-text"></p>
        </div>
        <div class="xp-nav">
          <div class="xp-dots"></div>
          <button type="button" class="btn btn-secondary cpu3d-replay" disabled>Replay ↻</button>
        </div>
      </div>`;
    const $ = s => host.querySelector(s);
    const paint = stage($('.xp-layer'));
    let timers = [], cur = null;

    const stop = () => { timers.forEach(clearTimeout); timers = []; };
    function card(meta, title, text) {
      $('.xp-meta').textContent = meta;
      $('.xp-title').textContent = title;
      $('.xp-text').innerHTML = text;
    }
    function dots(n, active) {
      $('.xp-dots').innerHTML = Array.from({ length: n }, (_, i) =>
        `<button type="button" class="xp-dot${i === active ? ' active' : ''}" aria-label="Phase ${i + 1}"></button>`).join('');
      [...host.querySelectorAll('.xp-dot')].forEach((b, i) => b.addEventListener('click', () => { stop(); showPhase(i, false); }));
    }
    function showPhase(i, auto) {
      const ph = cur.list[i];
      paint(ph.scene);
      card(`${cur.meta} · phase ${i + 1} / ${cur.list.length}`, ph.title, ph.text);
      dots(cur.list.length, i);
      if (ph.settle) timers.push(setTimeout(() => paint(ph.settle), auto ? PHASE_MS : 500));
    }
    function play(animate) {
      stop();
      if (!animate) { showPhase(cur.list.length - 1, false); return; }
      cur.list.forEach((_, i) => timers.push(setTimeout(() => showPhase(i, true), i * PHASE_MS)));
    }
    $('.cpu3d-replay').addEventListener('click', () => cur && play(true));

    // s = the app's stepIndex: state shown is "before instruction s", so animate s-1.
    function update(run, s, animate) {
      stop();
      const last = run ? run.history.length - 1 : -1;
      if (!run || s < 0) {
        cur = null;
        paint(scene({ ...blank, regs: { ...blank.regs, esp: STACK_TOP }, flags: {} }, ctx0));
        card('', 'Ready', 'Press <b>Step ▶</b>. Each step replays the instruction that just ran: fetch, read, execute, write back.');
        dots(0); $('.cpu3d-replay').disabled = true;
        return;
      }
      const k = s >= last ? last : s - 1;      // at the end, the final state includes the last instruction
      if (k < 0) {
        cur = null;
        const next = run.history[0].instr;
        paint(scene(run.history[0].before, context(run)));
        card('Before the first instruction', 'Ready', `Next: line ${(next.line ?? 0) + 1} <code>${esc(next.raw)}</code>. Press <b>Step ▶</b> to run it.`);
        dots(0); $('.cpu3d-replay').disabled = true;
        return;
      }
      cur = { list: phases(run, k), meta: `Instruction ${k + 1} / ${run.history.length}` };
      $('.cpu3d-replay').disabled = false;
      play(animate);
    }

    update(null, -1, false);
    return { update };
  }

  window.Cpu3D = { mount, phases };
}());
