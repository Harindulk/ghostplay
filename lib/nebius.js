// Nebius Token Factory client (OpenAI-compatible chat completions over plain fetch).
// Records what each call cost and which optional parameters the endpoint accepted, so the
// UI can show which model did what and the feedback section has real numbers.
import { ROLES } from './personas.js';
import { cost } from './pricing.js';

const BASE = (process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, '');
export const hasKey = () => Boolean(process.env.NEBIUS_API_KEY);

// Which optional request fields failed per model, learned at runtime.
export const compat = {};

let models = null, modelsAt = 0;
export async function listModels() {
  if (models && Date.now() - modelsAt < 10 * 60e3) return models;
  const r = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` } });
  if (!r.ok) throw new Error(`Token Factory /models returned ${r.status}`);
  models = (await r.json()).data.map((m) => m.id);
  modelsAt = Date.now();
  return models;
}

// Pick the first preferred model per role that Token Factory serves right now, so a
// retired model ID never breaks the app (two Nemotron IDs retire on 9 Nov 2026).
export async function resolveModels() {
  const env = (role) => process.env[`MODEL_${role.toUpperCase()}`];
  if (!hasKey()) return Object.fromEntries(Object.entries(ROLES).map(([role, ids]) => [role, env(role) || ids[0]]));
  const live = await listModels();
  const norm = (s) => s.toLowerCase();
  const out = {};
  for (const [role, ids] of Object.entries(ROLES)) {
    const wanted = env(role) ? [env(role), ...ids] : ids;
    out[role] = wanted.map((w) => live.find((m) => norm(m) === norm(w))).find(Boolean) || null;
  }
  return out;
}

export function parseJson(text) {
  if (!text) return null;
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

const RATE_HEADERS = ['x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-limit-requests', 'x-ratelimit-dynamic-scale-requests'];

// One chat call. Optional features (JSON schema, thinking budget) are dropped and retried
// once if the endpoint rejects them, and the rejection is remembered in `compat`.
export async function chat({ model, messages, maxTokens = 300, temperature = 0.6, schema, thinking, budget, timeoutMs = 25000 }) {
  const seen = (compat[model] ||= {});
  const body = { model, messages, max_tokens: maxTokens, temperature };
  if (schema && !seen.noSchema) body.response_format = { type: 'json_schema', json_schema: { name: 'out', schema, strict: true } };
  else if (schema && !seen.noJsonObject) body.response_format = { type: 'json_object' };
  if (thinking !== undefined && !seen.noThinking) {
    body.chat_template_kwargs = { enable_thinking: thinking, ...(thinking && budget ? { reasoning_budget: budget } : {}) };
  }
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } finally { clearTimeout(timer); }
  if (r.status === 400 || r.status === 422) {
    const why = await r.text();
    if (body.response_format?.type === 'json_schema') seen.noSchema = why.slice(0, 200);
    else if (body.response_format) seen.noJsonObject = why.slice(0, 200);
    else if (body.chat_template_kwargs) seen.noThinking = why.slice(0, 200);
    else throw new Error(`Token Factory 400: ${why.slice(0, 300)}`);
    return chat({ model, messages, maxTokens, temperature, schema, thinking, budget, timeoutMs });
  }
  if (!r.ok) throw Object.assign(new Error(`Token Factory ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: r.status });
  const data = await r.json();
  const msg = data.choices?.[0]?.message || {};
  const usage = data.usage || {};
  return {
    model, text: msg.content || '', reasoning: msg.reasoning_content || null,
    json: schema ? parseJson(msg.content) : null,
    usage, cost: cost(model, usage), latencyMs: Date.now() - t0,
    rate: Object.fromEntries(RATE_HEADERS.map((h) => [h.replace('x-ratelimit-', ''), r.headers.get(h)]).filter(([, v]) => v !== null)),
  };
}
