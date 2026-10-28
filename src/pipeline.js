// The browser side of a playtest: swarm -> evidence -> vision + Tavily -> Ultra report -> re-test.
import { runSwarm, ghostsFor, summarize, evidence } from '../lib/swarm.js';
import { PERSONAS } from '../lib/personas.js';

async function post(path, body) {
  const r = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: `${path} returned ${r.status}` }));
  if (!r.ok) throw new Error(data.error || `${path} failed (${r.status})`);
  return data;
}

export const getModels = () => fetch('/api/models').then((r) => r.json()).catch(() => ({ live: false, error: 'API unreachable' }));

// Plays the swarm live. onCall(call) fires for every model call, onGhost(ghost) on every move.
export async function playLive(level, { onCall, onGhost }) {
  const decide = async ({ personaId, state, history }) => {
    const d = await post('step', { personaId, level, state, history });
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
