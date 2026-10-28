// Runs the ghost swarm on a level. `decide` is injected: the browser passes a fetch to
// /api/step, the recording script calls the player directly. Same loop either way.
import { parseLevel, initialState, step, stateKey } from './engine.js';
import { PERSONAS, SEEDS_PER_PERSONA, STEP_CAP } from './personas.js';

export function ghostsFor(personaIds = Object.keys(PERSONAS), seeds = SEEDS_PER_PERSONA) {
  return personaIds.flatMap((personaId) => Array.from({ length: seeds }, (_, seed) => ({ id: `${personaId}-${seed}`, personaId, seed })));
}

// Plays one ghost to the end. onUpdate(ghost) fires after every move for live animation.
export async function playGhost({ level, ghost, decide, onUpdate = () => {}, cap = STEP_CAP }) {
  const lv = parseLevel(level);
  let state = initialState(lv);
  const g = { ...ghost, path: [[state.x, state.y]], moves: [], events: [], thoughts: [], calls: [], outcome: 'playing', bumps: [], deathAt: null };
  const seen = new Map();
  while (g.outcome === 'playing') {
    g.waiting = true; onUpdate(g); // the model is deciding
    const d = await decide({ personaId: g.personaId, seed: g.seed, state, history: g.moves });
    g.waiting = false;
    g.calls.push({ model: d.model, usage: d.usage, cost: d.cost, latencyMs: d.latencyMs, rate: d.rate, parseFailed: d.parseFailed, mock: d.mock });
    g.thoughts.push({ turn: state.turn, text: d.thought });
    for (const a of d.moves) {
      const r = step(lv, state, a);
      g.moves.push(a);
      g.events.push(r.events);
      if (r.events.includes('bumped')) g.bumps.push([state.x, state.y]);
      state = r.state;
      g.path.push([state.x, state.y]);
      const k = stateKey(lv, state);
      seen.set(k, (seen.get(k) || 0) + 1);
      if (state.won) g.outcome = 'won';
      else if (state.dead) { g.outcome = 'died'; g.deathAt = [state.x, state.y]; }
      else if (seen.get(k) >= 4) g.outcome = 'stuck';
      else if (g.moves.length >= cap) g.outcome = 'gave_up';
      g.state = state;
      onUpdate(g);
      if (g.outcome !== 'playing') break;
    }
  }
  return g;
}

// Run many ghosts with bounded concurrency.
export async function runSwarm({ level, ghosts, decide, onUpdate, concurrency = 6 }) {
  const out = new Array(ghosts.length);
  let next = 0;
  const worker = async () => {
    while (next < ghosts.length) {
      const i = next++;
      out[i] = await playGhost({ level, ghost: ghosts[i], decide, onUpdate });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ghosts.length) }, worker));
  return out;
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// Per-persona completion and heatmaps of deaths, visits and wall bumps.
export function summarize(level, results) {
  const lv = parseLevel(level);
  const grid = () => Array.from({ length: lv.h }, () => Array(lv.w).fill(0));
  const heat = { deaths: grid(), visits: grid(), bumps: grid() };
  const personas = {};
  let tokensIn = 0, tokensOut = 0, usd = 0, calls = 0, parseFailures = 0;
  const byModel = {};
  for (const g of results) {
    const p = (personas[g.personaId] ||= { runs: 0, won: 0, died: 0, stuck: 0, gave_up: 0, wonSteps: [] });
    p.runs++; p[g.outcome]++;
    if (g.outcome === 'won') p.wonSteps.push(g.moves.length);
    for (const [x, y] of g.path) heat.visits[y][x]++;
    for (const [x, y] of g.bumps) heat.bumps[y][x]++;
    if (g.deathAt) heat.deaths[g.deathAt[1]][g.deathAt[0]]++;
    for (const c of g.calls) {
      calls++; usd += c.cost || 0; parseFailures += c.parseFailed ? 1 : 0;
      tokensIn += c.usage?.prompt_tokens || 0; tokensOut += c.usage?.completion_tokens || 0;
      const m = (byModel[c.model] ||= { calls: 0, usd: 0, ms: 0 });
      m.calls++; m.usd += c.cost || 0; m.ms += c.latencyMs || 0;
    }
  }
  for (const p of Object.values(personas)) { p.completion = p.won / p.runs; p.medianSteps = median(p.wonSteps); delete p.wonSteps; }
  const hot = [];
  heat.deaths.forEach((row, y) => row.forEach((n, x) => { if (n) hot.push({ x, y, deaths: n }); }));
  hot.sort((a, b) => b.deaths - a.deaths);
  return { personas, heat, deathCells: hot.slice(0, 6), total: { calls, tokensIn, tokensOut, usd, parseFailures }, byModel };
}

// Compress the swarm's runs into what a designer needs: rates, hot cells, a few failed runs.
export function evidence(level, summary, results) {
  const fails = [];
  for (const pid of ['casual', 'core', 'expert']) {
    for (const g of results.filter((r) => r.personaId === pid && r.outcome !== 'won').slice(0, 2)) {
      fails.push({ persona: pid, outcome: g.outcome, endedAt: g.path.at(-1), moves: g.moves.join(' '), lastThought: g.thoughts.at(-1)?.text || '' });
    }
  }
  const bumps = [];
  summary.heat.bumps.forEach((row, y) => row.forEach((n, x) => { if (n >= 3) bumps.push({ x, y, bumps: n }); }));
  return {
    completion: Object.fromEntries(Object.entries(summary.personas).map(([k, p]) => [k, { cleared: `${p.won}/${p.runs}`, died: p.died, stuck: p.stuck, ranOutOfMoves: p.gave_up, medianSteps: p.medianSteps }])),
    deathCells: summary.deathCells,
    wallBumpHotspots: bumps.sort((a, b) => b.bumps - a.bumps).slice(0, 5),
    failedRuns: fails,
  };
}
