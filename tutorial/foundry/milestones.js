'use strict';

// v1 milestones: open-ended targets the player can pursue (or ignore).
// Each milestone: { id, title, brief, check(world) -> bool }.
// Completion is sticky: once true, stays true until explicit reset.

const MILESTONES = [
  {
    id: 'first-contact',
    title: 'First contact',
    brief: 'Any sink receives at least 1 byte.',
    check(world) {
      for (const m of world.machines.values()) {
        if (m.type === 'sink' && (m.runtime.count|0) > 0) return true;
      }
      return false;
    }
  },
  {
    id: 'sorted-output',
    title: 'Sorted output',
    brief: 'Two sinks: one only gets evens, the other only odds, each ≥ 50 bytes.',
    check(world) {
      const sinks = [...world.machines.values()].filter(m => m.type === 'sink');
      if (sinks.length < 2) return false;
      let evens = null, odds = null;
      for (const s of sinks) {
        const last = s.runtime.last || [];
        if (!last.length || (s.runtime.count|0) < 50) continue;
        const allEven = last.every(b => (b & 1) === 0);
        const allOdd  = last.every(b => (b & 1) === 1);
        if (allEven) evens = s;
        if (allOdd)  odds  = s;
      }
      return !!(evens && odds);
    }
  },
  {
    id: 'throughput-100',
    title: 'Throughput 100',
    brief: 'Any sink sustains ≥ 100 bytes/sec (10-second window).',
    check(world) {
      for (const m of world.machines.values()) {
        if (m.type === 'sink' && (m.runtime.rate || 0) >= 100) return true;
      }
      return false;
    }
  }
];

if (typeof module !== 'undefined' && module.exports) module.exports = { MILESTONES };
if (typeof window !== 'undefined') window.FOUNDRY_MILESTONES = MILESTONES;
