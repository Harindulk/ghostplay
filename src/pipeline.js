// The browser side of a playtest: swarm -> evidence -> vision + Tavily -> Ultra report -> re-test.
import { runSwarm, ghostsFor, summarize, evidence } from '../lib/swarm.js';
import { PERSONAS } from '../lib/personas.js';

async function post(path, body) {
  const r = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: `${path} returned ${r.status}` }));
  if (!r.ok) throw Object.assign(new Error(data.error || `${path} failed (${r.status})`), { status: r.status });
  return data;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Paces player calls to Token Factory's per-minute limit. Starts near the default 60 RPM,
// slows down when the remaining-requests header runs low or a 429 comes back.
export function pacer(rpm = 60) {
  let gap = 60000 / rpm, next = 0;
  return {
    async wait() { const now = Date.now(); const at = Math.max(now, next); next = at + gap; if (at > now) await sleep(at - now); },
    saw(rate) { const left = Number(rate?.['remaining-requests']); if (Number.isFinite(left) && left < 5) next = Math.max(next, Date.now() + 4000); },
    slow() { gap = Math.min(gap * 1.6, 6000); next = Date.now() + 3000; },
  };
}

// A call that survives a busy endpoint: up to three retries on 429 and 5xx.
async function postRetry(path, body, pace) {
  for (let i = 0; ; i++) {
    await pace?.wait();
    try { const d = await post(path, body); pace?.saw(d.rate); return d; } catch (e) {
      const retry = e.status === 429 && !/live limit|budget|switched off/.test(e.message) || e.status >= 500;
      if (!retry || i >= 3) throw e;
      if (e.status === 429) pace?.slow();
      await sleep(1500 * 2 ** i);
    }
  }
}

export const getModels = () => fetch('/api/models').then((r) => r.json()).catch(() => ({ live: false, error: 'API unreachable' }));

// Plays the swarm live. onCall(call) fires for every model call, onGhost(ghost) on every move.
export async function playLive(level, { onCall, onGhost, mock = false }) {
  const pace = mock ? null : pacer(Number(import.meta.env.VITE_RPM || 60));
  const decide = async ({ personaId, seed, state, history }) => {
    const d = await postRetry('step', { personaId, seed, level, state, history }, pace);
    onCall({ at: Date.now(), role: PERSONAS[personaId].label, ...d });
    return d;
  };
  const results = await runSwarm({ level, ghosts: ghostsFor(), decide, onUpdate: (g) => onGhost({ ...g }), concurrency: 6 });
  return { results, summary: summarize(level, results) };
}

// The words Tavily searches for come from what the swarm actually hit.
export function problemsFrom(ev) {
  const out = [];
  if (ev.deathCells.length) out.push('timed hazard deaths');
  if (ev.failedRuns.some((r) => r.outcome === 'stuck')) out.push('softlock stuck player');
  if (ev.wallBumpHotspots.length) out.push('unclear path');
  return out.length ? out : ['difficulty curve'];
}

export async function review(level, summary, results, boardImage, { onCall }) {
  const ev = evidence(level, summary, results);
  const [vision, research] = await Promise.all([
    post('vision', { image: boardImage }).catch((e) => ({ error: e.message, issues: [] })),
    post('research', { genre: level.genre || 'grid puzzle', problems: problemsFrom(ev) }).catch((e) => ({ error: e.message, sources: [] })),
  ]);
  for (const c of vision.calls || []) onCall({ at: Date.now(), role: 'Vision', ...c });
  const out = await post('report', { level, evidence: ev, clarity: vision.issues || [], sources: research.sources || [] });
  for (const c of out.calls || []) onCall({ at: Date.now(), role: 'Critic', ...c });
  return { ...out, evidence: ev, vision, research };
}
