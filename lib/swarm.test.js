import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSwarm, ghostsFor, summarize } from './swarm.js';
import { solve } from './solver.js';
import { LEVELS } from './levels/index.js';

test('a perfect player wins and an impatient one dies in the spike hall', async () => {
  const level = LEVELS[2];
  const route = solve(level).path;
  // Same route, but one turn late into the spike hall (a wait just before the final run left).
  const hall = route.lastIndexOf('down') + 1;
  const late = [...route.slice(0, hall), 'wait', ...route.slice(hall)];
  const decide = async ({ personaId, history }) => {
    const plan = personaId === 'expert' ? route : late;
    return { moves: plan.slice(history.length, history.length + 3), thought: '', model: 'test', usage: { prompt_tokens: 100, completion_tokens: 10 }, cost: 0.001 };
  };
  const results = await runSwarm({ level, ghosts: ghostsFor(['expert', 'casual'], 2), decide });
  const s = summarize(level, results);
  assert.equal(s.personas.expert.completion, 1);
  assert.equal(s.personas.casual.completion, 0);
  assert.equal(s.personas.casual.died, 2);
  assert.ok(s.deathCells[0].y === 7, 'deaths cluster in the spike row');
  assert.equal(s.total.calls, results.reduce((n, g) => n + g.calls.length, 0));
});

test('a player that only bumps walls is marked stuck, not looped forever', async () => {
  const level = LEVELS[0];
  const decide = async () => ({ moves: ['up', 'up', 'up'], thought: '', model: 'test', usage: {}, cost: 0 });
  const [g] = await runSwarm({ level, ghosts: ghostsFor(['casual'], 1), decide });
  assert.equal(g.outcome, 'stuck');
  assert.ok(g.moves.length <= 12);
});
