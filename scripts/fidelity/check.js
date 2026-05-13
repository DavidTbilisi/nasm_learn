#!/usr/bin/env node
'use strict';

// Fidelity tripwire: for each case in cases.js, run the JS NASMSimulator and
// a real x86-32 emulator (Unicorn, via the Python helper), then diff the
// requested register/flag fields. Any divergence fails the build.

const { spawnSync } = require('child_process');
const path = require('path');

const NASMSimulator = require(path.join(__dirname, '..', '..', 'tutorial', 'simulator.js'));
const cases = require(path.join(__dirname, 'cases.js'));

const RUNNER = path.join(__dirname, 'run_real.py');
let PYTHON; // resolved in main()

const RED   = s => `\x1b[31m${s}\x1b[0m`;
const GREEN = s => `\x1b[32m${s}\x1b[0m`;
const DIM   = s => `\x1b[2m${s}\x1b[0m`;
const BOLD  = s => `\x1b[1m${s}\x1b[0m`;

function hex(n) { return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); }

function runSim(c) {
  const sim = new NASMSimulator();
  // gymRun's wrapper — matches how gym.js produces "expected" answers.
  const wrapped = `section .text\nglobal _start\n_start:\n${c.code}\nhlt`;
  // Apply any initial register state by emitting MOVs at the front.
  // (NASMSimulator has no public seed-regs API; doing it via code is fine.)
  let prefix = '';
  if (c.regs) {
    for (const [r, v] of Object.entries(c.regs)) {
      prefix += `mov ${r}, ${v >>> 0}\n`;
    }
  }
  const code = `section .text\nglobal _start\n_start:\n${prefix}${c.code}\nhlt`;
  const { finalState } = sim.runAll(code);
  return {
    regs: { ...finalState.regs },
    flags: { ...finalState.flags },
  };
}

function runReal(c) {
  const input = JSON.stringify({ code: c.code, regs: c.regs || {} });
  const result = spawnSync(PYTHON, [RUNNER], {
    input,
    encoding: 'utf8',
    maxBuffer: 1 << 20,
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || '<no output>';
    throw new Error(`real runner failed (exit ${result.status}): ${detail.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function diff(c, sim, real) {
  const mismatches = [];
  for (const r of c.compare.regs || []) {
    const a = sim.regs[r] >>> 0, b = real.regs[r] >>> 0;
    if (a !== b) mismatches.push({ field: `regs.${r}`, sim: hex(a), real: hex(b) });
  }
  for (const f of c.compare.flags || []) {
    const a = sim.flags[f] | 0, b = real.flags[f] | 0;
    if (a !== b) mismatches.push({ field: `flags.${f}`, sim: String(a), real: String(b) });
  }
  return mismatches;
}

function resolvePython() {
  if (process.env.FIDELITY_PYTHON) return process.env.FIDELITY_PYTHON;
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  console.error(RED('No Python 3 found in PATH.') + ' Set FIDELITY_PYTHON=/path/to/python.');
  process.exit(2);
}

function checkDeps() {
  const py = spawnSync(PYTHON, ['-c', 'import unicorn'], { encoding: 'utf8' });
  if (py.status !== 0) {
    console.error(RED('Missing Python dep: unicorn.') + ' Install with:');
    console.error('  pip install unicorn');
    console.error('Override interpreter with FIDELITY_PYTHON=...');
    if (py.stderr) console.error(DIM(py.stderr.trim()));
    process.exit(2);
  }
  const nasm = spawnSync('nasm', ['-v'], { encoding: 'utf8' });
  if (nasm.status !== 0) {
    console.error(RED('Missing tool: nasm.') + ' Install with:');
    console.error('  Linux:   apt install nasm');
    console.error('  macOS:   brew install nasm');
    console.error('  Windows: scoop/choco install nasm, or download from nasm.us');
    process.exit(2);
  }
}

function main() {
  PYTHON = resolvePython();
  checkDeps();
  let failed = 0;
  for (const c of cases) {
    let sim, real;
    try {
      sim = runSim(c);
      real = runReal(c);
    } catch (e) {
      console.log(`${RED('ERROR')}  ${c.id}: ${e.message}`);
      failed++;
      continue;
    }
    const mm = diff(c, sim, real);
    if (mm.length === 0) {
      console.log(`${GREEN('OK')}     ${c.id}`);
    } else {
      failed++;
      console.log(`${RED('FAIL')}   ${BOLD(c.id)}`);
      console.log(DIM('         code: ' + c.code.replace(/\n/g, ' ; ')));
      for (const m of mm) {
        console.log(`         ${m.field}: sim=${m.sim}  real=${m.real}`);
      }
    }
  }
  const total = cases.length;
  console.log('');
  console.log(failed === 0
    ? GREEN(`All ${total} cases match real x86.`)
    : RED(`${failed}/${total} cases diverge from real x86.`));
  process.exit(failed === 0 ? 0 : 1);
}

main();
