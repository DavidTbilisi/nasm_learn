'use strict';

// Foundry machine type registry.
//
// Each type defines: inputs/outputs port counts, defaultCode (for processor),
// configForm spec (for source/sink), and a tick(machine, ctx) function that
// the scheduler calls once per world-tick. ctx exposes deliver(port, byte)
// for emitting to wires and consumeAll(port) for draining input queues.

const MACHINE_TYPES = {
  source: {
    name: 'Source',
    glyph: '▶',
    inputs: 0,
    outputs: 1,
    color: 'var(--p-hi)',
    defaultConfig: { pattern: 'count', from: 1, to: 255, cadence: 1 },
    configFields: [
      { key: 'pattern', label: 'Pattern', type: 'select',
        options: [['count','count up'],['random','random'],['fixed','fixed list']] },
      { key: 'from',    label: 'From',    type: 'int',  min: 0, max: 255, when: c => c.pattern === 'count' },
      { key: 'to',      label: 'To',      type: 'int',  min: 0, max: 255, when: c => c.pattern === 'count' },
      { key: 'list',    label: 'List (comma)', type: 'text',
                                                       when: c => c.pattern === 'fixed' },
      { key: 'cadence', label: 'Bytes/tick (1 every N ticks)', type: 'int', min: 1, max: 64 }
    ],
    tick(m, ctx) {
      if ((ctx.tick % (m.config.cadence|0 || 1)) !== 0) return;
      let b;
      if (m.config.pattern === 'random') {
        b = (Math.random() * 256) | 0;
      } else if (m.config.pattern === 'fixed') {
        const list = (m.config.list || '').split(/[,\s]+/).filter(Boolean).map(s => parseInt(s, 0) & 0xFF);
        if (!list.length) return;
        m._idx = (m._idx || 0) % list.length;
        b = list[m._idx++];
      } else {
        const from = (m.config.from|0), to = (m.config.to|0);
        m._idx = (m._idx === undefined ? from : m._idx);
        if (m._idx > to) return;       // count exhausted, stop emitting
        b = m._idx & 0xFF;
        m._idx++;
      }
      ctx.deliver(0, b);
      m.runtime.outCount = (m.runtime.outCount|0) + 1;
    }
  },

  sink: {
    name: 'Sink',
    glyph: '◼',
    inputs: 1,
    outputs: 0,
    color: 'var(--p-mid)',
    defaultConfig: {},
    configFields: [],
    tick(m, ctx) {
      const bytes = ctx.consumeAll(0);
      if (!bytes.length) return;
      m.runtime.count = (m.runtime.count|0) + bytes.length;
      m.runtime.last  = (m.runtime.last || []).concat(bytes).slice(-16);
      m.runtime.checksum = ((m.runtime.checksum|0) + bytes.reduce((a,b)=>a+b,0)) >>> 0;
      // Throughput: bytes per real second, sliding 10s window.
      const now = ctx.now;
      m.runtime.recent = (m.runtime.recent || []).concat(bytes.map(()=>now)).filter(t => now - t < 10_000);
      m.runtime.rate = m.runtime.recent.length / 10;   // bytes/sec
    }
  },

  processor: {
    name: 'Processor',
    glyph: 'P',
    inputs: 2,
    outputs: 2,
    color: 'var(--amber)',
    defaultCode:
`; Echo: read port 0, write to port 0 (or change to port 1).
_start:
  mov eax, 0x600        ; port_read
  xor ebx, ebx          ; port 0
  int 0x80
  cmp eax, 0xFFFF
  je  idle
  mov ecx, eax
  mov eax, 0x601        ; port_write
  xor ebx, ebx          ; out port 0
  int 0x80
  jmp _start
idle:
  mov eax, 0x604        ; yield (skip me until input arrives)
  int 0x80
  jmp _start
`,
    defaultConfig: {},
    configFields: [],
    tick(m, ctx) {
      // Processors are driven by the scheduler — host calls sim.runTicks
      // directly. This per-tick hook is only used for non-program machines.
    }
  },

  splitter: {
    name: 'Splitter',
    glyph: 'Y',
    inputs: 1,
    outputs: 2,
    color: 'var(--cyan, #4ad)',
    defaultConfig: {},
    configFields: [],
    tick(m, ctx) {
      const bytes = ctx.consumeAll(0);
      for (const b of bytes) ctx.deliver(b & 1 ? 1 : 0, b);
    }
  },

  joiner: {
    name: 'Joiner',
    glyph: '∧',
    inputs: 2,
    outputs: 1,
    color: 'var(--cyan, #4ad)',
    defaultConfig: {},
    configFields: [],
    tick(m, ctx) {
      // Round-robin one byte per port per tick.
      const a = ctx.consumeAll(0);
      const b = ctx.consumeAll(1);
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i < a.length) ctx.deliver(0, a[i]);
        if (i < b.length) ctx.deliver(0, b[i]);
      }
    }
  },

  probe: {
    name: 'Probe',
    glyph: '⊙',
    inputs: 0,
    outputs: 0,
    color: '#a0e0ff',
    defaultConfig: { target: null, memAddr: '', memLen: 8 },
    configFields: [
      { key: 'target',  label: 'Watch',      type: 'select-machine', filter: 'processor' },
      { key: 'memAddr', label: 'Mem @ (hex)', type: 'text' },
      { key: 'memLen',  label: 'Mem length',  type: 'int', min: 1, max: 16 }
    ],
    tick(m, ctx) {
      if (!m.config.target) return;
      const tgt = ctx.world && ctx.world.machines.get(m.config.target);
      if (!tgt || !tgt.sim) return;
      const sim = tgt.sim;
      const row = {
        tick: ctx.tick,
        ip:   sim.ip|0,
        regs: { eax: sim.regs.eax>>>0, ebx: sim.regs.ebx>>>0, ecx: sim.regs.ecx>>>0,
                edx: sim.regs.edx>>>0, esi: sim.regs.esi>>>0, edi: sim.regs.edi>>>0,
                ebp: sim.regs.ebp>>>0, esp: sim.regs.esp>>>0 },
        flags: { zf: sim.flags.zf|0, cf: sim.flags.cf|0, sf: sim.flags.sf|0,
                 of: sim.flags.of|0, df: sim.flags.df|0 },
        mem: []
      };
      const addrStr = (m.config.memAddr || '').trim();
      if (addrStr) {
        const addr = parseInt(addrStr, 16);
        if (!isNaN(addr)) {
          const len = Math.max(1, Math.min(16, m.config.memLen|0 || 8));
          for (let i = 0; i < len; i++) row.mem.push({ addr: addr+i, byte: sim.readByte(addr+i) });
        }
      }
      m.runtime.trace = (m.runtime.trace || []).concat([row]).slice(-100);
    }
  }
};

// ── Throughput Tower: deterministic demand source + scored sink ────────────
//
// A "challenge" is a known transformation the player must implement on a known
// input stream. The Demand source emits the input; the Scored sink computes
// the expected output and counts correct bytes per second. Designed for
// reproducible benchmarking — same seed + same challenge → comparable scores.

const TT_CHALLENGES = {
  echo:  { label: 'Echo (passthrough)',          fn: (b, s) => b & 0xFF },
  inc:   { label: '+1  (increment)',             fn: (b, s) => (b + 1) & 0xFF },
  inv:   { label: '~b  (bitwise NOT)',           fn: (b, s) => (~b) & 0xFF },
  xor5a: { label: 'XOR 0x5A (stream cipher)',    fn: (b, s) => (b ^ 0x5A) & 0xFF },
  sum:   { label: 'Running sum (state)',         fn: (b, s) => { s._sum = ((s._sum|0) + b) & 0xFF; return s._sum; } }
};

function ttSequence(seed, len) {
  // LCG byte stream — deterministic for reproducible scoring.
  let st = (seed | 0) || 0x12345678;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    st = (st * 1103515245 + 12345) >>> 0;
    out[i] = (st >>> 16) & 0xFF;
  }
  return out;
}

MACHINE_TYPES.demand = {
  name: 'Demand',
  glyph: '⏵',
  inputs: 0,
  outputs: 1,
  color: '#f0c050',
  defaultConfig: { challenge: 'inc', length: 256, emitsPerTick: 64, seed: 0x12345678 },
  configFields: [
    { key: 'challenge',    label: 'Challenge', type: 'select',
      options: () => Object.entries(TT_CHALLENGES).map(([k, v]) => [k, v.label]) },
    { key: 'length',       label: 'Length',         type: 'int', min: 16,  max: 4096 },
    { key: 'emitsPerTick', label: 'Burst (per tick)', type: 'int', min: 1, max: 256 },
    { key: 'seed',         label: 'Seed',            type: 'int', min: 1, max: 0x7FFFFFFF }
  ],
  tick(m, ctx) {
    const len = m.config.length | 0 || 256;
    if ((m.runtime.outCount | 0) >= len) return;
    if (!m.runtime.seq) m.runtime.seq = ttSequence(m.config.seed | 0, len);
    const burst = Math.max(1, m.config.emitsPerTick | 0 || 64);
    const remaining = len - (m.runtime.outCount | 0);
    const n = Math.min(burst, remaining);
    for (let i = 0; i < n; i++) {
      ctx.deliver(0, m.runtime.seq[m.runtime.outCount | 0]);
      m.runtime.outCount = (m.runtime.outCount | 0) + 1;
    }
    if ((m.runtime.outCount | 0) >= len) m.runtime.done = true;
  }
};

MACHINE_TYPES.scored = {
  name: 'Scored Sink',
  glyph: '★',
  inputs: 1,
  outputs: 0,
  color: '#5fbf60',
  defaultConfig: { source: null },
  configFields: [
    { key: 'source', label: 'Reference source', type: 'select-machine', filter: 'demand' }
  ],
  tick(m, ctx) {
    const bytes = ctx.consumeAll(0);
    if (!bytes.length) return;
    const src = m.config.source && ctx.world && ctx.world.machines.get(m.config.source);
    if (!src || src.type !== 'demand') {
      m.runtime.error = 'Set "Reference source" to a Demand source.';
      return;
    }
    m.runtime.error = null;
    if (!m.runtime.tFirst) m.runtime.tFirst = ctx.now;
    m.runtime.tLast = ctx.now;

    if (!src.runtime.seq) src.runtime.seq = ttSequence(src.config.seed | 0, src.config.length | 0 || 256);
    const seq = src.runtime.seq;
    const len = src.config.length | 0 || 256;
    const challenge = TT_CHALLENGES[src.config.challenge] || TT_CHALLENGES.echo;

    let correct = m.runtime.correct | 0;
    let total   = m.runtime.total   | 0;
    let wrong   = m.runtime.wrong   | 0;
    for (const b of bytes) {
      if (total >= len) { wrong++; continue; }   // over-production penalty
      const expected = challenge.fn(seq[total], m.runtime);
      if ((b & 0xFF) === expected) correct++; else wrong++;
      total++;
    }
    m.runtime.correct = correct;
    m.runtime.total   = total;
    m.runtime.wrong   = wrong;

    const elapsed = Math.max(0.001, (m.runtime.tLast - m.runtime.tFirst) / 1000);
    m.runtime.rate     = correct / elapsed;
    m.runtime.accuracy = total > 0 ? correct / total : 0;

    if (total >= len && !m.runtime.done) {
      m.runtime.done = true;
      // Final score is correct-bytes-per-second over the whole receive window.
      m.runtime.finalScore = m.runtime.rate;
      m.runtime._challenge = src.config.challenge;   // host reads this for leaderboard.
      m.runtime.justFinished = true;
    }
  }
};

// ── Embedded / Cycle Budget ────────────────────────────────────────────────
//
// A Constrained Processor — hard caps on instruction count, data bytes, and
// cycles-per-tick. Cycle budget is FIXED (does not scale with global Speed),
// modeling a real microcontroller pinned to a clock rate. Three preset tiers
// from tightest (S, MCU-class) to mid (L, small embedded SoC). Plugs into
// Demand/Scored just like a normal Processor — its score is recorded to a
// tier-keyed leaderboard so "I solved INC on Tier S at 12 B/s" is comparable.

const EMBEDDED_TIERS = {
  S: { label: 'Tier S (MCU)',         maxInst:  8, maxData:  16, cyclesPerTick:  4 },
  M: { label: 'Tier M (small embed)', maxInst: 16, maxData:  64, cyclesPerTick:  8 },
  L: { label: 'Tier L (mid embed)',   maxInst: 32, maxData: 256, cyclesPerTick: 16 }
};

MACHINE_TYPES.embedded = {
  name: 'Embedded',
  glyph: '⎔',
  inputs: 2,
  outputs: 2,
  color: '#80d0a0',
  defaultConfig: { tier: 'M' },
  configFields: [
    { key: 'tier', label: 'Tier', type: 'select',
      options: () => Object.entries(EMBEDDED_TIERS).map(([k, v]) => [k, v.label]) }
  ],
  defaultCode:
`; Embedded: tight inner loop. Default = +1 transform.
; Watch the inst/data caps in the drawer — exceeding them errors at load.
_start:
  mov eax, 0x600
  xor ebx, ebx
  int 0x80
  cmp eax, 0xFFFF
  je  e_idle
  inc al
  mov ecx, eax
  mov eax, 0x601
  xor ebx, ebx
  int 0x80
  jmp _start
e_idle:
  mov eax, 0x604
  int 0x80
  jmp _start
`,
  tick(m, ctx) {
    // Driven by scheduler — host runs sim.runTicks with the tier's fixed budget.
  }
};

// Black Box — a Processor whose code is hidden. Player picks a puzzle from the
// library; the puzzle's hidden code runs on a private sim in the world. Player
// builds a candidate Processor and uses the verify panel to check it matches.
MACHINE_TYPES.blackbox = {
  name: 'Black Box',
  glyph: '?',
  inputs: 1,
  outputs: 1,
  color: '#b070d8',
  defaultConfig: { puzzle: 'identity' },
  configFields: [
    { key: 'puzzle', label: 'Puzzle', type: 'select',
      options: () => (typeof window !== 'undefined' && window.FOUNDRY_PUZZLES
                       ? window.FOUNDRY_PUZZLES : []).map(p => [p.id, p.title]) }
  ],
  tick(m, ctx) {
    // Runtime handled by the scheduler — treated as a Processor with hidden code.
  }
};

// ── 256-entry palettes for the canvas sink ─────────────────────────────────

function _hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h <  60) [r,g,b] = [c, x, 0];
  else if (h < 120) [r,g,b] = [x, c, 0];
  else if (h < 180) [r,g,b] = [0, c, x];
  else if (h < 240) [r,g,b] = [0, x, c];
  else if (h < 300) [r,g,b] = [x, 0, c];
  else              [r,g,b] = [c, 0, x];
  return [(r+m)*255|0, (g+m)*255|0, (b+m)*255|0];
}

function _buildRainbow() {
  // Index 0 = transparent (skip). 1..255 = HSV ring around the full hue circle.
  const p = new Array(256);
  p[0] = [0, 0, 0];
  for (let i = 1; i < 256; i++) p[i] = _hsvToRgb((i - 1) / 255 * 360, 1, 1);
  return p;
}

function _buildGrayscale() {
  const p = new Array(256);
  for (let i = 0; i < 256; i++) p[i] = [i, i, i];
  return p;
}

function _buildVGA() {
  // Classic 16-color CGA palette, repeated 16× to fill 256 slots.
  const base = [
    [0,0,0], [0,0,170], [0,170,0], [0,170,170],
    [170,0,0], [170,0,170], [170,85,0], [170,170,170],
    [85,85,85], [85,85,255], [85,255,85], [85,255,255],
    [255,85,85], [255,85,255], [255,255,85], [255,255,255]
  ];
  const p = new Array(256);
  for (let i = 0; i < 256; i++) p[i] = base[i & 15];
  return p;
}

const PALETTES = {
  rainbow:   _buildRainbow(),
  grayscale: _buildGrayscale(),
  vga:       _buildVGA()
};

// Canvas Sink — draws pixels from (x, y, color) byte triples on its 3 input
// ports. Sync-aware: only consumes balanced triples. Leftover bytes wait in
// their queue for matching partners — so the player's program is rewarded
// for keeping the three streams aligned.
MACHINE_TYPES.canvas = {
  name: 'Canvas',
  glyph: '▦',
  inputs: 3,
  outputs: 0,
  color: '#ff80c0',
  defaultConfig: { width: 64, height: 64, palette: 'rainbow', scale: 4 },
  configFields: [
    { key: 'width',   label: 'Width',   type: 'int', min: 8, max: 256 },
    { key: 'height',  label: 'Height',  type: 'int', min: 8, max: 256 },
    { key: 'palette', label: 'Palette', type: 'select',
      options: [['rainbow','Rainbow'],['grayscale','Grayscale'],['vga','VGA 16-color']] },
    { key: 'scale',   label: 'Zoom',    type: 'int', min: 1, max: 8 }
  ],
  tick(m, ctx) {
    const xs = m.inputs[0], ys = m.inputs[1], cs = m.inputs[2];
    const n = Math.min(xs.length, ys.length, cs.length);
    if (!n) return;
    const W = m.config.width|0, H = m.config.height|0;
    if (!m.runtime.pixels || m.runtime._w !== W || m.runtime._h !== H) {
      m.runtime.pixels = new Uint8ClampedArray(W * H * 4);
      m.runtime._w = W; m.runtime._h = H;
    }
    const pal = PALETTES[m.config.palette] || PALETTES.rainbow;
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const x = xs.shift() & 0xFF;
      const y = ys.shift() & 0xFF;
      const c = cs.shift() & 0xFF;
      if (c === 0)               continue;   // index 0 = transparent
      if (x >= W || y >= H)      continue;   // out of range = skip
      const idx = (y * W + x) * 4;
      const rgb = pal[c];
      m.runtime.pixels[idx]   = rgb[0];
      m.runtime.pixels[idx+1] = rgb[1];
      m.runtime.pixels[idx+2] = rgb[2];
      m.runtime.pixels[idx+3] = 255;
      drawn++;
    }
    m.runtime.drawn = (m.runtime.drawn|0) + drawn;
    m.runtime.dirty = true;
  }
};

// CommonJS for tests; global for browser.
if (typeof module !== 'undefined' && module.exports) module.exports = { MACHINE_TYPES, PALETTES };
if (typeof module !== 'undefined' && module.exports) {
  module.exports.EMBEDDED_TIERS = EMBEDDED_TIERS;
}
if (typeof window !== 'undefined') {
  window.MACHINE_TYPES = MACHINE_TYPES;
  window.FOUNDRY_PALETTES = PALETTES;
  window.TT_CHALLENGES = TT_CHALLENGES;
  window.ttSequence = ttSequence;
  window.EMBEDDED_TIERS = EMBEDDED_TIERS;
}
