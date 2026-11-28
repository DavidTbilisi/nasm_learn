'use strict';

// x86-64 mode, picked by `bits 64` in the source (NASMSimulator.create). A teaching subset:
// 16 GPRs held as BigInt, 8-byte stack slots, Linux `syscall` (read=0, write=1, exit=60).
// Parsing, labels, data sections and branch handling come from the 32-bit NASMSimulator.
const NASMSimulatorBase = typeof NASMSimulator !== 'undefined' ? NASMSimulator : require('./simulator.js');

class NASMSimulator64 extends NASMSimulatorBase {
  static GPR = ['rax','rbx','rcx','rdx','rsi','rdi','rsp','rbp','r8','r9','r10','r11','r12','r13','r14','r15'];

  // Every register name → [64-bit register it lives in, width in bits, bit offset].
  static VIEWS = (() => {
    const v = {};
    for (const x of ['a','b','c','d']) {
      const r = `r${x}x`;
      Object.assign(v, { [r]: [r,64,0], [`e${x}x`]: [r,32,0], [`${x}x`]: [r,16,0], [`${x}l`]: [r,8,0], [`${x}h`]: [r,8,8] });
    }
    for (const x of ['si','di','sp','bp']) {
      const r = `r${x}`;
      Object.assign(v, { [r]: [r,64,0], [`e${x}`]: [r,32,0], [x]: [r,16,0], [`${x}l`]: [r,8,0] });
    }
    for (let i = 8; i < 16; i++) {
      const r = `r${i}`;
      Object.assign(v, { [r]: [r,64,0], [`${r}d`]: [r,32,0], [`${r}w`]: [r,16,0], [`${r}b`]: [r,8,0] });
    }
    return v;
  })();

  reset() {
    super.reset();
    this.bits = 64;
    this.regs = Object.fromEntries(NASMSimulator64.GPR.map(r => [r, 0n]));
    this.regs.rsp = this.regs.rbp = 0x2000n;
  }

  // ── Registers ────────────────────────────────────────────────────────────────

  isReg(s) { return s.toLowerCase() in NASMSimulator64.VIEWS; }

  getReg(name) {
    const v = NASMSimulator64.VIEWS[name.toLowerCase()];
    if (!v) throw new Error(`Unknown register: ${name}`);
    return BigInt.asUintN(v[1], this.regs[v[0]] >> BigInt(v[2]));
  }

  setReg(name, val) {
    const v = NASMSimulator64.VIEWS[name.toLowerCase()];
    if (!v) throw new Error(`Unknown register: ${name}`);
    const [r, w, off] = v;
    val = BigInt.asUintN(w, BigInt(val));
    if (w >= 32) { this.regs[r] = val; return; }   // a 32-bit write zero-extends into all 64 bits
    const mask = ((1n << BigInt(w)) - 1n) << BigInt(off);
    this.regs[r] = BigInt.asUintN(64, (this.regs[r] & ~mask) | (val << BigInt(off)));
  }

  // Width of an operand from its size keyword or register name; null for memory/immediates.
  _opSize(arg) {
    arg = arg.trim().toLowerCase();
    const m = arg.match(/^(byte|word|dword|qword)\s+/);
    if (m) return { byte: 8, word: 16, dword: 32, qword: 64 }[m[1]];
    return NASMSimulator64.VIEWS[arg]?.[1] ?? null;
  }

  // ── Memory and operands ──────────────────────────────────────────────────────

  readMem(addr, bits) {
    let v = 0n;
    for (let i = bits / 8 - 1; i >= 0; i--) v = (v << 8n) | BigInt(this.readByte(addr + i));
    return v;
  }

  writeMem(addr, bits, v) {
    v = BigInt.asUintN(bits, BigInt(v));
    for (let i = 0; i < bits / 8; i++) this.writeByte(addr + i, Number((v >> BigInt(8 * i)) & 0xFFn));
  }

  // Effective address as a 64-bit BigInt: base + index*scale ± disp, any part optional.
  // LEA needs the exact value (it is often plain arithmetic); memory access uses _resolveAddr.
  _addr64(expr, labels) {
    let sum = 0n;
    for (const [, sign, term] of expr.trim().replace(/^rel\s+/i, '').matchAll(/([+-]?)\s*([^+-]+)/g)) {
      const [x, scale] = term.trim().split(/\s*\*\s*/);
      let v;
      if (this.isReg(x)) v = this.getReg(x);
      else if ((v = this._parseImmBig(x)) === null) {
        if (labels?.[x] === undefined) throw new Error(`Cannot resolve address: ${expr}`);
        v = BigInt(labels[x]);
      }
      v *= scale ? BigInt(scale) : 1n;
      sum += sign === '-' ? -v : v;
    }
    return BigInt.asUintN(64, sum);
  }
  _resolveAddr(expr, labels) { return Number(this._addr64(expr, labels)); }

  _get(arg, bits, labels) {
    const a = arg.trim().replace(/^(byte|word|dword|qword)\s+/i, '');
    if (this.isReg(a)) return this.getReg(a);
    if (a.startsWith('[') && a.endsWith(']')) return this.readMem(this._resolveAddr(a.slice(1, -1), labels), bits);
    const imm = this._parseImmBig(a);
    if (imm !== null) return BigInt.asUintN(bits, imm);
    if (labels && labels[a] !== undefined) return BigInt(labels[a]);
    throw new Error(`Cannot resolve operand: ${arg}`);
  }

  _set(arg, bits, v, labels) {
    const a = arg.trim().replace(/^(byte|word|dword|qword)\s+/i, '');
    if (this.isReg(a)) { this.setReg(a, v); return; }
    if (a.startsWith('[') && a.endsWith(']')) { this.writeMem(this._resolveAddr(a.slice(1, -1), labels), bits, v); return; }
    throw new Error(`Cannot set operand: ${arg}`);
  }

  // Width hooks used by the shared run loop (call / ret / loop).
  _push(v) { this.regs.rsp = BigInt.asUintN(64, this.regs.rsp - 8n); this.writeMem(Number(this.regs.rsp), 64, v); }
  _pop64() { const v = this.readMem(Number(this.regs.rsp), 64); this.regs.rsp = BigInt.asUintN(64, this.regs.rsp + 8n); return v; }
  _pop()   { return Number(this._pop64()); }
  _loopDec() { this.regs.rcx = BigInt.asUintN(64, this.regs.rcx - 1n); return this.regs.rcx === 0n ? 0 : 1; }

  // ── Flags (at the operation's width) ─────────────────────────────────────────

  _flags(r, kind, a, b, bits) {
    const top = BigInt(bits - 1), sign = x => Number((x >> top) & 1n);
    this.flags.zf = r === 0n ? 1 : 0;
    this.flags.sf = sign(r);
    if (kind === 'add') {
      this.flags.cf = r < a ? 1 : 0;
      this.flags.of = sign(a) === sign(b) && sign(r) !== sign(a) ? 1 : 0;
    } else if (kind === 'sub') {
      this.flags.cf = a < b ? 1 : 0;
      this.flags.of = sign(a) !== sign(b) && sign(r) !== sign(a) ? 1 : 0;
    } else {
      this.flags.cf = this.flags.of = 0;
    }
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  _exec(instr, labels) {
    const { op, args } = instr;
    let bits = 64;
    for (const a of args) { const z = this._opSize(a); if (z) { bits = z; break; } }
    const mask = v => BigInt.asUintN(bits, v);
    const g = i => this._get(args[i], bits, labels);
    const s = (i, v) => this._set(args[i], bits, mask(v), labels);

    switch (op) {
      case 'nop': break;
      case 'hlt': this.halted = true; break;

      case 'mov': s(0, g(1)); break;
      case 'movzx': s(0, this._get(args[1], this._opSize(args[1]) ?? 8, labels)); break;
      case 'movsx': case 'movsxd': {
        const w = this._opSize(args[1]) ?? (op === 'movsxd' ? 32 : 8);
        s(0, BigInt.asIntN(w, this._get(args[1], w, labels))); break;
      }
      case 'lea': s(0, this._addr64(args[1].replace(/^\[|\]$/g, ''), labels)); break;
      case 'xchg': { const t = g(0); s(0, g(1)); s(1, t); break; }

      case 'add': { const a = g(0), b = g(1), r = mask(a + b); this._flags(r, 'add', a, b, bits); s(0, r); break; }
      case 'sub': { const a = g(0), b = g(1), r = mask(a - b); this._flags(r, 'sub', a, b, bits); s(0, r); break; }
      case 'cmp': { const a = g(0), b = g(1); this._flags(mask(a - b), 'sub', a, b, bits); break; }
      case 'inc': { const a = g(0), r = mask(a + 1n), cf = this.flags.cf; this._flags(r, 'add', a, 1n, bits); this.flags.cf = cf; s(0, r); break; }
      case 'dec': { const a = g(0), r = mask(a - 1n), cf = this.flags.cf; this._flags(r, 'sub', a, 1n, bits); this.flags.cf = cf; s(0, r); break; }
      case 'neg': { const a = g(0), r = mask(-a); this._flags(r, 'sub', 0n, a, bits); s(0, r); break; }

      case 'and': case 'or': case 'xor': {
        const a = g(0), b = g(1), r = op === 'and' ? a & b : op === 'or' ? a | b : a ^ b;
        this._flags(r, 'logic', 0n, 0n, bits); s(0, r); break;
      }
      case 'test': this._flags(g(0) & g(1), 'logic', 0n, 0n, bits); break;
      case 'not': s(0, ~g(0)); break;

      case 'shl': case 'sal': case 'shr': case 'sar': {
        const cnt = BigInt(Number(this._get(args[1], 8, labels)) & (bits === 64 ? 63 : 31));
        if (!cnt) break;   // a zero count leaves flags alone
        const v = g(0);
        const r = op === 'shr' ? v >> cnt : op === 'sar' ? BigInt.asIntN(bits, v) >> cnt : v << cnt;
        this._flags(mask(r), 'logic', 0n, 0n, bits);
        this.flags.cf = Number((op === 'shr' || op === 'sar' ? v >> (cnt - 1n) : v >> (BigInt(bits) - cnt)) & 1n);
        s(0, r); break;
      }

      case 'imul': {
        if (args.length === 1) throw new Error('imul: use the 2- or 3-operand form in 64-bit mode');
        const [x, y] = args.length === 2 ? [g(0), g(1)] : [g(1), g(2)];
        const full = BigInt.asIntN(bits, x) * BigInt.asIntN(bits, y), r = mask(full);
        this.flags.cf = this.flags.of = BigInt.asIntN(bits, r) !== full ? 1 : 0;
        s(0, r); break;
      }

      case 'push': this._push(this._get(args[0], 64, labels)); break;
      case 'pop':  s(0, this._pop64()); break;
      case 'leave': this.regs.rsp = this.regs.rbp; this.regs.rbp = this._pop64(); break;

      case 'stc': this.flags.cf = 1; break;
      case 'clc': this.flags.cf = 0; break;
      case 'cmc': this.flags.cf ^= 1; break;
      case 'cld': this.flags.df = 0; break;
      case 'std': this.flags.df = 1; break;

      // shortcut: real syscall also overwrites RCX (return address) and R11 (RFLAGS); not modeled.
      case 'syscall': {
        const n = Number(this.regs.rax);
        if (n === 60) {
          this.exitCode = Number(BigInt.asUintN(32, this.regs.rdi));
          this.halted = true;
        } else if (n === 1) {
          const buf = Number(this.regs.rsi), len = Number(this.regs.rdx);
          let out = '';
          for (let i = 0; i < len; i++) out += String.fromCharCode(this.readByte(buf + i));
          this.stdout.push(out);
          this.regs.rax = BigInt(len);
        } else if (n === 0) {
          this.regs.rax = 0n;   // no stdin
        } else {
          throw new Error(`syscall ${n}: only read (0), write (1) and exit (60) are simulated`);
        }
        break;
      }
      case 'int':
        throw new Error('int 0x80 is the 32-bit system call. In 64-bit code use syscall (RAX = 1 write, 60 exit).');

      default: {
        const cc = op.match(/^(set|cmov)(\w+)$/);
        if (cc && cc[2] !== 'ecxz' && NASMSimulatorBase.CONDS.has('j' + cc[2])) {
          const met = this._condMet('j' + cc[2]);
          if (cc[1] === 'set') this._set(args[0], 8, met ? 1n : 0n, labels);
          else if (met) s(0, g(1));
          break;
        }
        throw new Error(`Unknown instruction in 64-bit mode: ${op} (the 64-bit simulator covers a teaching subset)`);
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = NASMSimulator64;
