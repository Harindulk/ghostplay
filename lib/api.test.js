// The serverless handlers, called directly with web Requests (no key, so mock players).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as step from '../api/step.js';
import * as report from '../api/report.js';
import * as models from '../api/models.js';
import { LEVELS } from './levels/index.js';

delete process.env.NEBIUS_API_KEY;
const post = (handler, body) => handler.POST(new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify(body) }));
const state = { x: 1, y: 1, turn: 0, key: false, crates: [[4, 5]] };

test('step rejects bad input before any model call', async () => {
  assert.equal((await post(step, { personaId: 'boss', level: LEVELS[2], state })).status, 400);
  assert.equal((await post(step, { personaId: 'casual', level: { grid: ['#'] }, state })).status, 400);
  assert.equal((await post(step, { personaId: 'casual', level: LEVELS[2], state: { x: 'a' } })).status, 400);
  const notJson = await step.POST(new Request('http://x/api', { method: 'POST', body: 'nope' }));
  assert.equal(notJson.status, 400);
});

test('step answers with legal moves from a mock player when no key is set', async () => {
  const r = await post(step, { personaId: 'expert', seed: 1, level: LEVELS[2], state, history: [], runId: 'test-run-1' });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.mock, true);
  assert.ok(d.moves.length >= 1 && d.moves.length <= 3);
  assert.ok(d.moves.every((m) => ['up', 'down', 'left', 'right', 'wait'].includes(m)));
});

test('report refuses missing or oversized evidence', async () => {
  assert.equal((await post(report, { level: LEVELS[2] })).status, 400);
  assert.equal((await post(report, { level: LEVELS[2], evidence: { x: 'a'.repeat(30000) } })).status, 400);
});

test('models says plainly that the server is in mock mode', async () => {
  const d = await (await models.GET()).json();
  assert.equal(d.mock, true);
  assert.equal(d.live, false);
  assert.ok(d.models.critic);
});
