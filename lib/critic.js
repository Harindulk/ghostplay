// The designer-critic: Nemotron Ultra reads what the swarm did and writes a design report
// plus a small level patch. The solver must prove the patched level is still finishable.
import { chat, hasKey } from './nebius.js';
import { applyPatch } from './solver.js';
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
  const messages = [
    { role: 'system', content: 'You are a senior level designer reviewing an automated playtest of a turn-based grid puzzle. Three AI player types played it several times: casual (skims, rarely waits), core (average), expert (plans ahead). Find the design problems the data proves, explain them with evidence, and propose the smallest level edit that fixes the worst one without making the level trivial. Coordinates are (x,y) with x the column. Never edit the start, the exit or the outer wall. Cite a source only if it supports your point. Reply with JSON only.' },
    { role: 'user', content: JSON.stringify({ level: { name: level.name, legend, grid: level.grid, spikeTiming: level.spike || { period: 3, on: 1 }, spikePhases: level.spikes || [] }, playtest: ev, firstGlanceClarity: clarity, genreSources: sources.map((s) => ({ url: s.url, title: s.title, excerpt: s.snippet.slice(0, 600) })) }) },
  ];
  const ask = (msgs) => chat({ model, messages: msgs, maxTokens: 3500, temperature: 0.3, schema: SCHEMA, thinking: true, budget: 2048, timeoutMs: 50000 });
  let r = await ask(messages);
  let report = r.json;
  const calls = [r];
  if (!report) throw new Error('The critic did not return a readable report.');
  let applied = report.patch?.length ? applyPatch(level, report.patch) : null;
  if (applied?.error) {
    // One repair round with the validator's reason.
    r = await ask([...messages, { role: 'assistant', content: JSON.stringify(report) }, { role: 'user', content: `The patch was rejected: ${applied.error} Return the full JSON again with a corrected patch.` }]);
    calls.push(r);
    if (r.json) { report = r.json; applied = report.patch?.length ? applyPatch(level, report.patch) : null; }
  }
  return {
    report, patched: applied?.level || null, patchError: applied?.error || null, solution: applied?.solution || null,
    calls: calls.map((c) => ({ model: c.model, usage: c.usage, cost: c.cost, latencyMs: c.latencyMs, rate: c.rate, reasoned: Boolean(c.reasoning) })),
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
