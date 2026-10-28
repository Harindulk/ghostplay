import { useEffect, useMemo, useRef, useState } from 'react';
import { parseLevel } from '../lib/engine.js';
import { solve } from '../lib/solver.js';
import { LEVELS } from '../lib/levels/index.js';
import { PERSONAS } from '../lib/personas.js';
import Board from './Board.jsx';
import Editor, { loadCustom } from './Editor.jsx';
import { Players, Calls, Report, Compare } from './panels.jsx';
import { getModels, playLive, review } from './pipeline.js';
import { drawBoard } from './draw.js';
import { short } from './fmt.js';

const HEAT = [['ghosts', 'Ghosts'], ['deaths', 'Deaths'], ['visits', 'Visits'], ['bumps', 'Wall bumps']];

// The headline finding, built from the summary so it always matches the table.
function finding(summary) {
  if (!summary) return null;
  const all = Object.values(summary.personas);
  const runs = all.reduce((n, p) => n + p.runs, 0), died = all.reduce((n, p) => n + p.died, 0), stuck = all.reduce((n, p) => n + p.stuck + p.gave_up, 0); // same as the Stuck column
  const worst = Object.entries(summary.personas).sort((a, b) => a[1].completion - b[1].completion)[0];
  const hot = summary.deathCells[0];
  const parts = [`${runs - all.reduce((n, p) => n + p.won, 0)} of ${runs} playtesters failed`];
  if (died) parts.push(`${died} died${hot ? `, ${hot.deaths} on the tile at (${hot.x},${hot.y})` : ''}`);
  if (stuck) parts.push(`${stuck} got stuck or ran out of moves`);
  return `${parts.join('; ')}. ${PERSONAS[worst[0]].label} players cleared ${worst[1].won} of ${worst[1].runs}.`;
}

export default function App() {
  const [levelId, setLevelId] = useState('level-3');
  const [custom, setCustom] = useState(loadCustom);
  const [editing, setEditing] = useState(false);
  const level = levelId === 'custom' ? custom : LEVELS.find((l) => l.id === levelId);
  const lv = useMemo(() => { try { return parseLevel(level); } catch { return null; } }, [level]);

  const [api, setApi] = useState(null);
  const [run, setRun] = useState(null); // { source, results, summary, recordedAt }
  const [live, setLive] = useState({}); // ghost id -> ghost while playing
  const [calls, setCalls] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | playing | played | reviewing | reviewed | retesting | done
  const [review_, setReview] = useState(null);
  const [retest, setRetest] = useState(null);
  const [error, setError] = useState(null);
  const [heatKind, setHeatKind] = useState('ghosts');
  const [turn, setTurn] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [highlight, setHighlight] = useState([]);
  const [view, setView] = useState('before'); // which run the board replays once a re-test exists
  const boardCanvas = useRef(null);

  useEffect(() => { getModels().then(setApi); }, []);

  // Load the recorded showcase run for a shipped level, if there is one.
  useEffect(() => {
    setRun(null); setReview(null); setRetest(null); setCalls([]); setLive({}); setError(null); setPhase('idle'); setTurn(0); setHeatKind('ghosts'); setView('before');
    if (levelId === 'custom') return;
    let cancelled = false;
    fetch(`/showcase/${levelId}.json`).then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (cancelled || !s) return;
      setRun({ source: 'showcase', results: s.results, summary: s.summary, recordedAt: s.recordedAt, models: s.models });
      setCalls(s.calls || []);
      if (s.review) { setReview(s.review); setPhase('reviewed'); } else setPhase('played');
      if (s.retest) { setRetest(s.retest); setPhase('done'); }
      setPlaying(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [levelId]);

  const shown = view === 'after' && retest ? retest : run;
  const results = shown?.results;
  const plv = useMemo(() => (review_?.patched ? parseLevel(review_.patched) : null), [review_]);
  const boardLv = view === 'after' && plv ? plv : lv;
  const maxTurn = results ? Math.max(...results.map((g) => g.path.length - 1)) : 0;

  // Replay clock.
  useEffect(() => {
    if (!playing || !results) return;
    if (turn >= maxTurn) { setPlaying(false); return; }
    const t = setTimeout(() => setTurn((x) => x + 1), 140);
    return () => clearTimeout(t);
  }, [playing, turn, maxTurn, results]);

  // Before a run, tick the spike clock so the level's timing is visible.
  const idle = !results && phase === 'idle' && !editing;
  useEffect(() => {
    if (!idle || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setTurn((x) => x + 1), 700);
    return () => clearInterval(t);
  }, [idle]);

  const ghosts = useMemo(() => {
    if (phase === 'playing' || phase === 'retesting') {
      return Object.values(live).map((g) => ({ personaId: g.personaId, at: g.path.at(-1), trail: g.path, outcome: g.outcome }));
    }
    if (!results && lv && !editing) {
      // Nobody has played yet: the nine players wait at the start.
      return Object.keys(PERSONAS).flatMap((personaId) => [0, 1, 2].map(() => ({ personaId, at: lv.start, trail: [], outcome: 'playing' })));
    }
    if (!results || heatKind !== 'ghosts') return [];
    return results.map((g) => {
      const i = Math.min(turn, g.path.length - 1);
      return { personaId: g.personaId, at: g.path[i], trail: g.path.slice(0, i + 1), outcome: turn >= g.path.length - 1 ? g.outcome : 'playing' };
    });
  }, [phase, live, results, turn, heatKind, lv, editing]);

  const addCall = (c) => setCalls((cs) => [...cs, c]);

  async function start() {
    setError(null); setReview(null); setRetest(null); setCalls([]); setLive({}); setHeatKind('ghosts'); setView('before'); setPhase('playing'); setPlaying(false);
    try {
      const out = await playLive(level, { mock: api?.mock, onCall: addCall, onGhost: (g) => setLive((m) => ({ ...m, [g.id]: g })) });
      setRun({ source: api?.mock ? 'mock' : 'live', ...out });
      setPhase('played'); setTurn(0); setPlaying(true);
    } catch (e) { setError(e.message); setPhase(results ? 'played' : 'idle'); }
  }

  async function writeReport() {
    setError(null); setPhase('reviewing');
    try {
      const out = await review(level, run.summary, run.results, cleanBoardImage(level), { onCall: addCall });
      setReview(out); setPhase('reviewed');
    } catch (e) { setError(e.message); setPhase('played'); }
  }

  async function applyAndRetest() {
    setError(null); setLive({}); setPhase('retesting');
    try {
      const out = await playLive(review_.patched, { mock: api?.mock, onCall: addCall, onGhost: (g) => setLive((m) => ({ ...m, [g.id]: g })) });
      setRetest(out); setPhase('done'); setView('after'); setHeatKind('ghosts'); setTurn(0); setPlaying(true);
    } catch (e) { setError(e.message); setPhase('reviewed'); }
  }

  const solvable = useMemo(() => (lv ? solve(level) : { solvable: false }), [level, lv]);
  const busy = ['playing', 'reviewing', 'retesting'].includes(phase);
  const liveOk = api?.live || api?.mock;
  const finished = Object.values(live).filter((g) => g.outcome !== 'playing').length;
  const goReport = () => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // The title row's button is always the next step of the loop.
  const next = phase === 'playing' ? { label: `Playing… ${finished} of 9 finished`, disabled: true }
    : phase === 'retesting' ? { label: 'Re-testing the patched level…', disabled: true }
    : phase === 'reviewing' ? { label: 'Writing the report…', disabled: true }
    : phase === 'played' ? { label: 'Write the design report', run: () => { goReport(); writeReport(); }, disabled: !liveOk }
    : phase === 'reviewed' && review_?.patched ? { label: 'Apply patch and re-test', run: () => { goReport(); applyAndRetest(); }, disabled: !liveOk }
    : phase === 'done' ? { label: 'See before and after', run: () => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' }) }
    : { label: 'Run 9 playtesters', run: start, disabled: busy || !liveOk || !solvable.solvable };
  const sourceLine = run?.source === 'showcase'
    ? `Recorded run from ${new Date(run.recordedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, real Nemotron calls on Nebius Token Factory`
    : run?.source === 'mock' ? 'Mock players: this server has no Token Factory key, so nothing here came from a model'
      : run?.source === 'live' ? 'Live run on Nebius Token Factory' : null;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <a className="mark" href="/" aria-label="Ghostplay home">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M8 26V14a8 8 0 0 1 16 0v12l-3-2-2.5 2-2.5-2-2.5 2L11 24z" fill="#f2f2f3" /><circle cx="13" cy="14" r="1.8" fill="#171719" /><circle cx="19" cy="14" r="1.8" fill="#171719" /></svg>
        </a>
        <a href="#lab" className="rail-link active" aria-label="Playtest lab" title="Playtest lab">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          <span>Lab</span>
        </a>
        <a href="#how" className="rail-link" aria-label="How it works" title="How it works">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>How</span>
        </a>
        <a href="https://github.com/Harindulk/ghostplay" className="rail-link rail-bottom" aria-label="Source on GitHub" title="Source on GitHub">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.8 5.8 3.1 5.8 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Code</span>
        </a>
      </nav>

      <main className="canvas" id="lab">
        <header className="title-row">
          <div className="title-text">
            <p className="product">Ghostplay <span>AI playtesters on NVIDIA Nemotron, served by Nebius Token Factory</span></p>
            <h1>{level?.name || 'Your level'}</h1>
            <p className="finding">{finding(run?.summary) || 'Nine AI playtesters, three for each Nemotron skill level, play this level and show you where players die.'}</p>
          </div>
          <div className="title-actions">
            {import.meta.env.DEV && run && run.source === 'live' && <button className="btn" onClick={() => saveShowcase(levelId, { run, calls, review_, retest })}>Save as showcase</button>}
            {levelId === 'custom' && <button className="btn" onClick={() => setEditing((e) => !e)} disabled={busy}>{editing ? 'Done editing' : 'Edit level'}</button>}
            {results && phase !== 'playing' && <button className="btn" onClick={start} disabled={busy || !liveOk}>Play again</button>}
            <button className="btn primary" onClick={next.run} disabled={next.disabled} title={!liveOk ? 'Live play is off on this server' : undefined}>{next.label}</button>
          </div>
        </header>

        <div className="tabs" role="tablist" aria-label="Level">
          {[...LEVELS, { id: 'custom', name: 'Your level' }].map((l) => (
            <button key={l.id} role="tab" aria-selected={levelId === l.id} className={levelId === l.id ? 'tab on' : 'tab'} onClick={() => { setLevelId(l.id); setEditing(l.id === 'custom' && !custom.touched); }} disabled={busy}>{l.name}</button>
          ))}
        </div>

        {sourceLine && <p className={`source ${run.source}`}>{sourceLine}</p>}
        {api?.error && <p className="error" role="alert">Can't reach the Ghostplay API right now ({api.error}). Recorded runs still replay.</p>}
        {api && !api.error && !api.live && !api.mock && <p className="source mock">Live play is switched off on this server. The recorded runs are real.</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <section className="grid">
          <div className="card board-card span-8">
            <div className="card-head">
              <h2>{editing ? 'Paint your level' : view === 'after' && retest ? 'Re-test on the patched level' : 'Playtest'}</h2>
              {retest && !editing && (
                <div className="seg" role="tablist" aria-label="Which run">
                  {[['before', 'Before fix'], ['after', 'After fix']].map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'seg-btn on' : 'seg-btn'} onClick={() => { setView(k); setTurn(0); setPlaying(true); }} disabled={busy}>{label}</button>
                  ))}
                </div>
              )}
              {!editing && (
                <div className="seg" role="tablist" aria-label="Board view">
                  {HEAT.map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={heatKind === k} className={heatKind === k ? 'seg-btn on' : 'seg-btn'} onClick={() => setHeatKind(k)} disabled={!results && k !== 'ghosts'}>{label}</button>
                  ))}
                </div>
              )}
            </div>
            {editing ? (
              <Editor level={custom} onChange={(l) => { setCustom(l); setRun(null); setReview(null); setRetest(null); }} solvable={solvable} />
            ) : lv ? (
              <>
                <Board lv={boardLv} turn={turn} ghosts={ghosts} heat={heatKind !== 'ghosts' ? shown?.summary?.heat : null} heatKind={heatKind !== 'ghosts' ? heatKind : null} highlight={highlight} showSpikes={phase !== 'playing' && phase !== 'retesting'} canvasRef={boardCanvas} label={`${level.name}: ${finding(run?.summary) || 'not played yet'}`} />
                <div className="board-foot">
                  {results && heatKind === 'ghosts' && phase !== 'playing' && phase !== 'retesting' ? (
                    <>
                      <button className="btn small" onClick={() => { if (turn >= maxTurn) setTurn(0); setPlaying((p) => !p); }}>{playing ? 'Pause' : turn >= maxTurn ? 'Replay' : 'Play'}</button>
                      <input type="range" min="0" max={maxTurn} value={turn} onChange={(e) => { setPlaying(false); setTurn(+e.target.value); }} aria-label="Replay turn" />
                      <span className="num muted">Turn {turn} of {maxTurn}</span>
                    </>
                  ) : (
                    <span className="muted">{phase === 'playing' || phase === 'retesting' ? 'Spikes are shown raised while ghosts play at their own pace; the replay shows exact timing.' : solvable.solvable ? `The solver finishes this level in ${solvable.moves} moves.${lv.map.some((r) => r.includes('^')) ? ` Spikes are up ${lv.spike.on} turns in every ${lv.spike.period}.` : ''}` : 'This level cannot be finished yet.'}</span>
                  )}
                  <span className="legend">
                    {Object.values(PERSONAS).map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label}</span>)}
                  </span>
                </div>
                <Thoughts ghosts={phase === 'playing' || phase === 'retesting' ? Object.values(live) : results} turn={phase === 'playing' || phase === 'retesting' ? Infinity : turn} />
              </>
            ) : <p className="empty">This level has a problem: it needs one start and one exit.</p>}
          </div>

          <div className="stack span-4">
            <Players summary={shown?.summary} live={phase === 'playing' ? live : null} models={api?.models} />
            <Calls calls={calls} models={api?.models} />
          </div>
        </section>

        <Report
          phase={phase} review={review_} canWrite={Boolean(results) && !busy && liveOk} onWrite={writeReport}
          onRetest={applyAndRetest} canRetest={Boolean(review_?.patched) && !busy && liveOk}
          level={level} onHover={setHighlight} highlight={highlight} critic={api?.models?.critic}
        />
        {retest && <Compare before={run.summary} after={retest.summary} beforeCalls={run.results} afterCalls={retest.results} />}

        <section className="how" id="how">
          <h2>How it works</h2>
          <div className="how-grid">
            <p>Each playtester is a ghost driven by an NVIDIA Nemotron model on Nebius Token Factory. It sees the board as text with coordinates and spike timing, and commits to its next one to four moves, which is how real players act between glances. Model size and reasoning budget set the skill: {Object.values(PERSONAS).map((p) => `${p.label} is ${short(api?.models?.[p.role]) || p.role}`).join(', ')}.</p>
            <p>After the swarm plays, Nemotron Super VL looks at a picture of the level like a first-time player, Tavily looks up what players and designers say about the problems the swarm hit, and Nemotron Ultra writes the report and a patch of up to six tiles. A breadth-first solver must prove the patched level can still be finished before you can apply it, and the same nine ghosts replay it.</p>
            <p>Limits, honestly: these are language models playing from a text view, so they approximate players rather than replace them. Ghostplay measures difficulty, clarity and softlocks, not fun, and it only reads its own grid format today.</p>
          </div>
        </section>
        <footer className="foot">
          <span>Ghostplay runs NVIDIA Nemotron models on Nebius Token Factory, with Tavily for the genre lens. Open source under the MIT licence, built by Harindu at StarFun Games for the Nebius x NVIDIA Global AI Hackathon.</span>
          <a href="https://github.com/Harindulk/ghostplay">github.com/Harindulk/ghostplay</a>
        </footer>
      </main>
    </div>
  );
}


// A plain picture of the level with no ghosts or overlays, for the vision check.
function cleanBoardImage(level) {
  const lv = parseLevel(level);
  const cell = 40;
  const c = document.createElement('canvas');
  c.width = lv.w * cell; c.height = lv.h * cell;
  drawBoard(c.getContext('2d'), { lv, cell, turn: 0 });
  return c.toDataURL('image/png');
}

// Dev only: download the finished live run so it can ship in public/showcase/ as a recorded run.
function saveShowcase(levelId, { run, calls, review_, retest }) {
  const data = { levelId, recordedAt: new Date().toISOString(), results: run.results, summary: run.summary, calls, review: review_, retest };
  const a = document.createElement('a');
  a.download = `${levelId}.json`;
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.click();
}

// What one ghost of each type was thinking at this point of the replay.
function Thoughts({ ghosts, turn }) {
  if (!ghosts?.length) return null;
  const rows = Object.entries(PERSONAS).map(([id, p]) => {
    const g = ghosts.find((x) => x.personaId === id && x.thoughts?.some((t) => t.text));
    const t = g?.thoughts.filter((x) => x.turn <= turn && x.text).at(-1);
    return t ? { id, p, t } : null;
  }).filter(Boolean);
  if (!rows.length) return null;
  return (
    <ul className="thoughts" aria-label="What the playtesters were thinking">
      {rows.map(({ id, p, t }) => (
        <li key={id}><span className="who"><i style={{ background: p.color }} />{p.label}</span><span className="num muted">turn {t.turn}</span><q>{t.text}</q></li>
      ))}
    </ul>
  );
}
