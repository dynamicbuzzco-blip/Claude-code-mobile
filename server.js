// BarOps — Node.js server: static files + API (logic lives in src/core.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp, invoiceTotals } from './src/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

// File store: synchronous load, debounced atomic save.
function fileStore() {
  let timer = null;
  let pending = null;
  const write = () => {
    timer = null;
    const tmp = DB_FILE + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(pending)); fs.renameSync(tmp, DB_FILE); } catch (e) { console.error('save failed', e.message); }
  };
  return {
    load() {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      return fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : null;
    },
    save(db) { pending = db; if (!timer) timer = setTimeout(write, 50); },
    flush() { if (timer) { clearTimeout(timer); write(); } },
  };
}

function serveStatic(res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (!path.extname(rel)) return serveStatic(res, '/index.html');
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createServer(store = fileStore()) {
  const app = createApp(store, { secureCookies: process.env.SECURE_COOKIES === '1', setupCode: process.env.BAROPS_SETUP_CODE || '' });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readRaw(req);
        const request = new Request(new URL(req.url, `http://${req.headers.host || 'localhost'}`), { method: req.method, headers: req.headers, body });
        const response = await app.handle(request, { ip: req.socket.remoteAddress });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serveStatic(res, url.pathname);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(e.message === 'too large' ? 413 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error' }));
    }
  });
  server.store = store;
  return server;
}

export { invoiceTotals, fileStore };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = fileStore();
  const server = createServer(store);
  const exit = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', exit);
  process.on('SIGTERM', exit);
  server.listen(PORT, () => console.log(`BarOps running at http://localhost:${PORT}  (data: ${DB_FILE})`));
}
