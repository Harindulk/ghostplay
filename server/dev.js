// Local stand-in for Vercel's function router: npm run api
import http from 'node:http';
import { Readable } from 'node:stream';
import { mkdirSync, writeFileSync } from 'node:fs';

const names = ['step', 'report', 'research', 'vision', 'models'];
const routes = Object.fromEntries(await Promise.all(names.map(async (n) => [`/api/${n}`, await import(`../api/${n}.js`)])));

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Local only: the lab's "Save as showcase" button writes a finished run into public/showcase/.
  if (url.pathname === '/api/save-showcase' && req.method === 'POST') {
    const data = JSON.parse(await new Response(Readable.toWeb(req)).text());
    if (!/^level-\d$/.test(data.levelId || '')) { res.writeHead(400).end('bad level id'); return; }
    mkdirSync('public/showcase', { recursive: true });
    const file = `public/showcase/${data.levelId}${data.mock ? '.mock' : ''}.json`;
    writeFileSync(file, JSON.stringify(data));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ file }));
    return;
  }
  const handler = routes[url.pathname]?.[req.method];
  if (!handler) { res.writeHead(404).end(); return; }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
  const response = await handler(new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
}).listen(8787, () => console.log('API on http://localhost:8787'));
