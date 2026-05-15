'use strict';

/**
 * Rank — placement test + adaptive auto-generated drills (uses gym drill kit).
 */

const RANK_STORAGE_KEY = 'nasm_learn_rank_v1';
const PLACEMENT_PER_TRACK = 2;
const TRACK_ORDER = ['registers', 'arithmetic', 'flags', 'trace', 'addressing', 'idioms', 'spotbug'];

const TRACK_LABEL = {
  registers: 'Registers',
  arithmetic: 'Arithmetic',
  flags: 'Flags',
  trace: 'Mental trace',
  addressing: 'Addressing',
  idioms: 'Idioms',
  spotbug: 'Spot the bug',
};

const TRACK_LESSONS = {
  registers: [{ i: 0, t: '1 · Registers' }],
  arithmetic: [{ i: 1, t: '2 · Arithmetic & flags' }],
  flags: [{ i: 1, t: '2 · Arithmetic & flags' }],
  trace: [
    { i: 2, t: '3 · Control flow' },
    { i: 4, t: '5 · Loops' },
  ],
  addressing: [{ i: 8, t: '9 · Addressing' }],
  idioms: [
    { i: 3, t: '4 · Stack & calls' },
    { i: 6, t: '7 · Strings' },
  ],
  spotbug: [
    { i: 7, t: '8 · Bitwise' },
    { i: 11, t: '12 · Arrays' },
    { i: 12, t: '13 · Endianness' },
  ],
};

function tierFromPct(pct) {
  if (pct >= 80) return { id: 'platinum', name: 'Platinum' };
  if (pct >= 60) return { id: 'gold', name: 'Gold' };
  if (pct >= 40) return { id: 'silver', name: 'Silver' };
  return { id: 'bronze', name: 'Bronze' };
}

function practiceLevelFromProfile(p) {
  if (!p || p.placementPct == null) return 2;
  if (p.placementPct >= 70) return 3;
  if (p.placementPct >= 45) return 2;
  return 1;
}

function getKit() {
  return window.__GYM_DRILL_KIT || null;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(RANK_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && p.v === 1 ? p : null;
  } catch {
    return null;
  }
}

function saveProfile(p) {
  localStorage.setItem(RANK_STORAGE_KEY, JSON.stringify(p));
}

function trackPct(p, tr) {
  const row = p.byTrack?.[tr] || { c: 0, w: 0 };
  const n = row.c + row.w;
  return n ? (100 * row.c) / n : 50;
}

function rankTrackSort(p) {
  return [...TRACK_ORDER].map(tr => ({ tr, pct: trackPct(p, tr) })).sort((a, b) => b.pct - a.pct);
}

let rankActive = false;
let session = null;

function $(id) {
  return document.getElementById(id);
}

function showPanel(which) {
  ['rank-panel-hub', 'rank-panel-place', 'rank-panel-practice'].forEach(id => {
    const el = $(id);
    if (el) el.style.display = id === which ? 'block' : 'none';
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderSideRank() {
  const slot = $('rank-side-rank');
  if (!slot) return;
  const p = loadProfile();
  if (!p || !p.placementAt) {
    slot.innerHTML = '<p class="rank-muted">No placement yet.</p>';
    return;
  }
  slot.innerHTML =
    '<div class="rank-tier-badge rank-tier-' +
    p.rankTier +
    '">' +
    p.rankName +
    '</div><p class="rank-muted">' +
    p.placementPct +
    '% placement</p>';
}

function wireLessonLinks(root) {
  root.querySelectorAll('.rank-lesson-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-lesson'), 10);
      window.goToLessonTab?.(i);
    });
  });
}

function recommendedLessonButtons(p) {
  const sorted = rankTrackSort(p);
  const gaps = sorted.slice(-3).reverse().filter(x => x.pct < 70);
  const seen = new Set();
  const parts = [];
  const pushLessons = arr => {
    for (const l of arr) {
      if (seen.has(l.i)) continue;
      seen.add(l.i);
      parts.push(
        '<button type="button" class="btn btn-secondary rank-lesson-link" data-lesson="' +
          l.i +
          '">' +
          l.t +
          '</button>'
      );
    }
  };
  if (gaps.length) {
    for (const g of gaps) pushLessons(TRACK_LESSONS[g.tr] || []);
  } else {
    for (const tr of TRACK_ORDER) pushLessons(TRACK_LESSONS[tr] || []);
  }
  return parts.join('');
}

function renderHub() {
  const hub = $('rank-panel-hub');
  if (!hub) return;
  const p = loadProfile();
  renderSideRank();

  if (!p || !p.placementAt) {
    hub.innerHTML =
      '<h2 class="rank-title">Rank</h2>' +
      '<p class="rank-lead">Placement is ' +
      PLACEMENT_PER_TRACK +
      ' auto-generated questions per topic (' +
      PLACEMENT_PER_TRACK * TRACK_ORDER.length +
      ' total). You get a rank, a strength map, gaps, and adaptive practice.</p>' +
      '<button type="button" id="rank-start-placement" class="btn btn-primary">Start placement test</button>';
    $('rank-start-placement')?.addEventListener('click', startPlacement);
    return;
  }

  const sorted = rankTrackSort(p);
  const strengths = sorted.slice(0, 3).filter(x => x.pct >= 50);
  const gaps = sorted.slice(-3).reverse().filter(x => x.pct < 70);

  hub.innerHTML =
    '<h2 class="rank-title">Your rank: <span class="rank-tier-' +
    p.rankTier +
    '">' +
    p.rankName +
    '</span></h2>' +
    '<p class="rank-lead">Placement: <strong>' +
    p.placementPct +
    '%</strong>. Percentages combine placement and practice history.</p>' +
    '<div class="rank-grid-2">' +
    '<div class="rank-card"><h3>Strong areas</h3><ul class="rank-list">' +
    (strengths.length
      ? strengths.map(x => '<li><strong>' + TRACK_LABEL[x.tr] + '</strong> — ' + Math.round(x.pct) + '%</li>').join('')
      : '<li class="rank-muted">Keep answering to highlight strengths.</li>') +
    '</ul></div>' +
    '<div class="rank-card"><h3>Needs work</h3><ul class="rank-list">' +
    (gaps.length
      ? gaps.map(x => '<li><strong>' + TRACK_LABEL[x.tr] + '</strong> — ' + Math.round(x.pct) + '%</li>').join('')
      : '<li class="rank-muted">Looking balanced.</li>') +
    '</ul></div></div>' +
    '<div class="rank-card rank-card-wide"><h3>Open a lesson</h3>' +
    '<p class="rank-muted">Prioritised from weaker topics when possible.</p>' +
    '<div class="rank-lesson-bank">' +
    recommendedLessonButtons(p) +
    '</div></div>' +
    '<div class="rank-actions">' +
    '<button type="button" id="rank-start-practice" class="btn btn-primary">Adaptive practice</button>' +
    '<button type="button" id="rank-retake" class="btn btn-secondary">Retake placement</button></div>';

  $('rank-start-practice')?.addEventListener('click', startPractice);
  $('rank-retake')?.addEventListener('click', () => {
    if (
      confirm(
        'Retake placement? Your saved rank and per-topic counts will be replaced when you finish the new test.'
      )
    ) {
      localStorage.removeItem(RANK_STORAGE_KEY);
      renderHub();
    }
  });
  wireLessonLinks(hub);
}

function buildPlacementPool() {
  const kit = getKit();
  if (!kit) return [];
  const pool = [];
  for (const tr of TRACK_ORDER) {
    const tmpls = kit.DRILLS[tr];
    if (!tmpls || !tmpls.length) continue;
    for (let q = 0; q < PLACEMENT_PER_TRACK; q++) {
      let d = null;
      for (let a = 0; a < 15 && !d; a++) {
        try {
          d = kit.pick(tmpls)();
        } catch {
          /* retry */
        }
      }
      if (d) pool.push(Object.assign({}, d, { track: tr }));
    }
  }
  return kit.shuf(pool);
}

function startPlacement() {
  const pool = buildPlacementPool();
  if (!pool.length) {
    alert('Drill library not ready. Reload the page.');
    return;
  }
  session = { mode: 'placement', pool, idx: 0, answers: [] };
  showPanel('rank-panel-place');
  renderPlacementQuestion();
}

function placementProgress() {
  const el = $('rank-place-progress');
  if (!el || !session || session.mode !== 'placement') return;
  const pct = Math.round((session.idx / session.pool.length) * 100);
  el.style.width = pct + '%';
  el.setAttribute('aria-valuenow', String(pct));
}

function renderPlacementQuestion() {
  const panel = $('rank-panel-place');
  if (!panel || !session || session.mode !== 'placement') return;
  const d = session.pool[session.idx];
  const n = session.pool.length;
  panel.innerHTML =
    '<h2 class="rank-title">Placement <span class="rank-muted">(' +
    (session.idx + 1) +
    ' / ' +
    n +
    ')</span></h2>' +
    '<div class="quiz-progress-track rank-progress"><div id="rank-place-progress" style="width:0%" role="progressbar" aria-valuenow="0"></div></div>' +
    '<div class="rank-q-meta"><span class="rank-tag">' +
    TRACK_LABEL[d.track] +
    '</span></div>' +
    '<p class="rank-question">' +
    d.q +
    '</p>' +
    '<pre class="rank-code" style="display:' +
    (d.code ? 'block' : 'none') +
    '">' +
    (d.code ? escapeHtml(d.code) : '') +
    '</pre>' +
    '<div id="rank-place-mc" style="display:none" class="rank-mc-grid"></div>' +
    '<div id="rank-place-type" style="display:none" class="rank-type-row"></div>' +
    '<div id="rank-place-feedback" class="gym-feedback hidden"></div>' +
    '<div class="rank-nav"><button type="button" id="rank-place-next" class="btn btn-primary" style="display:none">Next →</button></div>';

  placementProgress();

  $('rank-place-next').addEventListener('click', () => {
    session.idx++;
    if (session.idx >= session.pool.length) finishPlacement();
    else renderPlacementQuestion();
  });

  if (d.type === 'mc') {
    const mc = $('rank-place-mc');
    mc.style.display = 'grid';
    d.opts.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gym-opt';
      b.innerHTML =
        '<span class="gym-key">' + String.fromCharCode(65 + i) + '</span>' + opt.label;
      b.addEventListener('click', () => {
        if (session.answered) return;
        session.answered = true;
        document.querySelectorAll('#rank-place-mc .gym-opt').forEach((btn, j) => {
          btn.disabled = true;
          if (d.opts[j].correct) btn.classList.add('gym-opt-correct');
          else if (j === i) btn.classList.add('gym-opt-wrong');
        });
        session.answers.push({ track: d.track, ok: !!d.opts[i].correct });
        showPlaceFeedback(!!d.opts[i].correct, d);
      });
      mc.appendChild(b);
    });
  } else {
    const ty = $('rank-place-type');
    ty.style.display = 'flex';
    ty.innerHTML =
      '<span class="gym-type-label">= ?</span>' +
      '<input id="rank-place-inp" class="gym-type-inp" type="text" placeholder="decimal or 0x hex" autocomplete="off" spellcheck="false">' +
      '<button type="button" id="rank-place-check" class="btn btn-primary">Check</button>';
    const inp = $('rank-place-inp');
    const check = () => {
      if (session.answered) return;
      const raw = inp.value.trim();
      let val = /^0x[0-9a-f]+$/i.test(raw)
        ? parseInt(raw, 16)
        : /^-?\d+$/.test(raw)
          ? parseInt(raw, 10)
          : null;
      if (val === null) {
        inp.classList.add('gym-inp-error');
        return;
      }
      session.answered = true;
      inp.disabled = true;
      $('rank-place-check').disabled = true;
      const ok = (val >>> 0) === (d.answer >>> 0);
      inp.classList.add(ok ? 'gym-inp-correct' : 'gym-inp-wrong');
      session.answers.push({ track: d.track, ok });
      showPlaceFeedback(ok, d);
    };
    $('rank-place-check').addEventListener('click', check);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') check();
    });
    inp.focus();
  }
  session.answered = false;
}

function showPlaceFeedback(ok, d) {
  const fb = $('rank-place-feedback');
  const next = $('rank-place-next');
  if (!fb || !next) return;
  fb.className = 'gym-feedback ' + (ok ? 'correct' : 'wrong');
  fb.innerHTML = ok
    ? '<span class="fb-icon">✓</span><strong>Correct.</strong><span class="fb-explain">' +
      (d.explain || '') +
      '</span>'
    : '<span class="fb-icon">✗</span><strong>Not quite.</strong> Answer: <code>' +
      d.answer +
      '</code><span class="fb-explain">' +
      (d.explain || '') +
      '</span>';
  next.style.display = 'inline-flex';
  placementProgress();
}

function finishPlacement() {
  const byTrack = {};
  for (const tr of TRACK_ORDER) byTrack[tr] = { c: 0, w: 0 };
  for (const a of session.answers) {
    if (!byTrack[a.track]) byTrack[a.track] = { c: 0, w: 0 };
    if (a.ok) byTrack[a.track].c++;
    else byTrack[a.track].w++;
  }
  const total = session.answers.length;
  const correct = session.answers.filter(x => x.ok).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const tier = tierFromPct(pct);
  saveProfile({
    v: 1,
    placementAt: Date.now(),
    rankTier: tier.id,
    rankName: tier.name,
    placementPct: pct,
    byTrack,
  });
  session = null;
  showPanel('rank-panel-hub');
  renderHub();
}

function startPractice() {
  const p = loadProfile();
  if (!p || !p.placementAt) {
    alert('Complete placement first.');
    return;
  }
  if (!getKit()) return;
  session = {
    mode: 'practice',
    streak: 0,
    wrongStreak: 0,
    level: practiceLevelFromProfile(p),
    answered: false,
  };
  showPanel('rank-panel-practice');
  nextPracticeDrill();
}

function pickWeightedTrack(p) {
  const kit = getKit();
  if (!kit) return TRACK_ORDER[0];
  let best = TRACK_ORDER[0];
  let bestW = -1;
  for (const tr of TRACK_ORDER) {
    const row = p.byTrack?.[tr] || { c: 1, w: 1 };
    const n = row.c + row.w;
    const miss = n ? row.w / n : 0.5;
    const w = miss * 2.5 + kit.rnd(0, 100) / 200;
    if (w > bestW) {
      bestW = w;
      best = tr;
    }
  }
  return best;
}

function pickPracticeDrill(tr) {
  const kit = getKit();
  const tmpls = kit.DRILLS[tr];
  const cap = session.level + (kit.rnd(0, 10) > 6 ? 1 : 0);
  for (let a = 0; a < 22; a++) {
    try {
      const d = kit.pick(tmpls)();
      if (d.diff <= cap) return Object.assign({}, d, { track: tr });
    } catch {
      /* continue */
    }
  }
  return Object.assign({}, kit.pick(tmpls)(), { track: tr });
}

function rankMcKey(e) {
  if (!rankActive || !session || session.mode !== 'practice' || session.answered) return;
  const d = session.drill;
  if (!d || d.type !== 'mc') return;
  const i = e.key.toUpperCase().charCodeAt(0) - 65;
  if (i >= 0 && i < d.opts.length) finishPracticeAnswer('mc', i);
}

function nextPracticeDrill() {
  const panel = $('rank-panel-practice');
  if (!panel || !session || session.mode !== 'practice') return;
  document.removeEventListener('keydown', rankMcKey);

  const p = loadProfile();
  const tr = pickWeightedTrack(p);
  const d = pickPracticeDrill(tr);
  session.drill = d;
  session.answered = false;

  const explain = d.explain || '';
  const hintText = explain.split(/\.(?=\s|$)/)[0].slice(0, 220) + (explain.length > 220 ? '…' : '');
  const solText =
    d.type === 'mc'
      ? 'Correct: ' +
        ((d.opts.find(o => o.correct) || {}).label || d.answer) +
        '\n\n' +
        explain
      : 'Answer: ' + d.answer + '\n\n' + explain;

  panel.innerHTML =
    '<div class="rank-practice-top">' +
    '<span class="rank-tag">' +
    TRACK_LABEL[d.track] +
    '</span>' +
    '<span class="rank-muted">Difficulty ~' +
    session.level +
    '</span>' +
    '<span class="rank-muted">Streak ' +
    session.streak +
    '</span></div>' +
    '<h2 class="rank-title">Practice</h2>' +
    '<p class="rank-question">' +
    d.q +
    '</p>' +
    '<pre class="rank-code" style="display:' +
    (d.code ? 'block' : 'none') +
    '">' +
    (d.code ? escapeHtml(d.code) : '') +
    '</pre>' +
    '<div class="rank-help-row">' +
    '<button type="button" id="rank-pr-hint" class="btn btn-secondary">Hint</button>' +
    '<button type="button" id="rank-pr-sol" class="btn btn-secondary">Solution</button></div>' +
    '<pre id="rank-pr-hint-box" class="rank-hint-box" style="display:none"></pre>' +
    '<pre id="rank-pr-sol-box" class="rank-sol-box" style="display:none"></pre>' +
    '<div id="rank-pr-mc" style="display:none" class="rank-mc-grid"></div>' +
    '<div id="rank-pr-type" style="display:none" class="rank-type-row"></div>' +
    '<div id="rank-pr-feedback" class="gym-feedback hidden"></div>' +
    '<div class="rank-nav">' +
    '<button type="button" id="rank-pr-another" class="btn btn-primary" style="display:none">Another →</button>' +
    '<button type="button" id="rank-pr-hub" class="btn btn-secondary">Rank home</button></div>';

  $('rank-pr-hint-box').textContent = hintText;
  $('rank-pr-sol-box').textContent = solText;

  $('rank-pr-hint').addEventListener('click', () => {
    const box = $('rank-pr-hint-box');
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
  });
  $('rank-pr-sol').addEventListener('click', () => {
    const box = $('rank-pr-sol-box');
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
  });

  $('rank-pr-hub').addEventListener('click', () => {
    session = null;
    document.removeEventListener('keydown', rankMcKey);
    showPanel('rank-panel-hub');
    renderHub();
  });

  $('rank-pr-another').addEventListener('click', () => nextPracticeDrill());

  if (d.type === 'mc') {
    const mc = $('rank-pr-mc');
    mc.style.display = 'grid';
    d.opts.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gym-opt';
      b.innerHTML =
        '<span class="gym-key">' + String.fromCharCode(65 + i) + '</span>' + opt.label;
      b.addEventListener('click', () => finishPracticeAnswer('mc', i));
      mc.appendChild(b);
    });
    document.addEventListener('keydown', rankMcKey);
  } else {
    const ty = $('rank-pr-type');
    ty.style.display = 'flex';
    ty.innerHTML =
      '<span class="gym-type-label">= ?</span>' +
      '<input id="rank-pr-inp" class="gym-type-inp" type="text" autocomplete="off" spellcheck="false">' +
      '<button type="button" id="rank-pr-check" class="btn btn-primary">Check</button>';
    $('rank-pr-check').addEventListener('click', () => finishPracticeAnswer('type', null));
    $('rank-pr-inp').addEventListener('keydown', e => {
      if (e.key === 'Enter') finishPracticeAnswer('type', null);
    });
    $('rank-pr-inp').focus();
  }
}

function finishPracticeAnswer(kind, mcIdx) {
  if (!session || session.mode !== 'practice' || session.answered) return;
  const d = session.drill;
  let ok = false;
  if (kind === 'mc') {
    ok = !!d.opts[mcIdx].correct;
    document.querySelectorAll('#rank-pr-mc .gym-opt').forEach((btn, j) => {
      btn.disabled = true;
      if (d.opts[j].correct) btn.classList.add('gym-opt-correct');
      else if (j === mcIdx) btn.classList.add('gym-opt-wrong');
    });
    document.removeEventListener('keydown', rankMcKey);
  } else {
    const inp = $('rank-pr-inp');
    const raw = inp.value.trim();
    let val = /^0x[0-9a-f]+$/i.test(raw)
      ? parseInt(raw, 16)
      : /^-?\d+$/.test(raw)
        ? parseInt(raw, 10)
        : null;
    if (val === null) {
      inp.classList.add('gym-inp-error');
      return;
    }
    ok = (val >>> 0) === (d.answer >>> 0);
    inp.disabled = true;
    $('rank-pr-check').disabled = true;
    inp.classList.add(ok ? 'gym-inp-correct' : 'gym-inp-wrong');
  }

  session.answered = true;

  const prof = loadProfile();
  if (prof && prof.byTrack && d.track) {
    if (!prof.byTrack[d.track]) prof.byTrack[d.track] = { c: 0, w: 0 };
    if (ok) prof.byTrack[d.track].c++;
    else prof.byTrack[d.track].w++;
    saveProfile(prof);
  }

  if (ok) {
    session.streak++;
    session.wrongStreak = 0;
    if (session.streak >= 3 && session.level < 3) session.level++;
  } else {
    session.streak = 0;
    session.wrongStreak++;
    if (session.wrongStreak >= 2 && session.level > 1) session.level--;
  }

  const fb = $('rank-pr-feedback');
  const next = $('rank-pr-another');
  fb.className = 'gym-feedback ' + (ok ? 'correct' : 'wrong');
  const weak = rankTrackSort(loadProfile())
    .filter(x => x.pct < 62)
    .slice(0, 2);
  const extra = weak.length
    ? '<p class="rank-rec">Weaker: ' +
      weak.map(x => TRACK_LABEL[x.tr] + ' (' + Math.round(x.pct) + '%)').join(', ') +
      ' — open Rank home for lesson links.</p>'
    : '';
  fb.innerHTML = ok
    ? '<span class="fb-icon">✓</span><strong>Nice.</strong><span class="fb-explain">' +
      (d.explain || '') +
      '</span>' +
      extra
    : '<span class="fb-icon">✗</span><strong>Review.</strong> <code>' +
      d.answer +
      '</code><span class="fb-explain">' +
      (d.explain || '') +
      '</span>' +
      extra;
  next.style.display = 'inline-flex';
}

window.showRank = () => {
  rankActive = true;
  const rw = $('rank-wrap');
  if (rw) rw.style.display = 'flex';
  $('main-layout').style.display = 'none';
  $('quiz-wrap').style.display = 'none';
  $('gym-wrap').style.display = 'none';
  $('playground-wrap').style.display = 'none';
  showPanel('rank-panel-hub');
  renderHub();
};

window.hideRank = () => {
  rankActive = false;
  document.removeEventListener('keydown', rankMcKey);
  session = null;
  const rw = $('rank-wrap');
  if (rw) rw.style.display = 'none';
  $('main-layout').style.display = 'grid';
};

(function initRank() {
  $('rank-btn-home')?.addEventListener('click', () => {
    window.hideRank?.();
    document.querySelector('.tab-btn')?.click();
  });
})();
