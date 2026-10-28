// POST /api/research: Tavily search + extract for the genre lens.
import { genreLens } from '../lib/tavily.js';
import { limited } from '../lib/guard.js';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const genre = String(body?.genre || 'grid puzzle').slice(0, 40);
  const problems = (Array.isArray(body?.problems) ? body.problems : []).slice(0, 3).map((p) => String(p).slice(0, 60));
  const why = process.env.TAVILY_API_KEY && limited(request, 'research', Number(process.env.REPORTS_PER_HOUR || 6));
  if (why) return Response.json({ error: why }, { status: 429 });
  try {
    return Response.json(await genreLens({ genre, problems }));
  } catch (e) {
    return Response.json({ error: e.message, sources: [] }, { status: 502 });
  }
}
