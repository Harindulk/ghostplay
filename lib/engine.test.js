import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, initialState, step, legalMoves, renderAscii, spikeUp } from './engine.js';
import { solve, applyPatch } from './solver.js';
import { LEVELS } from './levels/index.js';

const lv = (grid, extra = {}) => parseLevel({ grid, ...extra });
const run = (l, moves) => moves.reduce((acc, a) => {
  const r = step(l, acc.state, a);
  return { state: r.state, events: [...acc.events, ...r.events] };
}, { state: initialState(l), events: [] });

test('walls bump, floor moves, exit wins', () => {
  const l = lv(['#####', '#@.E#', '#####']);
  assert.deepEqual(run(l, ['up']).events, ['bumped']);
  const r = run(l, ['right', 'right']);
  assert.equal(r.state.won, true);
  assert.ok(r.events.includes('won'));
});

test('door needs the key', () => {
  const l = lv(['#######', '#k@D.E#', '#######']);
  assert.deepEqual(run(l, ['right']).events, ['bumped']);
  const r = run(l, ['left', 'right', 'right', 'right', 'right']);
  assert.ok(r.events.includes('picked_key') && r.events.includes('opened_door'));
  assert.equal(r.state.won, true);
});

test('crates push into floor but not into walls or other crates', () => {
  const l = lv(['#######', '#@C..E#', '#######']);
  const r = run(l, ['right']);
  assert.deepEqual(r.state.crates, [[3, 1]]);
  assert.deepEqual([r.state.x, r.state.y], [2, 1]);
  const stuck = lv(['#####', '#@CC#', '#E###', '#####']);
  assert.deepEqual(run(stuck, ['right']).events, ['bumped']);
  assert.deepEqual(legalMoves(stuck, initialState(stuck)), ['down', 'wait']);
});

test('spikes follow their period and phase, and kill on the turn they rise', () => {
  const l = lv(['#####', '#@^E#', '#####'], { spike: { period: 3, on: 1 }, spikes: [{ x: 2, y: 1, phase: 0 }] });
  assert.equal(spikeUp(l, 2, 1, 0), true);
  assert.equal(spikeUp(l, 2, 1, 1), false);
  assert.equal(spikeUp(l, 2, 1, 3), true);
  assert.equal(run(l, ['right']).state.dead, false); // arrives on turn 1, spike down
  assert.equal(run(l, ['wait', 'wait', 'right']).state.dead, true); // arrives on turn 3, spike up
});

test('the ascii view lists coordinates and legal moves', () => {
  const l = parseLevel(LEVELS[0]);
  const text = renderAscii(l, initialState(l));
  assert.match(text, /You are at \(1,1\)/);
  assert.match(text, /Legal moves now: .*right/);
});

test('every shipped level is solvable', () => {
  for (const level of LEVELS) {
    const r = solve(level);
    assert.ok(r.solvable, `${level.id} should be solvable`);
    const l = parseLevel(level);
    assert.equal(run(l, r.path).state.won, true, `${level.id} solution replays to a win`);
  }
});

test('level 3 punishes walking the spike hall without waiting', () => {
  const level = LEVELS[2];
  const l = parseLevel(level);
  const r = solve(level);
  // Reach the hall entrance via the solver's route, then try to walk left at a bad moment.
  const i = r.path.findIndex((_, k) => { const s = run(l, r.path.slice(0, k + 1)).state; return s.x === 9 && s.y === 7; });
  assert.ok(i >= 0, 'the solution passes (9,7)');
  const atDoor = run(l, r.path.slice(0, i + 1)).state;
  const bad = [0, 1, 2].map((w) => {
    let s = atDoor;
    for (let k = 0; k < w; k++) s = step(l, s, 'wait').state;
    for (let k = 0; k < 5; k++) s = step(l, s, "left").state;
    return s.dead;
  });
  assert.equal(bad.filter(Boolean).length, 2, 'two of three timings die');
});

test('patches are applied only when the level stays solvable', () => {
  const level = LEVELS[0];
  assert.match(applyPatch(level, [{ op: 'set', x: 9, y: 5, tile: '#' }, { op: 'set', x: 8, y: 6, tile: '#' }]).error || '', /can no longer be finished/);
  assert.match(applyPatch(level, [{ op: 'set', x: 1, y: 1, tile: '.' }]).error, /start or exit/);
  assert.match(applyPatch(level, [{ op: 'set', x: 0, y: 3, tile: '.' }]).error, /outer wall/);
  const ok = applyPatch(LEVELS[2], [{ op: 'set', x: 6, y: 7, tile: '.' }]);
  assert.ok(ok.level && ok.solution.solvable);
  assert.equal(ok.level.spikes.length, 4);
});
