import { test } from 'node:test';
import assert from 'node:assert/strict';
import { critique } from './critic.js';
import { evidence, runSwarm, ghostsFor, summarize } from './swarm.js';
import { parseJson } from './nebius.js';
import { solve } from './solver.js';
import { LEVELS } from './levels/index.js';

test('without a key the critic returns a labelled mock report whose patch the solver accepted', async () => {
  delete process.env.NEBIUS_API_KEY;
  const level = LEVELS[2];
  const route = solve(level).path;
  const hall = route.lastIndexOf('down') + 1;
  const late = [...route.slice(0, hall), 'wait', ...route.slice(hall)];
  const decide = async ({ history }) => ({ moves: late.slice(history.length, history.length + 3), thought: 't', model: 'test', usage: {}, cost: 0 });
  const results = await runSwarm({ level, ghosts: ghostsFor(['casual'], 2), decide });
  const ev = evidence(level, summarize(level, results), results);
  assert.ok(ev.deathCells.length && ev.failedRuns.length);
  const out = await critique({ level, ev });
  assert.equal(out.calls[0].mock, true);
  assert.ok(out.patched, 'the mock patch passed the solver');
  assert.ok(solve(out.patched).solvable);
});

test('model JSON is read even with thinking text or prose around it', () => {
  assert.deepEqual(parseJson('<think>wait for the gap</think>{"moves":["left"],"thought":"go"}'), { moves: ['left'], thought: 'go' });
  assert.deepEqual(parseJson('Sure! {"a":1} hope that helps'), { a: 1 });
  assert.equal(parseJson('no json here'), null);
});
