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

// Which optional feature a 400/422 blames, or null. Validation errors can echo the whole
// request after an `input` key, and that echo names every feature we sent, so it is cut off.
// shortcut: drops any later errors in a multi-error list too, fine while one error is the norm.
export function blamed(why, body) {
  const own = why.split(/\binput\\?['"]\s*:/)[0];
  const names = (re) => re.test(own);
  if (body.chat_template_kwargs && names(/chat_template_kwargs|enable_thinking|reasoning/i)) return 'noThinking';
  if (body.response_format?.type === 'json_schema' && names(/response_format|json[_ ]?schema|structured|guided/i)) return 'noSchema';
  if (body.response_format && names(/response_format|json_object|structured|guided/i)) return 'noJsonObject';
  return null;
}

// One chat call. Optional features (JSON schema, thinking budget) are dropped and retried
// if the endpoint rejects them. A rejection is remembered in `compat` only once the call
// succeeds without that feature, so an unrelated 400 never turns a feature off for good.
export async function chat(opts, dropped = {}) {
  const { model, messages, maxTokens = 300, temperature = 0.6, schema, thinking, budget, timeoutMs = 25000 } = opts;
  const seen = { ...(compat[model] ||= {}), ...dropped };
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
    const feature = blamed(why, body);
    if (!feature) throw Object.assign(new Error(`Token Factory ${r.status}: ${why.slice(0, 300)}`), { status: r.status });
    return chat(opts, { ...dropped, [feature]: why.slice(0, 200) });
  }
  if (!r.ok) throw Object.assign(new Error(`Token Factory ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: r.status });
  Object.assign(compat[model], dropped);
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
