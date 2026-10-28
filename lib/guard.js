// Budget guards for the public demo: per-IP hourly limits and a global daily cap, plus
// input checks for anything a browser can send.
import { parseLevel, TILES } from './engine.js';

// shortcut: per-instance memory; several serverless instances each get their own counters. Move to a KV store if the demo gets abused.
const hits = new Map();
let day = '', today = 0;

export function limited(request, kind, perHour) {
  if (process.env.LIVE_MODE_ENABLED === 'false') return 'Live mode is switched off. The showcase runs are real recorded runs.';
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const now = Date.now();
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; today = 0; }
  if (today >= Number(process.env.DAILY_LIVE_CAP || 120)) return "Today's live budget is used up. The showcase runs still work.";
  const key = `${kind}:${ip}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= perHour) return 'That is the live limit for your connection this hour. The showcase runs still work.';
  hits.set(key, [...recent, now]);
  today++;
  return null;
}

// Player calls are budgeted per run: a run is checked once when it starts, then gets a
// fixed number of calls, so a judge's run is never cut off halfway.
const runs = new Map();
export function limitedRun(request, runId) {
  if (!/^[a-z0-9-]{8,40}$/i.test(runId || '')) return 'Missing run id.';
  const r = runs.get(runId);
  if (!r) {
    const why = limited(request, 'run', Number(process.env.RUNS_PER_HOUR || 6));
    if (why) return why;
    runs.set(runId, { calls: 1, at: Date.now() });
    if (runs.size > 5000) for (const [k, v] of runs) if (Date.now() - v.at > 3600e3) runs.delete(k);
    return null;
  }
  if (++r.calls > Number(process.env.CALLS_PER_RUN || 450)) return 'This run has used its call budget.';
  return null;
}

export function checkLevel(level) {
  if (!level || !Array.isArray(level.grid)) return 'Missing level.';
  if (level.grid.length < 3 || level.grid.length > 14 || level.grid.some((r) => typeof r !== 'string' || r.length < 3 || r.length > 18)) return 'Levels must be between 3x3 and 18x14.';
  if (level.grid.some((r) => [...r].some((t) => !TILES.includes(t)))) return 'The level has an unknown tile.';
  try { parseLevel(level); } catch (e) { return e.message; }
  const sp = level.spike;
  if (sp && !(Number.isInteger(sp.period) && Number.isInteger(sp.on) && sp.period >= 2 && sp.period <= 6 && sp.on >= 1 && sp.on < sp.period)) return 'Bad spike timing.';
  return null;
}

export function cleanLevel(level) {
  return {
    name: String(level.name || 'Custom level').slice(0, 40),
    genre: String(level.genre || 'grid puzzle').slice(0, 40),
    grid: level.grid.map(String),
    spike: level.spike ? { period: level.spike.period, on: level.spike.on } : undefined,
    spikes: (level.spikes || []).slice(0, 60).map((s) => ({ x: s.x | 0, y: s.y | 0, phase: (s.phase | 0) % 6 })),
  };
}

export const ip = (request) => (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
