// POST /api/step: one ghost looks at the board and commits to its next few moves.
import { decide } from '../lib/player.js';
import { resolveModels } from '../lib/nebius.js';
import { PERSONAS } from '../lib/personas.js';
import { checkLevel, cleanLevel, limited } from '../lib/guard.js';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const persona = PERSONAS[body?.personaId];
  if (!persona) return Response.json({ error: 'Unknown persona.' }, { status: 400 });
  const bad = checkLevel(body.level);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  const s = body.state || {};
  if (![s.x, s.y, s.turn].every(Number.isInteger) || !Array.isArray(s.crates) || s.crates.length > 20) return Response.json({ error: 'Bad state.' }, { status: 400 });
  const why = limited(request, 'step', Number(process.env.STEP_CALLS_PER_HOUR || 400));
  if (why) return Response.json({ error: why }, { status: 429 });
  try {
    const models = await resolveModels();
    const model = models[persona.role];
    if (!model) return Response.json({ error: `No ${persona.role} model is available on Token Factory right now.` }, { status: 503 });
    const state = { x: s.x, y: s.y, turn: s.turn, key: Boolean(s.key), crates: s.crates.map((c) => [c[0] | 0, c[1] | 0]), dead: false, won: false };
    const history = (Array.isArray(body.history) ? body.history : []).slice(-12).map(String);
    return Response.json(await decide({ personaId: body.personaId, level: cleanLevel(body.level), state, history, model }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status === 429 ? 429 : 502 });
  }
}
