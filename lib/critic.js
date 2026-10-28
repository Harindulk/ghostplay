// The designer-critic: Nemotron Ultra reads what the swarm did and writes a design report
// plus a small level patch. The solver must prove the patched level is still finishable.
import { chat, hasKey } from './nebius.js';
import { applyPatch, solve } from './solver.js';
import { STEP_CAP } from './personas.js';
import { TILES } from './engine.js';
export { evidence } from './swarm.js';

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'difficulty', 'issues', 'patch', 'citations'],
  properties: {
    verdict: { type: 'string', maxLength: 240 },
    difficulty: { type: 'integer', minimum: 1, maximum: 10 },
    issues: {
      type: 'array', maxItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'evidence', 'cells', 'personas', 'severity', 'fix'],
        properties: {
          title: { type: 'string', maxLength: 80 },
          evidence: { type: 'string', maxLength: 300 },
          cells: { type: 'array', maxItems: 8, items: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 } },
          personas: { type: 'array', items: { type: 'string', enum: ['casual', 'core', 'expert'] } },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          fix: { type: 'string', maxLength: 200 },
        },
      },
    },
    patch: {
      type: 'array', maxItems: 6,
      items: {
        type: 'object', additionalProperties: false, required: ['op', 'x', 'y', 'tile'],
        properties: { op: { type: 'string', enum: ['set'] }, x: { type: 'integer' }, y: { type: 'integer' }, tile: { type: 'string', enum: TILES.filter((t) => t !== '@' && t !== 'E') }, phase: { type: 'integer' } },
      },
    },
    citations: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['url', 'why'], properties: { url: { type: 'string' }, why: { type: 'string', maxLength: 160 } } } },
  },
};

export async function critique({ level, ev, clarity = [], sources = [], model }) {
  if (!hasKey()) return mockCritique(level, ev);
  const legend = '# wall, . floor, @ start, E exit, k key, D door (needs key), ^ spike (timed), C pushable crate';
  const t0 = Date.now();
  const messages = [
    { role: 'system', content: 'You are a senior level designer reviewing an automated playtest of a turn-based grid puzzle. Three AI player types played it several times: casual (skims, rarely waits), core (average), expert (plans ahead). Find the design problems the data proves, explain them with evidence, and propose the smallest level edit that fixes the worst one without making the level trivial. Coordinates are (x,y) with x the column. Never edit the start, the exit or the outer wall. Cite a source only if it supports your point. Reply with JSON only.' },
    { role: 'user', content: JSON.stringify({ level: { name: level.name, legend, grid: level.grid, spikeRule: `A spike at (x,y) is up (deadly) on turn t when (t + phase) % ${(level.spike || { period: 3 }).period} < ${(level.spike || { on: 1 }).on}; the turn counter starts at 0 and every move or wait is one turn.`, spikePhases: level.spikes || [], solverRouteMoves: solve(level).moves, stepCapPerPlayer: STEP_CAP }, playtest: ev, firstGlanceClarity: clarity, genreSources: sources.map((s) => ({ url: s.url, title: s.title, excerpt: s.snippet.slice(0, 600) })) }) },
  ];
  // Vercel stops a function at 60 s. The full-budget call gets 34 s; if it runs out, one
  // shorter retry with a 512-token reasoning budget fits in what is left.
  const ask = (msgs, short = false) => chat({ model, messages: msgs, maxTokens: short ? 2200 : 3500, temperature: 0.3, schema: SCHEMA, thinking: true, budget: short ? 512 : 2048, timeoutMs: short ? Math.max(8000, 55000 - (Date.now() - t0)) : 34000 });
  let r;
  try { r = await ask(messages); } catch (e) { if (e.name !== 'AbortError') throw e; r = await ask(messages, true); r.shortBudget = true; }
  let report = r.json;
  const calls = [r];
  if (!report) throw new Error('The critic did not return a readable report.');
  let applied = report.patch?.length ? applyPatch(level, report.patch) : null;
  if (applied?.error && Date.now() - t0 < 30000) {
    // One repair round with the validator's reason, if there is time left.
    const fix = await ask([...messages, { role: 'assistant', content: JSON.stringify(report) }, { role: 'user', content: `The patch was rejected: ${applied.error} Return the full JSON again with a corrected patch.` }], true).catch(() => null);
    if (fix) calls.push(fix);
    if (fix?.json) {
      const again = fix.json.patch?.length ? applyPatch(level, fix.json.patch) : null;
      if (!again?.error) { report = fix.json; applied = again; }
    }
  }
  return {
    report, patched: applied?.level || null, patchError: applied?.error || null, solution: applied?.solution || null,
    calls: calls.map((c) => ({ model: c.model, usage: c.usage, cost: c.cost, latencyMs: c.latencyMs, rate: c.rate, reasoned: Boolean(c.reasoning), shortBudget: Boolean(c.shortBudget) })),
  };
}

// shortcut: dev-only stand-in without a key; labelled mock in the UI and never recorded.
function mockCritique(level, ev) {
  const hot = ev.deathCells[0];
  const patch = hot ? [{ op: 'set', x: hot.x, y: hot.y, tile: '.' }] : [];
  const applied = patch.length ? applyPatch(level, patch) : null;
  return {
    report: {
      verdict: 'Mock report (no API key): the hottest death cell is turned into floor.', difficulty: 5,
      issues: hot ? [{ title: 'Deaths cluster on one tile', evidence: `${hot.deaths} deaths at (${hot.x},${hot.y}).`, cells: [[hot.x, hot.y]], personas: ['casual'], severity: 'high', fix: 'Make the tile safe.' }] : [],
      patch, citations: [],
    },
    patched: applied?.level || null, patchError: applied?.error || null, solution: applied?.solution || null,
    calls: [{ model: 'mock', usage: {}, cost: 0, latencyMs: 0, rate: {}, mock: true }],
  };
}
