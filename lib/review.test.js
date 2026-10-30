// Regression tests for the issues found in code review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSwarm, ghostsFor } from './swarm.js';
import { checkLevel } from './guard.js';
import { chat, compat } from './nebius.js';
import { solve } from './solver.js';
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

test('a failed swarm aborts the calls still in flight and leaves no worker running', async () => {
  let aborted = 0, updates = 0;
  const decide = ({ personaId, signal }) => new Promise((res, rej) => {
    if (personaId === 'core') return setTimeout(() => rej(new Error('budget used')), 5);
    signal.addEventListener('abort', () => { aborted++; setTimeout(() => rej(signal.reason), 10); }, { once: true }); // the others hang until stopped
  });
  await assert.rejects(runSwarm({ level: LEVELS[0], ghosts: ghostsFor(), decide, onUpdate: () => updates++, concurrency: 9 }), /budget used/);
  assert.equal(aborted, 6, 'every other in-flight call was aborted, and the swarm waited for them');
  const after = updates;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(updates, after, 'no ghost moved after the swarm rejected');
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

test('a 400 only turns a feature off when its own message blames it and the retry without it works', async () => {
  process.env.NEBIUS_API_KEY = 'test';
  const real = globalThis.fetch;
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: {} }), { status: 200 });
  try {
    // A validation error that echoes the request names response_format only inside the echo.
    globalThis.fetch = async (url, init) => new Response(JSON.stringify({ object: 'error', code: 400,
      message: `[{'type': 'less_than_equal', 'loc': ('body', 'temperature'), 'msg': 'Input should be less than or equal to 2', 'input': ${JSON.stringify(init.body)}}]` }), { status: 400 });
    await assert.rejects(chat({ model: 'm-echo', messages: [], schema: { type: 'object' }, thinking: true }), /400/);
    assert.deepEqual(compat['m-echo'], {}, 'the echoed body did not turn anything off');

    // Dropping the schema does not fix the call, so it is not remembered.
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      if (JSON.parse(init.body).response_format?.type === 'json_schema') return new Response('{"message":"response_format: schema failed to compile"}', { status: 400 });
      return new Response('{"message":"maximum context length is 8192 tokens"}', { status: 400 });
    };
    await assert.rejects(chat({ model: 'm-ctx', messages: [], schema: { type: 'object' } }), /context length/);
    assert.equal(calls, 2);
    assert.deepEqual(compat['m-ctx'], {}, 'structured output stays on for the next call');

    // A thinking rejection that also echoes response_format drops thinking only.
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.chat_template_kwargs) return new Response(JSON.stringify({ message: `chat_template_kwargs not supported, input: ${init.body}` }), { status: 400 });
      assert.equal(body.response_format?.type, 'json_schema');
      return ok();
    };
    const r = await chat({ model: 'm-think', messages: [], schema: { type: 'object' }, thinking: true });
    assert.deepEqual(r.json, { ok: true });
    assert.ok(compat['m-think'].noThinking);
    assert.equal(compat['m-think'].noSchema, undefined);
  } finally {
    globalThis.fetch = real;
    delete process.env.NEBIUS_API_KEY;
  }
});

test('one solve never visits more than its state budget, even on the largest level a browser can send', () => {
  const grid = ['##################', '#@.......^.......#', '#..C...C...C...C.#', '#................#', '#...^......^.....#', '#..C...C...C...C.#', '#................#', '#................#', '#.......^........#', '#................#', '#................#', '#..............###', '#..............#E#', '##################'];
  const level = { grid, spike: { period: 6, on: 1 } };
  assert.equal(checkLevel(level), null, 'the API accepts this level');
  for (const budget of [5000, 60000]) {
    const r = solve(level, budget);
    assert.equal(r.exhausted, true);
    assert.ok(r.states <= budget, `${r.states} states visited on a ${budget} budget`);
  }
  for (const lv of LEVELS) assert.equal(solve(lv).solvable, true);
});
