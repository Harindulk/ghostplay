// Canvas drawing for the level, the ghosts and the heat overlays. Flat shapes in the
// palette's colours; spikes follow the replay clock so a judge can see the timing.
import { spikeUp } from '../lib/engine.js';
import { PERSONAS } from '../lib/personas.js';

const C = {
  floor: '#1a191e', floorAlt: '#18171c', wall: '#302f36', wallFace: '#24232a',
  exit: '#e8b04a', key: '#e8b04a', door: '#9a6a3c', doorOpen: '#4a3a2c',
  spike: '#e5566f', spikeDown: '#4a3a40', crate: '#8a6a45', crateLine: '#5e4930',
  death: '229,86,111', visit: '242,242,243', bump: '217,164,65', highlight: '#4a8ad6',
};

export function drawBoard(ctx, { lv, cell, turn = 0, keyTaken = false, crates, ghosts = [], heat = null, heatKind = null, highlight = [], showSpikes = true }) {
  const { w, h, map } = lv;
  ctx.clearRect(0, 0, w * cell, h * cell);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = map[y][x], px = x * cell, py = y * cell;
    ctx.fillStyle = (x + y) % 2 ? C.floor : C.floorAlt;
    ctx.fillRect(px, py, cell, cell);
    if (t === '#') {
      // Top-down block: lit top, darker front face where floor shows below it.
      ctx.fillStyle = C.wall; ctx.fillRect(px, py, cell, cell);
      if (map[y + 1] && map[y + 1][x] !== '#') { ctx.fillStyle = C.wallFace; ctx.fillRect(px, py + cell * 0.72, cell, cell * 0.28); }
    } else if (t === 'E') {
      ctx.fillStyle = C.exit; ctx.fillRect(px + cell * 0.2, py + cell * 0.12, cell * 0.6, cell * 0.76);
      ctx.fillStyle = C.floor; ctx.fillRect(px + cell * 0.32, py + cell * 0.3, cell * 0.36, cell * 0.58);
      ctx.fillStyle = C.exit; ctx.fillRect(px + cell * 0.44, py + cell * 0.46, cell * 0.12, cell * 0.12);
    } else if (t === 'D') {
      ctx.fillStyle = keyTaken ? C.doorOpen : C.door;
      ctx.fillRect(px + cell * 0.12, py + cell * 0.08, cell * 0.76, cell * 0.84);
      if (!keyTaken) { ctx.fillStyle = C.key; ctx.fillRect(px + cell * 0.44, py + cell * 0.42, cell * 0.12, cell * 0.18); }
    } else if (t === '^') {
      const up = showSpikes ? spikeUp(lv, x, y, turn) : true;
      ctx.fillStyle = up ? C.spike : C.spikeDown;
      const n = 3, bw = cell / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        const base = py + cell * 0.82, tip = up ? py + cell * 0.22 : py + cell * 0.66;
        ctx.moveTo(px + i * bw + bw * 0.12, base); ctx.lineTo(px + i * bw + bw / 2, tip); ctx.lineTo(px + (i + 1) * bw - bw * 0.12, base);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  if (lv.keyAt && !keyTaken) {
    const [x, y] = lv.keyAt, px = x * cell, py = y * cell;
    ctx.strokeStyle = C.key; ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.beginPath(); ctx.arc(px + cell * 0.36, py + cell * 0.5, cell * 0.14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.key; ctx.fillRect(px + cell * 0.48, py + cell * 0.46, cell * 0.32, cell * 0.08); ctx.fillRect(px + cell * 0.7, py + cell * 0.5, cell * 0.08, cell * 0.14);
  }
  for (const [x, y] of crates || lv.crates) {
    const px = x * cell, py = y * cell, m = cell * 0.14;
    ctx.fillStyle = C.crate; ctx.fillRect(px + m, py + m, cell - 2 * m, cell - 2 * m);
    ctx.strokeStyle = C.crateLine; ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.beginPath(); ctx.moveTo(px + m, py + m); ctx.lineTo(px + cell - m, py + cell - m); ctx.moveTo(px + cell - m, py + m); ctx.lineTo(px + m, py + cell - m); ctx.stroke();
  }
  if (heat && heatKind) {
    const grid = heat[heatKind];
    const max = Math.max(1, ...grid.flat());
    const rgb = { deaths: C.death, visits: C.visit, bumps: C.bump }[heatKind];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = grid[y][x];
      if (!n) continue;
      ctx.fillStyle = `rgba(${rgb},${(0.18 + 0.62 * (n / max)).toFixed(3)})`;
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      if (heatKind !== 'visits' && cell >= 28) {
        ctx.fillStyle = '#ffffff'; ctx.font = `600 ${Math.round(cell * 0.32)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), x * cell + cell / 2, y * cell + cell / 2);
      }
    }
  }
  for (const g of ghosts) {
    const col = PERSONAS[g.personaId].color;
    if (g.trail?.length > 1) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.22; ctx.lineWidth = Math.max(2, cell * 0.08); ctx.lineJoin = 'round';
      ctx.beginPath();
      g.trail.forEach(([x, y], i) => { const cx = x * cell + cell / 2 + g.off[0], cy = y * cell + cell / 2 + g.off[1]; i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); });
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  for (const g of ghosts) {
    const col = PERSONAS[g.personaId].color;
    const [x, y] = g.at, cx = x * cell + cell / 2 + g.off[0], cy = y * cell + cell / 2 + g.off[1], r = cell * 0.2;
    if (g.outcome === 'died') {
      ctx.strokeStyle = C.spike; ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
      continue;
    }
    ctx.globalAlpha = g.outcome === 'won' ? 0.35 : 0.92;
    ctx.fillStyle = col;
    // A ghost: round head, wavy hem.
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r * 0.85);
    for (let i = 0; i < 3; i++) ctx.lineTo(cx + r - (i * 2 + 1) * (r / 3), cy + r * (i % 2 ? 0.85 : 0.55)), ctx.lineTo(cx + r - (i * 2 + 2) * (r / 3), cy + r * 0.85);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#131217';
    ctx.fillRect(cx - r * 0.42, cy - r * 0.3, r * 0.22, r * 0.3); ctx.fillRect(cx + r * 0.2, cy - r * 0.3, r * 0.22, r * 0.3);
    ctx.globalAlpha = 1;
  }
  for (const [x, y] of highlight) {
    ctx.strokeStyle = C.highlight; ctx.lineWidth = 2;
    ctx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
  }
}

// Offsets so ghosts sharing a tile don't hide each other.
const OFF = [[0, 0], [-0.22, -0.18], [0.22, -0.18], [-0.22, 0.2], [0.22, 0.2], [0, -0.26], [0, 0.26], [-0.28, 0], [0.28, 0]];
export const ghostOffset = (i, cell) => OFF[i % OFF.length].map((v) => v * cell);
