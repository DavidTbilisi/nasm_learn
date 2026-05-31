'use strict';

(function () {

// ── Rover Grid ──────────────────────────────────────────────────────────────
// An 8×8 grid. Rover walks, turns, scans tiles ahead/sides, and picks up
// items. Syscalls live in the 0x200s.
//
//   eax=0x200  rover_step → eax = 1 if moved, 0 if blocked
//   eax=0x201  rover_turn → ebx = 0 left / 1 right
//   eax=0x202  rover_scan → ebx = 0 ahead / 1 right / 2 back / 3 left
//                          eax = tile id at that relative cell
//   eax=0x203  rover_act  → eax = 1 if picked up an item, 0 otherwise
//   eax=0x204  rover_pos  → eax = (y<<8)|x, ebx = facing (0=N 1=E 2=S 3=W)
//
// Tile IDs returned by rover_scan: 0 empty, 1 wall (or OOB), 2 goal, 3 item.

const STEP = 0x200, TURN = 0x201, SCAN = 0x202, ACT = 0x203, POS = 0x204;

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function parseGrid(rows) {
  const w = rows[0].length;
  const h = rows.length;
  const grid = [];
  let rover = null;
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    for (let x = 0; x < w; x++) {
      const c = r[x];
      let t = 0;
      if (c === '#') t = 1;
      else if (c === 'F') t = 2;
      else if (c === '*') t = 3;
      else if ('R>v<^'.includes(c)) {
        rover = { x, y, facing: { R: 1, '>': 1, v: 2, '<': 3, '^': 0 }[c] };
      }
      grid.push(t);
    }
  }
  return { w, h, grid, rover };
}

function makeWorld(rows) {
  const g = parseGrid(rows);
  return {
    w: g.w, h: g.h, grid: g.grid,
    rover: g.rover,
    inventory: [],
    visited: new Set([`${g.rover.x},${g.rover.y}`]),
    trail: [{ x: g.rover.x, y: g.rover.y }],
    goal: findGoalIn(g.grid, g.w, g.h),
  };
}

function findGoalIn(grid, w, h) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (grid[y * w + x] === 2) return { x, y };
  return null;
}

function tileAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return 1;
  return world.grid[y * world.w + x];
}

function installSyscalls(sim, world) {
  sim.syscallTable[STEP] = (s) => {
    const r = world.rover;
    const nx = r.x + DX[r.facing], ny = r.y + DY[r.facing];
    if (tileAt(world, nx, ny) === 1) { s.regs.eax = 0; return; }
    r.x = nx; r.y = ny;
    world.visited.add(`${nx},${ny}`);
    world.trail.push({ x: nx, y: ny });
    s.regs.eax = 1;
  };
  sim.syscallTable[TURN] = (s) => {
    const right = (s.regs.ebx & 1) === 1;
    world.rover.facing = (world.rover.facing + (right ? 1 : 3)) & 3;
  };
  sim.syscallTable[SCAN] = (s) => {
    const off = s.regs.ebx & 3;
    const f = (world.rover.facing + off) & 3;
    const nx = world.rover.x + DX[f], ny = world.rover.y + DY[f];
    s.regs.eax = tileAt(world, nx, ny);
  };
  sim.syscallTable[ACT] = (s) => {
    const r = world.rover;
    const idx = r.y * world.w + r.x;
    if (world.grid[idx] === 3) {
      world.grid[idx] = 0;
      world.inventory.push({ x: r.x, y: r.y });
      s.regs.eax = 1;
    } else {
      s.regs.eax = 0;
    }
  };
  sim.syscallTable[POS] = (s) => {
    s.regs.eax = ((world.rover.y & 0xFF) << 8) | (world.rover.x & 0xFF);
    s.regs.ebx = world.rover.facing & 3;
  };
}

// ── Validators ──────────────────────────────────────────────────────────────

function checkReachGoal(world) {
  const g = world.goal;
  if (!g) return { ok: false, message: 'No goal on this map.' };
  if (world.rover.x !== g.x || world.rover.y !== g.y) {
    return { ok: false, message:
      `Rover is at (${world.rover.x},${world.rover.y}); needs to be on the flag at (${g.x},${g.y}).` };
  }
  return { ok: true, message: 'Rover reached the flag.' };
}

function checkCollectAll(world) {
  let left = 0;
  for (const t of world.grid) if (t === 3) left++;
  if (left > 0) return { ok: false, message: `${left} item(s) still uncollected.` };
  return { ok: true, message: 'All items collected.' };
}

// ── Levels ──────────────────────────────────────────────────────────────────

const LEVELS = [
  {
    id: 'walk',
    title: '1 · Stroll east',
    teaches: ['L1 registers', 'L3 control flow', 'L5 loops'],
    intro: 'Rover faces east. The flag is 5 tiles east. Step forward 5 times, then exit.',
    hint: 'Each int 0x80 with eax=0x200 (rover_step) moves one tile. Use ecx as a countdown with dec/jnz.',
    par: 30,
    starter:
`_start:
  ; TODO: step forward 5 times, then exit.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  mov ecx, 5
walk:
  mov eax, 0x200          ; rover_step
  int 0x80
  dec ecx
  jnz walk
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld([
      'R....F..',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]),
    validate: checkReachGoal,
  },

  {
    id: 'lturn',
    title: '2 · East then south',
    teaches: ['L3 control flow', 'L5 loops'],
    intro: 'Step east 3 tiles, turn right, then step south 3 tiles to reach the flag.',
    hint: 'rover_turn with ebx=1 turns right, ebx=0 turns left. North=0, East=1, South=2, West=3.',
    par: 40,
    starter:
`_start:
  ; TODO: 3 east, turn right, 3 south.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  mov ecx, 3
east_leg:
  mov eax, 0x200
  int 0x80
  dec ecx
  jnz east_leg
  mov eax, 0x201          ; turn right
  mov ebx, 1
  int 0x80
  mov ecx, 3
south_leg:
  mov eax, 0x200
  int 0x80
  dec ecx
  jnz south_leg
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld([
      'R.......',
      '........',
      '........',
      '...F....',
      '........',
      '........',
      '........',
      '........',
    ]),
    validate: checkReachGoal,
  },

  {
    id: 'pick',
    title: '3 · Pickup line',
    teaches: ['L3 control flow', 'L5 loops'],
    intro: 'Crystals scattered on the row ahead. Step + rover_act after each move. The level is solved when no items remain.',
    hint: 'rover_act picks up an item if standing on one (eax=1 picked, 0 if not). Cheapest pattern: step, act, repeat.',
    par: 60,
    starter:
`_start:
  ; TODO: march forward, picking up everything in your path.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
  mov ecx, 7
sweep:
  mov eax, 0x200
  int 0x80
  mov eax, 0x203          ; rover_act
  int 0x80
  dec ecx
  jnz sweep
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld([
      'R.*.*.*.',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]),
    validate: checkCollectAll,
  },

  {
    id: 'detour',
    title: '4 · Scan before stepping',
    teaches: ['L3 control flow', 'L8 bitwise', 'L9 addressing'],
    intro: 'A wall stands between you and the flag. Use rover_scan to look ahead each tick. If wall (id 1), detour. If goal (id 2), step in and exit. Otherwise step.',
    hint: 'Tile IDs: 0 empty, 1 wall/OOB, 2 goal, 3 item. Branch on the value rover_scan returns in eax.',
    par: 90,
    starter:
`_start:
  ; TODO: loop — scan ahead, branch on tile id.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
main:
  mov eax, 0x202          ; scan ahead
  xor ebx, ebx
  int 0x80
  cmp eax, 2
  je  finish
  cmp eax, 1
  je  detour
  mov eax, 0x200          ; step forward
  int 0x80
  jmp main
finish:
  mov eax, 0x200          ; step onto flag
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80
detour:
  ; R, step, L, step, step, L, step, R  → walks 1 down, 2 east, 1 up
  mov eax, 0x201
  mov ebx, 1
  int 0x80
  mov eax, 0x200
  int 0x80
  mov eax, 0x201
  xor ebx, ebx
  int 0x80
  mov eax, 0x200
  int 0x80
  mov eax, 0x200
  int 0x80
  mov eax, 0x201
  xor ebx, ebx
  int 0x80
  mov eax, 0x200
  int 0x80
  mov eax, 0x201
  mov ebx, 1
  int 0x80
  jmp main
`,
    makeWorld: () => makeWorld([
      'R.#...F.',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]),
    validate: checkReachGoal,
  },

  {
    id: 'coords',
    title: '5 · Packed coordinates',
    teaches: ['L8 bitwise', 'L9 addressing', 'L10 signed math'],
    intro: 'rover_pos returns (y<<8)|x in eax. Walk east until x==5, turn south, walk until y==5. Use SHR and AND to peel the bytes apart.',
    hint: 'Low byte (and eax, 0xFF) = x. High byte (shr eax, 8) = y. Compare and stop at 5.',
    par: 120,
    starter:
`_start:
  ; TODO: walk east to x==5, then south to y==5.
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    solution:
`_start:
east_loop:
  mov eax, 0x204          ; rover_pos
  int 0x80
  and eax, 0xFF
  cmp eax, 5
  jge turn_south
  mov eax, 0x200
  int 0x80
  jmp east_loop
turn_south:
  mov eax, 0x201
  mov ebx, 1
  int 0x80
south_loop:
  mov eax, 0x204
  int 0x80
  shr eax, 8
  cmp eax, 5
  jge done
  mov eax, 0x200
  int 0x80
  jmp south_loop
done:
  mov eax, 1
  xor ebx, ebx
  int 0x80
`,
    makeWorld: () => makeWorld([
      'R.......',
      '........',
      '........',
      '........',
      '........',
      '.....F..',
      '........',
      '........',
    ]),
    validate: checkReachGoal,
  },
];

// ── Renderer ────────────────────────────────────────────────────────────────

const FACE_NAMES = ['N', 'E', 'S', 'W'];

function render(world, root) {
  if (!world) { root.innerHTML = ''; return; }
  const cell = 38;
  const W = world.w * cell;
  const H = world.h * cell;

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="rover-svg">`;

  // Cell backgrounds + grid lines
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const t = world.grid[y * world.w + x];
      const cx = x * cell, cy = y * cell;
      let fill = 'var(--surface)';
      if (t === 1) fill = 'var(--surface3)';
      svg += `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}"
        fill="${fill}" stroke="var(--border)" stroke-width="0.5"/>`;
      if (t === 1) {
        // wall hash pattern
        svg += `<line x1="${cx}" y1="${cy}" x2="${cx+cell}" y2="${cy+cell}"
          stroke="var(--border-hi)" stroke-width="1"/>`;
        svg += `<line x1="${cx+cell}" y1="${cy}" x2="${cx}" y2="${cy+cell}"
          stroke="var(--border-hi)" stroke-width="1"/>`;
      }
    }
  }

  // Trail dots (visited cells excluding current rover cell)
  for (const v of world.visited) {
    const [vx, vy] = v.split(',').map(Number);
    if (vx === world.rover.x && vy === world.rover.y) continue;
    svg += `<circle cx="${vx*cell + cell/2}" cy="${vy*cell + cell/2}" r="2.5"
      fill="var(--amber)" opacity="0.4"/>`;
  }

  // Items (crystals)
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.grid[y * world.w + x] !== 3) continue;
      const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
      svg += `<polygon points="${cx},${cy-9} ${cx+8},${cy} ${cx},${cy+9} ${cx-8},${cy}"
        fill="hsl(170,80%,55%)" stroke="hsl(170,90%,28%)" stroke-width="1.5"/>`;
      svg += `<polygon points="${cx},${cy-4} ${cx+4},${cy} ${cx},${cy+4} ${cx-4},${cy}"
        fill="hsl(170,95%,82%)" opacity="0.8"/>`;
    }
  }

  // Goal flag
  if (world.goal) {
    const gx = world.goal.x * cell, gy = world.goal.y * cell;
    svg += `<line x1="${gx+cell*0.32}" y1="${gy+cell*0.18}" x2="${gx+cell*0.32}" y2="${gy+cell*0.82}"
      stroke="var(--p-hi)" stroke-width="1.5"/>`;
    svg += `<polygon points="${gx+cell*0.32},${gy+cell*0.18} ${gx+cell*0.32},${gy+cell*0.5} ${gx+cell*0.78},${gy+cell*0.34}"
      fill="var(--red)" stroke="var(--p-hi)" stroke-width="1"/>`;
  }

  // Rover (triangle pointing in facing direction)
  const r = world.rover;
  const rx = r.x * cell + cell / 2, ry = r.y * cell + cell / 2;
  const facingRotation = { 0: -90, 1: 0, 2: 90, 3: 180 }[r.facing];
  svg += `<g transform="translate(${rx} ${ry}) rotate(${facingRotation})">
    <circle r="${cell*0.36}" fill="var(--surface2)" stroke="var(--amber)" stroke-width="2"/>
    <polygon points="${cell*0.30},0 ${-cell*0.18},${-cell*0.20} ${-cell*0.18},${cell*0.20}"
      fill="var(--amber)" stroke="var(--p-hi)" stroke-width="0.8"/>
    <circle r="2" fill="var(--p-hi)"/>
  </g>`;

  svg += `</svg>`;

  const inv = world.inventory.length;
  let invCount = 0;
  for (const t of world.grid) if (t === 3) invCount++;
  const remaining = invCount;

  root.innerHTML = `
    <div class="rover-wrap">
      <div class="rover-readout">
        <div><span class="ro-label">pos</span> (${r.x},${r.y})</div>
        <div><span class="ro-label">facing</span> ${FACE_NAMES[r.facing]}</div>
        <div><span class="ro-label">picked</span> ${inv}</div>
        ${remaining ? `<div><span class="ro-label">left</span> ${remaining}</div>` : ''}
      </div>
      <div class="rover-grid-wrap">${svg}</div>
    </div>
  `;
}

// ── Module export ───────────────────────────────────────────────────────────

const RoverGame = {
  id: 'rover',
  name: 'Rover Grid',
  blurb: 'Navigate an 8×8 grid — scan, turn, step, collect.',
  levels: LEVELS,
  installSyscalls,
  render,
};

if (typeof window !== 'undefined') window.RoverGame = RoverGame;
if (typeof module !== 'undefined' && module.exports) module.exports = RoverGame;

})();
