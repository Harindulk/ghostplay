// One "look at the screen and commit to a few moves" decision for one ghost.
// Server-side only (it holds the API key).
import { parseLevel, renderAscii, legalMoves, ACTIONS } from './engine.js';
import { PERSONAS } from './personas.js';
import { chat, hasKey } from './nebius.js';

const SCHEMA = (n) => ({
  type: 'object', additionalProperties: false, required: ['moves', 'thought'],
  properties: {
    moves: { type: 'array', minItems: 1, maxItems: n, items: { type: 'string', enum: ACTIONS } },
    thought: { type: 'string', maxLength: 90 },
  },
});

export async function decide({ personaId, level, state, history = [], model }) {
  const p = PERSONAS[personaId];
  const lv = parseLevel(level);
  const legal = legalMoves(lv, state);
  if (!hasKey()) return mockDecide(p, legal, state);
  const messages = [
    { role: 'system', content: `${p.prompt}\nYou are playing a turn-based grid puzzle. Each move takes one turn; "wait" stays put for a turn. Reply with JSON only: {"moves": [up to ${p.plan} moves to make in order], "thought": "what you're thinking, under 90 characters"}.` },
    { role: 'user', content: `${renderAscii(lv, state)}\nYour last moves: ${history.slice(-8).join(', ') || 'none yet'}\nChoose your next 1 to ${p.plan} moves.` },
  ];
  const r = await chat({ model, messages, maxTokens: p.maxTokens, temperature: p.temperature, schema: SCHEMA(p.plan), thinking: p.thinking, budget: p.budget });
  let moves = Array.isArray(r.json?.moves) ? r.json.moves.filter((m) => ACTIONS.includes(m)).slice(0, p.plan) : [];
  const parseFailed = !moves.length;
  if (parseFailed) moves = ['wait'];
  return { moves, thought: String(r.json?.thought || '').slice(0, 90), parseFailed, model: r.model, usage: r.usage, cost: r.cost, latencyMs: r.latencyMs, rate: r.rate };
}

// shortcut: dev-only stand-in when no key is set; the UI labels these runs MOCK and they are never recorded as showcase runs.
function mockDecide(p, legal, state) {
  const rand = mulberry(state.turn * 7919 + state.x * 31 + state.y);
  const moving = legal.filter((m) => m !== 'wait');
  const waitChance = { Casual: 0.02, Core: 0.15, Expert: 0.3 }[p.label];
  const pick = () => (rand() < waitChance || !moving.length ? 'wait' : moving[Math.floor(rand() * moving.length)]);
  return { moves: Array.from({ length: p.plan }, pick), thought: 'mock player (no API key)', parseFailed: false, model: 'mock', usage: {}, cost: 0, latencyMs: 0, rate: {}, mock: true };
}

export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
