// Deterministic grid-puzzle engine. The only source of truth for what a move does,
// shared by the browser, the API and the solver.
//
// Tiles: # wall, . floor, @ start, E exit, k key, D door (needs the key), ^ spike, C crate.
// A spike at (x,y) is up on turn t when (t + phase) % period < on.

export const ACTIONS = ['up', 'down', 'left', 'right', 'wait'];
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };
export const TILES = ['#', '.', '@', 'E', 'k', 'D', '^', 'C'];

export function parseLevel(level) {
  const rows = level.grid.map((r) => [...r]);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let start = null, exit = null;
  const crates = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = rows[y][x] ?? '#';
    if (!TILES.includes(t)) throw new Error(`Unknown tile "${t}" at ${x},${y}`);
    if (t === '@') start = [x, y];
    if (t === 'E') exit = [x, y];
    if (t === 'C') crates.push([x, y]);
  }
  if (!start || !exit) throw new Error('A level needs one start (@) and one exit (E).');
  const spike = level.spike || { period: 3, on: 1 };
  const phases = {};
  for (const s of level.spikes || []) phases[`${s.x},${s.y}`] = s.phase ?? 0;
  // Static map: crates, key and start live in state, so the map keeps only fixed tiles.
  const map = rows.map((r) => Array.from({ length: w }, (_, x) => (['@', 'C', 'k'].includes(r[x]) ? '.' : r[x] ?? '#')));
  const keyAt = rows.flatMap((r, y) => r.map((t, x) => (t === 'k' ? [x, y] : null))).find(Boolean) || null;
  return { name: level.name, w, h, map, start, exit, keyAt, crates, spike, phases };
}

export function initialState(lv) {
  return { x: lv.start[0], y: lv.start[1], key: false, crates: lv.crates.map((c) => [...c]), turn: 0, dead: false, won: false };
}

export function spikeUp(lv, x, y, turn) {
  if (lv.map[y]?.[x] !== '^') return false;
  const phase = lv.phases[`${x},${y}`] ?? 0;
  return (turn + phase) % lv.spike.period < lv.spike.on;
}

const crateAt = (s, x, y) => s.crates.findIndex(([cx, cy]) => cx === x && cy === y);
const blocked = (lv, s, x, y) => {
  const t = lv.map[y]?.[x];
  return t === undefined || t === '#' || (t === 'D' && !s.key);
};

// One move. Returns the new state (the old one is untouched) and what happened.
export function step(lv, s, action) {
  if (s.dead || s.won) return { state: s, events: [] };
  if (!DIR[action]) action = 'wait';
  const [dx, dy] = DIR[action];
  const n = { ...s, crates: s.crates.map((c) => [...c]), turn: s.turn + 1 };
  const events = [];
  const tx = s.x + dx, ty = s.y + dy;
  if (action !== 'wait') {
    const ci = crateAt(s, tx, ty);
    if (blocked(lv, s, tx, ty)) events.push('bumped');
    else if (ci >= 0) {
      const bx = tx + dx, by = ty + dy;
      const bt = lv.map[by]?.[bx];
      if (blocked(lv, s, bx, by) || crateAt(s, bx, by) >= 0 || bt === 'E' || bt === 'D') events.push('bumped');
      else { n.crates[ci] = [bx, by]; n.x = tx; n.y = ty; events.push('pushed', 'moved'); }
    } else {
      if (lv.map[ty][tx] === 'D') events.push('opened_door');
      n.x = tx; n.y = ty; events.push('moved');
    }
  }
  if (lv.keyAt && !n.key && n.x === lv.keyAt[0] && n.y === lv.keyAt[1]) { n.key = true; events.push('picked_key'); }
  if (spikeUp(lv, n.x, n.y, n.turn)) { n.dead = true; events.push('died'); }
  else if (n.x === lv.exit[0] && n.y === lv.exit[1]) { n.won = true; events.push('won'); }
  return { state: n, events };
}

export function legalMoves(lv, s) {
  return ACTIONS.filter((a) => {
    if (a === 'wait') return true;
    const [dx, dy] = DIR[a];
    const tx = s.x + dx, ty = s.y + dy;
    if (blocked(lv, s, tx, ty)) return false;
    if (crateAt(s, tx, ty) >= 0) {
      const bx = tx + dx, by = ty + dy, bt = lv.map[by]?.[bx];
      return !blocked(lv, s, bx, by) && crateAt(s, bx, by) < 0 && bt !== 'E' && bt !== 'D';
    }
    return true;
  });
}

// What the tile at (x,y) looks like right now, from the player's point of view.
export function tileAt(lv, s, x, y, turn = s.turn) {
  if (x === s.x && y === s.y) return 'P';
  if (crateAt(s, x, y) >= 0) return 'C';
  if (lv.keyAt && !s.key && x === lv.keyAt[0] && y === lv.keyAt[1]) return 'k';
  const t = lv.map[y][x];
  if (t === '^') return spikeUp(lv, x, y, turn) ? '^' : '_';
  if (t === 'D' && s.key) return 'd';
  return t;
}

// Text view the model players see: coordinates, legend, spike timing, legal moves.
export function renderAscii(lv, s) {
  const head = '    ' + Array.from({ length: lv.w }, (_, x) => x % 10).join('');
  const rows = Array.from({ length: lv.h }, (_, y) => String(y).padStart(3) + ' ' + Array.from({ length: lv.w }, (_, x) => tileAt(lv, s, x, y)).join(''));
  const spikes = Object.keys(lv.phases).length || lv.map.some((r) => r.includes('^'));
  const near = [];
  for (let y = s.y - 2; y <= s.y + 2; y++) for (let x = s.x - 2; x <= s.x + 2; x++) {
    if (lv.map[y]?.[x] === '^') near.push(`(${x},${y}) ${spikeUp(lv, x, y, s.turn) ? 'UP now' : 'down now'}, ${spikeUp(lv, x, y, s.turn + 1) ? 'UP' : 'down'} next turn`);
  }
  return [
    head, ...rows, '',
    'Legend: P you, # wall, . floor, E exit, k key, D locked door (walk into it while holding the key to open it), d unlocked door, C crate (walk into it to push it), ^ spike UP (deadly), _ spike down (safe)',
    spikes ? `Spikes cycle: up ${lv.spike.on} of every ${lv.spike.period} turns.` : '',
    near.length ? 'Spikes near you: ' + near.join('; ') : '',
    `Turn ${s.turn}. You are at (${s.x},${s.y}). Key: ${s.key ? 'yes' : 'no'}. Goal: reach E.`,
    `Legal moves now: ${legalMoves(lv, s).join(', ')}`,
  ].filter(Boolean).join('\n');
}

// A stable key for "same situation", used for loop detection and the solver.
export const stateKey = (lv, s) => `${s.x},${s.y},${+s.key},${s.crates.map((c) => c.join(':')).sort().join('|')},${s.turn % lv.spike.period}`;
