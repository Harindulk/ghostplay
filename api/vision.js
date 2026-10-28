// POST /api/vision: Nemotron Super VL looks at a picture of the level for two seconds,
// like a first-time player, and says what is unclear.
import { chat, hasKey, resolveModels } from '../lib/nebius.js';
import { limited } from '../lib/guard.js';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['goal', 'issues'],
  properties: {
    goal: { type: 'string', maxLength: 160 },
    issues: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['issue', 'where'], properties: { issue: { type: 'string', maxLength: 160 }, where: { type: 'string', maxLength: 80 } } } },
  },
};

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const image = String(body?.image || '');
  if (!/^data:image\/(png|jpeg);base64,/.test(image) || image.length > 1_500_000) return Response.json({ error: 'Send a PNG or JPEG data URL under about 1 MB.' }, { status: 400 });
  if (!hasKey()) return Response.json({ goal: 'Mock (no API key)', issues: [], calls: [{ model: 'mock', usage: {}, cost: 0, latencyMs: 0, mock: true }] });
  const why = limited(request, 'vision', Number(process.env.REPORTS_PER_HOUR || 6));
  if (why) return Response.json({ error: why }, { status: 429 });
  try {
    const { vision } = await resolveModels();
    if (!vision) return Response.json({ error: 'No vision model is available on Token Factory right now.' }, { status: 503 });
    const r = await chat({
      model: vision, maxTokens: 500, temperature: 0.2, schema: SCHEMA,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'This is a level from a top-down puzzle game. You are a first-time player who looks at it for two seconds. What do you think the goal is, and what is unclear or easy to miss (symbols you cannot read, things that look alike, hidden routes)? Reply with JSON: {"goal": "...", "issues": [{"issue": "...", "where": "..."}]}' },
        { type: 'image_url', image_url: { url: image } },
      ] }],
    });
    if (!r.json) return Response.json({ error: 'The vision model did not return readable JSON.' }, { status: 502 });
    return Response.json({ ...r.json, calls: [{ model: r.model, usage: r.usage, cost: r.cost, latencyMs: r.latencyMs, rate: r.rate }] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
