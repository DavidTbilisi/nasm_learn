'use strict';

// Grades a lesson exercise. Returns { pass, msg }, or null when the exercise has no check.
//   exercise.answer: a number; the learner types it (0x.., ..h, or decimal all accepted).
//   exercise.expect: { regs, flags, exitCode, stdoutNot } checked against the program's final state.
//     A reg value that is a string is an address expression resolved against labels ('arr+16').
function gradeExercise(ex, { code = '', answer = '' } = {}) {
  const sim = NASMSimulator.create(code);
  const fmt = n => `${n} (0x${n.toString(16).toUpperCase()})`;   // n: unsigned Number or BigInt

  if (ex.answer !== undefined) {
    const got = sim._parseImm(String(answer).trim());
    if (got === null) return { pass: false, msg: 'Type a number: decimal (145), 0x91, or 91h.' };
    return (got >>> 0) === (ex.answer >>> 0)
      ? { pass: true, msg: `Correct: ${fmt(ex.answer >>> 0)}.` }
      : { pass: false, msg: `${fmt(got >>> 0)} is not it. Try the hint.` };
  }

  const e = ex.expect;
  if (!e) return null;
  const r = sim.runAll(code, { maxSteps: 5000 });
  if (r.error) return { pass: false, msg: r.error };
  const last = r.history.at(-1);
  if (last?.error) return { pass: false, msg: `Error at "${last.instr.raw}": ${last.error}` };
  if (r.hitLimit) return { pass: false, msg: 'The program never finished (5000-step limit). Infinite loop?' };

  const st = r.finalState, fails = [];
  for (const [reg, want] of Object.entries(e.regs ?? {})) {
    // Compare as unsigned BigInts at the register's width, so -1 works for EDX and for RAX.
    const bits = sim._opSize(reg);
    const w = BigInt.asUintN(bits, BigInt(typeof want === 'string' ? sim._resolveAddr(want, r.labels) : want));
    const got = BigInt(sim.getReg(reg));   // sim still holds the final state after runAll
    if (got !== w) fails.push(`${reg.toUpperCase()} = ${fmt(got)}, expected ${typeof want === 'string' ? want + ' = ' : ''}${fmt(w)}`);
  }
  for (const [f, want] of Object.entries(e.flags ?? {})) {
    if (st.flags[f] !== want) fails.push(`${f.toUpperCase()} = ${st.flags[f]}, expected ${want}`);
  }
  if (e.exitCode !== undefined && st.exitCode !== e.exitCode) {
    fails.push(`exit code = ${st.exitCode ?? 'none (no sys_exit)'}, expected ${e.exitCode}`);
  }
  if (e.stdoutNot !== undefined) {
    const out = st.stdout.join('');
    if (!out.trim() || out.includes(e.stdoutNot)) fails.push(`output is "${out.trim()}": print your own message`);
  }
  return fails.length ? { pass: false, msg: fails.join(' · ') } : { pass: true, msg: 'All checks pass.' };
}

if (typeof module !== 'undefined' && module.exports) module.exports = gradeExercise;
