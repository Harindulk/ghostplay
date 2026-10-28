// Regression tests for the issues found in code review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSwarm, ghostsFor } from './swarm.js';
import { checkLevel } from './guard.js';
import { chat, compat } from './nebius.js';
import { LEVELS } from './levels/index.js';

test('one failing ghost stops the rest of the swarm instead of spending more calls', async () => {
  let calls = 0;
  const decide = async ({ personaId }) => {
    calls++;
    if (personaId === 'core') throw new Error('budget used');
    await new Promise((r) => setTimeout(r, 5));
    return { moves: ['wait'], thought: '', model: 't', usage: {}, cost: 0 };
  };
  await assert.rejects(runSwarm({ level: LEVELS[0], ghosts: ghostsFor(), decide, concurrency: 9 }), /budget used/);
  const after = calls;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, after, 'no ghost asked for another move after the failure');
});

test('levels with more than 8 crates are refused before any solver runs', () => {
  const grid = ['############', '#@CCCCCCCCC#', '#.........E#', '############'];
  assert.match(checkLevel({ grid }), /at most 8 crates/);
});

test('a 400 that does not name a feature is an error, not a reason to drop structured output', async () => {
  process.env.NEBIUS_API_KEY = 'test';
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":"image could not be decoded"}', { status: 400 });
  try {
    await assert.rejects(chat({ model: 'm-test', messages: [], schema: { type: 'object' }, thinking: true }), /400/);
    assert.deepEqual(compat['m-test'], {}, 'no feature flag was set');
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.response_format?.type === 'json_schema') return new Response('response_format json_schema is not supported', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: {} }), { status: 200 });
    };
    const r = await chat({ model: 'm-test2', messages: [], schema: { type: 'object' } });
    assert.deepEqual(r.json, { ok: true });
    assert.ok(compat['m-test2'].noSchema, 'the named feature is dropped and remembered');
  } finally {
    globalThis.fetch = real;
    delete process.env.NEBIUS_API_KEY;
  }
});
