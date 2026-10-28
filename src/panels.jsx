import { useMemo } from 'react';
import { parseLevel } from '../lib/engine.js';
import { PERSONAS } from '../lib/personas.js';
import Board from './Board.jsx';
import { usd, int, pct, ms, short } from './fmt.js';

// Who cleared the level, by skill. The answer to "is this level too hard, and for whom?"
export function Players({ summary, live, models }) {
  const rows = Object.entries(PERSONAS).map(([id, p]) => {
    if (live) {
      const gs = Object.values(live).filter((g) => g.personaId === id);
      return { id, p, cleared: gs.filter((g) => g.outcome === 'won').length, runs: gs.length, died: gs.filter((g) => g.outcome === 'died').length, stuck: gs.filter((g) => g.outcome === 'stuck' || g.outcome === 'gave_up').length, steps: null, playing: gs.filter((g) => g.outcome === 'playing').length };
    }
    const s = summary?.personas[id];
    return { id, p, cleared: s?.won, runs: s?.runs, died: s?.died, stuck: s ? s.stuck + s.gave_up : null, steps: s?.medianSteps };
  });
  return (
    <div className="card">
      <div className="card-head"><h2>Players</h2></div>
      <table className="tbl">
        <thead><tr><th>Player</th><th className="num">Cleared</th><th className="num">Died</th><th className="num">Stuck</th><th className="num">Steps</th></tr></thead>
        <tbody>
          {rows.map(({ id, p, cleared, runs, died, stuck, steps, playing }) => (
            <tr key={id}>
              <td>
                <span className="who"><i style={{ background: p.color }} />{p.label}</span>
                <span className="model" title={models?.[p.role]}>{short(models?.[p.role])}{p.thinking ? ` · budget ${p.budget}` : ''}</span>
              </td>
              <td className="num">{runs ? `${cleared}/${runs}` : '—'}{playing ? <span className="muted"> · {playing} playing</span> : null}</td>
              <td className="num">{runs ? died : '—'}</td>
              <td className="num">{runs ? stuck : '—'}</td>
              <td className="num">{steps ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">Steps is the median number of moves among the playtesters who cleared the level.</p>
    </div>
  );
}

// Which model did what, what it cost and how fast it answered.
const ROUTES = [
  ['Casual players', 'casual', 'many fast calls'],
  ['Core players', 'core', 'the everyday player'],
  ['Expert players', 'expert', 'reasoning budget 384'],
  ['First-glance check', 'vision', 'reads a picture of the level'],
  ['Design report and patch', 'critic', 'reasoning budget 2,048'],
];

export function Calls({ calls, models }) {
  const byModel = useMemo(() => {
    const m = {};
    for (const c of calls) {
      const k = c.model || '—';
      const r = (m[k] ||= { model: k, roles: new Set(), calls: 0, tokens: 0, usd: 0, ms: 0 });
      r.roles.add(c.role); r.calls++; r.usd += c.cost || 0; r.ms += c.latencyMs || 0;
      r.tokens += (c.usage?.prompt_tokens || 0) + (c.usage?.completion_tokens || 0);
    }
    return Object.values(m).sort((a, b) => b.calls - a.calls);
  }, [calls]);
  const total = byModel.reduce((t, r) => ({ calls: t.calls + r.calls, tokens: t.tokens + r.tokens, usd: t.usd + r.usd }), { calls: 0, tokens: 0, usd: 0 });
  const last = calls.at(-1);
  const left = [...calls].reverse().find((c) => c.rate?.['remaining-requests'])?.rate['remaining-requests'];
  return (
    <div className="card">
      <div className="card-head"><h2>Model calls</h2><span className="num muted">{int(total.calls)} calls · {usd(total.usd)}</span></div>
      {byModel.length ? (
        <table className="tbl">
          <thead><tr><th>Model</th><th className="num">Calls</th><th className="num">Avg</th><th className="num">Tokens</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {byModel.map((r) => (
              <tr key={r.model}>
                <td><span className="model strong">{short(r.model)}</span><span className="model">{[...r.roles].join(', ')}</span></td>
                <td className="num">{int(r.calls)}</td>
                <td className="num">{ms(r.ms / r.calls)}</td>
                <td className="num">{int(r.tokens)}</td>
                <td className="num">{usd(r.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <table className="tbl">
            <thead><tr><th>Job</th><th>Model on Token Factory</th></tr></thead>
            <tbody>
              {ROUTES.map(([job, role, why]) => (
                <tr key={job}><td><span className="who">{job}</span><span className="model">{why}</span></td><td><span className="model strong" title={models?.[role]}>{short(models?.[role])}</span></td></tr>
              ))}
            </tbody>
          </table>
          <p className="note">Once a run starts, every call shows up here with its model, speed, tokens and cost.</p>
        </>
      )}
      {last && <p className="note num">Last: {last.role} on {short(last.model)}, {ms(last.latencyMs)}{left ? ` · ${left} requests left this minute` : ''}</p>}
    </div>
  );
}

const SEV = { high: 'neg', medium: 'warn', low: 'neutral' };

export function Report({ phase, review, canWrite, onWrite, onRetest, canRetest, level, onHover, highlight = [], critic }) {
  const lv = useMemo(() => { try { return parseLevel(level); } catch { return null; } }, [level]);
  const plv = useMemo(() => (review?.patched ? parseLevel(review.patched) : null), [review]);
  const changed = (review?.report?.patch || []).map((p) => [p.x, p.y]);
  if (!review) {
    return (
      <section className="report" id="report">
        <div className="section-head">
          <h2>Design report</h2>
          <button className="btn primary" onClick={onWrite} disabled={!canWrite}>{phase === 'reviewing' ? 'Writing the report…' : 'Write the report'}</button>
        </div>
        <p className="empty wide">{phase === 'reviewing'
          ? `${short(critic)} is reading every run with a 2,048-token reasoning budget. This takes up to a minute.`
          : 'After the playtest, Nemotron Ultra reads every run, a vision model checks the level at first glance, and Tavily brings in what players say about problems like these.'}</p>
      </section>
    );
  }
  const r = review.report;
  return (
    <section className="report" id="report">
      <div className="section-head">
        <h2>Design report</h2>
        <span className="num muted">Difficulty {r.difficulty}/10</span>
      </div>
      <p className="verdict">{r.verdict}</p>
      <div className="grid">
        <div className="card span-8">
          <div className="card-head"><h3>Issues</h3><span className="muted">Point at an issue to light its tiles on the board below</span></div>
          <ul className="issues">
            {r.issues.map((i, k) => (
              <li key={k} tabIndex={0} onMouseEnter={() => onHover(i.cells)} onMouseLeave={() => onHover([])} onFocus={() => onHover(i.cells)} onBlur={() => onHover([])}>
                <div className="issue-top"><strong>{i.title}</strong><span className={`pill ${SEV[i.severity]}`}>{i.severity}</span></div>
                <p>{i.evidence}</p>
                <p className="fix">Fix: {i.fix}</p>
                <p className="meta num">{i.personas.map((p) => PERSONAS[p]?.label).join(', ')} · tiles {i.cells.map((c) => `(${c.join(',')})`).join(' ')}</p>
              </li>
            ))}
          </ul>
          <div className="patch">
            <div className="patch-head">
              <h3>Patch</h3>
              <span className="num muted">{r.patch.length ? `${r.patch.length} tile${r.patch.length > 1 ? 's' : ''}: ${r.patch.map((p) => `(${p.x},${p.y}) → ${tileName(p.tile)}`).join(', ')}` : 'No edit proposed'}</span>
            </div>
            {review.patchError && <p className="error">The solver rejected the patch: {review.patchError}</p>}
            {plv && lv && (
              <div className="patch-boards">
                <figure><Board lv={lv} turn={1} highlight={highlight.length ? highlight : changed} maxHeight={300} label="Level before the patch" /><figcaption>Before</figcaption></figure>
                <figure><Board lv={plv} turn={1} highlight={changed} maxHeight={300} label="Level after the patch" /><figcaption>After · solver finishes it in <span className="num">{review.solution?.moves}</span> moves</figcaption></figure>
              </div>
            )}
            {plv && phase !== 'done' && <button className="btn primary" onClick={onRetest} disabled={!canRetest}>{phase === 'retesting' ? 'Re-testing with the same 9 players…' : 'Apply patch and re-test'}</button>}
          </div>
        </div>
        <div className="stack span-4">
          <div className="card">
            <div className="card-head"><h3>First glance</h3><span className="model">{short(review.vision?.calls?.[0]?.model)}</span></div>
            {review.vision?.error ? <p className="empty">Vision check unavailable: {review.vision.error}</p> : (
              <>
                <p className="body">{review.vision?.goal}</p>
                {review.vision?.issues?.length ? <ul className="plain">{review.vision.issues.map((v, k) => <li key={k}>{v.issue} <span className="muted">({v.where})</span></li>)}</ul> : <p className="muted">Nothing looked unclear.</p>}
              </>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>Genre lens</h3><span className="model">Tavily</span></div>
            {review.research?.sources?.length ? (
              <ul className="sources">
                {review.research.sources.map((s) => {
                  const cited = r.citations?.find((c) => c.url === s.url);
                  return <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{cited && <p className="muted">Cited: {cited.why}</p>}</li>;
                })}
              </ul>
            ) : <p className="empty">{review.research?.error || review.research?.skipped || 'No sources found.'}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

const tileName = (t) => ({ '#': 'wall', '.': 'floor', '^': 'spike', k: 'key', D: 'door', C: 'crate' }[t] || t);

// Did the fix work? Same nine players, same seeds, before and after.
export function Compare({ before, after, beforeCalls, afterCalls }) {
  const cost = (rs) => rs.reduce((t, g) => t + g.calls.reduce((s, c) => s + (c.cost || 0), 0), 0);
  return (
    <section className="report" id="compare">
      <div className="section-head"><h2>Before and after the patch</h2><span className="num muted">{usd(cost(beforeCalls))} + {usd(cost(afterCalls))} in playtest calls</span></div>
      <p className="verdict">{compareLine(before, after)}</p>
      <div className="card compare">
        {Object.entries(PERSONAS).map(([id, p]) => {
          const b = before.personas[id], a = after.personas[id];
          const d = Math.round((a.completion - b.completion) * 100);
          return (
            <div className="cmp-row" key={id}>
              <span className="who"><i style={{ background: p.color }} />{p.label}</span>
              <div className="bars">
                <div className="bar"><span style={{ width: pct(b.completion), background: '#5a5a60' }} /></div>
                <div className="bar"><span style={{ width: pct(a.completion), background: p.color }} /></div>
              </div>
              <span className="num">{b.won}/{b.runs} → {a.won}/{a.runs}</span>
              <span className={`num delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? '+' : ''}{d} pts</span>
            </div>
          );
        })}
        <p className="note">Grey is before the patch, colour is after. Completion is the share of each player type that reached the exit.</p>
      </div>
    </section>
  );
}

// One sentence on what the fix changed, from the same numbers the bars show.
function compareLine(before, after) {
  const rows = Object.entries(PERSONAS).map(([id, p]) => ({ p, b: before.personas[id], a: after.personas[id] }));
  const best = rows.sort((x, y) => (y.a.completion - y.b.completion) - (x.a.completion - x.b.completion))[0];
  const total = (s) => Object.values(s.personas).reduce((n, x) => n + x.won, 0);
  const runs = Object.values(before.personas).reduce((n, x) => n + x.runs, 0);
  const lead = best.a.won === best.b.won ? 'No player type did better after the patch.' : `${best.p.label} players cleared ${best.b.won} of ${best.b.runs} before the patch and ${best.a.won} of ${best.a.runs} after it.`;
  return `${lead} Overall, ${total(before)} of ${runs} reached the exit before and ${total(after)} of ${runs} after.`;
}
