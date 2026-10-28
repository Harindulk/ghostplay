import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitedRun, checkLevel } from './guard.js';
import { LEVELS } from './levels/index.js';

const req = (ip) => new Request('http://x/api/step', { headers: { 'x-forwarded-for': ip } });

test('a run is checked once at its start, then never cut off before its call budget', () => {
  process.env.RUNS_PER_HOUR = '2'; process.env.CALLS_PER_RUN = '5';
  assert.equal(limitedRun(req('1.1.1.1'), 'run-aaaaaaaa'), null);
  for (let i = 0; i < 4; i++) assert.equal(limitedRun(req('1.1.1.1'), 'run-aaaaaaaa'), null);
  assert.match(limitedRun(req('1.1.1.1'), 'run-aaaaaaaa'), /call budget/);
  assert.equal(limitedRun(req('1.1.1.1'), 'run-bbbbbbbb'), null);
  assert.match(limitedRun(req('1.1.1.1'), 'run-cccccccc'), /live limit/);
  assert.equal(limitedRun(req('2.2.2.2'), 'run-dddddddd'), null, 'other connections are unaffected');
  assert.match(limitedRun(req('3.3.3.3'), 'x'), /run id/);
});

test('levels from the browser are checked before anything runs', () => {
  assert.equal(checkLevel(LEVELS[2]), null);
  assert.match(checkLevel({ grid: ['###', '#@#', '###'] }), /exit/);
  assert.match(checkLevel({ grid: ['#####', '#@Z E#', '#####'] }), /unknown tile/);
  assert.match(checkLevel({ grid: Array(20).fill('#####') }), /between/);
  assert.match(checkLevel({ ...LEVELS[2], spike: { period: 3, on: 3 } }), /spike timing/);
});
