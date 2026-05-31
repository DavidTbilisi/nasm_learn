'use strict';

// Foundry World: a JSON-serializable container of machines + wires.
// Machine state that should persist (code, config) is on Machine; runtime
// state (sim, queues, stats) lives off-tree on Machine.runtime / Machine.sim.

const WORLD_VERSION = 1;
const DEFAULT_SIZE  = { cols: 12, rows: 8 };

let _idCounter = 0;
function nextId(prefix = 'm') {
  _idCounter++;
  return `${prefix}${_idCounter}`;
}

function makeMachine(type, x, y, opts = {}) {
  const def = (typeof MACHINE_TYPES !== 'undefined' ? MACHINE_TYPES : require('./machines').MACHINE_TYPES)[type];
  if (!def) throw new Error(`Unknown machine type: ${type}`);
  return {
    id: opts.id || nextId('m'),
    type,
    x, y,
    code: (type === 'processor' || type === 'embedded') ? (opts.code ?? def.defaultCode) : null,
    config: { ...(def.defaultConfig || {}), ...(opts.config || {}) },
    // Volatile (not serialized):
    runtime: {},
    inputs:  Array.from({ length: def.inputs  }, () => []),
    outputs: Array.from({ length: def.outputs }, () => []),
    sim: null,            // populated by host for processors
    needsReload: true     // host (re)assembles the program before first tick
  };
}

class World {
  constructor(size = DEFAULT_SIZE) {
    this.size = { ...size };
    this.machines = new Map();
    this.wires = [];        // { from: {id, port}, to: {id, port} }
  }

  addMachine(m) { this.machines.set(m.id, m); return m; }

  removeMachine(id) {
    this.machines.delete(id);
    this.wires = this.wires.filter(w => w.from.id !== id && w.to.id !== id);
  }

  addWire(from, to) {
    // Refuse duplicates.
    if (this.wires.some(w =>
      w.from.id === from.id && w.from.port === from.port &&
      w.to.id   === to.id   && w.to.port   === to.port)) return null;
    const w = { from: { ...from }, to: { ...to } };
    this.wires.push(w);
    return w;
  }

  removeWire(idx) { this.wires.splice(idx, 1); }

  machineAt(x, y) {
    for (const m of this.machines.values()) if (m.x === x && m.y === y) return m;
    return null;
  }

  wiresFrom(id, port) {
    return this.wires.filter(w => w.from.id === id && w.from.port === port);
  }

  serialize() {
    return {
      version: WORLD_VERSION,
      size: this.size,
      machines: Array.from(this.machines.values()).map(m => ({
        id: m.id, type: m.type, x: m.x, y: m.y,
        code: m.code, config: m.config
      })),
      wires: this.wires
    };
  }

  static deserialize(json) {
    if (!json || typeof json !== 'object') throw new Error('Invalid world JSON');
    if (json.version !== WORLD_VERSION) throw new Error(`Unsupported world version: ${json.version}`);
    const w = new World(json.size || DEFAULT_SIZE);
    let maxId = 0;
    for (const mj of (json.machines || [])) {
      const m = makeMachine(mj.type, mj.x, mj.y, { id: mj.id, code: mj.code, config: mj.config });
      w.addMachine(m);
      const n = parseInt((mj.id || '').replace(/^\D+/, ''), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
    if (maxId > _idCounter) _idCounter = maxId;
    for (const wj of (json.wires || [])) w.addWire(wj.from, wj.to);
    return w;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { World, makeMachine, WORLD_VERSION, DEFAULT_SIZE };
}
if (typeof window !== 'undefined') {
  window.FoundryWorld = { World, makeMachine, WORLD_VERSION, DEFAULT_SIZE };
}
