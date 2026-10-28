// Breadth-first search over every reachable situation. Proves a level (or a patched level)
// can be finished, and how many moves the shortest route takes.
import { ACTIONS, parseLevel, initialState, step, stateKey, TILES } from './engine.js';

export function solve(level, maxStates = 200000) {
  const lv = parseLevel(level);
  return solveFrom(lv, initialState(lv), maxStates);
}

// Shortest route from any situation (used by the offline mock players).
export function solveFrom(lv, start, maxStates = 200000) {
  // Most levels can be finished without moving a crate; that search is tiny, so try it first.
  const easy = search(lv, start, maxStates, true);
  return easy.solvable ? easy : search(lv, start, maxStates, false);
}

function search(lv, start, maxStates, noPush) {
  const seen = new Set([stateKey(lv, start)]);
  let frontier = [{ s: start, path: [] }];
  while (frontier.length && seen.size < maxStates) {
    const next = [];
    for (const { s, path } of frontier) for (const a of ACTIONS) {
      const { state, events } = step(lv, s, a);
      if (state.dead || (noPush && events.includes('pushed'))) continue;
      if (state.won) return { solvable: true, moves: path.length + 1, path: [...path, a] };
      const k = stateKey(lv, state);
      if (seen.has(k)) continue;
      seen.add(k);
      next.push({ s: state, path: [...path, a] });
    }
    frontier = next;
  }
  // Ran out of search budget: say so instead of claiming the level can't be finished.
  return { solvable: false, moves: null, path: null, exhausted: frontier.length > 0 };
}

const MAX_EDITS = 6;

// Apply a designer patch [{op:'set', x, y, tile}] and refuse anything that breaks the level.
export function applyPatch(level, patch) {
  if (!Array.isArray(patch) || !patch.length) return { error: 'The patch is empty.' };
  if (patch.length > MAX_EDITS) return { error: `The patch changes ${patch.length} tiles; the limit is ${MAX_EDITS}.` };
  const grid = level.grid.map((r) => [...r]);
  let spikes = [...(level.spikes || [])];
  for (const p of patch) {
    const { x, y, tile } = p || {};
    if (p?.op !== 'set' || !Number.isInteger(x) || !Number.isInteger(y)) return { error: `Bad edit ${JSON.stringify(p)}.` };
    if (!grid[y] || grid[y][x] === undefined) return { error: `(${x},${y}) is outside the level.` };
    if (!TILES.includes(tile) || tile === '@' || tile === 'E') return { error: `Tile "${tile}" can't be placed.` };
    if (['@', 'E'].includes(grid[y][x])) return { error: `(${x},${y}) is the start or exit and can't change.` };
    if (y === 0 || x === 0 || y === grid.length - 1 || x === grid[y].length - 1) return { error: `(${x},${y}) is on the outer wall.` };
    grid[y][x] = tile;
    spikes = spikes.filter((s) => s.x !== x || s.y !== y);
    if (tile === '^') spikes.push({ x, y, phase: p.phase ?? 0 });
  }
  const patched = { ...level, grid: grid.map((r) => r.join('')), spikes };
  const keys = patched.grid.join('').split('k').length - 1;
  if (keys > 1) return { error: 'A level can have only one key.' };
  const result = solve(patched);
  if (!result.solvable) return { error: result.exhausted ? 'The level is too complex for the solver to check this patch.' : 'After this patch the level can no longer be finished.' };
  return { level: patched, solution: result };
}
