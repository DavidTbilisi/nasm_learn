'use strict';

class NASMSimulator {
  constructor() { this.reset(); }

  static DATA_BASE = 0x4000;  // data segment starts here

  reset() {
    this.regs = { eax:0, ebx:0, ecx:0, edx:0, esi:0, edi:0, esp:0x2000, ebp:0x2000 };
    this.flags = { zf:0, cf:0, sf:0, of:0, df:0 };
    this.mem = {};       // address -> byte value (all accesses byte-level internally)
    this.callStack = []; // return addresses
    this.ip = 0;
    this.halted = false;
    this.stdout = [];    // lines written by sys_write
    this.exitCode = null;
  }

  // ── Byte-level memory helpers ────────────────────────────────────────────────

  readByte(addr)  { return (this.mem[addr >>> 0] ?? 0) & 0xFF; }
  writeByte(addr, v) { this.mem[addr >>> 0] = v & 0xFF; }

  readDword(addr) {
    addr = addr >>> 0;
    return (this.readByte(addr)       |
            this.readByte(addr+1)<<8  |
            this.readByte(addr+2)<<16 |
            this.readByte(addr+3)<<24) >>> 0;
  }

  writeDword(addr, v) {
    addr = addr >>> 0; v = v >>> 0;
    this.writeByte(addr,   v        & 0xFF);
    this.writeByte(addr+1, (v>>8)   & 0xFF);
    this.writeByte(addr+2, (v>>16)  & 0xFF);
    this.writeByte(addr+3, (v>>24)  & 0xFF);
  }

  readString(addr, maxLen=256) {
    let s = '';
    for (let i=0; i<maxLen; i++) {
      const b = this.readByte(addr+i);
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  // ── Register access ─────────────────────────────────────────────────────────

  static REG32 = ['eax','ebx','ecx','edx','esi','edi','esp','ebp'];
  static REG16 = { ax:'eax', bx:'ebx', cx:'ecx', dx:'edx', si:'esi', di:'edi', sp:'esp', bp:'ebp' };
  static REG8L = { al:'eax', bl:'ebx', cl:'ecx', dl:'edx' };
  static REG8H = { ah:'eax', bh:'ebx', ch:'ecx', dh:'edx' };

  isReg(s) {
    s = s.toLowerCase();
    return NASMSimulator.REG32.includes(s) ||
           s in NASMSimulator.REG16 ||
           s in NASMSimulator.REG8L ||
           s in NASMSimulator.REG8H;
  }

  getReg(name) {
    name = name.toLowerCase();
    if (NASMSimulator.REG32.includes(name)) return this.regs[name] >>> 0;
    if (name in NASMSimulator.REG16) return this.regs[NASMSimulator.REG16[name]] & 0xFFFF;
    if (name in NASMSimulator.REG8L) return this.regs[NASMSimulator.REG8L[name]] & 0xFF;
    if (name in NASMSimulator.REG8H) return (this.regs[NASMSimulator.REG8H[name]] >> 8) & 0xFF;
    throw new Error(`Unknown register: ${name}`);
  }

  setReg(name, val) {
    name = name.toLowerCase();
    val = val >>> 0;
    if (NASMSimulator.REG32.includes(name)) { this.regs[name] = val; return; }
    if (name in NASMSimulator.REG16) {
      const r = NASMSimulator.REG16[name];
      this.regs[r] = (this.regs[r] & 0xFFFF0000) | (val & 0xFFFF); return;
    }
    if (name in NASMSimulator.REG8L) {
      const r = NASMSimulator.REG8L[name];
      this.regs[r] = (this.regs[r] & 0xFFFFFF00) | (val & 0xFF); return;
    }
    if (name in NASMSimulator.REG8H) {
      const r = NASMSimulator.REG8H[name];
      this.regs[r] = (this.regs[r] & 0xFFFF00FF) | ((val & 0xFF) << 8); return;
    }
    throw new Error(`Unknown register: ${name}`);
  }

  // ── Parsing ──────────────────────────────────────────────────────────────────

  parse(code) {
    const instructions = [];
    const labels = {};      // code labels: name -> instruction index
    const dataLabels = {};  // data labels: name -> byte address
    const equLabels  = {};  // equ labels:  name -> constant value

    let section = 'text';
    let dataPtr = NASMSimulator.DATA_BASE;

    for (let line of code.split('\n')) {
      const ci = line.indexOf(';');
      if (ci !== -1) line = line.slice(0, ci);
      line = line.trim();
      if (!line) continue;

      // Section switch
      const secM = line.match(/^section\s+\.(\w+)/i);
      if (secM) { section = secM[1].toLowerCase(); continue; }
      if (/^(global|extern|bits|default|org)\b/i.test(line)) continue;

      if (section === 'data' || section === 'bss') {
        // ── Data / BSS declarations ──────────────────────────────────────────
        // label db/dw/dd/resb/resw/resd/equ ...
        const dm = line.match(/^(\w+)\s+(db|dw|dd|dq|resb|resw|resd|resq|equ)\s+(.*)/i);
        if (!dm) continue;
        const [, lbl, dir, rest] = dm;
        const directive = dir.toLowerCase();

        if (directive === 'equ') {
          // Handle  $ - otherlabel  or a plain number
          const exprM = rest.trim().match(/^\$\s*-\s*(\w+)$/);
          if (exprM) {
            const base = dataLabels[exprM[1]];
            equLabels[lbl] = base !== undefined ? dataPtr - base : 0;
          } else {
            equLabels[lbl] = this._parseImm(rest.trim()) ?? 0;
          }
          continue;
        }

        if (directive.startsWith('res')) {
          // resb N / resw N / resd N
          const mult = directive === 'resb' ? 1 : directive === 'resw' ? 2 : 4;
          const count = (this._parseImm(rest.trim()) ?? 1) * mult;
          dataLabels[lbl] = dataPtr;
          // zero-fill the reserved space
          for (let i=0; i<count; i++) this.writeByte(dataPtr+i, 0);
          dataPtr += count;
          continue;
        }

        // db / dw / dd  — parse comma-separated value list (may include strings)
        dataLabels[lbl] = dataPtr;
        const bytes = this._parseDataValues(rest, directive);
        for (const b of bytes) this.writeByte(dataPtr++, b);
        continue;
      }

      // ── Text section ─────────────────────────────────────────────────────────
      // Label possibly followed by instruction
      if (line.includes(':')) {
        const ci2 = line.indexOf(':');
        const lbl = line.slice(0, ci2).trim();
        if (/^\w+$/.test(lbl)) {
          labels[lbl] = instructions.length;
          line = line.slice(ci2 + 1).trim();
          if (!line) continue;
        }
      }

      const m = line.match(/^(\w+)\s*(.*)/s);
      if (!m) continue;
      let op = m[1].toLowerCase();
      let argStr = m[2].trim();
      // Join "rep movsb" → op "rep_movsb" so the executor can switch on it
      if (/^rep[ne z]*$/i.test(op) && argStr) {
        const nm = argStr.match(/^(\w+)\s*(.*)/);
        if (nm) { op = op.replace(/\s+/g,'') + '_' + nm[1].toLowerCase(); argStr = nm[2].trim(); }
      }
      const args = argStr ? this._splitArgs(argStr) : [];
      instructions.push({ op, args, raw: line.trim() });
    }

    // Merge all label types into one lookup (code labels store indices, data/equ store addresses)
    const allLabels = { ...equLabels, ...dataLabels, ...labels };
    return { instructions, labels: allLabels, dataLabels, equLabels };
  }

  // Parse a db/dw/dd value list into an array of bytes
  _parseDataValues(rest, directive) {
    const bytes = [];
    const bytesPerUnit = directive === 'db' ? 1 : directive === 'dw' ? 2 : 4;

    // Split on commas, but not inside quotes
    const parts = [];
    let cur = '', inQ = false, qch = '';
    for (const ch of rest) {
      if (!inQ && (ch === "'" || ch === '"')) { inQ=true; qch=ch; cur+=ch; }
      else if (inQ && ch === qch) { inQ=false; cur+=ch; }
      else if (!inQ && ch === ',') { parts.push(cur.trim()); cur=''; }
      else cur+=ch;
    }
    if (cur.trim()) parts.push(cur.trim());

    for (const part of parts) {
      if ((part.startsWith("'") && part.endsWith("'")) ||
          (part.startsWith('"') && part.endsWith('"'))) {
        // String literal — always byte-by-byte regardless of directive
        const str = part.slice(1,-1);
        for (const ch of str) bytes.push(ch.charCodeAt(0) & 0xFF);
      } else {
        const v = this._parseImm(part) ?? 0;
        for (let i=0; i<bytesPerUnit; i++) bytes.push((v >>> (i*8)) & 0xFF);
      }
    }
    return bytes;
  }

  _splitArgs(s) {
    const args = [];
    let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  }

  // ── Operand resolution ───────────────────────────────────────────────────────

  _parseImm(s) {
    s = s.trim();
    if (/^0x[0-9a-f]+$/i.test(s))  return parseInt(s, 16);
    if (/^0b[01]+$/i.test(s))       return parseInt(s.slice(2), 2);   // 0b1010
    if (/^[01]+b$/i.test(s))        return parseInt(s.slice(0,-1), 2); // 1010b
    if (/^[0-9a-f]+h$/i.test(s))    return parseInt(s.slice(0,-1), 16); // FFh
    if (/^[0-7]+[oq]$/i.test(s))    return parseInt(s.slice(0,-1), 8);  // 77o
    if (/^[+-]?\d+$/.test(s))       return parseInt(s, 10);
    return null;
  }

  _resolveAddr(expr, labels) {
    expr = expr.trim();
    if (this.isReg(expr)) return this.getReg(expr);

    // Resolve a single term: register, label, or immediate
    const term = (s) => {
      s = s.trim();
      if (this.isReg(s)) return this.getReg(s);
      const imm = this._parseImm(s);
      if (imm !== null) return imm;
      if (labels && labels[s] !== undefined) return labels[s];
      return 0;
    };

    // base + index*scale ± disp  e.g.  arr+ecx*4+8
    let m = expr.match(/^(\w+)\s*\+\s*(\w+)\s*\*\s*(\d+)\s*([+-])\s*(\w+)$/);
    if (m) return (term(m[1]) + term(m[2]) * parseInt(m[3]) + (m[4]==='+' ? term(m[5]) : -term(m[5]))) >>> 0;

    // base + index*scale  e.g.  arr+ecx*4, ebx+esi*2
    m = expr.match(/^(\w+)\s*\+\s*(\w+)\s*\*\s*(\d+)$/);
    if (m) return (term(m[1]) + term(m[2]) * parseInt(m[3])) >>> 0;

    // base ± offset  e.g.  ebp-8, arr+ecx, arr+4
    m = expr.match(/^(\w+)\s*([+-])\s*(\w+)$/);
    if (m) return m[2] === '+' ? (term(m[1]) + term(m[3])) >>> 0 : (term(m[1]) - term(m[3])) >>> 0;

    if (labels && labels[expr] !== undefined) return labels[expr];
    const imm = this._parseImm(expr);
    if (imm !== null) return imm >>> 0;
    throw new Error(`Cannot resolve address: ${expr}`);
  }

  getOperand(arg, labels) {
    const origArg = arg.trim();
    const isByte = /^byte\s+/i.test(origArg);
    arg = origArg.replace(/^(byte|word|dword)\s+/i, '');
    if (this.isReg(arg)) return this.getReg(arg);
    const imm = this._parseImm(arg);
    if (imm !== null) return imm >>> 0;
    if (arg.startsWith('[') && arg.endsWith(']')) {
      const addr = this._resolveAddr(arg.slice(1,-1), labels);
      return isByte ? this.readByte(addr) : this.readDword(addr);
    }
    if (labels && labels[arg] !== undefined) return labels[arg] >>> 0;
    throw new Error(`Cannot resolve operand: ${arg}`);
  }

  setOperand(arg, val, labels) {
    const origArg = arg.trim();
    const isByte = /^byte\s+/i.test(origArg);
    arg = origArg.replace(/^(byte|word|dword)\s+/i, '');
    val = val >>> 0;
    if (this.isReg(arg)) { this.setReg(arg, val); return; }
    if (arg.startsWith('[') && arg.endsWith(']')) {
      const addr = this._resolveAddr(arg.slice(1,-1), labels);
      if (isByte) this.writeByte(addr, val); else this.writeDword(addr, val);
      return;
    }
    throw new Error(`Cannot set operand: ${arg}`);
  }

  // ── Flags ────────────────────────────────────────────────────────────────────

  _updateFlags(result, kind, a, b) {
    result = result >>> 0;
    this.flags.zf = result === 0 ? 1 : 0;
    this.flags.sf = (result >>> 31) & 1;
    if (kind === 'add') {
      this.flags.cf = result < (a >>> 0) ? 1 : 0;
      const sa = (a >>> 31) & 1, sb = (b >>> 31) & 1, sr = (result >>> 31) & 1;
      this.flags.of = ((!sa && !sb && sr) || (sa && sb && !sr)) ? 1 : 0;
    } else if (kind === 'sub') {
      this.flags.cf = (a >>> 0) < (b >>> 0) ? 1 : 0;
      const sa = (a >>> 31) & 1, sb = (b >>> 31) & 1, sr = (result >>> 31) & 1;
      this.flags.of = ((sa && !sb && !sr) || (!sa && sb && sr)) ? 1 : 0;
    } else {
      this.flags.cf = 0;
      this.flags.of = 0;
    }
  }

  _condMet(op) {
    const { zf, cf, sf, of } = this.flags;
    switch (op) {
      case 'je':  case 'jz':   return zf === 1;
      case 'jne': case 'jnz':  return zf === 0;
      case 'jg':  case 'jnle': return zf === 0 && sf === of;
      case 'jge': case 'jnl':  return sf === of;
      case 'jl':  case 'jnge': return sf !== of;
      case 'jle': case 'jng':  return zf === 1 || sf !== of;
      case 'ja':  case 'jnbe': return cf === 0 && zf === 0;
      case 'jae': case 'jnb':  return cf === 0;
      case 'jb':  case 'jnae': return cf === 1;
      case 'jbe': case 'jna':  return cf === 1 || zf === 1;
      case 'js':               return sf === 1;
      case 'jns':              return sf === 0;
      default: return false;
    }
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  _exec(instr, labels) {
    const { op, args } = instr;
    const g = i => this.getOperand(args[i], labels);
    const s = (i, v) => this.setOperand(args[i], v >>> 0, labels);

    switch (op) {
      case 'nop': break;
      case 'hlt': this.halted = true; break;

      case 'mov': s(0, g(1)); break;
      case 'xchg': { const t = g(0); s(0, g(1)); s(1, t); break; }
      case 'lea': {
        const addr = this._resolveAddr(args[1].replace(/^\[|\]$/g,''), labels);
        s(0, addr); break;
      }

      case 'add': { const a=g(0),b=g(1),r=(a+b)>>>0; this._updateFlags(r,'add',a,b); s(0,r); break; }
      case 'sub': { const a=g(0),b=g(1),r=(a-b)>>>0; this._updateFlags(r,'sub',a,b); s(0,r); break; }
      // INC/DEC do NOT touch CF — preserve it across the flag update.
      case 'inc': { const a=g(0),r=(a+1)>>>0; const cf=this.flags.cf; this._updateFlags(r,'add',a,1); this.flags.cf=cf; s(0,r); break; }
      case 'dec': { const a=g(0),r=(a-1)>>>0; const cf=this.flags.cf; this._updateFlags(r,'sub',a,1); this.flags.cf=cf; s(0,r); break; }
      case 'neg': { const a=g(0),r=(0-a)>>>0; this._updateFlags(r,'sub',0,a); s(0,r); break; }

      // Carry-flag direct manipulation.
      case 'stc': this.flags.cf = 1; break;
      case 'clc': this.flags.cf = 0; break;
      case 'cmc': this.flags.cf = this.flags.cf ? 0 : 1; break;

      case 'and': { const r=(g(0)&g(1))>>>0; this._updateFlags(r,'logic',0,0); s(0,r); break; }
      case 'or':  { const r=(g(0)|g(1))>>>0; this._updateFlags(r,'logic',0,0); s(0,r); break; }
      case 'xor': { const r=(g(0)^g(1))>>>0; this._updateFlags(r,'logic',0,0); s(0,r); break; }
      case 'not': s(0,(~g(0))>>>0); break;
      case 'shl': case 'sal': { const v=g(0),cnt=g(1)&31; const r=(v<<cnt)>>>0; this._updateFlags(r,'logic',0,0); if(cnt)this.flags.cf=(v>>>(32-cnt))&1; s(0,r); break; }
      case 'shr': { const v=g(0),cnt=g(1)&31; const r=v>>>cnt; this._updateFlags(r,'logic',0,0); if(cnt)this.flags.cf=(v>>>(cnt-1))&1; s(0,r); break; }
      case 'sar': { const v=g(0)|0,cnt=g(1)&31; const r=(v>>cnt)>>>0; this._updateFlags(r,'logic',0,0); if(cnt)this.flags.cf=(v>>>(cnt-1))&1; s(0,r); break; }
      case 'rol': { const v=g(0)>>>0,cnt=g(1)&31; if(!cnt)break; const r=((v<<cnt)|(v>>>(32-cnt)))>>>0; s(0,r); this.flags.cf=r&1; break; }
      case 'ror': { const v=g(0)>>>0,cnt=g(1)&31; if(!cnt)break; const r=((v>>>cnt)|(v<<(32-cnt)))>>>0; s(0,r); this.flags.cf=(r>>>31)&1; break; }
      case 'rcl': { const v=g(0)>>>0,cnt=g(1)&31; if(!cnt)break; const cf=this.flags.cf; const r=(((v<<cnt)|(cf<<(cnt-1))|(v>>>(33-cnt)))>>>0); s(0,r); this.flags.cf=(v>>>(32-cnt))&1; break; }
      case 'rcr': { const v=g(0)>>>0,cnt=g(1)&31; if(!cnt)break; const cf=this.flags.cf; const r=(((v>>>cnt)|(cf<<(32-cnt))|(v<<(33-cnt)))>>>0); s(0,r); this.flags.cf=(v>>>(cnt-1))&1; break; }

      case 'bt':  { const bit=g(1)&31; this.flags.cf=(g(0)>>>bit)&1; break; }
      case 'bts': { const bit=g(1)&31,v=g(0)>>>0; this.flags.cf=(v>>>bit)&1; s(0,v|(1<<bit)); break; }
      case 'btr': { const bit=g(1)&31,v=g(0)>>>0; this.flags.cf=(v>>>bit)&1; s(0,v&~(1<<bit)); break; }
      case 'btc': { const bit=g(1)&31,v=g(0)>>>0; this.flags.cf=(v>>>bit)&1; s(0,v^(1<<bit)); break; }
      case 'bsf': { const v=g(1)>>>0; if(!v){this.flags.zf=1;break;} let i=0; while(!((v>>>i)&1))i++; s(0,i); this.flags.zf=0; break; }
      case 'bsr': { const v=g(1)>>>0; if(!v){this.flags.zf=1;break;} let i=31; while(!((v>>>i)&1))i--; s(0,i); this.flags.zf=0; break; }

      case 'mul': {
        const res = BigInt(this.regs.eax>>>0) * BigInt(g(0)>>>0);
        this.regs.eax = Number(res & 0xFFFFFFFFn)>>>0;
        this.regs.edx = Number((res>>32n) & 0xFFFFFFFFn)>>>0;
        this.flags.cf = this.flags.of = this.regs.edx ? 1 : 0; break;
      }
      case 'imul': {
        // CF=OF=1 when the truncated 32-bit signed result differs from the
        // full signed product — i.e. signed overflow occurred. Otherwise 0.
        let full;
        if (args.length === 1) {
          full = BigInt(this.regs.eax|0) * BigInt(g(0)|0);
          this.regs.eax = Number(full & 0xFFFFFFFFn)>>>0;
          this.regs.edx = Number((full>>32n) & 0xFFFFFFFFn)>>>0;
        } else if (args.length === 2) {
          full = BigInt(g(0)|0) * BigInt(g(1)|0);
          s(0, Number(full & 0xFFFFFFFFn)>>>0);
        } else {
          full = BigInt(g(1)|0) * BigInt(g(2)|0);
          s(0, Number(full & 0xFFFFFFFFn)>>>0);
        }
        const truncated = BigInt.asIntN(32, full);
        const overflow = (truncated !== full) ? 1 : 0;
        this.flags.cf = this.flags.of = overflow;
        break;
      }
      case 'div': {
        const div = g(0)>>>0;
        if (!div) throw new Error('Division by zero');
        const num = (BigInt(this.regs.edx>>>0)<<32n)|BigInt(this.regs.eax>>>0);
        this.regs.eax = Number(num/BigInt(div))>>>0;
        this.regs.edx = Number(num%BigInt(div))>>>0; break;
      }
      case 'idiv': {
        const div = g(0)|0;
        if (!div) throw new Error('Division by zero');
        const num64 = BigInt(this.regs.edx|0) * 0x100000000n + BigInt(this.regs.eax>>>0);
        const divBig = BigInt(div);
        this.regs.eax = Number(num64 / divBig & 0xFFFFFFFFn) >>> 0;
        this.regs.edx = Number(num64 % divBig & 0xFFFFFFFFn) >>> 0; break;
      }

      case 'cdq':  this.regs.edx = (this.regs.eax & 0x80000000) ? 0xFFFFFFFF : 0; break;
      case 'cwde': { const ax = this.regs.eax & 0xFFFF; this.regs.eax = (ax & 0x8000) ? (ax | 0xFFFF0000) >>> 0 : ax; break; }
      case 'cbw':  { const al = this.regs.eax & 0xFF;   const ax = (al & 0x80) ? (al | 0xFF00) : al; this.regs.eax = (this.regs.eax & 0xFFFF0000) | (ax & 0xFFFF); break; }

      case 'cmp':  { const a=g(0),b=g(1),r=(a-b)>>>0; this._updateFlags(r,'sub',a,b); break; }
      case 'test': { const r=(g(0)&g(1))>>>0; this._updateFlags(r,'logic',0,0); break; }

      case 'push':
        this.regs.esp = (this.regs.esp-4)>>>0;
        this.writeDword(this.regs.esp, g(0)); break;
      case 'pop': {
        const v = this.readDword(this.regs.esp);
        this.regs.esp = (this.regs.esp+4)>>>0;
        s(0, v); break;
      }
      case 'pushad':
        for (const r of ['eax','ecx','edx','ebx','esp','ebp','esi','edi']) {
          this.regs.esp = (this.regs.esp-4)>>>0;
          this.writeDword(this.regs.esp, this.regs[r]);
        } break;
      case 'popad':
        for (const r of ['edi','esi','ebp','esp','ebx','edx','ecx','eax']) {
          this.regs[r] = this.readDword(this.regs.esp);
          this.regs.esp = (this.regs.esp+4)>>>0;
        } break;

      // int — Linux x86 syscalls (int 0x80)
      case 'int': {
        const vec = g(0);
        if (vec !== 0x80) break;
        const syscall = this.regs.eax;
        if (syscall === 1) {                          // sys_exit
          this.exitCode = this.regs.ebx;
          this.halted = true;
        } else if (syscall === 4) {                   // sys_write
          // ebx=fd, ecx=buf, edx=len  (only fd 1/2 shown)
          const buf = this.regs.ecx, len = this.regs.edx;
          let s = '';
          for (let i=0; i<len; i++) s += String.fromCharCode(this.readByte(buf+i));
          this.stdout.push(s);
          this.regs.eax = len; // return bytes written
        } else if (syscall === 3) {                   // sys_read — return 0 (no stdin)
          this.regs.eax = 0;
        }
        break;
      }

      // ── Direction flag ───────────────────────────────────────────────────────
      case 'cld': this.flags.df = 0; break;
      case 'std': this.flags.df = 1; break;

      // ── String instructions (single iteration, no REP) ───────────────────────
      case 'movsb': { const d=this.flags.df?-1:1; this.writeByte(this.regs.edi,this.readByte(this.regs.esi)); this.regs.esi=(this.regs.esi+d)>>>0; this.regs.edi=(this.regs.edi+d)>>>0; break; }
      case 'movsw': { const d=this.flags.df?-2:2; this.writeByte(this.regs.edi,this.readByte(this.regs.esi)); this.writeByte(this.regs.edi+1,this.readByte(this.regs.esi+1)); this.regs.esi=(this.regs.esi+d)>>>0; this.regs.edi=(this.regs.edi+d)>>>0; break; }
      case 'movsd_str':
      case 'movsd': { const d=this.flags.df?-4:4; this.writeDword(this.regs.edi,this.readDword(this.regs.esi)); this.regs.esi=(this.regs.esi+d)>>>0; this.regs.edi=(this.regs.edi+d)>>>0; break; }

      case 'stosb': { const d=this.flags.df?-1:1; this.writeByte(this.regs.edi,this.regs.eax&0xFF); this.regs.edi=(this.regs.edi+d)>>>0; break; }
      case 'stosw': { const d=this.flags.df?-2:2; this.writeByte(this.regs.edi,this.regs.eax&0xFF); this.writeByte(this.regs.edi+1,(this.regs.eax>>8)&0xFF); this.regs.edi=(this.regs.edi+d)>>>0; break; }
      case 'stosd': { const d=this.flags.df?-4:4; this.writeDword(this.regs.edi,this.regs.eax); this.regs.edi=(this.regs.edi+d)>>>0; break; }

      case 'lodsb': { const d=this.flags.df?-1:1; this.setReg('al',this.readByte(this.regs.esi)); this.regs.esi=(this.regs.esi+d)>>>0; break; }
      case 'lodsw': { const d=this.flags.df?-2:2; this.setReg('ax',this.readByte(this.regs.esi)|(this.readByte(this.regs.esi+1)<<8)); this.regs.esi=(this.regs.esi+d)>>>0; break; }
      case 'lodsd': { const d=this.flags.df?-4:4; this.regs.eax=this.readDword(this.regs.esi); this.regs.esi=(this.regs.esi+d)>>>0; break; }

      case 'scasb': { const d=this.flags.df?-1:1; const r=((this.regs.eax&0xFF)-this.readByte(this.regs.edi))>>>0; this._updateFlags(r,'sub',this.regs.eax&0xFF,this.readByte(this.regs.edi)); this.regs.edi=(this.regs.edi+d)>>>0; break; }
      case 'scasd': { const d=this.flags.df?-4:4; const b=this.readDword(this.regs.edi); const r=(this.regs.eax-b)>>>0; this._updateFlags(r,'sub',this.regs.eax,b); this.regs.edi=(this.regs.edi+d)>>>0; break; }

      case 'cmpsb': { const d=this.flags.df?-1:1; const a=this.readByte(this.regs.esi),b=this.readByte(this.regs.edi),r=(a-b)>>>0; this._updateFlags(r,'sub',a,b); this.regs.esi=(this.regs.esi+d)>>>0; this.regs.edi=(this.regs.edi+d)>>>0; break; }
      case 'cmpsd': { const d=this.flags.df?-4:4; const a=this.readDword(this.regs.esi),b=this.readDword(this.regs.edi),r=(a-b)>>>0; this._updateFlags(r,'sub',a,b); this.regs.esi=(this.regs.esi+d)>>>0; this.regs.edi=(this.regs.edi+d)>>>0; break; }

      // ── REP variants (execute all iterations as one step) ────────────────────
      case 'rep_movsb': { const d=this.flags.df?-1:1; while(this.regs.ecx){this.writeByte(this.regs.edi,this.readByte(this.regs.esi));this.regs.esi=(this.regs.esi+d)>>>0;this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;} break; }
      case 'rep_movsw': { const d=this.flags.df?-2:2; while(this.regs.ecx){this.writeByte(this.regs.edi,this.readByte(this.regs.esi));this.writeByte(this.regs.edi+1,this.readByte(this.regs.esi+1));this.regs.esi=(this.regs.esi+d)>>>0;this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;} break; }
      case 'rep_movsd': { const d=this.flags.df?-4:4; while(this.regs.ecx){this.writeDword(this.regs.edi,this.readDword(this.regs.esi));this.regs.esi=(this.regs.esi+d)>>>0;this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;} break; }

      case 'rep_stosb': { const d=this.flags.df?-1:1; const al=this.regs.eax&0xFF; while(this.regs.ecx){this.writeByte(this.regs.edi,al);this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;} break; }
      case 'rep_stosd': { const d=this.flags.df?-4:4; while(this.regs.ecx){this.writeDword(this.regs.edi,this.regs.eax);this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;} break; }

      case 'rep_lodsb': { const d=this.flags.df?-1:1; while(this.regs.ecx){this.setReg('al',this.readByte(this.regs.esi));this.regs.esi=(this.regs.esi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;} break; }

      case 'repne_scasb':
      case 'repnz_scasb': { const d=this.flags.df?-1:1; const al=this.regs.eax&0xFF; while(this.regs.ecx){const b=this.readByte(this.regs.edi);const r=((al-b)&0xFF)>>>0;this._updateFlags(r,'sub',al,b);this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;if(this.flags.zf)break;}break; }
      case 'repne_scasd':
      case 'repnz_scasd': { const d=this.flags.df?-4:4; while(this.regs.ecx){const b=this.readDword(this.regs.edi);const r=(this.regs.eax-b)>>>0;this._updateFlags(r,'sub',this.regs.eax,b);this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;if(this.flags.zf)break;}break; }

      case 'repe_cmpsb':
      case 'repz_cmpsb':  { const d=this.flags.df?-1:1; while(this.regs.ecx){const a=this.readByte(this.regs.esi),b=this.readByte(this.regs.edi),r=(a-b)>>>0;this._updateFlags(r,'sub',a,b);this.regs.esi=(this.regs.esi+d)>>>0;this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;if(!this.flags.zf)break;}break; }
      case 'repne_cmpsb':
      case 'repnz_cmpsb': { const d=this.flags.df?-1:1; while(this.regs.ecx){const a=this.readByte(this.regs.esi),b=this.readByte(this.regs.edi),r=(a-b)>>>0;this._updateFlags(r,'sub',a,b);this.regs.esi=(this.regs.esi+d)>>>0;this.regs.edi=(this.regs.edi+d)>>>0;this.regs.ecx=(this.regs.ecx-1)>>>0;if(this.flags.zf)break;}break; }

      // Jumps and calls are handled in the run loop
      default:
        throw new Error(`Unknown instruction: ${op}`);
    }
  }

  // ── Run all and return history ────────────────────────────────────────────────

  runAll(code) {
    this.reset();
    let parsed;
    try { parsed = this.parse(code); }
    catch(e) { return { error: e.message, history:[], instructions:[], labels:{} }; }

    const { instructions, labels } = parsed;
    if (!instructions.length) return { history:[], instructions, labels, steps:0 };

    this.ip = labels['_start'] ?? 0;
    const history = [];
    const MAX = 500;

    const snap = () => ({
      regs: { ...this.regs },
      flags: { ...this.flags },
      mem: { ...this.mem },
      stdout: [...this.stdout],
      exitCode: this.exitCode,
      ip: this.ip
    });

    let steps = 0;
    while (this.ip < instructions.length && !this.halted && steps < MAX) {
      const before = snap();
      const instr = instructions[this.ip];
      const { op, args } = instr;

      try {
        if (op === 'jmp') {
          const t = labels[args[0]];
          if (t === undefined) throw new Error(`Unknown label: ${args[0]}`);
          history.push({ before, instr, nextIp: t });
          this.ip = t; steps++; continue;
        }

        const CONDS = ['je','jz','jne','jnz','jg','jnle','jge','jnl',
                       'jl','jnge','jle','jng','ja','jnbe','jae','jnb',
                       'jb','jnae','jbe','jna','js','jns'];
        if (CONDS.includes(op)) {
          const taken = this._condMet(op);
          const t = taken ? (labels[args[0]] ?? (() => { throw new Error(`Unknown label: ${args[0]}`); })()) : this.ip+1;
          history.push({ before, instr, nextIp: t, branch: { taken, target: args[0] } });
          this.ip = t; steps++; continue;
        }

        if (op === 'loop') {
          this.regs.ecx = (this.regs.ecx-1)>>>0;
          const taken = this.regs.ecx !== 0;
          const t = taken ? (labels[args[0]] ?? (() => { throw new Error(`Unknown label: ${args[0]}`); })()) : this.ip+1;
          history.push({ before, instr, nextIp: t, branch: { taken, target: args[0] } });
          this.ip = t; steps++; continue;
        }

        if (op === 'loope' || op === 'loopz') {
          this.regs.ecx = (this.regs.ecx-1)>>>0;
          const taken = this.regs.ecx !== 0 && this.flags.zf === 1;
          const t = taken ? (labels[args[0]] ?? this.ip+1) : this.ip+1;
          history.push({ before, instr, nextIp: t }); this.ip = t; steps++; continue;
        }

        if (op === 'loopne' || op === 'loopnz') {
          this.regs.ecx = (this.regs.ecx-1)>>>0;
          const taken = this.regs.ecx !== 0 && this.flags.zf === 0;
          const t = taken ? (labels[args[0]] ?? this.ip+1) : this.ip+1;
          history.push({ before, instr, nextIp: t }); this.ip = t; steps++; continue;
        }

        if (op === 'call') {
          const t = labels[args[0]];
          if (t === undefined) throw new Error(`Unknown label: ${args[0]}`);
          this.regs.esp = (this.regs.esp-4)>>>0;
          this.writeDword(this.regs.esp, this.ip+1);
          this.callStack.push(this.ip+1);
          history.push({ before, instr, nextIp: t });
          this.ip = t; steps++; continue;
        }

        if (op === 'ret') {
          const retAddr = this.readDword(this.regs.esp);
          this.regs.esp = (this.regs.esp+4)>>>0;
          if (retAddr === undefined || this.callStack.length === 0) {
            history.push({ before, instr, nextIp: -1 });
            this.halted = true; break;
          }
          this.callStack.pop();
          history.push({ before, instr, nextIp: retAddr });
          this.ip = retAddr; steps++; continue;
        }

        this._exec(instr, labels);
        history.push({ before, instr, nextIp: this.ip+1 });
        this.ip++; steps++;

        if (this.halted) break;
      } catch(e) {
        history.push({ before, instr, nextIp: -1, error: e.message });
        break;
      }
    }

    return {
      history,
      instructions,
      labels,
      finalState: snap(),
      steps,
      hitLimit: steps >= MAX
    };
  }
}
