// Local stand-in for Vercel's function router: npm run api
import http from 'node:http';
import { Readable } from 'node:stream';

const names = ['step', 'report', 'research', 'vision', 'models'];
const routes = Object.fromEntries(await Promise.all(names.map(async (n) => [`/api/${n}`, await import(`../api/${n}.js`)])));

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = routes[url.pathname]?.[req.method];
  if (!handler) { res.writeHead(404).end(); return; }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
  const response = await handler(new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
}).listen(8787, () => console.log('API on http://localhost:8787'));
