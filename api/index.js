// BarOps API on Vercel (serverless). State lives in Supabase Postgres, accessed only
// through two SECURITY DEFINER functions guarded by BAROPS_STORE_SECRET (see supabase/schema.sql).
// Each request loads the state, runs the shared core, and saves with an optimistic
// version check; on a concurrent-write conflict the request is retried.
import { createApp } from '../src/core.js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, BAROPS_STORE_SECRET, BAROPS_SETUP_CODE } = process.env;

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`storage ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 2 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !BAROPS_STORE_SECRET) throw new Error('Storage is not configured');
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readRaw(req);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = new URL(req.url, `${proto}://${req.headers.host}`);
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();

    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = await rpc('barops_load', { p_secret: BAROPS_STORE_SECRET });
      let pending = null;
      const app = createApp({ load: () => state.data, save: (db) => { pending = db; } }, { secureCookies: proto === 'https', setupCode: BAROPS_SETUP_CODE || '' });
      response = await app.handle(new Request(url, { method: req.method, headers: req.headers, body }), { ip });
      if (!pending) break;
      const v = await rpc('barops_save', { p_secret: BAROPS_STORE_SECRET, p_data: pending, p_expected: state.version });
      if (v !== -1) break;
      response = null; // someone else wrote first: retry against fresh state
    }
    if (!response) response = new Response(JSON.stringify({ error: 'Busy, please retry' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    res.statusCode = response.status;
    for (const [k, v] of response.headers) res.setHeader(k, v);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.statusCode = e.message === 'too large' ? 413 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server error' }));
  }
}
