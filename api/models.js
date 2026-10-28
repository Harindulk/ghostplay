// GET /api/models: which Nemotron model plays each role right now, and what the endpoint
// accepted, so the UI never claims a model it isn't using.
import { resolveModels, hasKey, compat } from '../lib/nebius.js';

export async function GET() {
  try {
    return Response.json({ live: hasKey() && process.env.LIVE_MODE_ENABLED !== 'false', mock: !hasKey(), tavily: Boolean(process.env.TAVILY_API_KEY), models: await resolveModels(), compat });
  } catch (e) {
    return Response.json({ live: false, error: e.message }, { status: 502 });
  }
}
