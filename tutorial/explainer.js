'use strict';

// Step-by-step isometric explainers, one per lesson. Plain SVG, no deps.
// A step is { title, text, code, scene }; a scene is a flat list of items.
// Items keep their id across steps, so a cube that moves between steps glides.

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const S  = 34;                       // one grid unit, in SVG px
  const CX = Math.cos(Math.PI / 6);
  const SY = 0.5;
  const iso = (x, y, z = 0) => [(x - y) * CX * S, (x + y) * SY * S - z * S];
  const r   = n => Math.round(n * 10) / 10;
  const pts = a => a.map(p => p.map(r).join(',')).join(' ');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fit = (text, room, max) => Math.min(max, room / (0.62 * Math.max(1, String(text).length)));

  // ── Shapes (local coordinates; the item's group is translated to its anchor) ──

  function chip(text, [ax, ay], o = {}) {
    const fs = 11, w = String(text).length * fs * 0.62 + 12, h = 18;
    const cx = ax + (o.dx ?? 0), cy = ay + (o.dy ?? (o.below ? 24 : -24));
    return {
      html: `<g class="xp-chip tone-${o.tone || 'base'}">` +
        `<line x1="${r(ax)}" y1="${r(ay)}" x2="${r(cx)}" y2="${r(cy)}"/><circle cx="${r(ax)}" cy="${r(ay)}" r="2"/>` +
        `<rect x="${r(cx - w / 2)}" y="${r(cy - h / 2)}" width="${r(w)}" height="${h}" rx="4"/>` +
        `<text x="${r(cx)}" y="${r(cy)}" font-size="${fs}">${esc(text)}</text></g>`,
      ext: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [ax, ay]],
    };
  }

  const poly = (cls, ps) => `<polygon class="${cls}" points="${pts(ps)}"/>`;

  const SHAPES = {
    cube(it) {
      const { w = 0.8, d = 0.8, h = 0.8, text = '' } = it;
      const c = [iso(0, 0, h), iso(w, 0, h), iso(w, d, h), iso(0, d, h), iso(0, d, 0), iso(w, d, 0), iso(w, 0, 0)];
      let html = poly('t', c.slice(0, 4)) + poly('l', [c[4], c[5], c[2], c[3]]) + poly('r', [c[6], c[5], c[2], c[1]]);
      if (text !== '') {
        // Value printed on the left face, skewed into the face's plane.
        const [tx, ty] = iso(w / 2, d, h / 2);
        const fs = fit(text, w * S * 0.86, Math.min(15, h * S * 0.62));
        html += `<text class="xp-v" transform="matrix(${r(CX * 100) / 100} ${SY} 0 1 ${r(tx)} ${r(ty)})" font-size="${r(fs)}">${esc(text)}</text>`;
      }
      let ext = c;
      if (it.tag) {
        const t = it.tagBelow
          ? chip(it.tag, iso(w / 2, d + 0.1, -0.4), { tone: it.tagTone, below: true })
          : chip(it.tag, iso(w / 2, d / 2, h), { tone: it.tagTone });
        html += t.html;
        ext = ext.concat(t.ext);
      }
      return { html: `<g class="tone-${it.tone || 'base'}">${html}</g>`, ext };
    },
    tile(it) {
      const { w = 1, d = 1, text = '' } = it;
      const c = [iso(0.06, 0.06), iso(w - 0.06, 0.06), iso(w - 0.06, d - 0.06), iso(0.06, d - 0.06)];
      const [tx, ty] = iso(w / 2, d / 2);
      return {
        html: `<g class="tone-${it.tone || 'base'}">${poly('f', c)}` +
          (text !== '' ? `<text x="${r(tx)}" y="${r(ty)}" font-size="10">${esc(text)}</text>` : '') + '</g>',
        ext: c,
      };
    },
    label(it) {
      const fs = fit(it.text, (it.room ?? 1) * S * 0.92, 10);
      return {
        html: `<text class="xp-lbl" transform="matrix(${r(CX * 100) / 100} ${SY} 0 1 0 0)" font-size="${r(fs)}">${esc(it.text)}</text>`,
        ext: [[-20, -10], [20, 14]],
      };
    },
    tag(it) { return chip(it.text, [0, 0], it); },
    arrow(it) {
      const a = iso(...it.from), b = iso(...it.to);
      const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - (it.lift ?? 30)];
      return {
        html: `<path pathLength="1" marker-end="url(#xp-head)" d="M${r(a[0])} ${r(a[1])} Q${r(c[0])} ${r(c[1])} ${r(b[0])} ${r(b[1])}"/>`,
        ext: [a, b, c],
      };
    },
  };

  function build(it) {
    const { id, x, y, z, ...rest } = it;
    const shape = SHAPES[it.k](it);
    const pos = it.k === 'arrow' ? [0, 0] : iso(x, y, z ?? 0);
    return { id, k: it.k, pos, sig: JSON.stringify(rest), html: shape.html, ext: shape.ext.map(([ex, ey]) => [ex + pos[0], ey + pos[1]]) };
  }

  const DEFS = `
    <pattern id="xp-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect class="xp-hatch-bg" width="5" height="5"/><line class="xp-hatch-ln" x1="0" y1="0" x2="0" y2="5"/></pattern>
    <pattern id="xp-hatch-bad" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect class="xp-hatch-bad-bg" width="5" height="5"/><line class="xp-hatch-bad-ln" x1="0" y1="0" x2="0" y2="5"/></pattern>
    <pattern id="xp-hatch-slab" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect class="xp-hatch-slab-bg" width="4" height="4"/><line class="xp-hatch-slab-ln" x1="0" y1="0" x2="0" y2="4"/></pattern>
    <pattern id="xp-grid" x="${r(-CX * S)}" y="0" width="${r(2 * CX * S)}" height="${S}" patternUnits="userSpaceOnUse">
      <path d="M${r(CX * S)} 0L${r(2 * CX * S)} ${S / 2}L${r(CX * S)} ${S}L0 ${S / 2}Z"/></pattern>
    <marker id="xp-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10Z"/></marker>`;

  // ── Mount one explainer into host ─────────────────────────────────────────────

  function render(host, lessonId) {
    const steps = EXPLAINERS[lessonId];
    if (!host) return;
    host.style.display = steps ? '' : 'none';
    host.innerHTML = '';
    if (!steps) return;

    const built = steps.map(st => [st.scene].flat(Infinity).filter(Boolean).map(build));
    const xs = [], ys = [];
    built.flat().forEach(o => o.ext.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
    const pad = 12;
    const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2].map(r);

    host.innerHTML = `
      <div class="section-label">Walkthrough</div>
      <div class="xp">
        <div class="xp-stage">
          <svg class="xp-svg" viewBox="${vb.join(' ')}" role="img">
            <defs>${DEFS}</defs>
            <rect class="xp-floor" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="url(#xp-grid)"/>
            <g class="xp-layer"></g>
          </svg>
        </div>
        <div class="xp-card" aria-live="polite">
          <div class="xp-meta"></div>
          <div class="xp-title"></div>
          <p class="xp-text"></p>
          <pre class="xp-code"></pre>
        </div>
        <div class="xp-nav">
          <button type="button" class="btn btn-secondary xp-prev">← Back</button>
          <div class="xp-dots">${steps.map((s, i) => `<button type="button" class="xp-dot" aria-label="Step ${i + 1}: ${esc(s.title)}"></button>`).join('')}</div>
          <button type="button" class="btn btn-primary xp-next">Next →</button>
        </div>
      </div>`;

    const $ = s => host.querySelector(s);
    const svg = $('.xp-svg'), layer = $('.xp-layer');
    const dots = [...host.querySelectorAll('.xp-dot')];
    const live = new Map();
    let cur = 0;

    function show(i) {
      cur = i;
      const st = steps[i];
      const seen = new Set(), fresh = [];
      let prev = null;
      for (const o of built[i]) {
        seen.add(o.id);
        let el = live.get(o.id);
        if (!el) {
          el = document.createElementNS(NS, 'g');
          live.set(o.id, el);
          el.style.opacity = 0;
          el.style.transform = `translate(${r(o.pos[0])}px, ${r(o.pos[1] - (o.k === 'cube' ? 40 : 0))}px)`;
          fresh.push(el);
        }
        clearTimeout(el._out);
        el.classList.remove('xp-out');
        if (el.dataset.sig !== o.sig) {
          el.innerHTML = o.html;
          el.dataset.sig = o.sig;
          el.setAttribute('class', `xp-item xp-${o.k}`);
        }
        // Keep paint order = scene order, without moving nodes that are already in place.
        let want = prev ? prev.nextSibling : layer.firstChild;
        while (want && want.classList.contains('xp-out')) want = want.nextSibling;
        if (want !== el) layer.insertBefore(el, want);
        prev = el;
        o.el = el;
      }
      for (const [id, el] of live) {
        if (seen.has(id) || el.classList.contains('xp-out')) continue;
        el.classList.add('xp-out');
        el.style.opacity = 0;
        el._out = setTimeout(() => { el.remove(); live.delete(id); }, 400);
      }
      if (fresh.length) layer.getBoundingClientRect();  // commit start state so the drop-in animates
      for (const o of built[i]) {
        o.el.style.transform = `translate(${r(o.pos[0])}px, ${r(o.pos[1])}px)`;
        o.el.style.opacity = '';
      }

      svg.setAttribute('aria-label', `${st.title}. ${st.text.replace(/<[^>]+>/g, '')}`);
      $('.xp-meta').textContent = `Step ${i + 1} / ${steps.length}`;
      $('.xp-title').textContent = st.title;
      $('.xp-text').innerHTML = st.text;
      $('.xp-code').textContent = st.code || '';
      $('.xp-code').style.display = st.code ? '' : 'none';
      $('.xp-prev').disabled = i === 0;
      $('.xp-next').textContent = i === steps.length - 1 ? 'Again ↺' : 'Next →';
      dots.forEach((d, k) => d.classList.toggle('active', k === i));
    }

    $('.xp-prev').addEventListener('click', () => cur > 0 && show(cur - 1));
    $('.xp-next').addEventListener('click', () => show((cur + 1) % steps.length));
    dots.forEach((d, k) => d.addEventListener('click', () => show(k)));
    show(0);
  }

  // ── Scene helpers ─────────────────────────────────────────────────────────────

  const C = (id, x, y, text, o = {}) => ({ k: 'cube', id, x: x + 0.1, y: y + 0.1, text, ...o });     // cube in slot (x, y)
  const R = (id, x, y, name, text, o = {}) => C(id, x, y, text, { w: 1.8, tag: name, ...o });      // register: wide cube + name
  const T = (id, x, y, o = {}) => ({ k: 'tile', id, x, y, ...o });
  const G = (id, x, y, z, text, o = {}) => ({ k: 'tag', id, x, y, z, text, ...o });
  const L = (id, x, y, text, o = {}) => ({ k: 'label', id, x, y, z: -0.2, text, ...o });          // on a slab's front edge
  const A = (id, from, to, o = {}) => ({ k: 'arrow', id, from, to, ...o });
  const SLAB = (id, x, y, w, d = 1) => ({ k: 'cube', id, x, y, z: -0.4, w, d, h: 0.4, tone: 'slab' });
  const opt = (o, i) => (typeof o === 'function' ? o(i) : o);
  const row = (p, x0, y, vals, o = {}) => vals.map((v, i) => (v == null ? null : C(p + i, x0 + i, y, v, opt(o, i))));
  const tiles = (p, x0, y, n, o = {}) => Array.from({ length: n }, (_, i) => T(p + i, x0 + i, y, opt(o, i)));
  const labels = (p, x0, y, texts) => texts.map((t, i) => L(p + i, x0 + i + 0.5, y, t));
  const top = (x, y = 0, h = 0.8) => [x + 0.5, y + 0.5, h];          // top centre of the cube in slot (x, y)
  const regTop = (x, y) => [x + 1, y + 0.5, 0.8];                    // top centre of a register cube
  const name = (id, x, y, text) => G(id, x, y + 0.5, 0, text, { dx: -32, dy: -10 });  // chip left of a slab
  const hot = (cond) => (cond ? 'hot' : '');

  // ── Lessons ───────────────────────────────────────────────────────────────────

  const EXPLAINERS = {

    1: (() => {
      const base = [SLAB('s', 0, 0, 4), tiles('t', 0, 0, 4), labels('l', 0, 1, ['31–24', '23–16', '15–8', '7–0']), name('ne', 0, 0, 'EAX')];
      const eax = (v, hi = []) => row('e', 0, 0, v, i => ({ tone: hot(hi.includes(i)) }));
      return [
        { title: 'EAX is four bytes', code: 'mov eax, 0',
          text: 'A 32-bit register is four bytes side by side, read left to right like written hex. Byte 3 holds bits 31–24; byte 0 holds bits 7–0.',
          scene: [base, eax(['00', '00', '00', '00'])] },
        { title: 'Load a value', code: 'mov eax, 42',
          text: '42 is <b>0x2A</b>. It fits in byte 0, so MOV writes zeros into the three upper bytes. EAX = 0x0000002A.',
          scene: [base, eax(['00', '00', '00', '2A'], [3])] },
        { title: 'Copy into EBX', code: 'mov ebx, eax',
          text: 'EBX gets its own copy of all 32 bits. The registers are separate boxes: changing EAX later leaves EBX alone.',
          scene: [base, eax(['00', '00', '00', '2A']), SLAB('s2', 0, 2.2, 4), name('nb', 0, 2.2, 'EBX'),
            row('b', 0, 2.2, ['00', '00', '00', '2A'], i => ({ tone: hot(i === 3) })), A('cp', top(3), top(3, 2.2))] },
        { title: 'Write only AL', code: 'mov al, 0xAB',
          text: '<b>AL</b> is byte 0 of EAX. Writing it changes 8 bits and leaves the other 24 alone. EAX = 0x000000AB.',
          scene: [base, eax(['00', '00', '00', 'AB'], [3]), G('al', ...top(3), 'AL', { tone: 'hot' })] },
        { title: 'Write AH', code: 'mov ah, 0x01',
          text: '<b>AH</b> is byte 1. AH and AL together form <b>AX</b>, the low 16 bits. EAX is now 0x000001AB.',
          scene: [base, eax(['00', '00', '01', 'AB'], [2]), G('al', ...top(3), 'AL'), G('ah', ...top(2), 'AH', { tone: 'hot' }),
            G('ax', 3, 1, -0.4, 'AX = 0x01AB', { below: true })] },
      ];
    })(),

    2: (() => {
      const F = ['ZF', 'SF', 'CF', 'OF'];
      const REGS = [['edx', 'EDX', 0], ['eax', 'EAX', 2], ['ebx', 'EBX', 4], ['ecx', 'ECX', 6]];
      const regs = (v, hi = []) => [SLAB('s', 0, 0, 8),
        REGS.filter(([k]) => v[k] != null).map(([k, n, x]) => R(k, x, 0, n, v[k], { tone: hot(hi.includes(k)) }))];
      const flags = (set = []) => [SLAB('fs', 2, 2.2, 4), labels('fl', 2, 3.2, F),
        F.map((f, i) => [T('t' + f, 2 + i, 2.2, { text: set.includes(f) ? '' : '0' }),
          set.includes(f) && C('f' + f, 2 + i, 2.2, '1', { tone: 'hot', h: 0.5 })])];
      return [
        { title: 'Registers and flags', code: 'mov eax, 10\nmov ebx, 20',
          text: 'Two registers loaded. Below them sit four flag bits. Every arithmetic instruction rewrites them.',
          scene: [regs({ eax: '10', ebx: '20' }, ['eax', 'ebx']), flags()] },
        { title: 'ADD sets the flags', code: 'add eax, ebx',
          text: 'EAX = 30. Not zero (ZF=0), not negative (SF=0), no unsigned carry (CF=0), no signed overflow (OF=0).',
          scene: [regs({ eax: '30', ebx: '20' }, ['eax']), flags()] },
        { title: 'MUL needs two registers', code: 'mov eax, 6\nmov ecx, 7\nmul ecx',
          text: 'MUL writes a 64-bit product into the pair <b>EDX:EAX</b>. 6 × 7 = 42 fits in 32 bits, so EDX = 0. (EBX is 19 after the DEC.)',
          scene: [regs({ edx: '0', eax: '42', ebx: '19', ecx: '7' }, ['edx', 'eax']), flags()] },
        { title: 'Carry out of the top', code: 'mov eax, 0xFFFFFFFF\nadd eax, 1',
          text: 'The true sum needs 33 bits. The 33rd bit falls into <b>CF</b>, and the 32 bits left are all zero, so <b>ZF</b> = 1 too.',
          scene: [regs({ edx: '0', eax: '0', ebx: '19', ecx: '7' }, ['eax']), flags(['ZF', 'CF'])] },
        { title: 'XOR resets them', code: 'xor eax, eax',
          text: 'XOR clears CF and OF and sets ZF from the result. It is the shortest way to zero a register.',
          scene: [regs({ edx: '0', eax: '0', ebx: '19', ecx: '7' }, ['eax']), flags(['ZF'])] },
      ];
    })(),

    3: (() => {
      const track = (n, tone) => [SLAB('s2', 0, 2.2, 5), tiles('t', 0, 2.2, 5), labels('l', 0, 3.2, ['#1', '#2', '#3', '#4', '#5']),
        row('i', 0, 2.2, ['+5', '+4', '+3', '+2', '+1'].slice(0, n), { h: 0.5, tone })];
      const regs = (ecx, eax, hi) => [SLAB('s', 0, 0, 4), R('ecx', 0, 0, 'ECX', ecx, { tone: hi }), R('eax', 2, 0, 'EAX', eax, { tone: hi })];
      return [
        { title: 'Set up the counter', code: 'mov ecx, 5\nmov eax, 0',
          text: 'LOOP always counts with <b>ECX</b>. EAX will collect the sum.',
          scene: [regs('5', '0'), track(0)] },
        { title: 'First pass', code: 'add eax, ecx\nloop sum_loop',
          text: 'ADD adds the current ECX. LOOP then decrements ECX and jumps back while ECX is not zero.',
          scene: [regs('4', '5', 'hot'), track(1)] },
        { title: 'Three passes in', code: 'loop sum_loop   ; ECX = 2',
          text: '5 + 4 + 3 = 12 so far. Each pass leaves one smaller ECX for the next.',
          scene: [regs('2', '12', 'hot'), track(3)] },
        { title: 'Fall through', code: '; ECX = 0 → LOOP does not jump',
          text: 'ECX reached 0, so LOOP falls through to the next line. 5 + 4 + 3 + 2 + 1 = <b>15</b>.',
          scene: [regs('0', '15', 'hot'), track(5)] },
        { title: 'CMP + a conditional jump', code: 'mov ebx, 7\ncmp ebx, 10\njl  is_less',
          text: 'CMP computes 7 − 10 = −3 and keeps only the flags (SF=1, OF=0). <b>JL</b> jumps when SF ≠ OF, so it lands on is_less and EDX = 1.',
          scene: [SLAB('s', 0, 0, 4), R('ebx', 0, 0, 'EBX', '7'), R('edx', 2, 0, 'EDX', '1', { tone: 'hot' }),
            G('jl', ...regTop(2, 0), 'jl taken', { tone: 'hot', dx: 50, dy: -14 }), track(5, 'dim')] },
      ];
    })(),

    4: (() => {
      const base = [SLAB('s', 0, 0, 4), tiles('t', 0, 0, 4), labels('l', 0, 1, ['1000', '0FFC', '0FF8', '0FF4']), C('c', 0, 0, '…', { tone: 'dim' })];
      const esp = x => G('esp', ...top(x), 'ESP', { tone: 'hot' });
      const ebp = x => G('ebp', x + 0.5, 1, -0.4, 'EBP', { below: true });
      return [
        { title: 'Before the call', code: '; ESP = 0x1000',
          text: '<b>ESP</b> points at the top of the stack. The stack grows <b>down</b>, toward lower addresses (drawn to the right).',
          scene: [base, esp(0)] },
        { title: 'Push the argument', code: 'push 7',
          text: 'PUSH moves ESP down 4 bytes, then writes the value there.',
          scene: [base, C('arg', 1, 0, '7', { tone: 'hot' }), esp(1)] },
        { title: 'CALL pushes the return address', code: 'call square',
          text: 'CALL saves where to come back to, then jumps to square.',
          scene: [base, C('arg', 1, 0, '7'), C('ret', 2, 0, 'ret', { tone: 'hot' }), esp(2)] },
        { title: 'Build the frame', code: 'push ebp\nmov  ebp, esp',
          text: 'The callee saves the caller\'s EBP, then pins <b>EBP</b> here. ESP can move from now on; EBP stays put.',
          scene: [base, C('arg', 1, 0, '7'), C('ret', 2, 0, 'ret'), C('obp', 3, 0, 'ebp', { tone: 'hot' }), esp(3), ebp(3)] },
        { title: 'Read the argument', code: 'mov  eax, [ebp+8]\nimul eax, eax',
          text: 'EBP+4 is the return address, so the argument is at <b>EBP+8</b>. 7 × 7 = 49 lands in EAX.',
          scene: [base, C('arg', 1, 0, '7', { tone: 'hot' }), C('ret', 2, 0, 'ret'), C('obp', 3, 0, 'ebp'), esp(3), ebp(3),
            A('rd', top(3), top(1), { lift: 40 }), SLAB('s2', 0, 2.6, 2), R('eax', 0, 2.6, 'EAX', '49', { tone: 'hot', tagBelow: true })] },
        { title: 'Unwind', code: 'pop  ebp\nret\nadd  esp, 4',
          text: 'POP restores EBP, RET pops the return address into EIP, and the caller frees the argument (cdecl). The old values are not erased, just abandoned. EAX = 49.',
          scene: [base, C('arg', 1, 0, '7', { tone: 'dim' }), C('ret', 2, 0, 'ret', { tone: 'dim' }), C('obp', 3, 0, 'ebp', { tone: 'dim' }),
            esp(0), SLAB('s2', 0, 2.6, 2), R('eax', 0, 2.6, 'EAX', '49', { tagBelow: true })] },
      ];
    })(),

    5: (() => {
      const base = [SLAB('s', 0, 0, 6, 3), Array.from({ length: 3 }, (_, y) => tiles(`t${y}-`, 0, y, 6))];
      const read = text => G('rd', 0, 0, 0, text, { dx: 0, dy: -26 });
      const bar = v => ({ h: Math.min(1.6, 0.25 + Math.log2(v) * 0.2) });
      return [
        { title: 'Counted loop', code: 'mov ecx, 10\nmov eax, 0\ncount_loop: add eax, ecx\n            loop count_loop',
          text: 'Ten passes are coming. LOOP decrements ECX and jumps back until it reaches 0.',
          scene: [base, read('ECX = 10  EAX = 0')] },
        { title: 'Counted loop, done', code: '; EAX = 55',
          text: 'Each pass added the current ECX: 10 + 9 + … + 1 = <b>55</b>.',
          scene: [base, row('k', 0, 0, ['10', '9', '8', '7', '6'], { h: 0.4 }), row('m', 0, 1, ['5', '4', '3', '2', '1'], { h: 0.4, tone: 'hot' }),
            read('ECX = 0  EAX = 55')] },
        { title: 'While loop: test first', code: 'while_top: cmp ebx, 4\n           jl  while_done\n           shr ebx, 1\n           jmp while_top',
          text: 'Each pass halves EBX: 64 → 32 → 16 → 8 → 4 → 2. At 2 the test fails <b>before</b> the body runs again.',
          scene: [base, row('w', 0, 1, ['64', '32', '16', '8', '4', '2'], i => ({ ...bar([64, 32, 16, 8, 4, 2][i]), tone: hot(i === 5) })),
            read('EBX = 2')] },
        { title: 'Do-while: body first', code: 'do_top: inc edx\n        cmp edx, 5\n        jl  do_top',
          text: 'The body runs, then the test. It always runs at least once. EDX climbs to 5 and the loop exits.',
          scene: [base, row('d', 0, 1, ['1', '2', '3', '4', '5'], i => ({ h: 0.3 + i * 0.25, tone: hot(i === 4) })), read('EDX = 5')] },
        { title: 'Nested loops share ECX', code: 'push ecx\nmov  ecx, 4\ninner: inc esi\n       loop inner\npop  ecx\nloop outer',
          text: 'PUSH ECX saves the outer count, the inner loop reuses ECX for 4 passes, POP ECX brings it back. 3 × 4 = <b>12</b> passes.',
          scene: [base, [0, 1, 2].map(y => row(`n${y}-`, 0, y, [1, 2, 3, 4].map(c => String(y * 4 + c)), c => ({ h: 0.4, tone: hot(y === 2 && c === 3) }))),
            read('ESI = 12')] },
      ];
    })(),

    6: (() => {
      const mem = (tone) => [SLAB('s', 0, 0, 7), row('m', 0, 0, ['H', 'e', 'l', 'l', 'o', '…', '\\n'], { tone }), name('nm', 0, 0, 'msg')];
      const RG = [['eax', 'EAX', 0], ['ebx', 'EBX', 2], ['ecx', 'ECX', 4], ['edx', 'EDX', 6]];
      const regs = (v, notes, hi = []) => [SLAB('s2', 0, 3, 8),
        RG.filter(([k]) => v[k] != null).map(([k, n, x]) => R(k, x, 3, n, v[k], { tone: hi.includes(k) ? 'hot' : v.dim ? 'dim' : '' })),
        RG.map(([k, , x]) => notes[k] && L('n' + k, x + 1, 4, notes[k], { room: 2 }))];
      const kernel = (out) => [C('k', 8.3, 3, 'KERNEL', { w: 1.6, h: 1.1, tone: 'hot' }), G('out', 9.2, 3.6, 1.1, out, { tone: 'hot' })];
      return [
        { title: 'Data lives in .data', code: "msg     db 'Hello, World!', 0x0A\nmsg_len equ $ - msg",
          text: '<b>msg</b> is 14 bytes: the text plus a newline. The assembler computes msg_len = $ − msg = 14.',
          scene: [mem(), regs({}, {})] },
        { title: 'Pick the system call', code: 'mov eax, 4\nmov ebx, 1',
          text: '<b>EAX</b> selects the call: 4 is sys_write. <b>EBX</b> is the first argument: file descriptor 1, stdout.',
          scene: [mem(), regs({ eax: '4', ebx: '1' }, { eax: 'sys_write', ebx: 'stdout' }, ['eax', 'ebx'])] },
        { title: 'Point at the bytes', code: 'mov ecx, msg\nmov edx, msg_len',
          text: '<b>ECX</b> holds the <i>address</i> of msg, not the text. <b>EDX</b> says how many bytes to write.',
          scene: [mem('hot'), regs({ eax: '4', ebx: '1', ecx: '&msg', edx: '14' }, { eax: 'sys_write', ebx: 'stdout', ecx: 'buffer', edx: 'length' }, ['ecx', 'edx']),
            A('pt', regTop(4, 3), top(0), { lift: 20 })] },
        { title: 'Trap into the kernel', code: 'int 0x80',
          text: 'INT 0x80 hands control to the kernel. It reads EAX to choose the call, then EBX, ECX, EDX as arguments, and prints the bytes.',
          scene: [mem(), regs({ eax: '4', ebx: '1', ecx: '&msg', edx: '14' }, { eax: 'sys_write', ebx: 'stdout', ecx: 'buffer', edx: 'length' }), kernel('Hello, World!')] },
        { title: 'Exit', code: 'mov eax, 1\nmov ebx, 0\nint 0x80',
          text: 'Same mechanism, different number: 1 is sys_exit and EBX is the exit code. Without this the CPU would run off the end of the code.',
          scene: [mem('dim'), regs({ eax: '1', ebx: '0', ecx: '&msg', edx: '14', dim: true }, { eax: 'sys_exit', ebx: 'exit code' }, ['eax', 'ebx']), kernel('exit(0)')] },
      ];
    })(),

    7: (() => {
      const SRC = ['H', 'e', 'l', 'l', 'o', '0'];
      const src = (tone) => [SLAB('s', 0, 0, 6), row('s', 0, 0, SRC, opt.bind(null, tone)), name('ns', 0, 0, 'src')];
      const dst = (vals, hi = -1) => [SLAB('d', 0, 2.2, 6), tiles('dt', 0, 2.2, 6), name('nd', 0, 2.2, 'dst'),
        row('d', 0, 2.2, vals, i => ({ tone: hot(i <= hi) }))];
      const esi = x => G('esi', ...top(x), 'ESI');
      const edi = (x, y = 2.2) => G('edi', x + 0.5, y + 1, -0.4, 'EDI', { below: true, tone: 'hot' });
      const ecx = v => G('ecx', 6, 0.5, 0, `ECX = ${v}`, { dx: 44, dy: -6 });
      return [
        { title: 'Point ESI and EDI', code: 'cld\nmov esi, src\nmov edi, dst\nmov ecx, 6',
          text: 'String instructions read from <b>[ESI]</b> and write to <b>[EDI]</b>. CLD makes both move forward. ECX = 6 bytes, including the null.',
          scene: [src(), dst([]), esi(0), edi(0), ecx(6)] },
        { title: 'REP MOVSB, two bytes in', code: 'rep movsb',
          text: 'Each MOVSB copies one byte and moves ESI and EDI forward by 1. REP repeats it, counting ECX down.',
          scene: [src(), dst(['H', 'e'], 1), esi(2), edi(2), ecx(4)] },
        { title: 'Copy finished', code: '; ECX = 0',
          text: 'ECX hit 0 and REP stopped. dst now holds "Hello" and its null. Both pointers sit one past the end.',
          scene: [src(), dst(SRC, 5), esi(6), edi(6), ecx(0)] },
        { title: 'strlen with REPNE SCASB', code: 'mov edi, src\nmov al, 0\nmov ecx, 256\nrepne scasb',
          text: 'SCASB compares AL with [EDI] and advances. REPNE stops at the first match, the null. 256 − ECX − 1 = <b>5</b>, the length.',
          scene: [src(i => ({ tone: hot(i === 5) })), dst(SRC), G('edi', ...top(6), 'EDI', { tone: 'hot' }), ecx(250)] },
        { title: 'memset with REP STOSB', code: "mov edi, dst\nmov al, '*'\nmov ecx, 5\nrep stosb",
          text: 'STOSB writes AL to [EDI] and advances. Five times over, dst becomes "*****" and the null survives.',
          scene: [src({ tone: 'dim' }), dst(['*', '*', '*', '*', '*', '0'], 4), edi(5), ecx(0)] },
      ];
    })(),

    8: (() => {
      const base = (n, val) => [SLAB('s', 0, 0, 8), tiles('t', 0, 0, 8), labels('l', 0, 1, ['7', '6', '5', '4', '3', '2', '1', '0']),
        name('n', 0, 0, n), G('val', 8, 0.5, 0, val, { dx: 40, dy: -6 })];
      const bit = (id, b, tone) => C(id, 7 - b, 0, '1', { tone });
      const mask = (bits) => [SLAB('ms', 0, 1.8, 8), tiles('mt', 0, 1.8, 8, { tone: 'dim' }), name('nm', 0, 1.8, 'mask'),
        bits.map(b => C('m' + b, 7 - b, 1.8, '1', { h: 0.4, tone: 'dim' }))];
      return [
        { title: 'Bits as cubes', code: 'mov ebx, 0b00001010',
          text: 'Showing the low byte of EBX. A cube is a 1, an empty slot a 0. Bits 3 and 1 are set: 0x0A.',
          scene: [base('EBX', '0x0A'), bit('b3', 3), bit('b1', 1)] },
        { title: 'OR turns bits on', code: 'or ebx, 0b00110000',
          text: 'OR keeps every 1 from either side. Bits 5 and 4 come on, the rest stay. EBX = <b>0x3A</b>.',
          scene: [base('EBX', '0x3A'), mask([5, 4]), bit('b5', 5, 'hot'), bit('b4', 4, 'hot'), bit('b3', 3), bit('b1', 1)] },
        { title: 'XOR: before', code: 'mov ecx, 0b11001100',
          text: 'XOR flips every bit where the mask has a 1. Here comes the mask 10101010.',
          scene: [base('ECX', '0xCC'), mask([7, 5, 3, 1]), [7, 6, 3, 2].map(b => bit('x' + b, b))] },
        { title: 'XOR: after', code: 'xor ecx, 0b10101010',
          text: 'Bits 7 and 3 were 1 under a 1, so they flip off. Bits 5 and 1 were 0, so they flip on. ECX = <b>0x66</b>. XOR a value with itself and everything flips off: the zero trick.',
          scene: [base('ECX', '0x66'), mask([7, 5, 3, 1]), bit('x6', 6), bit('x5', 5, 'hot'), bit('x2', 2), bit('x1', 1, 'hot')] },
        { title: 'Shifts: start with 7', code: 'mov eax, 7',
          text: '7 is 00000111: bits 2, 1 and 0.',
          scene: [base('EAX', '7'), bit('s2', 2), bit('s1', 1), bit('s0', 0)] },
        { title: 'SHL slides left', code: 'shl eax, 3',
          text: 'Every bit moves 3 places left and zeros fill in from the right. Each place doubles: 7 × 2³ = <b>56</b>.',
          scene: [base('EAX', '56'), bit('s2', 5, 'hot'), bit('s1', 4, 'hot'), bit('s0', 3, 'hot')] },
        { title: 'SHR slides right', code: 'shr eax, 1',
          text: 'One place right halves the value: 56 → <b>28</b>. The bit that falls off the end goes into CF.',
          scene: [base('EAX', '28'), bit('s2', 4, 'hot'), bit('s1', 3, 'hot'), bit('s0', 2, 'hot')] },
      ];
    })(),

    9: (() => {
      const V = ['10', '20', '30', '40', '50'];
      const arr = (hi, tone = '') => [SLAB('s', 0, 0, 5), tiles('t', 0, 0, 5), labels('l', 0, 1, ['+0', '+4', '+8', '+12', '+16']), name('na', 0, 0, 'arr'),
        row('a', 0, 0, V, i => ({ tone: i === hi ? 'hot' : tone }))];
      const regs = (eax, ecx) => [SLAB('s2', 0, 2.8, 4), R('eax', 0, 2.8, 'EAX', eax, { tone: 'hot', tagBelow: true }), ecx && R('ecx', 2, 2.8, 'ECX', ecx, { tagBelow: true })];
      const load = i => A('ld', top(i), regTop(0, 2.8), { lift: 20 });
      return [
        { title: 'LEA takes an address', code: 'lea ebx, [arr]',
          text: '<b>EBX</b> now holds the address of arr[0]. LEA computes addresses; it never reads memory.',
          scene: [arr(-1), G('ebx', ...top(0), 'EBX', { tone: 'hot' }), regs('?')] },
        { title: 'Register-indirect', code: 'mov eax, [ebx]',
          text: 'Square brackets mean "go to this address and read". [EBX] → arr[0] = <b>10</b>.',
          scene: [arr(0), G('ebx', ...top(0), 'EBX'), regs('10'), load(0)] },
        { title: 'Move the pointer', code: 'add ebx, 4\nmov eax, [ebx]',
          text: 'Each dd is 4 bytes, so +4 steps to the next element. [EBX] → arr[1] = <b>20</b>.',
          scene: [arr(1), G('ebx', ...top(1), 'EBX', { tone: 'hot' }), regs('20'), load(1)] },
        { title: 'Base + constant', code: 'mov eax, [arr+8]',
          text: 'The offset is baked into the instruction. arr+8 → arr[2] = <b>30</b>.',
          scene: [arr(2), G('off', ...top(2), 'arr+8', { tone: 'hot' }), regs('30'), load(2)] },
        { title: 'Scaled index', code: 'mov ecx, 4\nmov eax, [arr+ecx*4]',
          text: 'The CPU computes base + index × scale in one go: arr + 4 × 4 = arr+16 → <b>50</b>. Scale can be 1, 2, 4 or 8.',
          scene: [arr(4), G('off', ...top(4), 'arr + 4×4', { tone: 'hot' }), regs('50', '4'), load(4)] },
        { title: 'LEA as arithmetic', code: 'mov eax, 7\nlea eax, [eax+eax*2]',
          text: 'LEA runs the address math (7 + 7 × 2) and stops. No memory is touched, so it doubles as a cheap multiply: EAX = <b>21</b>.',
          scene: [arr(-1, 'dim'), regs('21', '4')] },
      ];
    })(),

    10: (() => {
      const W = { w: 2.6 };
      const regs = (edx, eax, hi = []) => [SLAB('s', 0, 0, 6), edx && R('edx', 0, 0, 'EDX', edx, { ...W, tone: hot(hi.includes('edx')) }),
        R('eax', 3, 0, 'EAX', eax, { ...W, tone: hot(hi.includes('eax')) })];
      const below = (id, x, text, dy = 24) => G(id, x, 1, -0.4, text, { below: true, dy });
      return [
        { title: 'Same bits, two readings', code: 'mov eax, 0xFFFFFFFF',
          text: 'The bits carry no sign. Unsigned they mean 4294967295; signed (two\'s complement) they mean −1. The instruction you use picks the reading.',
          scene: [regs(null, 'FFFFFFFF', ['eax']), below('u', 4.4, 'unsigned 4294967295'), below('sg', 4.4, 'signed −1', 48)] },
        { title: 'ADD is the same for both', code: 'add eax, 1',
          text: 'Unsigned, 4294967295 + 1 wrapped around: <b>CF = 1</b>. Signed, −1 + 1 = 0 is fine: <b>OF = 0</b>. One ADD, two verdicts.',
          scene: [regs(null, '00000000', ['eax']), SLAB('s2', 0, 2, 2), labels('fl', 0, 3, ['CF', 'OF']), T('tcf', 0, 2), T('tof', 1, 2, { text: '0' }),
            C('fcf', 0, 2, '1', { h: 0.5, tone: 'hot' })] },
        { title: 'CDQ before IDIV', code: 'mov eax, -17\ncdq',
          text: 'IDIV divides the 64-bit pair <b>EDX:EAX</b>. CDQ fills EDX with copies of EAX\'s sign bit: all 1s for a negative.',
          scene: [regs('FFFFFFFF', 'FFFFFFEF', ['edx']), below('v', 4.4, '−17')] },
        { title: 'IDIV rounds toward zero', code: 'mov ecx, 5\nidiv ecx',
          text: '−17 / 5 = <b>−3</b> in EAX, remainder <b>−2</b> in EDX. The remainder takes the dividend\'s sign.',
          scene: [regs('FFFFFFFE', 'FFFFFFFD', ['edx', 'eax']), below('r', 1.4, 'rem −2'), below('v', 4.4, 'quot −3')] },
        { title: 'SAR vs SHR', code: 'mov eax, -32   ; FFFFFFE0\nsar eax, 2\n; vs\nshr eax, 2',
          text: '<b>SAR</b> copies the sign bit into the gap: −8, correct. <b>SHR</b> shifts in zeros and turns a negative into a huge positive.',
          scene: [regs(null, 'FFFFFFE0'), SLAB('s2', 0, 2.6, 6), R('sar', 0, 2.6, 'SAR → −8', 'FFFFFFF8', { ...W, tone: 'ok', tagBelow: true }),
            R('shr', 3, 2.6, 'SHR → wrong', '3FFFFFF8', { ...W, tone: 'bad', tagBelow: true })] },
      ];
    })(),

    11: (() => {
      const base = [SLAB('s', 0, 0, 6), tiles('t', 0, 0, 6), labels('l', 0, 1, ['ebp+12', 'ebp+8', 'ebp+4', 'ebp', 'ebp-4', 'ebp-8'])];
      const esp = x => G('esp', ...top(x), 'ESP', { tone: 'hot' });
      const ebp = G('ebp', 3.5, 1, -0.4, 'EBP', { below: true });
      const args = tone => [C('b', 0, 0, '3', { tone }), C('a', 1, 0, '10', { tone })];
      const frame = tone => [args(tone), C('ret', 2, 0, 'ret', { tone }), C('obp', 3, 0, 'ebp', { tone })];
      return [
        { title: 'Push arguments right to left', code: 'push 3\npush 10',
          text: 'abs_diff(10, 3): the last argument goes first, so <b>a = 10</b> ends up nearest the top.',
          scene: [base, args('hot'), esp(1)] },
        { title: 'Call', code: 'call abs_diff',
          text: 'The return address goes on top of the arguments.',
          scene: [base, args(), C('ret', 2, 0, 'ret', { tone: 'hot' }), esp(2)] },
        { title: 'Prologue', code: 'push ebp\nmov  ebp, esp',
          text: 'Save the caller\'s EBP and pin a new one. Every slot is now a fixed distance from <b>EBP</b>.',
          scene: [base, args(), C('ret', 2, 0, 'ret'), C('obp', 3, 0, 'ebp', { tone: 'hot' }), esp(3), ebp] },
        { title: 'Reserve locals', code: 'sub esp, 8',
          text: 'Moving ESP down 8 bytes claims two dword locals. Nothing is written yet, so they hold whatever was there.',
          scene: [base, frame(), T('t4', 4, 0, { tone: 'hot', text: '?' }), T('t5', 5, 0, { tone: 'hot', text: '?' }), esp(5), ebp] },
        { title: 'Fill the locals', code: 'mov [ebp-4], eax   ; a\nmov [ebp-8], ecx   ; b',
          text: 'Arguments sit above EBP (<b>+8, +12</b>), locals below it (<b>−4, −8</b>). One fixed EBP reaches both.',
          scene: [base, frame(), C('la', 4, 0, '10', { tone: 'hot' }), C('lb', 5, 0, '3', { tone: 'hot' }), esp(5), ebp,
            A('ca', top(1), top(4), { lift: 34 }), A('cb', top(0), top(5), { lift: 50 })] },
        { title: 'Epilogue', code: 'mov esp, ebp\npop ebp\nret\nadd esp, 8',
          text: 'MOV ESP, EBP drops the locals in one move. POP restores EBP, RET returns, and the caller frees both arguments. EAX = |10 − 3| = <b>7</b>.',
          scene: [base, frame('dim'), C('la', 4, 0, '10', { tone: 'dim' }), C('lb', 5, 0, '3', { tone: 'dim' }),
            G('esp', 0.5, -0.5, 0, 'ESP → above', { tone: 'hot' }), SLAB('s2', 0, 2.6, 2), R('eax', 0, 2.6, 'EAX', '7', { tone: 'hot', tagBelow: true })] },
      ];
    })(),

    12: (() => {
      const bar = v => ({ h: Math.min(1.6, 0.3 + Number(v) / 40) });
      const arr = (vals, f = () => ({})) => [SLAB('s', 0, 0, 5), tiles('t', 0, 0, 5), labels('l', 0, 1, ['[0]', '[1]', '[2]', '[3]', '[4]']),
        name('na', 0, 0, 'arr'), row('a', 0, 0, vals, i => ({ ...bar(vals[i]), ...f(i) }))];
      const V = ['3', '17', '8', '42', '11'];
      const read = text => G('rd', 5, 0.5, 0, text, { dx: 44, dy: -6, tone: 'hot' });
      return [
        { title: 'Element i is at arr + i×4', code: 'mov ecx, 2\nmov eax, [arr+ecx*4]',
          text: 'Each dd is 4 bytes, so element i starts at arr + i × 4. The CPU does that multiply inside the address. arr[2] = <b>8</b>.',
          scene: [arr(V, i => ({ tone: hot(i === 2) })), G('ix', ...top(2, 0, bar(8).h), 'arr + 2×4'), read('EAX = 8')] },
        { title: 'Walk with a pointer', code: 'mov esi, arr\nsum_loop: add eax, [esi]\n          add esi, 4\n          loop sum_loop',
          text: '<b>ESI</b> points at the current element. Each pass adds [ESI] and moves ESI 4 bytes on.',
          scene: [arr(V, i => ({ tone: hot(i === 0) })), G('esi', ...top(0, 0, bar(3).h), 'ESI'), read('EAX = 3')] },
        { title: 'Sum done', code: '; EAX = 81',
          text: 'Five passes later ESI sits one past the end and EAX = 3 + 17 + 8 + 42 + 11 = <b>81</b>.',
          scene: [arr(V, () => ({ tone: 'hot' })), G('esi', 5.5, 0.5, 0, 'ESI'), read('EAX = 81')] },
        { title: 'Find the maximum', code: 'max_loop: mov edx, [arr+esi*4]\n          cmp edx, ebx\n          jle max_next\n          mov ebx, edx',
          text: 'Keep the biggest seen so far in EBX. Each element is compared and replaces EBX only if larger. EBX = <b>42</b>.',
          scene: [arr(V, i => ({ tone: i === 3 ? 'hot' : 'dim' })), read('EBX = 42')] },
        { title: 'Write an element', code: 'mov ecx, 0\nmov dword [arr+ecx*4], 99',
          text: 'Same address math, but as the destination. arr[0] becomes <b>99</b>; the other elements are untouched.',
          scene: [arr(['99', '17', '8', '42', '11'], i => ({ tone: hot(i === 0) })), read('arr[0] = 99')] },
      ];
    })(),

    13: (() => {
      const base = (n, w = 4) => [SLAB('s', 0, 0, w), tiles('t', 0, 0, w), labels('l', 0, 1, ['+0', '+1', '+2', '+3', '+4'].slice(0, w)), name('nv', 0, 0, n)];
      const B = ['11', '22', '33', '44'];
      const bytes = (order, z, f = () => ({})) => B.map((b, i) => C('b' + b, order(i), 0, b, { z, ...f(i) }));
      const stored = f => bytes(i => 3 - i, 0, f);
      return [
        { title: 'A number as you write it', code: 'val dd 0x11223344',
          text: 'Written down, the most significant byte (0x11) comes first. Four bytes are about to be stored at val.',
          scene: [base('val'), bytes(i => i, 1.4)] },
        { title: 'Stored little-endian', code: '; memory: 44 33 22 11',
          text: 'x86 stores the <b>least</b> significant byte at the lowest address: 44 at val+0, 11 at val+3. A memory dump looks reversed.',
          scene: [base('val'), stored(i => ({ tone: hot(i === 3) }))] },
        { title: 'Read one byte', code: 'mov al, [val]',
          text: 'A byte read takes exactly the byte at val+0. AL = <b>0x44</b>, the low byte.',
          scene: [base('val'), stored(i => ({ tone: i === 3 ? 'hot' : 'dim' })), SLAB('s2', 0, 2.6, 4), C('al', 0, 2.6, '44', { tag: 'AL', tagBelow: true, tone: 'hot' }),
            A('rd', top(0), top(0, 2.6), { lift: 16 })] },
        { title: 'Read the whole dword', code: 'mov eax, [val]',
          text: 'A dword read takes four bytes and puts val+3 on top. EAX = <b>0x11223344</b>: only the dump looks reversed, never the value.',
          scene: [base('val'), stored(() => ({ tone: 'hot' })), SLAB('s2', 0, 2.6, 4), C('eax', 0, 2.6, '11223344', { w: 3.8, tag: 'EAX', tagBelow: true, tone: 'hot' })] },
        { title: 'Strings are not reversed', code: "text db 'Hello'",
          text: 'A string is stored one byte at a time, first character first. Endianness only reorders bytes <b>within</b> a multi-byte number.',
          scene: [base('text', 5), row('h', 0, 0, ['H', 'e', 'l', 'l', 'o'], { tone: 'hot' })] },
      ];
    })(),

    14: (() => {
      const base = [SLAB('s', 0, 0, 4), tiles('t', 0, 0, 4), labels('l', 0, 1, ['buf+0', 'buf+4', 'old ebp', 'ret'])];
      const slot = (x, id, text, tone) => C(id, x, 0, text, { tone });
      const frame = (n) => [
        n >= 1 ? slot(0, 'b0', 'AAAA', n === 2 ? 'ok' : 'dim') : null,
        n >= 1 ? slot(1, 'b1', 'AAAA', n === 2 ? 'ok' : 'dim') : null,
        slot(2, 'ebp', n >= 3 ? 'AAAA' : 'EBP', n >= 3 ? 'bad' : ''),
        slot(3, 'ret', n >= 4 ? 'AAAA' : 'RET', n >= 4 ? 'bad' : ''),
      ];
      return [
        { title: 'The frame', code: 'push ebp\nmov  ebp, esp\nsub  esp, 8      ; buf[8]',
          text: 'buf sits just <b>below</b> the saved EBP and the return address. Copies write toward higher addresses: straight at them.',
          scene: [base, frame(0), A('dir', [0.3, 1.4, -0.4], [3.7, 1.4, -0.4], { lift: 8 })] },
        { title: 'Eight bytes fit', code: 'rep movsb        ; p_len = 8',
          text: 'Eight bytes fill buf exactly. The saved EBP and return address are untouched.',
          scene: [base, frame(2)] },
        { title: 'Twelve bytes: EBP hit', code: '; if p_len were 12',
          text: 'Four bytes too many land on the saved EBP. The function still returns, but the caller\'s frame pointer is now garbage.',
          scene: [base, frame(3)] },
        { title: 'Sixteen bytes: RET hit', code: '; if p_len were 16\nret              ; EIP = 0x41414141',
          text: 'RET pops this slot into EIP. Whoever controls these bytes controls where execution goes next. Canaries, DEP and ASLR exist to break this.',
          scene: [base, frame(4), G('eip', ...top(3), 'EIP = 0x41414141', { tone: 'bad' })] },
      ];
    })(),

    15: (() => {
      const BL = ['0A', '1E', '2D', '3C'];
      const blob = tone => [SLAB('s', 0, 0, 4), tiles('t', 0, 0, 4), labels('l', 0, 1, ['+0', '+1', '+2', '+3']), name('nb', 0, 0, 'blob'),
        row('x', 0, 0, BL, { tone })];
      const regs = v => [SLAB('s2', 0, 2.6, 4), v.map((b, i) => C('r' + i, i, 2.6, b, { tag: ['AL', 'BL', 'CL', 'DL'][i], tagBelow: true, tone: 'hot' }))];
      return [
        { title: 'Four opaque bytes', code: 'blob db 0x0A, 0x1E, 0x2D, 0x3C',
          text: 'Bytes in .data. To the CPU they are only data until something jumps to them.',
          scene: [blob()] },
        { title: 'Read them like an analyst', code: 'mov al, [esi]\nmov bl, [esi+1]\nmov cl, [esi+2]\nmov dl, [esi+3]',
          text: 'Loading bytes into registers to look, compare or hash them is static analysis. It is always safe.',
          scene: [blob('dim'), regs(BL)] },
        { title: 'Sum them', code: 'add eax, ebx\nadd eax, ecx\nadd eax, edx',
          text: '10 + 30 + 45 + 60 = 145 = <b>0x91</b>. Plain arithmetic on the same material.',
          scene: [blob('dim'), SLAB('s2', 0, 2.6, 4), C('sum', 0, 2.6, '0x91', { w: 1.8, tag: 'EAX', tagBelow: true, tone: 'hot' })] },
        { title: 'Why executing it fails', code: '; .data is mapped rw- (no x)',
          text: '<b>DEP / W^X</b> marks data pages non-executable, so a jump into these bytes faults instead of running them. <b>ASLR</b> also hides where they are.',
          scene: [blob('bad'), G('nx', ...top(1.5), 'jmp blob → fault', { tone: 'bad' })] },
      ];
    })(),
  };

  window.EXPLAINERS = EXPLAINERS;
  window.renderExplainer = render;
}());
