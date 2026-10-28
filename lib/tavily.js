// Tavily "genre lens": what players and designers say about difficulty spikes in this kind
// of game, so the critic's report cites real sources instead of guessing.
const cache = new Map();

async function tavily(path, body) {
  const r = await fetch(`https://api.tavily.com/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Tavily ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export async function genreLens({ genre, problems }) {
  if (!process.env.TAVILY_API_KEY) return { sources: [], query: null, skipped: 'No Tavily key set.' };
  const query = `${genre} game level design ${problems.slice(0, 2).join(' and ')} player frustration fix`;
  if (cache.has(query)) return cache.get(query);
  const found = await tavily('search', { query, search_depth: 'basic', max_results: 5 });
  const top = (found.results || []).slice(0, 5);
  const extracted = await tavily('extract', { urls: top.slice(0, 2).map((r) => r.url) }).catch(() => ({ results: [] }));
  const full = Object.fromEntries((extracted.results || []).map((r) => [r.url, r.raw_content]));
  const sources = top.map((r) => ({ title: r.title, url: r.url, snippet: (full[r.url] || r.content || '').replace(/\s+/g, ' ').slice(0, 1200) }));
  const out = { query, sources };
  cache.set(query, out);
  return out;
}
