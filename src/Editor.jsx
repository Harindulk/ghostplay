import { useMemo, useState } from 'react';
import { parseLevel } from '../lib/engine.js';
import Board from './Board.jsx';

const PAINTS = [['#', 'Wall'], ['.', 'Floor'], ['^', 'Spike'], ['k', 'Key'], ['D', 'Door'], ['C', 'Crate'], ['@', 'Start'], ['E', 'Exit']];
const STORE = 'ghostplay.custom';

const blank = () => ({
  id: 'custom', name: 'Your level', genre: 'grid puzzle', spike: { period: 3, on: 1 }, spikes: [],
  grid: ['###########', '#@........#', '#.........#', '#.........#', '#.........#', '#........E#', '###########'],
});

export function loadCustom() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s?.grid) return { ...s, touched: true }; } catch { /* first visit */ }
  return blank();
}

// Paint tiles straight onto the board; the solver says at once whether the level can be finished.
export default function Editor({ level, onChange, solvable }) {
  const [paint, setPaint] = useState('#');
  const [showJson, setShowJson] = useState(false);
  const [jsonErr, setJsonErr] = useState(null);
  const lv = useMemo(() => { try { return parseLevel(level); } catch { return null; } }, [level]);

  const save = (l) => { const next = { ...l, touched: true }; try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode */ } onChange(next); };

  const set = (x, y) => {
    const g = level.grid.map((r) => [...r]);
    if (!g[y] || g[y][x] === undefined || g[y][x] === paint) return;
    if (y === 0 || x === 0 || y === g.length - 1 || x === g[0].length - 1) return; // the outer wall stays
    if (paint === '@' || paint === 'E' || paint === 'k') for (const row of g) for (let i = 0; i < row.length; i++) if (row[i] === paint) row[i] = '.';
    g[y][x] = paint;
    const spikes = (level.spikes || []).filter((s) => s.x !== x || s.y !== y);
    if (paint === '^') spikes.push({ x, y, phase: x % (level.spike?.period || 3) });
    save({ ...level, grid: g.map((r) => r.join('')), spikes });
  };

  const resize = (dw, dh) => {
    const h = Math.min(14, Math.max(5, level.grid.length + dh)), w = Math.min(18, Math.max(5, level.grid[0].length + dw));
    const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
      if (y === 0 || x === 0 || y === h - 1 || x === w - 1) return '#';
      const t = level.grid[y]?.[x];
      return t && !(y === level.grid.length - 1 || x === level.grid[0].length - 1) ? t : '.';
    }).join(''));
    save({ ...level, grid: g, spikes: (level.spikes || []).filter((s) => s.x < w - 1 && s.y < h - 1) });
  };

  return (
    <div className="editor">
      <div className="palette" role="radiogroup" aria-label="Tile to paint">
        {PAINTS.map(([t, label]) => (
          <button key={t} role="radio" aria-checked={paint === t} className={paint === t ? 'chip on' : 'chip'} onClick={() => setPaint(t)}>{label}</button>
        ))}
      </div>
      {lv ? <Board lv={lv} turn={0} onCell={set} label="Level editor: click or drag to paint the selected tile" /> : <p className="empty">Place one start and one exit.</p>}
      <div className="board-foot">
        <span className={solvable.solvable ? 'ok' : 'bad'}>{solvable.solvable ? `Solvable in ${solvable.moves} moves` : solvable.exhausted ? 'Too complex to check: try fewer crates' : 'Not solvable yet: the solver cannot reach the exit'}</span>
        <span className="sizer">
          <button className="btn small" onClick={() => resize(-1, 0)} aria-label="Narrower">−</button>
          <span className="num">{level.grid[0].length} × {level.grid.length}</span>
          <button className="btn small" onClick={() => resize(1, 0)} aria-label="Wider">+</button>
          <button className="btn small" onClick={() => resize(0, -1)} aria-label="Shorter">−</button>
          <button className="btn small" onClick={() => resize(0, 1)} aria-label="Taller">+</button>
        </span>
        <button className="btn small" onClick={() => setShowJson((s) => !s)}>{showJson ? 'Hide JSON' : 'Edit as JSON'}</button>
        <button className="btn small" onClick={() => save(blank())}>Clear</button>
      </div>
      {showJson && (
        <div className="json">
          <label htmlFor="level-json">Level JSON (grid rows, spike timing and phases)</label>
          <textarea id="level-json" spellCheck="false" defaultValue={JSON.stringify({ name: level.name, grid: level.grid, spike: level.spike, spikes: level.spikes }, null, 1)}
            onBlur={(e) => { try { const v = JSON.parse(e.target.value); parseLevel(v); setJsonErr(null); save({ ...level, ...v }); } catch (err) { setJsonErr(err.message); } }} aria-describedby="json-help" />
          <p id="json-help" className={jsonErr ? 'error' : 'note'}>{jsonErr || 'Tiles: # wall, . floor, @ start, E exit, k key, D door, ^ spike, C crate. Changes apply when you leave the box.'}</p>
        </div>
      )}
    </div>
  );
}
