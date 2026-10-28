// POST /api/report: Nemotron Ultra turns the swarm's evidence into a design report and a
// solver-checked level patch.
import { critique } from '../lib/critic.js';
import { resolveModels, hasKey } from '../lib/nebius.js';
import { checkLevel, cleanLevel, limited } from '../lib/guard.js';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const bad = checkLevel(body?.level);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  if (!body.evidence || JSON.stringify(body.evidence).length > 20000) return Response.json({ error: 'Missing or oversized playtest evidence.' }, { status: 400 });
  const why = hasKey() && limited(request, 'report', Number(process.env.REPORTS_PER_HOUR || 6));
  if (why) return Response.json({ error: why }, { status: 429 });
  try {
    const models = await resolveModels();
    if (!models.critic) return Response.json({ error: 'No critic model is available on Token Factory right now.' }, { status: 503 });
    const clarity = (Array.isArray(body.clarity) ? body.clarity : []).slice(0, 6).map((c) => ({ issue: String(c?.issue ?? '').slice(0, 160), where: String(c?.where ?? '').slice(0, 80) }));
    const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 5).map((s) => ({ url: String(s.url).slice(0, 300), title: String(s.title || '').slice(0, 200), snippet: String(s.snippet || '').slice(0, 1200) }));
    return Response.json(await critique({ level: cleanLevel(body.level), ev: body.evidence, clarity, sources, model: models.critic }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
