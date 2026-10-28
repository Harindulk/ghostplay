// Token Factory smoke test: npm run smoke
// Lists the Nemotron models, then checks JSON-schema output and the thinking switch per
// role. Results go to stdout and notes/smoke-results.md (gitignored) for the feedback.
import { writeFileSync, mkdirSync } from 'node:fs';
import { listModels, resolveModels, chat, compat } from '../lib/nebius.js';

if (!process.env.NEBIUS_API_KEY) { console.error('Set NEBIUS_API_KEY in .env first.'); process.exit(1); }
const lines = [`# Smoke test ${new Date().toISOString()}`, ''];
const log = (s) => { console.log(s); lines.push(s); };

const t0 = Date.now();
const all = await listModels();
log(`GET /models: ${all.length} models in ${Date.now() - t0} ms. Nemotron/NVIDIA:`);
for (const m of all.filter((m) => /nemotron|nvidia/i.test(m))) log(`- ${m}`);
const roles = await resolveModels();
log('', 'Resolved roles:');
for (const [role, m] of Object.entries(roles)) log(`- ${role}: ${m || 'NONE AVAILABLE'}`);

const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };
log('', '| role | model | json ok | thinking | reasoning returned | ms | in/out tokens | rate headers |', '|---|---|---|---|---|---|---|---|');
for (const [role, model] of Object.entries(roles)) {
  if (!model) continue;
  const thinking = role === 'expert' || role === 'critic';
  try {
    const r = await chat({ model, messages: [{ role: 'user', content: 'Reply with JSON {"ok": true} and nothing else.' }], maxTokens: thinking ? 400 : 40, temperature: 0, schema, thinking, budget: 128 });
    log(`| ${role} | ${model} | ${r.json?.ok === true} | ${thinking} | ${Boolean(r.reasoning) || /<think>/.test(r.text)} | ${r.latencyMs} | ${r.usage.prompt_tokens}/${r.usage.completion_tokens} | ${JSON.stringify(r.rate)} |`);
  } catch (e) { log(`| ${role} | ${model} | ERROR ${e.message.slice(0, 120)} |`); }
}
log('', 'Rejected optional fields per model:', '```', JSON.stringify(compat, null, 2), '```');
mkdirSync('notes', { recursive: true });
writeFileSync('notes/smoke-results.md', lines.join('\n') + '\n');
