'use strict';

// Foundry host — wires the Foundry tab UI to the World model and runs the
// scheduler. Each Processor machine owns a dedicated NASMSimulator. The
// scheduler ticks at ~30 Hz (real-time) and gives each Processor
// SPEED * cyclesPerTickBudget instructions per world-tick.

const FOUNDRY_LS_KEY        = 'nasm-foundry-world';
const FOUNDRY_BADGES_KEY    = 'nasm-foundry-badges';
const FOUNDRY_LEADERBOARD_KEY = 'nasm-foundry-leaderboard';
const FOUNDRY_TICK_HZ    = 30;
const FOUNDRY_CYCLE_BUDGET_PER_SPEED = 1;  // 1x = 1 inst per processor per tick

// State.
let fWorld     = null;
let fRunning   = false;
let fSpeed     = 4;        // 1, 4, 16, 64
let fTickCount = 0;
let fLoopId    = null;
let fSelected  = null;     // selected machine id
let fPlace     = null;     // pending machine type to place (from palette click)
let fPendingWire = null;   // { id, port } for output side
let fCm        = null;     // CodeMirror, retargeted per machine
let fHudPrev   = {};       // id -> last HUD snapshot
let fBadges    = {};       // id -> true
let fLastMilestoneCheck = 0;

// DOM.
let fWrap, fPalette, fGrid, fWires, fDrawer, fStatus, fBadgeRow;
let fRunBtn, fPauseBtn, fStepBtn, fResetBtn, fSpeedSel;
let fExportBtn, fImportBtn, fImportInput, fClearBtn;

function resolveFoundryDom() {
  fWrap        = document.getElementById('foundry-wrap');
  fPalette     = document.getElementById('foundry-palette');
  fGrid        = document.getElementById('foundry-grid');
  fWires       = document.getElementById('foundry-wires');
  fDrawer      = document.getElementById('foundry-drawer');
  fStatus      = document.getElementById('foundry-status');
  fBadgeRow    = document.getElementById('foundry-badges');
  fRunBtn      = document.getElementById('foundry-run');
  fPauseBtn    = document.getElementById('foundry-pause');
  fStepBtn     = document.getElementById('foundry-step');
  fResetBtn    = document.getElementById('foundry-reset');
  fSpeedSel    = document.getElementById('foundry-speed');
  fExportBtn   = document.getElementById('foundry-export');
  fImportBtn   = document.getElementById('foundry-import');
  fImportInput = document.getElementById('foundry-import-file');
  fClearBtn    = document.getElementById('foundry-clear');
}

// ── Persistence ─────────────────────────────────────────────────────────────

function saveWorld() {
  if (!fWorld) return;
  try { localStorage.setItem(FOUNDRY_LS_KEY, JSON.stringify(fWorld.serialize())); }
  catch (_) {}
}
function loadSavedWorld() {
  try {
    const raw = localStorage.getItem(FOUNDRY_LS_KEY);
    return raw ? FoundryWorld.World.deserialize(JSON.parse(raw)) : null;
  } catch (_) { return null; }
}
function loadBadges() {
  try { fBadges = JSON.parse(localStorage.getItem(FOUNDRY_BADGES_KEY) || '{}'); }
  catch (_) { fBadges = {}; }
}
function saveBadges() {
  try { localStorage.setItem(FOUNDRY_BADGES_KEY, JSON.stringify(fBadges)); }
  catch (_) {}
}

function loadLeaderboard() {
  try { return JSON.parse(localStorage.getItem(FOUNDRY_LEADERBOARD_KEY) || '{}'); }
  catch (_) { return {}; }
}
function saveLeaderboard(lb) {
  try { localStorage.setItem(FOUNDRY_LEADERBOARD_KEY, JSON.stringify(lb)); }
  catch (_) {}
}
function recordScore(challenge, score) {
  if (!challenge || !isFinite(score) || score <= 0) return { best: score, isBest: false };
  const lb = loadLeaderboard();
  const prev = lb[challenge] || 0;
  if (score > prev) { lb[challenge] = score; saveLeaderboard(lb); return { best: score, isBest: true }; }
  return { best: prev, isBest: false };
}

// Embedded-tier leaderboard. Keyed `${tier}:${challenge}` so e.g. "S:inc" tracks
// best rate any S-tier embedded ever achieved on the +1 challenge — independent
// of the global per-challenge best.
const FOUNDRY_EMB_LB_KEY = 'nasm-foundry-embedded-lb';
function loadEmbeddedLb() {
  try { return JSON.parse(localStorage.getItem(FOUNDRY_EMB_LB_KEY) || '{}'); }
  catch (_) { return {}; }
}
function saveEmbeddedLb(lb) {
  try { localStorage.setItem(FOUNDRY_EMB_LB_KEY, JSON.stringify(lb)); }
  catch (_) {}
}
function recordEmbeddedScore(tier, challenge, score) {
  if (!tier || !challenge || !isFinite(score) || score <= 0) {
    return { best: score, isBest: false };
  }
  const lb = loadEmbeddedLb();
  const key = `${tier}:${challenge}`;
  const prev = lb[key] || 0;
  if (score > prev) {
    lb[key] = score; saveEmbeddedLb(lb);
    return { best: score, isBest: true };
  }
  return { best: prev, isBest: false };
}

// Walk wires backward from a sink machine, returning all upstream machine ids
// reachable through any number of hops. Stops at sources (which never receive).
function _upstreamMachines(world, sinkId) {
  const seen = new Set();
  const stack = [sinkId];
  while (stack.length) {
    const cur = stack.pop();
    for (const w of world.wires) {
      if (w.to.id === cur && !seen.has(w.from.id)) {
        seen.add(w.from.id);
        stack.push(w.from.id);
      }
    }
  }
  return [...seen];
}

// Tier rank: S (tightest) > M > L. Best record goes to the tightest one found.
const _EMB_RANK = { S: 0, M: 1, L: 2 };
function _findTightestEmbeddedUpstream(world, sinkId) {
  let best = null;
  for (const id of _upstreamMachines(world, sinkId)) {
    const m = world.machines.get(id);
    if (!m || m.type !== 'embedded') continue;
    const t = m.config.tier || 'M';
    if (!best || (_EMB_RANK[t] ?? 9) < (_EMB_RANK[best.config.tier || 'M'] ?? 9)) best = m;
  }
  return best;
}

if (typeof window !== 'undefined') {
  window.foundryLeaderboard = {
    loadLeaderboard, saveLeaderboard, recordScore,
    loadEmbeddedLb, saveEmbeddedLb, recordEmbeddedScore
  };
}

// ── Sim wiring for processors ───────────────────────────────────────────────

function installPortSyscalls(machine) {
  const sim = machine.sim;
  sim.syscallTable[0x600] = (s) => {                // port_read
    const p = s.regs.ebx >>> 0;
    const q = machine.inputs[p];
    s.regs.eax = (q && q.length) ? (q.shift() & 0xFF) : 0xFFFF;
  };
  sim.syscallTable[0x601] = (s) => {                // port_write
    const p = s.regs.ebx >>> 0;
    const v = s.regs.ecx & 0xFF;
    deliverFromOutput(machine, p, v);
  };
  sim.syscallTable[0x602] = (s) => {                // port_peek
    const p = s.regs.ebx >>> 0;
    const q = machine.inputs[p];
    s.regs.eax = (q && q.length) ? (q[0] & 0xFF) : 0xFFFF;
  };
  sim.syscallTable[0x603] = (s) => {                // port_count
    const p = s.regs.ebx >>> 0;
    s.regs.eax = (machine.inputs[p] || []).length;
  };
  sim.syscallTable[0x604] = (s) => {                // yield
    machine.runtime.idle = true;
  };
}

function _isProgrammable(m) {
  return m.type === 'processor' || m.type === 'blackbox' || m.type === 'embedded';
}

// Count bytes the parser deposited into the data segment (DATA_BASE..).
// We can't read this from `sim` after loadProgram — loadProgram calls reset()
// which wipes sim.mem after parse(). Instead, run a one-shot parse into a
// throwaway sim purely to count what got written, then return alongside the
// loaded instruction count.
function _embeddedUsage(sim, code) {
  const insCount = sim._program ? sim._program.instructions.length : 0;
  let dataBytes = 0;
  try {
    const probe = new NASMSimulator();
    probe.parse(code);    // mutates probe.mem with data-section bytes
    const dataBase = NASMSimulator.DATA_BASE | 0;
    for (const k of Object.keys(probe.mem || {})) {
      if ((+k) >= dataBase) dataBytes++;
    }
  } catch (_) {}
  return { insCount, dataBytes };
}

function _puzzleCode(id) {
  const p = (window.FOUNDRY_PUZZLES || []).find(x => x.id === id);
  return p ? p.code : '';
}

function reloadProcessor(machine) {
  if (!_isProgrammable(machine)) return;
  if (!machine.sim) {
    machine.sim = new NASMSimulator();
    installPortSyscalls(machine);
  }
  const code = machine.type === 'blackbox'
    ? _puzzleCode(machine.config.puzzle)
    : (machine.code || '');
  const result = machine.sim.loadProgram(code);
  machine.runtime.error = result && result.error ? result.error : null;
  machine.runtime.idle = false;
  machine.needsReload = false;

  if (machine.type === 'embedded' && !machine.runtime.error) {
    const tier = (window.EMBEDDED_TIERS || {})[machine.config.tier] ||
                 (window.EMBEDDED_TIERS || {}).M;
    const usage = _embeddedUsage(machine.sim, code);
    machine.runtime.insUsed   = usage.insCount;
    machine.runtime.dataUsed  = usage.dataBytes;
    machine.runtime.insCap    = tier.maxInst;
    machine.runtime.dataCap   = tier.maxData;
    machine.runtime.cycleBudget = tier.cyclesPerTick;
    if (usage.insCount > tier.maxInst) {
      machine.runtime.error = `Tier ${machine.config.tier}: ${usage.insCount} instructions exceeds ${tier.maxInst}-cap.`;
    } else if (usage.dataBytes > tier.maxData) {
      machine.runtime.error = `Tier ${machine.config.tier}: ${usage.dataBytes} data bytes exceeds ${tier.maxData}-cap.`;
    }
  }
}

// Deliver a byte from machine `from`'s output port `port` to all wired sinks.
function deliverFromOutput(from, port, byte) {
  const wires = fWorld.wiresFrom(from.id, port);
  for (const w of wires) {
    const target = fWorld.machines.get(w.to.id);
    if (!target) continue;
    target.inputs[w.to.port] = target.inputs[w.to.port] || [];
    target.inputs[w.to.port].push(byte & 0xFF);
    // Wake an idle processor that was waiting on input.
    if (target.runtime.idle) target.runtime.idle = false;
  }
  from.runtime.outBytes = (from.runtime.outBytes|0) + wires.length;
}

// ── Scheduler ───────────────────────────────────────────────────────────────

function worldTick() {
  if (!fWorld) return;
  fTickCount++;
  const now = performance.now();
  const ctx = { tick: fTickCount, now, world: fWorld,
    deliver:    (port, b) => { /* set by callsite */ },
    consumeAll: (port)    => { /* set by callsite */ }
  };

  for (const m of fWorld.machines.values()) {
    const def = MACHINE_TYPES[m.type];
    if (!def) continue;

    if (_isProgrammable(m)) {
      if (m.needsReload) reloadProcessor(m);
      if (m.runtime.error || !m.sim || m.sim.halted) continue;
      if (m.runtime.idle && m.inputs.every(q => !q || q.length === 0)) continue;
      m.runtime.idle = false;
      const budget = m.type === 'embedded'
        ? (m.runtime.cycleBudget | 0) || 4
        : fSpeed * FOUNDRY_CYCLE_BUDGET_PER_SPEED;
      const r = m.sim.runTicks(budget);
      if (r.error) m.runtime.error = r.error;
      m.runtime.totalSteps = (m.runtime.totalSteps|0) + (r.steps|0);
    } else {
      // Host-side machines (source/sink/splitter/joiner) — give them ctx
      // bound to this machine.
      ctx.deliver    = (port, b) => deliverFromOutput(m, port, b);
      ctx.consumeAll = (port)    => {
        const q = m.inputs[port];
        if (!q || !q.length) return [];
        const out = q.slice(); m.inputs[port] = []; return out;
      };
      try { def.tick(m, ctx); }
      catch (e) { m.runtime.error = e.message; }
    }
  }

  // Record any scored-sink runs that just finished into the leaderboard.
  for (const m of fWorld.machines.values()) {
    if (m.type !== 'scored' || !m.runtime.justFinished) continue;
    const lb = recordScore(m.runtime._challenge, m.runtime.finalScore);
    m.runtime.bestScore = lb.best;
    m.runtime.isPersonalBest = lb.isBest;
    // If an embedded machine was anywhere upstream, also record under its tier.
    const emb = _findTightestEmbeddedUpstream(fWorld, m.id);
    if (emb) {
      const tier = emb.config.tier || 'M';
      const elb = recordEmbeddedScore(tier, m.runtime._challenge, m.runtime.finalScore);
      m.runtime.embTier      = tier;
      m.runtime.embBest      = elb.best;
      m.runtime.embIsBest    = elb.isBest;
    }
    m.runtime.justFinished = false;
  }

  // Periodic UI refresh + milestone check (don't thrash the DOM every tick).
  if ((fTickCount % 5) === 0) {
    renderGridStats();
    if (fSelected) renderDrawerLive();
  }
  if (now - fLastMilestoneCheck > 1000) {
    fLastMilestoneCheck = now;
    checkMilestones();
  }
}

function startLoop() {
  if (fLoopId) return;
  fRunning = true;
  fLoopId = setInterval(worldTick, Math.floor(1000 / FOUNDRY_TICK_HZ));
  updateRunButtons();
}
function pauseLoop() {
  if (fLoopId) { clearInterval(fLoopId); fLoopId = null; }
  fRunning = false;
  updateRunButtons();
}
function stepOnce() {
  if (fRunning) pauseLoop();
  worldTick();
  renderAll();
}

function resetRuntime() {
  pauseLoop();
  fTickCount = 0;
  if (!fWorld) return;
  for (const m of fWorld.machines.values()) {
    m.runtime = {};
    m.inputs  = m.inputs.map(() => []);
    m.outputs = m.outputs.map(() => []);
    if (_isProgrammable(m)) { m.sim = null; m.needsReload = true; }
    if (m.type === 'source')    { m._idx = undefined; }
  }
  fHudPrev = {};
  renderAll();
}

// ── Milestones ──────────────────────────────────────────────────────────────

function checkMilestones() {
  if (!fWorld || !window.FOUNDRY_MILESTONES) return;
  let changed = false;
  for (const ms of window.FOUNDRY_MILESTONES) {
    if (fBadges[ms.id]) continue;
    try { if (ms.check(fWorld)) { fBadges[ms.id] = true; changed = true; } }
    catch (_) {}
  }
  if (changed) { saveBadges(); renderBadges(); }
}

function renderBadges() {
  if (!fBadgeRow || !window.FOUNDRY_MILESTONES) return;
  fBadgeRow.innerHTML = window.FOUNDRY_MILESTONES.map(ms => {
    const won = !!fBadges[ms.id];
    return `<div class="foundry-badge${won ? ' won' : ''}" title="${ms.brief}">
      <span class="badge-mark">${won ? '★' : '☆'}</span>
      <span class="badge-title">${ms.title}</span>
    </div>`;
  }).join('');
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderAll() {
  renderGrid();
  renderWires();
  renderDrawer();
  renderBadges();
  renderStatus();
}

function renderGrid() {
  if (!fGrid || !fWorld) return;
  const { cols, rows } = fWorld.size;
  fGrid.style.setProperty('--cols', cols);
  fGrid.style.setProperty('--rows', rows);
  let html = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      html += `<div class="foundry-cell" data-x="${x}" data-y="${y}"></div>`;
    }
  }
  for (const m of fWorld.machines.values()) {
    html += machineHtml(m);
  }
  fGrid.innerHTML = html;
}

function machineHtml(m) {
  const def = MACHINE_TYPES[m.type];
  const sel = fSelected === m.id ? ' selected' : '';
  const err = m.runtime.error ? ' err' : '';
  const inputs  = Array.from({length: def.inputs },  (_, i) => `<div class="port in"  data-mid="${m.id}" data-pdir="in"  data-port="${i}" title="in ${i}">${i}</div>`).join('');
  const outputs = Array.from({length: def.outputs}, (_, i) => `<div class="port out" data-mid="${m.id}" data-pdir="out" data-port="${i}" title="out ${i}">${i}</div>`).join('');
  const stats = renderMachineStat(m);
  return `<div class="foundry-machine type-${m.type}${sel}${err}"
              data-mid="${m.id}"
              style="--mx:${m.x};--my:${m.y};--mcolor:${def.color}">
    <div class="ports in-ports">${inputs}</div>
    <div class="machine-body">
      <div class="machine-glyph">${def.glyph}</div>
      <div class="machine-name">${def.name}</div>
      <div class="machine-stat">${stats}</div>
    </div>
    <div class="ports out-ports">${outputs}</div>
  </div>`;
}

function renderMachineStat(m) {
  if (m.type === 'sink') {
    const c = m.runtime.count|0, r = m.runtime.rate || 0;
    return `${c}b · ${r.toFixed(0)}/s`;
  }
  if (m.type === 'source') {
    return `${(m.runtime.outCount|0)}b`;
  }
  if (m.type === 'processor') {
    if (m.runtime.error) return 'err';
    return `${(m.runtime.totalSteps|0)} ins`;
  }
  if (m.type === 'embedded') {
    if (m.runtime.error) return 'err';
    const ic = (m.runtime.insUsed|0), iC = (m.runtime.insCap|0);
    const dc = (m.runtime.dataUsed|0), dC = (m.runtime.dataCap|0);
    return `${ic}/${iC}i · ${dc}/${dC}d`;
  }
  if (m.type === 'canvas') {
    return `${(m.runtime.drawn|0)}px`;
  }
  if (m.type === 'probe') {
    return `${((m.runtime.trace || []).length)} samples`;
  }
  if (m.type === 'demand') {
    const len = m.config.length|0 || 256;
    return `${m.runtime.outCount|0}/${len}b`;
  }
  if (m.type === 'scored') {
    if (m.runtime.done) return `${(m.runtime.rate||0).toFixed(0)} B/s ✓`;
    if ((m.runtime.total|0) > 0) return `${(m.runtime.rate||0).toFixed(0)} B/s`;
    return 'idle';
  }
  return '';
}

function renderGridStats() {
  if (!fGrid || !fWorld) return;
  for (const m of fWorld.machines.values()) {
    const el = fGrid.querySelector(`.foundry-machine[data-mid="${m.id}"] .machine-stat`);
    if (el) el.textContent = renderMachineStat(m);
    const wrap = fGrid.querySelector(`.foundry-machine[data-mid="${m.id}"]`);
    if (wrap) wrap.classList.toggle('err', !!m.runtime.error);
  }
}

function renderWires() {
  if (!fWires || !fWorld) return;
  const { cols, rows } = fWorld.size;
  // Compute pixel coords from grid CSS variables.
  const rect = fGrid.getBoundingClientRect();
  const cw = rect.width  / cols;
  const ch = rect.height / rows;
  fWires.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  fWires.style.width  = rect.width + 'px';
  fWires.style.height = rect.height + 'px';

  const portXY = (id, dir, port) => {
    const m = fWorld.machines.get(id);
    if (!m) return null;
    const def = MACHINE_TYPES[m.type];
    const n = dir === 'in' ? def.inputs : def.outputs;
    if (!n) return null;
    const yMid = (m.y + 0.5) * ch;
    const dy   = ch * 0.6;
    const portY = yMid - dy/2 + ((port + 0.5) / n) * dy;
    const portX = dir === 'in' ? m.x * cw : (m.x + 1) * cw;
    return { x: portX, y: portY };
  };

  const paths = fWorld.wires.map((w, i) => {
    const a = portXY(w.from.id, 'out', w.from.port);
    const b = portXY(w.to.id,   'in',  w.to.port);
    if (!a || !b) return '';
    const dx = Math.max(20, Math.abs(b.x - a.x) * 0.4);
    return `<path class="wire" data-idx="${i}"
              d="M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}"/>`;
  }).join('');

  // Render pending wire if user is mid-wiring.
  let pendingPath = '';
  if (fPendingWire) {
    const a = portXY(fPendingWire.id, 'out', fPendingWire.port);
    if (a) pendingPath = `<circle class="wire-pending" cx="${a.x}" cy="${a.y}" r="6"/>`;
  }

  fWires.innerHTML = paths + pendingPath;
}

function renderStatus() {
  if (!fStatus || !fWorld) return;
  const nM = fWorld.machines.size;
  const nW = fWorld.wires.length;
  fStatus.textContent = `${nM} machines · ${nW} wires · tick ${fTickCount}`;
}

function updateRunButtons() {
  if (fRunBtn)   fRunBtn.disabled   = fRunning;
  if (fPauseBtn) fPauseBtn.disabled = !fRunning;
}

// ── Drawer (machine details + editor + HUD) ─────────────────────────────────

function renderDrawer() {
  if (!fDrawer) return;
  if (!fSelected) {
    fDrawer.innerHTML = `<div class="drawer-empty">
      <h3>Foundry</h3>
      <p>Pick a machine from the palette, then click a grid cell to place it.</p>
      <p>Click a placed machine to edit or wire it. Click an <b>out</b> port,
         then an <b>in</b> port on another machine, to wire them.</p>
      <p>Hit <b>Run ▶</b> to start the world ticking. Hit <b>Step ▸</b> to
         advance one tick at a time.</p>
    </div>`;
    return;
  }
  const m = fWorld.machines.get(fSelected);
  if (!m) { fSelected = null; renderDrawer(); return; }
  const def = MACHINE_TYPES[m.type];

  let configHtml = '';
  for (const f of (def.configFields || [])) {
    if (f.when && !f.when(m.config)) continue;
    const val = m.config[f.key] ?? '';
    if (f.type === 'select') {
      const optList = typeof f.options === 'function' ? f.options() : (f.options || []);
      const opts = optList.map(([k,l]) => `<option value="${k}"${k===val?' selected':''}>${l}</option>`).join('');
      configHtml += `<label class="cfg-row"><span>${f.label}</span>
        <select data-cfg="${f.key}">${opts}</select></label>`;
    } else if (f.type === 'select-machine') {
      const candidates = [...fWorld.machines.values()]
        .filter(c => c.id !== m.id && (!f.filter || c.type === f.filter));
      const opts = ['<option value="">— none —</option>']
        .concat(candidates.map(c => {
          const label = `${MACHINE_TYPES[c.type].name} (${c.id})`;
          return `<option value="${c.id}"${c.id===val?' selected':''}>${label}</option>`;
        })).join('');
      configHtml += `<label class="cfg-row"><span>${f.label}</span>
        <select data-cfg="${f.key}">${opts}</select></label>`;
    } else if (f.type === 'int') {
      configHtml += `<label class="cfg-row"><span>${f.label}</span>
        <input type="number" data-cfg="${f.key}" value="${val}"
               min="${f.min ?? ''}" max="${f.max ?? ''}" /></label>`;
    } else {
      configHtml += `<label class="cfg-row"><span>${f.label}</span>
        <input type="text" data-cfg="${f.key}" value="${val}" /></label>`;
    }
  }

  fDrawer.innerHTML = `
    <div class="drawer-head">
      <h3>${def.name} <span class="drawer-id">${m.id}</span></h3>
      <div class="drawer-actions">
        <button class="btn btn-secondary" id="foundry-wire-out">Wire out…</button>
        <button class="btn btn-secondary" id="foundry-delete">Delete</button>
        <button class="btn btn-secondary" id="foundry-deselect">Close</button>
      </div>
    </div>
    ${configHtml ? `<div class="drawer-config">${configHtml}</div>` : ''}
    ${m.type === 'processor' ? `
      <div class="drawer-code">
        <div class="drawer-label">Code</div>
        <div id="foundry-editor-host"></div>
        <div class="drawer-runtime">
          <div id="foundry-hud" class="arcade-hud"></div>
          <div id="foundry-mach-err" class="foundry-err"></div>
        </div>
      </div>
    ` : m.type === 'embedded' ? `
      <div class="drawer-code">
        <div class="drawer-label">Budget</div>
        <div id="foundry-emb-caps" class="emb-caps"></div>
        <div class="drawer-label">Code</div>
        <div id="foundry-editor-host"></div>
        <div class="drawer-runtime">
          <div id="foundry-hud" class="arcade-hud"></div>
          <div id="foundry-mach-err" class="foundry-err"></div>
        </div>
      </div>
    ` : m.type === 'probe' ? `
      <div class="drawer-runtime">
        <div class="drawer-label">Trace (last ${100})</div>
        <div id="foundry-probe-trace" class="probe-trace"></div>
      </div>
    ` : m.type === 'canvas' ? `
      <div class="drawer-runtime">
        <div class="drawer-label">Output</div>
        <div class="canvas-wrap"><canvas id="foundry-canvas-out"></canvas></div>
        <div class="stat-row"><span>Pixels drawn</span><b id="foundry-canvas-drawn">0</b></div>
        <div class="stat-row"><span>Queues (x · y · c)</span><b id="foundry-canvas-queues">0 · 0 · 0</b></div>
      </div>
    ` : m.type === 'scored' ? `
      <div class="drawer-runtime">
        <div class="drawer-label">Throughput score</div>
        <div id="foundry-tt-score" class="tt-score"></div>
      </div>
    ` : m.type === 'blackbox' ? `
      <div class="drawer-runtime">
        <div class="drawer-label">Puzzle</div>
        <div id="foundry-bb-desc" class="bb-desc"></div>
        <div class="drawer-label">Verify</div>
        <div class="bb-verify">
          <label class="cfg-row"><span>Your solution</span>
            <select id="foundry-bb-target"></select></label>
          <button id="foundry-bb-run" class="btn btn-primary">Run verify ▶</button>
          <div id="foundry-bb-result" class="bb-result"></div>
        </div>
      </div>
    ` : `
      <div class="drawer-runtime"><div id="foundry-stat-block"></div></div>
    `}
  `;

  // Config inputs.
  fDrawer.querySelectorAll('[data-cfg]').forEach(inp => {
    inp.addEventListener('change', () => {
      const k = inp.getAttribute('data-cfg');
      let v = inp.value;
      if (inp.type === 'number') v = parseInt(v, 10) || 0;
      m.config[k] = v;
      m._idx = undefined;   // reset source iterator on config change
      if (_isProgrammable(m)) { m.sim = null; m.needsReload = true; }
      saveWorld();
      renderDrawer();
    });
  });
  document.getElementById('foundry-deselect')?.addEventListener('click', () => { fSelected = null; renderAll(); });
  document.getElementById('foundry-delete')?.addEventListener('click', () => {
    fWorld.removeMachine(m.id); fSelected = null; saveWorld(); renderAll();
  });
  document.getElementById('foundry-wire-out')?.addEventListener('click', () => {
    if (!def.outputs) { fStatus.textContent = `${def.name} has no outputs.`; return; }
    fPendingWire = { id: m.id, port: 0 };
    fStatus.textContent = `Wire mode — click an input port on another machine (esc to cancel).`;
    renderWires();
  });

  if (m.type === 'processor' || m.type === 'embedded') {
    ensureFoundryEditor(m);
    renderDrawerLive();
  } else if (m.type === 'blackbox') {
    initBlackboxDrawer(m);
    renderDrawerLive();
  } else {
    renderDrawerLive();
  }
}

// ── Black Box drawer + verifier ─────────────────────────────────────────────

function initBlackboxDrawer(bb) {
  const desc = document.getElementById('foundry-bb-desc');
  const tgtSel = document.getElementById('foundry-bb-target');
  const runBtn = document.getElementById('foundry-bb-run');
  if (!desc || !tgtSel || !runBtn) return;

  const puzzle = (window.FOUNDRY_PUZZLES || []).find(p => p.id === bb.config.puzzle);
  desc.innerHTML = puzzle
    ? `<b>${puzzle.title}.</b> ${puzzle.description}`
    : `<i>No puzzle selected.</i>`;

  // Populate solution-target dropdown with all Processors.
  const candidates = [...fWorld.machines.values()].filter(c => c.type === 'processor');
  const selVal = bb.runtime.verifyTarget || '';
  tgtSel.innerHTML = ['<option value="">— pick a Processor —</option>']
    .concat(candidates.map(c => `<option value="${c.id}"${c.id===selVal?' selected':''}>${c.id}</option>`))
    .join('');
  tgtSel.addEventListener('change', () => { bb.runtime.verifyTarget = tgtSel.value; });

  runBtn.addEventListener('click', () => {
    const cand = fWorld.machines.get(tgtSel.value);
    const result = verifyBlackbox(bb, cand);
    bb.runtime.lastVerify = result;
    renderBlackboxResult(bb);
  });

  renderBlackboxResult(bb);
}

function renderBlackboxResult(bb) {
  const el = document.getElementById('foundry-bb-result');
  if (!el) return;
  const r = bb.runtime.lastVerify;
  if (!r) { el.innerHTML = `<div class="bb-result-empty">No test run yet.</div>`; return; }
  if (r.error) { el.innerHTML = `<div class="bb-result-err">${r.error}</div>`; return; }
  const cls = r.ok ? 'pass' : 'fail';
  const mark = r.ok ? '✓ PASS' : '✗ FAIL';
  const detail = r.ok
    ? `<div class="bb-result-detail">All ${r.total} bytes matched.</div>`
    : `<div class="bb-result-detail">
         ${r.passCount}/${r.total} matched. First divergence at byte ${r.firstDiff}: expected
         <code>0x${(r.expected[r.firstDiff] ?? 0).toString(16).toUpperCase().padStart(2,'0')}</code>,
         got <code>0x${(r.actual[r.firstDiff] ?? 0).toString(16).toUpperCase().padStart(2,'0')}</code>.
       </div>
       <div class="bb-result-bytes">
         <div><span>expected</span> <code>${r.expected.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}</code></div>
         <div><span>actual&nbsp;&nbsp;</span> <code>${r.actual.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}</code></div>
       </div>`;
  el.innerHTML = `<div class="bb-result-head ${cls}">${mark}</div>${detail}`;
}

// Pure verifier — runs two ephemeral sims with identical seeded inputs.
function verifyBlackbox(bb, candidate) {
  const puzzle = (window.FOUNDRY_PUZZLES || []).find(p => p.id === bb.config.puzzle);
  if (!puzzle) return { error: 'No puzzle selected.' };
  if (!candidate || candidate.type !== 'processor') {
    return { error: 'Pick a Processor as your solution.' };
  }
  if (!candidate.code || !candidate.code.trim()) {
    return { error: 'Your Processor has no code yet.' };
  }
  const N = 16;
  const inputs = _verifyInputs(N);

  function runOne(code) {
    const sim = new NASMSimulator();
    const inQ = inputs.slice();
    const out = [];
    sim.syscallTable[0x600] = (s) => { s.regs.eax = inQ.length ? (inQ.shift() & 0xFF) : 0xFFFF; };
    sim.syscallTable[0x601] = (s) => { out.push(s.regs.ecx & 0xFF); };
    sim.syscallTable[0x602] = (s) => { s.regs.eax = inQ.length ? (inQ[0] & 0xFF) : 0xFFFF; };
    sim.syscallTable[0x603] = (s) => { s.regs.eax = inQ.length; };
    sim.syscallTable[0x604] = (s) => { sim.halted = true; };  // yield on empty ⇒ stop test
    const loaded = sim.loadProgram(code);
    if (loaded && loaded.error) return { error: loaded.error, out: [] };
    sim.runTicks(5000);
    return { out, error: sim.lastError };
  }

  const exp = runOne(puzzle.code);
  const act = runOne(candidate.code);
  if (act.error) return { error: 'Your code errored: ' + act.error };

  const expected = exp.out, actual = act.out;
  let firstDiff = -1;
  const max = Math.max(expected.length, actual.length);
  for (let i = 0; i < max; i++) {
    if (expected[i] !== actual[i]) { firstDiff = i; break; }
  }
  let passCount = 0;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
    if (expected[i] === actual[i]) passCount++;
  }
  return {
    ok: firstDiff === -1 && expected.length === actual.length,
    expected, actual, passCount, total: expected.length, firstDiff
  };
}

function _verifyInputs(n) {
  // Deterministic LCG so two runs produce the same byte sequence.
  let s = 0x12345678;
  const arr = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    arr.push((s >>> 16) & 0xFF);
  }
  return arr;
}

// Expose for tests.
if (typeof window !== 'undefined') window.foundryVerifyBlackbox = verifyBlackbox;

function renderDrawerLive() {
  if (!fSelected || !fWorld) return;
  const m = fWorld.machines.get(fSelected);
  if (!m) return;
  if (m.type === 'processor' || m.type === 'embedded') {
    const hudEl = document.getElementById('foundry-hud');
    if (hudEl && m.sim && window.NASMHud) {
      fHudPrev[m.id] = window.NASMHud.renderHud(m.sim, hudEl, fHudPrev[m.id]);
    }
    const errEl = document.getElementById('foundry-mach-err');
    if (errEl) errEl.textContent = m.runtime.error ? 'Error: ' + m.runtime.error : '';
    if (m.type === 'embedded') renderEmbeddedCaps(m);
  } else if (m.type === 'probe') {
    renderProbeTrace(m);
  } else if (m.type === 'canvas') {
    renderCanvasOut(m);
  } else if (m.type === 'scored') {
    renderTtScore(m);
  } else {
    const sb = document.getElementById('foundry-stat-block');
    if (!sb) return;
    if (m.type === 'sink') {
      const last = (m.runtime.last || []).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
      sb.innerHTML = `
        <div class="stat-row"><span>Total bytes</span><b>${m.runtime.count|0}</b></div>
        <div class="stat-row"><span>Rate (10s)</span><b>${(m.runtime.rate||0).toFixed(1)} B/s</b></div>
        <div class="stat-row"><span>Checksum</span><b>0x${(m.runtime.checksum|0).toString(16).toUpperCase()}</b></div>
        <div class="stat-row stat-row-wide"><span>Last 16</span><code>${last || '—'}</code></div>`;
    } else if (m.type === 'source') {
      sb.innerHTML = `<div class="stat-row"><span>Emitted</span><b>${m.runtime.outCount|0}</b></div>`;
    } else {
      sb.innerHTML = `<div class="stat-row"><span>Routed</span><b>${m.runtime.outBytes|0}</b></div>`;
    }
  }
}

// ── Canvas sink output renderer ─────────────────────────────────────────────

function renderCanvasOut(m) {
  const el = document.getElementById('foundry-canvas-out');
  if (!el) return;
  const W = m.config.width|0, H = m.config.height|0;
  const scale = Math.max(1, Math.min(8, m.config.scale|0 || 4));
  const cssW = W * scale, cssH = H * scale;
  if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
  el.style.width  = cssW + 'px';
  el.style.height = cssH + 'px';
  const ctx = el.getContext('2d');
  if (!m.runtime.pixels) {
    ctx.clearRect(0, 0, W, H);
  } else if (m.runtime.dirty) {
    const img = new ImageData(m.runtime.pixels, W, H);
    ctx.putImageData(img, 0, 0);
    m.runtime.dirty = false;
  }
  const drawn = document.getElementById('foundry-canvas-drawn');
  if (drawn) drawn.textContent = (m.runtime.drawn|0).toString();
  const q = document.getElementById('foundry-canvas-queues');
  if (q) q.textContent = `${(m.inputs[0]||[]).length} · ${(m.inputs[1]||[]).length} · ${(m.inputs[2]||[]).length}`;
}

// ── Throughput Tower score renderer ─────────────────────────────────────────

function renderTtScore(m) {
  const el = document.getElementById('foundry-tt-score');
  if (!el) return;
  const r = m.runtime;
  if (r.error) {
    el.innerHTML = `<div class="tt-err">${r.error}</div>`;
    return;
  }
  const src = m.config.source && fWorld.machines.get(m.config.source);
  if (!src) {
    el.innerHTML = `<div class="tt-empty">Set "Reference source" in the config above.</div>`;
    return;
  }
  const len = src.config.length | 0 || 256;
  const total   = r.total   | 0;
  const correct = r.correct | 0;
  const wrong   = r.wrong   | 0;
  const pct     = (r.accuracy || 0) * 100;
  const rate    = r.rate || 0;
  const challenge = src.config.challenge;
  const lb = loadLeaderboard();
  const best = r.bestScore || lb[challenge] || 0;
  const tierTag = r.embTier
    ? ` <span class="tt-tier${r.embIsBest ? ' tier-best' : ''}">Tier ${r.embTier}${r.embIsBest ? ' ✦' : ''}</span>`
    : '';
  const banner = r.done
    ? `<div class="tt-banner ${r.isPersonalBest ? 'pb' : 'done'}">
         ${r.isPersonalBest ? '🏆 NEW BEST' : 'RUN COMPLETE'}
         <span class="tt-banner-score">${rate.toFixed(1)} B/s</span>${tierTag}
       </div>`
    : `<div class="tt-banner running">RUNNING — ${total}/${len} bytes${tierTag}</div>`;
  el.innerHTML = `
    ${banner}
    <div class="tt-grid">
      <div class="tt-cell"><span>Live rate</span><b>${rate.toFixed(1)} B/s</b></div>
      <div class="tt-cell"><span>Accuracy</span><b>${pct.toFixed(1)}%</b></div>
      <div class="tt-cell"><span>Correct</span><b>${correct}</b></div>
      <div class="tt-cell"><span>Wrong</span><b>${wrong}</b></div>
      <div class="tt-cell"><span>Received</span><b>${total} / ${len}</b></div>
      <div class="tt-cell"><span>Your best</span><b>${best ? best.toFixed(1) + ' B/s' : '—'}</b></div>
    </div>
    <div class="tt-meta">Challenge: <code>${challenge}</code></div>`;
}

// ── Embedded cap-usage renderer ────────────────────────────────────────────

function renderEmbeddedCaps(m) {
  const el = document.getElementById('foundry-emb-caps');
  if (!el) return;
  const r = m.runtime;
  // Pre-tick fallback: pull static caps from the tier table so the panel shows
  // meaningful "0 / cap" bars even before the scheduler first runs reload.
  const tier = (window.EMBEDDED_TIERS || {})[m.config.tier] ||
               (window.EMBEDDED_TIERS || {}).M || { maxInst: 1, maxData: 1, cyclesPerTick: 0 };
  const ic = r.insUsed|0,  iC = (r.insCap|0)  || tier.maxInst;
  const dc = r.dataUsed|0, dC = (r.dataCap|0) || tier.maxData;
  const cb = (r.cycleBudget|0) || tier.cyclesPerTick;
  const insPct  = Math.min(100, (ic / iC) * 100);
  const dataPct = Math.min(100, (dc / dC) * 100);
  const insOver  = ic > iC;
  const dataOver = dc > dC;
  el.innerHTML = `
    <div class="emb-cap${insOver ? ' over' : ''}">
      <div class="emb-cap-lbl"><span>Instructions</span><b>${ic} / ${iC}</b></div>
      <div class="emb-cap-bar"><div class="emb-cap-fill" style="width:${insPct}%"></div></div>
    </div>
    <div class="emb-cap${dataOver ? ' over' : ''}">
      <div class="emb-cap-lbl"><span>Data bytes</span><b>${dc} / ${dC}</b></div>
      <div class="emb-cap-bar"><div class="emb-cap-fill" style="width:${dataPct}%"></div></div>
    </div>
    <div class="emb-cap-meta">Fixed budget: <code>${cb}</code> instructions / tick (ignores global Speed)</div>`;
}

// ── Probe trace renderer ────────────────────────────────────────────────────

function _hex32(v) { return (v >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
function _hex8(v)  { return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }

function renderProbeTrace(m) {
  const host = document.getElementById('foundry-probe-trace');
  if (!host) return;
  const trace = m.runtime.trace || [];
  if (!m.config.target) {
    host.innerHTML = `<div class="probe-empty">Select a machine to watch.</div>`;
    return;
  }
  if (!trace.length) {
    host.innerHTML = `<div class="probe-empty">No samples yet — hit Run.</div>`;
    return;
  }
  // Show last 30 rows newest-first. Render columns for IP, EAX, ECX, EDX, flags,
  // and (if memAddr set) the memory window.
  const rows = trace.slice(-30).reverse();
  const hasMem = rows.some(r => r.mem && r.mem.length);
  const memHead = hasMem ? `<th>mem</th>` : '';
  let body = '';
  let prev = null;
  for (const r of rows) {
    const cls = (key, sub) => prev && (sub ? prev[key]?.[sub] : prev[key]) !== (sub ? r[key][sub] : r[key]) ? ' chg' : '';
    body += `<tr>
      <td class="t">${r.tick}</td>
      <td class="ip${cls('ip')}">${r.ip}</td>
      <td class="r${cls('regs','eax')}">${_hex32(r.regs.eax)}</td>
      <td class="r${cls('regs','ecx')}">${_hex32(r.regs.ecx)}</td>
      <td class="r${cls('regs','edx')}">${_hex32(r.regs.edx)}</td>
      <td class="r${cls('regs','esp')}">${_hex32(r.regs.esp)}</td>
      <td class="f${cls('flags','zf')}">${r.flags.zf?'Z':'·'}${r.flags.cf?'C':'·'}${r.flags.sf?'S':'·'}${r.flags.of?'O':'·'}</td>
      ${hasMem ? `<td class="m">${(r.mem||[]).map(b => _hex8(b.byte)).join(' ')}</td>` : ''}
    </tr>`;
    prev = r;
  }
  host.innerHTML = `
    <table class="probe-table">
      <thead><tr>
        <th>t</th><th>ip</th><th>eax</th><th>ecx</th><th>edx</th><th>esp</th><th>flg</th>${memHead}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

// ── Per-machine editor (single CM, retargeted) ──────────────────────────────

let fEditorMid = null;
function ensureFoundryEditor(m) {
  const host = document.getElementById('foundry-editor-host');
  if (!host) return;
  if (!fCm) {
    fCm = CodeMirror(host, {
      mode: 'nasm',
      theme: 'nasm-dark',
      lineNumbers: true,
      tabSize: 4,
      indentWithTabs: false,
      lineWrapping: false,
      extraKeys: {
        Tab: cm => cm.replaceSelection('    '),
        'Ctrl-S': () => { commitEditorToMachine(); }
      }
    });
    fCm.on('blur', commitEditorToMachine);
    fCm.on('change', () => {
      // Defer commit on changes — commit on blur or run.
    });
  } else {
    // Re-parent if needed.
    if (fCm.getWrapperElement().parentNode !== host) {
      host.appendChild(fCm.getWrapperElement());
      fCm.refresh();
    }
  }
  fEditorMid = m.id;
  fCm.setValue(m.code || '');
  fCm.clearHistory();
}
function commitEditorToMachine() {
  if (!fCm || !fEditorMid || !fWorld) return;
  const m = fWorld.machines.get(fEditorMid);
  if (!m) return;
  const code = fCm.getValue();
  if (code !== m.code) {
    m.code = code;
    m.needsReload = true;
    saveWorld();
  }
}

// ── Interactions ────────────────────────────────────────────────────────────

function attachEventHandlers() {
  if (fWrap._foundryHandlersAttached) return;
  fWrap._foundryHandlersAttached = true;

  fPalette.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (!item) return;
    fPalette.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    fPlace = item.getAttribute('data-type');
    fStatus.textContent = `Place mode — click a grid cell to drop ${fPlace}.`;
  });

  fGrid.addEventListener('click', (e) => {
    // Port click? Wiring.
    const port = e.target.closest('.port');
    if (port) { onPortClick(port); return; }
    const machineEl = e.target.closest('.foundry-machine');
    if (machineEl) {
      fSelected = machineEl.getAttribute('data-mid');
      fPlace = null;
      fPalette.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active'));
      renderAll();
      return;
    }
    const cell = e.target.closest('.foundry-cell');
    if (!cell) return;
    if (!fPlace) return;
    const x = +cell.getAttribute('data-x');
    const y = +cell.getAttribute('data-y');
    if (fWorld.machineAt(x, y)) { fStatus.textContent = 'Cell occupied.'; return; }
    const m = FoundryWorld.makeMachine(fPlace, x, y);
    fWorld.addMachine(m);
    fSelected = m.id;
    fPlace = null;
    fPalette.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active'));
    saveWorld();
    renderAll();
  });

  fWires.addEventListener('click', (e) => {
    const path = e.target.closest('.wire');
    if (!path) return;
    const idx = +path.getAttribute('data-idx');
    if (confirm('Delete this wire?')) {
      fWorld.removeWire(idx);
      saveWorld();
      renderAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!fWrap || fWrap.style.display === 'none') return;
    if (e.key === 'Escape') {
      fPlace = null; fPendingWire = null;
      fPalette.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active'));
      fStatus.textContent = '';
      renderWires();
    }
  });

  fRunBtn?.addEventListener('click', () => { commitEditorToMachine(); startLoop(); });
  fPauseBtn?.addEventListener('click', pauseLoop);
  fStepBtn?.addEventListener('click', () => { commitEditorToMachine(); stepOnce(); });
  fResetBtn?.addEventListener('click', () => { commitEditorToMachine(); resetRuntime(); });
  fSpeedSel?.addEventListener('change', () => { fSpeed = parseInt(fSpeedSel.value, 10) || 1; });

  fExportBtn?.addEventListener('click', exportWorldJson);
  fImportBtn?.addEventListener('click', () => fImportInput.click());
  fImportInput?.addEventListener('change', importWorldJson);
  fClearBtn?.addEventListener('click', () => {
    if (!confirm('Clear the world (delete all machines and wires)?')) return;
    pauseLoop();
    fWorld = new FoundryWorld.World();
    fSelected = null;
    saveWorld();
    renderAll();
  });
}

function onPortClick(portEl) {
  const id    = portEl.getAttribute('data-mid');
  const dir   = portEl.getAttribute('data-pdir');
  const port  = +portEl.getAttribute('data-port');
  if (dir === 'out') {
    fPendingWire = { id, port };
    fStatus.textContent = `Now click an input port (esc to cancel).`;
    renderWires();
  } else if (dir === 'in' && fPendingWire) {
    if (fPendingWire.id === id) { fPendingWire = null; renderWires(); return; }
    fWorld.addWire(fPendingWire, { id, port });
    fPendingWire = null;
    fStatus.textContent = '';
    saveWorld();
    renderAll();
  }
}

// ── Import / Export ─────────────────────────────────────────────────────────

function exportWorldJson() {
  const data = JSON.stringify(fWorld.serialize(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'nasm-foundry-world.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importWorldJson(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const json = JSON.parse(r.result);
      pauseLoop();
      fWorld = FoundryWorld.World.deserialize(json);
      fSelected = null;
      saveWorld();
      renderAll();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  r.readAsText(f);
  e.target.value = '';
}

// ── Palette ─────────────────────────────────────────────────────────────────

function renderPalette() {
  if (!fPalette) return;
  fPalette.innerHTML = Object.entries(MACHINE_TYPES).map(([type, def]) => `
    <button class="palette-item" data-type="${type}" title="${def.name}">
      <span class="palette-glyph" style="color:${def.color}">${def.glyph}</span>
      <span class="palette-name">${def.name}</span>
      <span class="palette-ports">${def.inputs}→${def.outputs}</span>
    </button>
  `).join('');
}

// ── Seed: drop a starter world if there's no save yet ───────────────────────

function seedDemoWorld() {
  const w = new FoundryWorld.World();
  const src = FoundryWorld.makeMachine('source',    1, 3, { config: { pattern: 'count', from: 1, to: 64, cadence: 1 } });
  const proc = FoundryWorld.makeMachine('processor', 5, 3);
  const sink = FoundryWorld.makeMachine('sink',      9, 3);
  w.addMachine(src); w.addMachine(proc); w.addMachine(sink);
  w.addWire({ id: src.id, port: 0 },  { id: proc.id, port: 0 });
  w.addWire({ id: proc.id, port: 0 }, { id: sink.id, port: 0 });
  return w;
}

// ── Public show/hide ────────────────────────────────────────────────────────

window.showFoundry = function () {
  resolveFoundryDom();
  if (!fWrap) return;
  fWrap.style.display = '';
  if (!fWorld) {
    fWorld = loadSavedWorld() || seedDemoWorld();
    loadBadges();
  }
  renderPalette();
  attachEventHandlers();
  renderAll();
  // SVG sizing depends on real layout; refresh once after paint.
  requestAnimationFrame(() => renderWires());
};

window.hideFoundry = function () {
  if (fWrap) fWrap.style.display = 'none';
  pauseLoop();
};
